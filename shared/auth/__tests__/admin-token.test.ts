import { describe, expect, it } from 'vitest';
import { signAdminToken, verifyAdminToken } from '../admin-token';
import { encrypt } from '../jwt';

describe('verifyAdminToken', () => {
  it('menerima token yang ditandatangani signAdminToken', async () => {
    expect(await verifyAdminToken(await signAdminToken())).toBe(true);
  });

  it('menolak nilai sentinel lama - ini celah yang membuat siapa pun bisa masuk /admin', async () => {
    // Cookie admin dulu berisi literal '1'. HttpOnly tidak mencegah klien MENGIRIM
    // cookie, jadi `curl -H "Cookie: sahamlens_admin=1"` cukup untuk lolos.
    expect(await verifyAdminToken('1')).toBe(false);
    expect(await verifyAdminToken('true')).toBe(false);
    expect(await verifyAdminToken('admin')).toBe(false);
  });

  it('menolak kosong, tidak ada, dan sampah', async () => {
    expect(await verifyAdminToken(undefined)).toBe(false);
    expect(await verifyAdminToken(null)).toBe(false);
    expect(await verifyAdminToken('')).toBe(false);
    expect(await verifyAdminToken('a.b.c')).toBe(false);
  });

  it('menolak JWT sah yang bukan token admin', async () => {
    // Cookie sesi login dan cookie trial anonim ditandatangani dengan kunci yang sama.
    // Tanpa cek klaim `admin`, user biasa cukup menyalin cookie `session` miliknya
    // sendiri ke sahamlens_admin untuk naik jadi admin.
    const sesiUserBiasa = await encrypt({
      id: 'user-1',
      email: 'user@test.com',
      role: 'free',
      is_pro: false,
      trial_ends_at: null,
    });
    expect(await verifyAdminToken(sesiUserBiasa)).toBe(false);

    // Bahkan sesi dengan role admin bukan token admin: keduanya cookie berbeda dengan
    // jalur penerbitan berbeda, dan hanya verifyAdminSecret yang boleh menerbitkan ini.
    const sesiRoleAdmin = await encrypt({ id: 'user-2', email: 'a@test.com', role: 'admin' });
    expect(await verifyAdminToken(sesiRoleAdmin)).toBe(false);

    // Klaim admin yang bukan boolean true juga ditolak.
    expect(await verifyAdminToken(await encrypt({ admin: 'true' }))).toBe(false);
    expect(await verifyAdminToken(await encrypt({ admin: 1 }))).toBe(false);
  });

  it('menolak token yang ditandatangani kunci lain', async () => {
    // HS256 dengan secret berbeda: tanda tangan tidak cocok.
    const { SignJWT } = await import('jose');
    const kunciAsing = new TextEncoder().encode('kunci-penyerang-yang-bukan-JWT_SECRET_KEY');
    const palsu = await new SignJWT({ admin: true })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(kunciAsing);

    expect(await verifyAdminToken(palsu)).toBe(false);
  });
});
