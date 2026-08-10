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
      className="lens-theme-toggle inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-tv-border bg-tv-card text-tv-text shadow-2 transition-all hover:-translate-y-0.5 hover:border-tv-borderLight hover:bg-tv-hover focus-visible:outline-none md:h-9 md:w-9"
    >
      {theme === 'dark' ? <Sun className="h-5 w-5" aria-hidden="true" /> : <Moon className="h-5 w-5" aria-hidden="true" />}
    </button>
  );
}
