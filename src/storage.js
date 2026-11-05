import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';

/*
 * Everything lives in the app's PRIVATE storage (Directory.Data):
 *   vault/meta.json        – titles, albums, likes, watch progress
 *   vault/media/<id>.ext   – your photos & videos
 *   vault/thumbs/<id>.jpg  – small previews
 * Other apps (and the phone's Gallery) cannot see this folder. Nothing touches the network.
 */
const D = Directory.Data;
const ROOT = 'vault';
const CHUNK = 3 * 1024 * 1024; // multiple of 3 so base64 chunks concatenate cleanly

let meta = { items: [] };
const urlCache = new Map();

export const all = () => meta.items;
export const get = (id) => meta.items.find((i) => i.id === id);

export async function init() {
  for (const sub of ['media', 'thumbs']) {
    try { await Filesystem.mkdir({ path: `${ROOT}/${sub}`, directory: D, recursive: true }); } catch { /* exists */ }
  }
  try {
    const r = await Filesystem.readFile({ path: `${ROOT}/meta.json`, directory: D, encoding: Encoding.UTF8 });
    meta = JSON.parse(r.data);
  } catch { meta = { items: [] }; }
}

async function save() {
  await Filesystem.writeFile({
    path: `${ROOT}/meta.json`, directory: D, encoding: Encoding.UTF8,
    data: JSON.stringify(meta), recursive: true
  });
}

const blobToB64 = (blob) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(',')[1] || '');
  r.onerror = rej;
  r.readAsDataURL(blob);
});

async function writeChunked(file, path, onProgress) {
  if (file.size === 0) throw new Error('Empty file');
  for (let off = 0; off < file.size; off += CHUNK) {
    const data = await blobToB64(file.slice(off, off + CHUNK));
    if (off === 0) await Filesystem.writeFile({ path, directory: D, data, recursive: true });
    else await Filesystem.appendFile({ path, directory: D, data });
    onProgress?.(Math.min(1, (off + CHUNK) / file.size));
  }
}

function drawThumb(source, w, h) {
  const max = 480;
  const k = Math.min(1, max / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * k));
  c.height = Math.max(1, Math.round(h * k));
  c.getContext('2d').drawImage(source, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob((b) => res(b), 'image/jpeg', 0.8));
}

function makeThumb(file, isVideo) {
  const url = URL.createObjectURL(file);
  const done = (v) => { URL.revokeObjectURL(url); return v; };
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(done({ blob: null, duration: 0 })), 10000);
    const finish = (v) => { clearTimeout(timer); resolve(done(v)); };
    if (!isVideo) {
      const img = new Image();
      img.onload = async () => finish({ blob: await drawThumb(img, img.naturalWidth, img.naturalHeight), duration: 0 });
      img.onerror = () => finish({ blob: null, duration: 0 });
      img.src = url;
      return;
    }
    const v = document.createElement('video');
    v.muted = true; v.preload = 'metadata'; v.playsInline = true;
    v.onloadedmetadata = () => { v.currentTime = Math.min(1, (v.duration || 2) / 2); };
    v.onseeked = async () => finish({ blob: await drawThumb(v, v.videoWidth, v.videoHeight), duration: v.duration || 0 });
    v.onerror = () => finish({ blob: null, duration: 0 });
    v.src = url;
  });
}

export async function add(file, { title, album, onProgress } = {}) {
  const id = crypto.randomUUID();
  const isVideo = file.type.startsWith('video/');
  const isGif = !isVideo && (file.type === 'image/gif' || /\.gif$/i.test(file.name));
  const ext = ((file.name.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5)) || (isVideo ? 'mp4' : isGif ? 'gif' : 'jpg');
  const path = `${ROOT}/media/${id}.${ext}`;

  // GIFs keep no static thumbnail: the grid plays the real animated file.
  const info = isGif ? { blob: null, duration: 0 } : await makeThumb(file, isVideo);
  await writeChunked(file, path, onProgress);

  let thumb = null;
  if (info.blob) {
    thumb = `${ROOT}/thumbs/${id}.jpg`;
    await Filesystem.writeFile({ path: thumb, directory: D, data: await blobToB64(info.blob), recursive: true });
  }

  const item = {
    id, type: isVideo ? 'video' : 'photo',
    title: title || file.name.replace(/\.[^.]+$/, '') || 'Untitled',
    description: '', album: album || 'General',
    gif: isGif, path, thumb, size: file.size,
    mime: isGif ? 'image/gif' : file.type || (isVideo ? 'video/mp4' : 'image/jpeg'),
    duration: info.duration, addedAt: Date.now(), liked: false, progress: 0
  };
  meta.items.unshift(item);
  await save();
  return item;
}

