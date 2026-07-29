import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, ADMIN_COOKIE_VALUE } from '@/lib/constants';
import { decrypt } from '@/lib/session';

const WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_PER_WINDOW = 20;
const BLOCK_MS = 60 * 60 * 1000;

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

  // Authentication check for /dashboard
  if (req.nextUrl.pathname.startsWith('/dashboard')) {
    if (!payload) {
      return NextResponse.redirect(new URL('/login', req.url));
    }
    // Trial check is handled client-side in /dashboard/page.tsx to show popup
  }

  let isAdminOrTrial = false;

  // Legacy cookies check
  if (
    req.cookies.get(ADMIN_COOKIE)?.value === ADMIN_COOKIE_VALUE ||
    req.cookies.get('saham_admin')?.value === 'true' ||
    req.cookies.get('role')?.value === 'admin' ||
    req.cookies.get('role')?.value === 'pro'
  ) {
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
  matcher: ['/api/stock/:path*', '/api/fundamental/:path*', '/dashboard'],
};
