'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import useSWR from 'swr';
import { motion } from 'framer-motion';
import { Newspaper } from 'lucide-react';
import { Badge, PageContainer, Skeleton, EmptyState, LoadingFact } from '@/components/ui';
import { StructuredNewsCard, StructuredNewsIntro } from '@/components/news/StructuredNewsCard';
import { staggerContainer } from '@/lib/motion';
import { useLanguage } from '@/lib/i18n';

interface NewsItemDto {
  title: string;
  link: string;
  source: string;
  sentiment: string;
  reason: string;
  pubDate: string;
  intelligence?: {
    eventType: string;
    eventLabel: string;
    affectedMetrics: string[];
    horizon: string;
    expectedImpact: {
      direction: string;
      magnitude: string;
      summary: string;
    };
    confidence: number;
    evidenceBasis: 'HEADLINE_ONLY';
  };
}

function formatNewsDate(pubDate: string, language: 'id' | 'en'): string | null {
  const d = new Date(pubDate);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString(language === 'en' ? 'en-US' : 'id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  });
}

function formatRelative(
  pubDate: string,
  t: (path: string, params?: Record<string, string | number>) => string
): string | null {
  const tTime = new Date(pubDate).getTime();
  if (isNaN(tTime)) return null;
  const diffMin = Math.round((Date.now() - tTime) / 60000);
  if (diffMin < 0) return null;
  if (diffMin < 60) return t('newsPage.timeMinutesAgo', { count: Math.max(1, diffMin) });
  const diffJam = Math.round(diffMin / 60);
  if (diffJam < 24) return t('newsPage.timeHoursAgo', { count: diffJam });
  const diffHari = Math.round(diffJam / 24);
  if (diffHari <= 7) return t('newsPage.timeDaysAgo', { count: diffHari });
  return null;
}

type SentimentKey = 'ALL' | 'POSITIF' | 'NEGATIF' | 'NETRAL';

export default function NewsPage() {
  const { t, language } = useLanguage();
  const [filter, setFilter] = useState<SentimentKey>('ALL');

  // SWR menggantikan loadNews + useEffect.
  //
  // `cache: 'no-store'` ikut dibuang. Niatnya dulu "jangan tampilkan berita basi", tapi
  // caranya keliru: ia mematikan cache TANPA menyegarkan apa pun saat pengguna benar-benar
  // kembali melihat halaman. revalidateOnFocus (lihat lib/api/ApiProvider.tsx) melakukan
  // hal yang sebenarnya diinginkan.
  //
  // Ikut memperbaiki satu bug halus: `loadNews` bergantung pada `t`, jadi MENGGANTI BAHASA
  // memicu pengambilan ulang seluruh berita - padahal isinya sama saja. Kunci SWR tidak
  // bergantung pada bahasa, jadi itu tidak lagi terjadi.
  const {
    data: newsData,
    error: newsError,
    isLoading: loading,
    mutate: loadNews,
  } = useSWR<{ items?: NewsItemDto[] }>('/api/news');

  // useMemo WAJIB di sini, bukan kerapian: `?? []` menghasilkan array BARU setiap render,
  // dan dua useMemo di bawah bergantung padanya - tanpa ini keduanya dihitung ulang di
  // setiap render walau beritanya tidak berubah. Ditangkap oleh react-hooks/exhaustive-deps.
  const newsItems = useMemo(() => newsData?.items ?? [], [newsData]);
  // Pesan errornya tetap dilokalkan seperti sebelumnya - yang berubah hanya sumbernya.
  const error = newsError ? t('newsPage.errorTitle') : null;

  const filters = useMemo<{ id: SentimentKey; label: string; tone: string }[]>(() => [
    { id: 'ALL', label: t('newsPage.filterAll'), tone: 'border-tv-blue/40 bg-tv-blue/10 text-tv-blue' },
    { id: 'POSITIF', label: t('newsPage.filterPositive'), tone: 'border-tv-green/40 bg-tv-green/10 text-tv-green' },
    { id: 'NETRAL', label: t('newsPage.filterNeutral'), tone: 'border-tv-borderLight bg-tv-hover text-tv-text' },
    { id: 'NEGATIF', label: t('newsPage.filterNegative'), tone: 'border-tv-red/40 bg-tv-red/10 text-tv-red' },
  ], [t]);

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
      <header className="sticky top-0 z-20 border-b border-white/[0.055] bg-tv-bg/80 px-4 py-4 backdrop-blur-xl md:px-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-md bg-tv-blue text-white">
            <Newspaper className="w-5 h-5" />
          </div>
          <div>
            <h1 className="lens-page-title">{t('newsPage.pageTitle')}</h1>
            <p className="text-xs text-tv-muted">{t('newsPage.pageSubtitle')}</p>
          </div>
        </div>
      </header>

      <PageContainer className="p-4 md:p-6 lg:p-7">
        {!loading && !error && newsItems.length > 0 && (
          <StructuredNewsIntro itemCount={newsItems.length} />
        )}

        {!loading && !error && newsItems.length > 0 && (
          <div className="mb-5 rounded-lg border border-tv-border bg-tv-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Newspaper className="w-4 h-4 text-tv-muted" />
              <h2 className="font-heading text-sm font-bold text-tv-text">
                {t('newsPage.toneTitle', { count: newsItems.length })}
              </h2>
              <Badge variant="info">LensAI</Badge>
            </div>

            <div
              className="flex h-2.5 w-full overflow-hidden rounded-full bg-tv-hover"
              role="img"
              aria-label={t('newsPage.toneAriaLabel', {
                pos: counts.POSITIF,
                net: counts.NETRAL,
                neg: counts.NEGATIF,
              })}
            >
              <div
                className="h-full bg-tv-green transition-[width] duration-700 ease-settle"
                style={{ width: `${(counts.POSITIF / newsItems.length) * 100}%` }}
              />
              <div
                className="h-full bg-tv-muted transition-[width] duration-700 ease-settle"
                style={{ width: `${(counts.NETRAL / newsItems.length) * 100}%` }}
              />
              <div
                className="h-full bg-tv-red transition-[width] duration-700 ease-settle"
                style={{ width: `${(counts.NEGATIF / newsItems.length) * 100}%` }}
              />
            </div>

            <p className="mt-2.5 text-[11px] leading-relaxed text-tv-muted">
              {(() => {
                const { POSITIF: pos, NEGATIF: neg, NETRAL: net } = counts;
                const berbobot = pos + neg;
                const dasar = language === 'en'
                  ? `${pos} bullish, ${net} neutral, ${neg} cautious.`
                  : `${pos} positif, ${net} netral, ${neg} negatif.`;
                if (berbobot === 0) return t('newsPage.toneNeutralAll', { base: dasar });
                if (pos >= neg * 2) return t('newsPage.tonePositiveDominant', { base: dasar });
                if (neg >= pos * 2) return t('newsPage.toneNegativeDominant', { base: dasar });
                return t('newsPage.toneBalanced', { base: dasar });
              })()}
            </p>
          </div>
        )}

        {!loading && !error && newsItems.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {filters.map((f) => (
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
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
            <LoadingFact />
          </div>
        ) : error ? (
          <div className="rounded-lg border border-tv-border bg-tv-card">
            <EmptyState
              illustration="empty"
              title={t('newsPage.errorTitle')}
              description={t('newsPage.errorDesc', { error })}
              action={{ label: t('newsPage.errorRetry'), onClick: loadNews }}
            />
          </div>
        ) : newsItems.length === 0 ? (
          <div className="rounded-lg border border-tv-border bg-tv-card">
            <EmptyState
              illustration="search"
              title={t('newsPage.emptyTitle')}
              description={t('newsPage.emptyDesc')}
              action={{ label: t('newsPage.emptyRefresh'), onClick: loadNews }}
            />
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="rounded-lg border border-tv-border bg-tv-card">
            <EmptyState
              illustration="search"
              title={t('newsPage.emptyFilteredTitle', {
                sentiment: filters.find((f) => f.id === filter)?.label.toLowerCase() || '',
              })}
              description={t('newsPage.emptyFilteredDesc')}
              action={{ label: t('newsPage.emptyFilteredAction'), onClick: () => setFilter('ALL') }}
            />
          </div>
        ) : (
          <motion.div
            initial="hidden"
            animate="show"
            variants={staggerContainer}
            className="grid grid-cols-1 gap-3"
          >
            {visibleItems.map((n) => {
              const relative = formatRelative(n.pubDate, t);
              const tanggal = formatNewsDate(n.pubDate, language);
              const meta = [n.source, relative ?? tanggal].filter(Boolean);
              return (
                <StructuredNewsCard
                  key={n.link || n.title}
                  item={n}
                  meta={meta as string[]}
                  absoluteDate={relative ? tanggal : null}
                />
              );
            })}
          </motion.div>
        )}
      </PageContainer>
    </div>
  );
}
