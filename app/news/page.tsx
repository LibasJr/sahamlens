'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Newspaper, Menu, ExternalLink } from 'lucide-react';
import { Badge, PageContainer, Skeleton, EmptyState, LoadingFact } from '@/components/ui';
import { fadeUp, staggerContainer } from '@/lib/motion';

interface NewsItemDto {
  title: string;
  link: string;
  source: string;
  sentiment: string;
  reason: string;
  pubDate: string;
}

function formatNewsDate(pubDate: string): string | null {
  const d = new Date(pubDate);
  // Mengembalikan null, bukan string kosong: pemanggilnya dulu tetap merangkai
  // "Sumber • {kosong} • alasan" sehingga muncul dua pemisah berdempetan setiap
  // kali tanggal RSS tidak bisa diurai.
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' });
}

/**
 * Umur berita jauh lebih menentukan daripada tanggalnya. "3 jam lalu" langsung
 * memberi tahu apakah ini masih relevan; "6 Agu 2026" menuntut pembaca
 * membandingkannya sendiri dengan hari ini.
 */
function formatRelative(pubDate: string): string | null {
  const t = new Date(pubDate).getTime();
  if (isNaN(t)) return null;
  const diffMin = Math.round((Date.now() - t) / 60000);
  if (diffMin < 0) return null;               // tanggal di masa depan - jangan ditebak
  if (diffMin < 60) return `${diffMin} menit lalu`;
  const diffJam = Math.round(diffMin / 60);
  if (diffJam < 24) return `${diffJam} jam lalu`;
  const diffHari = Math.round(diffJam / 24);
  if (diffHari <= 7) return `${diffHari} hari lalu`;
  return null;                                 // lebih tua dari sepekan: tanggal saja lebih jelas
}

type SentimentKey = 'ALL' | 'POSITIF' | 'NEGATIF' | 'NETRAL';

const FILTERS: { id: SentimentKey; label: string; tone: string }[] = [
  { id: 'ALL', label: 'Semua', tone: 'border-tv-blue/40 bg-tv-blue/10 text-tv-blue' },
  { id: 'POSITIF', label: 'Positif', tone: 'border-tv-green/40 bg-tv-green/10 text-tv-green' },
  { id: 'NETRAL', label: 'Netral', tone: 'border-tv-borderLight bg-tv-hover text-tv-text' },
  { id: 'NEGATIF', label: 'Negatif', tone: 'border-tv-red/40 bg-tv-red/10 text-tv-red' },
];

