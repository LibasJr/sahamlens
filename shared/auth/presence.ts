import { cacheSet, scanKeys, cacheMGet } from '../cache/redis-cache';
import type { SessionPayload } from './jwt';

// "Siapa yang sedang aktif login" untuk panel admin - TANPA query database manual
// (permintaan eksplisit: admin lihat lewat UI, bukan buka Supabase sendiri). Disimpan
// di Redis (yang memang sudah dipakai untuk cache) sebagai key per-user dengan TTL
// pendek - kalau user berhenti request >5 menit, key kedaluwarsa otomatis dan dia
// dianggap tidak aktif lagi. Degradasi aman: kalau Redis belum dikonfigurasi/down,
// touchPresence() no-op dan getActiveUsers() balikin array kosong (BUKAN error) -
// konsisten dengan filosofi cache di shared/cache/redis-cache.ts.

const PRESENCE_TTL_SEC = 5 * 60;
const PRESENCE_PREFIX = 'sahamlens:presence:';

export type PresenceEntry = {
  id: string;
  email: string;
  role: string;
  lastSeen: string;
};

/** Dipanggil dari getSession() tiap sesi berhasil diverifikasi - fire-and-forget,
 * tidak pernah melempar (lihat pemanggilnya di shared/auth/session.ts). */
export async function touchPresence(session: SessionPayload): Promise<void> {
  if (!session?.id) return;
  await cacheSet<PresenceEntry>(
    `${PRESENCE_PREFIX}${session.id}`,
    { id: session.id, email: session.email, role: session.role, lastSeen: new Date().toISOString() },
    PRESENCE_TTL_SEC,
  );
}

/** Dipakai app/admin/page.tsx - daftar user dengan aktivitas dalam 5 menit terakhir,
 * terbaru dulu. */
export async function getActiveUsers(): Promise<PresenceEntry[]> {
  const keys = await scanKeys(`${PRESENCE_PREFIX}*`);
  if (keys.length === 0) return [];
  const entries = await cacheMGet<PresenceEntry>(keys);
  return entries
    .filter((e): e is PresenceEntry => e != null)
    .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
}
