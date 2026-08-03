import { cacheGet, cacheSet } from './redis-cache';
import type { FundamentalInput } from '../../modules/technical';
import type { ScoredStock } from '../../modules/recommendation/service/ai-pick.service';

// TTL fundamental 24 jam, terpisah dari skor yang 5 menit: PER/PBV/ROE/DER berubah per
// kuartal mengikuti laporan keuangan. Menyegarkannya tiap 5 menit hanya membakar ~109
// request quoteSummary tanpa mengubah angka apa pun.
const FUNDAMENTAL_KEY = 'sahamlens:cache:computed:fundamental-snapshot';
const FUNDAMENTAL_TTL_SEC = 24 * 60 * 60;

const SCORES_KEY = 'sahamlens:cache:computed:ai-pick-scores';
// BUG FIX (audit integritas data 2026-08-03): sebelumnya 15 menit (3x interval cron) -
// cron ai-pick-scan cuma jalan jam bursa (09:00-16:00 WIB), jadi begitu bursa tutup
// cache ini expired dalam belasan menit dan /api/ai-pick balik "ready: false, items: []"
// SAMPAI bursa buka lagi - halaman "Live AI Pick" tampil kosong total tiap sore/malam/
// akhir pekan. Diperpanjang ke 3 hari (cukup untuk gap Jumat sore -> Senin pagi) -
// cron tetap menyegarkan tiap 5 menit selama jam bursa, TTL panjang ini cuma jadi
// lantai "data sesi terakhir" di luar jam bursa (route menandai stale dari `computedAt`).
const SCORES_TTL_SEC = 3 * 24 * 60 * 60;

export type FundamentalSnapshot = Record<string, FundamentalInput>;

export type AiPickScores = {
  computedAt: string;
  scores: ScoredStock[];
  /** Saham dengan tren teknikal BEARISH - dipakai menandai baris merah, bukan menyaring. */
  bearishSymbols: string[];
};

export async function readFundamentalSnapshot(): Promise<FundamentalSnapshot | null> {
  return cacheGet<FundamentalSnapshot>(FUNDAMENTAL_KEY);
}

export async function writeFundamentalSnapshot(snap: FundamentalSnapshot): Promise<void> {
  await cacheSet(FUNDAMENTAL_KEY, snap, FUNDAMENTAL_TTL_SEC);
}

export async function readAiPickScores(): Promise<AiPickScores | null> {
  return cacheGet<AiPickScores>(SCORES_KEY);
}

export async function writeAiPickScores(data: AiPickScores): Promise<void> {
  await cacheSet(SCORES_KEY, data, SCORES_TTL_SEC);
}
