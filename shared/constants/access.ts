// Daftar halaman yang WAJIB login - sumber tunggal untuk gerbang navigasi. File ini
// SENGAJA tidak mengimpor apa pun, sama seperti cookie-names.ts: dipakai dari
// proxy.ts, jadi tidak boleh menyeret dependency Node/React apa pun ke dalam bundle
// proxy.
//
// ATURAN (keputusan produk 2026-08-13, MENGGANTIKAN aturan 2026-08-11 di bawah ini):
// tamu tanpa akun TIDAK DIKUNCI dari fitur analisis apa pun. Yang tetap wajib akun
// cuma dua - dan itu bukan soal Pro/gratis, tapi karena datanya milik SATU IDENTITAS
// yang harus tersimpan lintas kunjungan:
//   - Portfolio: posisi & transaksi saham milik pengguna
//   - Watchlist: daftar pantau & alert harga milik pengguna
// Menu admin digerbang TERPISAH lewat cookie admin (isAdminServer/verifyAdminToken),
// bukan lewat daftar ini - jadi tidak perlu masuk daftar ini juga.
//
// Data premium (fundamental, screener, backtest, dst) TIDAK LAGI dibatasi waktu untuk
// tamu - lihat shared/auth/session.ts hasOpenOrProAccess(). Riwayat singkat
// aturan sebelumnya: 2026-08-06 semua dikunci kecuali beberapa halaman publik;
// 2026-08-11 semua menu ditampilkan tapi aksesnya digembok lewat redirect di sini.
export const PROTECTED_PAGES = [
  '/portfolio',
  '/watchlist',
] as const;

/**
 * Selama fase pengujian belum memiliki tanggal akhir, akun yang sudah login mendapat
 * akses penuh tanpa batas waktu. Satu konstanta ini dipakai oleh API, proxy, dan UI
 * agar tidak ada batas akses yang hanya hilang di salah satu lapisan.
 *
 * Saat model berbayar siap diaktifkan, ubah menjadi false; data/kolom lama tetap ada
 * sehingga aturan entitlement normal dapat dipulihkan tanpa migrasi struktur tabel.
 */
export const TESTING_OPEN_ACCESS = true;

export function isProtectedPage(pathname: string): boolean {
  return PROTECTED_PAGES.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

// Pesan yang ditampilkan halaman /login saat kedatangan berasal dari redirect di
// atas (dibaca lewat query ?notice=login_required - lihat app/login/page.tsx).
export const LOGIN_REQUIRED_NOTICE = 'Silakan masuk untuk melanjutkan.';
