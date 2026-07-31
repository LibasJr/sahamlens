import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, ADMIN_COOKIE_VALUE } from '@/lib/constants';
import { decrypt } from '@/lib/session';

const WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_PER_WINDOW = 20;
const BLOCK_MS = 60 * 60 * 1000;

// Halaman analisis mendalam - wajib login. TIDAK termasuk /portfolio (punya sistem
// akun demo terpisah sendiri via DEMO_SESSION_COOKIE, lihat lib/auth.ts) dan TIDAK
// termasuk '/' atau '/screener' (ringkasan pasar publik, sengaja gratis).
const PROTECTED_PAGES = [
  '/dashboard',
  '/fundamental',
  '/technical',
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
  return PROTECTED_PAGES.some(p => pathname === p || pathname.startsWith(p + '/'));
}

interface IpEntry {
  count: number;
  windowStart: number;
  blockedUntil: number;
}

const g = globalThis as unknown as { __sahamlensIpStore?: Map<string, IpEntry> };
if (!g.__sahamlensIpStore) g.__sahamlensIpStore = new Map();
const ipStore = g.__sahamlensIpStore;

function getClientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

export async function middleware(req: NextRequest) {
  const sessionCookie = req.cookies.get('session')?.value;
  let payload: any = null;
  
  if (sessionCookie) {
    payload = await decrypt(sessionCookie);
  }

  // Authentication check for all protected analysis pages
  if (isProtectedPage(req.nextUrl.pathname)) {
    if (!payload) {
      const loginUrl = new URL('/login', req.url);
      loginUrl.searchParams.set('next', req.nextUrl.pathname);
      return NextResponse.redirect(loginUrl);
    }
    // Trial/pro check is handled client-side to show upgrade popups where relevant
  }

  let isAdminOrTrial = false;

  // HANYA cookie HttpOnly (diset & diverifikasi server, lihat app/admin-login/key/route.ts)
  // yang boleh dipercaya untuk keputusan otorisasi. 'saham_admin' dan 'role' sengaja TIDAK
  // dicek di sini lagi - keduanya non-HttpOnly (dibaca document.cookie untuk UI badge saja,
  // lihat lib/auth.ts) sehingga bisa ditulis langsung oleh siapa pun dari devtools/browser
  // console. Mempercayainya di sini berarti siapa pun bisa mem-bypass rate limit dengan
  // mengetik `document.cookie = 'role=admin'`.
  if (req.cookies.get(ADMIN_COOKIE)?.value === ADMIN_COOKIE_VALUE) {
    isAdminOrTrial = true;
  }

  // New JWT session check
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
  const now = Date.now();
  let entry = ipStore.get(ip);
  if (!entry) {
    entry = { count: 0, windowStart: now, blockedUntil: 0 };
    ipStore.set(ip, entry);
  }

  if (entry.blockedUntil > now) {
    const retryAfterSec = Math.ceil((entry.blockedUntil - now) / 1000);
    return NextResponse.json(
      { error: 'Terlalu banyak request dari IP ini. Coba lagi nanti.' },
      { status: 429, headers: { 'Retry-After': String(retryAfterSec) } }
    );
  }

  if (now - entry.windowStart > WINDOW_MS) {
    entry.count = 0;
    entry.windowStart = now;
  }

  entry.count += 1;
  if (entry.count > MAX_PER_WINDOW) {
    entry.blockedUntil = now + BLOCK_MS;
    return NextResponse.json(
      { error: 'Rate limit tercapai (20/hari). IP diblokir 1 jam.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(BLOCK_MS / 1000)) } }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/api/stock/:path*',
    '/api/fundamental/:path*',
    '/dashboard/:path*',
    '/fundamental/:path*',
    '/technical/:path*',
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
