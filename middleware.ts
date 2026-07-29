import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, ADMIN_COOKIE_VALUE } from '@/lib/constants';

// Rate limit IP sederhana (in-memory, tanpa Redis) - bukan untuk mencegah bypass yang niat
// (VPN/proxy tetap bisa ganti IP), tapi cukup untuk mencegah orang berulang kali clear
// localStorage buat reset kuota "5 analisa/hari" dari IP yang sama.
const WINDOW_MS = 24 * 60 * 60 * 1000; // 1 hari
const MAX_PER_WINDOW = 20;
const BLOCK_MS = 60 * 60 * 1000; // 1 jam

interface IpEntry {
  count: number;
  windowStart: number;
  blockedUntil: number;
}

// globalThis supaya map ini bertahan lintas hot-reload/invocation selama proses Node yang sama
// hidup (persis pola "global._ipCounts" di spek, cuma dinamai lebih jelas).
const g = globalThis as unknown as { __sahamlensIpStore?: Map<string, IpEntry> };
if (!g.__sahamlensIpStore) g.__sahamlensIpStore = new Map();
const ipStore = g.__sahamlensIpStore;

function getClientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

export function middleware(req: NextRequest) {
  // Admin (cookie HttpOnly, cuma bisa di-set oleh /admin-login setelah verifikasi server) lolos rate limit.
  // Juga izinkan bypass jika ada cookie saham_admin=true atau role=admin/pro
  if (
    req.cookies.get(ADMIN_COOKIE)?.value === ADMIN_COOKIE_VALUE ||
    req.cookies.get('saham_admin')?.value === 'true' ||
    req.cookies.get('role')?.value === 'admin' ||
    req.cookies.get('role')?.value === 'pro'
  ) {
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
  matcher: ['/api/stock/:path*', '/api/fundamental/:path*'],
};
