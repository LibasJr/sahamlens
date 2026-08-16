import { cacheGet, cacheSet } from '../../../shared/cache/redis-cache';
import { getOwnershipFlowConfig } from '../config/ownership-flow.config';
import {
  getLatestObservationsFor,
  listOwnershipHistory,
  type OwnershipHistoryRow,
} from '../repository/ownership-flow-history.repository';
import { normalizeOwnershipTicker } from '../parser/ownership-row.parser';
import {
  assessFreshness,
  classifyOwnershipTrend,
} from '../scoring/ownership-flow-classification';
import { getPrimarySource } from '../source/source-registry';
import type {
  OwnershipDeltaSet,
  OwnershipFlowView,
} from '../types/ownership-flow.types';
import { computeDeltaSet, type ObservationPoint } from './ownership-delta';

// SISI BACA OWNERSHIP FLOW.
//
// ALUR YANG BENAR (§39): cron -> database -> cache -> API -> frontend.
// TIDAK PERNAH: pengguna membuka BBRI -> server menembak KSEI langsung. Selain
// membebani sumber dengan trafik sebanyak pengunjung kita, itu juga membuat
// angka yang tampil bergantung pada apakah server sumber sedang sehat.
//
// PostgreSQL adalah SATU-SATUNYA sumber kebenaran. Redis hanya meredam beban
// baca (§29).

/** Versi kunci cache. Bump kalau BENTUK payload atau cara delta dihitung berubah. */
const CACHE_VERSION = 'v1';

function cacheKey(ticker: string): string {
  return `sahamlens:cache:ownership-flow:${CACHE_VERSION}:ticker:${ticker}`;
}

/**
 * Bagian payload yang berasal dari DATABASE dan aman di-cache.
 *
 * Perhatikan yang TIDAK ada di sini: `freshness` dan `ageDays`. Keduanya
 * fungsi dari WAKTU SEKARANG, jadi kalau ikut di-cache selama 30 menit,
 * data yang menyeberangi ambang basi akan tetap tampil "FRESH" sampai cache
 * kedaluwarsa - persis larangan §29 ("TTL jangan membuat stale data terlihat
 * fresh"). Keduanya dihitung ulang setiap pembacaan, di luar cache.
 */
interface CachedOwnershipCore {
  ticker: string;
  observedDate: string | null;
  source: string | null;
  sourceUrl: string | null;
  fetchedAt: string | null;
  foreignPct: number | null;
  localPct: number | null;
  scriplessPct: number | null;
  totalSecurities: number | null;
  delta: OwnershipDeltaSet;
  historyCount: number;
}

const EMPTY_DELTA_SET: OwnershipDeltaSet = {
  d1: { pp: null, basisObservedDate: null, actualGapDays: null },
  d7: { pp: null, basisObservedDate: null, actualGapDays: null },
  d30: { pp: null, basisObservedDate: null, actualGapDays: null },
};

function toPoints(rows: OwnershipHistoryRow[]): ObservationPoint[] {
  return rows.map((row) => ({ observedDate: row.observedDate, foreignPct: row.foreignPct }));
}

async function buildCore(ticker: string): Promise<CachedOwnershipCore> {
  // 400 observasi terakhir sudah lebih dari cukup untuk horizon 30 hari, bahkan
  // bila cadence sumber ternyata harian. Menarik seluruh tabel tidak menambah
  // ketelitian apa pun.
  const history = await listOwnershipHistory(ticker, 400);
  if (history.length === 0) {
    return {
      ticker,
      observedDate: null,
      source: null,
      sourceUrl: null,
      fetchedAt: null,
      foreignPct: null,
      localPct: null,
      scriplessPct: null,
      totalSecurities: null,
      delta: EMPTY_DELTA_SET,
      historyCount: 0,
    };
  }

  const latest = history[history.length - 1];
  return {
    ticker,
    observedDate: latest.observedDate,
    source: latest.source,
    sourceUrl: latest.sourceUrl,
    fetchedAt: latest.fetchedAt,
    foreignPct: latest.foreignPct,
    localPct: latest.localPct,
    scriplessPct: latest.scriplessPct,
    totalSecurities: latest.totalSecurities,
    delta: computeDeltaSet(toPoints(history)),
    historyCount: history.length,
  };
}

/**
 * Payload Ownership Flow satu ticker.
 *
 * Mengembalikan objek yang SELALU terisi bentuknya, bahkan ketika belum ada
 * satu pun observasi - dengan observedDate null, freshness MISSING, dan trend
 * INSUFFICIENT_DATA. Itu jawaban yang jujur untuk "belum ada data", dan jauh
 * lebih baik daripada 0% yang terlihat seperti pengukuran.
 */
