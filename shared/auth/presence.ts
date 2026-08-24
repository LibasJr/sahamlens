import { cacheGet, cacheSet, scanKeys, cacheMGet } from '../cache/redis-cache';
import { pool } from '../database/postgres.client';
import type { SessionPayload } from './jwt';
import { isSyntheticAdminSession } from '../constants/identity';

// "Siapa yang sedang aktif login" untuk panel admin - TANPA query database manual
// (permintaan eksplisit: admin lihat lewat UI, bukan buka Supabase sendiri). Disimpan
// di Redis (yang memang sudah dipakai untuk cache) sebagai key per-user dengan TTL
// pendek - kalau user berhenti request >5 menit, key kedaluwarsa otomatis dan dia
// dianggap tidak aktif lagi. Degradasi aman: kalau Redis belum dikonfigurasi/down,
// touchPresence() no-op dan getActiveUsers() balikin array kosong (BUKAN error) -
// konsisten dengan filosofi cache di shared/cache/redis-cache.ts.

const PRESENCE_TTL_SEC = 5 * 60;
const PRESENCE_PREFIX = 'sahamlens:presence:';
const PERSISTED_ACTIVITY_INTERVAL_MS = 15 * 60 * 1000;
const persistedActivityAt = new Map<string, number>();

export type PresenceEntry = {
  id: string;
  email: string;
  role: string;
  lastSeen: string;
  startedAt?: string;
  durationSec?: number;
};

/** Menyimpan aktivitas lebih tahan lama dari Redis presence. Map proses membatasi
 * penulisan DB saat user memicu banyak request; kegagalan sengaja tidak mengganggu sesi. */
async function recordPersistedActivity(session: SessionPayload): Promise<void> {
  if (!session.id || isSyntheticAdminSession(session.id)) return;
  const now = Date.now();
  const previous = persistedActivityAt.get(session.id) ?? 0;
  if (now - previous < PERSISTED_ACTIVITY_INTERVAL_MS) return;
  persistedActivityAt.set(session.id, now);
  try {
    await pool.query('UPDATE users SET last_active_at = NOW() WHERE id = $1', [session.id]);
  } catch {
    // Kolom bisa belum ada pada request pertama sebelum migrasi user berjalan;
    // presence real-time tetap independen dan request pengguna tidak boleh gagal.
    persistedActivityAt.delete(session.id);
  }
}

/** Dipanggil dari getSession() tiap sesi berhasil diverifikasi - fire-and-forget,
 * tidak pernah melempar (lihat pemanggilnya di shared/auth/session.ts). */
export async function touchPresence(session: SessionPayload): Promise<void> {
  if (!session?.id) return;
  const key = `${PRESENCE_PREFIX}${session.id}`;
  const existing = await cacheGet<PresenceEntry>(key);
  const nowIso = new Date().toISOString();
  const startedAt = existing?.startedAt || nowIso;
  const durationSec = Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 1000));

  await cacheSet<PresenceEntry>(
    key,
    {
      id: session.id,
      email: session.email,
      role: session.role,
      lastSeen: nowIso,
      startedAt,
      durationSec,
    },
    PRESENCE_TTL_SEC,
  );
  void recordPersistedActivity(session);
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
