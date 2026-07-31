import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, ADMIN_COOKIE_VALUE, SESSION_COOKIE } from '@/shared/constants/cookie-names';
import { decrypt } from '@/shared/auth/jwt';
import { checkRateLimitShared } from '@/shared/middleware/rate-limiter';

// Edge Runtime (lihat export const config di bawah) - HANYA boleh mengimpor modul
// yang Edge-safe (tanpa next/headers, tanpa pg/bcryptjs). Itu sebabnya file ini
// mengimpor langsung dari shared/auth/jwt & shared/constants/cookie-names,
// BUKAN dari modules/user (barrel-nya menyeret next/headers lewat shared/auth/session).

const RATE_LIMIT_CONFIG = {
  windowMs: 24 * 60 * 60 * 1000,
  maxPerWindow: 20,
  blockMs: 60 * 60 * 1000,
};

// Halaman analisis mendalam - wajib login. TIDAK termasuk /portfolio (punya sistem
// akun demo terpisah sendiri via DEMO_SESSION_COOKIE), TIDAK termasuk '/' atau
// '/screener' (ringkasan pasar publik, sengaja gratis), dan TIDAK termasuk '/technical'
// (grafik + insight teknikal dasar sengaja dibuka publik sebagai daya tarik sebelum
// signup - AI Council 10-agen penuh tetap digated di belakang /api/council sendiri
// via checkProAccess, lihat app/api/council/route.ts).
const PROTECTED_PAGES = [
  '/home',
  '/dashboard',
  '/fundamental',
  '/watchlist',
  '/compare',
  '/backtest',
  '/breakout-radar',
  '/market-pulse',
  '/recommendations',
  '/calendar',
  '/multi-agent',
];

function isProtectedPage(pathname: string): boolean {
  return PROTECTED_PAGES.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

function getClientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

export async function middleware(req: NextRequest) {
  const sessionCookie = req.cookies.get(SESSION_COOKIE)?.value;
  const payload = sessionCookie ? await decrypt(sessionCookie) : null;

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
  if (req.cookies.get(ADMIN_COOKIE)?.value === ADMIN_COOKIE_VALUE) {
    isAdminOrTrial = true;
  }

  if (payload) {
    if (payload.role === 'admin' || payload.role === 'pro') {
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
    return NextResponse.json(
      { error: 'Terlalu banyak request. Coba lagi nanti.' },
      { status: 429, headers: result.retryAfterSec ? { 'Retry-After': String(result.retryAfterSec) } : undefined }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/api/stock/:path*',
    '/api/fundamental/:path*',
    '/api/chat/:path*',
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
  ],
};
