import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenError } from '@/shared/errors/app-error';

const mocks = vi.hoisted(() => ({ requireAdminSession: vi.fn() }));

vi.mock('@/lib/sahamLensGuard', () => ({ guard: vi.fn() }));
vi.mock('@/shared/auth/admin-session', () => ({ requireAdminSession: mocks.requireAdminSession }));

import { GET } from '../route';

describe('GET /api/admin/ara-scanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminSession.mockResolvedValue({ id: 'admin-1', role: 'admin' });
  });

  it('menolak request tanpa sesi admin', async () => {
    mocks.requireAdminSession.mockRejectedValueOnce(new ForbiddenError());

    const response = await GET(new Request('http://localhost/api/admin/ara-scanner'));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'Forbidden',
      code: 'FORBIDDEN',
      meta: { requestId: expect.any(String) },
    });
  });

  it('mengembalikan readiness dan policy v0.3 untuk admin', async () => {
    const response = await GET(new Request('http://localhost/api/admin/ara-scanner'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.requireAdminSession).toHaveBeenCalledOnce();
    expect(body).toMatchObject({
      readiness: {
        status: 'NOT_RUN',
        executionAllowed: false,
        failClosed: true,
        signalCount: 0,
      },
      policy: {
        version: 'v0.3',
        autoBuyAllowed: false,
        formula: { status: 'CONFIRMED' },
      },
      meta: { requestId: expect.any(String) },
    });
  });
});
