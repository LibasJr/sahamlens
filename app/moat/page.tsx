'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Award,
  BarChart3,
  CheckCircle2,
  CircleHelp,
  Database,
  ExternalLink,
  Layers,
  RefreshCcw,
  Shield,
  Sparkles,
  Zap,
} from 'lucide-react';
import { TickerAnalysisShell } from '@/components/TickerAnalysisShell';
import { Badge, Button, Card, Skeleton } from '@/components/ui';
import {
  buildMoatProxy,
  type FundamentalAnalyzerSnapshot,
  type MoatProxyStatus,
} from '@/modules/fundamental/service/moat-proxy.service';
import MoatExportCard from '@/components/export/MoatExportCard';
import ExportImageButton from '@/components/export/ExportImageButton';
import { buildExportFileName } from '@/shared/format/export-filename';
import { useLanguage } from '@/lib/i18n';
import { apiErrorMessage, apiRequest } from '@/shared/http/api-client';
import { useAuthUser } from '@/lib/hooks/useAuthUser';
import Link from 'next/link';
import { Lock } from 'lucide-react';
import MenuUsageGuide from '@/components/MenuUsageGuide';
import { percentageWidthClass } from '@/shared/presentation/percentage-width';

interface MoatPayload {
  ticker: string;
  analyzers?: FundamentalAnalyzerSnapshot[];
  moatDurability?: {
    status: 'TAHAN' | 'CAMPURAN' | 'RAPUH' | 'DATA TERBATAS';
    years: number;
    firstFiscalYear: number | null;
    lastFiscalYear: number | null;
    yearsAboveCostOfEquity: number;
    costOfEquityPct: number;
    checks: Array<{
      key: string;
      label: string;
      detail: string;
      verdict: 'SUPPORTIVE' | 'CAUTION' | 'NOT_APPLICABLE';
    }>;
    conclusion: string;
  };
  stock?: {
    name?: string;
    current_price?: number | null;
  };
  profile?: {
    sector?: string;
    industry?: string;
    description?: string;
    website?: string;
  };
  source?: {
    provider?: string;
    sourceType?: string;
    retrievedAt?: string;
    period?: string;
  };
  error?: string;
}

function normalizeTicker(value: string) {
  return value.trim().toUpperCase().replace(/\.JK$/, '');
}

