'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Brain, Lock, RefreshCw, SlidersHorizontal, TrendingUp } from 'lucide-react';
import { Skeleton, EmptyState, LoadingFact } from '@/components/ui';
import {
  THRESHOLD_RECOMMENDER_ENABLED,
  MIN_EFFECTIVE_SAMPLES_FOR_VALIDATION,
} from '@/modules/lens-radar/constants/research-status';

type Bucket = '80-100' | '70-79' | '60-69' | '<60';

interface CalibrationBucketChartRow {
  bucket: Bucket;
  avgReturnT20: number | null;
  totalSamples: number;
}

interface CalibrationTTestResult {
  comparison: '80-100 > <60';
  method: 'Welch one-tailed t-test';
  highBucketSamples: number;
  lowBucketSamples: number;
  highAvgT20: number | null;
  lowAvgT20: number | null;
  tStatistic: number | null;
  degreesOfFreedom: number | null;
  pValue: number | null;
  significant: boolean;
  conclusion: string;
}

interface ThresholdSimulation {
  threshold: number;
  avgReturnT20: number | null;
  medianReturnT20: number | null;
  meanMedianGapT20: number | null;
  distributionWarning: 'MEAN_POSITIVE_MEDIAN_NEGATIVE' | null;
  winRateT20: number | null;
  avgWinT20: number | null;
  avgLossT20: number | null;
  expectancyT20: number | null;
  profitFactorT20: number | null;
  totalSignals: number;
  signalDeltaPctVs80: number | null;
  winRateDeltaPctVs80: number | null;
}

interface LensScoreWeights {
  technical: number;
  fundamental: number;
  flow: number;
}

interface LensWeightProposal {
  id?: number;
  runDate: string;
  status: 'PENDING_APPROVAL' | 'INSUFFICIENT_STATS' | 'INSUFFICIENT_COMPONENT_HISTORY' | 'NO_VALID_CANDIDATE';
  reason: string;
  baselineWeights: LensScoreWeights;
  proposedWeights: LensScoreWeights | null;
  baselineSpreadT20: number | null;
  proposedSpreadT20: number | null;
  baselinePValue: number | null;
  proposedPValue: number | null;
  baselineSampleSize: number;
  proposedSampleSize: number;
  componentSampleSize: number;
  candidateCount: number;
  lookbackDays: number;
  statsWindowStart: string | null;
  statsWindowEnd: string | null;
  createdAt?: string;
}

interface RobustValidationResult {
  sampleBasis: string;
  audit: { version: 'rv-2.1'; deterministic: true; datasetHash: string; observations: number; firstSignalDate: string | null; lastSignalDate: string | null; bootstrapSeed: number; permutationSeed: number; bootstrapIterationsRequested: number; permutationIterationsRequested: number };
  effectiveSamples: number;
  highBucketSamples: number;
  lowBucketSamples: number;
  bootstrap: { iterations: number; spreadMean: number | null; ci95Low: number | null; ci95High: number | null; excludesZero: boolean; status: 'SUPPORTIVE' | 'INCONCLUSIVE' | 'NEGATIVE' | 'INSUFFICIENT_DATA' };
  permutation: { iterations: number; observedSpread: number | null; pValueOneTailed: number | null; significant: boolean };
  informationCoefficient: { samples: number; ic: number | null };
  monthlyInformationCoefficient: { minSamplesPerMonth: number; months: number; positiveMonths: number; positiveMonthPct: number | null; meanIc: number | null; stdDevIc: number | null; icir: number | null; rows: Array<{ month: string; samples: number; ic: number }> };
  monotonicity: { positiveSteps: number; totalSteps: number; score: number | null };
}

interface CalibrationDashboardData {
  asOfDate: string;
  latestStatsRunDate: string | null;
  sourceRows: number;
  uniqueTickers: number;
  observationsT20: number;
  chart: CalibrationBucketChartRow[];
  chartSource: 'live-calibration-observations';
  cronComparison: { runDate: string | null; liveHighBucketSamples: number; cronHighBucketSamples: number | null; deltaHighBucketSamples: number | null; populationMismatch: boolean; note: string };
  tTest: CalibrationTTestResult;
  robustValidation: RobustValidationResult;
  thresholdSimulations: ThresholdSimulation[];
  latestWeightProposal: LensWeightProposal | null;
}

