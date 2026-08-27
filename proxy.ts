import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, SESSION_COOKIE } from '@/shared/constants/cookie-names';
import { encrypt } from '@/shared/auth/jwt';
import { isProtectedPage, TESTING_OPEN_ACCESS } from '@/shared/constants/access';
import { decrypt } from '@/shared/auth/jwt';
import { verifyAdminToken } from '@/shared/auth/admin-token';
import { checkRateLimitShared } from '@/shared/middleware/rate-limiter';
import { getTrustedClientIp } from '@/shared/http/client-ip';
import { isSelfLimitedExpensiveApi } from '@/shared/security/expensive-api-policy';
import { buildContentSecurityPolicy, createCspNonce } from '@/shared/security/content-security-policy';

// Next.js 16 mengganti file convention "middleware" jadi "proxy" (nama fungsi
// & file berubah, perilaku/matcher sama - lihat node_modules/next/dist/docs/
// .../file-conventions/proxy.md). Proxy default RUNTIME NODE.JS (bukan Edge lagi
// seperti middleware lama), tapi file ini tetap sengaja hanya mengimpor modul yang
// dulu wajib Edge-safe (tanpa next/headers, tanpa pg/bcryptjs) - import langsung
// dari shared/auth/jwt & shared/constants/cookie-names, BUKAN dari modules/user
// (barrel-nya menyeret next/headers lewat shared/auth/session) - tidak ada
// keuntungan mengubahnya sekarang, dan tetap Edge-compatible kalau suatu saat
// runtime Edge dipakai lagi.

// 150 (bukan 50) - halaman Breakout Radar tab Recommendations sendirian memecah
// pemindaian 220 saham jadi ~22 request ke /api/recommendations sekali buka tab
// (lihat app/breakout-radar/page.tsx fetchRecommendations), jadi limit harus cukup
// longgar untuk itu ditambah pemakaian wajar lain di hari yang sama.
const RATE_LIMIT_CONFIG = {
  windowMs: 24 * 60 * 60 * 1000,
  maxPerWindow: 150,
  blockMs: 60 * 60 * 1000,
};

// Auth endpoints need a much tighter pre-auth limit. This branch runs BEFORE
// Pro/admin bypass logic, so a stale/forged entitlement cannot disable brute-force protection.
const AUTH_RATE_LIMIT_CONFIG = { windowMs: 60_000, maxPerWindow: 10, blockMs: 15 * 60_000 };
const ADMIN_AUTH_RATE_LIMIT_CONFIG = { windowMs: 15 * 60_000, maxPerWindow: 5, blockMs: 60 * 60_000 };

