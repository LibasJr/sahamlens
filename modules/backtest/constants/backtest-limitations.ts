// Batasan simulasi backtest yang HARUS ikut ditampilkan bersama hasilnya (audit logika &
// algoritma 2026-08-05, temuan M-12). Ditaruh di constants/ (bukan di simulate.service.ts)
// supaya bisa diimpor komponen 'use client' tanpa menyeret service server-only ke bundle -
// alasan yang sama didokumentasikan di app/backtest/page.tsx untuk BACKTEST_PRESETS.
//
// Dua yang pertama adalah bias yang membuat hasil simulasi SISTEMATIS lebih baik daripada
// yang bisa dicapai di dunia nyata, dan keduanya tidak bisa dihilangkan dengan data yang
// tersedia sekarang - jadi dinyatakan, bukan didiamkan.
export const BACKTEST_LIMITATIONS = [
  'Universe hanya emiten yang masih tercatat hari ini (survivorship bias) - saham yang delisting dalam periode uji tidak ikut dihitung.',
  'Harga Open/Close mentah tanpa penyesuaian dividen - imbal hasil dividen tidak termasuk.',
  'Slippage 0,2% + fee beli 0,15% + fee jual 0,25% (perkiraan ritel IDX, bisa beda per broker).',
] as const;
