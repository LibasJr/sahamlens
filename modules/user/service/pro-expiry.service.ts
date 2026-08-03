/** Menambah durasi langganan Pro.
 *
 * Kalau masa berlaku BELUM habis, ditambahkan dari tanggal berakhir supaya sisa hari
 * yang sudah dibayar tidak hangus - pengguna yang memperpanjang lebih awal tidak
 * dirugikan. Kalau sudah lewat atau belum pernah ada, dihitung dari sekarang.
 *
 * Catatan: setMonth() melimpah untuk tanggal yang tidak ada di bulan tujuan (31 Januari
 * + 1 bulan = 3 Maret). Perilaku baku JavaScript, memihak pengguna, terjadi beberapa kali
 * setahun - tidak perlu pustaka tanggal tambahan hanya untuk itu. */
export function extendProExpiry(current: string | null, months: number): string {
  const now = new Date();
  const base = current && new Date(current) > now ? new Date(current) : now;
  const next = new Date(base);
  next.setMonth(next.getMonth() + months);
  return next.toISOString();
}
