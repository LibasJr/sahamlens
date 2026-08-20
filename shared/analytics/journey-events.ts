/**
 * Kontrak event "perjalanan riset" - dipakai KLIEN dan SERVER dari satu berkas.
 *
 * Kalau daftar ini berdiri dua kali (satu di pengirim, satu di validator), yang terjadi
 * bukan galat melainkan diam: pengirim mulai mengirim nama yang ditolak validator, dan
 * metriknya berhenti terisi tanpa satu pun test merah. Karena itu keduanya membaca berkas
 * yang sama, dan daftarnya dikunci di shared/analytics/__tests__/journey-events.test.ts.
 *
 * Yang diukur berasal dari docs/design/CALM_INTELLIGENCE.md, bagian "Beta evaluation".
 * Tidak ada ticker, tidak ada user_id, tidak ada URL - pertanyaannya soal URUTAN, bukan
 * soal siapa atau saham apa.
 */

export const JOURNEY_EVENT_NAMES = [
  /** Event pertama sebuah kunjungan. Menjadi t0 untuk "waktu sampai tindakan berguna". */
  'session_start',
  /** Pengguna mengirim pencarian emiten dari header. */
  'stock_search_submit',
  /** Halaman analisis emiten terbuka - inilah "tindakan berguna pertama". */
  'stock_analysis_view',
  /** Pengguna menembus dari ringkasan ke buktinya (chart/indikator/analyzer). */
  'stock_evidence_view',
  /** Kandidat LensRadar dibuka. */
  'radar_candidate_open',
  /** Watchlist dibuka - dipakai untuk "pemakaian Watchlist berulang". */
  'watchlist_view',
  /** Pertanyaan dikirim ke LensAI. */
  'lensai_question_asked',
  /** Pertanyaan LensAI yang dikirim sambil ada emiten di konteks layar. */
  'lensai_question_with_stock_context',
  /** Referensi dukungan yang bisa disalin benar-benar sampai ke layar pengguna. */
  'support_request_id_shown',
] as const;

export type JourneyEventName = (typeof JOURNEY_EVENT_NAMES)[number];

/**
 * Permukaan tempat event terjadi. Daftar TERTUTUP.
 *
 * Migration 010 sengaja tidak memasang CHECK pada kolom ini supaya event baru tidak
 * menuntut migrasi produksi; konsekuensinya, daftar inilah satu-satunya yang menjaga
 * kardinalitasnya tetap kecil.
 */
export const JOURNEY_SURFACES = [
  'home',
  'technical',
  'dashboard',
  'fundamental',
  'breakout_radar',
  'market_pulse',
  'watchlist',
  'screener',
  'compare',
  'lensai',
  'other',
] as const;

export type JourneySurface = (typeof JOURNEY_SURFACES)[number];

/** Satu request membawa banyak event; batas ini yang membuat badan request terbatas. */
export const MAX_JOURNEY_BATCH = 20;

const EVENT_NAME_SET: ReadonlySet<string> = new Set(JOURNEY_EVENT_NAMES);
const SURFACE_SET: ReadonlySet<string> = new Set(JOURNEY_SURFACES);
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isJourneyEventName(value: unknown): value is JourneyEventName {
  return typeof value === 'string' && EVENT_NAME_SET.has(value);
}

export function isJourneySurface(value: unknown): value is JourneySurface {
  return typeof value === 'string' && SURFACE_SET.has(value);
}

export interface JourneyEventInput {
  name: JourneyEventName;
  surface: JourneySurface;
  /** Jarak dari event pertama sesi, milidetik, diukur di klien. */
  elapsedMs: number;
}

export interface JourneyBatch {
  visitorId: string;
  sessionId: string;
  events: JourneyEventInput[];
}

/**
 * Kiriman yang sah, atau null.
 *
 * SELURUH kiriman ditolak begitu satu event tidak sah - bukan disaring. Menyaring diam-diam
 * menghasilkan sesi berlubang, dan metrik yang menghitung urutan justru paling rusak oleh
 * lubang yang tidak terlihat: sesi tanpa `stock_analysis_view` tidak bisa dibedakan dari
 * sesi yang eventnya dibuang validator.
 */
export function parseJourneyBatch(payload: unknown): JourneyBatch | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const value = payload as { visitorId?: unknown; sessionId?: unknown; events?: unknown };

  if (typeof value.visitorId !== 'string' || !UUID_V4.test(value.visitorId)) return null;
  if (typeof value.sessionId !== 'string' || !UUID_V4.test(value.sessionId)) return null;
  if (!Array.isArray(value.events)) return null;
  if (value.events.length === 0 || value.events.length > MAX_JOURNEY_BATCH) return null;

  const events: JourneyEventInput[] = [];
  for (const raw of value.events) {
    if (typeof raw !== 'object' || raw === null) return null;
    const event = raw as { name?: unknown; surface?: unknown; elapsedMs?: unknown };
    if (!isJourneyEventName(event.name)) return null;
    if (!isJourneySurface(event.surface)) return null;
    if (typeof event.elapsedMs !== 'number' || !Number.isFinite(event.elapsedMs) || event.elapsedMs < 0) return null;
    // performance.now() pecahan, kolomnya INTEGER.
    events.push({ name: event.name, surface: event.surface, elapsedMs: Math.round(event.elapsedMs) });
  }

  return { visitorId: value.visitorId, sessionId: value.sessionId, events };
}