export async function update(id, patch) {
  const it = get(id);
  if (!it) return;
  Object.assign(it, patch);
  await save();
}

export async function toggleLike(id) {
  const it = get(id);
  it.liked = !it.liked;
  await save();
  return it.liked;
}

let progressTimer;
export function setProgress(id, time, duration) {
  const it = get(id);
  if (!it || !duration) return;
  it.progress = time / duration > 0.95 ? 0 : time;
  clearTimeout(progressTimer);
  progressTimer = setTimeout(save, 800);
}

export async function remove(id) {
  const it = get(id);
  if (!it) return;
  for (const p of [it.path, it.thumb]) {
    if (p) { try { await Filesystem.deleteFile({ path: p, directory: D }); } catch { /* already gone */ } }
  }
  revoke(id);
  meta.items = meta.items.filter((i) => i.id !== id);
  await save();
}

async function urlFor(path, mime) {
  if (urlCache.has(path)) return urlCache.get(path);
  let url;
  if (Capacitor.isNativePlatform()) {
    const { uri } = await Filesystem.getUri({ path, directory: D });
    url = Capacitor.convertFileSrc(uri);
  } else {
    // Browser dev fallback only
    const r = await Filesystem.readFile({ path, directory: D });
    const bin = atob(r.data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  }
  urlCache.set(path, url);
  return url;
}

export const mediaUrl = (it) => urlFor(it.path, it.mime);
export const thumbUrl = (it) => {
  if (it.gif) return mediaUrl(it); // animated preview
  return it.thumb ? urlFor(it.thumb, 'image/jpeg') : Promise.resolve(null);
};

function revoke(id) {
  const it = get(id);
  if (!it) return;
  for (const p of [it.path, it.thumb]) {
    const u = urlCache.get(p);
    if (u?.startsWith('blob:')) URL.revokeObjectURL(u);
    urlCache.delete(p);
  }
}

export function clearUrlCache() {
  for (const u of urlCache.values()) if (u.startsWith('blob:')) URL.revokeObjectURL(u);
  urlCache.clear();
}

export function stats() {
  const items = meta.items;
  return {
    videos: items.filter((i) => i.type === 'video').length,
    photos: items.filter((i) => i.type === 'photo').length,
    bytes: items.reduce((s, i) => s + i.size, 0)
  };
}

export const albums = () => ['All', ...new Set(meta.items.filter((i) => i.type === 'photo').map((i) => i.album))];

/* Videos use the `album` field as their playlist name. */
export function playlists() {
  const m = new Map();
  for (const i of meta.items) {
    if (i.type !== 'video') continue;
    const n = i.album || 'General';
    if (!m.has(n)) m.set(n, { name: n, count: 0, bytes: 0, items: [], last: 0 });
    const p = m.get(n);
    p.count++; p.bytes += i.size; p.items.push(i); p.last = Math.max(p.last, i.addedAt);
  }
  return [...m.values()].sort((a, b) => b.last - a.last);
}

export async function renameAlbum(type, from, to) {
  meta.items.forEach((i) => { if (i.type === type && i.album === from) i.album = to; });
  await save();
}

/* Replace a video's thumbnail with a new JPEG blob (new filename each time so nothing is cached). */
export async function setThumb(id, blob) {
  const it = get(id);
  if (!it) return;
  const path = `${ROOT}/thumbs/${id}-${Date.now()}.jpg`;
  await Filesystem.writeFile({ path, directory: D, data: await blobToB64(blob), recursive: true });
  const old = it.thumb;
  it.thumb = path;
  await save();
  if (old) {
    const u = urlCache.get(old);
    if (u?.startsWith('blob:')) URL.revokeObjectURL(u);
    urlCache.delete(old);
    try { await Filesystem.deleteFile({ path: old, directory: D }); } catch { /* already gone */ }
  }
}
