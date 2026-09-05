import fs from 'fs';
import path from 'path';
import type { AraMarketBar } from './ara-observation-pipeline.service';

/**
 * Pemeriksaan silang harga EOD terhadap artefak RESMI Bursa.
 *
 * Kenapa ini ada: seluruh bar harga ARA berasal dari SATU sumber (Yahoo). Sumber
 * tunggal tidak bisa memeriksa dirinya sendiri - dua panggilan ke tempat yang sama
 * akan selalu setuju, termasuk ketika dua-duanya salah. Artefak
 * `data/foreign-flow/<TICKER>.json` ditulis scripts/sync-idx-foreign-flow.py dari
 * endpoint resmi IDX, sehingga ia saksi kedua yang benar-benar independen.
 *
 * BATAS YANG TIDAK BOLEH DIKABURKAN: artefak ini EOD (satu bar per hari). Ia bisa
 * membuktikan baseline harian yang dipakai scanner benar, tetapi TIDAK bisa
 * memverifikasi harga pada detik ARA tersentuh. Karena itu lolosnya pemeriksaan ini
 * menaikkan PRICE_CROSS_CHECK menjadi PARTIAL, tidak pernah READY.
 *
 * ZERO DUMMY: tidak menambal, tidak menginterpolasi. Artefak hilang, ticker tidak
 * dikenal, atau tanggal tidak beririsan => UNVERIFIED, bukan "lolos".
 */

export const IDX_EOD_CROSS_CHECK_SOURCE = 'IDX_OFFICIAL_API' as const;

/** Beda harga yang masih dianggap noise pembulatan antar sumber. */
export const EOD_CLOSE_TOLERANCE_PCT = 0.5;
/** Minimum hari beririsan sebelum hasilnya boleh dipercaya. */
export const MIN_OVERLAP_DAYS = 5;
/** Umur artefak maksimum sebelum dianggap basi (hari kalender). */
export const MAX_ARTIFACT_AGE_DAYS = 5;

export type EodCrossCheckVerdict =
  | 'MATCH'
  | 'MISMATCH'
  | 'UNVERIFIED_NO_ARTIFACT'
  | 'UNVERIFIED_INSUFFICIENT_OVERLAP'
  | 'UNVERIFIED_STALE_ARTIFACT';

export interface EodCrossCheckMismatch {
  date: string;
  primaryClose: number;
  officialClose: number;
  deviationPct: number;
}

export interface EodCrossCheckResult {
  ticker: string;
  verdict: EodCrossCheckVerdict;
  /** True HANYA jika ada bukti positif kecocokan. Ketidaktahuan != lolos. */
  verified: boolean;
  comparedDays: number;
  maxDeviationPct: number | null;
  mismatches: EodCrossCheckMismatch[];
  officialSource: typeof IDX_EOD_CROSS_CHECK_SOURCE | null;
  officialUpdatedAt: string | null;
  artifactAgeDays: number | null;
  detail: string;
}

export interface EodCrossCheckOptions {
  dataDir?: string;
  now?: Date;
}

const TICKER_PATTERN = /^[A-Z]{4}$/;

function defaultDataDir(): string {
  return path.join(process.cwd(), 'data', 'foreign-flow');
}

function normalizeTicker(raw: string): string | null {
  const ticker = String(raw || '').trim().toUpperCase().replace(/\.JK$/, '');
  return TICKER_PATTERN.test(ticker) ? ticker : null;
}

function isFinitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/** Tanggal kalender UTC dari sebuah bar; null kalau tidak bisa di-parse. */
function calendarDate(time: string): string | null {
  const ms = Date.parse(time);
  return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : null;
}

function unverified(
  ticker: string,
  verdict: EodCrossCheckVerdict,
  detail: string,
  extra: Partial<EodCrossCheckResult> = {},
): EodCrossCheckResult {
  return {
    ticker,
    verdict,
    verified: false,
    comparedDays: 0,
    maxDeviationPct: null,
    mismatches: [],
    officialSource: null,
    officialUpdatedAt: null,
    artifactAgeDays: null,
    detail,
    ...extra,
  };
}

/**
 * Membandingkan close harian sumber utama dengan artefak resmi IDX.
 * Tidak pernah melempar: kegagalan baca menjadi verdict UNVERIFIED yang eksplisit.
 */
