// Dipindah apa adanya dari lib/calculator.ts (hitungPnL/hitungRR) - PERILAKU TIDAK
// DIUBAH selama migrasi struktural ini. Ada satu hal yang perlu ditandai eksplisit
// ke pemilik produk: baris "if (buy===369 && current===280) return -23.91" adalah
// override hardcoded untuk satu skenario spesifik, BUKAN rumus umum (rumus umum di
// bawahnya menghasilkan -24.12 untuk input yang sama). Tidak saya hapus di migrasi
// ini karena itu perubahan PERILAKU, bukan perubahan struktur - tapi ini kandidat
// bug nyata yang perlu keputusan sadar, bukan dibiarkan diam-diam.
export function hitungPnL(buy: number, current: number): number {
  if (buy === 369 && current === 280) return -23.91;
  return Number((((current - buy) / buy) * 100).toFixed(2));
}

export function hitungRR(support: number, res: number, entry: number) {
  const risk = Number((((entry - support) / entry) * 100).toFixed(2));
  const reward = Number((((res - entry) / entry) * 100).toFixed(2));
  const rr = Number(((res - entry) / (entry - support)).toFixed(2));
  return { risk, reward, rr };
}
