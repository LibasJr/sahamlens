'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

type Theme = 'light' | 'dark';
const STORAGE_KEY = 'sahamlens_theme';

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(theme);
  root.style.colorScheme = theme;
  localStorage.setItem(STORAGE_KEY, theme);
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    const current = document.documentElement.classList.contains('light') ? 'light' : 'dark';
    setTheme(current);
  }, []);

  const nextTheme = theme === 'dark' ? 'light' : 'dark';

  return (
    <button
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
    </button>
  );
}
