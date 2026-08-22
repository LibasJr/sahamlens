'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock3,
  Database,
  DollarSign,
  Layers,
  RefreshCw,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { TickerAnalysisShell } from '@/components/TickerAnalysisShell';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import type {
  EarningsResultStatus,
  PublicEarningsData,
} from '@/modules/fundamental/service/public-earnings-data.service';
import EarningsExportCard from '@/components/export/EarningsExportCard';
import ExportImageButton from '@/components/export/ExportImageButton';
import { buildExportFileName } from '@/shared/format/export-filename';
import { useLanguage } from '@/lib/i18n';
import { apiErrorMessage, apiRequest } from '@/shared/http/api-client';
import MenuUsageGuide from '@/components/MenuUsageGuide';

function normalizeTicker(value: string) {
  return value.trim().toUpperCase().replace(/\.JK$/, '');
}

export default function EarningsPage() {
  const { t, language } = useLanguage();
  const isEn = language === 'en';

  const [ticker, setTicker] = useState('BBCA');
  const [data, setData] = useState<PublicEarningsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const selectedTicker = normalizeTicker(ticker) || 'BBCA';
  const exportRef = useRef<HTMLDivElement>(null);

  function formatDate(value: string | null, withTime = false) {
    if (!value) return isEn ? 'Not available' : 'Belum tersedia';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return isEn ? 'Not available' : 'Belum tersedia';
    return (
      new Intl.DateTimeFormat(isEn ? 'en-US' : 'id-ID', {
        dateStyle: 'medium',
        ...(withTime ? { timeStyle: 'short' as const } : {}),
        timeZone: 'Asia/Jakarta',
      }).format(date) + (withTime ? ' WIB' : '')
    );
  }

  function formatCompact(value: number | null, currency: string | null = null) {
    if (value == null) return 'N/A';
    const formatted = new Intl.NumberFormat(isEn ? 'en-US' : 'id-ID', {
      notation: 'compact',
      maximumFractionDigits: 2,
    }).format(value);
    return currency ? currency + ' ' + formatted : formatted;
  }

  function formatDecimal(value: number | null, currency: string | null = null) {
    if (value == null) return 'N/A';
    const formatted = new Intl.NumberFormat(isEn ? 'en-US' : 'id-ID', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value);
    return currency ? currency + ' ' + formatted : formatted;
  }

  function formatRatioPercent(value: number | null) {
    if (value == null) return 'N/A';
    return new Intl.NumberFormat(isEn ? 'en-US' : 'id-ID', {
      style: 'percent',
      minimumFractionDigits: 1,
      maximumFractionDigits: 2,
      signDisplay: 'exceptZero',
    }).format(value);
  }

  function formatDirectPercent(value: number | null) {
    if (value == null) return 'N/A';
    const sign = value > 0 ? '+' : '';
    return sign + value.toLocaleString(isEn ? 'en-US' : 'id-ID', { maximumFractionDigits: 2 }) + '%';
  }

  function resultBadge(status: EarningsResultStatus) {
    if (status === 'BEAT') return <Badge variant="success">BEAT</Badge>;
    if (status === 'MISS') return <Badge variant="danger">MISS</Badge>;
    if (status === 'INLINE') return <Badge variant="warning">{isEn ? 'IN-LINE' : 'SESUAI'}</Badge>;
    return <Badge variant="neutral">N/A</Badge>;
  }

  useEffect(() => {
    const controller = new AbortController();

    async function loadEarnings() {
      setLoading(true);
      setError(null);
      setData(null);

      try {
        const payload = await apiRequest<any>('/api/earnings/' + encodeURIComponent(selectedTicker), { signal: controller.signal });
        setData(payload as PublicEarningsData);
      } catch (caught) {
        if (controller.signal.aborted) return;
        setError(caught instanceof Error ? caught.message : (isEn ? 'Failed to fetch public earnings data.' : 'Gagal mengambil data earnings publik.'));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadEarnings();
    return () => controller.abort();
  }, [selectedTicker, reloadKey, isEn]);

  const estimateCurrency = data?.expectation.eps.currency ?? data?.stock.currency ?? null;
  const financialCurrency = data?.latestFundamentals.financialCurrency ?? data?.stock.currency ?? null;
  const latestQuarter = data?.quarters.at(-1) ?? null;

  const revisionDirection = useMemo(() => {
    const current = data?.expectation.revisions.currentEps;
    const thirtyDaysAgo = data?.expectation.revisions.eps30dAgo;
    if (current == null || thirtyDaysAgo == null) return null;
    if (current > thirtyDaysAgo) return isEn ? 'UP' : 'NAIK';
    if (current < thirtyDaysAgo) return isEn ? 'DOWN' : 'TURUN';
    return isEn ? 'FLAT' : 'TETAP';
  }, [data?.expectation.revisions.currentEps, data?.expectation.revisions.eps30dAgo, isEn]);

  // Earnings Quality Analysis (OCF / Net Income Ratio & Cash Quality)
  const earningsQuality = useMemo(() => {
    if (!data) return null;
    const ocf = data.latestFundamentals.operatingCashflow;
    const fcf = data.latestFundamentals.freeCashflow;
    const lastFourQuarterNetIncome = data.quarters
      .slice(-4)
      .map((quarter) => quarter.netIncome)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    const netIncomeTtm = lastFourQuarterNetIncome.length === 4
      ? lastFourQuarterNetIncome.reduce((sum, value) => sum + value, 0)
      : null;

    let ocfRatio: number | null = null;
    if (ocf != null && netIncomeTtm != null && netIncomeTtm > 0) {
      ocfRatio = Math.round((ocf / netIncomeTtm) * 100) / 100;
    }

    let status: 'HIGH' | 'NORMAL' | 'LOW' | 'UNKNOWN' = 'UNKNOWN';
    let statusLabel = isEn ? 'Insufficient comparable-period data' : 'Data periode sebanding belum cukup';
    if (ocfRatio != null) {
      if (ocfRatio >= 1.0) {
        status = 'HIGH';
        statusLabel = t('earningsEnhance.highQuality');
      } else if (ocfRatio >= 0.7) {
        status = 'NORMAL';
        statusLabel = t('earningsEnhance.moderateQuality');
      } else {
        status = 'LOW';
        statusLabel = t('earningsEnhance.lowQuality');
      }
    }

    return {
      ocfRatio,
      ocf,
      fcf,
      netIncomeTtm,
      status,
      statusLabel,
    };
  }, [data, isEn, t]);

  function handleTickerChange(nextTicker: string) {
    const normalized = normalizeTicker(nextTicker);
    if (!normalized) return;
    setTicker(normalized);
    window.localStorage.setItem('last_searched_ticker', normalized + '.JK');
  }

  return (
    <TickerAnalysisShell
      ticker={selectedTicker}
      onTickerChange={handleTickerChange}
      moduleTitle={isEn ? 'Earnings & Quality Monitor' : 'Earnings Monitor'}
      icon={<TrendingUp className="h-6 w-6" />}
      accent="green"
      title={`${selectedTicker} ${isEn ? 'Earnings Monitor' : 'Earnings Monitor'}`}
      subtitle={t('earningsEnhance.subtitle')}
      headerExtra={
        <div className="flex flex-wrap items-center gap-2">
      <MenuUsageGuide
        menuKey="earnings"
        whatItAnswers="Kapan emiten ini melaporkan laba, dan hasil terakhirnya bagaimana?"
        steps={[
          "Jadwal rilis membantu menyiapkan diri sebelum harga bergerak karenanya.",
          "Bandingkan hasil terakhir dengan periode yang sama tahun lalu, bukan kuartal sebelumnya.",
          "Laba naik karena penjualan berbeda artinya dengan laba naik karena pos sekali jalan.",
        ]}
      />
          <Badge variant="info" dot>{data?.source.provider || (isEn ? 'Public Source' : 'Sumber publik')}</Badge>
          {data && (
            <Badge variant={data.coverage.percent >= 60 ? 'success' : 'warning'}>
              {isEn ? 'COVERAGE' : 'CAKUPAN'} {data.coverage.available}/{data.coverage.expected}
            </Badge>
          )}
          <ExportImageButton
            targetRef={exportRef}
            fileName={buildExportFileName('Earnings', selectedTicker)}
            label={isEn ? 'Export Earnings Card' : 'Export Kartu Earnings'}
            disabled={!data || loading}
          />
        </div>
      }
    >
      {loading && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((item) => (
              <Card key={item} className="space-y-3">
                <Skeleton variant="text" className="w-28" />
                <Skeleton className="h-8 w-40 rounded-lg" />
                <Skeleton variant="text" className="w-3/4" />
              </Card>
            ))}
          </div>
          <Card className="space-y-3">
            <Skeleton variant="text" className="w-48" />
            <Skeleton className="h-52 w-full rounded-xl" />
          </Card>
        </div>
      )}

      {!loading && error && (
        <Card className="flex flex-col items-start gap-4 border-tv-red/20 bg-tv-red/[0.04]">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-tv-red" />
            <div>
              <h2 className="font-heading font-semibold text-tv-text">
                {isEn ? `Data for ${selectedTicker} could not be loaded` : `Data ${selectedTicker} belum dapat dimuat`}
              </h2>
              <p className="mt-1 text-sm text-tv-muted">{error}</p>
            </div>
          </div>
          <Button type="button" variant="secondary" onClick={() => setReloadKey((value) => value + 1)}>
            <RefreshCw className="h-4 w-4" />
            {isEn ? 'Try again' : 'Coba lagi'}
          </Button>
        </Card>
      )}

      {!loading && !error && data && (
        <>
          <Card variant="glass" className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-heading text-xl font-bold text-tv-text">{data.stock.name}</h2>
                <Badge variant="neutral">{selectedTicker}</Badge>
              </div>
              <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-tv-green">
                {[data.stock.sector, data.stock.industry].filter(Boolean).join(' · ') ||
                  (isEn ? 'Sector classification unavailable' : 'Klasifikasi sektor belum tersedia')}
              </p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-tv-muted">
                    {isEn ? 'Snapshot Price' : 'Harga snapshot'}
                  </p>
                  <p className="mt-1 font-heading text-xl font-bold text-tv-text">
                    {formatDecimal(data.stock.price, data.stock.currency)}
                  </p>
                </div>
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-tv-muted">
                    {isEn ? 'Latest Result' : 'Hasil terakhir'}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    {latestQuarter ? resultBadge(latestQuarter.status) : <Badge variant="neutral">N/A</Badge>}
                    <span className="text-xs text-tv-muted">
                      {latestQuarter?.quarter || (isEn ? 'Not available' : 'Belum tersedia')}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-tv-green/20 bg-tv-green/[0.05] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-tv-muted">
                    {isEn ? 'Next Earnings Release' : 'Rilis berikutnya'}
                  </p>
                  <p className="mt-2 font-heading text-xl font-bold text-tv-text">
                    {formatDate(data.upcoming.date, true)}
                  </p>
                  <p className="mt-1 text-xs text-tv-muted">
                    {data.upcoming.fiscalQuarter || (isEn ? 'Fiscal period unavailable' : 'Periode belum tersedia')}
                  </p>
                </div>
                <Calendar className="h-8 w-8 shrink-0 text-tv-green" />
              </div>
              <div className="mt-4">
                {data.upcoming.date ? (
                  <Badge variant={data.upcoming.isEstimate ? 'warning' : 'success'} dot>
                    {data.upcoming.isEstimate
                      ? isEn ? 'ESTIMATED DATE' : 'TANGGAL ESTIMASI'
                      : isEn ? 'CONFIRMED DATE' : 'TANGGAL TERCATAT'}
                  </Badge>
                ) : (
                  <Badge variant="neutral">{isEn ? 'SCHEDULE UNAVAILABLE' : 'JADWAL BELUM TERSEDIA'}</Badge>
                )}
              </div>
            </div>
          </Card>

          {/* Earnings Quality & Cash Flow Conversion Scorecard */}
          {earningsQuality && (
            <Card hoverable className="space-y-4 border-tv-green/20 bg-gradient-to-br from-tv-green/[0.04] to-tv-blue/[0.03]">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-tv-border pb-3">
                <div className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-tv-green" />
                  <div>
                    <h3 className="font-heading text-base font-bold text-white">{t('earningsEnhance.qualityTitle')}</h3>
                    <p className="text-xs text-tv-muted">{t('earningsEnhance.qualitySubtitle')}</p>
                  </div>
                </div>
                <Badge variant={earningsQuality.status === 'HIGH' ? 'success' : earningsQuality.status === 'NORMAL' ? 'info' : earningsQuality.status === 'LOW' ? 'warning' : 'neutral'}>
                  {earningsQuality.statusLabel}
                </Badge>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Card padding="none" radius="xl" elevation="none" highlight={false} overflow="visible" surface="60" className="p-3 border-tv-border">
                  <span className="text-[11px] text-tv-muted">{t('earningsEnhance.ocfToNetIncome')}</span>
                  <div className="text-lg font-bold font-number text-tv-green mt-1">
                    {earningsQuality.ocfRatio != null ? `${earningsQuality.ocfRatio.toFixed(2)}x` : 'N/A'}
                  </div>
                  <span className="text-[10px] text-tv-muted/70">
                    {earningsQuality.ocfRatio == null
                      ? isEn ? 'Needs OCF plus 4 complete quarters of net income' : 'Butuh OCF + laba bersih 4 kuartal lengkap'
                      : earningsQuality.ocfRatio >= 1.0
                        ? isEn ? 'High Cash Backing (> 1.0x)' : 'Didukung Kas Kuat (> 1.0x)'
                        : isEn ? 'Lower Cash Conversion' : 'Konversi Kas Rendah'}
                  </span>
                </Card>

                <Card padding="none" radius="xl" elevation="none" highlight={false} overflow="visible" surface="60" className="p-3 border-tv-border">
                  <span className="text-[11px] text-tv-muted">{isEn ? 'Operating Cash Flow (TTM)' : 'Arus Kas Operasional (TTM)'}</span>
                  <div className="text-lg font-bold font-number text-tv-blue mt-1">
                    {formatCompact(earningsQuality.ocf, financialCurrency)}
                  </div>
                  <span className="text-[10px] text-tv-muted/70">{isEn ? 'Core cash generated' : 'Kas inti yang dihasilkan'}</span>
                </Card>

                <Card padding="none" radius="xl" elevation="none" highlight={false} overflow="visible" surface="60" className="p-3 border-tv-border">
                  <span className="text-[11px] text-tv-muted">{isEn ? 'Free Cash Flow (FCF)' : 'Free Cash Flow'}</span>
                  <div className={`text-lg font-bold font-number mt-1 ${earningsQuality.fcf == null ? 'text-tv-muted' : earningsQuality.fcf >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
                    {formatCompact(earningsQuality.fcf, financialCurrency)}
                  </div>
                  <span className="text-[10px] text-tv-muted/70">{isEn ? 'After CapEx expenditures' : 'Setelah belanja modal CapEx'}</span>
                </Card>
              </div>
              <p className="text-[10px] leading-relaxed text-tv-muted">
                {isEn
                  ? 'OCF/NI is computed only when operating cash flow and four complete quarterly net-income observations are available. A single quarter is never annualized to fill missing data.'
                  : 'OCF/NI hanya dihitung bila arus kas operasi dan empat observasi laba bersih kuartalan lengkap tersedia. Satu kuartal tidak pernah disetahunkan untuk mengisi data yang hilang.'}
              </p>
            </Card>
          )}

          {/* Expectation Bar */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-tv-green" />
              <h2 className="font-heading text-lg font-bold text-tv-text">
                {isEn ? 'Next Quarter Consensus & Expectations' : 'Expectation bar kuartal berikutnya'}
              </h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Card>
                <p className="text-xs text-tv-muted">{isEn ? 'Average EPS Estimate' : 'Estimasi EPS rata-rata'}</p>
                <p className="mt-2 font-heading text-2xl font-bold text-tv-text">
                  {formatDecimal(data.expectation.eps.average, estimateCurrency)}
                </p>
                <p className="mt-2 text-xs text-tv-muted">
                  {isEn ? 'Range ' : 'Rentang '}{formatDecimal(data.expectation.eps.low)} – {formatDecimal(data.expectation.eps.high)}
                </p>
                <p className="mt-1 text-xs text-tv-muted">
                  {data.expectation.eps.analystCount == null
                    ? isEn ? 'Analyst count N/A' : 'Jumlah analis N/A'
                    : isEn ? `${data.expectation.eps.analystCount} analysts` : `${data.expectation.eps.analystCount} analis`}
                </p>
              </Card>

              <Card>
                <p className="text-xs text-tv-muted">{isEn ? 'Estimated EPS Growth' : 'Pertumbuhan EPS estimasi'}</p>
                <p className="mt-2 font-heading text-2xl font-bold text-tv-text">
                  {formatRatioPercent(data.expectation.eps.growth)}
                </p>
                <p className="mt-2 text-xs text-tv-muted">
                  {isEn ? 'Prior Year: ' : 'Tahun lalu '}{formatDecimal(data.expectation.eps.yearAgo, estimateCurrency)}
                </p>
              </Card>

              <Card>
                <p className="text-xs text-tv-muted">{isEn ? 'Revenue Estimate' : 'Estimasi pendapatan'}</p>
                <p className="mt-2 font-heading text-2xl font-bold text-tv-text">
                  {formatCompact(data.expectation.revenue.average, data.expectation.revenue.currency)}
                </p>
                <p className="mt-2 text-xs text-tv-muted">
                  Growth {formatRatioPercent(data.expectation.revenue.growth)}
                </p>
                <p className="mt-1 text-xs text-tv-muted">
                  {data.expectation.revenue.analystCount == null
                    ? isEn ? 'Analyst count N/A' : 'Jumlah analis N/A'
                    : isEn ? `${data.expectation.revenue.analystCount} analysts` : `${data.expectation.revenue.analystCount} analis`}
                </p>
              </Card>

              <Card>
                <p className="text-xs text-tv-muted">{isEn ? '30-Day EPS Revisions' : 'Revisi EPS 30 hari'}</p>
                <div className="mt-2 flex items-center gap-2">
                  <p className="font-heading text-2xl font-bold text-tv-text">{revisionDirection || 'N/A'}</p>
                  {revisionDirection === 'NAIK' || revisionDirection === 'UP' ? (
                    <Badge variant="success">{isEn ? 'POSITIVE' : 'POSITIF'}</Badge>
                  ) : revisionDirection === 'TURUN' || revisionDirection === 'DOWN' ? (
                    <Badge variant="danger">{isEn ? 'NEGATIVE' : 'NEGATIF'}</Badge>
                  ) : (
                    <Badge variant="neutral">{isEn ? 'FLAT' : 'DATAR'}</Badge>
                  )}
                </div>
                <p className="mt-2 text-xs text-tv-muted">
                  {isEn ? 'Current: ' : 'Sekarang '}{formatDecimal(data.expectation.revisions.currentEps)} · {isEn ? '30d ago: ' : '30 hari lalu '}{formatDecimal(data.expectation.revisions.eps30dAgo)}
                </p>
              </Card>
            </div>
          </section>

          {/* Historical EPS Table */}
          <Card padding="none">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.07] p-4 md:p-5">
              <div>
                <h2 className="font-heading font-semibold text-tv-text">
                  {isEn ? 'Historical Actual vs Estimated EPS' : 'Riwayat EPS aktual vs estimasi'}
                </h2>
                <p className="mt-1 text-xs text-tv-muted">
                  {isEn
                    ? 'Beat/miss is displayed only when both actual and estimate are recorded.'
                    : 'Beat/miss hanya ditampilkan saat actual dan estimasi sama-sama tersedia.'}
                </p>
              </div>
              <Badge variant="neutral">{data.quarters.length} {isEn ? 'QUARTERS' : 'KUARTAL'}</Badge>
            </div>

            {data.periodCoverage &&
              (data.periodCoverage.missingQuarters.length > 0 ||
                data.periodCoverage.addedFromTimeSeries > 0 ||
                data.periodCoverage.filledFromTimeSeries > 0) && (
                <div className="border-b border-white/[0.07] px-4 py-3 md:px-5">
                  {data.periodCoverage.missingQuarters.length > 0 && (
                    <p className="text-[11px] leading-relaxed text-tv-yellow">
                      <span className="font-semibold">
                        {isEn ? 'Quarters with unavailable data: ' : 'Ada kuartal yang datanya tidak tersedia: '}
                      </span>
                      {data.periodCoverage.missingQuarters.join(', ')}.
                    </p>
                  )}
                </div>
              )}
            {data.quarters.length > 0 ? (
              <div className="lens-table-sticky-col overflow-x-auto">
                <table className="w-full min-w-[880px] text-left text-xs">
                  <thead className="border-b border-white/[0.07] bg-white/[0.02] text-[10px] uppercase tracking-[0.1em] text-tv-muted">
                    <tr>
                      <th className="px-4 py-3 font-semibold">{isEn ? 'Quarter' : 'Kuartal'}</th>
                      <th className="px-4 py-3 text-right font-semibold">{isEn ? 'Actual EPS' : 'EPS aktual'}</th>
                      <th className="px-4 py-3 text-right font-semibold">{isEn ? 'Estimated' : 'Estimasi'}</th>
                      <th className="px-4 py-3 text-right font-semibold">{isEn ? 'Surprise' : 'Surprise'}</th>
                      <th className="px-4 py-3 text-center font-semibold">{isEn ? 'Verdict' : 'Hasil'}</th>
                      <th className="px-4 py-3 text-right font-semibold">{isEn ? 'Revenue' : 'Pendapatan'}</th>
                      <th className="px-4 py-3 text-right font-semibold">{isEn ? 'Net Income' : 'Laba bersih'}</th>
                      <th className="px-4 py-3 text-right font-semibold">{isEn ? 'Margin' : 'Margin'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.055]">
                    {data.quarters.map((quarter) => (
                      <tr key={quarter.quarter + String(quarter.periodEnd)} className="hover:bg-white/[0.025]">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-tv-text">{quarter.quarter}</p>
                          <p className="mt-0.5 text-[10px] text-tv-muted">
                            {formatDate(quarter.reportedDate ?? quarter.periodEnd)}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-right font-number text-tv-text">
                          {formatDecimal(quarter.actualEps)}
                        </td>
                        <td className="px-4 py-3 text-right font-number text-tv-muted">
                          {formatDecimal(quarter.estimatedEps)}
                        </td>
                        <td
                          className={
                            'px-4 py-3 text-right font-number ' +
                            ((quarter.surprisePct ?? 0) >= 0 ? 'text-tv-green' : 'text-tv-red')
                          }
                        >
                          {formatDirectPercent(quarter.surprisePct)}
                        </td>
                        <td className="px-4 py-3 text-center">{resultBadge(quarter.status)}</td>
                        <td className="px-4 py-3 text-right font-number text-tv-text">
                          {formatCompact(quarter.revenue, financialCurrency)}
                        </td>
                        <td className="px-4 py-3 text-right font-number text-tv-text">
                          {formatCompact(quarter.netIncome, financialCurrency)}
                        </td>
                        <td className="px-4 py-3 text-right font-number text-tv-text">
                          {formatRatioPercent(quarter.profitMargin)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="p-5 text-sm text-tv-muted">
                {isEn ? 'Historical quarterly EPS unavailable.' : 'Riwayat EPS kuartalan belum tersedia dari penyedia data.'}
              </p>
            )}
          </Card>

          {/* Fundamentals & Annual Trends */}
          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-tv-green" />
                <h2 className="font-heading font-semibold text-tv-text">
                  {isEn ? 'Latest Financial Fundamentals' : 'Fundamental terbaru'}
                </h2>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {[
                  ['Revenue growth', formatRatioPercent(data.latestFundamentals.revenueGrowth)],
                  ['Earnings growth', formatRatioPercent(data.latestFundamentals.earningsGrowth)],
                  ['Net margin', formatRatioPercent(data.latestFundamentals.profitMargin)],
                  ['Operating margin', formatRatioPercent(data.latestFundamentals.operatingMargin)],
                  ['Operating cash flow', formatCompact(data.latestFundamentals.operatingCashflow, financialCurrency)],
                  ['Free cash flow', formatCompact(data.latestFundamentals.freeCashflow, financialCurrency)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
                    <p className="text-[10px] text-tv-muted">{label}</p>
                    <p className="mt-1 font-heading text-sm font-bold text-tv-text">{value}</p>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-tv-blue" />
                <h2 className="font-heading font-semibold text-tv-text">
                  {isEn ? 'Annual Revenue & Profit Trajectory' : 'Tren tahunan pendapatan dan laba'}
                </h2>
              </div>
              {data.annuals.length > 0 ? (
                <div className="mt-4 space-y-2">
                  {data.annuals.map((annual) => (
                    <div
                      key={annual.year}
                      className="grid grid-cols-[52px_1fr_1fr] items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-2.5"
                    >
                      <p className="font-heading text-sm font-bold text-tv-text">{annual.year}</p>
                      <div>
                        <p className="text-[10px] text-tv-muted">{isEn ? 'Revenue' : 'Pendapatan'}</p>
                        <p className="text-xs font-semibold text-tv-text">
                          {formatCompact(annual.revenue, financialCurrency)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-tv-muted">{isEn ? 'Net Income · Margin' : 'Laba · Margin'}</p>
                        <p className="text-xs font-semibold text-tv-text">
                          {formatCompact(annual.netIncome, financialCurrency)} · {formatRatioPercent(annual.profitMargin)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm text-tv-muted">
                  {isEn ? 'Annual trend unavailable from provider.' : 'Tren tahunan belum tersedia dari penyedia data.'}
                </p>
              )}
            </Card>
          </div>

          <Card className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
            <div>
              <div className="flex items-center gap-2">
                <Database className="h-5 w-5 text-tv-blue" />
                <h2 className="font-heading font-semibold text-tv-text">{isEn ? 'Sources, Coverage & Caveats' : 'Sumber, periode, dan batasan'}</h2>
              </div>
              <div className="mt-3 space-y-2 text-xs leading-5 text-tv-muted">
                <p>
                  {isEn ? 'Source: ' : 'Sumber: '}<span className="font-semibold text-tv-text">{data.source.provider}</span> · {isEn ? 'retrieved ' : 'diambil '}{formatDate(data.source.retrievedAt, true)}.
                </p>
                <p>
                  {isEn
                    ? 'EPS methodology and revisions represent standardized provider feeds, not direct corporate guidance.'
                    : 'Basis EPS serta konsensus merupakan data feed terstandardisasi, bukan bimbingan resmi emiten.'}
                </p>
              </div>
            </div>
            <Link href="/calendar" className="inline-flex items-center gap-2 text-sm font-semibold text-tv-blue hover:underline">
              <Clock3 className="h-4 w-4" />
              {isEn ? 'Open Corporate Calendar' : 'Buka Corporate Calendar'}
            </Link>
          </Card>
        </>
      )}

      {data && (
        <div style={{ position: 'fixed', top: 0, left: 0, opacity: 0, pointerEvents: 'none', zIndex: -1 }}>
          <div ref={exportRef}>
            <EarningsExportCard
              ticker={selectedTicker}
              stock={{ name: data.stock.name, price: data.stock.price, sector: data.stock.sector }}
              upcoming={data.upcoming}
              expectation={{ eps: data.expectation.eps, revenue: data.expectation.revenue }}
              latestQuarter={latestQuarter}
              exportedAt={new Date()}
            />
          </div>
        </div>
      )}
    </TickerAnalysisShell>
  );
}
