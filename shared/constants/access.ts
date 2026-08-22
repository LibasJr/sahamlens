// Daftar halaman yang WAJIB login - sumber tunggal untuk gerbang navigasi. File ini
// SENGAJA tidak mengimpor apa pun, sama seperti cookie-names.ts: dipakai dari
// proxy.ts, jadi tidak boleh menyeret dependency Node/React apa pun ke dalam bundle
// proxy.
//
// ATURAN (keputusan produk 2026-08-13, MENGGANTIKAN aturan 2026-08-11 di bawah ini):
// Dalam fase testing-open, tamu tanpa akun tidak dikunci dari fitur analisis. Saat
// NEXT_PUBLIC_TESTING_OPEN_ACCESS=false, API tetap melakukan entitlement live dan guest
// tidak boleh menjadi jalur bypass. Dua halaman di bawah SELALU wajib akun karena datanya
// milik SATU IDENTITAS
// yang harus tersimpan lintas kunjungan:
//   - Portfolio: posisi & transaksi saham milik pengguna
//   - Watchlist: daftar pantau & alert harga milik pengguna
// Menu admin digerbang TERPISAH lewat cookie admin (isAdminServer/verifyAdminToken),
// bukan lewat daftar ini - jadi tidak perlu masuk daftar ini juga.
//
// Data premium mengikuti TESTING_OPEN_ACCESS + hasOpenOrProAccess(); tidak ada aturan
// terpisah yang membuat guest lebih bebas daripada akun gratis. Riwayat singkat
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
 * Saat model berbayar siap diaktifkan, set NEXT_PUBLIC_TESTING_OPEN_ACCESS=false pada build/runtime.
 * Default tetap true untuk rollout aman pada fase pengujian; enforcement tidak lagi memerlukan edit source.
 */
export const TESTING_OPEN_ACCESS = process.env.NEXT_PUBLIC_TESTING_OPEN_ACCESS !== 'false';

/**
 * Apakah seluruh TAMPILAN Pro ditampilkan - lencana status akun, masa berlaku, tombol
 * "Upgrade ke Pro", dan modal promonya.
 *
 * Keputusan produk 2026-08-23: fitur Pro BELUM ADA. Selama fase pengujian semuanya
 * gratis, jadi menampilkan status "Free" pun menyesatkan - ia menyiratkan ada tingkat
 * berbayar yang bisa dibeli, dan modal promo di beranda menawarkan paket yang tidak
 * bisa dipenuhi siapa pun.
 *
 * Ini SENGAJA terpisah dari TESTING_OPEN_ACCESS. Konstanta itu mengatur AKSES (siapa
 * boleh membuka apa); konstanta ini mengatur TAMPILAN (apakah Pro disebut sama sekali).
 * Menggabungkannya berarti menghidupkan kembali penjualan Pro secara tidak sengaja pada
 * hari entitlement diaktifkan.
 *
 * Default MATI dan harus dinyalakan eksplisit: set NEXT_PUBLIC_PRO_UI_ENABLED=true saat
 * fitur Pro benar-benar siap dijual. Tidak perlu menyunting kode untuk menyalakannya.
 *
 * Data dan API Pro TIDAK disentuh - kolom `isPro`, `proExpiresAt`, dan menu admin
 * SetProForm tetap berfungsi. Yang hilang hanya penyebutannya ke pengguna, supaya
 * mengaktifkannya kembali tidak menuntut migrasi apa pun.
 */
export const PRO_UI_ENABLED = process.env.NEXT_PUBLIC_PRO_UI_ENABLED === 'true';

export function isProtectedPage(pathname: string): boolean {
  return PROTECTED_PAGES.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

// Pesan yang ditampilkan halaman /login saat kedatangan berasal dari redirect di
// atas (dibaca lewat query ?notice=login_required - lihat app/login/page.tsx).
export const LOGIN_REQUIRED_NOTICE = 'Silakan masuk untuk melanjutkan.';
