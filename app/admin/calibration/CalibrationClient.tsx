'use client';

import { Button } from '@/components/ui/Button';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ErrorBar,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { Brain, Lock, RefreshCw, SlidersHorizontal, TrendingUp } from 'lucide-react';
import { Card, Skeleton, EmptyState, LoadingFact } from '@/components/ui';
import {
  THRESHOLD_RECOMMENDER_ENABLED,
  MIN_EFFECTIVE_SAMPLES_FOR_VALIDATION,
} from '@/modules/lens-radar/constants/research-status';
import { apiErrorMessage, apiRequest } from '@/shared/http/api-client';

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


interface RetrospectiveWalkForwardResult {
  method: 'retrospective contiguous temporal holdout diagnostic';
  genuineOos: false;
  foldsRequested: number;
  foldsCompleted: number;
  positiveSpreadFolds: number;
  positiveSpreadPct: number | null;
  rows: Array<{ fold: number; startDate: string; endDate: string; samples: number; highSamples: number; lowSamples: number; highAvgT20: number | null; lowAvgT20: number | null; spreadT20: number | null; ic: number | null; positiveSpread: boolean }>;
  conclusion: string;
}

interface GenuineOosResult {
  protocolVersion: string;
  scoreVersion: string;
  freezeDate: string;
  rule: string;
  status: 'WAITING_FOR_MATURITY' | 'INSUFFICIENT_SAMPLE' | 'PASS' | 'FAIL';
  matureRawSamples: number;
  matureEffectiveSamples: number;
  highBucketSamples: number;
  lowBucketSamples: number;
  firstSignalDate: string | null;
  lastSignalDate: string | null;
  gate: { minEffectivePerEdgeBucket: number; spreadPositive: boolean; bootstrapSupportive: boolean; permutationPass: boolean; icPositive: boolean; monotonicityPass: boolean };
  conclusion: string;
}

interface ReliabilityBin {
  binLow: number;
  binHigh: number;
  samples: number;
  wins: number;
  meanScore: number;
  predicted: number;
  observed: number;
  wilsonLow: number;
  wilsonHigh: number;
  reliable: boolean;
  predictionWithinCi: boolean;
}

interface CalibrationMetrics {
  samples: number;
  baseRate: number;
  ece: number;
  brier: number;
  brierBaseRate: number;
  brierSkillScore: number;
}

interface ScoreCalibrationResult {
  protocolVersion: string;
  outcomeRule: string;
  status: 'WAITING_FOR_MATURITY' | 'INSUFFICIENT_SAMPLE' | 'REPORTED';
  samples: number;
  binWidth: number;
  minSamplesPerReliableBin: number;
  reliableBins: number;
  bins: ReliabilityBin[];
  naive: CalibrationMetrics | null;
  isotonic: {
    method: string;
    fitted: boolean;
    splitDate: string | null;
    trainSamples: number;
    testSamples: number;
    curve: Array<{ score: number; probability: number }>;
    naiveOnTest: CalibrationMetrics | null;
    isotonicOnTest: CalibrationMetrics | null;
    improvesBrierOutOfSample: boolean;
    note: string;
  };
  naiveMappingRejectedBins: number;
  naiveMappingRejected: boolean;
  conclusion: string;
}

interface FundamentalPitCoverageDiagnostic {
  totalRows: number;
  rowsWithFundamental: number;
  coveragePct: number | null;
  status: 'NO_HISTORY' | 'NO_FUNDAMENTAL_COVERAGE' | 'MIXED_FUNDAMENTAL_COVERAGE' | 'FULL_FUNDAMENTAL_COVERAGE';
  byDate: Array<{ date: string; totalRows: number; rowsWithFundamental: number; coveragePct: number }>;
  note: string;
}

