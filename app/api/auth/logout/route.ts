import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { DEMO_SESSION_COOKIE, USER_COOKIE, ADMIN_COOKIE } from '@/lib/auth';

// Logout menyeluruh: sebelumnya cuma clear DEMO_SESSION_COOKIE (akun demo /portfolio), jadi
// sesi admin (ADMIN_COOKIE + saham_admin/role dari /admin-login/key & Telegram admin login)
// dan sesi Telegram (USER_COOKIE) gak pernah ke-clear - satu-satunya cara keluar adalah hapus
// cookie manual lewat devtools. Sekarang semua sesi dibersihkan sekaligus.
export async function POST() {
  const store = cookies();
  store.delete(DEMO_SESSION_COOKIE);
  store.delete(USER_COOKIE);
  store.delete(ADMIN_COOKIE);
  store.delete('saham_admin');
  store.delete('role');
  return NextResponse.json({ success: true });
}
