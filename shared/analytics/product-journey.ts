'use client';

import { apiRequest } from '@/shared/http/api-client';
import { getVisitorId } from '@/shared/analytics/visitor-id';
import { createJourneyTracker } from '@/shared/analytics/journey-tracker';
import type { JourneyEventName, JourneySurface } from '@/shared/analytics/journey-events';

/**
 * Perakitan browser untuk pelacak perjalanan riset.
 *
 * Seluruh aturannya ada di shared/analytics/journey-tracker.ts dan diuji di sana; berkas
 * ini hanya menyambungkannya ke storage, jam, dan jaringan.
 */

const SESSION_KEY = 'sahamlens.journey.session.v1';
const SESSION_START_KEY = 'sahamlens.journey.session-start.v1';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Kelompok dikirim berkala supaya event tidak hilang kalau tab ditutup paksa. */
const FLUSH_INTERVAL_MS = 5_000;

/**
 * ID sesi dari sessionStorage. sessionStorage - bukan localStorage - karena "sesi" di
 * metrik ini berarti SATU KUNJUNGAN: ia harus berakhir saat tab ditutup, persis seperti
 * di kepala pengguna. localStorage akan menyambung kunjungan minggu lalu dengan hari ini
 * menjadi satu sesi raksasa dan membuat "waktu sampai tindakan pertama" tidak berarti.
 */
function sessionState(): { sessionId: string; startedAt: number; isNew: boolean } | null {
  if (typeof window === 'undefined') return null;
  try {
    const saved = window.sessionStorage.getItem(SESSION_KEY);
    const savedStart = Number(window.sessionStorage.getItem(SESSION_START_KEY));
    if (saved && UUID_V4.test(saved) && Number.isFinite(savedStart) && savedStart > 0) {
      return { sessionId: saved, startedAt: savedStart, isNew: false };
    }
    if (!window.crypto?.randomUUID) return null;
    const sessionId = window.crypto.randomUUID();
    const startedAt = Date.now();
    window.sessionStorage.setItem(SESSION_KEY, sessionId);
    window.sessionStorage.setItem(SESSION_START_KEY, String(startedAt));
    return { sessionId, startedAt, isNew: true };
  } catch {
    return null;
  }
}

const tracker = createJourneyTracker({
  identity: () => {
    const visitorId = getVisitorId();
    const session = sessionState();
    if (!visitorId || !session) return null;
    return { visitorId, sessionId: session.sessionId, isNewSession: session.isNew };
  },
  elapsedMs: () => {
    const session = sessionState();
    return session ? Date.now() - session.startedAt : 0;
  },
  send: async (batch) => {
    await apiRequest<void>('/api/analytics/journey', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
      // Tanpa keepalive, kelompok terakhir sebuah kunjungan - justru yang memuat hasil
      // akhirnya - dibatalkan browser saat tab ditutup.
      keepalive: true,
    });
  },
});

let listenersReady = false;

function ensureListeners(): void {
  if (listenersReady || typeof window === 'undefined') return;
  listenersReady = true;

  window.setInterval(() => { void tracker.flush(); }, FLUSH_INTERVAL_MS);
  // pagehide, bukan beforeunload: beforeunload tidak dijalankan pada navigasi mundur/maju
  // yang dilayani bfcache, dan itu justru pola yang lazim di ponsel.
  window.addEventListener('pagehide', () => { void tracker.flush(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void tracker.flush();
  });
}

/** Catat satu langkah perjalanan riset. Aman dipanggil dari mana pun, termasuk SSR. */
export function trackJourneyEvent(name: JourneyEventName, surface: JourneySurface): void {
  if (typeof window === 'undefined') return;
  ensureListeners();
  tracker.track(name, surface);
}