interface CalibrationDashboardData {
  asOfDate: string;
  latestStatsRunDate: string | null;
  scoreVersion: string | null;
  requestedScoreVersion: string;
  scoreConfigHash: string;
  configRejectedRows: number;
  rejectedRows: number;
  versionRejectedReason: string | null;
  sourceRows: number;
  uniqueTickers: number;
  observationsT20: number;
  chart: CalibrationBucketChartRow[];
  chartSource: 'live-calibration-observations';
  cronComparison: { runDate: string | null; liveHighBucketSamples: number; cronHighBucketSamples: number | null; deltaHighBucketSamples: number | null; populationMismatch: boolean; note: string };
  tTest: CalibrationTTestResult;
  robustValidation: RobustValidationResult;
  retrospectiveWalkForward: RetrospectiveWalkForwardResult;
  genuineOos: GenuineOosResult;
  scoreCalibration: ScoreCalibrationResult;
  fundamentalPitCoverage: FundamentalPitCoverageDiagnostic;
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

/** Probabilitas 0..1 dirender sebagai persen. Dipisah dari pct() yang menerima persen. */
function prob(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return EMPTY;
  return `${(value * 100).toFixed(digits)}%`;
}

function score4(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return EMPTY;
  return value.toFixed(4);
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

// Label TAMPILAN untuk status proposal. Nilai enum-nya sendiri (PENDING_APPROVAL, dst)
// SENGAJA tidak diubah - itu tersimpan di baris database lama dan dipakai service, jadi
// mengganti namanya berarti migrasi data demi sekadar kata-kata.
//
// "PENDING_APPROVAL" apa adanya menyesatkan: pembaca mencari tombol Approve, padahal
// tidak pernah ada dan memang tidak dirancang ada. Menerapkan proposal = mengubah bobot
// di kode lalu deploy, supaya perubahan yang menggeser skor SELURUH saham untuk SEMUA
// pengguna tetap punya jejak git, bisa di-review, dan bisa di-rollback. Labelnya sekarang
// menyebutkan jalur itu, dan langkah persisnya ditulis di bawah kartu proposal.
const PROPOSAL_STATUS_LABEL: Record<string, string> = {
  PENDING_APPROVAL: 'Siap direview — diterapkan lewat deploy',
  INSUFFICIENT_STATS: 'Statistik belum cukup',
  INSUFFICIENT_COMPONENT_HISTORY: 'Histori komponen belum cukup',
  NO_VALID_CANDIDATE: 'Tidak ada kandidat yang lolos',
};

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
    <Card as="div" padding="none" radius="lg" elevation="none" overflow="visible" highlight={false} className="border-tv-border bg-tv-card/95 px-3 py-2.5 shadow-2 backdrop-blur-sm">
      <div className="text-[10px] uppercase tracking-wide text-tv-muted">Bucket {label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-tv-muted text-xs">Avg T+20</span>
        <Val value={v} tone="signed" className="text-sm font-semibold" />
      </div>
      <div className="mt-1 text-[11px] text-tv-muted">
        {num(row?.totalSamples)} sampel
        {tipis && <span className="text-tv-warning"> · terlalu sedikit untuk disimpulkan</span>}
      </div>
    </Card>
  );
}

// Posisi awal slider simulasi saja - murni tampilan, tidak mengubah ambang apa pun di
// produksi. Baseline pembanding sengaja TETAP 80: seluruh kolom "Δ vs 80" dan
// calculateThresholdSimulations() mengukur terhadap 80, jadi menggeser baseline berarti
// membandingkan angka terhadap dirinya sendiri.
//
// Riwayat: 90 -> 85 (2026-08-12), 85 -> 80 (2026-08-15). Keduanya permintaan pemilik
// produk, dan keduanya HANYA memindahkan posisi awal slider.
//
// Alasan 90 ditinggalkan tetap berlaku: makin tinggi ambangnya makin sedikit sinyal yang
// lolos, dan pada 90 sampelnya jatuh ke 66 - win rate di kartu paling kiri tidak lagi bisa
// dibaca sebagai apa pun.
//
// KONSEKUENSI YANG DISENGAJA dari memilih 80: 80 adalah baseline pembanding di
// calculateThresholdSimulations(), jadi saat halaman dibuka seluruh kolom "Δ vs 80"
// membaca 0,00%. Itu BUKAN bug dan bukan data kosong - geser slider ke angka lain dan
// kolomnya hidup lagi. Dicatat di sini supaya tidak ada yang "memperbaikinya" balik ke 85.
//
// Yang TIDAK berubah oleh baris ini: ambang produksi. Label STRONG BUY/BUY tetap diputuskan
// SCORING_KATEGORI_THRESHOLDS (STRONG_BUY 75, BUY 60) di
// modules/technical/service/decision-thresholds.ts, dan tidak ada tombol di panel admin
// mana pun yang bisa mengubahnya saat runtime.
//
// Konteks data saat perubahan ini dibuat (dibaca langsung dari produksi 2026-08-15):
// ambang 80 memberi 517 sinyal, win rate 36,17% (LEBIH RENDAH dari 38,77% di 75),
// avg T+20 +0,09% net tetapi median -2,81% - ditandai MEAN_POSITIVE_MEDIAN_NEGATIVE,
// artinya untungnya dari segelintir outlier. Bootstrap CI 95% -4,77%..+7,25% masih
// melewati nol. Tidak ada ambang di tabel ini yang tervalidasi; angka simulasi tetap
// untuk riset, bukan dasar mengubah produksi.
const DEFAULT_SIMULATION_THRESHOLD = 80;

export default function CalibrationClient() {
  const [data, setData] = useState<CalibrationDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [threshold, setThreshold] = useState(DEFAULT_SIMULATION_THRESHOLD);
  const [recommendation, setRecommendation] = useState<ThresholdRecommendation | null>(null);
  const [recommending, setRecommending] = useState(false);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const json = await apiRequest<any>('/api/admin/calibration');
      setData(json);
      setThreshold(DEFAULT_SIMULATION_THRESHOLD);
    } catch (error) {
      setError(apiErrorMessage(error, 'Gagal memuat data kalibrasi', true));
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

  // ErrorBar recharts membaca OFFSET dari titiknya, bukan batas absolut. Wilson memberi
  // batas absolut, jadi selisihnya dihitung di sini - kalau tidak, batang CI akan digambar
  // dari posisi yang salah dan diagramnya berbohong secara diam-diam.
  const reliabilityPoints = useMemo(() => (
    (data?.scoreCalibration.bins ?? []).map((bin) => ({
      ...bin,
      ciOffset: [
        Math.max(0, bin.observed - bin.wilsonLow),
        Math.max(0, bin.wilsonHigh - bin.observed),
      ] as [number, number],
    }))
  ), [data]);

  // Ambang tinggi menyaring sinyal dengan cepat: di 90 jumlah sampel bisa jatuh ke satuan,
  // dan win rate 100% dari 3 sinyal tampil persis seperti edge nyata di kartu paling kiri.
  // Batasnya memakai konstanta yang sama dengan gerbang validasi lain supaya "cukup sampel"
  // berarti satu hal saja di seluruh produk.
  const thinSample = selectedSimulation != null
    && selectedSimulation.totalSignals < MIN_EFFECTIVE_SAMPLES_FOR_VALIDATION;

  async function requestRecommendation() {
    setRecommending(true);
    setRecommendation(null);
    try {
      const json = await apiRequest<any>('/api/admin/calibration/recommend-threshold', { method: 'POST' });
      setRecommendation(json);
      if (typeof json?.threshold === 'number') setThreshold(json.threshold);
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
      <Card as="div" padding="none" radius="xl" elevation="none" overflow="visible" highlight={false} className="border-tv-border">
        <EmptyState
          illustration="empty"
          title="Kalibrasi gagal dimuat"
          description={`${error || 'Data tidak tersedia.'} Perhitungan ini membaca lens_radar_history langsung, bukan cache - kegagalan di sini berarti query-nya tidak selesai, bukan bahwa datanya kosong.`}
          action={{ label: 'Coba muat ulang', onClick: loadData }}
        />
      </Card>
    );
  }

  const hasEnoughT20 = data.observationsT20 > 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <Card as="div" padding="none" radius="xl" elevation="none" overflow="visible" highlight={false} className="border-tv-border p-4">
          <div className="text-xs text-tv-muted uppercase">As-of</div>
          <div className="font-number text-xl font-bold mt-1">{data.asOfDate}</div>
        </Card>
        <Card as="div" padding="none" radius="xl" elevation="none" overflow="visible" highlight={false} className="border-tv-border p-4">
          <div className="text-xs text-tv-muted uppercase">Run Stats</div>
          <div className="font-number text-xl font-bold mt-1">{data.latestStatsRunDate || 'On-demand'}</div>
        </Card>
        <Card as="div" padding="none" radius="xl" elevation="none" overflow="visible" highlight={false} className="border-tv-border p-4">
          <div className="text-xs text-tv-muted uppercase">Histori Valid</div>
          <div className="font-number text-xl font-bold mt-1">{num(data.sourceRows)}</div>
        </Card>
        <Card as="div" padding="none" radius="xl" elevation="none" overflow="visible" highlight={false} className="border-tv-border p-4">
          <div className="text-xs text-tv-muted uppercase">Observasi T+20</div>
          <div className="font-number text-xl font-bold mt-1">{data.observationsT20.toLocaleString('id-ID')}</div>
          {/* Angka telanjang tidak menyatakan ia sedang menuju ambang tertentu. */}
          <div className="text-[10px] text-tv-muted mt-0.5">dari {MIN_EFFECTIVE_SAMPLES_FOR_VALIDATION} minimum</div>
        </Card>
      </div>

      <section className="rounded-xl border border-tv-border bg-tv-card/40 p-4 text-xs">
        <h2 className="font-bold uppercase tracking-wide text-tv-text">Identitas model tervalidasi</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div><div className="text-tv-muted">Versi skor</div><div className="mt-1 font-number text-tv-text">{data.scoreVersion || data.requestedScoreVersion}</div></div>
          <div><div className="text-tv-muted">Hash konfigurasi</div><div className="mt-1 break-all font-mono text-[11px] text-tv-text">{data.scoreConfigHash}</div></div>
          <div><div className="text-tv-muted">Histori ditolak</div><div className="mt-1 font-number text-tv-text">{data.rejectedRows.toLocaleString('id-ID')} baris ({data.configRejectedRows.toLocaleString('id-ID')} beda konfigurasi)</div></div>
        </div>
        {data.versionRejectedReason && <p className="mt-3 leading-relaxed text-tv-yellow">{data.versionRejectedReason}</p>}
      </section>

      <section className={`rounded-xl border p-4 ${
        data.fundamentalPitCoverage.status === 'FULL_FUNDAMENTAL_COVERAGE'
          ? 'border-tv-green/30 bg-tv-green/5'
          : 'border-tv-yellow/40 bg-tv-yellow/5'
      }`}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-tv-muted">Coverage Fundamental PIT (H-06)</div>
            <div className="mt-1 font-number text-xl font-bold">
              {data.fundamentalPitCoverage.coveragePct == null ? EMPTY : pct(data.fundamentalPitCoverage.coveragePct)}
            </div>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-tv-muted">{data.fundamentalPitCoverage.note}</p>
          </div>
          <div className="text-xs text-tv-muted lg:text-right">
            <div className="font-semibold text-tv-text">{data.fundamentalPitCoverage.status}</div>
            <div className="mt-1 font-number">
              {num(data.fundamentalPitCoverage.rowsWithFundamental)} / {num(data.fundamentalPitCoverage.totalRows)} row
            </div>
          </div>
        </div>
        {data.fundamentalPitCoverage.byDate.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {data.fundamentalPitCoverage.byDate.slice(-12).map((row) => (
              <Card as="div" padding="none" radius="lg" elevation="none" overflow="visible" highlight={false} key={row.date} className="border-tv-border bg-tv-card/70 px-3 py-2">
                <div className="text-[10px] text-tv-muted">{row.date}</div>
                <div className="mt-0.5 font-number text-sm font-semibold">{pct(row.coveragePct)}</div>
                <div className="text-[10px] text-tv-muted">{num(row.rowsWithFundamental)}/{num(row.totalRows)}</div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Nol observasi bukan kegagalan: tiap sinyal perlu 20 hari bursa berlalu dulu
          sebelum bisa dihitung. Yang selama ini hilang adalah keterangan sudah sampai
          mana - satu paragraf kuning tidak menunjukkan progres apa pun. */}
      {!hasEnoughT20 && (
        <Card as="div" padding="none" radius="xl" elevation="none" overflow="hidden" highlight={false} className="border-tv-border">
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
        </Card>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <Card as="section" padding="none" radius="xl" elevation="none" overflow="visible" highlight={false} className="xl:col-span-3 border-tv-border p-5">
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
        </Card>

        <Card as="section" padding="none" radius="xl" elevation="none" overflow="visible" highlight={false} className="xl:col-span-2 border-tv-border p-5">
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
        </Card>
      </div>

      <Card as="section" padding="none" radius="xl" elevation="none" overflow="visible" highlight={false} className="border-tv-border p-5">
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
      </Card>

      <Card as="section" padding="none" radius="xl" elevation="none" overflow="visible" highlight={false} className="border-tv-border p-5">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3 mb-4">
          <div>
            <h2 className="font-heading text-lg font-bold">Forward / Out-of-Sample Protocol</h2>
            <p className="text-xs text-tv-muted mt-1">Pisahkan diagnostic historis dari genuine forward OOS. Histori sebelum freeze tidak pernah di-backfill sebagai OOS.</p>
          </div>
          <div className={`rounded-full px-3 py-1 text-xs font-semibold self-start ${data.genuineOos.status === 'PASS' ? 'bg-tv-green/15 text-tv-green' : data.genuineOos.status === 'FAIL' ? 'bg-tv-red/15 text-tv-red' : 'bg-tv-yellow/15 text-tv-yellow'}`}>
            {data.genuineOos.status}
          </div>
        </div>

        <div className="rounded-lg border border-tv-border bg-tv-bg/60 p-4 mb-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div><div className="text-tv-muted uppercase">Protocol</div><div className="font-number font-bold mt-1">{data.genuineOos.protocolVersion}</div></div>
            <div><div className="text-tv-muted uppercase">Freeze date</div><div className="font-number font-bold mt-1">{data.genuineOos.freezeDate}</div></div>
            <div><div className="text-tv-muted uppercase">Mature raw / effective</div><div className="font-number font-bold mt-1">{num(data.genuineOos.matureRawSamples)} / {num(data.genuineOos.matureEffectiveSamples)}</div></div>
            <div><div className="text-tv-muted uppercase">Edge buckets effective</div><div className="font-number font-bold mt-1">{num(data.genuineOos.highBucketSamples)} / {num(data.genuineOos.lowBucketSamples)}</div></div>
          </div>
          <div className="text-xs text-tv-muted mt-3">{data.genuineOos.conclusion}</div>
        </div>

        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Retrospective temporal stability</div>
            <div className="text-[11px] text-tv-muted">Bukan genuine OOS; hanya menunjukkan apakah edge stabil pada blok waktu historis yang berurutan.</div>
          </div>
          <div className="font-number text-sm">{data.retrospectiveWalkForward.positiveSpreadFolds}/{data.retrospectiveWalkForward.foldsCompleted} fold spread positif</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-tv-muted border-b border-tv-border"><th className="text-left py-2">Fold</th><th className="text-left py-2">Periode</th><th className="text-right py-2">N</th><th className="text-right py-2">Spread 80-100 vs &lt;60</th><th className="text-right py-2">IC</th></tr></thead>
            <tbody>{data.retrospectiveWalkForward.rows.map((row) => (<tr key={row.fold} className="border-b border-tv-border/60"><td className="py-2">{row.fold}</td><td className="py-2">{row.startDate} → {row.endDate}</td><td className="py-2 text-right font-number">{num(row.samples)}</td><td className={`py-2 text-right font-number ${row.spreadT20 != null && row.spreadT20 > 0 ? 'text-tv-green' : 'text-tv-red'}`}>{pct(row.spreadT20)}</td><td className="py-2 text-right font-number">{row.ic ?? '—'}</td></tr>))}</tbody>
          </table>
        </div>
        <div className="text-[11px] text-tv-muted mt-3">{data.retrospectiveWalkForward.conclusion}</div>
      </Card>

      {/* KALIBRASI (temuan C-04). Sebelum bagian ini ada, halaman bernama "Calibration Lab"
          hanya mengukur discrimination - apakah skor tinggi berakhir lebih baik daripada
          skor rendah. Pertanyaan kedua, apakah angka skornya berarti sesuatu dalam satuan
          probabilitas, tidak pernah ditanyakan sama sekali. */}
      <Card as="section" padding="none" radius="xl" elevation="none" overflow="visible" highlight={false} className="border-tv-border p-5">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3 mb-4">
          <div>
            <h2 className="font-heading text-lg font-bold">Kalibrasi Skor</h2>
            <p className="text-xs text-tv-muted mt-1">
              Discrimination menjawab &quot;apakah skor 85 lebih baik daripada 55&quot;. Kalibrasi menjawab
              pertanyaan lain: kalau skor 85 dibaca sebagai 85% peluang menang, apakah 85% dari
              sinyal skor 85 benar-benar menang? Model bisa benar pada yang pertama dan kacau pada
              yang kedua secara bersamaan.
            </p>
          </div>
          <div className={`rounded-full px-3 py-1 text-xs font-semibold self-start ${data.scoreCalibration.status === 'REPORTED' ? 'bg-tv-blue/15 text-tv-blue' : 'bg-tv-yellow/15 text-tv-yellow'}`}>
            {data.scoreCalibration.status}
          </div>
        </div>

        <div className="rounded-lg border border-tv-border bg-tv-bg/60 p-4 mb-4 text-xs">
          <div className="text-tv-muted uppercase">Definisi outcome (ditetapkan sebelum melihat data)</div>
          <div className="font-number mt-1 text-tv-text">{data.scoreCalibration.outcomeRule}</div>
          <div className="text-tv-muted mt-2">
            Protokol {data.scoreCalibration.protocolVersion} • {num(data.scoreCalibration.samples)} sampel efektif •
            lebar bin {data.scoreCalibration.binWidth} poin • {data.scoreCalibration.reliableBins} bin mencapai{' '}
            {data.scoreCalibration.minSamplesPerReliableBin} sampel
          </div>
        </div>

        {/* Pemetaan p = skor/100 BUKAN klaim produk - tidak ada satu tempat pun yang
            menerjemahkan LensScore 76 jadi "76% peluang untung". Ia dipakai sebagai garis
            acuan supaya pertanyaan "berapa jauh skor dari satuan probabilitas" punya jawaban
            berangka. Tanpa catatan ini, ECE besar mudah disalahbaca sebagai bug. */}
        <div className="rounded-lg border border-tv-border bg-tv-bg p-3 mb-4 text-[11px] text-tv-muted leading-relaxed">
          Pemetaan naif <span className="font-number text-tv-text">p = skor/100</span> di bawah adalah
          TITIK ACUAN, bukan klaim yang sedang dibela. SahamLens tidak pernah menyebut LensScore
          sebagai persen peluang. ECE yang besar terhadap acuan ini adalah hasil yang diharapkan -
          dan justru itu alasan angka skor tidak boleh dibaca sebagai persen.
        </div>

        {data.scoreCalibration.bins.length > 0 ? (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div>
                <div className="text-sm font-semibold mb-1">Reliability diagram</div>
                <div className="text-[11px] text-tv-muted mb-3">
                  Sumbu-x prediksi, sumbu-y frekuensi menang yang teramati, batang vertikal = CI 95%
                  Wilson. Titik yang duduk di garis putus-putus berarti terkalibrasi.
                </div>
                <div style={{ width: '100%', height: 280 }}>
                  <ResponsiveContainer>
                    <ScatterChart margin={{ top: 10, right: 16, bottom: 24, left: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis
                        type="number" dataKey="predicted" domain={[0, 1]} tick={{ fontSize: 11 }}
                        tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
                        label={{ value: 'Prediksi (skor/100)', position: 'insideBottom', offset: -12, fontSize: 11 }}
                      />
                      <YAxis
                        type="number" dataKey="observed" domain={[0, 1]} tick={{ fontSize: 11 }}
                        tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
                      />
                      <ZAxis type="number" dataKey="samples" range={[40, 400]} />
                      {/* Garis kalibrasi sempurna. */}
                      <ReferenceLine
                        segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]}
                        stroke="#9CA3AF" strokeDasharray="4 4" ifOverflow="extendDomain"
                      />
                      <Tooltip
                        cursor={{ strokeDasharray: '3 3' }}
                        contentStyle={{ background: '#12161F', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 12 }}
                        formatter={(value) => prob(typeof value === 'number' ? value : null)}
                      />
                      <Scatter data={reliabilityPoints} fill="#4F8CFF">
                        <ErrorBar dataKey="ciOffset" width={4} strokeWidth={1.5} stroke="#4F8CFF" direction="y" />
                        {data.scoreCalibration.bins.map((bin) => (
                          <Cell key={bin.binLow} fill={bin.reliable ? (bin.predictionWithinCi ? '#23C483' : '#FF5D6C') : '#5B6472'} />
                        ))}
                      </Scatter>
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap gap-4 text-[11px] text-tv-muted mt-1">
                  <span><span className="inline-block w-2 h-2 rounded-full bg-tv-green mr-1" />terkalibrasi</span>
                  <span><span className="inline-block w-2 h-2 rounded-full bg-tv-red mr-1" />meleset dari CI</span>
                  <span><span className="inline-block w-2 h-2 rounded-full bg-[#5B6472] mr-1" />sampel belum cukup</span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-tv-muted border-b border-tv-border">
                      <th className="text-left py-2">Bin skor</th>
                      <th className="text-right py-2">N</th>
                      <th className="text-right py-2">Prediksi</th>
                      <th className="text-right py-2">Teramati</th>
                      <th className="text-right py-2">CI 95%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.scoreCalibration.bins.map((bin) => (
                      <tr key={bin.binLow} className="border-b border-tv-border/60">
                        <td className="py-2 font-number">{bin.binLow}-{bin.binHigh}</td>
                        <td className={`py-2 text-right font-number ${bin.reliable ? '' : 'text-tv-muted'}`}>
                          {num(bin.samples)}{bin.reliable ? '' : ' *'}
                        </td>
                        <td className="py-2 text-right font-number">{prob(bin.predicted)}</td>
                        <td className="py-2 text-right font-number">{prob(bin.observed)}</td>
                        <td className={`py-2 text-right font-number ${bin.reliable && !bin.predictionWithinCi ? 'text-tv-red' : 'text-tv-muted'}`}>
                          {prob(bin.wilsonLow)}–{prob(bin.wilsonHigh)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="text-[11px] text-tv-muted mt-2">
                  * di bawah {data.scoreCalibration.minSamplesPerReliableBin} sampel - tetap ditampilkan,
                  tidak ikut menolak atau membenarkan apa pun.
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
              <div className="bg-tv-bg border border-tv-border rounded-lg p-4">
                <div className="text-xs text-tv-muted uppercase">ECE</div>
                <div className="font-number text-2xl font-bold mt-1">{score4(data.scoreCalibration.naive?.ece)}</div>
                <div className="text-[11px] text-tv-muted mt-1">rata-rata |teramati − prediksi|</div>
              </div>
              <div className="bg-tv-bg border border-tv-border rounded-lg p-4">
                <div className="text-xs text-tv-muted uppercase">Brier</div>
                <div className="font-number text-2xl font-bold mt-1">{score4(data.scoreCalibration.naive?.brier)}</div>
                <div className="text-[11px] text-tv-muted mt-1">base rate: {score4(data.scoreCalibration.naive?.brierBaseRate)}</div>
              </div>
              <div className="bg-tv-bg border border-tv-border rounded-lg p-4">
                <div className="text-xs text-tv-muted uppercase">Skill score</div>
                <div className={`font-number text-2xl font-bold mt-1 ${(data.scoreCalibration.naive?.brierSkillScore ?? 0) > 0 ? 'text-tv-green' : 'text-tv-red'}`}>
                  {score4(data.scoreCalibration.naive?.brierSkillScore)}
                </div>
                <div className="text-[11px] text-tv-muted mt-1">negatif = kalah dari tebakan konstan</div>
              </div>
              <div className="bg-tv-bg border border-tv-border rounded-lg p-4">
                <div className="text-xs text-tv-muted uppercase">Base rate</div>
                <div className="font-number text-2xl font-bold mt-1">{prob(data.scoreCalibration.naive?.baseRate)}</div>
                <div className="text-[11px] text-tv-muted mt-1">frekuensi menang keseluruhan</div>
              </div>
            </div>

            {/* Bagian yang benar-benar informatif: apakah ADA pemetaan monoton dari skor ke
                probabilitas yang bertahan di luar sampel latihnya. Fit di seluruh data lalu
                dilaporkan sebagai bukti adalah cara tercepat menghasilkan kalibrasi sempurna
                yang tidak berarti apa-apa - karena itu split-nya temporal dan dinyatakan. */}
            <div className="mt-5 rounded-lg border border-tv-border bg-tv-bg/60 p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                <div className="text-sm font-semibold">Isotonic regression — fit di TRAIN, diuji di TEST</div>
                <div className="text-[11px] text-tv-muted font-number">
                  {data.scoreCalibration.isotonic.trainSamples} train / {data.scoreCalibration.isotonic.testSamples} test
                  {data.scoreCalibration.isotonic.splitDate ? ` • split ${data.scoreCalibration.isotonic.splitDate}` : ''}
                </div>
              </div>

              {data.scoreCalibration.isotonic.fitted ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-tv-muted border-b border-tv-border">
                        <th className="text-left py-2">Pemetaan (dinilai di TEST yang sama)</th>
                        <th className="text-right py-2">Brier</th>
                        <th className="text-right py-2">ECE</th>
                        <th className="text-right py-2">Skill score</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-tv-border/60">
                        <td className="py-2">Naif (skor/100)</td>
                        <td className="py-2 text-right font-number">{score4(data.scoreCalibration.isotonic.naiveOnTest?.brier)}</td>
                        <td className="py-2 text-right font-number">{score4(data.scoreCalibration.isotonic.naiveOnTest?.ece)}</td>
                        <td className="py-2 text-right font-number">{score4(data.scoreCalibration.isotonic.naiveOnTest?.brierSkillScore)}</td>
                      </tr>
                      <tr className="border-b border-tv-border/60">
                        <td className="py-2">Isotonic (hasil TRAIN)</td>
                        <td className={`py-2 text-right font-number ${data.scoreCalibration.isotonic.improvesBrierOutOfSample ? 'text-tv-green' : 'text-tv-red'}`}>
                          {score4(data.scoreCalibration.isotonic.isotonicOnTest?.brier)}
                        </td>
                        <td className="py-2 text-right font-number">{score4(data.scoreCalibration.isotonic.isotonicOnTest?.ece)}</td>
                        <td className={`py-2 text-right font-number ${(data.scoreCalibration.isotonic.isotonicOnTest?.brierSkillScore ?? 0) > 0 ? 'text-tv-green' : 'text-tv-red'}`}>
                          {score4(data.scoreCalibration.isotonic.isotonicOnTest?.brierSkillScore)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <div className="text-[11px] text-tv-muted mt-2">
                    Kurva: {data.scoreCalibration.isotonic.curve.map((point) => `${point.score}→${prob(point.probability, 0)}`).join('  ')}
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <Lock className="mt-0.5 h-4 w-4 shrink-0 text-tv-muted" />
                  <p className="text-xs leading-relaxed text-tv-muted">{data.scoreCalibration.isotonic.note}</p>
                </div>
              )}

              {data.scoreCalibration.isotonic.fitted && (
                <p className="text-[11px] text-tv-muted mt-3 leading-relaxed">{data.scoreCalibration.isotonic.note}</p>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-start gap-3 rounded-lg border border-tv-border bg-tv-bg p-4">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-tv-muted" />
            <p className="text-xs leading-relaxed text-tv-muted">{data.scoreCalibration.conclusion}</p>
          </div>
        )}

        {data.scoreCalibration.bins.length > 0 && (
          <div className={`mt-4 rounded-lg border p-3 text-xs ${data.scoreCalibration.naiveMappingRejected ? 'border-tv-red/40 bg-tv-red/10 text-tv-red' : 'border-tv-border bg-tv-bg text-tv-muted'}`}>
            {data.scoreCalibration.conclusion}
          </div>
        )}
      </Card>

      <Card as="section" padding="none" radius="xl" elevation="none" overflow="visible" highlight={false} className="border-tv-border p-5">
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
              <div className={`font-number text-2xl font-bold mt-1 ${thinSample ? 'text-tv-yellow' : ''}`}>
                {pct(selectedSimulation?.winRateT20)}
              </div>
              <div className="text-[11px] text-tv-muted mt-1">
                Δ vs 80: {pct(selectedSimulation?.winRateDeltaPctVs80)}
              </div>
              {/* Peringatan dipasang PADA angkanya, bukan hanya di panel bawah: mata membaca
                  win rate lebih dulu, dan kartu jumlah sinyal di sebelahnya tidak menyatakan
                  bahwa angkanya terlalu kecil untuk dipercaya. */}
              {thinSample && (
                <div className="text-[11px] text-tv-yellow mt-0.5">
                  n={num(selectedSimulation?.totalSignals)} - belum layak dibaca
                </div>
              )}
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

        {thinSample && (
          <div className="mt-4 rounded-lg border border-tv-yellow/40 bg-tv-yellow/10 p-3 text-xs text-tv-yellow">
            <div className="font-semibold">Sampel terlalu tipis pada ambang {threshold}</div>
            <div className="mt-1 opacity-90">
              Hanya {num(selectedSimulation?.totalSignals)} sinyal lolos ambang ini, di bawah{' '}
              {MIN_EFFECTIVE_SAMPLES_FOR_VALIDATION} minimum yang dipakai gerbang validasi lain.
              Win rate, profit factor, dan median di atas tetap dihitung apa adanya, tetapi pada
              ukuran ini satu-dua trade sudah cukup membaliknya - selisihnya terhadap baseline 80
              belum bisa dibedakan dari kebetulan. Turunkan ambang atau tunggu observasi T+20
              bertambah.
            </div>
          </div>
        )}

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
            <Button variant="bare" size="none"
              onClick={requestRecommendation}
              disabled={recommending || !hasEnoughT20}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-tv-accent px-4 py-2.5 text-sm font-bold text-black hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            >
              {recommending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
              {recommending ? 'AI sedang menilai...' : 'Rekomendasikan Ambang Baru'}
            </Button>
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
      </Card>

      <Card as="section" padding="none" radius="xl" elevation="none" overflow="visible" highlight={false} className="border-tv-border p-5">
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
              {PROPOSAL_STATUS_LABEL[data.latestWeightProposal.status] ?? data.latestWeightProposal.status.replaceAll('_', ' ')}
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

            {data.latestWeightProposal.status === 'PENDING_APPROVAL' && (
              <div className="rounded-lg border border-tv-blue/25 bg-tv-blue/[0.06] p-4">
                <div className="text-sm font-bold text-tv-text">Cara menerapkan proposal ini</div>
                <p className="mt-1 text-xs leading-relaxed text-tv-muted">
                  Tidak ada tombol Approve di halaman ini, dan itu disengaja. Mengubah bobot menggeser
                  skor seluruh saham untuk semua pengguna sekaligus; lewat kode, perubahan itu punya
                  jejak git, bisa direview, dan bisa dibatalkan kalau hasilnya memburuk.
                </p>
                <ol className="mt-3 space-y-1.5 text-xs leading-relaxed text-tv-text">
                  <li>
                    1. Buka <code className="font-mono text-tv-blue">shared/constants/lens-score-weights.ts</code>
                  </li>
                  <li>
                    2. Ubah <code className="font-mono text-tv-blue">LENS_SCORE_WEIGHTS</code> menjadi{' '}
                    <span className="font-bold">{weightText(data.latestWeightProposal.proposedWeights)}</span>
                  </li>
                  <li>3. Jalankan <code className="font-mono text-tv-blue">npm test</code> — bobot wajib berjumlah 100 dan ada test yang menjaganya</li>
                  <li>4. Commit dengan alasan + angka p-value/spread di atas, lalu deploy</li>
                  <li>5. Muat ulang halaman ini: kolom &quot;Bobot Saat Ini&quot; harus berubah mengikuti angka baru</li>
                </ol>
                <p className="mt-3 text-xs leading-relaxed text-tv-muted">
                  Belum yakin? Biarkan saja. Proposal ini tidak kedaluwarsa dan tidak mengubah apa pun
                  selama belum di-deploy — optimizer akan mengusulkan ulang setiap Minggu.
                </p>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
