// BUG FIX (audit logika & algoritma 2026-08-05, temuan H-13): formatter di bawah
// SEBELUMNYA memakai `|| 0` sehingga data yang TIDAK TERSEDIA dirender sebagai angka
// nol yang terlihat seperti fakta ("P/E Ratio 0.00x", "Market Cap Rp 0.00 T",
// "ROE 0.00%"). Untuk data finansial, 0 bukan sinonim "tidak ada" - bank memang tidak
// mengirim debtToEquity ke Yahoo dan emiten rugi memang tidak punya trailingPE.
// Formatter di bawah menampilkan "N/A" apa adanya.
//
// Dipindah dari app/fundamental/page.tsx (2026-08-05) supaya bisa dipakai ulang oleh
// FundamentalExportCard (components/export/) tanpa duplikasi rule format.
export const fmtKali = (v: number | null | undefined): string =>
  typeof v === 'number' ? `${v.toFixed(2)}x` : 'N/A';

export const fmtPersen = (fraksi: number | null | undefined): string =>
  typeof fraksi === 'number' ? `${(fraksi * 100).toFixed(2)}%` : 'N/A';

export const fmtTriliun = (v: number | null | undefined): string =>
  typeof v === 'number' ? `Rp ${(v / 1e12).toFixed(2)} T` : 'N/A';
