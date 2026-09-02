import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock('@/shared/auth/session', () => ({ getSession }));

import { isNativeBearerRequest, requireAdminSession } from '@/shared/auth/admin-session';

describe('native desktop admin session', () => {
  beforeEach(() => getSession.mockReset());

  it('accepts a validated bearer-backed admin session', async () => {
    getSession.mockResolvedValue({ id: 'admin-id', email: 'admin@sahamlens.id', role: 'admin', is_pro: true });
    await expect(requireAdminSession()).resolves.toMatchObject({ role: 'admin' });
  });

  it('rejects authenticated non-admin sessions', async () => {
    getSession.mockResolvedValue({ id: 'user-id', email: 'user@sahamlens.id', role: 'user', is_pro: true });
    await expect(requireAdminSession()).rejects.toMatchObject({ status: 403 });
  });

  it('detects native bearer requests without trusting arbitrary headers', () => {
    expect(isNativeBearerRequest(new Request('https://sahamlens.id/api/admin/jobs', { headers: { Authorization: 'Bearer signed.jwt' } }))).toBe(true);
    expect(isNativeBearerRequest(new Request('https://sahamlens.id/api/admin/jobs', { headers: { Authorization: 'Basic fake' } }))).toBe(false);
    expect(isNativeBearerRequest(new Request('https://sahamlens.id/api/admin/jobs'))).toBe(false);
  });

  it('migrates the four desktop admin modules away from cookie-only authorization', async () => {
    const fs = await import('node:fs');
    const paths = ['decision-lab', 'transparency', 'tpcl-validation', 'ownership-flow'];
    for (const path of paths) {
      const source = fs.readFileSync(`app/api/admin/${path}/route.ts`, 'utf8');
      expect(source).toContain('requireAdminSession');
      expect(source).not.toContain('isAdminFromRequestCookies');
    }
  });
});
