'use client';

import { useEffect, type RefObject } from 'react';

interface UseModalBehaviorOptions {
  open: boolean;
  onClose: () => void;
  /** Panel dialognya sendiri - bukan overlay/backdrop di belakangnya. */
  containerRef: RefObject<HTMLElement | null>;
  /**
   * Matikan kalau dialognya sudah memindahkan fokus sendiri ke elemen tertentu
   * (mis. CommandPalette yang fokus ke kolom pencariannya). Tanpa ini, fokus awal
   * hook akan menimpa fokus yang lebih tepat itu.
   */
  autoFocus?: boolean;
}

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function focusableIn(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE))
    .filter((el) => !el.hasAttribute('disabled'));
}

/**
 * Perilaku dasar sebuah dialog: Escape menutup, Tab terkurung di dalam, halaman di
 * belakang tidak ikut tergulir, dan fokus kembali ke tempatnya semula setelah tutup.
 *
 * KENAPA JADI SATU HOOK. Blok Escape + focus trap yang sama persis - 30 baris, sampai
 * ke pilihan selektor dan `setTimeout(..., 30)`-nya - disalin verbatim di lima berkas:
 * PaywallModal, PromoUpgradeModal, StockNewsModal, UserProfileModal, dan CommandPalette.
 * Lima salinan berarti perbaikan berikutnya harus ditemukan lima kali; dua hal di bawah
 * ini membuktikannya, karena keduanya hilang di KELIMA salinan sekaligus:
 *
 *   1. KUNCI GULIR LATAR. Tidak satu pun modal mengunci `document.body`. Di ponsel,
 *      menggulir di atas dialog yang terbuka justru menggulirkan halaman di belakangnya,
 *      dan menutup dialog mengembalikan pengguna ke posisi gulir yang berbeda dari saat
 *      ia membukanya. `paddingRight` ikut dikompensasi selebar scrollbar yang hilang -
 *      tanpa itu seluruh tata letak melompat beberapa piksel tiap kali modal dibuka.
 *
 *   2. PENGEMBALIAN FOKUS. Kelimanya memindahkan fokus MASUK ke dialog tapi tidak pernah
 *      mengembalikannya. Bagi pengguna keyboard, menutup dialog berarti fokus terlempar
 *      ke awal dokumen - jejak navigasinya hilang, dan itu justru kelompok pengguna yang
 *      seluruh focus trap ini dibuat untuknya.
 *
 * `aria-modal="true"` yang sudah terpasang di kelima dialog itu MENJANJIKAN kepada
 * pembaca layar bahwa isi di luar dialog tidak ada. Focus trap yang menepati janji itu
 * sudah ada; kunci gulir dan pengembalian fokus adalah sisa janji yang belum ditepati.
 */
export function useModalBehavior({
  open,
  onClose,
  containerRef,
  autoFocus = true,
}: UseModalBehaviorOptions): void {
  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const { overflow, paddingRight } = document.body.style;
    // Selisih ini nol di perangkat dengan overlay scrollbar (ponsel, macOS default),
    // jadi kompensasinya hanya berlaku di tempat yang memang membutuhkannya.
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const container = containerRef.current;
      if (!container) return;
      const focusable = focusableIn(container);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    // Jeda singkat: panel dianimasikan masuk oleh Framer Motion, dan memanggil focus()
    // sebelum node-nya benar-benar terpasang tidak berpengaruh apa pun.
    const focusTimer = autoFocus
      ? setTimeout(() => {
          const container = containerRef.current;
          if (container) focusableIn(container)[0]?.focus();
        }, 30)
      : undefined;

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (focusTimer !== undefined) clearTimeout(focusTimer);
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
      // Elemen pemicunya bisa saja sudah dilepas dari DOM saat dialog ditutup (mis.
      // baris tabel yang ikut hilang); `isConnected` mencegah fokus dilempar ke node
      // yatim, yang efeknya sama dengan tidak memfokuskan apa pun.
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [open, onClose, containerRef, autoFocus]);
}

export default useModalBehavior;