function safeWebsite(value?: string) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export default function MoatPage() {
  const { t, language } = useLanguage();
  const isEn = language === 'en';

  const { loading: authLoading, resolved: authResolved, user: authUser } = useAuthUser();
  // GEMBOK TAMU (2026-08-23). Nama pilar dan indikatornya TETAP terbuka - itu yang
  // memperlihatkan cara halaman ini berpikir. Yang dikunci adalah VONISNYA: skor tiap
  // sumber moat (KUAT/MODERAT/TERBATAS) dan pemeriksaan durabilitas.
  const lockForGuest = !authResolved || authLoading || !authUser;
  const [ticker, setTicker] = useState('BBCA');
  const [payload, setPayload] = useState<MoatPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const selectedTicker = normalizeTicker(ticker) || 'BBCA';
  const exportRef = useRef<HTMLDivElement>(null);

  const QUALITATIVE_GAPS = [
    {
      label: isEn ? 'Market share' : 'Pangsa pasar',
      detail: isEn ? 'Requires industry reports or corporate public disclosures.' : 'Perlu laporan industri atau paparan publik emiten.',
    },
    {
      label: isEn ? 'Switching costs' : 'Switching cost',
      detail: isEn ? 'Requires customer retention metrics and long-term contract data.' : 'Perlu bukti retensi pelanggan dan kontrak.',
    },
    {
      label: isEn ? 'Brand power' : 'Kekuatan merek',
      detail: isEn ? 'Requires pricing power evidence, loyalty index, and marketing ROI.' : 'Perlu data harga, loyalitas, dan belanja pemasaran.',
    },
    {
      label: isEn ? 'Network effects' : 'Network effect',
      detail: isEn ? 'Requires active user density and bilateral platform volume.' : 'Perlu data pengguna, transaksi, dan kepadatan jaringan.',
    },
    {
      label: isEn ? 'Regulatory barriers' : 'Lisensi dan regulasi',
      detail: isEn ? 'Requires review of statutory licenses and industry barriers to entry.' : 'Perlu penelaahan izin serta hambatan masuk industri.',
    },
  ];

  const INDICATOR_NAMES: Record<string, string> = {
    'ROE (Profitability)': 'Return on Equity',
    'ROA (Efficiency)': 'Return on Assets',
    'Gross Margin': 'Gross Margin',
    'Operating Margin': 'Operating Margin',
    'Net Profit Margin': 'Net Profit Margin',
    'EPS Growth (QoQ)': isEn ? 'EPS Growth' : 'Pertumbuhan EPS',
    'Revenue Growth (YoY)': isEn ? 'Revenue Growth' : 'Pertumbuhan Pendapatan',
    'Debt/Equity (Risk)': 'Debt to Equity',
    'Current Ratio (Liquidity)': 'Current Ratio',
    'Quick Ratio (Liquidity)': 'Quick Ratio',
  };

  useEffect(() => {
    const controller = new AbortController();

    async function loadMoatData() {
      setLoading(true);
      setError(null);
      setPayload(null);

      try {
        const result = await apiRequest<MoatPayload>('/api/fundamental/' + encodeURIComponent(selectedTicker), { signal: controller.signal });
        setPayload(result);
      } catch (caught) {
        if (controller.signal.aborted) return;
        setError(caught instanceof Error ? caught.message : (isEn ? 'Failed to fetch public data.' : 'Gagal mengambil data publik.'));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadMoatData();
    return () => controller.abort();
  }, [selectedTicker, reloadKey, isEn]);

  const moat = useMemo(() => buildMoatProxy(payload?.analyzers ?? []), [payload?.analyzers]);
  const website = safeWebsite(payload?.profile?.website);

  function handleTickerChange(nextTicker: string) {
    const normalized = normalizeTicker(nextTicker);
    if (!normalized) return;
    setTicker(normalized);
    window.localStorage.setItem('lastTicker', normalized);
  }

  function formatRetrievedAt(value?: string) {
    if (!value) return isEn ? 'Retrieval time unavailable' : 'Waktu pengambilan tidak tersedia';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return isEn ? 'Retrieval time unavailable' : 'Waktu pengambilan tidak tersedia';
    return (
      new Intl.DateTimeFormat(isEn ? 'en-US' : 'id-ID', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Jakarta',
      }).format(date) + (isEn ? ' WIB' : ' WIB')
    );
  }

  function statusBadge(status: MoatProxyStatus) {
    if (status === 'KUAT') return <Badge variant="success" dot>{isEn ? 'STRONG' : 'KUAT'}</Badge>;
    if (status === 'LEMAH') return <Badge variant="danger" dot>{isEn ? 'WEAK' : 'LEMAH'}</Badge>;
    if (status === 'CAMPURAN') return <Badge variant="warning" dot>{isEn ? 'MIXED' : 'CAMPURAN'}</Badge>;
    return <Badge variant="neutral" dot>{isEn ? 'LIMITED DATA' : 'DATA TERBATAS'}</Badge>;
  }

  function durabilityBadge(status: 'TAHAN' | 'CAMPURAN' | 'RAPUH' | 'DATA TERBATAS') {
    if (status === 'TAHAN') return <Badge variant="success" dot>{isEn ? 'DURABLE' : 'TAHAN'}</Badge>;
    if (status === 'RAPUH') return <Badge variant="danger" dot>{isEn ? 'FRAGILE' : 'RAPUH'}</Badge>;
    if (status === 'CAMPURAN') return <Badge variant="warning" dot>{isEn ? 'MIXED' : 'CAMPURAN'}</Badge>;
    return <Badge variant="neutral" dot>{isEn ? 'LIMITED DATA' : 'DATA TERBATAS'}</Badge>;
  }

  function signalBadge(decision: 'BULLISH' | 'BEARISH' | 'NEUTRAL') {
    if (decision === 'BULLISH') return <Badge variant="success">{isEn ? 'SUPPORTIVE' : 'MENDUKUNG'}</Badge>;
    if (decision === 'BEARISH') return <Badge variant="danger">{isEn ? 'CAUTION' : 'PERLU DIWASPADAI'}</Badge>;
    return <Badge variant="neutral">{isEn ? 'NEUTRAL' : 'NETRAL'}</Badge>;
  }

  function moatSourceScoreBadge(score: 'KUAT' | 'MODERAT' | 'TERBATAS') {
    if (score === 'KUAT') return <Badge variant="success">{t('moatEnhance.scoreHigh')}</Badge>;
    if (score === 'MODERAT') return <Badge variant="warning">{t('moatEnhance.scoreMedium')}</Badge>;
    return <Badge variant="neutral">{t('moatEnhance.scoreLow')}</Badge>;
  }

  return (
    <TickerAnalysisShell
      ticker={selectedTicker}
      onTickerChange={handleTickerChange}
      moduleTitle={isEn ? 'Moat & Quality Analysis' : 'Moat Proxy'}
      icon={<Award className="h-6 w-6" />}
      accent="purple"
      title={isEn ? `Business Quality & Moat — ${selectedTicker}` : `Proxy Kualitas Bisnis ${selectedTicker}`}
      subtitle={t('moatEnhance.subtitle')}
      headerExtra={
        <div className="flex flex-wrap items-center gap-2">
      <MenuUsageGuide
        menuKey="moat"
        whatItAnswers="Keunggulan bisnis emiten ini bertahan lama atau mudah disalip pesaing?"
        steps={[
          "Tiap pilar menilai satu sumber keunggulan - merek, biaya, jaringan, atau biaya pindah.",
          "Baca dasar penilaiannya, bukan cuma labelnya.",
          "Uji durabilitas memeriksa apakah keunggulan itu menguat atau menipis.",
        ]}
        freeAccess="nama tiap pilar dan indikator yang dinilai"
        afterSignup="skor tiap sumber keunggulan dan hasil uji durabilitasnya"
        loginNext="/moat"
      />
          <Badge variant="info" dot>{payload?.source?.provider || (isEn ? 'Public Source' : 'Sumber publik')}</Badge>
          {!loading && statusBadge(moat.status)}
          <ExportImageButton
            targetRef={exportRef}
            fileName={buildExportFileName('Moat', selectedTicker)}
            label={isEn ? 'Export Moat Card' : 'Export Kartu Moat'}
            disabled={!payload || loading}
          />
        </div>
      }
    >
      {loading && (
        <div className="grid gap-4 lg:grid-cols-2">
          {[0, 1, 2, 3].map((item) => (
            <Card key={item} className="space-y-4">
              <div className="flex items-center justify-between">
                <Skeleton variant="text" className="w-36" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
              <Skeleton variant="text" className="w-3/4" />
              <Skeleton className="h-16 w-full rounded-xl" />
            </Card>
          ))}
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
            <RefreshCcw className="h-4 w-4" />
            {isEn ? 'Try again' : 'Coba lagi'}
          </Button>
        </Card>
      )}

      {!loading && !error && payload && (
        <>
          <Card variant="glass" className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-heading text-xl font-bold text-tv-text">
                  {payload.stock?.name || selectedTicker}
                </h2>
                <Badge variant="neutral">{selectedTicker}</Badge>
              </div>
              <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-tv-purple">
                {[payload.profile?.sector, payload.profile?.industry].filter(Boolean).join(' · ') ||
                  (isEn ? 'Sector classification unavailable' : 'Klasifikasi sektor belum tersedia')}
              </p>
              <p className="mt-4 line-clamp-4 text-sm leading-6 text-tv-muted">
                {payload.profile?.description ||
                  (isEn ? 'Business description unavailable from public feeds.' : 'Deskripsi bisnis belum tersedia dari sumber publik.')}
              </p>
              {website && (
                <a
                  href={website}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-tv-blue hover:underline"
                >
                  {isEn ? 'Official Company Website' : 'Situs resmi perusahaan'}
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>

            <div className="rounded-2xl border border-tv-purple/20 bg-tv-purple/[0.06] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-tv-muted">
                    {isEn ? 'Moat Proxy Result' : 'Hasil proxy'}
                  </p>
                  <div className="mt-2">{statusBadge(moat.status)}</div>
                </div>
                <Shield className="h-9 w-9 text-tv-purple" />
              </div>
              <div className="mt-5 flex items-end justify-between gap-3">
                <div>
                  <p className="font-heading text-3xl font-bold text-tv-text">
                    {moat.available}/{moat.expected}
                  </p>
                  <p className="text-xs text-tv-muted">{isEn ? 'available indicators' : 'indikator tersedia'}</p>
                </div>
                <p className="text-right text-xs text-tv-muted">{moat.coveragePct}% {isEn ? 'coverage' : 'cakupan'}</p>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className={`h-full rounded-full bg-tv-purple transition-[width] duration-500 ${percentageWidthClass(moat.coveragePct)}`}
                />
              </div>
            </div>
          </Card>

          {/* DuPont 3-Stage Analysis Section */}
          {moat.dupont && (
            <Card hoverable className="space-y-4 border-tv-blue/20 bg-gradient-to-br from-tv-blue/[0.04] to-tv-purple/[0.03]">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-tv-border pb-3">
                <div className="flex items-center gap-2">
                  <Layers className="h-5 w-5 text-tv-blue" />
                  <div>
                    <h3 className="font-heading text-base font-bold text-white">{t('moatEnhance.dupontTitle')}</h3>
                    <p className="text-xs text-tv-muted">{t('moatEnhance.dupontSubtitle')}</p>
                  </div>
                </div>
                <Badge variant={moat.dupont.primaryDriver === 'MARGIN' ? 'success' : moat.dupont.primaryDriver === 'TURNOVER' ? 'info' : 'warning'}>
                  {isEn ? 'Primary Driver: ' : 'Pendorong Utama: '}{moat.dupont.primaryDriver}
                </Badge>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-center">
                <Card padding="none" radius="xl" elevation="none" highlight={false} overflow="visible" surface="60" className="p-3 border-tv-border">
                  <span className="text-[11px] text-tv-muted">{t('moatEnhance.netProfitMargin')}</span>
                  <div className="text-lg font-bold font-number text-tv-green mt-1">
                    {moat.dupont.netProfitMarginPct != null ? `${moat.dupont.netProfitMarginPct.toFixed(1)}%` : 'N/A'}
                  </div>
                  <span className="text-[10px] text-tv-muted/70">{isEn ? 'Margin contribution' : 'Kontribusi Margin'}</span>
                </Card>

                <Card padding="none" radius="xl" elevation="none" highlight={false} overflow="visible" surface="60" className="p-3 border-tv-border">
                  <span className="text-[11px] text-tv-muted">{t('moatEnhance.assetTurnover')}</span>
                  <div className="text-lg font-bold font-number text-tv-blue mt-1">
                    {moat.dupont.assetTurnover != null ? `${moat.dupont.assetTurnover.toFixed(2)}x` : 'N/A'}
                  </div>
                  <span className="text-[10px] text-tv-muted/70">{isEn ? 'Asset Velocity' : 'Perputaran Aset'}</span>
                </Card>

                <Card padding="none" radius="xl" elevation="none" highlight={false} overflow="visible" surface="60" className="p-3 border-tv-border">
                  <span className="text-[11px] text-tv-muted">{t('moatEnhance.financialLeverage')}</span>
                  <div className="text-lg font-bold font-number text-tv-purple mt-1">
                    {moat.dupont.equityMultiplier != null ? `${moat.dupont.equityMultiplier.toFixed(2)}x` : 'N/A'}
                  </div>
                  <span className="text-[10px] text-tv-muted/70">{isEn ? 'Equity Multiplier' : 'Pengungkit Modal'}</span>
                </Card>

                <div className="p-3 rounded-xl bg-gradient-to-r from-tv-blue/10 to-tv-purple/10 border border-tv-blue/30">
                  <span className="text-[11px] font-semibold text-tv-text">{t('moatEnhance.roeResult')}</span>
                  <div className="text-2xl font-bold font-number text-white mt-1">
                    {moat.dupont.roePct != null ? `${moat.dupont.roePct.toFixed(1)}%` : 'N/A'}
                  </div>
                  <span className="text-[10px] text-tv-muted">{isEn ? 'Compounded Return' : 'Imbal Hasil Ekuitas'}</span>
                </div>
              </div>

              <p className="text-xs text-tv-muted leading-relaxed bg-tv-bg/50 p-2.5 rounded-lg border border-tv-border/50">
                <span className="font-semibold text-tv-text">{t('moatEnhance.driversExplanation')} </span>
                {moat.dupont.primaryDriver === 'MARGIN'
                  ? t('moatEnhance.highMarginDriver')
                  : moat.dupont.primaryDriver === 'TURNOVER'
                  ? t('moatEnhance.highTurnoverDriver')
                  : moat.dupont.primaryDriver === 'LEVERAGE'
                  ? t('moatEnhance.highLeverageDriver')
                  : moat.dupont.explanation}
              </p>
            </Card>
          )}

          {/* 5 Moat Sources Assessment */}
          {moat.moatSources && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-tv-gold" />
                <h3 className="font-heading text-lg font-bold text-tv-text">{t('moatEnhance.moatSourcesTitle')}</h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {moat.moatSources.map((source) => (
                  <Card key={source.id} hoverable className="flex flex-col justify-between gap-3 p-4">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-xs font-bold text-white uppercase tracking-wider">{t(source.titleKey)}</h4>
                        {lockForGuest ? (
                          <Link
                            href="/moat"
                            aria-label={`Masuk untuk melihat skor moat ${t(source.titleKey)}`}
                            className="inline-flex items-center gap-1 text-tv-blue"
                          >
                            <Lock className="h-3.5 w-3.5" />
                          </Link>
                        ) : moatSourceScoreBadge(source.score)}
                      </div>
                      <p className="mt-2 text-xs text-tv-muted leading-relaxed">{source.basis}</p>
                    </div>
                    <div className="pt-2 border-t border-tv-border/50 flex items-center justify-between text-[11px]">
                      <span className="text-tv-muted">{isEn ? 'Financial clue:' : 'Petunjuk rasio:'}</span>
                      <span className="font-number font-bold text-tv-text">{source.evidence}</span>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {/* 4 Pillars Summary Counts */}
          <div className="grid gap-3 sm:grid-cols-3">
            <Card padding="sm">
              <p className="text-xs text-tv-muted">{isEn ? 'Supportive indicators' : 'Indikator mendukung'}</p>
              <p className="mt-1 font-heading text-2xl font-bold text-tv-green">{moat.supportive}</p>
            </Card>
            <Card padding="sm">
              <p className="text-xs text-tv-muted">{isEn ? 'Caution indicators' : 'Perlu diwaspadai'}</p>
              <p className="mt-1 font-heading text-2xl font-bold text-tv-red">{moat.caution}</p>
            </Card>
            <Card padding="sm">
              <p className="text-xs text-tv-muted">{isEn ? 'Neutral' : 'Netral'}</p>
              <p className="mt-1 font-heading text-2xl font-bold text-tv-text">{moat.neutral}</p>
            </Card>
          </div>

          {/* 4-Year Durability Pillar */}
          {payload?.moatDurability && (
            <section>
              <div className="mb-3 flex items-center gap-2">
                <Award className="h-5 w-5 text-tv-purple" />
                <h2 className="font-heading text-lg font-bold text-tv-text">
                  {t('moatEnhance.durabilitySummaryTitle')}
                  {payload.moatDurability.firstFiscalYear
                    ? ` (${payload.moatDurability.firstFiscalYear}-${payload.moatDurability.lastFiscalYear})`
                    : ''}
                </h2>
                {durabilityBadge(payload.moatDurability.status)}
              </div>

              {lockForGuest ? (
                <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-tv-border py-8 text-center">
                  <Lock className="h-5 w-5 text-tv-yellow" />
                  <p className="text-sm font-bold text-tv-text">Uji durabilitas terkunci</p>
                  <p className="max-w-sm px-4 text-xs leading-relaxed text-tv-muted">
                    Buat akun gratis untuk melihat apakah keunggulan bisnis ini bertahan atau menipis,
                    beserta bukti tiap pemeriksaannya.
                  </p>
                  <Link
                    href="/login?next=/moat"
                    className="inline-flex items-center gap-2 rounded-full bg-tv-blue px-5 py-2 text-sm font-bold text-white transition hover:bg-tv-blueHover"
                  >
                    Masuk atau daftar gratis
                  </Link>
                </div>
              ) : payload.moatDurability.checks.length > 0 ? (
                <div className="space-y-2">
                  {payload.moatDurability.checks.map((check: any) => (
                    <div
                      key={check.key}
                      className={
                        'rounded-lg border p-3 ' +
                        (check.verdict === 'SUPPORTIVE'
                          ? 'border-tv-green/30 bg-tv-green/5'
                          : check.verdict === 'CAUTION'
                          ? 'border-tv-red/30 bg-tv-red/5'
                          : 'border-tv-border bg-tv-bg')
                      }
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold text-tv-text">{check.label}</span>
                        <span
                          className={
                            'text-[11px] font-bold ' +
                            (check.verdict === 'SUPPORTIVE'
                              ? 'text-tv-green'
                              : check.verdict === 'CAUTION'
                              ? 'text-tv-red'
                              : 'text-tv-muted')
                          }
                        >
                          {check.verdict === 'SUPPORTIVE'
                            ? isEn ? 'DURABLE' : 'BERTAHAN'
                            : check.verdict === 'CAUTION'
                            ? isEn ? 'NOT DURABLE' : 'TIDAK BERTAHAN'
                            : isEn ? 'NOT APPLICABLE' : 'TIDAK BERLAKU'}
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-tv-muted">{check.detail}</p>
                    </div>
                  ))}
                </div>
              ) : null}

              <p className="mt-3 text-[11px] leading-relaxed text-tv-muted">
                {payload.moatDurability.conclusion}
              </p>
            </section>
          )}

          {/* 4 Quantitative Proxy Pillars */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-tv-purple" />
              <h2 className="font-heading text-lg font-bold text-tv-text">
                {isEn ? 'Four Quantitative Proxy Pillars' : 'Empat pilar proxy kuantitatif'}
              </h2>
              <span className="text-[11px] text-tv-muted">— {isEn ? 'current snapshot' : 'potret terkini'}</span>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {moat.pillars.map((pillar) => (
                <Card key={pillar.key} hoverable>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-heading font-semibold text-tv-text">{pillar.label}</h3>
                      <p className="mt-1 text-xs leading-5 text-tv-muted">{pillar.description}</p>
                    </div>
                    {statusBadge(pillar.status)}
                  </div>

                  <div className="mt-4 space-y-2">
                    {pillar.indicators.map((indicator) => (
                      <div
                        key={indicator.label}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-2.5"
                      >
                        <div>
                          <p className="text-xs font-medium text-tv-text">
                            {INDICATOR_NAMES[indicator.label] || indicator.label}
                          </p>
                          <p className="mt-0.5 font-heading text-base font-bold text-tv-text">{indicator.value}</p>
                        </div>
                        {signalBadge(indicator.decision)}
                      </div>
                    ))}
                    {pillar.indicators.length === 0 && (
                      <div className="rounded-xl border border-dashed border-white/[0.08] px-3 py-4 text-center text-xs text-tv-muted">
                        {isEn ? 'Indicators for this pillar not available in public feeds.' : 'Indikator pilar ini belum tersedia dari feed publik.'}
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </section>

          {/* Qualitative Gaps and Sources */}
          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <div className="flex items-center gap-2">
                <CircleHelp className="h-5 w-5 text-tv-warning" />
                <h2 className="font-heading font-semibold text-tv-text">{t('moatEnhance.qualitativeGapsTitle')}</h2>
              </div>
              <p className="mt-2 text-xs leading-5 text-tv-muted">
                {isEn
                  ? 'The following factors are not computed automatically as they require qualitative evidence from annual reports, public exposes, or industry research.'
                  : 'Faktor berikut tidak disimpulkan otomatis karena membutuhkan bukti dari laporan tahunan, paparan publik, atau riset industri.'}
              </p>
              <div className="mt-4 space-y-2">
                {QUALITATIVE_GAPS.map((gap) => (
                  <div key={gap.label} className="flex items-start gap-2.5 rounded-xl bg-white/[0.025] px-3 py-2.5">
                    <CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-tv-muted" />
                    <div>
                      <p className="text-xs font-semibold text-tv-text">{gap.label}</p>
                      <p className="mt-0.5 text-xs leading-5 text-tv-muted">{gap.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <div className="flex items-center gap-2">
                <Database className="h-5 w-5 text-tv-blue" />
                <h2 className="font-heading font-semibold text-tv-text">{isEn ? 'Sources & Methodology' : 'Sumber dan metode'}</h2>
              </div>
              <div className="mt-4 space-y-3 text-xs leading-5 text-tv-muted">
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
                  <p className="font-semibold text-tv-text">{payload.source?.provider || (isEn ? 'Public data provider' : 'Penyedia data publik')}</p>
                  <p>{payload.source?.period || (isEn ? 'Latest available snapshot' : 'Snapshot terbaru yang tersedia')}</p>
                  <p>{formatRetrievedAt(payload.source?.retrievedAt)}</p>
                </div>
                <p>
                  {isEn
                    ? 'Status is computed from the majority of available indicators across the four pillars. Valuation metrics do not distort the business quality verdict.'
                    : 'Status dihitung dari mayoritas indikator yang tersedia pada empat pilar. Nilai N/A tidak ikut dihitung, dan metrik valuasi seperti PER/PBV tidak memengaruhi hasil.'}
                </p>
                <div className="flex items-start gap-2 rounded-xl border border-tv-green/15 bg-tv-green/[0.04] p-3 text-tv-text">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-tv-green" />
                  <span>
                    {isEn
                      ? 'These source cards are ratio-based clues only; they are not evidence of market share, brand power, switching costs, or network effects. Qualitative evidence remains unavailable until sourced.'
                      : 'Kartu sumber moat ini hanya petunjuk berbasis rasio; bukan bukti pangsa pasar, kekuatan merek, switching cost, atau network effect. Bukti kualitatif tetap N/A sampai ada sumbernya.'}
                  </span>
                </div>
              </div>
            </Card>
          </div>
        </>
      )}

      {payload && (
        <div className="pointer-events-none fixed left-0 top-0 -z-[1] opacity-0">
          <div ref={exportRef}>
            <MoatExportCard
              ticker={selectedTicker}
              stock={{ name: payload.stock?.name }}
              profile={{ sector: payload.profile?.sector, industry: payload.profile?.industry }}
              moat={moat}
              durability={
                payload.moatDurability
                  ? { status: payload.moatDurability.status, conclusion: payload.moatDurability.conclusion }
                  : null
              }
              exportedAt={new Date()}
            />
          </div>
        </div>
      )}
    </TickerAnalysisShell>
  );
}