export async function getOwnershipFlowView(
  rawTicker: string,
  options: { now?: Date; skipCache?: boolean } = {}
): Promise<OwnershipFlowView | null> {
  const ticker = normalizeOwnershipTicker(rawTicker);
  if (!ticker) return null;

  const config = getOwnershipFlowConfig();
  const key = cacheKey(ticker);

  let core: CachedOwnershipCore | null = null;
  if (!options.skipCache) {
    core = await cacheGet<CachedOwnershipCore>(key);
  }
  if (!core) {
    core = await buildCore(ticker);
    // Cache-miss saat Redis mati sudah ditangani cacheSet (degrade diam-diam),
    // jadi modul tetap jalan tanpa Redis - hanya lebih sering menyentuh DB.
    await cacheSet(key, core, config.cacheTtlSec);
  }

  return decorate(core, options.now);
}

/** Tambahkan bagian yang bergantung waktu-sekarang. Selalu di luar cache. */
function decorate(core: CachedOwnershipCore, now?: Date): OwnershipFlowView {
  const source = getPrimarySource();
  const { freshness, ageDays } = assessFreshness(core.observedDate, source.cadence, now ?? new Date());
  const classification = classifyOwnershipTrend(core.delta);

  return {
    ticker: core.ticker,
    observedDate: core.observedDate,
    source: core.source,
    sourceUrl: core.sourceUrl,
    fetchedAt: core.fetchedAt,
    foreignPct: core.foreignPct,
    localPct: core.localPct,
    scriplessPct: core.scriplessPct,
    totalSecurities: core.totalSecurities,
    delta: core.delta,
    trend: core.observedDate === null ? 'INSUFFICIENT_DATA' : classification.trend,
    trendReason:
      core.observedDate === null
        ? 'Belum ada observasi kepemilikan yang tersimpan untuk emiten ini.'
        : classification.reason,
    freshness,
    ageDays,
    cadence: source.cadence,
    // Dua nilai ini KONSTAN pada fase sekarang, dan sengaja ikut di payload agar
    // setiap konsumen (UI, LensAI, klien pihak ketiga) melihat statusnya tanpa
    // harus tahu konvensi internal kita.
    experimental: true,
    inFinalScore: false,
    historyCount: core.historyCount,
  };
}

export interface OwnershipFlowListRow {
  ticker: string;
  observedDate: string | null;
  foreignPct: number | null;
  localPct: number | null;
  delta: OwnershipDeltaSet;
  trend: OwnershipFlowView['trend'];
  freshness: OwnershipFlowView['freshness'];
  ageDays: number | null;
}

/**
 * Daftar untuk halaman utama Ownership Flow.
 *
 * Observasi TERBARU seluruh ticker diambil satu query (DISTINCT ON), lalu
 * histori per ticker hanya diambil untuk yang benar-benar punya data - emiten
 * tanpa observasi tidak perlu round-trip kedua.
 */
export async function getOwnershipFlowList(tickers: string[]): Promise<OwnershipFlowListRow[]> {
  const normalized = Array.from(
    new Set(tickers.map(normalizeOwnershipTicker).filter((t): t is string => t !== null))
  );
  if (normalized.length === 0) return [];

  const latest = await getLatestObservationsFor(normalized);
  const source = getPrimarySource();
  const now = new Date();

  const rows = await Promise.all(
    normalized.map(async (ticker): Promise<OwnershipFlowListRow> => {
      const observation = latest.get(ticker);
      if (!observation) {
        return {
          ticker,
          observedDate: null,
          foreignPct: null,
          localPct: null,
          delta: EMPTY_DELTA_SET,
          trend: 'INSUFFICIENT_DATA',
          freshness: 'MISSING',
          ageDays: null,
        };
      }
      const history = await listOwnershipHistory(ticker, 400);
      const delta = computeDeltaSet(toPoints(history));
      const { freshness, ageDays } = assessFreshness(observation.observedDate, source.cadence, now);
      return {
        ticker,
        observedDate: observation.observedDate,
        foreignPct: observation.foreignPct,
        localPct: observation.localPct,
        delta,
        trend: classifyOwnershipTrend(delta).trend,
        freshness,
        ageDays,
      };
    })
  );

  return rows;
}

export interface OwnershipSeriesPoint {
  observedDate: string;
  foreignPct: number | null;
  localPct: number | null;
}

/**
 * Deret waktu untuk chart.
 *
 * Titik dikembalikan APA ADANYA pada observed_date masing-masing. TIDAK ADA
 * interpolasi dan tidak ada forward-fill: garis yang menyambung dua observasi
 * berjarak sebulan harus terlihat sebagai dua observasi, bukan sebagai 30 hari
 * pengukuran yang tidak pernah dilakukan (§22).
 */
export async function getOwnershipSeries(
  rawTicker: string,
  limit = 400
): Promise<OwnershipSeriesPoint[]> {
  const ticker = normalizeOwnershipTicker(rawTicker);
  if (!ticker) return [];
  const history = await listOwnershipHistory(ticker, limit);
  return history.map((row) => ({
    observedDate: row.observedDate,
    foreignPct: row.foreignPct,
    localPct: row.localPct,
  }));
}
