// Override hardcoded untuk satu skenario spesifik (buy=369, current=280 -> -23.91)
// dihapus (audit bug 2026-08-01) - rumus umum di bawah menghasilkan -24.12 untuk
// input yang sama, angka yang benar secara matematis. Tidak dipanggil di jalur
// produksi manapun saat ini (trade.service.ts hitung P/L inline), tapi override ini
// adalah jebakan laten untuk fitur masa depan yang reuse utility ini.
export function hitungPnL(buy: number, current: number): number {
  return Number((((current - buy) / buy) * 100).toFixed(2));
}

export function hitungRR(support: number, res: number, entry: number) {
  const risk = Number((((entry - support) / entry) * 100).toFixed(2));
  const reward = Number((((res - entry) / entry) * 100).toFixed(2));
  const rr = Number(((res - entry) / (entry - support)).toFixed(2));
  return { risk, reward, rr };
}
