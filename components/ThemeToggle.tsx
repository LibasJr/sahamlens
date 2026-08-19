'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button as PrimitiveButton } from '@/components/ui/Button';

type Theme = 'light' | 'dark';
const STORAGE_KEY = 'sahamlens_theme';

// BARU (2026-08-14, temuan Cloudflare Web Analytics - tombol ini tercatat INP 1.768ms,
// jauh di atas ambang "Poor" 500ms). Menukar class .light/.dark di <html> mengubah SEMUA
// variabel CSS --lens-* sekaligus, dan banyak elemen di app ini punya `transition-all`/
// `transition-colors` (Card, Button, dll) - begitu warnanya berubah, browser menjalankan
// transisi CSS ANIMASI paralel di ratusan node DOM secara bersamaan dalam satu frame,
// bukan cuma repaint instan. Itu kerja utas utama yang mahal, persis pola penyebab INP
// buruk. Pola mitigasinya baku: matikan SEMUA transisi sesaat sebelum menukar tema (class
// `.lens-theme-swap * { transition: none !important }`), paksa reflow, baru lepas
// kelasnya di frame berikutnya - jadi pergantian warnanya "snap" instan, bukan animasi
// paralel massal.
function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.add('lens-theme-swap');
  root.classList.remove('light', 'dark');
  root.classList.add(theme);
  root.style.colorScheme = theme;
  localStorage.setItem(STORAGE_KEY, theme);
  // Baca layout property memaksa browser membereskan style/layout yang tertunda
  // (reflow) SEBELUM kelas peniadaan transisi dilepas - tanpa ini browser boleh
  // menggabungkan pelepasannya ke frame yang sama dan transisinya tetap jalan.
  void root.offsetHeight;
  requestAnimationFrame(() => {
    root.classList.remove('lens-theme-swap');
  });
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    const current = document.documentElement.classList.contains('light') ? 'light' : 'dark';
    setTheme(current);
  }, []);

  const nextTheme = theme === 'dark' ? 'light' : 'dark';

  return (
    <PrimitiveButton variant="bare" size="none"
      type="button"
      aria-label={`Gunakan mode ${nextTheme === 'light' ? 'terang' : 'gelap'}`}
      title={`Mode ${nextTheme === 'light' ? 'terang' : 'gelap'}`}
      onClick={() => {
        applyTheme(nextTheme);
        setTheme(nextTheme);
      }}
      /* `focus-visible:outline-none` tanpa pengganti membuat fokus keyboard tidak terlihat
         sama sekali (WCAG 2.4.7). Outline bawaan dimatikan karena bentuknya persegi di
         tombol membulat - jadi diganti ring, bukan dihilangkan begitu saja. */
      className="lens-theme-toggle inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-tv-border bg-tv-card text-tv-text shadow-2 transition-all hover:-translate-y-0.5 hover:border-tv-borderLight hover:bg-tv-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tv-blue focus-visible:ring-offset-2 focus-visible:ring-offset-tv-bg md:h-9 md:w-9"
    >
      {theme === 'dark' ? <Sun className="h-5 w-5" aria-hidden="true" /> : <Moon className="h-5 w-5" aria-hidden="true" />}
    </PrimitiveButton>
  );
}
