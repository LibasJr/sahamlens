import { describe, expect, it } from 'vitest';
import {
  JOURNEY_EVENT_NAMES,
  JOURNEY_SURFACES,
  isJourneyEventName,
  isJourneySurface,
  parseJourneyBatch,
  MAX_JOURNEY_BATCH,
} from '../journey-events';

const visitorId = '59c09c28-18e7-4d21-8898-75199fc17b0d';
const sessionId = '0f2a1d68-1c9f-4d3e-9a2b-77f0e6c4a1b2';

function batch(events: unknown[]): unknown {
  return { visitorId, sessionId, events };
}

describe('kontrak event perjalanan riset', () => {
  it('menamai setiap metrik beta yang disebut PRD', () => {
    // docs/design/CALM_INTELLIGENCE.md, bagian "Beta evaluation". Kalau salah satu event
    // ini hilang, metrik yang bersangkutan berhenti terukur TANPA ada yang gagal - jadi
    // daftarnya dikunci di sini, bukan sekadar dideklarasikan.
    expect([...JOURNEY_EVENT_NAMES].sort()).toEqual([
      'lensai_question_asked',
      'lensai_question_with_stock_context',
      'radar_candidate_open',
      'session_start',
      'stock_analysis_view',
      'stock_evidence_view',
      'stock_search_submit',
      'support_request_id_shown',
      'watchlist_view',
    ]);
  });

  it('membatasi permukaan ke daftar tertutup', () => {
    // Kardinalitas `surface` adalah satu-satunya hal yang bisa meledak di tabel ini,
    // karena tidak ada CHECK di DDL-nya (lihat migration 010). Daftar tertutup di sini
    // yang menggantikannya.
    expect(JOURNEY_SURFACES.length).toBeGreaterThan(5);
    expect(JOURNEY_SURFACES.every((surface) => /^[a-z][a-z0-9_]{1,31}$/.test(surface))).toBe(true);
    expect(isJourneySurface('technical')).toBe(true);
    expect(isJourneySurface('halaman-karangan')).toBe(false);
  });

  it('menolak nama event di luar daftar', () => {
    expect(isJourneyEventName('stock_analysis_view')).toBe(true);
    expect(isJourneyEventName('stock_tab_change')).toBe(false);
    expect(isJourneyEventName('')).toBe(false);
  });
});

describe('parseJourneyBatch', () => {
  it('menerima kiriman yang sah dan mengembalikannya ternormalisasi', () => {
    const parsed = parseJourneyBatch(batch([
      { name: 'session_start', surface: 'home', elapsedMs: 0 },
      { name: 'stock_analysis_view', surface: 'technical', elapsedMs: 8421 },
    ]));

    expect(parsed).toEqual({
      visitorId,
      sessionId,
      events: [
        { name: 'session_start', surface: 'home', elapsedMs: 0 },
        { name: 'stock_analysis_view', surface: 'technical', elapsedMs: 8421 },
      ],
    });
  });

  it('menolak seluruh kiriman kalau satu event tidak sah', () => {
    // Menyaring diam-diam akan menghasilkan sesi yang bolong tanpa ada yang tahu, dan
    // metrik urutan justru paling rusak oleh lubang yang tidak terlihat.
    expect(parseJourneyBatch(batch([
      { name: 'session_start', surface: 'home', elapsedMs: 0 },
      { name: 'apa_saja', surface: 'home', elapsedMs: 10 },
    ]))).toBeNull();
  });

  it.each([
    ['visitor bukan UUID v4', { visitorId: 'bukan-uuid', sessionId, events: [{ name: 'session_start', surface: 'home', elapsedMs: 0 }] }],
    ['session bukan UUID v4', { visitorId, sessionId: '123', events: [{ name: 'session_start', surface: 'home', elapsedMs: 0 }] }],
    ['tanpa event', { visitorId, sessionId, events: [] }],
    ['events bukan array', { visitorId, sessionId, events: 'session_start' }],
    ['elapsed negatif', batch([{ name: 'session_start', surface: 'home', elapsedMs: -1 }])],
    ['elapsed bukan angka', batch([{ name: 'session_start', surface: 'home', elapsedMs: '0' }])],
    ['elapsed tak hingga', batch([{ name: 'session_start', surface: 'home', elapsedMs: Number.POSITIVE_INFINITY }])],
    ['permukaan karangan', batch([{ name: 'session_start', surface: 'entah', elapsedMs: 0 }])],
    ['bukan objek', 'session_start'],
    ['null', null],
  ])('menolak %s', (_label, payload) => {
    expect(parseJourneyBatch(payload)).toBeNull();
  });

  it('menolak kiriman yang lebih panjang dari batas', () => {
    const satu = { name: 'stock_analysis_view', surface: 'technical', elapsedMs: 1 };
    expect(parseJourneyBatch(batch(Array(MAX_JOURNEY_BATCH).fill(satu)))).not.toBeNull();
    expect(parseJourneyBatch(batch(Array(MAX_JOURNEY_BATCH + 1).fill(satu)))).toBeNull();
  });

  it('membulatkan elapsed ke milidetik bulat', () => {
    // performance.now() mengembalikan pecahan; kolomnya INTEGER.
    const parsed = parseJourneyBatch(batch([{ name: 'session_start', surface: 'home', elapsedMs: 12.7 }]));
    expect(parsed?.events[0].elapsedMs).toBe(13);
  });
});