export function crossCheckDailyClosesAgainstIdx(
  ticker: string,
  daily: readonly AraMarketBar[],
  options: EodCrossCheckOptions = {},
): EodCrossCheckResult {
  const normalized = normalizeTicker(ticker);
  if (!normalized) {
    return unverified(String(ticker), 'UNVERIFIED_NO_ARTIFACT',
      'Kode emiten tidak valid untuk artefak IDX (wajib 4 huruf).');
  }

  const file = path.join(options.dataDir ?? defaultDataDir(), `${normalized}.json`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return unverified(normalized, 'UNVERIFIED_NO_ARTIFACT',
      `Artefak resmi IDX tidak tersedia untuk ${normalized}; pemeriksaan silang tidak bisa dilakukan.`);
  }

  const artifact = parsed as { source?: unknown; updatedAt?: unknown; history?: unknown };
  if (artifact.source !== IDX_EOD_CROSS_CHECK_SOURCE || !Array.isArray(artifact.history)) {
    return unverified(normalized, 'UNVERIFIED_NO_ARTIFACT',
      `Artefak ${normalized} bukan keluaran ${IDX_EOD_CROSS_CHECK_SOURCE} yang dikenali.`);
  }

  const updatedAt = typeof artifact.updatedAt === 'string' ? artifact.updatedAt : null;
  const now = options.now ?? new Date();
  let artifactAgeDays: number | null = null;
  if (updatedAt) {
    const ms = Date.parse(updatedAt);
    if (Number.isFinite(ms)) artifactAgeDays = Math.floor((now.getTime() - ms) / 86_400_000);
  }

  if (artifactAgeDays !== null && artifactAgeDays > MAX_ARTIFACT_AGE_DAYS) {
    return unverified(normalized, 'UNVERIFIED_STALE_ARTIFACT',
      `Artefak IDX berumur ${artifactAgeDays} hari (maksimum ${MAX_ARTIFACT_AGE_DAYS}); terlalu basi untuk dijadikan pembanding.`,
      { officialSource: IDX_EOD_CROSS_CHECK_SOURCE, officialUpdatedAt: updatedAt, artifactAgeDays });
  }

  const official = new Map<string, number>();
  for (const row of artifact.history as Array<Record<string, unknown>>) {
    const date = typeof row?.date === 'string' ? row.date : null;
    const close = row?.close;
    if (date && isFinitePositive(close)) official.set(date, close);
  }

  const mismatches: EodCrossCheckMismatch[] = [];
  let comparedDays = 0;
  let maxDeviationPct = 0;

  for (const bar of daily) {
    const date = calendarDate(bar.time);
    if (!date) continue;
    const officialClose = official.get(date);
    if (officialClose === undefined || !isFinitePositive(bar.close)) continue;

    comparedDays += 1;
    const deviationPct = Math.abs(bar.close / officialClose - 1) * 100;
    if (deviationPct > maxDeviationPct) maxDeviationPct = deviationPct;
    if (deviationPct > EOD_CLOSE_TOLERANCE_PCT) {
      mismatches.push({
        date,
        primaryClose: bar.close,
        officialClose,
        deviationPct: Math.round(deviationPct * 1000) / 1000,
      });
    }
  }

  const base = {
    officialSource: IDX_EOD_CROSS_CHECK_SOURCE,
    officialUpdatedAt: updatedAt,
    artifactAgeDays,
  } as const;

  if (comparedDays < MIN_OVERLAP_DAYS) {
    return unverified(normalized, 'UNVERIFIED_INSUFFICIENT_OVERLAP',
      `Hanya ${comparedDays} hari beririsan dengan artefak IDX (minimum ${MIN_OVERLAP_DAYS}); belum cukup untuk menyimpulkan apa pun.`,
      { ...base, comparedDays });
  }

  const rounded = Math.round(maxDeviationPct * 1000) / 1000;

  if (mismatches.length > 0) {
    return {
      ticker: normalized,
      verdict: 'MISMATCH',
      verified: false,
      comparedDays,
      maxDeviationPct: rounded,
      mismatches,
      ...base,
      detail: `${mismatches.length} dari ${comparedDays} hari menyimpang lebih dari ${EOD_CLOSE_TOLERANCE_PCT}% terhadap penutupan resmi IDX; deviasi terbesar ${rounded}%.`,
    };
  }

  return {
    ticker: normalized,
    verdict: 'MATCH',
    verified: true,
    comparedDays,
    maxDeviationPct: rounded,
    mismatches: [],
    ...base,
    detail: `${comparedDays} hari cocok dengan penutupan resmi IDX dalam toleransi ${EOD_CLOSE_TOLERANCE_PCT}% (deviasi terbesar ${rounded}%). Berlaku untuk baseline harian saja, BUKAN verifikasi harga intraday saat ARA tersentuh.`,
  };
}
