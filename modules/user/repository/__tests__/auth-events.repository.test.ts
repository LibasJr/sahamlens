import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/database/postgres.client', () => ({ pool: { query: vi.fn() } }));

import { pool } from '@/shared/database/postgres.client';
import { getRecentAuthEvents, recordAuthEvent } from '../user.repository';

describe('user auth events repository', () => {
  it('menyimpan audit tanpa IP mentah dan membatasi daftar terbaru', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [] } as any) // ensureSchema
      .mockResolvedValueOnce({ rows: [] } as any) // insert event
      .mockResolvedValueOnce({ rows: [{
        id: 1, user_id: 'u-1', email: 'user@test.com', event_type: 'login',
        ip_hash: 'a'.repeat(64), ip_prefix: '203.0.113.0/24', user_agent: 'Browser', created_at: '2026-08-15T00:00:00.000Z',
      }] } as any);

    await recordAuthEvent({
      userId: 'u-1', email: 'USER@Test.com', eventType: 'login',
      requestMeta: { ipHash: 'a'.repeat(64), ipPrefix: '203.0.113.0/24', userAgent: 'Browser' },
    });

    await expect(getRecentAuthEvents(999)).resolves.toHaveLength(1);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO user_auth_events'),
      ['u-1', 'user@test.com', 'login', 'a'.repeat(64), '203.0.113.0/24', 'Browser'],
    );
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('ORDER BY created_at DESC'), [200]);
  });
});
