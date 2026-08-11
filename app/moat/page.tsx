'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Award,
  BarChart3,
  CheckCircle2,
  CircleHelp,
  Database,
  ExternalLink,
  RefreshCcw,
  Shield,
} from 'lucide-react';
import { TickerAnalysisShell } from '@/components/TickerAnalysisShell';
import { Badge, Button, Card, Skeleton } from '@/components/ui';
import {
  buildMoatProxy,
  type FundamentalAnalyzerSnapshot,
  type MoatProxyStatus,
} from '@/modules/fundamental/service/moat-proxy.service';

interface MoatPayload {
  ticker: string;
  analyzers?: FundamentalAnalyzerSnapshot[];
  /** Pilar ketahanan 4 tahun buku - lihat modules/fundamental/service/moat-durability.service.ts.
   * Opsional: emiten yang tahun bukunya kurang dari minimum tidak mengirimnya. */
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

const QUALITATIVE_GAPS = [
  {
    label: 'Pangsa pasar',
    detail: 'Perlu laporan industri atau paparan publik emiten.',
  },
  {
    label: 'Switching cost',
    detail: 'Perlu bukti retensi pelanggan dan kontrak.',
  },
  {
    label: 'Kekuatan merek',
    detail: 'Perlu data harga, loyalitas, dan belanja pemasaran.',
  },
  {
    label: 'Network effect',
    detail: 'Perlu data pengguna, transaksi, dan kepadatan jaringan.',
  },
  {
    label: 'Lisensi dan regulasi',
    detail: 'Perlu penelaahan izin serta hambatan masuk industri.',
  },
];

const INDICATOR_NAMES: Record<string, string> = {
  'ROE (Profitability)': 'Return on Equity',
  'ROA (Efficiency)': 'Return on Assets',
  'Gross Margin': 'Gross Margin',
  'Operating Margin': 'Operating Margin',
  'Net Profit Margin': 'Net Profit Margin',
  'EPS Growth (QoQ)': 'Pertumbuhan EPS',
  'Revenue Growth (YoY)': 'Pertumbuhan Pendapatan',
  'Debt/Equity (Risk)': 'Debt to Equity',
  'Current Ratio (Liquidity)': 'Current Ratio',
  'Quick Ratio (Liquidity)': 'Quick Ratio',
};

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

function formatRetrievedAt(value?: string) {
  if (!value) return 'Waktu pengambilan tidak tersedia';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Waktu pengambilan tidak tersedia';
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(date) + ' WIB';
}

function statusBadge(status: MoatProxyStatus) {
  if (status === 'KUAT') return <Badge variant='success' dot>KUAT</Badge>;
  if (status === 'LEMAH') return <Badge variant='danger' dot>LEMAH</Badge>;
  if (status === 'CAMPURAN') return <Badge variant='warning' dot>CAMPURAN</Badge>;
  return <Badge variant='neutral' dot>DATA TERBATAS</Badge>;
}

// Kosakata SENGAJA berbeda dari statusBadge di atas. "KUAT/LEMAH" menjawab "bagaimana
// rasionya sekarang"; "TAHAN/RAPUH" menjawab "apakah bertahan lintas waktu". Memakai kata
// yang sama untuk dua pertanyaan berbeda adalah cara tercepat membuat pembaca mengira
// keduanya mengukur hal yang sama - persis kegagalan kartu verdict di halaman teknikal.
function durabilityBadge(status: 'TAHAN' | 'CAMPURAN' | 'RAPUH' | 'DATA TERBATAS') {
  if (status === 'TAHAN') return <Badge variant='success' dot>TAHAN</Badge>;
  if (status === 'RAPUH') return <Badge variant='danger' dot>RAPUH</Badge>;
  if (status === 'CAMPURAN') return <Badge variant='warning' dot>CAMPURAN</Badge>;
  return <Badge variant='neutral' dot>DATA TERBATAS</Badge>;
}

function signalBadge(decision: 'BULLISH' | 'BEARISH' | 'NEUTRAL') {
  if (decision === 'BULLISH') return <Badge variant='success'>MENDUKUNG</Badge>;
  if (decision === 'BEARISH') return <Badge variant='danger'>PERLU DIWASPADAI</Badge>;
  return <Badge variant='neutral'>NETRAL</Badge>;
}

function MoatLoading() {
  return (
    <div className='grid gap-4 lg:grid-cols-2'>
      {[0, 1, 2, 3].map((item) => (
        <Card key={item} className='space-y-4'>
          <div className='flex items-center justify-between'>
            <Skeleton variant='text' className='w-36' />
            <Skeleton className='h-5 w-20 rounded-full' />
          </div>
          <Skeleton variant='text' className='w-3/4' />
          <Skeleton className='h-16 w-full rounded-xl' />
        </Card>
      ))}
    </div>
  );
}

export default function MoatPage() {
  const [ticker, setTicker] = useState('BBCA');
  const [payload, setPayload] = useState<MoatPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const selectedTicker = normalizeTicker(ticker) || 'BBCA';

  useEffect(() => {
    const controller = new AbortController();

    async function loadMoatData() {
      setLoading(true);
      setError(null);
      setPayload(null);

      try {
        const response = await fetch('/api/fundamental/' + encodeURIComponent(selectedTicker), {
          signal: controller.signal,
        });
        const result = await response.json() as MoatPayload;
        if (!response.ok) {
          throw new Error(result.error || 'Data fundamental publik belum tersedia.');
        }
        setPayload(result);
      } catch (caught) {
        if (controller.signal.aborted) return;
        setError(caught instanceof Error ? caught.message : 'Gagal mengambil data publik.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadMoatData();
    return () => controller.abort();
  }, [selectedTicker, reloadKey]);

  const moat = useMemo(
    () => buildMoatProxy(payload?.analyzers ?? []),
    [payload?.analyzers],
  );
  const website = safeWebsite(payload?.profile?.website);

  function handleTickerChange(nextTicker: string) {
    const normalized = normalizeTicker(nextTicker);
    if (!normalized) return;
    setTicker(normalized);
    window.localStorage.setItem('lastTicker', normalized);
  }

  return (
    <TickerAnalysisShell
      ticker={selectedTicker}
      onTickerChange={handleTickerChange}
      moduleTitle='Moat Proxy'
      icon={<Award className='h-6 w-6' />}
      accent='purple'
      title={'Proxy Kualitas Bisnis ' + selectedTicker}
      subtitle='Ringkasan kuantitatif dari fundamental publik. Ini bukan rating moat kualitatif dan bukan rekomendasi transaksi.'
      headerExtra={
        <div className='flex flex-wrap items-center gap-2'>
          <Badge variant='info' dot>{payload?.source?.provider || 'Sumber publik'}</Badge>
          {!loading && statusBadge(moat.status)}
        </div>
      }
    >
      {loading && <MoatLoading />}

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
            <RefreshCcw className='h-4 w-4' />
            Coba lagi
          </Button>
        </Card>
      )}

      {!loading && !error && payload && (
        <>
          <Card variant='glass' className='grid gap-5 lg:grid-cols-[1.4fr_1fr]'>
            <div className='min-w-0'>
              <div className='flex flex-wrap items-center gap-2'>
                <h2 className='font-heading text-xl font-bold text-tv-text'>
                  {payload.stock?.name || selectedTicker}
                </h2>
                <Badge variant='neutral'>{selectedTicker}.JK</Badge>
              </div>
              <p className='mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-tv-purple'>
                {[payload.profile?.sector, payload.profile?.industry].filter(Boolean).join(' · ') || 'Klasifikasi sektor belum tersedia'}
              </p>
              <p className='mt-4 line-clamp-4 text-sm leading-6 text-tv-muted'>
                {payload.profile?.description || 'Deskripsi bisnis belum tersedia dari sumber publik.'}
              </p>
              {website && (
                <a
                  href={website}
                  target='_blank'
                  rel='noreferrer'
                  className='mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-tv-blue hover:underline'
                >
                  Situs resmi perusahaan
                  <ExternalLink className='h-3.5 w-3.5' />
                </a>
              )}
            </div>

            <div className='rounded-2xl border border-tv-purple/20 bg-tv-purple/[0.06] p-4'>
              <div className='flex items-center justify-between gap-3'>
                <div>
                  <p className='text-[10px] font-bold uppercase tracking-[0.14em] text-tv-muted'>Hasil proxy</p>
                  <div className='mt-2'>{statusBadge(moat.status)}</div>
                </div>
                <Shield className='h-9 w-9 text-tv-purple' />
              </div>
              <div className='mt-5 flex items-end justify-between gap-3'>
                <div>
                  <p className='font-heading text-3xl font-bold text-tv-text'>{moat.available}/{moat.expected}</p>
                  <p className='text-xs text-tv-muted'>indikator tersedia</p>
                </div>
                <p className='text-right text-xs text-tv-muted'>{moat.coveragePct}% cakupan</p>
              </div>
              <div className='mt-3 h-2 overflow-hidden rounded-full bg-white/[0.06]'>
                <div
                  className='h-full rounded-full bg-tv-purple transition-[width] duration-500'
                  style={{ width: String(moat.coveragePct) + '%' }}
                />
              </div>
            </div>
          </Card>

          <div className='grid gap-3 sm:grid-cols-3'>
            <Card padding='sm'>
              <p className='text-xs text-tv-muted'>Indikator mendukung</p>
              <p className='mt-1 font-heading text-2xl font-bold text-tv-green'>{moat.supportive}</p>
            </Card>
            <Card padding='sm'>
              <p className='text-xs text-tv-muted'>Perlu diwaspadai</p>
              <p className='mt-1 font-heading text-2xl font-bold text-tv-red'>{moat.caution}</p>
            </Card>
            <Card padding='sm'>
              <p className='text-xs text-tv-muted'>Netral</p>
              <p className='mt-1 font-heading text-2xl font-bold text-tv-text'>{moat.neutral}</p>
            </Card>
          </div>

          {/* KETAHANAN (2026-08-12). Empat pilar di bawah dinilai dari rasio TERKINI.
              Moat menurut definisinya adalah daya tahan lintas waktu, jadi satu potret
              mengukur hal yang berbeda dari yang dijanjikan namanya: emiten di puncak
              siklus tampil kuat, bisnis bagus di tahun lemah tampil lemah. Bagian ini
              menilai 4 tahun buku, dan sengaja ditaruh DI ATAS keempat pilar itu. */}
          {payload?.moatDurability && (
            <section>
              <div className='mb-3 flex items-center gap-2'>
                <Award className='h-5 w-5 text-tv-purple' />
                <h2 className='font-heading text-lg font-bold text-tv-text'>
                  Ketahanan lintas waktu
                  {payload.moatDurability.firstFiscalYear
                    ? ' (' + payload.moatDurability.firstFiscalYear + '-' + payload.moatDurability.lastFiscalYear + ')'
                    : ''}
                </h2>
                {durabilityBadge(payload.moatDurability.status)}
              </div>

              {payload.moatDurability.checks.length > 0 ? (
                <div className='space-y-2'>
                  {payload.moatDurability.checks.map((check: any) => (
                    <div
                      key={check.key}
                      className={'rounded-lg border p-3 ' + (
                        check.verdict === 'SUPPORTIVE' ? 'border-tv-green/30 bg-tv-green/5'
                          : check.verdict === 'CAUTION' ? 'border-tv-red/30 bg-tv-red/5'
                            : 'border-tv-border bg-tv-bg'
                      )}
                    >
                      <div className='flex items-center justify-between gap-3'>
                        <span className='text-sm font-semibold text-tv-text'>{check.label}</span>
                        <span className={'text-[11px] font-bold ' + (
                          check.verdict === 'SUPPORTIVE' ? 'text-tv-green'
                            : check.verdict === 'CAUTION' ? 'text-tv-red'
                              : 'text-tv-muted'
                        )}>
                          {check.verdict === 'SUPPORTIVE' ? 'BERTAHAN'
                            : check.verdict === 'CAUTION' ? 'TIDAK BERTAHAN'
                              : 'TIDAK BERLAKU'}
                        </span>
                      </div>
                      <p className='mt-1 text-xs leading-relaxed text-tv-muted'>{check.detail}</p>
                    </div>
                  ))}
                </div>
              ) : null}

              <p className='mt-3 text-[11px] leading-relaxed text-tv-muted'>
                {payload.moatDurability.conclusion}
              </p>
              <p className='mt-2 text-[11px] leading-relaxed text-tv-muted/80'>
                Jendela 4 tahun buku dan bergulir setiap tahun - lebih pendek dari satu siklus
                komoditas penuh, jadi ini indikasi ketahanan jangka menengah, bukan vonis.
                Ambang tiap pemeriksaan belum diuji terhadap data historis IDX.
              </p>
            </section>
          )}

          <section>
            <div className='mb-3 flex items-center gap-2'>
              <BarChart3 className='h-5 w-5 text-tv-purple' />
              <h2 className='font-heading text-lg font-bold text-tv-text'>Empat pilar proxy kuantitatif</h2>
              <span className='text-[11px] text-tv-muted'>— potret terkini</span>
            </div>
            <div className='grid gap-4 lg:grid-cols-2'>
              {moat.pillars.map((pillar) => (
                <Card key={pillar.key} hoverable>
                  <div className='flex items-start justify-between gap-3'>
                    <div>
                      <h3 className='font-heading font-semibold text-tv-text'>{pillar.label}</h3>
                      <p className='mt-1 text-xs leading-5 text-tv-muted'>{pillar.description}</p>
                    </div>
                    {statusBadge(pillar.status)}
                  </div>

                  <div className='mt-4 space-y-2'>
                    {pillar.indicators.map((indicator) => (
                      <div
                        key={indicator.label}
                        className='flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-2.5'
                      >
                        <div>
                          <p className='text-xs font-medium text-tv-text'>
                            {INDICATOR_NAMES[indicator.label] || indicator.label}
                          </p>
                          <p className='mt-0.5 font-heading text-base font-bold text-tv-text'>{indicator.value}</p>
                        </div>
                        {signalBadge(indicator.decision)}
                      </div>
                    ))}
                    {pillar.indicators.length === 0 && (
                      <div className='rounded-xl border border-dashed border-white/[0.08] px-3 py-4 text-center text-xs text-tv-muted'>
                        Indikator pilar ini belum tersedia dari feed publik.
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </section>

          <div className='grid gap-4 xl:grid-cols-2'>
            <Card>
              <div className='flex items-center gap-2'>
                <CircleHelp className='h-5 w-5 text-tv-warning' />
                <h2 className='font-heading font-semibold text-tv-text'>Faktor moat yang belum dinilai</h2>
              </div>
              <p className='mt-2 text-xs leading-5 text-tv-muted'>
                Faktor berikut tidak disimpulkan otomatis karena membutuhkan bukti dari laporan tahunan, paparan publik, atau riset industri.
              </p>
              <div className='mt-4 space-y-2'>
                {QUALITATIVE_GAPS.map((gap) => (
                  <div key={gap.label} className='flex items-start gap-2.5 rounded-xl bg-white/[0.025] px-3 py-2.5'>
                    <CircleHelp className='mt-0.5 h-4 w-4 shrink-0 text-tv-muted' />
                    <div>
                      <p className='text-xs font-semibold text-tv-text'>{gap.label}</p>
                      <p className='mt-0.5 text-xs leading-5 text-tv-muted'>{gap.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <div className='flex items-center gap-2'>
                <Database className='h-5 w-5 text-tv-blue' />
                <h2 className='font-heading font-semibold text-tv-text'>Sumber dan metode</h2>
              </div>
              <div className='mt-4 space-y-3 text-xs leading-5 text-tv-muted'>
                <div className='rounded-xl border border-white/[0.06] bg-white/[0.025] p-3'>
                  <p className='font-semibold text-tv-text'>{payload.source?.provider || 'Penyedia data publik'}</p>
                  <p>{payload.source?.period || 'Snapshot terbaru yang tersedia'}</p>
                  <p>{formatRetrievedAt(payload.source?.retrievedAt)}</p>
                </div>
                <p>
                  Status dihitung dari mayoritas indikator yang tersedia pada empat pilar. Nilai N/A tidak ikut dihitung, dan metrik valuasi seperti PER/PBV tidak memengaruhi hasil.
                </p>
                <p>
                  Data penyedia publik dapat terlambat atau tidak lengkap. Cocokkan angka material dengan laporan resmi emiten sebelum mengambil keputusan.
                </p>
                <div className='flex items-start gap-2 rounded-xl border border-tv-green/15 bg-tv-green/[0.04] p-3 text-tv-text'>
                  <CheckCircle2 className='mt-0.5 h-4 w-4 shrink-0 text-tv-green' />
                  <span>Tidak ada skor pangsa pasar, merek, atau network effect yang dikarang saat datanya tidak tersedia.</span>
                </div>
              </div>
            </Card>
          </div>
        </>
      )}
    </TickerAnalysisShell>
  );
}
