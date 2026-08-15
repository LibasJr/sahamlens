import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/database/postgres.client', () => ({ pool: { query: vi.fn() } }));

import { pool } from '@/shared/database/postgres.client';
import { getAdminUserActivityReport } from '../user.repository';

describe('getAdminUserActivityReport', () => {
  it('memisahkan hitungan aktivitas 24 jam/7 hari/30 hari dari daftar tidak aktif', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [] } as any) // ensureSchema
      .mockResolvedValueOnce({ rows: [{ active24h: 3, active7d: 8, active30d: 14, inactive30d: 6 }] } as any)
      .mockResolvedValueOnce({ rows: [{ id: 'u-1', email: 'lama@test.com', role: 'free', last_login_at: '2026-06-01T00:00:00.000Z', last_active_at: '2026-06-01T00:00:00.000Z' }] } as any);

    await expect(getAdminUserActivityReport()).resolves.toEqual({
      summary: { active24h: 3, active7d: 8, active30d: 14, inactive30d: 6 },
      inactiveUsers: [{ id: 'u-1', email: 'lama@test.com', role: 'free', last_login_at: '2026-06-01T00:00:00.000Z', last_active_at: '2026-06-01T00:00:00.000Z' }],
    });

    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("INTERVAL '30 days'"));
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('WHERE last_active_at IS NULL OR last_active_at < NOW() - INTERVAL'), [100]);
  });
});
