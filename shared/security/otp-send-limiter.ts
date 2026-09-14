import { Redis } from '../cache/redis-local';

/**
 * Pembatas PENGIRIMAN OTP reset password - berbeda dari pembatas PERCOBAAN.
 *
 * ===================================================================================
 * KENAPA DUA PEMBATAS YANG TERPISAH
 * ===================================================================================
 * `otp-attempt-limiter` membatasi berapa kali kode SALAH boleh dicoba. Pembatas di
 * berkas ini membatasi berapa kali kode boleh DIKIRIM.
 *
 * Keduanya tidak bisa digabung karena melindungi dari serangan yang berbeda:
 *
 *   - tanpa batas percobaan -> penyerang menebak 900.000 kombinasi
 *   - tanpa batas pengiriman -> penyerang membanjiri inbox korban (email bombing),
 *     dan - lebih buruk - mengaduk-aduk `reset_code` korban terus menerus
 *
 * ===================================================================================
 * IP DAN AKUN, BUKAN SALAH SATU
 * ===================================================================================
 * Batas per akun saja: satu penyerang membanjiri 1.000 akun berbeda dari satu mesin.
 * Batas per IP saja: botnet membanjiri satu akun dari 1.000 alamat.
 *
 * Keduanya diperiksa, dan yang mana pun tercapai lebih dulu memblokir permintaan.
 *
 * ===================================================================================
 * FAIL-CLOSED SAAT REDIS MATI
 * ===================================================================================
 * Kalau Redis tidak bisa dihubungi, penghitung jatuh ke Map dalam proses. Itu lebih
 * lemah (tiap instance punya hitungan sendiri) tapi tetap membatasi, dan TIDAK
 * membuka pintu lebar-lebar. Diam-diam mengizinkan semua permintaan saat Redis mati
 * adalah kegagalan senyap - persis pola yang dilarang CLAUDE.md.
 */

/** Maksimal pengiriman OTP per akun dalam satu jendela. Sesuai spesifikasi V2. */
const MAX_SENDS_PER_ACCOUNT = 3;
/** IP diberi ruang lebih besar: kantor/kampus berbagi satu alamat NAT. */
const MAX_SENDS_PER_IP = 10;
const WINDOW_SECONDS = 15 * 60;

type LocalEntry = { count: number; expiresAt: number };
const local = new Map<string, LocalEntry>();
let redis: Redis | null | undefined;

/** Email dinormalkan supaya `A@b.com `, `a@b.com` dan `A@B.COM` berbagi satu hitungan. */
function normalizeEmail(email: string): string {
  return String(email ?? '').trim().toLowerCase();
}

function accountKey(email: string): string {
  return `sahamlens:security:reset-otp-sends:acct:${normalizeEmail(email)}`;
}

function ipKey(ip: string): string {
  return `sahamlens:security:reset-otp-sends:ip:${String(ip ?? 'unknown').trim()}`;
}

function client(): Redis | null {
  if (redis !== undefined) return redis;
  const url = process.env.REDIS_URL;
  redis = url ? new Redis({ url }) : null;
  return redis;
}

function localBump(k: string): number {
  const now = Date.now();
  const entry = local.get(k);
  if (!entry || entry.expiresAt <= now) {
    local.set(k, { count: 1, expiresAt: now + WINDOW_SECONDS * 1000 });
    return 1;
  }
  entry.count += 1;
  return entry.count;
}

async function bump(k: string): Promise<number> {
  const r = client();
  if (r) {
    try {
      const count = await r.incr(k);
      if (count === 1) await r.expire(k, WINDOW_SECONDS);
      return count;
    } catch {
      // Redis mati: jatuh ke penghitung lokal, BUKAN mengizinkan tanpa batas.
    }
  }
  return localBump(k);
}

export type ResetSendDecision =
  | { allowed: true }
  | { allowed: false; reason: 'ACCOUNT_COOLDOWN' | 'IP_COOLDOWN' };

/**
 * Mencatat satu percobaan pengiriman dan memutuskan boleh atau tidak.
 *
 * Penghitung dinaikkan SEBELUM keputusan, jadi permintaan yang ditolak tetap ikut
 * dihitung. Kalau tidak, penyerang bisa terus mencoba di ambang batas tanpa pernah
 * menaikkan hitungannya.
 *
 * Keduanya SELALU dinaikkan - tidak ada hubung-singkat setelah akun tercapai.
 * Kalau IP hanya dihitung ketika akun lolos, penyerang yang menyasar banyak akun
 * bisa menahan hitungan IP-nya tetap rendah.
 */
export async function consumeResetSendQuota(email: string, ip: string): Promise<ResetSendDecision> {
  const [accountCount, ipCount] = await Promise.all([bump(accountKey(email)), bump(ipKey(ip))]);

  if (accountCount > MAX_SENDS_PER_ACCOUNT) return { allowed: false, reason: 'ACCOUNT_COOLDOWN' };
  if (ipCount > MAX_SENDS_PER_IP) return { allowed: false, reason: 'IP_COOLDOWN' };
  return { allowed: true };
}

/** Dipanggil setelah reset BERHASIL - alur yang tuntas tidak boleh menghukum pengguna. */
export async function clearResetSendQuota(email: string): Promise<void> {
  const k = accountKey(email);
  local.delete(k);
  const r = client();
  if (r) {
    try { await r.del(k); } catch { /* best effort */ }
  }
}

export const RESET_SEND_MAX_PER_ACCOUNT = MAX_SENDS_PER_ACCOUNT;
export const RESET_SEND_MAX_PER_IP = MAX_SENDS_PER_IP;
export const RESET_SEND_WINDOW_SECONDS = WINDOW_SECONDS;
