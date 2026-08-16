import { createHash } from 'node:crypto';
import { cacheGet, cacheSet, getOrCompute } from '../../../shared/cache/redis-cache';
import { getOwnershipFlowConfig } from '../config/ownership-flow.config';
import {
  getOwnershipHistoryForTickers,
  listOwnershipHistory,
  type OwnershipHistoryRow,
} from '../repository/ownership-flow-history.repository';
import { normalizeOwnershipTicker } from '../parser/ownership-row.parser';
import {
  assessFreshness,
  classifyOwnershipTrend,
} from '../scoring/ownership-flow-classification';
import { getPrimarySource, getSourceById } from '../source/source-registry';
import type {
  OwnershipDeltaSet,
  OwnershipFlowView,
  OwnershipPeriodChange,
} from '../types/ownership-flow.types';
import { computeDeltaSet, computePreviousPeriodChange, type ObservationPoint } from './ownership-delta';

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
const CACHE_VERSION = 'v4';

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
  previous: OwnershipPeriodChange;
  historyCount: number;
}

const EMPTY_DELTA_SET: OwnershipDeltaSet = {
  d1: { pp: null, basisObservedDate: null, actualGapDays: null, structuralBreak: false, structuralBreakReason: null },
  d7: { pp: null, basisObservedDate: null, actualGapDays: null, structuralBreak: false, structuralBreakReason: null },
  d30: { pp: null, basisObservedDate: null, actualGapDays: null, structuralBreak: false, structuralBreakReason: null },
};

const EMPTY_PREVIOUS: OwnershipPeriodChange = {
  basisObservedDate: null,
  actualGapDays: null,
  foreignPp: null,
  localPp: null,
  scriplessPp: null,
  structuralBreak: false,
  structuralBreakReason: null,
  basisTotalSecurities: null,
  currentTotalSecurities: null,
};

function toPoints(rows: OwnershipHistoryRow[]): ObservationPoint[] {
  return rows.map((row) => ({
    observedDate: row.observedDate,
    foreignPct: row.foreignPct,
    localPct: row.localPct,
    scriplessPct: row.scriplessPct,
    totalSecurities: row.totalSecurities,
  }));
}

function sameSourceHistory(rows: OwnershipHistoryRow[]): OwnershipHistoryRow[] {
  if (rows.length === 0) return rows;
  const latestSource = rows[rows.length - 1].source;
  return rows.filter((row) => row.source === latestSource);
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
      previous: EMPTY_PREVIOUS,
      historyCount: 0,
    };
  }

  const latest = history[history.length - 1];
  const comparableHistory = sameSourceHistory(history);
  const points = toPoints(comparableHistory);
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
    delta: computeDeltaSet(points),
    previous: computePreviousPeriodChange(points),
    historyCount: comparableHistory.length,
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
  const source = (core.source ? getSourceById(core.source) : null) ?? getPrimarySource();
  const { freshness, ageDays } = assessFreshness(core.observedDate, source.cadence, now ?? new Date());
  const classification = classifyOwnershipTrend(core.delta);
  const structuralBreak = core.previous.structuralBreak;

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
    previous: core.previous,
    trend: core.observedDate === null || structuralBreak ? 'INSUFFICIENT_DATA' : classification.trend,
    trendReason:
      core.observedDate === null
        ? 'Belum ada observasi kepemilikan yang tersimpan untuk emiten ini.'
        : structuralBreak
          ? 'Perubahan antar-snapshot tidak dihitung karena jumlah efek (Sec. Num) berubah. Ini diperlakukan sebagai structural break/corporate-action guard, bukan foreign flow.'
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
  source: string | null;
  delta: OwnershipDeltaSet;
  previous: OwnershipPeriodChange;
  trend: OwnershipFlowView['trend'];
  freshness: OwnershipFlowView['freshness'];
  ageDays: number | null;
}

/**
 * Bentuk daftar yang aman di-cache.
 *
 * freshness/ageDays sengaja TIDAK ikut cache karena keduanya bergantung pada
 * waktu sekarang. Dengan begitu cache 30 menit tidak pernah membuat snapshot
 * basi terlihat masih fresh.
 */
type CachedOwnershipListRow = Omit<OwnershipFlowListRow, 'freshness' | 'ageDays'>;