// Sebelum nonce CSP, matcher proxy hanya mencakup kelompok halaman ini. Matcher HTML
// sekarang diperluas supaya setiap dokumen mendapat nonce, tetapi auth/rate-limit lama
// TIDAK boleh ikut meluas ke halaman publik lain. Daftar ini mempertahankan boundary lama.
const LEGACY_PAGE_PROXY_PREFIXES = [
  '/admin-login',
  '/home',
  '/market-pulse',
  '/calendar',
  '/breakout-radar',
  '/screener',
  '/dashboard',
  '/fundamental',
  '/compare',
  '/backtest',
  '/technical',
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

function hasLiveProEntitlement(payload: Record<string, unknown> | null): boolean {
  if (payload?.is_pro !== true || typeof payload.pro_expires_at !== 'string') return false;
  const expires = new Date(payload.pro_expires_at).getTime();
  return Number.isFinite(expires) && expires > Date.now();
}

// Daftar halaman terproteksi pindah ke shared/constants/access.ts - dipakai bersama
// oleh proxy ini DAN Sidebar (satu sumber, supaya menu yang tampil dan halaman yang
// boleh dibuka tidak pernah berbeda). Guest tetap MELIHAT semua menu di Sidebar, tapi
// item terproteksi ditandai gembok dan diarahkan ke /login-required saat diklik.
function getClientIp(req: NextRequest): string {
  return getTrustedClientIp(req.headers);
}

function isLegacyPageProxyPath(pathname: string): boolean {
  return LEGACY_PAGE_PROXY_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function shouldApplyDocumentCsp(req: NextRequest): boolean {
  if (req.nextUrl.pathname.startsWith('/api/')) return false;
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  if (req.headers.has('next-router-prefetch') || req.headers.get('purpose') === 'prefetch') return false;
  return true;
}

function nextResponse(req: NextRequest): NextResponse {
  if (!shouldApplyDocumentCsp(req)) return NextResponse.next();

  const nonce = createCspNonce();
  const csp = buildContentSecurityPolicy(nonce, process.env.NODE_ENV === 'production');
  const requestHeaders = new Headers(req.headers);
  // Next.js membaca nonce dari request CSP untuk menandai framework scripts yang
  // dihasilkan saat render. x-nonce dipakai oleh inline script milik aplikasi sendiri.
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

function isPublicGuestApi(pathname: string): boolean {
  return (
    pathname === '/api/market-pulse' ||
    pathname === '/api/breakout-radar' ||
    pathname === '/api/calendar' ||
    pathname === '/api/news' ||
    pathname.startsWith('/api/news/') ||
    pathname === '/api/ai-pick' ||
    pathname === '/api/daily-picks' ||
    pathname === '/api/market-summary' ||
    pathname === '/api/transparency' ||
    pathname === '/api/emiten' ||
    pathname.startsWith('/api/public-chart/') ||
    // BARU (2026-08-14, laporan pengguna: "menu bisa diklik tapi datanya kosong" untuk
    // tamu). PROTECTED_PAGES cuma Portfolio/Watchlist sejak 2026-08-13, tapi daftar
    // allowlist di sini TIDAK ikut diperluas saat itu - API di bawah tetap kena limiter
    // umum 150/hari PER IP (RATE_LIMIT_CONFIG), yang dibagi SEMUA tamu di Wi-Fi/CGNAT
    // yang sama, jadi cepat habis dan tampil "gagal dimuat"/"terlalu banyak request"
    // padahal hasOpenOrProAccess() sudah membuka datanya. Endpoint mahal tetap
    // dilindungi limiter sendiri (compute budget di backtest), jadi aman dibuka di sini.
    pathname.startsWith('/api/stock/') ||
    pathname.startsWith('/api/fundamental/') ||
    pathname === '/api/backtest' ||
    pathname === '/api/backtest/live-filter-check' ||
    pathname === '/api/recommendations' ||
    pathname === '/api/lens-score-bucket-backtest' ||
    pathname === '/api/compare' ||
    pathname === '/api/dividend-plan' ||
    pathname.startsWith('/api/analytics/') ||
    pathname.startsWith('/api/flow/')
  );
}

function hasOwnGuestLimiterApi(pathname: string): boolean {
  return (
    // /api/screener terlewat sejak matcher diperluas jadi '/api/:path*' (2026-08-19):
    // route-nya punya compute budget sendiri, tapi karena tidak terdaftar di sini ia
    // JUGA kena limiter umum 150/hari PER IP - dan dengan TRUSTED_PROXY_MODE=direct
    // "per IP" berarti satu ember untuk seluruh pengunjung, lalu blokir 1 jam. Ini
    // persis kasus "menu bisa diklik tapi datanya kosong" yang dicatat di
    // isPublicGuestApi() di atas, terulang di endpoint lain.
    pathname === '/api/screener' ||
    pathname === '/api/chat' ||
    pathname === '/api/council' ||
    pathname === '/api/ai-briefing' ||
    pathname === '/api/intrinsic-explain' ||
    pathname.startsWith('/api/agents/orchestrator') ||
    isSelfLimitedExpensiveApi(pathname)
  );
}

function isPublicGuestPage(pathname: string): boolean {
  return (
    pathname === '/home' ||
    pathname.startsWith('/home/') ||
    pathname === '/news' ||
    pathname.startsWith('/news/') ||
    pathname === '/market-pulse' ||
    pathname === '/transparency' ||
    pathname.startsWith('/market-pulse/') ||
    pathname === '/calendar' ||
    pathname.startsWith('/calendar/') ||
    pathname === '/breakout-radar' ||
    pathname.startsWith('/breakout-radar/') ||
    pathname === '/technical' ||
    pathname.startsWith('/technical/') ||
    // BARU (2026-08-14) - sama seperti isPublicGuestApi di atas: semua halaman non-
    // PROTECTED_PAGES sudah dibuka datanya untuk tamu (hasOpenOrProAccess), jadi
    // shell halamannya juga tidak boleh ikut limiter umum 150/hari/IP.
    pathname === '/dashboard' ||
    pathname.startsWith('/dashboard/') ||
    pathname === '/screener' ||
    pathname.startsWith('/screener/') ||
    pathname === '/fundamental' ||
    pathname.startsWith('/fundamental/') ||
    pathname === '/compare' ||
    pathname.startsWith('/compare/') ||
    pathname === '/backtest' ||
    pathname.startsWith('/backtest/') ||
    pathname === '/risk-calculator' ||
    pathname.startsWith('/risk-calculator/') ||
    pathname === '/recommendations' ||
    pathname.startsWith('/recommendations/') ||
    pathname === '/multi-agent' ||
    pathname.startsWith('/multi-agent/') ||
    pathname === '/dcf' ||
    pathname.startsWith('/dcf/') ||
    pathname === '/macro' ||
    pathname.startsWith('/macro/') ||
    pathname === '/moat' ||
    pathname.startsWith('/moat/') ||
    pathname === '/pattern' ||
    pathname.startsWith('/pattern/') ||
    pathname === '/risk' ||
    pathname.startsWith('/risk/') ||
    pathname === '/dividend' ||
    pathname.startsWith('/dividend/') ||
    pathname === '/earnings' ||
    pathname.startsWith('/earnings/') ||
    pathname === '/market' ||
    pathname.startsWith('/market/')
  );
}

/**
 * SESI TIDAK PERNAH DIPERPANJANG - BUG YANG DILAPORKAN BERULANG (2026-08-12).
 *
 * `SESSION_COOKIE` hanya pernah ditulis di dua tempat: handleLogin dan handleVerify
 * (modules/user/controller/auth.controller.ts). Tidak ada satu jalur pun yang
 * memperbaruinya saat sesi DIPAKAI. Akibatnya masa berlaku sesi bersifat MUTLAK, bukan
 * bergeser:
 *
 *   tanpa "Ingat saya"  -> 24 jam sejak login, dan checkbox-nya default MATI
 *   dengan "Ingat saya" -> 30 hari sejak login
 *
 * Jadi pengguna yang memakai aplikasi setiap hari tanpa mencentang "Ingat saya" akan
 * dilempar ke /login setiap 24 jam, tepat di tengah pemakaian, tanpa peringatan - dan itu
 * persis keluhan "sudah pernah login kok diminta login lagi". Bukan bug acak: ia pasti
 * terjadi, tepat waktu, dan tidak ada kode yang mencegahnya karena kode itu memang tidak
 * pernah ada.
 *
 * Perbaikannya sesi bergeser: setiap kali sesi yang MASIH SAH dipakai dan umurnya sudah
 * lewat separuh, token diterbitkan ulang dengan masa berlaku yang SAMA. Panjang aslinya
 * diturunkan dari `exp - iat` token itu sendiri, jadi pilihan "Ingat saya" pengguna
 * terbawa - tidak dipaksa jadi 24 jam maupun 30 hari.
 *
 * BATAS YANG DISENGAJA: perpanjangan hanya berlaku selama sesinya masih sah. Token yang
 * sudah kedaluwarsa tetap ditolak - ini menggeser jendela, bukan membuatnya abadi. Sesi
 * yang benar-benar ditinggalkan tetap mati sesuai jadwal aslinya.
 */
const SESSION_REFRESH_AFTER_FRACTION = 0.5;

async function refreshSessionCookie(
  res: NextResponse,
  payload: Record<string, unknown> | null,
): Promise<NextResponse> {
  if (!payload) return res;
  const exp = typeof payload.exp === 'number' ? payload.exp : null;
  const iat = typeof payload.iat === 'number' ? payload.iat : null;
  if (exp == null || iat == null || exp <= iat) return res;

  const lifetimeSec = exp - iat;
  const nowSec = Math.floor(Date.now() / 1000);
  const elapsed = nowSec - iat;
  if (elapsed < lifetimeSec * SESSION_REFRESH_AFTER_FRACTION) return res;
  // Sudah lewat: jangan terbitkan ulang token mati.
  if (nowSec >= exp) return res;

  // Klaim waktu dibuang supaya encrypt() memasang iat/exp yang baru; sisa payload
  // (id, email, role, is_pro, ...) dibawa apa adanya.
  const { exp: _exp, iat: _iat, nbf: _nbf, ...rest } = payload;
  try {
    const token = await encrypt(rest, `${lifetimeSec}s`);
    res.cookies.set({
      name: SESSION_COOKIE,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: lifetimeSec,
    });
  } catch {
    // Gagal menerbitkan ulang tidak boleh menjatuhkan request - pengguna tetap punya
    // sesi lama yang masih sah sampai jadwal aslinya.
  }
  return res;
}

/**
 * Path yang proxy TIDAK boleh sentuh sama sekali.
 *
 * Sejak matcher dibalik menjadi `/api/:path*` (lihat catatan panjang di config.matcher di
 * bawah), setiap route API melewati fungsi ini. Empat kelompok berikut harus keluar lebih
 * dulu, dan alasannya berbeda-beda - bukan sekadar "biar cepat":
 *
 *   /api/cron/       Dipanggil penjadwal, bukan manusia, dan selalu dari segelintir IP yang
 *                    sama. Limiter 150/hari/IP akan mematikan seluruh pipeline data dalam
 *                    satu hari. Keamanannya tidak bergantung pada proxy: tiap job
 *                    memverifikasi tanda tangan QStash atau CRON_SECRET-nya sendiri.
 *
 *   /api/payment/notify
 *                    Webhook penyedia pembayaran. Ini MEMPERBAIKI paparan yang sudah ada:
 *                    `/api/payment/:path*` selama ini ADA di matcher dan tidak pernah masuk
 *                    daftar mana pun yang membebaskannya, jadi notifikasi pembayaran ikut
 *                    menghabiskan kuota 150/hari dari IP penyedia - dan pembayaran yang
 *                    ditolak 429 hilang tanpa jejak di aplikasi. Keasliannya diverifikasi
 *                    di route-nya sendiri.
 *
 *   /api/health      Dipanggil pemantauan uptime beberapa kali per menit dari satu IP.
 *
 *   /api/company-logo
 *                    Satu request PER EMITEN pada setiap tabel yang dirender. Satu kali
 *                    buka LensScanner sudah bisa melepas puluhan request; membiarkannya
 *                    ikut kuota harian berarti tabel pertama hari itu menghabiskan jatah
 *                    seluruh sesi. Route-nya sendiri hanya mem-proxy gambar same-origin.
 */
export function isProxyExemptPath(pathname: string): boolean {
  return (
    pathname.startsWith('/api/cron/') ||
    pathname === '/api/payment/notify' ||
    pathname === '/api/health' ||
    pathname === '/api/company-logo'
  );
}

export async function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // Paling awal, SEBELUM decrypt/verifyAdminToken: pekerjaan kriptografi itu tidak gratis
  // dan tidak satu pun dari path di atas membutuhkannya.
  if (isProxyExemptPath(pathname)) return NextResponse.next();

  // Matcher diperluas untuk nonce CSP. Halaman yang sebelumnya tidak masuk proxy hanya
  // menerima CSP; jangan diam-diam menambahkan auth, session refresh, atau limiter baru.
  if (!pathname.startsWith('/api/') && !isLegacyPageProxyPath(pathname)) {
    return nextResponse(req);
  }

  const sessionCookie = req.cookies.get(SESSION_COOKIE)?.value;
  const decrypted = sessionCookie ? await decrypt(sessionCookie) : null;
  // Guard yang sama dengan shared/auth/session.ts getSession() - token lain yang
  // tanda tangannya valid tapi bukan sesi login asli (mis. cookie trial anonim yang
  // salah ditempel sebagai "session") tidak boleh lolos sebagai payload sesi di sini,
  // bahkan kalau PROTECTED_PAGES diisi lagi nanti.
  const payload = decrypted && typeof decrypted.id === 'string' && decrypted.id ? decrypted : null;

  const sensitiveAuthPaths = new Set([
    '/api/auth/login',
    '/api/auth/signup',
    '/api/auth/verify',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
    '/admin-login/key',
  ]);
  if (req.method === 'POST' && sensitiveAuthPaths.has(pathname)) {
    const ip = getClientIp(req);
    const authConfig = pathname === '/admin-login/key' ? ADMIN_AUTH_RATE_LIMIT_CONFIG : AUTH_RATE_LIMIT_CONFIG;
    const authRate = await checkRateLimitShared(`auth:${pathname}:${ip}`, Date.now(), authConfig);
    if (!authRate.allowed) {
      return NextResponse.json(
        { error: 'Terlalu banyak percobaan autentikasi. Coba lagi nanti.' },
        { status: 429, headers: authRate.retryAfterSec ? { 'Retry-After': String(authRate.retryAfterSec) } : undefined },
      );
    }

    // Auth sudah punya limiter pre-auth khusus di atas. Jangan teruskan request ini
    // ke limiter umum 150 request/hari di bawah: satu IP publik (Wi-Fi kantor/rumah,
    // CGNAT operator) bisa dipakai banyak perangkat/user. Sebelumnya login yang sah
    // ikut menghabiskan kuota umum dan akhirnya HP + laptop pada IP yang sama sama-sama
    // menerima 429 "Terlalu banyak request" meskipun percobaan login tidak berlebihan.
    return nextResponse(req);
  }

  // GUEST (belum login sama sekali) -> tendang ke /login. Sengaja HANYA cek "ada sesi
  // atau tidak", BUKAN status trial: user yang sesinya valid tapi trialnya habis tetap
  // boleh memuat halaman, karena yang harus ia lihat adalah modal "Trial habis, upgrade
  // ke premium" (components/AppShell.tsx) - bukan halaman login yang menyuruhnya masuk
  // padahal ia sudah masuk. Datanya sendiri tetap ditolak gerbang API (checkProAccess).
  // Login akun memakai SESSION_COOKIE, sedangkan login admin-by-key memakai
  // ADMIN_COOKIE. Kedua identitas sah harus dikenali sebelum guard redirect ini.
  // Hasil verifikasi dipakai ulang di bawah agar definisi auth tidak bercabang lagi.
  const hasVerifiedAdminSession = await verifyAdminToken(req.cookies.get(ADMIN_COOKIE)?.value);

  if (isProtectedPage(pathname) && !payload && !hasVerifiedAdminSession) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('next', pathname);
    loginUrl.searchParams.set('notice', 'login_required');
    return NextResponse.redirect(loginUrl);
  }

  // API/halaman publik untuk guest tidak boleh ikut limiter umum berbasis IP harian.
  // Kalau tidak, satu Wi-Fi/CGNAT bisa membuat LensMarket/LensRadar/Ask LensAI kosong
  // untuk semua guest. Endpoint mahal yang dibuka untuk guest tetap punya limiter
  // server-side sendiri (mis. compute budget /api/chat, /api/council, orchestrator).
  if (
    isPublicGuestPage(pathname) ||
    isPublicGuestApi(pathname) ||
    hasOwnGuestLimiterApi(pathname)
  ) {
    // Ikut menyegarkan: pengguna yang login lalu hanya membuka halaman publik tetap
    // sedang MEMAKAI aplikasi, dan sesinya tidak boleh mati hanya karena ia belum
    // menyentuh halaman terproteksi.
    return refreshSessionCookie(nextResponse(req), payload);
  }

  let isAdminOrTrial = false;

  // HANYA cookie HttpOnly (diset & diverifikasi server, lihat modules/user/controller/
  // admin.controller.ts) yang boleh dipercaya untuk keputusan otorisasi. Cookie badge UI
  // non-HttpOnly (ADMIN_BADGE_COOKIE/ROLE_BADGE_COOKIE) sengaja TIDAK dicek di sini -
  // bisa ditulis siapa pun dari devtools/browser console, jadi tidak boleh jadi dasar bypass.
  // Tanda tangan cookie diverifikasi, bukan dibandingkan dengan konstanta. Sebelumnya
  // nilai literal '1' sudah cukup, sehingga siapa pun bisa melewati rate limit -
  // dan lewat isAdminFromRequestCookies, masuk panel admin.
  if (hasVerifiedAdminSession) {
    isAdminOrTrial = true;
  }

  if (payload) {
    // is_pro disamakan dengan checkProAccess() (shared/auth/session.ts) - sebelumnya
    // middleware cuma cek role/trial, jadi user yang di-grant is_pro=true tanpa role
    // diubah ke 'pro' tetap kena rate limit 20/hari di sini walau route lain (mis.
    // /api/council) sudah menganggapnya Pro.
    if (TESTING_OPEN_ACCESS || payload.role === 'admin' || hasLiveProEntitlement(payload)) {
      isAdminOrTrial = true;
    } else if (payload.trial_ends_at && new Date(payload.trial_ends_at).getTime() > Date.now()) {
      isAdminOrTrial = true;
    }
  }

  if (isAdminOrTrial) {
    // Jalur yang dilalui pengguna Pro/admin/trial. Tanpa penyegaran di sini, justru
    // mereka yang paling aktif memakai aplikasi yang sesinya tidak pernah diperpanjang.
    return refreshSessionCookie(nextResponse(req), payload);
  }

  const ip = getClientIp(req);
  const result = await checkRateLimitShared(ip, Date.now(), RATE_LIMIT_CONFIG);

  if (!result.allowed) {
    // Cuma balas JSON mentah untuk panggilan API (fetch() di frontend sudah bisa
    // menangani body JSON + status 429). Untuk navigasi HALAMAN (mis. /breakout-radar),
    // JSON mentah tampil sebagai teks polos di browser - bukan halaman error yang bisa
    // dipahami. Biarkan HTML halamannya tetap ter-load; data sesungguhnya di halaman
    // itu tetap digerbang lewat rate limit di panggilan API-nya sendiri (matcher path
    // /api/... di atas), jadi membiarkan shell HTML lewat di sini tidak membuka apa pun
    // yang berharga.
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Terlalu banyak request. Coba lagi nanti.' },
        { status: 429, headers: result.retryAfterSec ? { 'Retry-After': String(result.retryAfterSec) } : undefined }
      );
    }
  }

  return refreshSessionCookie(nextResponse(req), payload);
}

