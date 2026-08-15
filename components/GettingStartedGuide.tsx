'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BarChart3, BookmarkPlus, Calculator, Search, X } from 'lucide-react';

const DISMISSED_KEY = 'sahamlens.getting-started.dismissed.v1';

const steps = [
  { href: '/dashboard', icon: Search, title: 'Cari saham', text: 'Masukkan kode emiten yang ingin kamu cek.' },
  { href: '/technical/BBCA.JK', icon: BarChart3, title: 'Baca ringkasan', text: 'Lihat teknikal dan fundamentalnya.' },
  { href: '/dcf?symbol=BBCA', icon: Calculator, title: 'Nilai wajar & risiko', text: 'Bandingkan valuasi dengan risikonya.' },
  { href: '/watchlist', icon: BookmarkPlus, title: 'Simpan watchlist', text: 'Pantau saham pilihan dari satu tempat.' },
];

/** Panduan sekali lihat; bukan dashboard baru dan dapat ditutup permanen per browser. */
export default function GettingStartedGuide() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(window.localStorage.getItem(DISMISSED_KEY) !== '1');
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    window.localStorage.setItem(DISMISSED_KEY, '1');
    setVisible(false);
  };

  return (
    <section className="relative mb-8 overflow-hidden rounded-xl border border-tv-blue/25 bg-tv-blue/[0.07] p-4 sm:p-5" aria-label="Panduan mulai menggunakan SahamLens">
      <button type="button" onClick={dismiss} className="absolute right-3 top-3 rounded p-1 text-tv-muted transition hover:bg-tv-hover hover:text-tv-text" aria-label="Tutup panduan">
        <X className="h-4 w-4" />
      </button>
      <div className="pr-8">
        <h2 className="font-heading text-base font-bold text-tv-text">Mulai dari sini</h2>
        <p className="mt-1 text-xs text-tv-muted">Alur singkat untuk mengenal SahamLens—bukan rekomendasi beli atau jual.</p>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {steps.map(({ href, icon: Icon, title, text }, index) => (
          <Link key={title} href={href} className="group flex min-h-16 items-center gap-3 rounded-lg border border-tv-border bg-tv-card/70 px-3 py-2.5 transition hover:border-tv-blue/50 hover:bg-tv-hover">
            <span className="font-number text-xs font-bold text-tv-blue">{index + 1}</span>
            <Icon className="h-4 w-4 shrink-0 text-tv-blue" aria-hidden="true" />
            <span>
              <span className="block text-xs font-semibold text-tv-text group-hover:text-white">{title}</span>
              <span className="block text-[11px] leading-snug text-tv-muted">{text}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
