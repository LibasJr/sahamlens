'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Memulihkan posisi gulir per-halaman untuk kontainer gulir milik AppShell.
 *
 * KENAPA INI PERLU SAMA SEKALI. Pemulihan gulir bawaan peramban hanya berlaku untuk
 * elemen penggulir DOKUMEN. Di aplikasi ini yang menggulir adalah `<main class="lens-main">`
 * (`overflow-y-auto` di dalam `.lens-shell-viewport` setinggi 100dvh), jadi peramban
 * memulihkan gulir dokumen yang memang selalu 0 dan konten sesungguhnya tetap di puncak.
 * Akibatnya: menekan tombol kembali dari sebuah emiten ke tabel LensScanner yang sudah
 * digulir jauh akan membuang posisi baca pengguna sepenuhnya.
 *
 * Kontainer gulirnya sendiri TIDAK diubah. Struktur itu menopang sekitar 25 aturan di
 * app/globals.css, perhitungan --lens-mobile-nav-clearance, dan beberapa header sticky
 * yang memang bersandar padanya (lihat catatan di app/backtest/page.tsx dan
 * app/compare/page.tsx). Menggantinya dengan gulir dokumen adalah refactor layout
 * lintas-halaman, bukan perbaikan aksesibilitas - jadi yang diperbaiki di sini gejalanya,
 * pada lapisan yang benar.
 *
 * sessionStorage, bukan useRef: nilainya harus bertahan melewati pemuatan ulang penuh dan
 * navigasi kembali lintas-entri riwayat, dan harus mati sendiri saat tab ditutup.
 */

const KEY_PREFIX = 'sahamlens_scroll:';
const CONTENT_SELECTOR = 'main.lens-main';

export default function ScrollRestoration() {
  const pathname = usePathname();

  useEffect(() => {
    const el = document.querySelector<HTMLElement>(CONTENT_SELECTOR);
    if (!el) return;

    const key = KEY_PREFIX + pathname;

    // Pulihkan pada frame berikutnya: saat effect ini jalan, halaman baru sudah terpasang
    // tapi tingginya sering belum final (data masih dimuat), dan menyetel scrollTop ke
    // nilai yang melampaui tinggi saat ini akan dijepit diam-diam ke bawah oleh peramban.
    const saved = Number(sessionStorage.getItem(key) || 0);
    let frame = 0;
    if (saved > 0) {
      frame = requestAnimationFrame(() => {
        el.scrollTop = saved;
      });
    }

    // Disimpan dengan throttle rAF, bukan tiap event scroll: pada tabel panjang event ini
    // menyala puluhan kali per detik dan setiap penulisan sessionStorage itu sinkron.
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        try {
          sessionStorage.setItem(key, String(el.scrollTop));
        } catch {
          // Mode privasi ketat menolak sessionStorage - kehilangan posisi gulir jauh
          // lebih baik daripada melempar error dari sebuah efek latar.
        }
      });
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener('scroll', onScroll);
    };
  }, [pathname]);

  return null;
}
