import { describe, it, expect, vi } from 'vitest';
import { encrypt, decrypt, type SessionPayload } from '@/shared/auth/jwt';

describe('encrypt/decrypt (generic payload support)', () => {
  it('round-trips a SessionPayload exactly like before (backward compatible)', async () => {
    const payload: SessionPayload = {
      id: 'u1', email: 'a@b.com', role: 'user', is_pro: false, trial_ends_at: null,
    };
    const token = await encrypt(payload);
    const decoded = await decrypt(token);
    expect(decoded?.id).toBe('u1');
    expect(decoded?.email).toBe('a@b.com');
  });

  it('round-trips an arbitrary custom payload shape via explicit generic', async () => {
    interface CustomPayload { firstSeenAt: string }
    const payload: CustomPayload = { firstSeenAt: '2026-08-02T00:00:00.000Z' };
    const token = await encrypt(payload, '7d');
    const decoded = await decrypt<CustomPayload>(token);
    expect(decoded?.firstSeenAt).toBe('2026-08-02T00:00:00.000Z');
  });

  it('mengembalikan null untuk token rusak/tidak valid, bukan throw', async () => {
    const decoded = await decrypt('not-a-real-jwt');
    expect(decoded).toBeNull();
  });

  it('tidak membaca secret saat import, tetapi tetap fail-closed saat JWT dipakai', async () => {
    const configuredSecret = process.env.JWT_SECRET_KEY;

    try {
      delete process.env.JWT_SECRET_KEY;
      vi.resetModules();

      const jwt = await import('@/shared/auth/jwt');

      await expect(jwt.encrypt({ id: 'u1' })).rejects.toThrow('JWT_SECRET_KEY env var wajib diset');
      await expect(jwt.decrypt('not-a-real-jwt')).rejects.toThrow('JWT_SECRET_KEY env var wajib diset');
    } finally {
      if (configuredSecret === undefined) {
        delete process.env.JWT_SECRET_KEY;
      } else {
        process.env.JWT_SECRET_KEY = configuredSecret;
      }
      vi.resetModules();
    }
  });
});
