import type { Variants } from 'framer-motion';

// Redesign UI/UX Fase 1 - variant Framer Motion bersama, dipromosikan dari pola
// yang sebelumnya ditulis manual berulang-ulang di app/home/page.tsx. Dipakai di
// seluruh halaman sebagai satu sumber kebenaran gerak, bukan setiap halaman
// menciptakan easing/durasi sendiri-sendiri.

const EASE_SETTLE: [number, number, number, number] = [0.16, 1, 0.3, 1];

// Cek prefers-reduced-motion sekali saat modul dimuat (client-side only - aman
// karena file ini hanya dipakai dari 'use client' component). Kalau true, semua
// transition di bawah jadi durasi ~0 - tetap render posisi akhir yang benar,
// cuma tanpa animasi.
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

const DURATION = () => (prefersReducedMotion() ? 0 : 0.25);
const STAGGER = () => (prefersReducedMotion() ? 0 : 0.06);

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION(), ease: EASE_SETTLE },
  },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  show: {
    opacity: 1,
    scale: 1,
    transition: { duration: DURATION(), ease: EASE_SETTLE },
  },
};

export const staggerContainer: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: STAGGER() },
  },
};
