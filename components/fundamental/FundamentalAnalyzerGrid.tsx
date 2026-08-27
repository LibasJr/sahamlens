'use client';

import Link from 'next/link';
import { Info, Layers, Lock } from 'lucide-react';
import { Button, Card, EmptyState, LoadingFact, ResearchProvenanceDetails, Skeleton } from '@/components/ui';
import { trackSignupClick } from '@/shared/analytics/product-funnel';
import type { FundamentalAnalyzerResult } from '@/modules/fundamental/contracts';
import type { ProvenancedFinancialValue } from '@/shared/finance/provenance';

interface LocalObservationView {
  aligned: number;
  total: number;
  avgGapHours: number | null;
}

interface FundamentalAnalyzerGridProps {
  displayedAnalyzers: FundamentalAnalyzerResult[];
  filteredAnalyzers: FundamentalAnalyzerResult[];
  metricProvenance?: Record<string, ProvenancedFinancialValue<number | string | null>>;
  loading: boolean;
  sortByConfidence: boolean;
  onToggleSort: () => void;
  lockedAnalyzerCount: number;
  noLocalObservationCount: number;
  viewMode: 'compact' | 'full';
  onShowAll: () => void;
  isConfirmedGuest: boolean;
  isEn: boolean;
  isVisibleForGuest: (label: string) => boolean;
  getLocalObservation: (label: string) => LocalObservationView | null;
}

const ANALYZER_METRIC_KEYS: ReadonlyArray<[RegExp, string]> = [
  [/^P\/E/, 'trailingPE'],
  [/^PBV/, 'priceToBook'],
  [/^ROE|Return on Equity/, 'returnOnEquity'],
  [/^ROA|Return on Assets/, 'returnOnAssets'],
  [/^Debt\/Equity|Debt to Equity/, 'debtToEquity'],
  [/^Current Ratio/, 'currentRatio'],
  [/^Quick Ratio/, 'quickRatio'],
  [/^Dividend Yield/, 'dividendYield'],
  [/^Pertumbuhan Laba/, 'earningsGrowth'],
  [/^Revenue Growth/, 'revenueGrowth'],
  [/^Gross Margin/, 'grossMargins'],
  [/^Operating Margin/, 'operatingMargins'],
  [/^Net Profit Margin/, 'profitMargins'],
];

function provenanceForAnalyzer(
  label: string,
  provenance: FundamentalAnalyzerGridProps['metricProvenance'],
) {
  const metricKey = ANALYZER_METRIC_KEYS.find(([pattern]) => pattern.test(label))?.[1];
  return metricKey ? provenance?.[metricKey] : undefined;
}

