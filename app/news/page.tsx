'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Newspaper, Menu, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui';
import { fadeUp, staggerContainer } from '@/lib/motion';

interface NewsItemDto {
  title: string;
  link: string;
  source: string;
  sentiment: string;
  reason: string;
  pubDate: string;
}

function formatNewsDate(pubDate: string): string {
  const d = new Date(pubDate);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' });
}

// Halaman Berita penuh - widget "Berita & Sentimen Pasar" di Beranda cuma tampilkan
// 12 teratas (ruang terbatas), fungsi getMarketNews() di baliknya sekarang menghitung
// sampai 40 (lihat modules/news/service/news.service.ts) supaya halaman ini bisa
// menampilkan jauh lebih banyak dari cache 15 menit yang sama, tanpa panggilan AI
// sentimen/​fetch RSS terpisah.
export default function NewsPage() {
  const [newsItems, setNewsItems] = useState<NewsItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/news', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Gagal memuat berita'))))
      .then((d) => setNewsItems(d?.items || []))
      .catch(() => setError('Gagal memuat berita. Coba muat ulang halaman.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex-1 flex flex-col bg-tv-bg min-h-screen">
      <header className="bg-tv-surface border-b border-tv-border px-6 py-4 sticky top-0 z-20 shadow-2">
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.dispatchEvent(new Event('toggle-sidebar'))}
            className="md:hidden p-2 -ml-2 text-tv-muted hover:text-white rounded-lg hover:bg-white/5"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="p-2 rounded-md bg-tv-blue text-white">
            <Newspaper className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-heading font-bold text-xl text-tv-text tracking-tight">Berita & Sentimen Pasar</h1>
            <p className="text-xs text-tv-muted">Berita pasar dari 10 sumber kredibel, sentimen dinilai LensAI</p>
          </div>
        </div>
      </header>

      {/* max-w-[1600px] menyamakan lebar dengan Technical/Fundamental. Isinya SENGAJA
          tetap grid 2 kolom (bukan satu Card selebar 1600px) - kalau satu baris judul
          berita direntangkan sepanjang itu, terlalu lebar untuk dibaca nyaman. Lebar
          kontainer dan lebar baris teks dua urusan berbeda. */}
      <div className="p-6 max-w-[1600px] mx-auto w-full">
        <div className="flex items-center gap-2 mb-4">
          <Newspaper className="w-4 h-4 text-tv-muted" />
          <h2 className="font-heading text-sm font-bold text-tv-text">
            Semua Berita{newsItems.length > 0 ? ` (${newsItems.length})` : ''}
          </h2>
          <Badge variant="info">LensAI</Badge>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-tv-muted justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Memuat berita terkini...
          </div>
        ) : error ? (
          <p className="text-sm text-tv-red py-4 text-center">{error}</p>
        ) : newsItems.length === 0 ? (
          <p className="text-sm text-tv-muted py-4 text-center">Berita tidak tersedia saat ini.</p>
        ) : (
          <motion.div
            initial="hidden"
            animate="show"
            variants={staggerContainer}
            className="grid grid-cols-1 lg:grid-cols-2 gap-3"
          >
            {newsItems.map((n) => (
              <motion.a
                key={n.link || n.title}
                variants={fadeUp}
                href={n.link}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start justify-between gap-3 p-4 rounded-lg border border-tv-border bg-tv-card hover:border-tv-borderLight transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-tv-text leading-snug">{n.title}</p>
                  <p className="text-xs text-tv-muted mt-1">{n.source} • {formatNewsDate(n.pubDate)} • {n.reason}</p>
                </div>
                <Badge
                  variant={n.sentiment === 'POSITIF' ? 'success' : n.sentiment === 'NEGATIF' ? 'danger' : 'neutral'}
                  className="shrink-0"
                >
                  {n.sentiment}
                </Badge>
              </motion.a>
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
}
