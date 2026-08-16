import { logger } from '../../../shared/logger/logger';
import { AI_PICK_UNIVERSE } from '../../market/constants/ai-pick-universe';
import { getOwnershipFlowConfig } from '../config/ownership-flow.config';
import { parseKseiRegisteredSecurityHtml } from '../parser/ksei-registered-security.parser';
import { normalizeOwnershipTicker, parseOwnershipRow } from '../parser/ownership-row.parser';
import { recordOwnershipObservationsSafe } from '../repository/ownership-flow-history.repository';
import {
  canIngest,
  getPrimarySource,
  type IngestionGate,
  type OwnershipSourceDescriptor,
} from '../source/source-registry';
import type { OwnershipObservation } from '../types/ownership-flow.types';
import {
  fetchOwnershipPage,
  logFetchOutcome,
  mapWithConcurrency,
  type FetchOptions,
} from './ownership-fetcher.service';

// ORKESTRASI INGESTION: universe -> fetch -> parse -> validate -> persist.
//
// Tiap tahap dipisah supaya bisa diuji sendiri-sendiri dan supaya kegagalan
// dapat dilaporkan pada tahap yang tepat ("gagal ambil" berbeda maknanya dari
// "berhasil ambil tapi struktur halamannya tidak dikenali").
//
// KEGAGALAN SEBAGIAN BUKAN KEGAGALAN TOTAL (§27): satu ticker yang parser-nya
// gagal tidak boleh membatalkan 199 ticker lain. Tetapi job juga TIDAK BOLEH
// mengaku SUCCESS penuh - status PARTIAL_SUCCESS ada persis untuk keadaan itu.

export type IngestStatus = 'BLOCKED' | 'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILED' | 'NO_UNIVERSE';

export interface IngestFailure {
  ticker: string;
  /** Sandi mesin: HTTP_404, TIMEOUT, LABELS_MISSING, INCONSISTENT, ... */
  code: string;
  reason: string;
}

export interface IngestResult {
  status: IngestStatus;
  source: string;
  sourceAuditStatus: string;
  /** Alasan gerbang - terisi bermakna ketika status BLOCKED. */
  gate: { allowed: boolean; reason: string; message: string };
  universe: number;
  attempted: number;
  /** Ticker yang menghasilkan observasi VALID. */
  succeeded: number;
  /** Baris yang benar-benar BARU masuk database. */
  inserted: number;
  /** Sudah ada sebelumnya (idempotensi bekerja) = succeeded - inserted. */
  duplicates: number;
  failed: number;
  /** Tanggal observasi yang ditemui pada eksekusi ini - bukti PIT. */
  observedDates: string[];
  failures: IngestFailure[];
  persistError: string | null;
  durationMs: number;
  startedAt: string;
}

/**
 * Ticker universe kanonik SahamLens.
 *
 * SENGAJA memakai AI_PICK_UNIVERSE yang sudah ada, bukan daftar baru hardcoded
 * (§26). Satu universe berarti Ownership Flow selalu bicara tentang emiten yang
 * sama dengan LensRadar/AI Pick; daftar kedua akan berarti dua definisi
 * "cakupan SahamLens" yang perlahan berbeda.
 */
export function getOwnershipUniverse(limit = 0): string[] {
  const universe = AI_PICK_UNIVERSE.map((t) => normalizeOwnershipTicker(t)).filter(
    (t): t is string => t !== null
  );
  // Set: universe kanonik bisa saja memuat duplikat setelah normalisasi.
  const unique = Array.from(new Set(universe));
  return limit > 0 ? unique.slice(0, limit) : unique;
}

/** Kode pendek tanpa sufiks - bentuk yang dipakai URL sumber. */
export function toShortCode(ticker: string): string {
  return ticker.replace(/\.JK$/, '');
}

export function buildSourceUrl(source: OwnershipSourceDescriptor, ticker: string): string {
  const shortCode = encodeURIComponent(toShortCode(ticker));
  return `${source.baseUrl}/${shortCode}?setLocale=id-ID`;
}

export interface IngestOptions {
  /** Batasi universe (uji coba/manual run). */
  limit?: number;
  /** Ticker eksplisit - melewati universe kanonik. Dipakai audit/manual. */
  tickers?: string[];
  fetchOptions?: Partial<FetchOptions>;
  /** Disuntik pada test. */
  now?: () => Date;
}

/**
 * Jalankan satu siklus ingestion.
 *
 * GERBANG DIPERIKSA PALING AWAL, sebelum satu pun request keluar. Kalau sumber
 * belum terverifikasi, job berhenti di sini dengan status BLOCKED - tidak ada
 * trafik ke server sumber, tidak ada baris ditulis. Ini bentuk konkret
 * fail-closed: bukan sekadar tidak menyimpan hasil, tapi tidak mengambilnya
 * sama sekali.
 */
