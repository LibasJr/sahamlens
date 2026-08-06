import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, SESSION_COOKIE } from '@/shared/constants/cookie-names';
import { decrypt } from '@/shared/auth/jwt';
import { verifyAdminToken } from '@/shared/auth/admin-token';
import { checkRateLimitShared } from '@/shared/middleware/rate-limiter';

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

// ATURAN BARU (2026-08-01, keputusan produk): halaman analisis dibuka TANPA wajib
// login dulu, supaya pengunjung bisa lihat & coba fitur sebelum diminta daftar (dulu
// wajib login di sini SEBELUM sempat tahu apa isinya - dianggap terlalu tinggi
// friction-nya). Login/Pro-access TETAP di-gate di level API masing-masing
// (getSession()/checkProAccess() - lihat app/api/*/route.ts) - saat API menolak,
// halaman menampilkan ajakan daftar (pola PaywallModal yang sudah ada), bukan data
// asli gratis tanpa batas. Begitu user daftar & verifikasi email, trial 7 hari
// otomatis aktif (TRIAL_DAYS, modules/user/constants/user.constants.ts) - itu yang
// jadi "gratis semua 7 hari" sebelum pop-up upgrade muncul, bukan mekanisme baru.
//
// TIDAK termasuk /portfolio (Akun Demo, paper trading - data personal per-user,
// WAJIB tetap login, formulir login/signup-nya sendiri sudah ada di halaman itu).
const PROTECTED_PAGES: string[] = [];

function isProtectedPage(pathname: string): boolean {
  return PROTECTED_PAGES.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

function getClientIp(req: NextRequest): string {
  // NextRequest.ip dihapus di Next.js 15+ (Vercel Edge tidak lagi mengisinya di objek
  // request) - x-forwarded-for sekarang satu-satunya sumber, diisi platform Vercel dari
  // koneksi TCP asli di production dan tidak bisa dipalsukan klien selama request lewat
  // proxy Vercel (selalu begitu untuk deployment ini).
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

export async function proxy(req: NextRequest) {
  const sessionCookie = req.cookies.get(SESSION_COOKIE)?.value;
  const decrypted = sessionCookie ? await decrypt(sessionCookie) : null;
  // Guard yang sama dengan shared/auth/session.ts getSession() - token lain yang
  // tanda tangannya valid tapi bukan sesi login asli (mis. cookie trial anonim yang
  // salah ditempel sebagai "session") tidak boleh lolos sebagai payload sesi di sini,
  // bahkan kalau PROTECTED_PAGES diisi lagi nanti.
  const payload = decrypted && typeof decrypted.id === 'string' && decrypted.id ? decrypted : null;

  if (isProtectedPage(req.nextUrl.pathname)) {
    if (!payload) {
      const loginUrl = new URL('/login', req.url);
      loginUrl.searchParams.set('next', req.nextUrl.pathname);
      return NextResponse.redirect(loginUrl);
    }
    // Trial/pro check is handled client-side to show upgrade popups where relevant
  }

  let isAdminOrTrial = false;

  // HANYA cookie HttpOnly (diset & diverifikasi server, lihat modules/user/controller/
  // admin.controller.ts) yang boleh dipercaya untuk keputusan otorisasi. Cookie badge UI
  // non-HttpOnly (ADMIN_BADGE_COOKIE/ROLE_BADGE_COOKIE) sengaja TIDAK dicek di sini -
  // bisa ditulis siapa pun dari devtools/browser console, jadi tidak boleh jadi dasar bypass.
  // Tanda tangan cookie diverifikasi, bukan dibandingkan dengan konstanta. Sebelumnya
  // nilai literal '1' sudah cukup, sehingga siapa pun bisa melewati rate limit -
  // dan lewat isAdminFromRequestCookies, masuk panel admin.
  if (await verifyAdminToken(req.cookies.get(ADMIN_COOKIE)?.value)) {
    isAdminOrTrial = true;
  }

  if (payload) {
    // is_pro disamakan dengan checkProAccess() (shared/auth/session.ts) - sebelumnya
    // middleware cuma cek role/trial, jadi user yang di-grant is_pro=true tanpa role
    // diubah ke 'pro' tetap kena rate limit 20/hari di sini walau route lain (mis.
    // /api/council) sudah menganggapnya Pro.
    if (payload.role === 'admin' || payload.role === 'pro' || payload.is_pro) {
      isAdminOrTrial = true;
    } else if (payload.trial_ends_at && new Date(payload.trial_ends_at).getTime() > Date.now()) {
      isAdminOrTrial = true;
    }
  }

  if (isAdminOrTrial) {
    return NextResponse.next();
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
    if (req.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Terlalu banyak request. Coba lagi nanti.' },
        { status: 429, headers: result.retryAfterSec ? { 'Retry-After': String(result.retryAfterSec) } : undefined }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/api/stock/:path*',
    '/api/fundamental/:path*',
    '/api/chat/:path*',
    '/api/calendar/:path*',
    '/api/backtest/:path*',
    '/api/market-pulse/:path*',
    '/api/breakout-radar/:path*',
    '/api/recommendations/:path*',
    '/api/agents/:path*',
    '/api/council/:path*',
    '/api/payment/:path*',
    '/home/:path*',
    '/dashboard/:path*',
    '/fundamental/:path*',
    '/watchlist/:path*',
    '/compare/:path*',
    '/backtest/:path*',
    '/breakout-radar/:path*',
    '/market-pulse/:path*',
    '/recommendations/:path*',
    '/calendar/:path*',
    '/multi-agent/:path*',
    '/risk-calculator/:path*',
  ],
};
