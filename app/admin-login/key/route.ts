import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, ADMIN_COOKIE_VALUE, getAdminSecret } from '@/lib/auth';

// Verifikasi ADMIN_SECRET_KEY di server saja (lihat catatan keamanan di lib/auth.ts).
// Kunjungi: /admin-login/key?key=<ADMIN_SECRET_KEY> -> set cookie HttpOnly -> redirect /dashboard.
// Key salah / env var belum di-set -> 404 (tidak membocorkan bahwa route ini ada).
// (/admin-login sendiri sekarang halaman Telegram Login Widget - lihat app/admin-login/page.tsx)
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key');
  const secret = getAdminSecret();

  if (!secret || !key || key !== secret) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Pakai header Host, bukan req.url - saat dev server bind ke 0.0.0.0 (next dev -H 0.0.0.0),
  // req.url/req.nextUrl.origin bisa ikut resolve ke 0.0.0.0 yang tidak valid buat redirect ke browser.
  const host = req.headers.get('host') || req.nextUrl.host;
  const protocol = req.headers.get('x-forwarded-proto') || req.nextUrl.protocol.replace(':', '');
  const res = NextResponse.redirect(new URL('/dashboard', `${protocol}://${host}`));
  res.cookies.set(ADMIN_COOKIE, ADMIN_COOKIE_VALUE, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 hari
  });
  return res;
}
