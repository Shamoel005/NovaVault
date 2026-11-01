import { Preferences } from '@capacitor/preferences';
import { BiometricAuth } from '@aparajita/capacitor-biometric-auth';

/*
 * PIN is never stored. We keep only a random salt + PBKDF2-SHA256 hash (210k iterations).
 * Wrong attempts trigger escalating lockouts. There is no cloud, so there is NO PIN recovery.
 */
const K = { salt: 'nv_salt', hash: 'nv_hash', bio: 'nv_bio', fails: 'nv_fails', until: 'nv_until' };
const ITER = 210000;

const get = async (k) => (await Preferences.get({ key: k })).value;
const set = (k, v) => Preferences.set({ key: k, value: String(v) });

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (s) => new Uint8Array(s.match(/.{2}/g).map((h) => parseInt(h, 16)));

async function derive(pin, saltBytes) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations: ITER }, key, 256));
}

export async function hasPin() { return !!(await get(K.hash)); }

export async function setPin(pin) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  await set(K.salt, hex(salt));
  await set(K.hash, await derive(pin, salt));
  await set(K.fails, 0);
  await set(K.until, 0);
}

export async function lockRemaining() {
  const until = Number((await get(K.until)) || 0);
  return Math.max(0, until - Date.now());
}

export async function verifyPin(pin) {
  const wait = await lockRemaining();
  if (wait > 0) return { ok: false, lockedFor: wait };

  const salt = unhex(await get(K.salt));
  const ok = (await derive(pin, salt)) === (await get(K.hash));
  if (ok) {
    await set(K.fails, 0);
    return { ok: true };
  }
  const fails = Number((await get(K.fails)) || 0) + 1;
  await set(K.fails, fails);
  if (fails >= 5) {
    // 30s, 60s, 120s ... capped at 1 hour
    const ms = Math.min(30000 * 2 ** (fails - 5), 3600000);
    await set(K.until, Date.now() + ms);
    return { ok: false, lockedFor: ms };
  }
  return { ok: false, triesLeft: 5 - fails };
}

export async function biometricAvailable() {
  try { return (await BiometricAuth.checkBiometry()).isAvailable; } catch { return false; }
}
export async function biometricEnabled() {
  return (await get(K.bio)) === '1' && (await biometricAvailable());
}
export async function setBiometric(on) { await set(K.bio, on ? '1' : '0'); }

export async function biometricPrompt(reason = 'Unlock NovaVault') {
  try {
    await BiometricAuth.authenticate({
      reason,
      cancelTitle: 'Use PIN',
      allowDeviceCredential: false,
      androidTitle: 'NovaVault',
      androidSubtitle: reason
    });
    return true;
  } catch { return false; }
}
