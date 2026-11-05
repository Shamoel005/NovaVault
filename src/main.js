import { App as CapApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { PrivacyScreen } from '@capacitor-community/privacy-screen';
import * as Vault from './storage.js';
import * as Auth from './auth.js';

/* ───────── helpers ───────── */
const $ = (s, r = document) => r.querySelector(s);
const root = $('#app');
const esc = (t) => { const d = document.createElement('div'); d.textContent = t ?? ''; return d.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;'); };
const fmtSize = (b) => (b >= 1e9 ? (b / 1e9).toFixed(2) + ' GB' : (b / 1e6).toFixed(1) + ' MB');
const fmtDur = (s) => { if (!s) return ''; const m = Math.floor(s / 60); return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`; };

const P = {
  heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z',
  plus: 'M12 5v14M5 12h14',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  play: 'M6 4l14 8-14 8z',
  trash: 'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  x: 'M18 6L6 18M6 6l12 12',
  video: 'M3 6h12v12H3zM15 10l6-3v10l-6-3',
  image: 'M3 4h18v16H3zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 16l-5-5-9 9',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12h2M3 12h2M12 3v2M12 19v2M5.6 5.6L7 7M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  finger: 'M12 11v4M8 21c0-3 .5-5 .5-8a3.5 3.5 0 0 1 7 0c0 3 .5 5 .5 8M5 12a7 7 0 0 1 14 0M4 17c.5-1 1-2.5 1-5',
  back: 'M15 18l-6-6 6-6',
  next: 'M9 18l6-6-6-6',
  bksp: 'M21 5H9l-6 7 6 7h12zM17 9l-6 6M11 9l6 6',
  camera: 'M4 7h3l2-2h6l2 2h3v12H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  list: 'M3 6h12M3 12h12M3 18h7M17 14l5 3-5 3z'
};
const ic = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24"><path d="${P[n]}"/></svg>`;

function toast(msg, type = 'info') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  $('#toasts').appendChild(t);
  requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('show')));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2400);
}

function sheet(html, { onClose } = {}) {
  const s = document.createElement('div');
  s.className = 'scrim';
  s.innerHTML = `<div class="sheet">${html}</div>`;
  const close = () => { s.remove(); onClose?.(); };
  s.addEventListener('click', (e) => { if (e.target === s) close(); });
  s._close = close;
  document.body.appendChild(s);
  return s;
}

function confirmSheet(title, text, okLabel = 'Delete') {
  return new Promise((resolve) => {
    const s = sheet(`<h2>${esc(title)}</h2><p style="color:var(--muted);font-size:14px;margin-bottom:14px">${esc(text)}</p>
      <button class="btn danger" data-ok>${esc(okLabel)}</button><button class="btn alt" data-no>Cancel</button>`);
    s.addEventListener('click', (e) => {
      if (e.target.closest('[data-ok]')) { s.remove(); resolve(true); }
      else if (e.target.closest('[data-no]')) { s.remove(); resolve(false); }
    });
    s._close = () => { s.remove(); resolve(false); };
  });
}

/* ───────── app state ───────── */
const S = { unlocked: false, tab: 'videos', sort: 'new', q: '', liked: false, album: 'All', autoplay: false, picking: false, playlist: null, gifOnly: false };
let renderToken = 0;
let viewer = null; // { el, type, cleanup }

/* ───────── lock screen ───────── */
const PIN_LEN = 6;

