'use client';

import { useMemo } from 'react';
import { Skeleton } from '@/components/ui';
import { buildFundamentalHealthSummary, type HealthVerdict } from '@/lib/fundamental/health-summary';
import { useLanguage } from '@/lib/i18n';

/**
 * Jawaban sebelum data (PRD §20): lima baris kesehatan bisnis di kepala /fundamental,
 * sebelum tiga belas kartu analyzer.
 *
 * BUKAN KARTU. Ini daftar berpembatas - lima kotak berbingkai di sini akan menambah
 * kepadatan visual persis di tempat yang seharusnya paling tenang, dan kartu di
 * SahamLens berarti "objek/keputusan", bukan sekadar wadah metrik.
 *
 * Status tidak pernah hanya lewat warna: setiap baris menulis verdict-nya sebagai teks
 * ("Kuat", "Perlu dicermati", "Data belum cukup"), jadi pembaca dengan defisiensi warna
 * mendapat informasi yang sama.
 */

const VERDICT_TONE: Record<HealthVerdict, string> = {
  STRONG: 'text-tv-green',
  MODERATE: 'text-tv-text',
  CAUTION: 'text-tv-yellow',
  WEAK: 'text-tv-red',
  UNKNOWN: 'text-tv-muted',
};

interface FundamentalHealthSummaryProps {
  fundamentals: any;
  consensus: string | null | undefined;
  isBank: boolean;
  loading: boolean;
  ticker: string;
}

export default function FundamentalHealthSummary({
  fundamentals,
  consensus,
  isBank,
  loading,
  ticker,
}: FundamentalHealthSummaryProps) {
  const { language } = useLanguage();
  const isEn = language === 'en';
  const code = ticker.replace('.JK', '');

  const dimensions = useMemo(
    () => buildFundamentalHealthSummary(fundamentals, consensus, { isBank }),
    [fundamentals, consensus, isBank],
  );

  const known = dimensions.filter((dimension) => dimension.verdict !== 'UNKNOWN');
  const weak = known.filter((dimension) => dimension.verdict === 'WEAK' || dimension.verdict === 'CAUTION');
  const headline = known.length === 0
    ? (isEn ? 'Fundamental data is still incomplete' : 'Data fundamental belum lengkap')
    : weak.length === 0
      ? (isEn ? 'No weak spot in the available fundamentals' : 'Tidak ada titik lemah pada fundamental yang tersedia')
      : isEn
        ? `Attention needed on ${weak.map((dimension) => dimension.labelEn.toLowerCase()).join(' and ')}`
        : `Perlu dicermati pada ${weak.map((dimension) => dimension.label.toLowerCase()).join(' dan ')}`;

  return (
    <section aria-labelledby="fundamental-health-title" className="border-y border-tv-border/70 py-5">
      <div className="lens-meta mb-1.5 font-bold uppercase tracking-[0.16em] text-tv-muted">
        {isEn ? 'Summary before the ratios' : 'Ringkasan sebelum rasio'}
      </div>
      <h2 id="fundamental-health-title" className="font-heading text-xl font-bold text-tv-text">
        {isEn ? `Fundamental health of ${code}` : `Kesehatan fundamental ${code}`}
      </h2>
      <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-tv-muted">
        {loading
          ? (isEn ? 'Reading the figures…' : 'Sedang membaca angkanya…')
          : headline}
        {' '}
        {isEn
          ? 'Each verdict uses the same thresholds as the analyzer cards below, so the summary can never contradict them.'
          : 'Tiap penilaian memakai ambang yang sama dengan kartu analyzer di bawah, jadi ringkasan ini tidak bisa bertentangan dengannya.'}
      </p>

      <dl className="mt-4 divide-y divide-tv-border/60 border-y border-tv-border/60">
        {dimensions.map((dimension) => (
          <div key={dimension.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
            <dt className="lens-label min-w-[128px] text-tv-text">{isEn ? dimension.labelEn : dimension.label}</dt>
            <dd className="order-3 w-full text-xs leading-relaxed text-tv-muted sm:order-2 sm:w-auto sm:flex-1">
              {loading ? <Skeleton variant="text" className="h-3 w-40" /> : dimension.evidence}
            </dd>
            <dd className={`order-2 shrink-0 text-sm font-bold sm:order-3 ${VERDICT_TONE[dimension.verdict]}`}>
              {loading ? '—' : (isEn ? dimension.verdictLabelEn : dimension.verdictLabel)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
