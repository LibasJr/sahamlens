'use client';

import { apiRequest } from './api-client';

/**
 * Satu request untuk beberapa komponen yang kebetulan meminta data yang sama.
 *
 * MASALAH YANG DIPECAHKAN (audit performa redesign v2): di halaman `/` ada tiga
 * komponen independen yang masing-masing memanggil endpoint pasar yang sama saat
 * mount, karena tidak satu pun tahu yang lain juga memanggilnya:
 *
 *   /api/live/^JKSE     -> TopMarketBar (bilah atas) DAN useHomeWorkspaceData (hero)
 *   /api/market-summary -> MarketTicker (running text) DAN useHomeWorkspaceData (movers)
 *
 * Jadi kunjungan pertama ke beranda mengirim empat request untuk dua jawaban. Keduanya
 * menembus ke penyedia data hulu, bukan sekadar CDN.
 *
 * Kenapa BUKAN React Context seperti AuthUserProvider: pemanggilnya berada di dua pohon
 * yang berbeda - TopMarketBar/MarketTicker hidup di AppShell, HomeWorkspace di dalam
 * <main> - dan salah satunya bahkan tidak selalu terpasang. Provider bersama berarti
 * memindahkan state pasar ke akar aplikasi hanya demi menggabungkan dua fetch. Peta
 * modul di bawah menyelesaikan hal yang sama tanpa menyentuh susunan komponen.
 *
 * KEGAGALAN TIDAK DI-CACHE. Itu yang membuat tombol "Coba lagi" tetap berarti: satu-
 * satunya pemanggil ulang di UI adalah tombol coba-lagi setelah error, dan entri
 * gagalnya sudah dibuang sebelum tombol itu sempat ditekan.
 */

type Entry = { at: number; promise: Promise<unknown> };

const inflight = new Map<string, Entry>();

/** Cukup lama untuk menangkap mount beruntun beberapa komponen (dan mount ganda React
 *  StrictMode di dev), cukup pendek supaya kunjungan berikutnya tetap dapat data segar. */
const DEFAULT_TTL_MS = 30_000;

export function sharedMarketRequest<T>(url: string, ttlMs = DEFAULT_TTL_MS): Promise<T> {
  const hit = inflight.get(url);
  if (hit && Date.now() - hit.at < ttlMs) return hit.promise as Promise<T>;

  const promise = apiRequest<T>(url, { cache: 'no-store' });
  inflight.set(url, { at: Date.now(), promise });
  // Buang entri gagal supaya percobaan berikutnya benar-benar menembus jaringan.
  // `void` + catch kosong di sini hanya untuk pembersihan; penolakan tetap diteruskan
  // ke pemanggil lewat promise yang dikembalikan.
  void promise.catch(() => {
    if (inflight.get(url)?.promise === promise) inflight.delete(url);
  });
  return promise;
}

/** Dipakai test supaya satu berkas test tidak mewarisi cache dari berkas sebelumnya. */
export function resetSharedMarketRequests(): void {
  inflight.clear();
}
