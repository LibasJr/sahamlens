import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createJourneyTracker, type JourneyTrackerPorts } from '../journey-tracker';
import { MAX_JOURNEY_BATCH } from '../journey-events';
import type { JourneyBatch } from '../journey-events';

const visitorId = '59c09c28-18e7-4d21-8898-75199fc17b0d';
const sessionId = '0f2a1d68-1c9f-4d3e-9a2b-77f0e6c4a1b2';

function ports(overrides: Partial<JourneyTrackerPorts> = {}) {
  const sent: JourneyBatch[] = [];
  let elapsed = 0;
  const base: JourneyTrackerPorts = {
    identity: () => ({ visitorId, sessionId, isNewSession: false }),
    elapsedMs: () => elapsed,
    send: async (batch) => { sent.push(batch); },
    ...overrides,
  };
  return { ports: base, sent, setElapsed: (value: number) => { elapsed = value; } };
}

describe('pelacak perjalanan riset', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mengantrekan event dan mengirimnya sebagai satu kelompok', async () => {
    const { ports: p, sent, setElapsed } = ports();
    const tracker = createJourneyTracker(p);

    tracker.track('stock_analysis_view', 'technical');
    setElapsed(4200);
    tracker.track('stock_evidence_view', 'technical');
    expect(sent).toHaveLength(0);

    await tracker.flush();

    expect(sent).toEqual([{
      visitorId,
      sessionId,
      events: [
        { name: 'stock_analysis_view', surface: 'technical', elapsedMs: 0 },
        { name: 'stock_evidence_view', surface: 'technical', elapsedMs: 4200 },
      ],
    }]);
  });

  it('menyisipkan session_start sekali di awal sesi baru', async () => {
    // t0 metrik "waktu sampai tindakan berguna pertama" harus ada di data, bukan
    // disimpulkan dari event paling awal yang kebetulan terekam.
    const { ports: p, sent } = ports({ identity: () => ({ visitorId, sessionId, isNewSession: true }) });
    const tracker = createJourneyTracker(p);

    tracker.track('stock_analysis_view', 'technical');
    tracker.track('stock_evidence_view', 'technical');
    await tracker.flush();

    expect(sent[0].events.map((event) => event.name)).toEqual([
      'session_start',
      'stock_analysis_view',
      'stock_evidence_view',
    ]);
    expect(sent[0].events[0].elapsedMs).toBe(0);
  });

  it('tidak menyisipkan session_start pada sesi yang sudah berjalan', async () => {
    const { ports: p, sent } = ports();
    const tracker = createJourneyTracker(p);

    tracker.track('watchlist_view', 'watchlist');
    await tracker.flush();

    expect(sent[0].events.map((event) => event.name)).toEqual(['watchlist_view']);
  });

  it('mengirim sendiri begitu antrean penuh', async () => {
    const { ports: p, sent } = ports();
    const tracker = createJourneyTracker(p);

    for (let i = 0; i < MAX_JOURNEY_BATCH; i++) tracker.track('stock_analysis_view', 'technical');
    await tracker.settled();

    // Batas ini juga batas validator server; melampauinya berarti seluruh kiriman ditolak.
    expect(sent).toHaveLength(1);
    expect(sent[0].events).toHaveLength(MAX_JOURNEY_BATCH);
  });

  it('flush tanpa antrean tidak mengirim apa-apa', async () => {
    const { ports: p, sent } = ports();
    await createJourneyTracker(p).flush();
    expect(sent).toHaveLength(0);
  });

  it('diam saja kalau identitas belum tersedia', async () => {
    // SSR, storage diblokir, atau crypto.randomUUID tidak ada. Analitik tidak pernah
    // menjadi alasan sebuah halaman gagal.
    const { ports: p, sent } = ports({ identity: () => null });
    const tracker = createJourneyTracker(p);

    tracker.track('stock_analysis_view', 'technical');
    await tracker.flush();

    expect(sent).toHaveLength(0);
  });

  it('kegagalan pengiriman tidak melempar dan tidak menumpuk antrean selamanya', async () => {
    const send = vi.fn().mockRejectedValue(new Error('offline'));
    const { ports: p } = ports({ send });
    const tracker = createJourneyTracker(p);

    tracker.track('stock_analysis_view', 'technical');
    await expect(tracker.flush()).resolves.toBeUndefined();

    // Antrean dikosongkan SEBELUM pengiriman: menahannya untuk dicoba ulang akan membuat
    // browser yang sedang offline menumpuk event tanpa batas sampai tabnya ditutup.
    tracker.track('stock_evidence_view', 'technical');
    await tracker.flush();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0].events).toHaveLength(1);
  });

  it('tidak mengirim event yang sama dua kali kalau flush dipanggil beruntun', async () => {
    const { ports: p, sent } = ports();
    const tracker = createJourneyTracker(p);

    tracker.track('stock_analysis_view', 'technical');
    await Promise.all([tracker.flush(), tracker.flush()]);

    expect(sent).toHaveLength(1);
    expect(sent[0].events).toHaveLength(1);
  });
});