interface ThresholdRecommendation {
  threshold: number | null;
  text: string;
  aiGenerated: boolean;
  supportingSimulation: ThresholdSimulation | null;
  baseline80: ThresholdSimulation | null;
}

// Keempat pemformat di bawah dulu mengembalikan '-' polos. Di halaman kalibrasi
// statistik, tanda hubung tidak membedakan "sampelnya nol", "tidak bisa dihitung",
// dan "gagal dimuat" - padahal itu justru yang perlu dibedakan sebelum seorang
// admin mengambil keputusan atas angkanya.
const EMPTY = 'belum ada';

function pct(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return EMPTY;
  return `${value.toFixed(digits)}%`;
}

function num(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return EMPTY;
  return value.toLocaleString('id-ID');
}

function pValue(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return 'belum bisa dihitung';
  if (value < 0.0001) return '<0.0001';
  return value.toFixed(4);
}

/** Sel angka yang meredup saat kosong, supaya baris tanpa data tidak terbaca
 *  sekuat baris yang benar-benar punya angka. */
function Val({ value, tone, className = '' }: { value: number | null | undefined; tone?: 'signed'; className?: string }) {
  const empty = value == null || !Number.isFinite(value);
  const color = empty
    ? 'text-tv-muted/60 italic'
    : tone === 'signed'
      ? ((value as number) >= 0 ? 'text-tv-green' : 'text-tv-red')
      : 'text-tv-text';
  return <span className={`font-number ${color} ${className}`}>{pct(value)}</span>;
}

function LoadingState() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <Skeleton className="h-[420px] w-full xl:col-span-3" />
        <Skeleton className="h-[420px] w-full xl:col-span-2" />
      </div>
      <LoadingFact />
    </div>
  );
}

function weightText(weights: LensScoreWeights | null | undefined): string {
  if (!weights) return 'belum ada usulan bobot';
  return `Teknikal ${weights.technical}% • Fundamental ${weights.fundamental}% • Flow ${weights.flow}%`;
}

/**
 * Tooltip batang per bucket. Bawaan Recharts cuma menyebut nilainya; jumlah sampel
 * di balik angka itu justru yang menentukan apakah ia layak dipercaya.
 */
function BucketTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as CalibrationBucketChartRow | undefined;
  const v = payload[0]?.value as number | null | undefined;
  const tipis = (row?.totalSamples ?? 0) > 0 && (row?.totalSamples ?? 0) < 30;
  return (
    <div className="rounded-lg border border-tv-border bg-tv-card/95 px-3 py-2.5 shadow-2 backdrop-blur-sm">
      <div className="text-[10px] uppercase tracking-wide text-tv-muted">Bucket {label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-tv-muted text-xs">Avg T+20</span>
        <Val value={v} tone="signed" className="text-sm font-semibold" />
      </div>
      <div className="mt-1 text-[11px] text-tv-muted">
        {num(row?.totalSamples)} sampel
        {tipis && <span className="text-tv-warning"> · terlalu sedikit untuk disimpulkan</span>}
      </div>
    </div>
  );
}

