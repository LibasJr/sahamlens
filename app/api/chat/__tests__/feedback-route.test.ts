import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/user', () => ({ getSession: vi.fn() }));
vi.mock('@/shared/database/postgres.client', () => ({ pool: { query: vi.fn() } }));
vi.mock('@/shared/database/schema.service', () => ({ ensureSharedSchema: vi.fn() }));

import { POST } from '../feedback/route';
import { getSession } from '@/modules/user';
import { pool } from '@/shared/database/postgres.client';
import { ensureSharedSchema } from '@/shared/database/schema.service';

function request(body: unknown) {
  return new Request('http://localhost/api/chat/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/chat/feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue(null as any);
    vi.mocked(ensureSharedSchema).mockResolvedValue();
    vi.mocked(pool.query).mockResolvedValue({} as any);
  });

  it('menyimpan feedback eksplisit dengan payload yang dibatasi', async () => {
    const response = await POST(request({
      messageId: 'answer-123',
      rating: 'down',
      prompt: 'IHSG hari ini bagaimana?',
      answer: 'Pasar sedang tutup; ini data sesi terakhir.',
      intent: 'MARKET_GENERAL',
      sourceLabel: 'Data terverifikasi SahamLens',
      dataTimestamp: '2026-08-14T09:20:00.000Z',
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.objectContaining({ ok: true, meta: expect.objectContaining({ requestId: expect.any(String) }) }));
    expect(response.headers.get('X-Request-Id')).toBeTruthy();
    expect(ensureSharedSchema).toHaveBeenCalledOnce();
    expect(pool.query).toHaveBeenCalledOnce();
    expect(vi.mocked(pool.query).mock.calls[0][1]).toEqual(expect.arrayContaining([
      'answer-123',
      null,
      'down',
      'IHSG hari ini bagaimana?',
      'MARKET_GENERAL',
    ]));
  });

  it('menolak payload tanpa pilihan feedback atau isi jawaban', async () => {
    const response = await POST(request({ messageId: 'answer-123', rating: 'maybe', prompt: 'x' }));

    expect(response.status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });
});
