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

// BUG FIX (audit kuantitatif 2026-08-19, temuan H-01): DER dari provider berbasis PERSEN
// (47.2 = 0,47x). Konvensi itu dipatuhi lima pemanggil - screener.service.ts:209,
// recommendation.service.ts:274, api/stock/[ticker]:247, cron/fundamental-snapshot:37,
// dan fundamental-pit-adapter.ts:31 yang menulis balik `pit.der * 100` - tetapi
// kartu ekspor Fundamental merendernya lewat `fmtKali()` yang TIDAK membagi
// 100. Akibatnya kartu ekspor Fundamental & Moat, aset yang memang dibuat untuk
// dibagikan ke luar aplikasi, menampilkan emiten ber-DER 0,47x sebagai "47,20x" -
// angka yang menyiratkan kebangkrutan pada neraca yang sehat.
//
// Pembagian 100 sekarang hidup DI SINI, satu tempat, supaya tidak mungkin lagi ada
// pemanggil yang memasangkan field persen dengan formatter rasio.
export const fmtDer = (persen: number | null | undefined): string =>
  typeof persen === 'number' && Number.isFinite(persen) ? `${(persen / 100).toFixed(2)}x` : 'N/A';

export const fmtPersen = (fraksi: number | null | undefined): string =>
  typeof fraksi === 'number' ? `${(fraksi * 100).toFixed(2)}%` : 'N/A';

export const fmtTriliun = (v: number | null | undefined): string =>
  typeof v === 'number' ? `Rp ${(v / 1e12).toFixed(2)} T` : 'N/A';

// BARU (2026-08-14, filter Market Cap & Likuiditas di LensScanner) - nilai transaksi
// harian (ADV20) biasanya di kisaran miliar, bukan triliun; menampilkannya lewat
// fmtTriliun akan selalu terbaca "Rp 0.01 T" alih-alih angka yang wajar dibaca.
export const fmtMiliar = (v: number | null | undefined): string =>
  typeof v === 'number' ? `Rp ${(v / 1e9).toFixed(2)} M` : 'N/A';
