/**
 * Helper murni untuk rute /api/cron/idx-ic-sync.
 *
 * Dipisah dari route.ts karena Next.js menolak ekspor tambahan di berkas rute
 * (hanya metode HTTP + config yang boleh diekspor) - dan helper murni lebih mudah diuji.
 */

/** Tanggal hari ini menurut kalender pasar (WIB), bukan UTC. */
export function jakartaTodayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * Pilih CSV terbaru dari daftar nama berkas. Nama mengikuti pola idx-ic-YYYY-MM-DD.csv,
 * jadi urutan nama = urutan waktu.
 */
export function pickNewestCsv(files: string[], todayIso: string): string | null {
  const candidates = files.filter((file) => /^idx-ic-\d{4}-\d{2}-\d{2}\.csv$/.test(file));
  if (!candidates.length) return null;
  const sameDay = candidates.find((file) => file === `idx-ic-${todayIso}.csv`);
  if (sameDay) return sameDay;
  return [...candidates].sort().reverse()[0];
}