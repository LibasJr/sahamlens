import { cacheGet, cacheSet } from './redis-cache';
import { CACHE_TTL_SEC } from './ttl-policy';
import type { FundamentalInput } from '../../modules/technical';
import type { ScoredStock } from '../../modules/recommendation/service/ai-pick.service';
import {
  ACTIVE_LIQUID_UNIVERSE_TARGET_SIZE,
  ACTIVE_LIQUID_UNIVERSE_VERSION,
  LEGACY_VALIDATED_UNIVERSE_SIZE,
  LEGACY_VALIDATED_UNIVERSE_VERSION,
} from '../../modules/market/constants/ai-pick-universe';

// TTL fundamental 24 jam, terpisah dari skor yang 5 menit: PER/PBV/ROE/DER berubah per
// kuartal mengikuti laporan keuangan. Menyegarkannya tiap 5 menit hanya membakar request
// quoteSummary tanpa mengubah angka apa pun.
const FUNDAMENTAL_KEY = `sahamlens:cache:computed:fundamental-snapshot:${ACTIVE_LIQUID_UNIVERSE_VERSION}`;
const FUNDAMENTAL_TTL_SEC = 24 * 60 * 60;

const SCORES_KEY = `sahamlens:cache:computed:ai-pick-scores:${ACTIVE_LIQUID_UNIVERSE_VERSION}`;
const LEGACY_SCORES_KEY = `sahamlens:cache:computed:ai-pick-scores:${LEGACY_VALIDATED_UNIVERSE_VERSION}`;
// Snapshot lintas-versi. Saat universe dinaikkan, key aktif memang berubah supaya skor
// lama tidak bercampur dengan model baru. Namun data sesi terakhir tetap berguna saat
// bursa tutup; key ini mencegah LensRadar kosong hanya karena perubahan versi/cache.
const LAST_SUCCESSFUL_SCORES_KEY = 'sahamlens:cache:computed:ai-pick-scores:last-successful';
// BUG FIX (audit integritas data 2026-08-03): sebelumnya 15 menit (3x interval cron) -
// cron ai-pick-scan cuma jalan jam bursa (09:00-16:00 WIB), jadi begitu bursa tutup
// cache ini expired dalam belasan menit dan /api/ai-pick balik "ready: false, items: []"
// SAMPAI bursa buka lagi - halaman "Live AI Pick" tampil kosong total tiap sore/malam/
// akhir pekan. Sempat diperpanjang ke 3 hari, lalu dinaikkan lagi ke 14 hari untuk
// mencakup akhir pekan panjang dan hari libur bursa beruntun. Cron tetap menyegarkan
// tiap 5 menit selama jam bursa; TTL panjang cuma menjadi lantai "data sesi terakhir"
// di luar jam bursa (route menandai stale dari `computedAt`). UI/API
// menghitung `stale` dari computedAt, sehingga snapshot lama SELALU ditandai "Data sesi
// terakhir", bukan pernah diklaim live.
const SCORES_TTL_SEC = CACHE_TTL_SEC.LENS_RADAR_SCORES;

export type FundamentalSnapshot = Record<string, FundamentalInput>;

export type AiPickScores = {
  computedAt: string;
  universeVersion?: string;
  universeSize?: number;
  scores: ScoredStock[];
  /** Saham dengan tren teknikal BEARISH - dipakai menandai baris merah, bukan menyaring. */
  bearishSymbols: string[];
};

/** Sumber snapshot dipertahankan agar panel admin bisa membedakan cache aktif dari
 * cadangan sesi terakhir. Endpoint publik tetap menerima bentuk AiPickScores biasa. */
export type AiPickScoresCacheSource = 'active' | 'last-successful' | 'legacy' | null;

export type AiPickScoresCacheRead = {
  data: AiPickScores | null;
  source: AiPickScoresCacheSource;
};

function normalizeCachedScores(
  data: AiPickScores | null,
  fallbackUniverse: { version: string; size: number },
): AiPickScores | null {
  if (!data || !Array.isArray(data.scores) || !Array.isArray(data.bearishSymbols)) return null;
  const computedAt = new Date(data.computedAt);
  if (!Number.isFinite(computedAt.getTime())) return null;
  return {
    ...data,
    universeVersion: data.universeVersion ?? fallbackUniverse.version,
    universeSize: data.universeSize ?? fallbackUniverse.size,
  };
}

export async function readFundamentalSnapshot(): Promise<FundamentalSnapshot | null> {
  return cacheGet<FundamentalSnapshot>(FUNDAMENTAL_KEY);
}

export async function writeFundamentalSnapshot(snap: FundamentalSnapshot): Promise<void> {
  await cacheSet(FUNDAMENTAL_KEY, snap, FUNDAMENTAL_TTL_SEC);
}

export async function inspectAiPickScoresCache(): Promise<AiPickScoresCacheRead> {
  const active = normalizeCachedScores(
    await cacheGet<AiPickScores>(SCORES_KEY),
    { version: ACTIVE_LIQUID_UNIVERSE_VERSION, size: ACTIVE_LIQUID_UNIVERSE_TARGET_SIZE },
  );
  if (active) return { data: active, source: 'active' };

  // Prioritaskan snapshot terakhir versi apa pun. Fallback legacy ada untuk transisi
  // pertama ke v2: snapshot lintas-versi belum ditulis oleh kode lama, tetapi Redis
  // masih mungkin menyimpan hasil v1 yang sah dari sesi bursa terakhir.
  const lastSuccessful = normalizeCachedScores(
    await cacheGet<AiPickScores>(LAST_SUCCESSFUL_SCORES_KEY),
    { version: ACTIVE_LIQUID_UNIVERSE_VERSION, size: ACTIVE_LIQUID_UNIVERSE_TARGET_SIZE },
  );
  if (lastSuccessful) return { data: lastSuccessful, source: 'last-successful' };

  const legacy = normalizeCachedScores(
    await cacheGet<AiPickScores>(LEGACY_SCORES_KEY),
    { version: LEGACY_VALIDATED_UNIVERSE_VERSION, size: LEGACY_VALIDATED_UNIVERSE_SIZE },
  );
  return { data: legacy, source: legacy ? 'legacy' : null };
}

export async function readAiPickScores(): Promise<AiPickScores | null> {
  return (await inspectAiPickScoresCache()).data;
}

export async function writeAiPickScores(data: AiPickScores): Promise<void> {
  const payload: AiPickScores = {
    ...data,
    universeVersion: ACTIVE_LIQUID_UNIVERSE_VERSION,
    universeSize: ACTIVE_LIQUID_UNIVERSE_TARGET_SIZE,
  };
  await Promise.all([
    cacheSet(SCORES_KEY, payload, SCORES_TTL_SEC),
    cacheSet(LAST_SUCCESSFUL_SCORES_KEY, payload, SCORES_TTL_SEC),
  ]);
}
