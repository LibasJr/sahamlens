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
  HeartPulse,
  Landmark,
  Layers,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
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
import { useLanguage } from '@/lib/i18n';
import { apiRequest, isApiClientError } from '@/shared/http/api-client';
import MenuUsageGuide from '@/components/MenuUsageGuide';

export default function MacroPage() {
  const { t, language } = useLanguage();
  const isEn = language === 'en';

  const [data, setData] = useState<PublicMacroDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  function formatNumber(value: number, maximumFractionDigits = 2) {
    return new Intl.NumberFormat(isEn ? 'en-US' : 'id-ID', {
      maximumFractionDigits,
    }).format(value);
  }

  function formatCompact(value: number) {
    return new Intl.NumberFormat(isEn ? 'en-US' : 'id-ID', {
      notation: 'compact',
      maximumFractionDigits: 2,
    }).format(value);
  }

  function formatMarketValue(item: MacroMarketIndicator) {
    if (item.key === 'USD_IDR') return 'Rp ' + formatNumber(item.value, 0);
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
    if (item.previousValue == null) return isEn ? 'Comparison unavailable' : 'Pembanding belum tersedia';
    const value =
      item.key === 'RESERVES' ? '$' + formatCompact(item.previousValue) : formatNumber(item.previousValue, 2) + '%';
    return (item.previousPeriod || (isEn ? 'Previous period' : 'Periode sebelumnya')) + ': ' + value;
  }

  function formatDateTime(value: string | null) {
    if (!value) return isEn ? 'Market time N/A' : 'Waktu pasar N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return isEn ? 'Market time N/A' : 'Waktu pasar N/A';
    return (
      new Intl.DateTimeFormat(isEn ? 'en-US' : 'id-ID', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Jakarta',
      }).format(date) + (isEn ? ' WIB' : ' WIB')
    );
  }

  function trendBadge(trend: MacroTrend) {
    if (trend === 'UP') return <Badge variant="info">{isEn ? 'UP' : 'NAIK'}</Badge>;
    if (trend === 'DOWN') return <Badge variant="info">{isEn ? 'DOWN' : 'TURUN'}</Badge>;
    if (trend === 'FLAT') return <Badge variant="neutral">{isEn ? 'FLAT' : 'DATAR'}</Badge>;
    return <Badge variant="neutral">{isEn ? 'TREND N/A' : 'TREN N/A'}</Badge>;
  }

  useEffect(() => {
    const controller = new AbortController();

    async function loadMacro() {
      setLoading(true);
      setError(null);

      try {
        const payload = await apiRequest<PublicMacroDashboard>('/api/macro', { signal: controller.signal });
        setData(payload);
      } catch (caught) {
        if (controller.signal.aborted) return;
        setError(isApiClientError(caught) ? caught.message : (isEn ? 'Failed to fetch macro data.' : 'Gagal mengambil data makro.'));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadMacro();
    return () => controller.abort();
  }, [reloadKey, isEn]);

  return (
    <div className="min-h-screen bg-tv-base text-tv-text">
      <Header currentTicker="^JKSE" onTickerChange={() => {}} moduleTitle={t('macroEnhance.title')} />
      <PageContainer className="space-y-6 p-4 md:p-6 max-w-6xl">
        <MenuUsageGuide
          menuKey="macro"
          whatItAnswers="Kondisi ekonomi Indonesia sedang mendukung pasar saham atau menekan?"
          steps={[
            "Perhatikan suku bunga dan inflasi lebih dulu - keduanya paling langsung memengaruhi bursa.",
            "Bandingkan arah terkini dengan periode sebelumnya, bukan angka tunggalnya.",
            "Gunakan ini sebagai latar, bukan sebagai sinyal beli-jual.",
          ]}
        />
        <Card variant="glass" className="flex flex-wrap items-center justify-between gap-4 border-tv-blue/20 bg-gradient-to-r from-tv-blue/[0.05] via-tv-card to-tv-purple/[0.05]">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-tv-blue/10 text-tv-blue border border-tv-blue/20">
              <Globe className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-tv-muted">
                {isEn ? 'INDONESIA MACRO MONITOR' : 'INDONESIA MACRO MONITOR'}
              </p>
              <h1 className="font-heading text-xl font-bold tracking-tight text-tv-text sm:text-2xl">
                {t('macroEnhance.title')}
              </h1>
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-tv-muted">
                {t('macroEnhance.subtitle')}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {data && (
              <Badge variant={data.coverage.percent >= 70 ? 'success' : 'warning'}>
                {isEn ? 'COVERAGE' : 'CAKUPAN'} {data.coverage.available}/{data.coverage.expected}
              </Badge>
            )}
            <Button
              type="button"
              size="sm"
              variant="secondary"
              loading={loading}
              onClick={() => setReloadKey((value) => value + 1)}
            >
              <RefreshCw className="h-4 w-4" />
              {isEn ? 'Refresh' : 'Perbarui'}
            </Button>
          </div>
        </Card>

        {loading && (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((item) => (
                <Card key={item} className="space-y-3">
                  <Skeleton variant="text" className="w-28" />
                  <Skeleton className="h-8 w-36 rounded-lg" />
                  <Skeleton variant="text" className="w-3/4" />
                </Card>
              ))}
            </div>
          </div>
        )}

        {!loading && error && (
          <Card className="flex flex-col items-start gap-4 border-tv-red/20 bg-tv-red/[0.04]">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-tv-red" />
              <div>
                <h2 className="font-heading font-semibold text-tv-text">
                  {isEn ? 'Macro data could not be loaded' : 'Data makro belum dapat dimuat'}
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
            {/* Macroeconomic Regime Matrix Card */}
            {data.regime && (
              <Card hoverable className="space-y-4 border-tv-blue/20 bg-gradient-to-br from-tv-blue/[0.06] to-tv-purple/[0.04]">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-tv-border pb-3">
                  <div className="flex items-center gap-2">
                    <Layers className="h-5 w-5 text-tv-blue" />
                    <div>
                      <h2 className="font-heading text-base font-bold text-white">{t('macroEnhance.regimeTitle')}</h2>
                      <p className="text-xs text-tv-muted">{t('macroEnhance.regimeSubtitle')}</p>
                    </div>
                  </div>
                  <Badge variant="success" className="px-3 py-1">
                    {t(data.regime.titleKey)}
                  </Badge>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-3.5 rounded-xl bg-tv-green/[0.04] border border-tv-green/20">
                    <span className="text-xs font-bold text-tv-green">{t('macroEnhance.favoredSectors')}</span>
                    <ul className="mt-2 space-y-1.5 text-xs text-tv-text">
                      {data.regime.favoredSectors.map((sector) => (
                        <li key={sector} className="flex items-center gap-2">
                          <span className="h-1.5 w-1.5 rounded-full bg-tv-green" />
                          {sector}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="p-3.5 rounded-xl bg-tv-yellow/[0.04] border border-tv-yellow/20">
                    <span className="text-xs font-bold text-tv-yellow">{t('macroEnhance.cautiousSectors')}</span>
                    <ul className="mt-2 space-y-1.5 text-xs text-tv-text">
                      {data.regime.cautiousSectors.map((sector) => (
                        <li key={sector} className="flex items-center gap-2">
                          <span className="h-1.5 w-1.5 rounded-full bg-tv-yellow" />
                          {sector}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <p className="text-xs text-tv-muted leading-relaxed bg-tv-bg/50 p-3 rounded-lg border border-tv-border">
                  {data.regime.narrative}
                </p>
                <p className="text-[10px] leading-relaxed text-tv-muted/80">
                  {isEn
                    ? 'Method note: regime thresholds and sector mappings are SahamLens heuristics applied to sourced macro observations; they are not empirical sector-return probabilities.'
                    : 'Catatan metode: threshold rezim dan pemetaan sektor adalah heuristik SahamLens yang diterapkan pada observasi makro bersumber; bukan probabilitas return sektor.'}
                </p>
              </Card>
            )}

            {/* Indonesia Macro Health Index Card */}
            {data.health && (
              <Card hoverable className="space-y-4 border-tv-purple/20 bg-gradient-to-br from-tv-purple/[0.04] to-tv-blue/[0.03]">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-tv-border pb-3">
                  <div className="flex items-center gap-2">
                    <HeartPulse className="h-5 w-5 text-tv-purple" />
                    <div>
                      <h2 className="font-heading text-base font-bold text-white">{t('macroEnhance.macroHealthTitle')}</h2>
                      <p className="text-xs text-tv-muted">{isEn ? 'Sovereign financial buffer and currency resilience indicators.' : 'Indikator ketahanan fiskal, devisa, dan stabilitas nilai tukar.'}</p>
                    </div>
                  </div>
                  <Badge variant="info">
                    {isEn ? 'Status: ' : 'Status: '}{data.health.healthVerdict}
                  </Badge>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Card padding="none" radius="xl" elevation="none" highlight={false} overflow="visible" surface="60" className="p-3 border-tv-border">
                    <span className="text-[11px] text-tv-muted">{t('macroEnhance.realYield')}</span>
                    <div className="text-lg font-bold font-number text-tv-green mt-1">
                      {data.health.realInterestRate != null ? `+${data.health.realInterestRate}%` : 'N/A'}
                    </div>
                    <span className="text-[10px] text-tv-muted/70">{isEn ? 'Attractive foreign carry buffer' : 'Buffer yield riil menarik'}</span>
                  </Card>

                  <Card padding="none" radius="xl" elevation="none" highlight={false} overflow="visible" surface="60" className="p-3 border-tv-border">
                    <span className="text-[11px] text-tv-muted">{t('macroEnhance.fxReservesCover')}</span>
                    <div className="text-lg font-bold font-number text-tv-blue mt-1">
                      {data.health.fxImportCoverMonths != null ? `${data.health.fxImportCoverMonths} bln` : 'N/A'}
                    </div>
                    <span className="text-[10px] text-tv-muted/70">{isEn ? 'Above IMF 3-mo standard' : 'Di atas standar IMF 3 bln'}</span>
                  </Card>

                  <Card padding="none" radius="xl" elevation="none" highlight={false} overflow="visible" surface="60" className="p-3 border-tv-border">
                    <span className="text-[11px] text-tv-muted">{t('macroEnhance.yieldSpread')}</span>
                    <div className="text-lg font-bold font-number text-tv-purple mt-1">
                      {data.health.yieldSpread10Y != null ? `+${data.health.yieldSpread10Y}%` : 'N/A'}
                    </div>
                    <span className="text-[10px] text-tv-muted/70">{isEn ? 'ID 10Y over US 10Y' : 'Premi Surat Utang Negara'}</span>
                  </Card>
                </div>
              </Card>
            )}

            {/* Market and Global Variables */}
            <section>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-tv-blue" />
                  <div>
                    <h2 className="font-heading text-lg font-bold text-tv-text">{t('macroEnhance.marketIndicators')}</h2>
                    <p className="text-xs text-tv-muted">
                      {isEn ? 'Public market snapshot; changes represent last session delta.' : 'Snapshot publik; perubahan menunjukkan pergerakan sesi terakhir.'}
                    </p>
                  </div>
                </div>
                <Badge variant="info" dot>YAHOO FINANCE</Badge>
              </div>

              {data.market.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {data.market.map((item) => {
                    const positive = (item.changePct ?? 0) > 0;
                    const negative = (item.changePct ?? 0) < 0;
                    return (
                      <Card key={item.key} hoverable>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold text-tv-muted">{item.label}</p>
                            <p className="mt-2 font-heading text-2xl font-bold text-tv-text">{formatMarketValue(item)}</p>
                          </div>
                          <div
                            className={
                              'flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold ' +
                              (positive
                                ? 'bg-tv-blue/10 text-tv-blue'
                                : negative
                                ? 'bg-tv-purple/10 text-tv-purple'
                                : 'bg-white/[0.05] text-tv-muted')
                            }
                          >
                            {positive && <ArrowUpRight className="h-3.5 w-3.5" />}
                            {negative && <ArrowDownRight className="h-3.5 w-3.5" />}
                            {item.changePct == null ? 'N/A' : (positive ? '+' : '') + formatNumber(item.changePct, 2) + '%'}
                          </div>
                        </div>
                        <div className="mt-4 flex items-end justify-between gap-2">
                          <p className="text-[10px] leading-4 text-tv-muted">{formatDateTime(item.asOf)}</p>
                          <a
                            href={item.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={'Source ' + item.label}
                            className="text-tv-blue hover:text-tv-text"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <Card>
                  <p className="text-sm text-tv-muted">
                    {isEn ? 'Market snapshot temporarily unavailable.' : 'Snapshot pasar sedang tidak tersedia dari penyedia data.'}
                  </p>
                </Card>
              )}
            </section>

            {/* Official Economic Indicators */}
            <section>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Landmark className="h-5 w-5 text-indigo-400" />
                  <div>
                    <h2 className="font-heading text-lg font-bold text-tv-text">{t('macroEnhance.officialIndicators')}</h2>
                    <p className="text-xs text-tv-muted">
                      {isEn ? 'Period and frequency displayed to avoid misinterpreting annual vs monthly cadence.' : 'Periode dan frekuensi ditampilkan agar data tahunan tidak disalahartikan sebagai data bulanan.'}
                    </p>
                  </div>
                </div>
                <Badge variant="neutral">BI + WORLD BANK</Badge>
              </div>

              {data.official.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {data.official.map((item) => (
                    <Card key={item.key}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold text-tv-muted">{item.label}</p>
                          <p className="mt-2 font-heading text-2xl font-bold text-tv-text">{formatOfficialValue(item)}</p>
                        </div>
                        {trendBadge(item.trend)}
                      </div>
                      <div className="mt-4 space-y-1 text-xs text-tv-muted">
                        <p>
                          {isEn ? 'Period: ' : 'Periode: '}<span className="font-semibold text-tv-text">{item.period}</span> · {item.frequency}
                        </p>
                        <p>{formatPreviousValue(item)}</p>
                      </div>
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] text-tv-muted">{item.source}</span>
                          {item.retrievalStatus === 'LAST_VERIFIED' && (
                            <Badge variant="warning">{isEn ? 'LAST VERIFIED' : 'TERAKHIR TERVERIFIKASI'}</Badge>
                          )}
                        </div>
                        <a
                          href={item.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] font-semibold text-tv-blue hover:underline"
                        >
                          {isEn ? 'Source' : 'Sumber'}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                      {item.note && <p className="mt-2 text-[10px] leading-4 text-tv-muted">{item.note}</p>}
                    </Card>
                  ))}
                </div>
              ) : (
                <Card>
                  <p className="text-sm text-tv-muted">
                    {isEn ? 'Official indicators unavailable.' : 'Indikator resmi sedang tidak tersedia.'}
                  </p>
                </Card>
              )}
            </section>

            {/* Sector Transmission Map */}
            <section>
              <div className="mb-3 flex items-center gap-2">
                <Compass className="h-5 w-5 text-tv-purple" />
                <div>
                  <h2 className="font-heading text-lg font-bold text-tv-text">
                    {isEn ? 'Transmission Channels to IDX Sectors' : 'Peta transmisi ke sektor IDX'}
                  </h2>
                  <p className="text-xs text-tv-muted">
                    {isEn ? 'Mechanistic framework based on available data, not buy/sell recommendations.' : 'Kerangka mekanisme berdasarkan data yang tersedia, bukan rekomendasi overweight/underweight.'}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                {data.transmissions.map((item) => (
                  <Card key={item.key} hoverable>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-heading font-semibold text-tv-text">{item.driver}</h3>
                      <Badge variant="info">{item.direction}</Badge>
                    </div>
                    <div className="mt-4 space-y-3">
                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-tv-muted">
                          {isEn ? 'Transmission Channel' : 'Kanal transmisi'}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-tv-text">{item.channel}</p>
                      </div>
                      <div className="rounded-xl border border-tv-purple/15 bg-tv-purple/[0.04] p-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-tv-purple">
                          {isEn ? 'Equity Read-Through & Implications' : 'Implikasi yang perlu dipantau'}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-tv-muted">{item.equityReadThrough}</p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </section>

            {/* Methodology & Sources */}
            <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
              <Card>
                <div className="flex items-center gap-2">
                  <Database className="h-5 w-5 text-tv-blue" />
                  <h2 className="font-heading font-semibold text-tv-text">
                    {isEn ? 'Sources & Methodology' : 'Sumber dan metodologi'}
                  </h2>
                </div>
                <div className="mt-3 space-y-2 text-xs leading-5 text-tv-muted">
                  <p>
                    {isEn ? 'Dashboard updated ' : 'Dashboard diperbarui '}{formatDateTime(data.retrievedAt)} {isEn ? 'and cached for 30 minutes.' : 'dan di-cache selama 30 menit.'}
                  </p>
                  <p>
                    {isEn
                      ? 'Market data from Yahoo Finance. Annual GDP, inflation, current account, and foreign reserves from World Bank Open Data. BI-Rate from Bank Indonesia official publications.'
                      : 'Data pasar berasal dari Yahoo Finance. GDP, inflasi tahunan, current account, dan cadangan devisa berasal dari World Bank Open Data. BI-Rate berasal dari publikasi resmi Bank Indonesia.'}
                  </p>
                </div>
              </Card>

              <Card className={data.missing.length > 0 ? 'border-tv-warning/20 bg-tv-warning/[0.035]' : 'border-tv-green/15 bg-tv-green/[0.035]'}>
                <div className="flex items-center gap-2">
                  <AlertTriangle className={'h-5 w-5 ' + (data.missing.length > 0 ? 'text-tv-warning' : 'text-tv-green')} />
                  <h2 className="font-heading font-semibold text-tv-text">
                    {isEn ? 'Data Completeness' : 'Kelengkapan data'}
                  </h2>
                </div>
                {data.missing.length > 0 ? (
                  <>
                    <p className="mt-3 text-xs leading-5 text-tv-muted">
                      {isEn ? 'The following indicators are currently unavailable:' : 'Indikator berikut sedang tidak tersedia dan tidak diganti dengan angka perkiraan:'}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {data.missing.map((item) => (
                        <Badge key={item} variant="warning">{item}</Badge>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="mt-3 text-xs leading-5 text-tv-muted">
                    {isEn ? 'All planned indicators are available on this refresh.' : 'Seluruh indikator yang direncanakan tersedia pada refresh ini.'}
                  </p>
                )}
              </Card>
            </div>
          </>
        )}
      </PageContainer>
    </div>
  );
}
