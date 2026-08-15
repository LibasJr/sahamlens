import { cookies } from 'next/headers';
import { decrypt, type SessionPayload } from './jwt';
import { SESSION_COOKIE, ADMIN_COOKIE } from '../constants/cookie-names';
import { verifyAdminToken } from './admin-token';
import { touchPresence } from './presence';
import { fetchLiveProFields } from './pro-status';
import { TESTING_OPEN_ACCESS } from '../constants/access';

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
  if (await verifyAdminToken(cookieStore.get(ADMIN_COOKIE)?.value)) {
    return {
      id: '__sahamlens_admin__',
      email: 'admin@sahamlens.local',
      role: 'admin',
      is_pro: true,
      trial_ends_at: null,
      pro_expires_at: null,
    };
  }

  return null;
}

function isProExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false; // null/undefined = tanpa batas
  return new Date(expiresAt) <= new Date();
}

// role === 'pro' SENGAJA tidak lagi memberi akses sendiri: tidak ada satu baris kode pun
// yang menulis nilai itu (hanya is_pro yang pernah ditulis), sementara membiarkannya
// berarti menyisakan jalur akses yang kebal terhadap tanggal kedaluwarsa. Admin tetap
// lolos tanpa syarat lewat cabang pertama.
export function checkProAccess(session: SessionPayload | null): boolean {
  if (!session) return false;
  if (TESTING_OPEN_ACCESS) return true;
  if (session.role === 'admin') return true;
  if (session.is_pro && !isProExpired(session.pro_expires_at)) return true;
  if (session.trial_ends_at && new Date(session.trial_ends_at) > new Date()) return true;
  return false;
}

// checkProAccess() sinkron cuma baca snapshot JWT - basi sampai TTL sesi (s/d
// 30 hari dengan "ingat saya") kalau admin baru saja mengaktifkan Pro lewat
// /admin (lihat modules/user/controller/admin.controller.ts
// handleSetProStatus). Versi ini re-check sekali ke DB HANYA kalau JWT bilang
// "tidak" - kalau JWT sudah bilang "ya", tidak ada query DB tambahan sama
// sekali (jalur cepat untuk mayoritas request Pro user yang sesinya masih
// segar). Gagal-aman: DB error -> tetap tolak (fail-closed), bukan meloloskan
// user yang mestinya tidak akses.
export async function checkProAccessLive(session: SessionPayload | null): Promise<boolean> {
  if (checkProAccess(session)) return true;
  if (!session) return false;
  try {
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
 * Gerbang akses SUMBER TUNGGAL untuk seluruh fitur analisis - dipakai di tempat yang
 * dulu memanggil checkProAccessLive langsung untuk memutuskan 402 SUBSCRIPTION_REQUIRED.
 *
 * KEPUTUSAN PRODUK (2026-08-13): pengunjung TANPA akun (`session === null`) diberi akses
 * PENUH tanpa batas waktu ke seluruh fitur analisis - tidak ada lagi trial 7 hari yang
 * berakhir untuk tamu. Yang TETAP wajib akun bukan karena Pro, tapi karena datanya
 * milik satu identitas yang harus tersimpan: Portfolio dan Watchlist (digerbang
 * terpisah lewat getSession() != null di masing-masing endpoint, TIDAK lewat fungsi
 * ini - lihat shared/constants/access.ts).
 *
 * Untuk user yang SUDAH PUNYA AKUN, perilaku TIDAK berubah - tetap checkProAccessLive
 * (trial akun 7 hari sejak verifikasi, lalu wajib Pro). Ini sengaja membuat tamu LEBIH
 * longgar daripada akun gratis yang trialnya sudah habis - akun yang trial-nya berakhir
 * diarahkan ke upgrade lewat alur yang sudah ada (TrialExpiredGate/PaywallModal), bukan
 * dibandingkan dengan tamu. Konsekuensi ini disengaja dan diketahui pemilik produk, bukan
 * celah yang tidak disadari.
 *
 * JANGAN pakai fungsi ini untuk fitur yang menyimpan/membaca data milik pengguna
 * (portfolio, watchlist, alert) - di situ "punya akses" dan "sedang login sebagai siapa"
 * adalah pertanyaan yang sama, dan fungsi ini sengaja tidak bisa menjawab siapa.
 */
export async function hasOpenOrProAccess(session: SessionPayload | null): Promise<boolean> {
  if (!session) return true;
  return checkProAccessLive(session);
}
