'use client';

import { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Compass,
  Database,
  ExternalLink,
  Globe,
  Landmark,
  RefreshCw,
} from 'lucide-react';
import Header from '@/components/Header';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageContainer } from '@/components/ui/PageContainer';
import { Skeleton } from '@/components/ui/Skeleton';
import type {
  MacroMarketIndicator,
  MacroOfficialIndicator,
  MacroTrend,
  PublicMacroDashboard,
} from '@/modules/macro/service/public-macro-dashboard.service';

function formatNumber(value: number, maximumFractionDigits = 2) {
  return new Intl.NumberFormat('id-ID', {
    maximumFractionDigits,
  }).format(value);
}

function formatCompact(value: number) {
  return new Intl.NumberFormat('id-ID', {
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(value);
}

function formatMarketValue(item: MacroMarketIndicator) {
  if (item.key === 'USD_IDR') return 'Rp' + formatNumber(item.value, 0);
  if (item.key === 'IHSG') return formatNumber(item.value, 2);
  if (item.key === 'US10Y') return formatNumber(item.value, 3) + '%';
  if (item.key === 'WTI' || item.key === 'GOLD') return '$' + formatNumber(item.value, 2);
  return formatNumber(item.value, 2);
}

function formatOfficialValue(item: MacroOfficialIndicator) {
  if (item.key === 'RESERVES') return '$' + formatCompact(item.value);
  return formatNumber(item.value, 2) + '%';
}

function formatPreviousValue(item: MacroOfficialIndicator) {
  if (item.previousValue == null) return 'Pembanding belum tersedia';
  const value = item.key === 'RESERVES'
    ? '$' + formatCompact(item.previousValue)
    : formatNumber(item.previousValue, 2) + '%';
  return (item.previousPeriod || 'Periode sebelumnya') + ': ' + value;
}

function formatDateTime(value: string | null) {
  if (!value) return 'Waktu pasar N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Waktu pasar N/A';
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(date) + ' WIB';
}

function trendBadge(trend: MacroTrend) {
  if (trend === 'UP') return <Badge variant='info'>NAIK</Badge>;
  if (trend === 'DOWN') return <Badge variant='info'>TURUN</Badge>;
  if (trend === 'FLAT') return <Badge variant='neutral'>DATAR</Badge>;
  return <Badge variant='neutral'>TREN N/A</Badge>;
}

function MacroLoading() {
  return (
    <div className='space-y-5'>
      <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-3'>
        {[0, 1, 2, 3, 4, 5].map((item) => (
          <Card key={item} className='space-y-3'>
            <Skeleton variant='text' className='w-28' />
            <Skeleton className='h-8 w-36 rounded-lg' />
            <Skeleton variant='text' className='w-3/4' />
          </Card>
        ))}
      </div>
      <div className='grid gap-4 lg:grid-cols-2'>
        {[0, 1, 2, 3].map((item) => (
          <Card key={item} className='space-y-3'>
            <Skeleton variant='text' className='w-40' />
            <Skeleton className='h-20 w-full rounded-xl' />
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function MacroPage() {
  const [ticker, setTicker] = useState('BBCA');
  const [data, setData] = useState<PublicMacroDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadMacro() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/macro', { signal: controller.signal });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error || 'Data makro publik belum dapat dimuat.');
        }
        setData(payload as PublicMacroDashboard);
      } catch (caught) {
        if (controller.signal.aborted) return;
        setError(caught instanceof Error ? caught.message : 'Gagal mengambil data makro publik.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadMacro();
    return () => controller.abort();
  }, [reloadKey]);

  return (
    <div className='flex min-h-screen flex-1 flex-col bg-tv-bg'>
      <Header
        currentTicker={ticker}
        onTickerChange={setTicker}
        moduleTitle='Macro Dashboard'
      />

      <PageContainer className='space-y-6 p-4 md:p-6 lg:p-7'>
        <Card variant='glass' className='flex flex-col gap-5 md:flex-row md:items-center md:justify-between'>
          <div className='flex min-w-0 items-center gap-4'>
            <div className='grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-indigo-400/20 bg-indigo-400/10 text-indigo-400'>
              <Globe className='h-6 w-6' />
            </div>
            <div>
              <p className='text-[10px] font-bold uppercase tracking-[0.14em] text-tv-muted'>Indonesia macro monitor</p>
              <h1 className='font-heading text-xl font-bold tracking-tight text-tv-text sm:text-2xl'>
                Dashboard Makroekonomi Indonesia
              </h1>
              <p className='mt-1 max-w-3xl text-sm leading-relaxed text-tv-muted'>
                Data pasar publik, indikator ekonomi resmi, dan mekanisme dampaknya ke sektor IDX. Tidak memuat target IHSG atau rekomendasi sektor buatan.
              </p>
            </div>
          </div>
          <div className='flex flex-wrap items-center gap-2'>
            {data && (
              <Badge variant={data.coverage.percent >= 70 ? 'success' : 'warning'}>
                CAKUPAN {data.coverage.available}/{data.coverage.expected}
              </Badge>
            )}
            <Button
              type='button'
              size='sm'
              variant='secondary'
              loading={loading}
              onClick={() => setReloadKey((value) => value + 1)}
            >
              <RefreshCw className='h-4 w-4' />
              Perbarui
            </Button>
          </div>
        </Card>

        {loading && <MacroLoading />}

        {!loading && error && (
          <Card className='flex flex-col items-start gap-4 border-tv-red/20 bg-tv-red/[0.04]'>
            <div className='flex items-start gap-3'>
              <AlertTriangle className='mt-0.5 h-5 w-5 shrink-0 text-tv-red' />
              <div>
                <h2 className='font-heading font-semibold text-tv-text'>Data makro belum dapat dimuat</h2>
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
            <section>
              <div className='mb-3 flex flex-wrap items-center justify-between gap-3'>
                <div className='flex items-center gap-2'>
                  <Activity className='h-5 w-5 text-tv-blue' />
                  <div>
                    <h2 className='font-heading text-lg font-bold text-tv-text'>Pasar dan variabel global</h2>
                    <p className='text-xs text-tv-muted'>Snapshot publik; perubahan menunjukkan pergerakan sesi terakhir.</p>
                  </div>
                </div>
                <Badge variant='info' dot>YAHOO FINANCE</Badge>
              </div>

              {data.market.length > 0 ? (
                <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-3'>
                  {data.market.map((item) => {
                    const positive = (item.changePct ?? 0) > 0;
                    const negative = (item.changePct ?? 0) < 0;
                    return (
                      <Card key={item.key} hoverable>
                        <div className='flex items-start justify-between gap-3'>
                          <div>
                            <p className='text-xs font-semibold text-tv-muted'>{item.label}</p>
                            <p className='mt-2 font-heading text-2xl font-bold text-tv-text'>{formatMarketValue(item)}</p>
                          </div>
                          <div className={'flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold ' + (
                            positive ? 'bg-tv-blue/10 text-tv-blue'
                              : negative ? 'bg-tv-purple/10 text-tv-purple'
                                : 'bg-white/[0.05] text-tv-muted'
                          )}>
                            {positive && <ArrowUpRight className='h-3.5 w-3.5' />}
                            {negative && <ArrowDownRight className='h-3.5 w-3.5' />}
                            {item.changePct == null ? 'N/A' : (positive ? '+' : '') + formatNumber(item.changePct, 2) + '%'}
                          </div>
                        </div>
                        <div className='mt-4 flex items-end justify-between gap-2'>
                          <p className='text-[10px] leading-4 text-tv-muted'>{formatDateTime(item.asOf)}</p>
                          <a
                            href={item.sourceUrl}
                            target='_blank'
                            rel='noreferrer'
                            aria-label={'Buka sumber ' + item.label}
                            className='text-tv-blue hover:text-tv-text'
                          >
                            <ExternalLink className='h-3.5 w-3.5' />
                          </a>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <Card>
                  <p className='text-sm text-tv-muted'>Snapshot pasar sedang tidak tersedia dari penyedia data.</p>
                </Card>
              )}
            </section>

            <section>
              <div className='mb-3 flex flex-wrap items-center justify-between gap-3'>
                <div className='flex items-center gap-2'>
                  <Landmark className='h-5 w-5 text-indigo-400' />
                  <div>
                    <h2 className='font-heading text-lg font-bold text-tv-text'>Indikator ekonomi resmi</h2>
                    <p className='text-xs text-tv-muted'>Periode dan frekuensi ditampilkan agar data tahunan tidak disalahartikan sebagai data bulanan.</p>
                  </div>
                </div>
                <Badge variant='neutral'>BI + WORLD BANK</Badge>
              </div>

              {data.official.length > 0 ? (
                <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
                  {data.official.map((item) => (
                    <Card key={item.key}>
                      <div className='flex items-start justify-between gap-3'>
                        <div>
                          <p className='text-xs font-semibold text-tv-muted'>{item.label}</p>
                          <p className='mt-2 font-heading text-2xl font-bold text-tv-text'>{formatOfficialValue(item)}</p>
                        </div>
                        {trendBadge(item.trend)}
                      </div>
                      <div className='mt-4 space-y-1 text-xs text-tv-muted'>
                        <p>Periode: <span className='font-semibold text-tv-text'>{item.period}</span> · {item.frequency}</p>
                        <p>{formatPreviousValue(item)}</p>
                      </div>
                      <div className='mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-3'>
                        <div className='flex flex-wrap items-center gap-2'>
                          <span className='text-[10px] text-tv-muted'>{item.source}</span>
                          {item.retrievalStatus === 'LAST_VERIFIED' && (
                            <Badge variant='warning'>TERAKHIR TERVERIFIKASI</Badge>
                          )}
                        </div>
                        <a
                          href={item.sourceUrl}
                          target='_blank'
                          rel='noreferrer'
                          className='inline-flex items-center gap-1 text-[10px] font-semibold text-tv-blue hover:underline'
                        >
                          Sumber
                          <ExternalLink className='h-3 w-3' />
                        </a>
                      </div>
                      {item.note && <p className='mt-2 text-[10px] leading-4 text-tv-muted'>{item.note}</p>}
                    </Card>
                  ))}
                </div>
              ) : (
                <Card>
                  <p className='text-sm text-tv-muted'>Indikator resmi sedang tidak tersedia.</p>
                </Card>
              )}
            </section>

            <section>
              <div className='mb-3 flex items-center gap-2'>
                <Compass className='h-5 w-5 text-tv-purple' />
                <div>
                  <h2 className='font-heading text-lg font-bold text-tv-text'>Peta transmisi ke sektor IDX</h2>
                  <p className='text-xs text-tv-muted'>Kerangka mekanisme berdasarkan data yang tersedia, bukan rekomendasi overweight/underweight.</p>
                </div>
              </div>

              <div className='grid gap-4 lg:grid-cols-2'>
                {data.transmissions.map((item) => (
                  <Card key={item.key} hoverable>
                    <div className='flex flex-wrap items-center justify-between gap-2'>
                      <h3 className='font-heading font-semibold text-tv-text'>{item.driver}</h3>
                      <Badge variant='info'>{item.direction}</Badge>
                    </div>
                    <div className='mt-4 space-y-3'>
                      <div className='rounded-xl border border-white/[0.06] bg-white/[0.025] p-3'>
                        <p className='text-[10px] font-bold uppercase tracking-[0.1em] text-tv-muted'>Kanal transmisi</p>
                        <p className='mt-1 text-xs leading-5 text-tv-text'>{item.channel}</p>
                      </div>
                      <div className='rounded-xl border border-tv-purple/15 bg-tv-purple/[0.04] p-3'>
                        <p className='text-[10px] font-bold uppercase tracking-[0.1em] text-tv-purple'>Implikasi yang perlu dipantau</p>
                        <p className='mt-1 text-xs leading-5 text-tv-muted'>{item.equityReadThrough}</p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </section>

            <div className='grid gap-4 xl:grid-cols-[1.3fr_1fr]'>
              <Card>
                <div className='flex items-center gap-2'>
                  <Database className='h-5 w-5 text-tv-blue' />
                  <h2 className='font-heading font-semibold text-tv-text'>Sumber dan metodologi</h2>
                </div>
                <div className='mt-3 space-y-2 text-xs leading-5 text-tv-muted'>
                  <p>Dashboard diperbarui {formatDateTime(data.retrievedAt)} dan di-cache selama 30 menit.</p>
                  <p>Data pasar berasal dari Yahoo Finance. GDP, inflasi tahunan, current account, dan cadangan devisa berasal dari World Bank Open Data. BI-Rate berasal dari publikasi resmi Bank Indonesia.</p>
                  <p>{data.methodology}</p>
                </div>
              </Card>

              <Card className={data.missing.length > 0 ? 'border-tv-warning/20 bg-tv-warning/[0.035]' : 'border-tv-green/15 bg-tv-green/[0.035]'}>
                <div className='flex items-center gap-2'>
                  <AlertTriangle className={'h-5 w-5 ' + (data.missing.length > 0 ? 'text-tv-warning' : 'text-tv-green')} />
                  <h2 className='font-heading font-semibold text-tv-text'>Kelengkapan data</h2>
                </div>
                {data.missing.length > 0 ? (
                  <>
                    <p className='mt-3 text-xs leading-5 text-tv-muted'>
                      Indikator berikut sedang tidak tersedia dan tidak diganti dengan angka perkiraan:
                    </p>
                    <div className='mt-3 flex flex-wrap gap-2'>
                      {data.missing.map((item) => <Badge key={item} variant='warning'>{item}</Badge>)}
                    </div>
                  </>
                ) : (
                  <p className='mt-3 text-xs leading-5 text-tv-muted'>Seluruh indikator yang direncanakan tersedia pada refresh ini.</p>
                )}
              </Card>
            </div>
          </>
        )}
      </PageContainer>
    </div>
  );
}