export default function CalibrationClient() {
  const [data, setData] = useState<CalibrationDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [threshold, setThreshold] = useState(80);
  const [recommendation, setRecommendation] = useState<ThresholdRecommendation | null>(null);
  const [recommending, setRecommending] = useState(false);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/calibration');
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error || 'Gagal memuat data kalibrasi');
        setData(null);
        return;
      }
      setData(json);
      setThreshold(80);
    } catch {
      setError('Gagal memuat data kalibrasi');
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const selectedSimulation = useMemo(() => (
    data?.thresholdSimulations.find((sim) => sim.threshold === threshold) ?? null
  ), [data, threshold]);

  const baseline80 = useMemo(() => (
    data?.thresholdSimulations.find((sim) => sim.threshold === 80) ?? null
  ), [data]);

  async function requestRecommendation() {
    setRecommending(true);
    setRecommendation(null);
    try {
      const res = await fetch('/api/admin/calibration/recommend-threshold', { method: 'POST' });
      const json = await res.json();
      if (res.ok) {
        setRecommendation(json);
        if (typeof json?.threshold === 'number') setThreshold(json.threshold);
      } else {
        setRecommendation({
          threshold: null,
          text: json?.error || 'AI belum bisa membuat rekomendasi saat ini.',
          aiGenerated: false,
          supportingSimulation: null,
          baseline80: baseline80,
        });
      }
    } catch {
      setRecommendation({
        threshold: null,
        text: 'AI belum bisa membuat rekomendasi saat ini.',
        aiGenerated: false,
        supportingSimulation: null,
        baseline80: baseline80,
      });
    } finally {
      setRecommending(false);
    }
  }

  if (loading) return <LoadingState />;

  if (error || !data) {
    return (
      <div className="bg-tv-card border border-tv-border rounded-xl">
        <EmptyState
          illustration="empty"
          title="Kalibrasi gagal dimuat"
          description={`${error || 'Data tidak tersedia.'} Perhitungan ini membaca lens_radar_history langsung, bukan cache - kegagalan di sini berarti query-nya tidak selesai, bukan bahwa datanya kosong.`}
          action={{ label: 'Coba muat ulang', onClick: loadData }}
        />
      </div>
    );
  }

  const hasEnoughT20 = data.observationsT20 > 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="bg-tv-card border border-tv-border rounded-xl p-4">
          <div className="text-xs text-tv-muted uppercase">As-of</div>
          <div className="font-number text-xl font-bold mt-1">{data.asOfDate}</div>
        </div>
        <div className="bg-tv-card border border-tv-border rounded-xl p-4">
          <div className="text-xs text-tv-muted uppercase">Run Stats</div>
          <div className="font-number text-xl font-bold mt-1">{data.latestStatsRunDate || 'On-demand'}</div>
        </div>
        <div className="bg-tv-card border border-tv-border rounded-xl p-4">
          <div className="text-xs text-tv-muted uppercase">Histori Valid</div>
          <div className="font-number text-xl font-bold mt-1">{num(data.sourceRows)}</div>
        </div>
        <div className="bg-tv-card border border-tv-border rounded-xl p-4">
          <div className="text-xs text-tv-muted uppercase">Observasi T+20</div>
          <div className="font-number text-xl font-bold mt-1">{data.observationsT20.toLocaleString('id-ID')}</div>
          {/* Angka telanjang tidak menyatakan ia sedang menuju ambang tertentu. */}
          <div className="text-[10px] text-tv-muted mt-0.5">dari {MIN_EFFECTIVE_SAMPLES_FOR_VALIDATION} minimum</div>
        </div>
      </div>

      {/* Nol observasi bukan kegagalan: tiap sinyal perlu 20 hari bursa berlalu dulu
          sebelum bisa dihitung. Yang selama ini hilang adalah keterangan sudah sampai
          mana - satu paragraf kuning tidak menunjukkan progres apa pun. */}
      {!hasEnoughT20 && (
        <div className="bg-tv-card border border-tv-border rounded-xl overflow-hidden">
          <EmptyState
            illustration="collecting"
            title="Observasi T+20 belum terkumpul"
            description="Setiap sinyal baru bisa dihitung setelah 20 hari bursa berlalu sejak tanggal skornya. Seluruh angka di bawah akan tetap kosong sampai itu terpenuhi - halaman ini sengaja tidak menampilkan angka pengganti."
            progress={{
              current: data.observationsT20,
              total: MIN_EFFECTIVE_SAMPLES_FOR_VALIDATION,
              unit: 'observasi',
              label: 'Observasi T+20 terkumpul',
            }}
          />
          <p className="pb-5 text-center text-[11px] text-tv-muted">
            Histori mentah tersedia: <span className="font-number text-tv-text">{num(data.sourceRows)}</span> baris
            dari <span className="font-number text-tv-text">{num(data.uniqueTickers)}</span> emiten.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <section className="xl:col-span-3 bg-tv-card border border-tv-border rounded-xl p-5">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h2 className="font-heading text-lg font-bold flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-tv-green" />
                Avg Return T+20 per Bucket
              </h2>
              <p className="text-xs text-tv-muted mt-1">
                Net return setelah fee 0,4% + slippage 0,1%. Bucket &lt;60 tidak ditampilkan di grafik
                utama supaya fokus ke kandidat rekomendasi.
              </p>
            </div>
          </div>

          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              {/* Warna grid/tooltip/cursor sebelumnya hex palet lama (#2A2E39,
                  #131722, #1F2937) - lebih tua dari tv-*. */}
              <BarChart data={data.chart} margin={{ top: 16, right: 16, left: -12, bottom: 8 }}>
                <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="bucket" stroke="#1E293B" tick={{ fill: '#94A3B8', fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis stroke="#1E293B" tick={{ fill: '#94A3B8', fontSize: 12 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                {/* Garis nol: tanpa penanda ini, seluruh batang negatif tetap terlihat
                    "tumbuh ke atas" karena sumbu Y menyesuaikan diri ke rentang data. */}
                <ReferenceLine y={0} stroke="#2B3A55" />
                <Tooltip cursor={{ fill: '#1B2440', opacity: 0.4 }} content={<BucketTooltip />} />
                {/* BUG FIX (2026-08-06): fill dulu dipatok "#22c55e" untuk SEMUA batang,
                    jadi bucket dengan avg return NEGATIF digambar hijau - warnanya
                    menyatakan kebalikan dari angkanya sendiri, di grafik yang justru
                    dipakai memutuskan ambang skor. */}
                <Bar dataKey="avgReturnT20" name="Avg T+20" radius={[8, 8, 0, 0]}>
                  {data.chart.map((row) => (
                    <Cell
                      key={row.bucket}
                      fill={row.avgReturnT20 == null ? '#1E293B' : row.avgReturnT20 >= 0 ? '#22C55E' : '#EF4444'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* grid-cols-3 dipatok padahal jumlah bucket yang dikirim API tidak dijamin
              tiga - kolomnya sekarang mengikuti jumlah baris yang benar-benar ada. */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
            {data.chart.map((row) => {
              const tipis = row.totalSamples > 0 && row.totalSamples < 30;
              return (
                <div key={row.bucket} className={`bg-tv-bg border border-tv-border rounded-lg p-3 ${row.totalSamples === 0 ? 'opacity-55' : ''}`}>
                  <div className="text-xs text-tv-muted">Bucket {row.bucket}</div>
                  <Val value={row.avgReturnT20} tone="signed" className="block font-bold mt-1" />
                  <div className={`text-[11px] mt-1 ${tipis ? 'text-tv-warning' : 'text-tv-muted'}`}>
                    {num(row.totalSamples)} sampel{tipis ? ' *' : ''}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[10px] text-tv-muted">
            <span className="text-tv-warning">*</span> di bawah 30 sampel - rata-ratanya masih didominasi kebetulan.
          </p>
        </section>

        <section className="xl:col-span-2 bg-tv-card border border-tv-border rounded-xl p-5">
          <h2 className="font-heading text-lg font-bold mb-1">T-test Validasi Edge</h2>
          <p className="text-xs text-tv-muted mb-4">
            Hipotesis: bucket 80-100 punya return T+20 lebih tinggi dari bucket &lt;60.
          </p>

          <div className={`rounded-lg border p-4 mb-4 ${
            data.tTest.significant
              ? 'border-tv-green/40 bg-tv-green/10 text-tv-green'
              : 'border-tv-yellow/40 bg-tv-yellow/10 text-tv-yellow'
          }`}>
            <div className="text-xs uppercase tracking-wide opacity-80">Kesimpulan</div>
            <div className="font-bold mt-1">{data.tTest.conclusion}</div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-tv-border">
                <tr>
                  <td className="py-2 text-tv-muted">Metode</td>
                  <td className="py-2 text-right">{data.tTest.method}</td>
                </tr>
                <tr>
                  <td className="py-2 text-tv-muted">Perbandingan</td>
                  <td className="py-2 text-right font-mono">{data.tTest.comparison}</td>
                </tr>
                <tr>
                  <td className="py-2 text-tv-muted">Avg T+20 80-100</td>
                  <td className="py-2 text-right font-number">{pct(data.tTest.highAvgT20)}</td>
                </tr>
                <tr>
                  <td className="py-2 text-tv-muted">Avg T+20 &lt;60</td>
                  <td className="py-2 text-right font-number">{pct(data.tTest.lowAvgT20)}</td>
                </tr>
                <tr>
                  <td className="py-2 text-tv-muted">Sampel 80-100 / &lt;60</td>
                  <td className="py-2 text-right font-number">
                    {num(data.tTest.highBucketSamples)} / {num(data.tTest.lowBucketSamples)}
                    <div className="text-[10px] text-tv-muted mt-1">effective non-overlap; raw threshold-80 = {num(baseline80?.totalSignals)}</div>
                  </td>
                </tr>
                <tr>
                  <td className="py-2 text-tv-muted">t-stat / df</td>
                  <td className="py-2 text-right font-number">
                    {data.tTest.tStatistic == null && data.tTest.degreesOfFreedom == null
                      ? <span className="text-tv-muted/60 italic">belum bisa dihitung</span>
                      : `${data.tTest.tStatistic ?? '?'} / ${data.tTest.degreesOfFreedom ?? '?'}`}
                  </td>
                </tr>
                <tr>
                  <td className="py-2 text-tv-muted">p-value</td>
                  <td className={`py-2 text-right font-number font-bold ${data.tTest.significant ? 'text-tv-green' : 'text-tv-yellow'}`}>
                    {pValue(data.tTest.pValue)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="bg-tv-card border border-tv-border rounded-xl p-5">
        <h2 className="font-heading text-lg font-bold mb-1">Robust Validation</h2>
        <p className="text-xs text-tv-muted mb-4">Cross-check edge dengan calendar-week block bootstrap, permutation test, Spearman IC, monthly IC/ICIR, dan monotonicity. Semua memakai sampel efektif T+20 yang sudah didekorelasikan.</p>

        {data.cronComparison.populationMismatch && (
          <div className="rounded-lg border border-tv-yellow/40 bg-tv-yellow/10 p-3 mb-4 text-xs text-tv-yellow">
            <div className="font-semibold">Snapshot cron berbeda dari observasi live</div>
            <div className="mt-1 opacity-90">Bucket 80-100: live {num(data.cronComparison.liveHighBucketSamples)} vs cron {num(data.cronComparison.cronHighBucketSamples)} (run {data.cronComparison.runDate ?? '—'}). {data.cronComparison.note}</div>
          </div>
        )}

        <div className="rounded-lg border border-tv-border bg-tv-bg/60 p-3 mb-4 text-[11px] text-tv-muted">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2">
            <div>
              <span className="font-semibold text-tv-text">Audit reproducible · {data.robustValidation.audit.version}</span>
              <span className="ml-2">dataset {data.robustValidation.audit.datasetHash}</span>
            </div>
            <div>
              {data.robustValidation.audit.firstSignalDate ?? '—'} → {data.robustValidation.audit.lastSignalDate ?? '—'} · {num(data.robustValidation.audit.observations)} observasi efektif
            </div>
          </div>
          <div className="mt-1 opacity-80">
            Deterministic seed: bootstrap {data.robustValidation.audit.bootstrapSeed} · permutation {data.robustValidation.audit.permutationSeed}. Dataset yang sama menghasilkan statistik resampling yang sama.
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-tv-bg border border-tv-border rounded-lg p-4">
            <div className="text-xs text-tv-muted uppercase">Bootstrap 95% CI</div>
            <div className="font-number font-bold mt-1">{pct(data.robustValidation.bootstrap.ci95Low)} – {pct(data.robustValidation.bootstrap.ci95High)}</div>
            <div className={`text-[11px] mt-1 font-semibold ${data.robustValidation.bootstrap.status === 'SUPPORTIVE' ? 'text-tv-green' : data.robustValidation.bootstrap.status === 'NEGATIVE' ? 'text-tv-red' : 'text-tv-yellow'}`}>
              {data.robustValidation.bootstrap.status === 'SUPPORTIVE' ? 'Supportive: seluruh CI di atas 0' : data.robustValidation.bootstrap.status === 'NEGATIVE' ? 'Negative: seluruh CI di bawah 0' : data.robustValidation.bootstrap.status === 'INCONCLUSIVE' ? 'Inconclusive: CI melewati 0' : 'Data belum cukup'}
            </div>
          </div>
          <div className="bg-tv-bg border border-tv-border rounded-lg p-4">
            <div className="text-xs text-tv-muted uppercase">Permutation p</div>
            <div className="font-number text-2xl font-bold mt-1">{pValue(data.robustValidation.permutation.pValueOneTailed)}</div>
            <div className="text-[11px] text-tv-muted mt-1">within-week labels, one-tailed</div>
          </div>
          <div className="bg-tv-bg border border-tv-border rounded-lg p-4">
            <div className="text-xs text-tv-muted uppercase">Spearman IC</div>
            <div className="font-number text-2xl font-bold mt-1">{data.robustValidation.informationCoefficient.ic ?? '—'}</div>
            <div className="text-[11px] text-tv-muted mt-1">pooled score vs forward T+20</div>
          </div>
          <div className="bg-tv-bg border border-tv-border rounded-lg p-4">
            <div className="text-xs text-tv-muted uppercase">Monthly ICIR</div>
            <div className="font-number text-2xl font-bold mt-1">{data.robustValidation.monthlyInformationCoefficient.icir ?? '—'}</div>
            <div className="text-[11px] text-tv-muted mt-1">mean IC {data.robustValidation.monthlyInformationCoefficient.meanIc ?? '—'} · {data.robustValidation.monthlyInformationCoefficient.positiveMonths}/{data.robustValidation.monthlyInformationCoefficient.months} bulan positif</div>
          </div>
          <div className="bg-tv-bg border border-tv-border rounded-lg p-4 col-span-2 lg:col-span-4">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2">
              <div>
                <div className="text-xs text-tv-muted uppercase">Monotonicity bucket</div>
                <div className="font-number text-xl font-bold mt-1">{data.robustValidation.monotonicity.positiveSteps}/{data.robustValidation.monotonicity.totalSteps} step naik</div>
              </div>
              <div className="text-[11px] text-tv-muted">Urutan diuji: &lt;60 → 60-69 → 70-79 → 80-100.</div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-tv-card border border-tv-border rounded-xl p-5">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-5">
          <div className="flex-1">
            <h2 className="font-heading text-lg font-bold flex items-center gap-2">
              <SlidersHorizontal className="w-5 h-5 text-tv-accent" />
              Simulasi Ambang Rekomendasi
            </h2>
            <p className="text-xs text-tv-muted mt-1">
              Geser ambang LensScore untuk melihat trade-off win rate T+20 vs jumlah sinyal.
              Baseline pembanding = ambang 80.
            </p>

            <div className="mt-6">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-tv-muted">Ambang LensScore</span>
                <span className="font-number font-bold text-tv-text">{threshold}</span>
              </div>
              <input
                type="range"
                min={60}
                max={90}
                step={1}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="w-full accent-tv-accent"
              />
              <div className="flex justify-between text-[11px] text-tv-muted mt-1">
                <span>60</span>
                <span>75</span>
                <span>80</span>
                <span>85</span>
                <span>90</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 lg:min-w-[660px]">
            <div className="bg-tv-bg border border-tv-border rounded-lg p-4">
              <div className="text-xs text-tv-muted uppercase">Win Rate T+20</div>
              <div className="font-number text-2xl font-bold mt-1">{pct(selectedSimulation?.winRateT20)}</div>
              <div className="text-[11px] text-tv-muted mt-1">
                Δ vs 80: {pct(selectedSimulation?.winRateDeltaPctVs80)}
              </div>
            </div>
            <div className="bg-tv-bg border border-tv-border rounded-lg p-4">
              <div className="text-xs text-tv-muted uppercase">Jumlah Sinyal</div>
              <div className="font-number text-2xl font-bold mt-1">{num(selectedSimulation?.totalSignals)}</div>
              <div className="text-[11px] text-tv-muted mt-1">
                Δ vs 80: {pct(selectedSimulation?.signalDeltaPctVs80, 0)}
              </div>
            </div>
            <div className="bg-tv-bg border border-tv-border rounded-lg p-4">
              <div className="text-xs text-tv-muted uppercase">Avg T+20</div>
              <div className="font-number text-2xl font-bold mt-1">{pct(selectedSimulation?.avgReturnT20)}</div>
              <div className="text-[11px] text-tv-muted mt-1">Net of cost</div>
            </div>
            <div className="bg-tv-bg border border-tv-border rounded-lg p-4">
              <div className="text-xs text-tv-muted uppercase">Median T+20</div>
              <div className="font-number text-2xl font-bold mt-1">{pct(selectedSimulation?.medianReturnT20)}</div>
              <div className="text-[11px] text-tv-muted mt-1">lebih tahan outlier</div>
            </div>
            <div className="bg-tv-bg border border-tv-border rounded-lg p-4">
              <div className="text-xs text-tv-muted uppercase">Profit Factor</div>
              <div className="font-number text-2xl font-bold mt-1">{selectedSimulation?.profitFactorT20?.toFixed(2) ?? '—'}</div>
              <div className="text-[11px] text-tv-muted mt-1">gross win / gross loss</div>
            </div>
            <div className="bg-tv-bg border border-tv-border rounded-lg p-4">
              <div className="text-xs text-tv-muted uppercase">Baseline 80</div>
              <div className="font-number text-2xl font-bold mt-1">{pct(baseline80?.winRateT20)}</div>
              <div className="text-[11px] text-tv-muted mt-1">{num(baseline80?.totalSignals)} sinyal</div>
            </div>
          </div>
        </div>

        {selectedSimulation?.distributionWarning === 'MEAN_POSITIVE_MEDIAN_NEGATIVE' && (
          <div className="mt-4 rounded-lg border border-tv-yellow/40 bg-tv-yellow/10 p-3 text-xs text-tv-yellow">
            <div className="font-semibold">Distribusi return sangat right-skewed</div>
            <div className="mt-1 opacity-90">Mean T+20 {pct(selectedSimulation.avgReturnT20)} tetapi median {pct(selectedSimulation.medianReturnT20)} (gap {pct(selectedSimulation.meanMedianGapT20)}). Edge rata-rata kemungkinan ditopang oleh sebagian winner besar; jangan membaca average sebagai hasil trade tipikal.</div>
          </div>
        )}

        {/* THRESHOLD_RECOMMENDER_ENABLED = false sejak audit kuantitatif: service-nya
            SELALU menolak dan mengembalikan pesan "dibekukan" (lihat
            calibration.service.ts baris 727). Sebelumnya tombol ini tetap tampil
            sebagai CTA utama berwarna aksen dan aktif setiap kali ada observasi T+20 -
            satu-satunya cara mengetahui fiturnya beku adalah menekannya dan membaca
            penolakan. Keadaan beku itu sekarang dinyatakan di muka. */}
        {!THRESHOLD_RECOMMENDER_ENABLED ? (
          <div className="mt-5 flex items-start gap-3 rounded-lg border border-tv-border bg-tv-bg p-4">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-tv-muted" />
            <div>
              <p className="text-sm font-semibold text-tv-text">Rekomendasi ambang otomatis dibekukan</p>
              <p className="mt-1 text-xs leading-relaxed text-tv-muted">
                Dibekukan sampai tersedia validasi out-of-sample dan koreksi pengujian berganda.
                Mencari ambang terbaik dari data yang sama yang dipakai mengujinya akan menemukan
                pemenang bahkan pada data acak. Angka simulasi di atas tetap boleh dipakai untuk
                riset, bukan untuk mengubah ambang produksi.
              </p>
            </div>
          </div>
        ) : (
          <div className="mt-5 flex flex-col sm:flex-row sm:items-center gap-3">
            <button
              onClick={requestRecommendation}
              disabled={recommending || !hasEnoughT20}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-tv-accent px-4 py-2.5 text-sm font-bold text-black hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            >
              {recommending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
              {recommending ? 'AI sedang menilai...' : 'Rekomendasikan Ambang Baru'}
            </button>
            <p className="text-xs text-tv-muted">
              AI hanya menyarankan ambang model, bukan rekomendasi beli/jual saham individual.
            </p>
          </div>
        )}

        {recommendation && (
          <div className="mt-4 rounded-xl border border-tv-accent/30 bg-tv-accent/10 p-4">
            <div className="text-xs text-tv-accent uppercase tracking-wide mb-1">
              {recommendation.aiGenerated ? 'LensAI Quant Recommendation' : 'Rule-based Recommendation'}
            </div>
            <p className="text-sm leading-relaxed text-tv-text">{recommendation.text}</p>
          </div>
        )}
      </section>

      <section className="bg-tv-card border border-tv-border rounded-xl p-5">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="font-heading text-lg font-bold">Rekomendasi Bobot Baru</h2>
            <p className="text-xs text-tv-muted mt-1">
              Dibuat otomatis tiap Minggu 18:00 WIB. Proposal hanya untuk review admin,
              tidak mengubah bobot production.
            </p>
          </div>
          {data.latestWeightProposal && (
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${
              data.latestWeightProposal.status === 'PENDING_APPROVAL'
                ? 'bg-tv-green/10 text-tv-green border border-tv-green/30'
                : 'bg-tv-yellow/10 text-tv-yellow border border-tv-yellow/30'
            }`}>
              {data.latestWeightProposal.status.replaceAll('_', ' ')}
            </span>
          )}
        </div>

        {!data.latestWeightProposal ? (
          <div className="rounded-lg border border-tv-border bg-tv-bg p-4 text-sm text-tv-muted">
            Belum ada proposal bobot. Proposal pertama akan dibuat oleh cron `lens-score-optimizer`
            setelah data validasi dan histori komponen tersedia.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-tv-border bg-tv-bg p-4">
              <div className="text-xs text-tv-muted uppercase mb-1">Catatan Optimizer</div>
              <p className="text-sm text-tv-text leading-relaxed">{data.latestWeightProposal.reason}</p>
              <p className="text-xs text-tv-muted mt-2">
                Run {data.latestWeightProposal.runDate} • Window {data.latestWeightProposal.statsWindowStart || 'belum ada'} s/d {data.latestWeightProposal.statsWindowEnd || 'belum ada'} •
                Sampel komponen {num(data.latestWeightProposal.componentSampleSize)} • Kandidat {num(data.latestWeightProposal.candidateCount)}
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-lg border border-tv-border bg-tv-bg p-4">
                <div className="text-xs text-tv-muted uppercase mb-2">Bobot Saat Ini</div>
                <div className="font-bold text-tv-text">{weightText(data.latestWeightProposal.baselineWeights)}</div>
                <div className="grid grid-cols-3 gap-2 mt-4 text-xs">
                  <div>
                    <div className="text-tv-muted">Spread T+20</div>
                    <div className="font-number font-bold">{pct(data.latestWeightProposal.baselineSpreadT20)}</div>
                  </div>
                  <div>
                    <div className="text-tv-muted">p-value</div>
                    <div className="font-number font-bold">{pValue(data.latestWeightProposal.baselinePValue)}</div>
                  </div>
                  <div>
                    <div className="text-tv-muted">Sampel</div>
                    <div className="font-number font-bold">{num(data.latestWeightProposal.baselineSampleSize)}</div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-tv-border bg-tv-bg p-4">
                <div className="text-xs text-tv-muted uppercase mb-2">Proposal Optimizer</div>
                <div className="font-bold text-tv-text">{weightText(data.latestWeightProposal.proposedWeights)}</div>
                <div className="grid grid-cols-3 gap-2 mt-4 text-xs">
                  <div>
                    <div className="text-tv-muted">Spread T+20</div>
                    {/* Dulu dipatok text-tv-green: spread usulan yang lebih BURUK dari
                        baseline tetap tampil hijau, seolah proposalnya selalu menang. */}
                    <Val value={data.latestWeightProposal.proposedSpreadT20} tone="signed" className="block font-bold" />
                  </div>
                  <div>
                    <div className="text-tv-muted">p-value</div>
                    <div className="font-number font-bold">{pValue(data.latestWeightProposal.proposedPValue)}</div>
                  </div>
                  <div>
                    <div className="text-tv-muted">Sampel</div>
                    <div className="font-number font-bold">{num(data.latestWeightProposal.proposedSampleSize)}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
