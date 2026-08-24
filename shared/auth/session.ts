import { cookies } from 'next/headers';
import { decrypt, type SessionPayload } from './jwt';
import { SESSION_COOKIE, ADMIN_COOKIE } from '../constants/cookie-names';
import { verifyAdminTokenLive } from './admin-token-live';
import { touchPresence } from './presence';
import { fetchLiveProFields } from './pro-status';
import { TESTING_OPEN_ACCESS } from '../constants/access';
import { evaluateEntitlement } from './entitlement';
import { SYNTHETIC_ADMIN_SESSION_ID } from '../constants/identity';

export type { SessionPayload };

// Baca sesi JWT dari cookie HttpOnly. Ini kebutuhan LINTAS-MODULE (setiap module
// butuh tahu siapa yang sedang login untuk otorisasi), makanya tinggal di shared/
// dan bukan di modules/user/ - hanya operasi MEMBUAT/MENGHAPUS sesi (login/logout)
// yang jadi tanggung jawab domain modules/user (lihat modules/user/service/session.service.ts).
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE)?.value;

  if (session) {
    const payload = await decrypt(session);
    // Guard terhadap token yang valid tanda tangannya tapi bukan sesi login asli (mis.
    // payload trial anonim yang salah ditempel sebagai cookie "session" secara manual) -
    // sesi asli SELALU punya id user string, payload lain harus ditolak di sini, bukan
    // lolos sebagai "user yang login" dengan id kosong.
    if (payload && typeof payload.id === 'string' && payload.id) {
      // Fire-and-forget - "siapa sedang aktif" untuk panel admin, tidak boleh pernah
      // menahan atau menggagalkan request pengguna biasa kalau Redis lambat/down.
      touchPresence(payload).catch(() => {});
      return payload;
    }
  }

  // Admin secret login memakai cookie admin terpisah. Sebelumnya halaman admin
  // mengenalinya lewat /api/admin-status, tetapi seluruh fitur aplikasi (mis.
  // LensTechnical/Analyzer) memanggil getSession() dan menganggap admin belum login.
  // Fallback ini menyatukan kedua jalur otorisasi tanpa mempercayai badge cookie
  // client-side: hanya ADMIN_COOKIE HttpOnly yang JWT-nya lolos verifyAdminToken().
  if (await verifyAdminTokenLive(cookieStore.get(ADMIN_COOKIE)?.value)) {
    return {
      id: SYNTHETIC_ADMIN_SESSION_ID,
      email: 'admin@sahamlens.local',
      role: 'admin',
      is_pro: true,
      trial_ends_at: null,
      pro_expires_at: null,
    };
  }

  return null;
}

export function checkProAccess(session: SessionPayload | null): boolean {
  return evaluateEntitlement(session, { testingOpen: TESTING_OPEN_ACCESS });
}

// checkProAccess() sinkron hanya membaca snapshot JWT dan dipakai untuk presentasi ringan.
// Saat monetisasi benar-benar aktif (TESTING_OPEN_ACCESS=false), keputusan entitlement
// server-side HARUS memanggil checkProAccessLive(): DB menjadi source of truth agar revoke/
// perubahan expiry tidak menunggu remembered JWT kedaluwarsa sampai 30 hari. Gagal baca DB
// => fail-closed. Selama fase testing-open, query live sengaja dilewati.
export async function checkProAccessLive(session: SessionPayload | null): Promise<boolean> {
  if (!session) return false;
  if (TESTING_OPEN_ACCESS) return true;
  if (session.role === 'admin') return true;
  try {
    // When paid enforcement is active, DB is the entitlement source of truth on every
    // protected decision. A 30-day remembered JWT must not keep access after an admin
    // revokes Pro or after the database expiry changes.
    const live = await fetchLiveProFields(session.id);
    if (!live) return false;
    return checkProAccess({
      ...session,
      role: live.role,
      is_pro: live.is_pro,
      trial_ends_at: live.trial_ends_at,
      pro_expires_at: live.pro_expires_at,
    });
  } catch {
    return false;
  }
}

/**
 * Gerbang akses analisis yang konsisten untuk guest maupun akun.
 *
 * Selama TESTING_OPEN_ACCESS=true seluruh pengguna (termasuk guest) memang dibuka.
 * Saat monetisasi diaktifkan dengan mengubah flag itu ke false, guest TIDAK boleh tetap
 * mendapat akses penuh sementara akun gratis ditolak; guest harus login lebih dulu lalu
 * melewati entitlement normal. Ini menutup bypass sederhana "logout untuk jadi lebih bebas".
 */
export async function hasOpenOrProAccess(session: SessionPayload | null): Promise<boolean> {
  if (TESTING_OPEN_ACCESS) return true;
  if (!session) return false;
  return checkProAccessLive(session);
}