export default function FundamentalAnalyzerGrid({
  displayedAnalyzers,
  filteredAnalyzers,
  metricProvenance,
  loading,
  sortByConfidence,
  onToggleSort,
  lockedAnalyzerCount,
  noLocalObservationCount,
  viewMode,
  onShowAll,
  isConfirmedGuest,
  isEn,
  isVisibleForGuest,
  getLocalObservation,
}: FundamentalAnalyzerGridProps) {
  return (
    <div className="w-full">
      <Card padding="none" radius="xl" elevation="sm" overflow="visible" highlight={false} className="border-tv-border p-5">
        <div className="flex justify-between items-center border-b border-tv-border pb-3 mb-4">
          <h3 className="text-base font-bold text-white font-heading flex items-center gap-2">
            <Layers className="w-5 h-5 text-tv-accent" />
            LensFundamental
          </h3>
          <Button
            variant="bare"
            size="none"
            type="button"
            onClick={onToggleSort}
            className={`text-xs px-2 py-1 rounded border transition-colors ${sortByConfidence ? 'bg-tv-accent/20 border-tv-accent text-tv-accent' : 'border-tv-border text-tv-muted hover:text-white'}`}
          >
            Urutkan Kekuatan Rule
          </Button>
        </div>

        <p className="mb-3 lens-meta leading-relaxed text-tv-muted">Kekuatan rule 0-100 adalah intensitas aturan dari rasio yang tersedia, bukan probabilitas akurasi model atau peluang profit. Statistik lokal kunjungan, bila tampil, dipisahkan jelas dan bukan backtest/OOS.</p>

        {lockedAnalyzerCount > 0 && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-tv-yellow/30 bg-tv-yellow/10 px-3.5 py-2.5 text-xs text-tv-yellow">
            <div className="flex items-center gap-2">
              <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span><strong>{lockedAnalyzerCount} indikator fundamental lanjutan terkunci</strong> (ROA, likuiditas, margin, EPS growth).</span>
            </div>
            <Link href="/login?next=%2Ffundamental" onClick={() => trackSignupClick('fundamental_indicators')} className="shrink-0 font-bold underline underline-offset-2 hover:text-white">Masuk untuk membuka</Link>
          </div>
        )}

        {noLocalObservationCount > 0 && (
          <div className="mb-4 rounded-lg border border-tv-border bg-tv-bg/70 px-3 py-2 text-[11px] leading-relaxed text-tv-muted">
            <span className="font-semibold text-tv-text">Tracking lokal perangkat masih terbatas.</span>{' '}
            {noLocalObservationCount} dari {displayedAnalyzers.length} indikator yang tampil belum memiliki observasi kunjungan berikutnya. Ini bukan validasi historis/OOS dan tidak memengaruhi skor fundamental.
          </div>
        )}
        {viewMode === 'compact' && filteredAnalyzers.length > displayedAnalyzers.length && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-tv-blue/25 bg-tv-blue/10 px-3 py-2 text-[11px] text-tv-muted">
            <span>Mode Ringkas menampilkan wakil valuasi, profitabilitas, dan pertumbuhan/margin — bukan hanya tiga confidence tertinggi.</span>
            <Button variant="bare" size="none" type="button" onClick={onShowAll} className="shrink-0 font-semibold text-tv-blue">Lihat semua</Button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 max-h-[500px] overflow-y-auto pr-2">
          {displayedAnalyzers.length > 0 ? displayedAnalyzers.map((algo, idx) => {
            const isTop3 = sortByConfidence && idx < 3;
            const lockedForGuest = isConfirmedGuest && !isVisibleForGuest(algo.label);
            if (lockedForGuest) {
              return (
                <Card key={`${algo.label}-${idx}`} padding="none" radius="lg" elevation="none" highlight={false} className="relative flex min-h-[104px] flex-col gap-2 border-tv-border bg-tv-bg p-3">
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-tv-bg/70 backdrop-blur-[3px]">
                    <Link href="/login?next=%2Ffundamental" onClick={() => trackSignupClick('fundamental_indicators')} className="flex items-center gap-1 rounded-full border border-tv-yellow/40 bg-tv-yellow/10 px-2.5 py-1 lens-meta font-bold text-tv-yellow transition-colors hover:border-tv-yellow hover:text-white shadow-sm" aria-label={`Masuk untuk membuka indikator ${algo.label}`}>
                      <Lock className="h-3 w-3" aria-hidden="true" /> Masuk
                    </Link>
                  </div>
                  <div className="flex justify-between items-center text-sm blur-sm select-none opacity-40" aria-hidden="true">
                    <span className="text-white font-bold">{algo.label}</span>
                    <span className="font-sans text-xs font-bold px-2 py-0.5 rounded bg-tv-yellow/20 text-tv-yellow">{algo.decision}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs font-mono text-tv-muted blur-sm select-none opacity-40" aria-hidden="true">
                    <span>{algo.value}</span><span className="text-white">Rule: {algo.confidence}/100</span>
                  </div>
                </Card>
              );
            }
            const localStat = getLocalObservation(algo.label);
            const metricSource = provenanceForAnalyzer(algo.label, metricProvenance);
            return (
              <Card key={`${algo.label}-${idx}`} padding="none" radius="lg" elevation="none" overflow="visible" highlight={false} className={`p-3 bg-tv-bg flex flex-col gap-2 transition-colors ${isTop3 ? 'border-tv-green shadow-[0_0_10px_rgba(34,197,94,0.2)]' : 'border-tv-border hover:border-tv-borderLight'}`}>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-white font-bold">{algo.label}</span>
                  <span className={`font-sans text-xs font-bold px-2 py-0.5 rounded ${algo.decision === 'BULLISH' ? 'bg-tv-green/20 text-tv-green' : algo.decision === 'BEARISH' ? 'bg-tv-red/20 text-tv-red' : 'bg-tv-yellow/20 text-tv-yellow'}`}>{algo.decision}</span>
                </div>
                <div className="flex justify-between items-center text-xs font-mono text-tv-muted"><span>{algo.value}</span><span className="text-white">Rule: {algo.confidence}/100</span></div>
                <ResearchProvenanceDetails
                  label={`Sumber ${algo.label}`}
                  entries={[{ label: algo.label, value: metricSource?.value ?? null, provenance: metricSource?.provenance }]}
                />
                <div className="pt-2 border-t border-tv-hover lens-meta">
                  {!localStat ? (
                    <span className="inline-flex rounded-full border border-tv-border bg-tv-card px-2 py-0.5 font-medium text-tv-muted" title={isEn ? 'No next-visit observation has been recorded on this device.' : 'Belum ada observasi kunjungan berikutnya yang tercatat di perangkat ini.'}>
                      {isEn ? 'No local observations yet' : 'Belum ada observasi lokal'} <Info className="ml-1 h-3 w-3" aria-hidden="true" />
                    </span>
                  ) : (
                    <>
                      <span className="text-tv-muted block">{isEn ? 'Local direction check (experimental)' : 'Cek arah lokal (eksperimental)'}</span>
                      <span className="font-bold text-tv-accent">{localStat.aligned}/{localStat.total} {isEn ? 'observations aligned' : 'observasi searah'}</span>
                      <span className="mt-0.5 block text-tv-muted/80" title={isEn ? 'Compared with the price on your next visit. The horizon is not fixed, so this is not a historical backtest or model accuracy metric.' : 'Dibandingkan dengan harga saat kunjungan berikutnya. Horizon tidak tetap, jadi ini bukan backtest historis atau metrik akurasi model.'}>
                        {localStat.avgGapHours != null ? `${isEn ? 'Avg. gap' : 'Jeda rata-rata'} ${localStat.avgGapHours < 48 ? `${Math.round(localStat.avgGapHours)} ${isEn ? 'hours' : 'jam'}` : `${Math.round(localStat.avgGapHours / 24)} ${isEn ? 'days' : 'hari'}`} · ` : ''}
                        {isEn ? 'not a backtest' : 'bukan backtest'}
                      </span>
                    </>
                  )}
                </div>
              </Card>
            );
          }) : loading ? (
            <>{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-[104px] w-full" />)}<div className="col-span-full"><LoadingFact /></div></>
          ) : (
            <div className="col-span-full"><EmptyState illustration="empty" title="Belum ada indikator fundamental untuk emiten ini" description="Sumber data tidak menyediakan rasio keuangan yang cukup untuk dihitung. Emiten yang baru tercatat biasanya butuh beberapa periode laporan sebelum rasionya muncul." /></div>
          )}
        </div>
      </Card>
    </div>
  );
}