export const config = {
  matcher: [
    // CSP nonce harus tersedia untuk semua dokumen HTML, termasuk /, /login, /news,
    // /transparency, dan halaman publik lain yang sebelumnya tidak membutuhkan proxy.
    // API tetap punya matcher eksplisit di bawah dan tidak menerima CSP nonce.
    '/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
    // DIBALIK 2026-08-19: dulu di sini ada 24 prefix /api/... yang ditulis satu per satu.
    // Bentuk itu adalah daftar-IZIN, dan daftar-izin gagal secara DIAM-DIAM: route API baru
    // lahir tanpa perlindungan apa pun sampai ada yang ingat menambahkannya ke sini. Yang
    // terlewat bukan hipotesis - saat perubahan ini dibuat, /api/screener, /api/ownership-flow,
    // /api/risk-analysis, /api/watchlist, /api/portfolio/*, dan /api/alert semuanya di luar
    // daftar. Komentar di blok ini sendiri sudah mencemaskan pola yang sama untuk jalur
    // HALAMAN beberapa bulan sebelumnya.
    //
    // Sekarang satu pola menutup seluruh permukaan API, dan yang ditulis satu per satu adalah
    // PENGECUALIANNYA - di isProxyExemptPath() di atas, masing-masing dengan alasannya.
    // Route baru terlindungi sejak menit pertama; membebaskannya menjadi keputusan sadar yang
    // terbaca di satu tempat, bukan kelalaian yang tidak terlihat di mana pun.
    //
    // Dijaga __tests__/proxy-guest-access.test.ts: setiap berkas app/api/**/route.ts harus
    // tercakup pola ini atau terdaftar sebagai pengecualian - tidak ada kemungkinan ketiga.
    '/api/:path*',
    '/admin-login/:path*',
    '/home/:path*',
    '/market-pulse/:path*',
    '/calendar/:path*',
    // Halaman terproteksi - HARUS sinkron dengan PROTECTED_PAGES di
    // shared/constants/access.ts. Path yang ada di sana tapi tidak di matcher ini
    // tidak akan pernah diperiksa (proxy tidak dijalankan untuk path itu), jadi
    // gerbang guest-nya diam-diam tidak aktif.
    '/breakout-radar/:path*',
    '/screener/:path*',
    '/dashboard/:path*',
    '/fundamental/:path*',
    '/compare/:path*',
    '/backtest/:path*',
    '/technical/:path*',
    '/portfolio/:path*',
    '/watchlist/:path*',
    '/risk-calculator/:path*',
    '/recommendations/:path*',
    '/multi-agent/:path*',
    '/dcf/:path*',
    '/macro/:path*',
    '/moat/:path*',
    '/pattern/:path*',
    '/risk/:path*',
    '/dividend/:path*',
    '/earnings/:path*',
    '/market/:path*',
  ],
};