// Halaman Berita penuh - widget "Berita & Sentimen Pasar" di Beranda cuma tampilkan
// 12 teratas (ruang terbatas), fungsi getMarketNews() di baliknya sekarang menghitung
// sampai 40 (lihat modules/news/service/news.service.ts) supaya halaman ini bisa
// menampilkan jauh lebih banyak dari cache 15 menit yang sama, tanpa panggilan AI
// sentimen/​fetch RSS terpisah.
export default function NewsPage() {
  const [newsItems, setNewsItems] = useState<NewsItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<SentimentKey>('ALL');

  const loadNews = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch('/api/news', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Gagal memuat berita'))))
      .then((d) => setNewsItems(d?.items || []))
      .catch(() => setError('Permintaan ke server berita tidak sampai.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadNews();
  }, [loadNews]);

  const counts = useMemo(() => ({
    ALL: newsItems.length,
    POSITIF: newsItems.filter((n) => n.sentiment === 'POSITIF').length,
    NEGATIF: newsItems.filter((n) => n.sentiment === 'NEGATIF').length,
    NETRAL: newsItems.filter((n) => n.sentiment !== 'POSITIF' && n.sentiment !== 'NEGATIF').length,
  }), [newsItems]);

  const visibleItems = useMemo(() => {
    if (filter === 'ALL') return newsItems;
    if (filter === 'NETRAL') return newsItems.filter((n) => n.sentiment !== 'POSITIF' && n.sentiment !== 'NEGATIF');
    return newsItems.filter((n) => n.sentiment === filter);
  }, [newsItems, filter]);

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
      <PageContainer className="p-6">
        {/* Halaman ini bernama "Sentimen Pasar" tapi tidak pernah menjumlahkan
            sentimennya - tiap berita punya badge sendiri, dan pembaca harus
            menghitung sendiri untuk tahu nada pasarnya condong ke mana. */}
        {!loading && !error && newsItems.length > 0 && (
          <div className="mb-5 rounded-lg border border-tv-border bg-tv-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Newspaper className="w-4 h-4 text-tv-muted" />
              <h2 className="font-heading text-sm font-bold text-tv-text">Nada {newsItems.length} berita terakhir</h2>
              <Badge variant="info">LensAI</Badge>
            </div>

            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-tv-hover" role="img"
              aria-label={`${counts.POSITIF} positif, ${counts.NETRAL} netral, ${counts.NEGATIF} negatif`}>
              <div className="h-full bg-tv-green transition-[width] duration-700 ease-settle" style={{ width: `${(counts.POSITIF / newsItems.length) * 100}%` }} />
              <div className="h-full bg-tv-muted transition-[width] duration-700 ease-settle" style={{ width: `${(counts.NETRAL / newsItems.length) * 100}%` }} />
              <div className="h-full bg-tv-red transition-[width] duration-700 ease-settle" style={{ width: `${(counts.NEGATIF / newsItems.length) * 100}%` }} />
            </div>

            <p className="mt-2.5 text-[11px] leading-relaxed text-tv-muted">
              {(() => {
                const { POSITIF: pos, NEGATIF: neg, NETRAL: net } = counts;
                const berbobot = pos + neg;
                const dasar = `${pos} positif, ${net} netral, ${neg} negatif.`;
                if (berbobot === 0) return `${dasar} Seluruh berita terklasifikasi netral - tidak ada arah yang bisa disimpulkan dari pemberitaan hari ini.`;
                if (pos >= neg * 2) return `${dasar} Pemberitaan condong positif. Sentimen berita mengikuti peristiwa yang SUDAH terjadi - ia menjelaskan pergerakan kemarin lebih baik daripada memprediksi besok.`;
                if (neg >= pos * 2) return `${dasar} Pemberitaan condong negatif. Perlu diingat media cenderung meliput kabar buruk lebih intens, jadi porsi negatif hampir selalu lebih besar dari kondisi sebenarnya.`;
                return `${dasar} Nada pemberitaan relatif berimbang - tidak ada satu narasi yang mendominasi.`;
              })()}
            </p>
          </div>
        )}

        {/* Filter sentimen - dengan 40 berita, membaca hanya yang negatif (atau hanya
            yang positif) adalah cara paling cepat menangkap isinya. */}
        {!loading && !error && newsItems.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  filter === f.id ? f.tone : 'border-tv-border text-tv-muted hover:text-tv-text'
                }`}
              >
                {f.label} <span className="font-number">{counts[f.id]}</span>
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
            </div>
            <LoadingFact />
          </div>
        ) : error ? (
          <div className="rounded-lg border border-tv-border bg-tv-card">
            <EmptyState
              illustration="empty"
              title="Berita gagal dimuat"
              description={`${error} Berita diambil dari RSS 10 media dan disimpan di cache 15 menit - kegagalan di sini biasanya sementara.`}
              action={{ label: 'Coba lagi', onClick: loadNews }}
            />
          </div>
        ) : newsItems.length === 0 ? (
          <div className="rounded-lg border border-tv-border bg-tv-card">
            <EmptyState
              illustration="search"
              title="Belum ada berita pada siklus ini"
              description="Sumber RSS belum mengembalikan artikel baru. Daftar disegarkan tiap 15 menit."
              action={{ label: 'Muat ulang', onClick: loadNews }}
            />
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="rounded-lg border border-tv-border bg-tv-card">
            <EmptyState
              illustration="search"
              title={`Tidak ada berita bersentimen ${FILTERS.find((f) => f.id === filter)?.label.toLowerCase()}`}
              description="Berita lain tetap ada - kembali ke tab Semua untuk melihat seluruhnya."
              action={{ label: 'Tampilkan semua', onClick: () => setFilter('ALL') }}
            />
          </div>
        ) : (
          <motion.div
            initial="hidden"
            animate="show"
            variants={staggerContainer}
            className="grid grid-cols-1 lg:grid-cols-2 gap-3"
          >
            {visibleItems.map((n) => {
              // Bagian meta dirangkai dari potongan yang BENAR-BENAR ada, bukan
              // ditempel dengan " • " tanpa syarat - tanggal RSS yang gagal diurai
              // sebelumnya meninggalkan dua pemisah berdempetan.
              const relative = formatRelative(n.pubDate);
              const tanggal = formatNewsDate(n.pubDate);
              const meta = [n.source, relative ?? tanggal].filter(Boolean);
              return (
                <motion.a
                  key={n.link || n.title}
                  variants={fadeUp}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.995 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  href={n.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-start justify-between gap-3 p-4 rounded-lg border border-tv-border bg-tv-card hover:border-tv-borderLight hover:bg-tv-hover/30 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-tv-text leading-snug">{n.title}</p>
                    <p className="text-xs text-tv-muted mt-1">
                      {meta.join(' • ')}
                      {relative && tanggal && <span className="text-tv-muted/60"> · {tanggal}</span>}
                    </p>
                    {/* `reason` adalah alasan LensAI memberi label sentimen itu -
                        sebelumnya diselipkan di ujung baris meta, terbaca seperti
                        bagian dari nama sumber. Dipisah ke barisnya sendiri. */}
                    {n.reason && (
                      <p className="mt-1.5 text-[11px] leading-relaxed text-tv-muted/80 border-l-2 border-tv-border pl-2">
                        {n.reason}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <Badge
                      variant={n.sentiment === 'POSITIF' ? 'success' : n.sentiment === 'NEGATIF' ? 'danger' : 'neutral'}
                    >
                      {n.sentiment}
                    </Badge>
                    {/* Kartu ini membuka tab baru - tanpa penanda, tidak ada isyarat
                        bahwa ia meninggalkan aplikasi. */}
                    <ExternalLink className="w-3 h-3 text-tv-muted/50 group-hover:text-tv-muted transition-colors" />
                  </div>
                </motion.a>
              );
            })}
          </motion.div>
        )}
      </PageContainer>
    </div>
  );
}
