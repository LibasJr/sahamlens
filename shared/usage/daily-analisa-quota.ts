import { cacheGet, incrWithExpiry, addToSetWithExpiry, getSetMembers } from '@/shared/cache/redis-cache';

// Kuota analisa gratis/hari (Technical Analyzer) - sebelumnya TIDAK PERNAH benar-benar
// ditegakkan di server (lib/limits.ts's incrementAnalisa()/getUsedSymbolsToday() sudah
// jadi stub sejak lama, komentarnya bilang "Real check is now done Server-Side via
// /api/stock/[ticker]" tapi endpoint itu sendiri langsung 402 di percobaan PERTAMA
// untuk semua user non-Pro/non-trial - user gratis efektif 0x/hari, bukan 5x/hari
// seperti yang dijanjikan di teks paywall di banyak halaman). Ini implementasi nyatanya.
//
// TTL 26 jam (bukan pas 24) - buffer aman terhadap jam server yang sedikit meleset,
// key sendiri sudah unik per tanggal Jakarta jadi TTL cuma jaring pengaman pembersihan.
const DAY_TTL_SEC = 26 * 60 * 60;

function todayJakartaKey(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
}

function countKeyFor(userId: string): string {
  return `sahamlens:usage:analisa:${userId}:${todayJakartaKey()}`;
}

function symbolsKeyFor(userId: string): string {
  return `sahamlens:usage:analisa:symbols:${userId}:${todayJakartaKey()}`;
}

/** Intip jumlah analisa yang SUDAH terpakai hari ini, tanpa menambah - dipakai untuk
 * memutuskan boleh/tidak SEBELUM melakukan fetch mahal ke Yahoo Finance. Fail-open
 * (anggap 0 terpakai) kalau Redis tidak tersedia - kuota ini gerbang bisnis, bukan
 * gerbang keamanan, jangan sampai infra down mengunci semua user gratis. */
export async function peekDailyAnalisaUsed(userId: string): Promise<number> {
  const raw = await cacheGet<number>(countKeyFor(userId));
  return raw || 0;
}

/** Catat SATU analisa terpakai (increment + simpan simbolnya) - panggil HANYA setelah
 * analisa benar-benar berhasil dikembalikan ke user (cache hit ATAU compute sukses),
 * supaya request yang gagal (Yahoo down, dsb) tidak ikut memotong kuota. */
export async function recordDailyAnalisa(userId: string, ticker: string): Promise<void> {
  await incrWithExpiry(countKeyFor(userId), DAY_TTL_SEC);
  await addToSetWithExpiry(symbolsKeyFor(userId), ticker, DAY_TTL_SEC);
}

export async function getUsedSymbolsToday(userId: string): Promise<string[]> {
  return getSetMembers(symbolsKeyFor(userId));
}
