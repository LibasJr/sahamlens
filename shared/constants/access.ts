// Daftar halaman yang WAJIB login (role TRIAL/PRO/ADMIN) - sumber tunggal untuk
// gerbang navigasi. File ini SENGAJA tidak mengimpor apa pun, sama seperti
// cookie-names.ts: dipakai dari proxy.ts, jadi tidak boleh menyeret dependency
// Node/React apa pun ke dalam bundle proxy.
//
// ATURAN (keputusan produk 2026-08-11, menggantikan aturan 2026-08-06): SELURUH menu
// tetap DITAMPILKAN ke pengunjung tanpa login supaya cakupan produk kelihatan, tapi
// aksesnya digembok. Yang boleh dibuka guest: Beranda, LensMarket, LensRadar, News,
// Corporate Calendar, Transparansi, dan LensAI/Technical (chart + Ask AI terbatas -
// ringkasan Pro-nya tetap digerbang di API/server component). LensScanner PINDAH jadi
// terkunci pada revisi ini. Sisanya redirect ke /login. Gerbang di level API
// (checkProAccess/checkProAccessLive) TETAP ada dan tidak digantikan oleh file ini -
// ini lapisan navigasi, bukan pengganti otorisasi data.
export const PROTECTED_PAGES = [
  '/dashboard',
  '/fundamental',
  '/screener',
  '/compare',
  '/backtest',
  '/portfolio',
  '/watchlist',
  '/risk-calculator',
  '/recommendations',
  '/multi-agent',
  '/dcf',
  '/macro',
  '/moat',
  '/pattern',
  '/risk',
  '/dividend',
  '/earnings',
  '/market',
] as const;

export function isProtectedPage(pathname: string): boolean {
  return PROTECTED_PAGES.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

// Pesan yang ditampilkan halaman /login saat kedatangan berasal dari redirect di
// atas (dibaca lewat query ?notice=login_required - lihat app/login/page.tsx).
export const LOGIN_REQUIRED_NOTICE = 'Silakan masuk untuk melanjutkan.';