export async function runOwnershipFlowIngestion(
  options: IngestOptions = {}
): Promise<IngestResult> {
  const config = getOwnershipFlowConfig();
  const source = getPrimarySource();
  const gate = canIngest(source, config);
  const now = options.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const t0 = Date.now();

  const base = {
    source: source.id,
    sourceAuditStatus: source.auditStatus,
    gate: { allowed: gate.allowed, reason: gate.reason, message: gate.message },
    startedAt,
  };

  if (!gate.allowed) {
    logger.warn('Ownership Flow ingestion ditolak gerbang', {
      module: 'ownership-flow',
      job: 'ownership-flow-scan',
      source: source.id,
      errorCode: gate.reason,
    });
    return {
      ...base,
      status: 'BLOCKED',
      universe: 0,
      attempted: 0,
      succeeded: 0,
      inserted: 0,
      duplicates: 0,
      failed: 0,
      observedDates: [],
      failures: [],
      persistError: null,
      durationMs: Date.now() - t0,
    };
  }

  const universe = options.tickers?.length
    ? options.tickers.map(normalizeOwnershipTicker).filter((t): t is string => t !== null)
    : getOwnershipUniverse(options.limit ?? config.universeLimit);

  if (universe.length === 0) {
    return {
      ...base,
      status: 'NO_UNIVERSE',
      universe: 0,
      attempted: 0,
      succeeded: 0,
      inserted: 0,
      duplicates: 0,
      failed: 0,
      observedDates: [],
      failures: [],
      persistError: null,
      durationMs: Date.now() - t0,
    };
  }

  const observations: OwnershipObservation[] = [];
  const failures: IngestFailure[] = [];

  await mapWithConcurrency(
    universe,
    config.maxConcurrency,
    async (ticker) => {
      const outcome = await ingestOneTicker(ticker, source, config, options, now);
      if (outcome.observation) observations.push(outcome.observation);
      if (outcome.failure) failures.push(outcome.failure);
    },
    {
      minDelayMs: config.minDelayMs,
      onError: (ticker, err) => {
        // Jaring pengaman: apa pun yang lolos dari try/catch di dalam tetap jadi
        // satu baris kegagalan, bukan pengecualian yang menjatuhkan job.
        failures.push({
          ticker,
          code: 'UNEXPECTED',
          reason: err instanceof Error ? err.message : String(err),
        });
      },
    }
  );

  const persisted = await recordOwnershipObservationsSafe(observations);

  const observedDates = Array.from(new Set(observations.map((o) => o.observedDate))).sort();
  const succeeded = observations.length;
  const failed = failures.length;

  // Status ditentukan dari kenyataan, bukan dari optimisme:
  // ada yang gagal + ada yang berhasil  -> PARTIAL_SUCCESS
  // semua gagal                          -> FAILED
  // gagal menulis ke DB                  -> FAILED (data tidak sampai tujuan)
  let status: IngestStatus;
  if (persisted.error) status = 'FAILED';
  else if (succeeded === 0) status = 'FAILED';
  else if (failed > 0) status = 'PARTIAL_SUCCESS';
  else status = 'SUCCESS';

  const result: IngestResult = {
    ...base,
    status,
    universe: universe.length,
    attempted: universe.length,
    succeeded,
    inserted: persisted.inserted,
    duplicates: Math.max(0, succeeded - persisted.inserted),
    failed,
    observedDates,
    // Batasi daftar kegagalan yang ikut ke log/response supaya tidak membengkak;
    // JUMLAHNYA tetap dilaporkan penuh lewat `failed`, jadi kegagalan tidak
    // pernah tersembunyi - hanya detailnya yang dipangkas.
    failures: failures.slice(0, 50),
    persistError: persisted.error,
    durationMs: Date.now() - t0,
  };

  logger.info('Ownership Flow ingestion selesai', {
    module: 'ownership-flow',
    job: 'ownership-flow-scan',
    source: source.id,
    status,
    universe: result.universe,
    succeeded,
    failed,
    inserted: result.inserted,
    observedDate: observedDates[observedDates.length - 1] ?? null,
    durationMs: result.durationMs,
  });

  return result;
}

interface TickerOutcome {
  observation: OwnershipObservation | null;
  failure: IngestFailure | null;
}

/** Satu ticker: fetch -> ekstrak -> validasi. Tidak menyentuh database. */
async function ingestOneTicker(
  ticker: string,
  source: OwnershipSourceDescriptor,
  config: ReturnType<typeof getOwnershipFlowConfig>,
  options: IngestOptions,
  now: () => Date
): Promise<TickerOutcome> {
  const url = buildSourceUrl(source, ticker);
  const fetched = await fetchOwnershipPage(url, {
    timeoutMs: config.timeoutMs,
    ...options.fetchOptions,
  });
  logFetchOutcome('ownership-flow-scan', ticker, source.id, fetched);

  if (!fetched.ok || !fetched.body) {
    // Retry terbatas sudah habis di dalam fetchOwnershipPage. Di titik ini
    // ticker-nya ditandai SOURCE_ERROR dan cron LANJUT ke ticker berikutnya -
    // satu emiten yang servernya bermasalah tidak boleh menghentikan 199 lainnya
    // (§27). Sandi HTTP aslinya ikut dibawa supaya operator bisa membedakan
    // "kita terlalu cepat" (RATE_LIMITED) dari "server sumber sakit"
    // (SERVER_ERROR) dari "URL-nya memang salah" (CLIENT_ERROR).
    return {
      observation: null,
      failure: {
        ticker,
        code: 'SOURCE_ERROR',
        reason: `${fetched.errorCode ?? 'FETCH_FAILED'}: ${fetched.error ?? 'Gagal mengambil halaman sumber'} (setelah ${fetched.attempts} percobaan)`,
      },
    };
  }

  const extracted = parseKseiRegisteredSecurityHtml(fetched.body, toShortCode(ticker));
  if (!extracted.ok) {
    return {
      observation: null,
      failure: { ticker, code: extracted.code, reason: extracted.reason },
    };
  }

  // fetchedAt = waktu SERVER KITA mengambil. observedDate datang dari halaman
  // ("As of ...") dan diproses parseOwnershipRow. Keduanya tidak pernah
  // dipertukarkan - itu inti §6.
  const parsed = parseOwnershipRow(extracted.raw, {
    source: source.id,
    sourceUrl: fetched.finalUrl ?? url,
    fetchedAt: now().toISOString(),
  });

  if (!parsed.ok) {
    return {
      observation: null,
      failure: { ticker, code: parsed.rejected.quality, reason: parsed.rejected.reason },
    };
  }

  return { observation: parsed.observation, failure: null };
}
