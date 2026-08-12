import { describe, expect, it } from 'vitest';
import { SignJWT } from 'jose';
import { encrypt, decrypt } from '../jwt';

/**
 * SESI BERGESER (2026-08-12) - bug yang dilaporkan berulang: "sudah login kok diminta
 * login lagi".
 *
 * Penyebabnya bukan acak. `SESSION_COOKIE` hanya pernah ditulis oleh handleLogin dan
 * handleVerify; tidak ada satu jalur pun yang memperbaruinya saat sesi DIPAKAI. Masa
 * berlakunya karena itu MUTLAK, bukan bergeser - dan checkbox "Ingat saya" default MATI,
 * sehingga sesi baku hanya 24 jam sejak login. Pemakai harian pasti dilempar ke /login
 * setiap hari, tepat di tengah pemakaian.
 *
 * Test ini mengunci aritmetika penyegarannya. Logika keputusannya sengaja ditulis ulang
 * di sini dari kontraknya - `proxy.ts` berjalan di Edge runtime dan tidak bisa diimpor
 * langsung ke test node - jadi yang diuji adalah SYARAT yang harus dipenuhi, plus bahwa
 * token hasil terbitan ulang benar-benar sah dan membawa identitas yang sama.
 */

const SESSION_REFRESH_AFTER_FRACTION = 0.5;

/** Salinan syarat di refreshSessionCookie(). */
function shouldRefresh(iat: number, exp: number, nowSec: number): boolean {
  if (exp <= iat) return false;
  const lifetime = exp - iat;
  if (nowSec >= exp) return false;
  return nowSec - iat >= lifetime * SESSION_REFRESH_AFTER_FRACTION;
}

const DAY = 24 * 60 * 60;

describe('syarat penyegaran sesi', () => {
  const iat = 1_000_000;
  const exp = iat + DAY;

  it('BELUM separuh umur -> tidak diperbarui', () => {
    expect(shouldRefresh(iat, exp, iat + 1)).toBe(false);
    expect(shouldRefresh(iat, exp, iat + DAY / 2 - 1)).toBe(false);
  });

  it('TEPAT separuh umur -> mulai diperbarui', () => {
    expect(shouldRefresh(iat, exp, iat + DAY / 2)).toBe(true);
  });

  it('lewat separuh, masih sah -> diperbarui', () => {
    expect(shouldRefresh(iat, exp, iat + DAY - 60)).toBe(true);
  });

  it('SUDAH kedaluwarsa -> TIDAK diperbarui', () => {
    // Ini yang membuat perbaikan tetap menggeser jendela, bukan membuatnya abadi.
    // Sesi yang benar-benar ditinggalkan tetap mati sesuai jadwal aslinya.
    expect(shouldRefresh(iat, exp, exp)).toBe(false);
    expect(shouldRefresh(iat, exp, exp + 1)).toBe(false);
  });

  it('klaim waktu rusak -> tidak diperbarui, bukan diperpanjang membabi buta', () => {
    expect(shouldRefresh(exp, iat, iat + 10)).toBe(false);
    expect(shouldRefresh(iat, iat, iat + 10)).toBe(false);
  });

  it('sesi 30 hari ("Ingat saya") memakai ambang separuhnya sendiri, bukan 12 jam', () => {
    const longExp = iat + 30 * DAY;
    expect(shouldRefresh(iat, longExp, iat + 14 * DAY)).toBe(false);
    expect(shouldRefresh(iat, longExp, iat + 15 * DAY)).toBe(true);
  });
});

describe('token hasil terbitan ulang', () => {
  it('membawa identitas yang sama dan tetap sah', async () => {
    const token = await encrypt({ id: 'u-1', email: 'a@b.c', role: 'pro', is_pro: true }, '24h');
    const payload = (await decrypt(token)) as Record<string, unknown>;
    expect(payload).not.toBeNull();

    // Sama seperti di refreshSessionCookie: klaim waktu dibuang, sisanya dibawa.
    const { exp: _e, iat: _i, nbf: _n, ...rest } = payload;
    const lifetimeSec = (payload.exp as number) - (payload.iat as number);
    const baru = (await decrypt(await encrypt(rest, `${lifetimeSec}s`))) as Record<string, unknown>;

    expect(baru).not.toBeNull();
    expect(baru.id).toBe('u-1');
    expect(baru.email).toBe('a@b.c');
    expect(baru.role).toBe('pro');
    expect(baru.is_pro).toBe(true);
  });

  it('PANJANG SESI ASLI dipertahankan - pilihan "Ingat saya" tidak hilang', async () => {
    // Kalau panjangnya dipatok 24 jam, pengguna yang memilih 30 hari diam-diam
    // diturunkan setiap kali sesinya disegarkan.
    for (const asli of ['24h', '30d'] as const) {
      const payload = (await decrypt(await encrypt({ id: 'u-1' }, asli))) as Record<string, unknown>;
      const lifetimeSec = (payload.exp as number) - (payload.iat as number);
      const { exp: _e, iat: _i, ...rest } = payload;
      const baru = (await decrypt(await encrypt(rest, `${lifetimeSec}s`))) as Record<string, unknown>;
      expect((baru.exp as number) - (baru.iat as number)).toBe(lifetimeSec);
    }
  });

  it('token kedaluwarsa tetap ditolak decrypt - penyegaran tidak menghidupkan yang mati', async () => {
    // Token dibuat SUDAH mati lewat exp absolut di masa lalu, bukan dengan menunggu jam
    // dinding. Versi sebelumnya tidur 1,5 detik dan itu membuat test gagal saat mesin
    // sedang berat - flake yang saya masukkan sendiri, dan flake membuat orang berhenti
    // mempercayai suite-nya.
    const kunci = new TextEncoder().encode(process.env.JWT_SECRET_KEY);
    const mati = await new SignJWT({ id: 'u-1' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(kunci);
    expect(await decrypt(mati)).toBeNull();
  });
});
