import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/user/repository/product-journey.repository', () => ({
  recordJourneyEvents: vi.fn(),
}));

import { POST } from '../route';
import { recordJourneyEvents } from '@/modules/user/repository/product-journey.repository';

const visitorId = '59c09c28-18e7-4d21-8898-75199fc17b0d';
const sessionId = '0f2a1d68-1c9f-4d3e-9a2b-77f0e6c4a1b2';

function kirim(body: unknown): Promise<Response> {
  return POST(new Request('http://localhost/api/analytics/journey', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  }));
}

describe('POST /api/analytics/journey', () => {
  beforeEach(() => vi.clearAllMocks());

  it('merekam kelompok event tanpa data identitas pengguna', async () => {
    const response = await kirim({
      visitorId,
      sessionId,
      events: [
        { name: 'session_start', surface: 'home', elapsedMs: 0 },
        { name: 'stock_analysis_view', surface: 'technical', elapsedMs: 8421 },
      ],
    });

    expect(response.status).toBe(204);
    expect(recordJourneyEvents).toHaveBeenCalledWith({
      visitorId,
      sessionId,
      events: [
        { name: 'session_start', surface: 'home', elapsedMs: 0 },
        { name: 'stock_analysis_view', surface: 'technical', elapsedMs: 8421 },
      ],
    });
  });

  it('menolak nama event di luar daftar tertutup', async () => {
    // Migration 010 tidak punya CHECK pada event_name - penolakan di sinilah yang menjaga
    // kardinalitas tabelnya. Kalau gerbang ini hilang, satu bug klien bisa menulis nama
    // sebanyak jumlah klik.
    const response = await kirim({
      visitorId,
      sessionId,
      events: [{ name: 'stock_tab_change', surface: 'technical', elapsedMs: 10 }],
    });

    expect(response.status).toBe(400);
    expect(recordJourneyEvents).not.toHaveBeenCalled();
  });

  it('menolak permukaan karangan dan ID browser yang bukan UUID', async () => {
    expect((await kirim({ visitorId, sessionId, events: [{ name: 'session_start', surface: 'entah', elapsedMs: 0 }] })).status).toBe(400);
    expect((await kirim({ visitorId: 'bukan-uuid', sessionId, events: [{ name: 'session_start', surface: 'home', elapsedMs: 0 }] })).status).toBe(400);
    expect(recordJourneyEvents).not.toHaveBeenCalled();
  });

  it('menolak kiriman kosong', async () => {
    expect((await kirim({ visitorId, sessionId, events: [] })).status).toBe(400);
    expect(recordJourneyEvents).not.toHaveBeenCalled();
  });

  it('membalas 500 tanpa membocorkan galat internal saat penyimpanan gagal', async () => {
    vi.mocked(recordJourneyEvents).mockRejectedValueOnce(new Error('connection refused ke 10.0.0.5'));

    const response = await kirim({
      visitorId,
      sessionId,
      events: [{ name: 'session_start', surface: 'home', elapsedMs: 0 }],
    });

    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('10.0.0.5');
  });
});
