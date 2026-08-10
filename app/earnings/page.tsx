'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock3,
  Database,
  RefreshCw,
  TrendingUp,
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

function normalizeTicker(value: string) {
  return value.trim().toUpperCase().replace(/\.JK$/, '');
}

function formatDate(value: string | null, withTime = false) {
  if (!value) return 'Belum tersedia';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Belum tersedia';
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    ...(withTime ? { timeStyle: 'short' as const } : {}),
    timeZone: 'Asia/Jakarta',
  }).format(date) + (withTime ? ' WIB' : '');
}

function formatCompact(value: number | null, currency: string | null = null) {
  if (value == null) return 'N/A';
  const formatted = new Intl.NumberFormat('id-ID', {
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(value);
  return currency ? currency + ' ' + formatted : formatted;
}

function formatDecimal(value: number | null, currency: string | null = null) {
  if (value == null) return 'N/A';
  const formatted = new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
  return currency ? currency + ' ' + formatted : formatted;
}

function formatRatioPercent(value: number | null) {
  if (value == null) return 'N/A';
  return new Intl.NumberFormat('id-ID', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
    signDisplay: 'exceptZero',
  }).format(value);
}

function formatDirectPercent(value: number | null) {
  if (value == null) return 'N/A';
  const sign = value > 0 ? '+' : '';
  return sign + value.toLocaleString('id-ID', { maximumFractionDigits: 2 }) + '%';
}

function resultBadge(status: EarningsResultStatus) {
  if (status === 'BEAT') return <Badge variant='success'>BEAT</Badge>;
  if (status === 'MISS') return <Badge variant='danger'>MISS</Badge>;
  if (status === 'INLINE') return <Badge variant='warning'>SESUAI</Badge>;
  return <Badge variant='neutral'>N/A</Badge>;
}

function EarningsLoading() {
  return (
    <div className='space-y-4'>
      <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
        {[0, 1, 2, 3].map((item) => (
          <Card key={item} className='space-y-3'>
            <Skeleton variant='text' className='w-28' />
            <Skeleton className='h-8 w-40 rounded-lg' />
            <Skeleton variant='text' className='w-3/4' />
          </Card>
        ))}
      </div>
      <Card className='space-y-3'>
        <Skeleton variant='text' className='w-48' />
        <Skeleton className='h-52 w-full rounded-xl' />
      </Card>
    </div>
  );
}

export default function EarningsPage() {
  const [ticker, setTicker] = useState('BBCA');
  const [data, setData] = useState<PublicEarningsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const selectedTicker = normalizeTicker(ticker) || 'BBCA';

  useEffect(() => {
    const controller = new AbortController();

    async function loadEarnings() {
      setLoading(true);
      setError(null);
      setData(null);

      try {
        const response = await fetch('/api/earnings/' + encodeURIComponent(selectedTicker), {
          signal: controller.signal,
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error || 'Data earnings publik belum tersedia.');
        }
        setData(payload as PublicEarningsData);
      } catch (caught) {
        if (controller.signal.aborted) return;
        setError(caught instanceof Error ? caught.message : 'Gagal mengambil data earnings publik.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadEarnings();
    return () => controller.abort();
  }, [selectedTicker, reloadKey]);

  const estimateCurrency = data?.expectation.eps.currency ?? data?.stock.currency ?? null;
  const financialCurrency = data?.latestFundamentals.financialCurrency ?? data?.stock.currency ?? null;
  const latestQuarter = data?.quarters.at(-1) ?? null;
  const revisionDirection = useMemo(() => {
    const current = data?.expectation.revisions.currentEps;
    const thirtyDaysAgo = data?.expectation.revisions.eps30dAgo;
    if (current == null || thirtyDaysAgo == null) return null;
    if (current > thirtyDaysAgo) return 'NAIK';
    if (current < thirtyDaysAgo) return 'TURUN';
    return 'TETAP';
  }, [data?.expectation.revisions.currentEps, data?.expectation.revisions.eps30dAgo]);

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
      moduleTitle='Earnings Monitor'
      icon={<TrendingUp className='h-6 w-6' />}
      accent='green'
      title={selectedTicker + '.JK Earnings Monitor'}
      subtitle='Jadwal, konsensus, revisi estimasi, dan hasil kuartalan dari data publik yang tersedia. Bukan panduan resmi emiten.'
      headerExtra={
        <div className='flex flex-wrap items-center gap-2'>
          <Badge variant='info' dot>{data?.source.provider || 'Sumber publik'}</Badge>
          {data && (
            <Badge variant={data.coverage.percent >= 60 ? 'success' : 'warning'}>
              CAKUPAN {data.coverage.available}/{data.coverage.expected}
            </Badge>
          )}
        </div>
      }
    >
      {loading && <EarningsLoading />}

      {!loading && error && (
        <Card className='flex flex-col items-start gap-4 border-tv-red/20 bg-tv-red/[0.04]'>
          <div className='flex items-start gap-3'>
            <AlertTriangle className='mt-0.5 h-5 w-5 shrink-0 text-tv-red' />
            <div>
              <h2 className='font-heading font-semibold text-tv-text'>Data {selectedTicker} belum dapat dimuat</h2>
              <p className='mt-1 text-sm text-tv-muted'>{error}</p>
            </div>
          </div>
          <Button type='button' variant='secondary' onClick={() => setReloadKey((value) => value + 1)}>
            <RefreshCw className='h-4 w-4' />
            Coba lagi
          </Button>
        </Card>
      )}

      {!loading && !error && data && (
        <>
          <Card variant='glass' className='grid gap-5 lg:grid-cols-[1.4fr_1fr]'>
            <div>
              <div className='flex flex-wrap items-center gap-2'>
                <h2 className='font-heading text-xl font-bold text-tv-text'>{data.stock.name}</h2>
                <Badge variant='neutral'>{selectedTicker}.JK</Badge>
              </div>
              <p className='mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-tv-green'>
                {[data.stock.sector, data.stock.industry].filter(Boolean).join(' · ') || 'Klasifikasi sektor belum tersedia'}
              </p>
              <div className='mt-5 grid gap-3 sm:grid-cols-2'>
                <div className='rounded-xl border border-white/[0.06] bg-white/[0.025] p-3'>
                  <p className='text-[10px] font-bold uppercase tracking-[0.12em] text-tv-muted'>Harga snapshot</p>
                  <p className='mt-1 font-heading text-xl font-bold text-tv-text'>
                    {formatDecimal(data.stock.price, data.stock.currency)}
                  </p>
                </div>
                <div className='rounded-xl border border-white/[0.06] bg-white/[0.025] p-3'>
                  <p className='text-[10px] font-bold uppercase tracking-[0.12em] text-tv-muted'>Hasil terakhir</p>
                  <div className='mt-2 flex items-center gap-2'>
                    {latestQuarter ? resultBadge(latestQuarter.status) : <Badge variant='neutral'>N/A</Badge>}
                    <span className='text-xs text-tv-muted'>{latestQuarter?.quarter || 'Belum tersedia'}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className='rounded-2xl border border-tv-green/20 bg-tv-green/[0.05] p-4'>
              <div className='flex items-start justify-between gap-3'>
                <div>
                  <p className='text-[10px] font-bold uppercase tracking-[0.14em] text-tv-muted'>Rilis berikutnya</p>
                  <p className='mt-2 font-heading text-xl font-bold text-tv-text'>
                    {formatDate(data.upcoming.date, true)}
                  </p>
                  <p className='mt-1 text-xs text-tv-muted'>
                    {data.upcoming.fiscalQuarter || 'Periode belum tersedia'}
                  </p>
                </div>
                <Calendar className='h-8 w-8 shrink-0 text-tv-green' />
              </div>
              <div className='mt-4'>
                {data.upcoming.date ? (
                  <Badge variant={data.upcoming.isEstimate ? 'warning' : 'success'} dot>
                    {data.upcoming.isEstimate ? 'TANGGAL ESTIMASI' : 'TANGGAL TERCATAT'}
                  </Badge>
                ) : (
                  <Badge variant='neutral'>JADWAL BELUM TERSEDIA</Badge>
                )}
              </div>
            </div>
          </Card>

          <section>
            <div className='mb-3 flex items-center gap-2'>
              <BarChart3 className='h-5 w-5 text-tv-green' />
              <h2 className='font-heading text-lg font-bold text-tv-text'>Expectation bar kuartal berikutnya</h2>
            </div>
            <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
              <Card>
                <p className='text-xs text-tv-muted'>Estimasi EPS rata-rata</p>
                <p className='mt-2 font-heading text-2xl font-bold text-tv-text'>
                  {formatDecimal(data.expectation.eps.average, estimateCurrency)}
                </p>
                <p className='mt-2 text-xs text-tv-muted'>
                  Rentang {formatDecimal(data.expectation.eps.low)} – {formatDecimal(data.expectation.eps.high)}
                </p>
                <p className='mt-1 text-xs text-tv-muted'>
                  {data.expectation.eps.analystCount == null ? 'Jumlah analis N/A' : String(data.expectation.eps.analystCount) + ' analis'}
                </p>
              </Card>

              <Card>
                <p className='text-xs text-tv-muted'>Pertumbuhan EPS estimasi</p>
                <p className='mt-2 font-heading text-2xl font-bold text-tv-text'>
                  {formatRatioPercent(data.expectation.eps.growth)}
                </p>
                <p className='mt-2 text-xs text-tv-muted'>
                  Tahun lalu {formatDecimal(data.expectation.eps.yearAgo, estimateCurrency)}
                </p>
              </Card>

              <Card>
                <p className='text-xs text-tv-muted'>Estimasi pendapatan</p>
                <p className='mt-2 font-heading text-2xl font-bold text-tv-text'>
                  {formatCompact(data.expectation.revenue.average, data.expectation.revenue.currency)}
                </p>
                <p className='mt-2 text-xs text-tv-muted'>
                  Growth {formatRatioPercent(data.expectation.revenue.growth)}
                </p>
                <p className='mt-1 text-xs text-tv-muted'>
                  {data.expectation.revenue.analystCount == null ? 'Jumlah analis N/A' : String(data.expectation.revenue.analystCount) + ' analis'}
                </p>
              </Card>

              <Card>
                <p className='text-xs text-tv-muted'>Revisi EPS 30 hari</p>
                <div className='mt-2 flex items-center gap-2'>
                  <p className='font-heading text-2xl font-bold text-tv-text'>{revisionDirection || 'N/A'}</p>
                  {revisionDirection === 'NAIK' && <Badge variant='success'>POSITIF</Badge>}
                  {revisionDirection === 'TURUN' && <Badge variant='danger'>NEGATIF</Badge>}
                  {revisionDirection === 'TETAP' && <Badge variant='neutral'>DATAR</Badge>}
                </div>
                <p className='mt-2 text-xs text-tv-muted'>
                  Sekarang {formatDecimal(data.expectation.revisions.currentEps)} · 30 hari lalu {formatDecimal(data.expectation.revisions.eps30dAgo)}
                </p>
                <p className='mt-1 text-xs text-tv-muted'>
                  Naik {data.expectation.revisions.up30d ?? 'N/A'} · Turun {data.expectation.revisions.down30d ?? 'N/A'}
                </p>
              </Card>
            </div>
          </section>

          <section>
            <div className='mb-3 flex items-center gap-2'>
              <AlertTriangle className='h-5 w-5 text-tv-warning' />
              <h2 className='font-heading text-lg font-bold text-tv-text'>Warning berbasis data publik</h2>
            </div>
            {data.warnings.length > 0 ? (
              <div className='grid gap-3 md:grid-cols-2'>
                {data.warnings.map((warning) => (
                  <Card
                    key={warning.code}
                    padding='sm'
                    className={warning.level === 'CAUTION' ? 'border-tv-warning/20 bg-tv-warning/[0.04]' : ''}
                  >
                    <div className='flex items-start gap-2.5'>
                      <AlertTriangle className={'mt-0.5 h-4 w-4 shrink-0 ' + (warning.level === 'CAUTION' ? 'text-tv-warning' : 'text-tv-blue')} />
                      <div>
                        <p className='text-xs font-semibold text-tv-text'>{warning.title}</p>
                        <p className='mt-1 text-xs leading-5 text-tv-muted'>{warning.detail}</p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <Card padding='sm' className='border-tv-green/15 bg-tv-green/[0.04]'>
                <div className='flex items-center gap-2 text-sm text-tv-text'>
                  <CheckCircle2 className='h-4 w-4 text-tv-green' />
                  Tidak ada warning yang dapat disimpulkan dari data publik yang tersedia saat ini.
                </div>
              </Card>
            )}
          </section>

          <Card padding='none'>
            <div className='flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.07] p-4 md:p-5'>
              <div>
                <h2 className='font-heading font-semibold text-tv-text'>Riwayat EPS aktual vs estimasi</h2>
                <p className='mt-1 text-xs text-tv-muted'>Beat/miss hanya ditampilkan saat actual dan estimasi sama-sama tersedia.</p>
              </div>
              <Badge variant='neutral'>{data.quarters.length} KUARTAL</Badge>
            </div>
            {data.quarters.length > 0 ? (
              <div className='overflow-x-auto'>
                <table className='w-full min-w-[880px] text-left text-xs'>
                  <thead className='border-b border-white/[0.07] bg-white/[0.02] text-[10px] uppercase tracking-[0.1em] text-tv-muted'>
                    <tr>
                      <th className='px-4 py-3 font-semibold'>Kuartal</th>
                      <th className='px-4 py-3 text-right font-semibold'>EPS aktual</th>
                      <th className='px-4 py-3 text-right font-semibold'>Estimasi</th>
                      <th className='px-4 py-3 text-right font-semibold'>Surprise</th>
                      <th className='px-4 py-3 text-center font-semibold'>Hasil</th>
                      <th className='px-4 py-3 text-right font-semibold'>Pendapatan</th>
                      <th className='px-4 py-3 text-right font-semibold'>Laba bersih</th>
                      <th className='px-4 py-3 text-right font-semibold'>Margin</th>
                    </tr>
                  </thead>
                  <tbody className='divide-y divide-white/[0.055]'>
                    {data.quarters.map((quarter) => (
                      <tr key={quarter.quarter + String(quarter.periodEnd)} className='hover:bg-white/[0.025]'>
                        <td className='px-4 py-3'>
                          <p className='font-semibold text-tv-text'>{quarter.quarter}</p>
                          <p className='mt-0.5 text-[10px] text-tv-muted'>{formatDate(quarter.reportedDate ?? quarter.periodEnd)}</p>
                        </td>
                        <td className='px-4 py-3 text-right font-number text-tv-text'>{formatDecimal(quarter.actualEps)}</td>
                        <td className='px-4 py-3 text-right font-number text-tv-muted'>{formatDecimal(quarter.estimatedEps)}</td>
                        <td className={'px-4 py-3 text-right font-number ' + ((quarter.surprisePct ?? 0) >= 0 ? 'text-tv-green' : 'text-tv-red')}>
                          {formatDirectPercent(quarter.surprisePct)}
                        </td>
                        <td className='px-4 py-3 text-center'>{resultBadge(quarter.status)}</td>
                        <td className='px-4 py-3 text-right font-number text-tv-text'>{formatCompact(quarter.revenue, financialCurrency)}</td>
                        <td className='px-4 py-3 text-right font-number text-tv-text'>{formatCompact(quarter.netIncome, financialCurrency)}</td>
                        <td className='px-4 py-3 text-right font-number text-tv-text'>{formatRatioPercent(quarter.profitMargin)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className='p-5 text-sm text-tv-muted'>Riwayat EPS kuartalan belum tersedia dari penyedia data.</p>
            )}
          </Card>

          <div className='grid gap-4 xl:grid-cols-2'>
            <Card>
              <div className='flex items-center gap-2'>
                <TrendingUp className='h-5 w-5 text-tv-green' />
                <h2 className='font-heading font-semibold text-tv-text'>Fundamental terbaru</h2>
              </div>
              <div className='mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3'>
                {[
                  ['Revenue growth', formatRatioPercent(data.latestFundamentals.revenueGrowth)],
                  ['Earnings growth', formatRatioPercent(data.latestFundamentals.earningsGrowth)],
                  ['Net margin', formatRatioPercent(data.latestFundamentals.profitMargin)],
                  ['Operating margin', formatRatioPercent(data.latestFundamentals.operatingMargin)],
                  ['Operating cash flow', formatCompact(data.latestFundamentals.operatingCashflow, financialCurrency)],
                  ['Free cash flow', formatCompact(data.latestFundamentals.freeCashflow, financialCurrency)],
                ].map(([label, value]) => (
                  <div key={label} className='rounded-xl border border-white/[0.06] bg-white/[0.025] p-3'>
                    <p className='text-[10px] text-tv-muted'>{label}</p>
                    <p className='mt-1 font-heading text-sm font-bold text-tv-text'>{value}</p>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <div className='flex items-center gap-2'>
                <BarChart3 className='h-5 w-5 text-tv-blue' />
                <h2 className='font-heading font-semibold text-tv-text'>Tren tahunan pendapatan dan laba</h2>
              </div>
              {data.annuals.length > 0 ? (
                <div className='mt-4 space-y-2'>
                  {data.annuals.map((annual) => (
                    <div key={annual.year} className='grid grid-cols-[52px_1fr_1fr] items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-2.5'>
                      <p className='font-heading text-sm font-bold text-tv-text'>{annual.year}</p>
                      <div>
                        <p className='text-[10px] text-tv-muted'>Pendapatan</p>
                        <p className='text-xs font-semibold text-tv-text'>{formatCompact(annual.revenue, financialCurrency)}</p>
                      </div>
                      <div>
                        <p className='text-[10px] text-tv-muted'>Laba · Margin</p>
                        <p className='text-xs font-semibold text-tv-text'>
                          {formatCompact(annual.netIncome, financialCurrency)} · {formatRatioPercent(annual.profitMargin)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className='mt-4 text-sm text-tv-muted'>Tren tahunan belum tersedia dari penyedia data.</p>
              )}
            </Card>
          </div>

          <Card className='grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start'>
            <div>
              <div className='flex items-center gap-2'>
                <Database className='h-5 w-5 text-tv-blue' />
                <h2 className='font-heading font-semibold text-tv-text'>Sumber, periode, dan batasan</h2>
              </div>
              <div className='mt-3 space-y-2 text-xs leading-5 text-tv-muted'>
                <p>
                  Sumber: <span className='font-semibold text-tv-text'>{data.source.provider}</span> · diambil {formatDate(data.source.retrievedAt, true)}.
                </p>
                <p>
                  Basis EPS: {data.upcoming.methodology ? data.upcoming.methodology.toUpperCase() : 'N/A'}. Konsensus dan revisi merupakan data provider terstandardisasi, bukan guidance resmi emiten.
                </p>
                <p>
                  Tanggal estimasi dapat berubah. Cocokkan jadwal dan angka material dengan keterbukaan informasi IDX serta situs investor relations perusahaan.
                </p>
              </div>
            </div>
            <a href='/calendar' className='inline-flex items-center gap-2 text-sm font-semibold text-tv-blue hover:underline'>
              <Clock3 className='h-4 w-4' />
              Buka Corporate Calendar
            </a>
          </Card>
        </>
      )}
    </TickerAnalysisShell>
  );
}