async function showLock() {
  S.unlocked = false;
  root.innerHTML = '';
  const has = await Auth.hasPin();
  let mode = has ? 'unlock' : 'setup';
  let first = '', entry = '', busy = false, bioTried = false;
  const bio = has && (await Auth.biometricEnabled());

  const titles = { setup: 'Create your PIN', confirm: 'Confirm your PIN', unlock: 'Enter your PIN' };

  function draw(msg = '', isErr = false) {
    root.innerHTML = `
      <div class="lock">
        <div class="logo">Nova<span>Vault</span></div>
        <div class="sub ${isErr ? 'err' : ''}" id="sub">${esc(msg || titles[mode])}</div>
        <div class="dots" id="dots">${Array.from({ length: PIN_LEN }, (_, i) => `<i class="${i < entry.length ? 'on' : ''}"></i>`).join('')}</div>
        <div class="pad">
          ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-k="${n}">${n}</button>`).join('')}
          <button class="ghost" data-bio ${bio && mode === 'unlock' ? '' : 'style="visibility:hidden"'}>${ic('finger')}</button>
          <button data-k="0">0</button>
          <button class="ghost" data-del>${ic('bksp')}</button>
        </div>
      </div>`;
  }

  async function submit() {
    busy = true;
    if (mode === 'setup') {
      first = entry; entry = ''; mode = 'confirm'; draw(); busy = false;
    } else if (mode === 'confirm') {
      if (entry !== first) {
        entry = ''; first = ''; mode = 'setup';
        draw('PINs did not match. Start again.', true); shake(); busy = false; return;
      }
      await Auth.setPin(entry);
      if (await Auth.biometricAvailable()) {
        if (await Auth.biometricPrompt('Enable biometric unlock')) await Auth.setBiometric(true);
      }
      return enter();
    } else {
      const r = await Auth.verifyPin(entry);
      if (r.ok) return enter();
      entry = '';
      if (r.lockedFor) { draw(`Too many attempts. Try again in ${Math.ceil(r.lockedFor / 1000)}s`, true); countdown(); }
      else draw(`Wrong PIN. ${r.triesLeft} ${r.triesLeft === 1 ? 'try' : 'tries'} left`, true);
      shake(); busy = false;
    }
  }

  function shake() { const d = $('#dots'); d?.classList.add('shake'); navigator.vibrate?.(60); }

  async function countdown() {
    const left = await Auth.lockRemaining();
    if (left <= 0) { entry = ''; draw(); return; }
    const sub = $('#sub'); if (sub) { sub.textContent = `Too many attempts. Try again in ${Math.ceil(left / 1000)}s`; sub.classList.add('err'); }
    setTimeout(countdown, 1000);
  }

  async function tryBio() {
    if (!bio || bioTried) return;
    bioTried = true;
    if (await Auth.biometricPrompt()) enter();
  }

  root.onclick = async (e) => {
    if (S.unlocked || busy) return;
    const k = e.target.closest('[data-k]');
    if (k) {
      if (entry.length >= PIN_LEN) return;
      entry += k.dataset.k;
      $('#dots').innerHTML = Array.from({ length: PIN_LEN }, (_, i) => `<i class="${i < entry.length ? 'on' : ''}"></i>`).join('');
      if (entry.length === PIN_LEN) setTimeout(submit, 120);
    } else if (e.target.closest('[data-del]')) {
      entry = entry.slice(0, -1);
      $('#dots').innerHTML = Array.from({ length: PIN_LEN }, (_, i) => `<i class="${i < entry.length ? 'on' : ''}"></i>`).join('');
    } else if (e.target.closest('[data-bio]')) {
      bioTried = false; tryBio();
    }
  };

  draw();
  if ((await Auth.lockRemaining()) > 0) countdown();
  else tryBio();
}

async function enter() {
  root.onclick = null;
  await Vault.init();
  S.unlocked = true;
  buildShell();
  render();
}

function lockNow() {
  if (!S.unlocked) return;
  closeViewer();
  document.querySelectorAll('.scrim').forEach((s) => s.remove());
  Vault.clearUrlCache();
  S.q = ''; S.liked = false; S.album = 'All'; S.playlist = null; S.gifOnly = false;
  showLock();
}

/* ───────── shell ───────── */
function buildShell() {
  root.innerHTML = `
    <header class="topbar">
      <div class="logo">Nova<span>Vault</span></div>
      <label class="search">${ic('search')}<input id="q" type="text" placeholder="Search…" autocomplete="off"></label>
      <button class="icon-btn" data-act="lock" aria-label="Lock">${ic('lock')}</button>
    </header>
    <main id="content"></main>
    <button class="fab" id="fab" data-act="add" aria-label="Add">${ic('plus')}</button>
    <nav class="nav">
      <button data-tab="videos">${ic('video')}Videos</button>
      <button data-tab="photos">${ic('image')}Photos</button>
      <button data-tab="settings">${ic('gear')}Settings</button>
    </nav>`;

  $('#q').addEventListener('input', (e) => { S.q = e.target.value.toLowerCase(); render(); });
  root.onclick = (e) => {
    const tab = e.target.closest('[data-tab]');
    if (tab) {
      if (tab.dataset.tab === 'videos' && S.tab === 'videos') S.playlist = null; // tap Videos again = back to playlists
      S.tab = tab.dataset.tab; render(); return;
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'lock') lockNow();
    else if (act === 'add') openAdd();
  };
}

function visibleItems() {
  const type = S.tab === 'videos' ? 'video' : 'photo';
  let list = Vault.all().filter((i) => i.type === type);
  if (S.q) list = list.filter((i) => i.title.toLowerCase().includes(S.q) || i.description.toLowerCase().includes(S.q) || i.album.toLowerCase().includes(S.q));
  if (S.liked) list = list.filter((i) => i.liked);
  if (type === 'photo' && S.album !== 'All') list = list.filter((i) => i.album === S.album);
  if (type === 'photo' && S.gifOnly) list = list.filter((i) => i.gif);
  if (type === 'video' && S.playlist && !S.q && !S.liked) list = list.filter((i) => i.album === S.playlist);
  if (S.sort === 'size') list.sort((a, b) => b.size - a.size);
  else if (S.sort === 'alpha') list.sort((a, b) => a.title.localeCompare(b.title));
  else list.sort((a, b) => b.addedAt - a.addedAt);
  return list;
}

async function render() {
  if (!S.unlocked) return;
  const token = ++renderToken;
  document.querySelectorAll('.nav button').forEach((b) => b.classList.toggle('on', b.dataset.tab === S.tab));
  $('.search').style.visibility = S.tab === 'settings' ? 'hidden' : 'visible';
  $('#fab').style.display = S.tab === 'settings' ? 'none' : 'flex';
  const el = $('#content');
  if (S.tab === 'settings') return renderSettings(el);
  if (S.playlist && !Vault.all().some((i) => i.type === 'video' && i.album === S.playlist)) S.playlist = null;
  if (S.tab === 'videos' && !S.playlist && !S.q && !S.liked) return renderPlaylists(el, token);

  const list = visibleItems();
  const thumbs = await Promise.all(list.map((i) => Vault.thumbUrl(i).catch(() => null)));
  if (token !== renderToken) return;

  const albums = Vault.albums();
  if (!albums.includes(S.album)) S.album = 'All';
  const inPl = S.tab === 'videos' && S.playlist && !S.q && !S.liked;
  const plHead = inPl ? `<div class="plhead"><button class="icon-btn" data-plback>${ic('back')}</button><div class="t"><h2>${esc(S.playlist)}</h2><p>${list.length} video${list.length === 1 ? '' : 's'}</p></div><button class="icon-btn" data-plrename>${ic('edit')}</button></div>` : '';
  const filters = plHead + `
    <div class="filters">
      ${[['new', 'Latest'], ['size', 'Largest'], ['alpha', 'A–Z']].map(([k, l]) => `<button class="chip ${S.sort === k ? 'on' : ''}" data-sort="${k}">${l}</button>`).join('')}
      <span class="sp"></span>${S.tab === 'photos' ? `<button class="chip ${S.gifOnly ? 'on' : ''}" data-gif>GIF</button>` : ''}
      <button class="chip heart ${S.liked ? 'on' : ''}" data-liked>${ic('heart')}Liked</button>
    </div>
    ${S.tab === 'photos' && albums.length > 1 ? `<div class="filters">${albums.map((a) => `<button class="chip ${S.album === a ? 'on' : ''}" data-album="${esc(a)}">${esc(a)}</button>`).join('')}</div>` : ''}`;

  let body;
  if (!list.length) {
    const none = S.tab === 'videos' ? 'videos' : 'photos';
    body = `<div class="empty">${ic(S.tab === 'videos' ? 'video' : 'image')}<h3>${S.liked || S.q ? 'Nothing found' : `No ${none} yet`}</h3><p>${S.liked || S.q ? 'Try changing your filters.' : 'Tap + to move private ' + none + ' into the vault.'}</p></div>`;
  } else if (S.tab === 'videos') {
    body = `<div class="vgrid">${list.map((v, i) => `
      <div class="vcard" data-open="${v.id}">
        <div class="th">
          ${thumbs[i] ? `<img src="${thumbs[i]}" loading="lazy">` : `<div class="ph">${ic('video')}</div>`}
          <div class="play"><span>${ic('play', 'fill')}</span></div>
          <span class="dur">${fmtDur(v.duration)}</span>
          ${v.progress && v.duration ? `<div class="wbar" style="width:${Math.round((v.progress / v.duration) * 100)}%"></div>` : ''}
        </div>
        <div class="vmeta">
          <div class="t"><h3>${esc(v.title)}</h3><p>${esc(v.album)} · ${fmtSize(v.size)}</p></div>
          <button class="heart-btn ${v.liked ? 'on' : ''}" data-like="${v.id}">${ic('heart')}</button>
        </div>
      </div>`).join('')}</div>`;
  } else {
    body = `<div class="pgrid">${list.map((p, i) => `
      <div class="pcard" data-open="${p.id}">
        ${thumbs[i] ? `<img src="${thumbs[i]}" loading="lazy">` : `<div class="ph" style="height:120px">${ic('image')}</div>`}
        <span class="alb">${esc(p.album)}</span>${p.gif ? '<span class="gifb">GIF</span>' : ''}
        ${p.liked ? `<span class="lk">${ic('heart')}</span>` : ''}
      </div>`).join('')}</div>`;
  }
  el.innerHTML = filters + body;

  el.onclick = async (e) => {
    const s = e.target.closest('[data-sort]'); if (s) { S.sort = s.dataset.sort; return render(); }
    if (e.target.closest('[data-liked]')) { S.liked = !S.liked; return render(); }
    if (e.target.closest('[data-gif]')) { S.gifOnly = !S.gifOnly; return render(); }
    if (e.target.closest('[data-plback]')) { S.playlist = null; return render(); }
    if (e.target.closest('[data-plrename]')) return renamePlaylist(S.playlist);
    const a = e.target.closest('[data-album]'); if (a) { S.album = a.dataset.album; return render(); }
    const lk = e.target.closest('[data-like]');
    if (lk) { e.stopPropagation(); const on = await Vault.toggleLike(lk.dataset.like); lk.classList.toggle('on', on); if (S.liked) render(); return; }
    const o = e.target.closest('[data-open]');
    if (o) openViewer(o.dataset.open, list.map((i) => i.id));
  };
}

/* ───────── playlists ───────── */
async function renderPlaylists(el, token) {
  const pls = Vault.playlists();
  const covers = await Promise.all(pls.map((p) => {
    const c = p.items.find((i) => i.thumb) || p.items[0];
    return c ? Vault.thumbUrl(c).catch(() => null) : null;
  }));
  if (token !== renderToken) return;
  if (!pls.length) {
    el.innerHTML = `<div class="empty">${ic('list')}<h3>No playlists yet</h3><p>Tap + to import videos and give them a playlist name.</p></div>`;
    el.onclick = null;
    return;
  }
  el.innerHTML = `<div class="plgrid">${pls.map((p, i) => `
    <div class="plcard" data-pl="${esc(p.name)}">
      <div class="stack"><div class="th">
        ${covers[i] ? `<img src="${covers[i]}" loading="lazy">` : `<div class="ph">${ic('video')}</div>`}
        <span class="cnt">${ic('list')}${p.count}</span>
      </div></div>
      <h3>${esc(p.name)}</h3>
      <p>${p.count} video${p.count === 1 ? '' : 's'} · ${fmtSize(p.bytes)}</p>
    </div>`).join('')}</div>`;
  el.onclick = (e) => {
    const c = e.target.closest('[data-pl]');
    if (c) { S.playlist = c.dataset.pl; render(); window.scrollTo(0, 0); }
  };
}

function renamePlaylist(name) {
  const s = sheet(`<h2>Rename playlist</h2>
    <input type="text" id="rn" maxlength="60" value="${esc(name)}">
    <button class="btn" id="go">Save</button>`);
  $('#go', s).onclick = async () => {
    const to = $('#rn', s).value.trim();
    if (!to) return toast('Name cannot be empty', 'error');
    await Vault.renameAlbum('video', name, to);
    S.playlist = to; s._close(); toast('Renamed'); render();
  };
}

/* ───────── settings ───────── */
async function renderSettings(el) {
  const st = Vault.stats();
  const bioOk = await Auth.biometricAvailable();
  const bioOn = await Auth.biometricEnabled();
  el.innerHTML = `
    <div class="stats">
      <div class="stat"><b>${st.videos}</b><span>Videos</span></div>
      <div class="stat"><b>${st.photos}</b><span>Photos</span></div>
      <div class="stat"><b>${fmtSize(st.bytes)}</b><span>Used</span></div>
    </div>
    <h4 class="sec">Security</h4>
    <div class="card">
      <div class="srow"><div class="l">Biometric unlock<small>${bioOk ? 'Fingerprint / face' : 'Not set up on this phone'}</small></div><button class="switch ${bioOn ? 'on' : ''}" data-bio ${bioOk ? '' : 'disabled'}></button></div>
      <div class="srow"><div class="l">Change PIN</div><button class="lnk" data-pin>Change</button></div>
      <div class="srow"><div class="l">Lock now</div><button class="lnk" data-lock>Lock</button></div>
    </div>
    <h4 class="sec">Privacy</h4>
    <div class="card">
      <div class="srow"><div class="l">100% offline<small>This app has no internet permission. Nothing is ever uploaded.</small></div></div>
      <div class="srow"><div class="l">Hidden from Gallery<small>Files are kept in the app's private storage. Screenshots and the app-switcher preview are blocked.</small></div></div>
      <div class="srow"><div class="l">No PIN recovery<small>There is no cloud account. If you forget your PIN you must reinstall, which erases the vault.</small></div></div>
    </div>`;
  el.onclick = async (e) => {
    if (e.target.closest('[data-lock]')) return lockNow();
    if (e.target.closest('[data-bio]')) {
      const on = await Auth.biometricEnabled();
      if (on) await Auth.setBiometric(false);
      else if (await Auth.biometricPrompt('Enable biometric unlock')) await Auth.setBiometric(true);
      return render();
    }
    if (e.target.closest('[data-pin]')) changePin();
  };
}

function changePin() {
  const s = sheet(`<h2>Change PIN</h2>
    <input type="text" inputmode="numeric" maxlength="6" id="p0" placeholder="Current PIN" style="-webkit-text-security:disc">
    <input type="text" inputmode="numeric" maxlength="6" id="p1" placeholder="New 6-digit PIN" style="-webkit-text-security:disc">
    <input type="text" inputmode="numeric" maxlength="6" id="p2" placeholder="Repeat new PIN" style="-webkit-text-security:disc">
    <button class="btn" id="go">Update PIN</button>`);
  $('#go', s).onclick = async () => {
    const [a, b, c] = ['p0', 'p1', 'p2'].map((id) => $('#' + id, s).value);
    if (!/^\d{6}$/.test(b)) return toast('New PIN must be 6 digits', 'error');
    if (b !== c) return toast('New PINs do not match', 'error');
    const r = await Auth.verifyPin(a);
    if (!r.ok) return toast(r.lockedFor ? 'Locked, try later' : 'Current PIN is wrong', 'error');
    await Auth.setPin(b);
    s._close(); toast('PIN updated');
  };
}

/* ───────── import ───────── */
function openAdd() {
  const s = sheet(`<h2>Add to vault</h2>
    <label class="dropzone" for="pick"><b>Choose photos & videos</b>They are copied into the private vault.</label>
    <input type="file" id="pick" multiple accept="image/*,video/*" style="display:none">
    <input type="text" id="alb" list="albnames" maxlength="60" placeholder="Playlist (videos) or Album (photos)" value="${esc(S.tab === 'videos' ? (S.playlist || 'General') : (S.album !== 'All' ? S.album : 'General'))}">
    <datalist id="albnames">${[...new Set(Vault.all().map((i) => i.album))].map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
    <button class="btn" id="go" disabled>Import</button>
    <div class="prog" id="prog" style="display:none"><span id="pst"></span><div class="bg"><div class="fl" id="pfl"></div></div></div>`);
  let files = [];
  const pick = $('#pick', s);

  // Picking opens another app screen; don't auto-lock while it is open.
  pick.addEventListener('click', () => { S.picking = true; });
  window.addEventListener('focus', () => setTimeout(() => { S.picking = false; }, 1500), { once: true });
  pick.addEventListener('change', () => {
    files = [...pick.files].filter((f) => /^(image|video)\//.test(f.type) || /\.gif$/i.test(f.name));
    S.picking = false;
    $('.dropzone b', s).textContent = files.length ? `${files.length} file${files.length > 1 ? 's' : ''} selected` : 'Choose photos & videos';
    $('#go', s).disabled = !files.length;
  });

  $('#go', s).onclick = async () => {
    const album = $('#alb', s).value.trim() || 'General';
    $('#go', s).disabled = true;
    $('#prog', s).style.display = 'block';
    let ok = 0;
    for (let i = 0; i < files.length; i++) {
      $('#pst', s).textContent = `Importing ${i + 1} of ${files.length} — ${files[i].name}`;
      try {
        await Vault.add(files[i], { album, onProgress: (p) => { $('#pfl', s).style.width = Math.round(((i + p) / files.length) * 100) + '%'; } });
        ok++;
      } catch (err) { toast(`Failed: ${files[i].name}`, 'error'); }
    }
    $('#pfl', s).style.width = '100%';
    s._close();
    toast(`${ok} item${ok === 1 ? '' : 's'} added to vault`);
    if (ok) { S.tab = files.some((f) => f.type.startsWith('video/')) && !files.every((f) => f.type.startsWith('image/')) ? 'videos' : S.tab; render(); }
  };
}

/* ───────── viewer ───────── */
function closeViewer() {
  if (!viewer) return;
  viewer.cleanup?.();
  viewer.el.remove();
  viewer = null;
  render();
}

async function openViewer(id, ids) {
  const item = Vault.get(id);
  if (!item) return;
  if (viewer) { viewer.cleanup?.(); viewer.el.remove(); viewer = null; }
  const el = document.createElement('div');
  el.className = 'viewer';
  document.body.appendChild(el);
  viewer = { el, type: item.type };
  const url = await Vault.mediaUrl(item);
  const idx = ids.indexOf(id);
  const bar = (it) => `
    <div class="vbar">
      <button data-close>${ic('back')}</button><div class="ttl">${esc(it.title)}</div>
      <button data-like class="${it.liked ? 'on' : ''}">${ic('heart')}</button>
      ${it.type === 'video' ? `<button data-thumb aria-label="Choose thumbnail">${ic('camera')}</button>` : ''}
      <button data-edit>${ic('edit')}</button>
      <button data-del class="danger">${ic('trash')}</button>
    </div>`;

  const wire = (it, extra) => {
    el.onclick = async (e) => {
      if (e.target.closest('[data-close]')) return closeViewer();
      if (e.target.closest('[data-like]')) { const on = await Vault.toggleLike(it.id); $('[data-like]', el).classList.toggle('on', on); return; }
      if (e.target.closest('[data-thumb]')) return pickThumb(it);
      if (e.target.closest('[data-edit]')) return editItem(it, () => openViewer(it.id, ids));
      if (e.target.closest('[data-del]')) {
        if (await confirmSheet('Delete forever?', `"${it.title}" will be permanently removed from the vault.`)) {
          await Vault.remove(it.id); toast('Deleted');
          const rest = ids.filter((x) => x !== it.id);
          rest.length ? openViewer(rest[Math.min(idx, rest.length - 1)], rest) : closeViewer();
        }
        return;
      }
      extra?.(e);
    };
  };

  if (item.type === 'photo') {
    el.innerHTML = `${bar(item)}
      <div class="stage" style="position:relative">
        ${idx > 0 ? `<button class="navarrow l" data-prev>${ic('back')}</button>` : ''}
        <div class="zoomwrap" id="zw"><img src="${url}" alt=""></div>
        ${idx < ids.length - 1 ? `<button class="navarrow r" data-next>${ic('next')}</button>` : ''}
      </div>
      <div class="vinfo"><div class="desc">${esc(item.description) || 'Album · ' + esc(item.album)} · ${fmtSize(item.size)}</div></div>`;
    const zw = $('#zw', el);
    let lastTap = 0, x0 = 0;
    zw.addEventListener('click', () => { const n = Date.now(); if (n - lastTap < 300) zw.classList.toggle('z'); lastTap = n; });
    zw.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
    zw.addEventListener('touchend', (e) => {
      if (zw.classList.contains('z')) return;
      const dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 70) { const n = ids[idx + (dx < 0 ? 1 : -1)]; if (n) openViewer(n, ids); }
    });
    wire(item, (e) => {
      if (e.target.closest('[data-prev]')) openViewer(ids[idx - 1], ids);
      if (e.target.closest('[data-next]')) openViewer(ids[idx + 1], ids);
    });
    return;
  }

  // video
  el.innerHTML = `${bar(item)}
    <div class="stage"><video id="vp" src="${url}" controls autoplay playsinline controlsList="nodownload"></video></div>
    <div class="vinfo">
      <div class="row"><button class="pillbtn ${S.autoplay ? 'on' : ''}" data-auto>${ic('play')}Autoplay next: ${S.autoplay ? 'On' : 'Off'}</button></div>
      <h2>${esc(item.title)}</h2>
      <div class="desc">${esc(item.description) || 'No description'}</div>
    </div>`;
  const vp = $('#vp', el);
  vp.addEventListener('loadedmetadata', () => {
    if (item.progress > 2 && item.progress < vp.duration * 0.95) vp.currentTime = item.progress;
    if (!item.duration && vp.duration) Vault.update(item.id, { duration: vp.duration });
  }, { once: true });
  let last = 0;
  vp.addEventListener('timeupdate', () => {
    if (Date.now() - last > 4000) { last = Date.now(); Vault.setProgress(item.id, vp.currentTime, vp.duration); }
  });
  vp.addEventListener('pause', () => Vault.setProgress(item.id, vp.currentTime, vp.duration));
  vp.addEventListener('ended', () => {
    Vault.setProgress(item.id, vp.duration, vp.duration);
    if (S.autoplay && ids[idx + 1]) openViewer(ids[idx + 1], ids);
  });
  viewer.cleanup = () => { try { Vault.setProgress(item.id, vp.currentTime, vp.duration); vp.pause(); vp.removeAttribute('src'); vp.load(); } catch { /* ignore */ } };
  wire(item, (e) => {
    if (e.target.closest('[data-auto]')) { S.autoplay = !S.autoplay; const b = $('[data-auto]', el); b.classList.toggle('on', S.autoplay); b.lastChild.textContent = `Autoplay next: ${S.autoplay ? 'On' : 'Off'}`; }
  });
}

/* ───────── video thumbnail picker ───────── */
function imgToBlob(file) {
  return new Promise((resolve, reject) => {
    const u = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      const k = Math.min(1, 640 / Math.max(im.naturalWidth, im.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(im.naturalWidth * k));
      c.height = Math.max(1, Math.round(im.naturalHeight * k));
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(u);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', 0.85);
    };
    im.onerror = () => { URL.revokeObjectURL(u); reject(new Error('bad image')); };
    im.src = u;
  });
}

async function pickThumb(it) {
  const vp = $('#vp');
  const start = vp ? vp.currentTime : 0; // start where you paused the video
  vp?.pause();
  const url = await Vault.mediaUrl(it);
  let tv;
  const s = sheet(`<h2>Choose thumbnail</h2>
    <video id="tv" src="${url}" muted playsinline preload="auto" style="width:100%;border-radius:14px;background:#000;max-height:34vh"></video>
    <input type="range" id="ts" min="0" max="1000" value="0" style="width:100%;margin:14px 0 4px;accent-color:#ff7eb9">
    <div class="tm"><span id="tc">0:00</span><span id="td">0:00</span></div>
    <button class="btn" id="use">Use this frame</button>
    <label class="btn alt" for="timg" style="display:block;text-align:center">Upload an image instead</label>
    <input type="file" id="timg" accept="image/*" style="display:none">`,
  { onClose: () => { if (tv) { tv.pause(); tv.removeAttribute('src'); tv.load(); } } });

  tv = $('#tv', s);
  const slider = $('#ts', s);
  const label = () => { $('#tc', s).textContent = fmtDur(tv.currentTime) || '0:00'; };
  tv.addEventListener('loadedmetadata', () => {
    $('#td', s).textContent = fmtDur(tv.duration) || '0:00';
    const t0 = Math.max(0, Math.min(start, (tv.duration || 1) - 0.1));
    tv.currentTime = t0;
    slider.value = tv.duration ? Math.round((t0 / tv.duration) * 1000) : 0;
  }, { once: true });
  tv.addEventListener('seeked', label);
  tv.addEventListener('error', () => toast('Could not load video', 'error'));
  slider.addEventListener('input', () => { if (tv.duration) tv.currentTime = (slider.value / 1000) * tv.duration; });

  $('#use', s).onclick = async () => {
    const w = tv.videoWidth, h = tv.videoHeight;
    if (!w || !h) return toast('Video not ready yet', 'error');
    const k = Math.min(1, 640 / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.round(w * k); c.height = Math.round(h * k);
    c.getContext('2d').drawImage(tv, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
    if (!blob) return toast('Could not capture frame', 'error');
    await Vault.setThumb(it.id, blob);
    s._close(); toast('Thumbnail updated');
  };

  const timg = $('#timg', s);
  timg.addEventListener('click', () => { S.picking = true; });
  window.addEventListener('focus', () => setTimeout(() => { S.picking = false; }, 1500), { once: true });
  timg.addEventListener('change', async () => {
    S.picking = false;
    const f = timg.files[0];
    if (!f) return;
    try { await Vault.setThumb(it.id, await imgToBlob(f)); s._close(); toast('Thumbnail updated'); }
    catch { toast('Could not use that image', 'error'); }
  });
}

function editItem(it, done) {
  const s = sheet(`<h2>Edit</h2>
    <input type="text" id="et" placeholder="Title" value="${esc(it.title)}">
    <textarea id="ed" rows="3" placeholder="Description…">${esc(it.description)}</textarea>
    <input type="text" id="ea" maxlength="60" placeholder="${it.type === 'video' ? 'Playlist' : 'Album'}" value="${esc(it.album)}">
    <button class="btn" id="go">Save changes</button>`);
  $('#go', s).onclick = async () => {
    await Vault.update(it.id, {
      title: $('#et', s).value.trim() || it.title,
      description: $('#ed', s).value.trim(),
      album: $('#ea', s).value.trim() || 'General'
    });
    s._close(); toast('Saved'); done?.();
  };
}

/* ───────── system hooks ───────── */
CapApp.addListener('appStateChange', ({ isActive }) => {
  if (!isActive && S.unlocked && !S.picking) lockNow();
});

CapApp.addListener('backButton', () => {
  const scrim = [...document.querySelectorAll('.scrim')].pop();
  if (scrim) return scrim._close?.();
  if (viewer) return closeViewer();
  if (S.unlocked && S.tab === 'videos' && S.playlist) { S.playlist = null; return render(); }
  if (S.unlocked && S.tab !== 'videos') { S.tab = 'videos'; return render(); }
  CapApp.minimizeApp();
});

(async function boot() {
  try { await PrivacyScreen.enable(); } catch { /* web dev */ }
  try { await StatusBar.setStyle({ style: Style.Dark }); await StatusBar.setBackgroundColor({ color: '#08080b' }); } catch { /* web dev */ }
  showLock();
})();