function listCacheKey(tickers: string[]): string {
  // Universe SahamLens bisa berubah walaupun jumlah emitennya sama. Hash isi
  // ticker mencegah payload universe lama dipakai untuk universe baru.
  const signature = createHash('sha1').update(tickers.join(',')).digest('hex').slice(0, 16);
  return `sahamlens:cache:ownership-flow:v4:list:${signature}`;
}

function emptyListCore(ticker: string): CachedOwnershipListRow {
  return {
    ticker,
    observedDate: null,
    foreignPct: null,
    localPct: null,
    source: null,
    delta: EMPTY_DELTA_SET,
    previous: EMPTY_PREVIOUS,
    trend: 'INSUFFICIENT_DATA',
  };
}

/**
 * Bangun seluruh tabel Ownership Flow dari SATU bulk query.
 *
 * Implementasi lama melakukan satu query latest + satu query histori PER ticker.
 * Dengan ~1000 ticker itu bisa menjadi ~1001 round-trip PostgreSQL/Neon pada
 * cache dingin. Di sini seluruh histori terbatas per ticker diambil sekaligus,
 * lalu dikelompokkan di memory Node.
 */
async function buildOwnershipFlowListCore(
  normalized: string[]
): Promise<CachedOwnershipListRow[]> {
  const historyByTicker = await getOwnershipHistoryForTickers(normalized, 400);

  return normalized.map((ticker): CachedOwnershipListRow => {
    const history = historyByTicker.get(ticker) ?? [];
    if (history.length === 0) return emptyListCore(ticker);

    const latest = history[history.length - 1];
    const comparableHistory = history.filter((row) => row.source === latest.source);
    const points = toPoints(comparableHistory);
    const delta = computeDeltaSet(points);
    const previous = computePreviousPeriodChange(points);

    return {
      ticker,
      observedDate: latest.observedDate,
      foreignPct: latest.foreignPct,
      localPct: latest.localPct,
      source: latest.source,
      delta,
      previous,
      trend: previous.structuralBreak ? 'INSUFFICIENT_DATA' : classifyOwnershipTrend(delta).trend,
    };
  });
}

function decorateOwnershipFlowList(
  rows: CachedOwnershipListRow[],
  now: Date
): OwnershipFlowListRow[] {
  return rows.map((row): OwnershipFlowListRow => {
    if (row.observedDate === null) {
      return {
        ...row,
        freshness: 'MISSING',
        ageDays: null,
      };
    }

    const source = (row.source ? getSourceById(row.source) : null) ?? getPrimarySource();
    const { freshness, ageDays } = assessFreshness(row.observedDate, source.cadence, now);
    return {
      ...row,
      freshness,
      ageDays,
    };
  });
}

/**
 * Daftar untuk halaman utama Ownership Flow.
 *
 * Jalur cache dingin:
 *   1 bulk query PostgreSQL -> hitung delta di memory -> Redis.
 *
 * Jalur cache hangat:
 *   Redis -> hitung freshness dari observedDate -> API.
 *
 * Jadi pembukaan pertama tidak lagi memicu query histori satu-per-satu untuk
 * seluruh universe. getOrCompute juga memberi single-flight agar beberapa user
 * yang membuka halaman bersamaan tidak menyebabkan cache stampede.
 */
export async function getOwnershipFlowList(tickers: string[]): Promise<OwnershipFlowListRow[]> {
  const normalized = Array.from(
    new Set(tickers.map(normalizeOwnershipTicker).filter((t): t is string => t !== null))
  );
  if (normalized.length === 0) return [];

  const config = getOwnershipFlowConfig();
  const key = listCacheKey(normalized);
  const core = await getOrCompute<CachedOwnershipListRow[]>(
    key,
    config.cacheTtlSec,
    () => buildOwnershipFlowListCore(normalized)
  );

  return decorateOwnershipFlowList(core, new Date());
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
  if (history.length === 0) return [];
  const latestSource = history[history.length - 1].source;
  return history
    .filter((row) => row.source === latestSource)
    .map((row) => ({
      observedDate: row.observedDate,
      foreignPct: row.foreignPct,
      localPct: row.localPct,
    }));
}
