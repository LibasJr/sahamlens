import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/database/postgres.client', () => ({ pool: { query: vi.fn() } }));
vi.mock('@/shared/database/schema.service', () => ({ ensureSharedSchema: vi.fn() }));

import { pool } from '@/shared/database/postgres.client';
import { ensureSharedSchema } from '@/shared/database/schema.service';
import { summarizeLensAiFeedbackByIntent } from '../lensai-feedback.repository';

describe('summarizeLensAiFeedbackByIntent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ensureSharedSchema).mockResolvedValue();
    vi.mocked(pool.query).mockResolvedValue({
      rows: [{ intent: 'MARKET_GENERAL', total: 8, negative: 5, positive: 3 }],
    } as any);
  });

  it('mengelompokkan feedback menurut intent dan memprioritaskan 👎', async () => {
    await expect(summarizeLensAiFeedbackByIntent()).resolves.toEqual([
      { intent: 'MARKET_GENERAL', total: 8, negative: 5, positive: 3 },
    ]);

    expect(ensureSharedSchema).toHaveBeenCalledOnce();
    expect(pool.query).toHaveBeenCalledOnce();
    const [query, params] = vi.mocked(pool.query).mock.calls[0];
    expect(query).toContain("COUNT(*) FILTER (WHERE rating = 'down')");
    expect(query).toContain('GROUP BY NULLIF(intent');
    expect(params).toEqual([12]);
  });

  it('membatasi jumlah kelompok agar halaman admin tetap ringan', async () => {
    await summarizeLensAiFeedbackByIntent(999);

    expect(vi.mocked(pool.query).mock.calls[0][1]).toEqual([24]);
  });
});
