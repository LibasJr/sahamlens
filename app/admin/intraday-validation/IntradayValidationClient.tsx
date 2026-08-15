'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Database, Loader2, Lock, PlayCircle, RefreshCw, Sliders } from 'lucide-react';
import { readAdminJsonResponse } from './admin-json-response';

// ---------------------------------------------------------------------------
// Tipe longgar - halaman ini hanya MENAMPILKAN apa yang dikirim server. Tidak ada
// nilai yang dihitung ulang di browser, supaya tidak muncul dua versi angka.
// ---------------------------------------------------------------------------

type Nullable<T> = T | null | undefined;

interface Dashboard {
  modelName: string;
  modelKey: string;
  modelVersion: string;
  configHash: string;
  provider: string;
  barInterval: string;
  timezone: string;
  weights: Record<string, number>;
  coverage: {
    totalSignals: number;
    totalOutcomes: number;
    filledOutcomes: number;
    distinctTickers: number;
    distinctTradingDays: number;
    firstTradingDate: Nullable<string>;
    lastTradingDate: Nullable<string>;
    lastSignalTimestamp: Nullable<string>;
  };
  dataQuality: {
    tickersTracked: number;
    daysTracked: number;
    totalExpectedBars: number;
    totalValidBars: number;
    totalMissingBars: number;
    totalDuplicateBars: number;
    totalInvalidOhlcBars: number;
    missingDayRows: number;
    completenessPct: Nullable<number>;
    problemTickers: Array<{ ticker: string; badDays: number; worstStatus: string }>;
    problemDates: Array<{ tradingDate: string; badTickers: number }>;
    lastRetrievedAt: Nullable<string>;
    lastFetchError: Nullable<{ ticker: string; error: string; at: string }>;
  };
  latestRun: Nullable<{ row: RunRow; result: ValidationResult | null }>;
  recentRuns: RunRow[];
  recentSamples: Array<{
    ticker: string;
    tradingDate: string;
    signalTimestamp: string;
    signalMinute: number;
    score: number;
    horizon: string;
    entryPriceRaw: Nullable<number>;
    exitPriceRaw: Nullable<number>;
    netReturn: Nullable<number>;
    exitReason: string;
    tradable: boolean | null;
  }>;
  oosProtocol: Nullable<{
    protocolVersion: string;
    freezeTimestamp: string;
    modelVersion: string;
    configHash: string;
    status: string;
    frozenBy: Nullable<string>;
  }>;
  oosProgress: {
    active: boolean;
    tradingDaysCollected: number;
    tradingDaysRequired: number;
    tickersCollected: number;
    tickersRequired: number;
    signalsCollected: number;
    tradingDaysRemaining: Nullable<number>;
  };
  latestWeightProposal: any;
  latestThresholdProposal: any;
  status: string;
  disclaimer: string;
}

interface RunRow {
  runId: number;
  status: string;
  startedAt: string;
  completedAt: Nullable<string>;
  sampleRaw: number;
  sampleEffective: number;
  datasetHash: Nullable<string>;
  protocolVersion: Nullable<string>;
  errorMessage: Nullable<string>;
  triggeredBy: Nullable<string>;
}

interface ValidationResult {
  generatedAt: string;
  status: string;
  datasetHash: Nullable<string>;
  windowFrom: Nullable<string>;
  windowTo: Nullable<string>;
  oosMode: boolean;
  freezeTimestamp: Nullable<string>;
  sample: { raw: number; mature: number; effective: number; distinctTickers: number; distinctDays: number; truncated: boolean };
  dataQualityGate: { passed: boolean; completenessPct: Nullable<number>; minRequired: number; reason: Nullable<string> };
  horizons: any[];
  buckets: Record<string, any[]>;
  monotonicity: Record<string, any>;
  timeOfDay: Record<string, any[]>;
  liquidity: Record<string, any[]>;
  concentration: { ticker: any; sector: any };
  regime: { definition: string; available: boolean; rows: any[] };
  calibration: any;
  componentDiagnostics: { rows: any[]; note: string };
  spreadFloor: {
    bindingShare: Nullable<number>;
    entryBindingShare: Nullable<number>;
    exitBindingShare: Nullable<number>;
    medianAppliedSlippageBps: Nullable<number>;
    medianEntrySlippageBps: Nullable<number>;
    medianExitSlippageBps: Nullable<number>;
    maxAppliedSlippageBps: Nullable<number>;
    note: string;
  };
  costSensitivity: any[];
  walkForward: any;
  multipleTesting: any[];
  acceptance: { criteria: any; items: any[]; passedAll: boolean; frozen: boolean };
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Formatter - null TIDAK PERNAH menjadi 0
// ---------------------------------------------------------------------------

const NA = <span className="text-tv-muted">n/a</span>;

function pct(value: Nullable<number>, digits = 2): React.ReactNode {
  if (value == null || !Number.isFinite(value)) return NA;
  return `${(value * 100).toFixed(digits)}%`;
}

function bps(value: Nullable<number>): React.ReactNode {
  if (value == null || !Number.isFinite(value)) return NA;
  return `${(value * 10_000).toFixed(1)} bps`;
}

function num(value: Nullable<number>, digits = 3): React.ReactNode {
  if (value == null || !Number.isFinite(value)) return NA;
  return value.toFixed(digits);
}

function int(value: Nullable<number>): React.ReactNode {
  if (value == null || !Number.isFinite(value)) return NA;
  return value.toLocaleString('id-ID');
}

function wib(iso: Nullable<string>): string {
  if (!iso) return 'belum pernah';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'tidak terbaca';
  return `${d.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' })} WIB`;
}

// Hijau HANYA untuk hasil yang lolos gerbangnya sendiri. Angka positif yang belum
// signifikan tetap netral - warna tidak boleh mendahului statistik.
const STATUS_STYLE: Record<string, string> = {
  DATA_NOT_READY: 'bg-tv-hover text-tv-muted border-tv-border',
  COLLECTING_DATA: 'bg-tv-blue/15 text-tv-blue border-tv-blue/40',
  WAITING_FOR_MATURITY: 'bg-tv-blue/15 text-tv-blue border-tv-blue/40',
  INSUFFICIENT_SAMPLE: 'bg-tv-yellow/15 text-tv-yellow border-tv-yellow/40',
  INCONCLUSIVE: 'bg-tv-yellow/15 text-tv-yellow border-tv-yellow/40',
  RESEARCH_ONLY: 'bg-tv-accent/15 text-tv-accent border-tv-accent/40',
  VALIDATION_FAILED: 'bg-tv-red/15 text-tv-red border-tv-red/40',
  CANDIDATE_VALIDATED: 'bg-tv-green/15 text-tv-green border-tv-green/40',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-bold tracking-wide ${
        STATUS_STYLE[status] ?? 'bg-tv-hover text-tv-muted border-tv-border'
      }`}
    >
      {status}
    </span>
  );
}

function Card({ title, subtitle, children, action }: { title: string; subtitle?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="bg-tv-card border border-tv-border rounded-lg mb-6 overflow-hidden">
      <div className="px-4 sm:px-6 py-4 border-b border-tv-border flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg font-bold text-tv-text">{title}</h2>
          {subtitle ? <p className="text-xs text-tv-muted mt-1 max-w-3xl">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      <div className="p-4 sm:p-6">{children}</div>
    </section>
  );
}

function Metric({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border border-tv-border bg-tv-bg p-3">
      <div className="text-[11px] uppercase tracking-wide text-tv-muted">{label}</div>
      <div className="mt-1 font-number text-sm font-semibold text-tv-text break-words">{value}</div>
      {hint ? <div className="mt-1 text-[11px] text-tv-muted">{hint}</div> : null}
    </div>
  );
}

/** Bar progres netral - tidak berwarna hijau sampai syaratnya benar-benar terpenuhi. */
function ProgressMetric({ label, current, required }: { label: string; current: number; required: number }) {
  const ratio = required > 0 ? Math.min(1, current / required) : 0;
  const done = current >= required;
  return (
    <div className="rounded-lg border border-tv-border bg-tv-bg p-3">
      <div className="text-[11px] uppercase tracking-wide text-tv-muted">{label}</div>
      <div className="mt-1 font-number text-sm font-semibold text-tv-text">
        {int(current)} / {int(required)}
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-tv-hover">
        <div
          className={`h-full rounded-full ${done ? 'bg-tv-green' : 'bg-tv-accent'}`}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
    </div>
  );
}

function Warnings({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul className="space-y-2">
      {items.map((warning, i) => (
        <li key={i} className="flex gap-2 rounded-md border border-tv-yellow/40 bg-tv-yellow/10 p-2.5 text-xs text-tv-yellow">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{warning}</span>
        </li>
      ))}
    </ul>
  );
}

function Scroller({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">{children}</div>;
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-left whitespace-nowrap font-semibold">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2 whitespace-nowrap font-number">{children}</td>;
}

function SampleTag({ status }: { status: string }) {
  if (status !== 'INSUFFICIENT_SAMPLE') return null;
  return <span className="ml-2 rounded bg-tv-yellow/15 px-1.5 py-0.5 text-[10px] font-bold text-tv-yellow">INSUFFICIENT_SAMPLE</span>;
}

// ---------------------------------------------------------------------------

type ActionName =
  | 'collect_data'
  | 'reset_research'
  | 'run_validation'
  | 'freeze_oos'
  | 'threshold_simulation'
  | 'threshold_proposal'
  | 'weight_proposal';

export default function IntradayValidationClient() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<ActionName | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [horizon, setHorizon] = useState<string>('H30');
  const [threshold, setThreshold] = useState<number>(60);
  const [thresholdSim, setThresholdSim] = useState<any>(null);
  const [weightProposal, setWeightProposal] = useState<any>(null);
  const [lookbackDays, setLookbackDays] = useState<number>(5);

  const load = useCallback(async () => {
    setLoading(true);
      setError(null);
    try {
      const res = await fetch('/api/admin/intraday-validation', { cache: 'no-store' });
      const data = await readAdminJsonResponse<Dashboard & { error?: string }>(res);
      if (!res.ok) throw new Error(data?.error || 'Gagal memuat dashboard');
      setDashboard(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runAction = useCallback(
    async (action: ActionName, payload: Record<string, unknown> = {}) => {
      setBusy(action);
      setActionMessage(null);
      try {
        const res = await fetch('/api/admin/intraday-validation/actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, ...payload }),
        });
        const data = await readAdminJsonResponse<any>(res);
        if (!res.ok) throw new Error(data?.error || 'Aksi gagal');
        if (action === 'threshold_simulation') setThresholdSim(data);
        else if (action === 'weight_proposal') setWeightProposal(data);
        else await load();
        setActionMessage(describeActionResult(action, data));
      } catch (err) {
        setActionMessage(err instanceof Error ? err.message : 'Aksi gagal');
      } finally {
        setBusy(null);
      }
    },
    [load]
  );

  const result = dashboard?.latestRun?.result ?? null;
  const horizons = useMemo(() => result?.horizons ?? [], [result]);

  if (loading && !dashboard) {
    return (
      <div className="flex items-center gap-2 text-sm text-tv-muted py-16">
        <Loader2 className="h-4 w-4 animate-spin" />
        Memuat Intraday Validation Lab...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-tv-red/40 bg-tv-red/10 p-4 text-sm text-tv-red">
        {error}
        <button onClick={() => void load()} className="ml-3 underline">
          Coba lagi
        </button>
      </div>
    );
  }

  if (!dashboard) return null;

  const { coverage, dataQuality } = dashboard;

  return (
    <div>
      <div className="mb-6 rounded-lg border border-tv-accent/40 bg-tv-accent/10 p-3 text-xs text-tv-accent">
        {dashboard.disclaimer}
      </div>

      {/* 1. STATUS UTAMA */}
      <Card
        title="Status Model"
        subtitle="Identitas dan cakupan data LensIntraday. Angka di sini hanya menyangkut model intraday, bukan LensScore T+20."
        action={
          <button
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-md border border-tv-border bg-tv-bg px-2.5 py-1.5 text-xs font-semibold text-tv-muted hover:text-tv-text"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Segarkan
          </button>
        }
      >
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <StatusBadge status={dashboard.status} />
          <span className="text-xs text-tv-muted">
            Model {dashboard.modelName} ({dashboard.modelKey})
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <Metric label="Model version" value={dashboard.modelVersion} />
          <Metric label="Config hash" value={dashboard.configHash} />
          <Metric label="Provider" value={dashboard.provider} />
          <Metric label="Interval candle" value={dashboard.barInterval} />
          <Metric label="Timezone" value={dashboard.timezone} />
          <Metric label="Raw signals" value={int(coverage.totalSignals)} />
          <Metric label="Outcome (semua horizon)" value={int(coverage.totalOutcomes)} />
          <Metric label="Outcome terisi (FILLED)" value={int(coverage.filledOutcomes)} />
          <Metric label="Jumlah ticker" value={int(coverage.distinctTickers)} />
          <Metric label="Hari bursa" value={int(coverage.distinctTradingDays)} />
          <Metric label="Rentang data" value={coverage.firstTradingDate ? `${coverage.firstTradingDate} s/d ${coverage.lastTradingDate}` : NA} />
          <Metric label="Sinyal terakhir" value={wib(coverage.lastSignalTimestamp)} />
          <Metric label="Last run" value={wib(dashboard.latestRun?.row?.completedAt ?? dashboard.latestRun?.row?.startedAt)} />
          <Metric label="As-of hasil" value={wib(result?.generatedAt)} />
          <Metric
            label="Freeze timestamp OOS"
            value={dashboard.oosProtocol ? wib(dashboard.oosProtocol.freezeTimestamp) : <span className="text-tv-muted">belum dibekukan</span>}
          />
          <Metric
            label="Status forward OOS"
            value={
              dashboard.oosProtocol
                ? result?.oosMode
                  ? 'Run terakhir memakai mode OOS'
                  : 'Protokol beku, run terakhir BUKAN mode OOS'
                : 'Belum ada protokol'
            }
          />
          <Metric label="Sampel efektif (run terakhir)" value={int(result?.sample?.effective)} />
          <Metric label="Sampel matang (run terakhir)" value={int(result?.sample?.mature)} />
        </div>

        <div className="mt-4 rounded-lg border border-tv-border bg-tv-bg p-3">
          <div className="text-[11px] uppercase tracking-wide text-tv-muted mb-2">Bobot LensIntraday (terpisah dari bobot produksi)</div>
          <div className="flex flex-wrap gap-2 text-xs font-number">
            {Object.entries(dashboard.weights).map(([key, value]) => (
              <span key={key} className="rounded border border-tv-border px-2 py-1">
                {key}: {value}
              </span>
            ))}
          </div>
        </div>

        {result?.warnings?.length ? (
          <div className="mt-4">
            <Warnings items={result.warnings} />
          </div>
        ) : null}
      </Card>

      {/* AKSI */}
      <Card
        title="Aksi Riset"
        subtitle="Pekerjaan berat dijalankan sebagai job dengan lock terdistribusi. Tidak satu pun aksi di sini mengubah ambang atau bobot produksi."
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-tv-muted">
            Lookback (hari)
            <input
              type="number"
              min={1}
              max={60}
              value={lookbackDays}
              onChange={(e) => setLookbackDays(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
              className="ml-2 w-20 rounded border border-tv-border bg-tv-bg px-2 py-1 text-tv-text font-number"
            />
          </label>
          <ActionButton
            icon={<Database className="h-4 w-4" />}
            label="Kumpulkan data intraday"
            busy={busy === 'collect_data'}
            disabled={busy != null}
            onClick={() => void runAction('collect_data', { lookbackDays })}
          />
          <ActionButton
            icon={<PlayCircle className="h-4 w-4" />}
            label="Jalankan validation run"
            busy={busy === 'run_validation'}
            disabled={busy != null}
            onClick={() => void runAction('run_validation', {})}
          />
          <ActionButton
            icon={<PlayCircle className="h-4 w-4" />}
            label="Validation run (OOS saja)"
            busy={busy === 'run_validation'}
            disabled={busy != null || !dashboard.oosProtocol}
            onClick={() => void runAction('run_validation', { oosOnly: true })}
          />
          <ActionButton
            icon={<Lock className="h-4 w-4" />}
            label="Bekukan protokol OOS"
            busy={busy === 'freeze_oos'}
            disabled={busy != null}
            onClick={() => void runAction('freeze_oos', {})}
          />
          <ActionButton
            icon={<AlertTriangle className="h-4 w-4" />}
            label="Reset data riset"
            busy={busy === 'reset_research'}
            disabled={busy != null}
            onClick={() => {
              if (window.confirm('Hapus seluruh data LensIntraday untuk masa testing? Data LensRadar, saham, pengguna, dan data produksi tidak akan disentuh.')) {
                void runAction('reset_research', { confirmation: 'RESET_INTRADAY_RESEARCH' });
              }
            }}
          />
        </div>
        {actionMessage ? (
          <p className="mt-3 rounded-md border border-tv-border bg-tv-bg p-2.5 text-xs text-tv-text">{actionMessage}</p>
        ) : null}
        <p className="mt-3 text-[11px] text-tv-muted">
          Backfill riset 60 hari: naikkan lookback ke 60 lalu tekan &quot;Kumpulkan data intraday&quot;. Provider hanya
          menyimpan 60 hari untuk interval 5 menit, jadi data lebih lama dari itu tidak bisa diambil ulang. Backfill dari browser
          berhenti aman sebelum timeout jaringan; tekan lagi bila status menyebut batas waktu tercapai.
        </p>
      </Card>

      {/* 2. DATA QUALITY */}
      <Card title="Data Quality" subtitle="Validasi tidak dijalankan kalau kelengkapan bar di bawah batas minimum.">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <Metric label="Candle valid" value={dataQuality.completenessPct == null ? NA : `${dataQuality.completenessPct}%`} />
          <Metric label="Bar mentah diharapkan" value={int(dataQuality.totalExpectedBars)} />
          <Metric label="Bar valid" value={int(dataQuality.totalValidBars)} />
          <Metric label="Missing bars" value={int(dataQuality.totalMissingBars)} />
          <Metric label="Duplicate bars" value={int(dataQuality.totalDuplicateBars)} />
          <Metric label="Invalid OHLC" value={int(dataQuality.totalInvalidOhlcBars)} />
          <Metric
            label="Hari hilang total"
            value={int(dataQuality.missingDayRows)}
            hint="Hari bursa berjalan (IHSG punya bar) tetapi emiten ini nihil bar."
          />
          <Metric label="Ticker terpantau" value={int(dataQuality.tickersTracked)} />
          <Metric label="Hari terpantau" value={int(dataQuality.daysTracked)} />
          <Metric label="Provider terakhir berhasil" value={wib(dataQuality.lastRetrievedAt)} />
          <Metric
            label="Error fetch terakhir"
            value={dataQuality.lastFetchError ? `${dataQuality.lastFetchError.ticker}: ${dataQuality.lastFetchError.error}` : <span className="text-tv-muted">tidak ada</span>}
          />
        </div>

        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <h3 className="text-xs font-semibold text-tv-muted uppercase mb-2">Ticker bermasalah</h3>
            {dataQuality.problemTickers.length === 0 ? (
              <p className="text-xs text-tv-muted">Tidak ada.</p>
            ) : (
              <Scroller>
                <table className="w-full text-xs">
                  <thead className="text-tv-muted">
                    <tr>
                      <Th>Ticker</Th>
                      <Th>Hari bermasalah</Th>
                      <Th>Status</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-tv-border">
                    {dataQuality.problemTickers.map((row) => (
                      <tr key={row.ticker}>
                        <Td>{row.ticker}</Td>
                        <Td>{int(row.badDays)}</Td>
                        <Td>{row.worstStatus}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Scroller>
            )}
          </div>
          <div>
            <h3 className="text-xs font-semibold text-tv-muted uppercase mb-2">Hari bursa bermasalah</h3>
            {dataQuality.problemDates.length === 0 ? (
              <p className="text-xs text-tv-muted">Tidak ada.</p>
            ) : (
              <Scroller>
                <table className="w-full text-xs">
                  <thead className="text-tv-muted">
                    <tr>
                      <Th>Tanggal</Th>
                      <Th>Ticker bermasalah</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-tv-border">
                    {dataQuality.problemDates.map((row) => (
                      <tr key={row.tradingDate}>
                        <Td>{row.tradingDate}</Td>
                        <Td>{int(row.badTickers)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Scroller>
            )}
          </div>
        </div>
      </Card>

      <Card
        title="Contoh observasi intraday terbaru"
        subtitle="Sampel H30 dari data riset tersimpan untuk pemeriksaan admin. Ini bukan rekomendasi, daftar beli, atau sinyal yang ditayangkan ke pengguna."
      >
        {dashboard.recentSamples.length === 0 ? (
          <p className="text-sm text-tv-muted">Belum ada outcome H30 yang terisi untuk versi model dan konfigurasi aktif.</p>
        ) : (
          <Scroller>
            <table className="w-full text-xs">
              <thead className="text-tv-muted">
                <tr>
                  <Th>Waktu sinyal</Th>
                  <Th>Emiten</Th>
                  <Th>Skor</Th>
                  <Th>Entry</Th>
                  <Th>Harga exit</Th>
                  <Th>Net return</Th>
                  <Th>Alasan exit</Th>
                  <Th>Layak dieksekusi</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tv-border">
                {dashboard.recentSamples.map((sample) => (
                  <tr key={`${sample.ticker}-${sample.signalTimestamp}-${sample.horizon}`}>
                    <Td>{wib(sample.signalTimestamp)}</Td>
                    <Td><span className="font-semibold text-tv-text">{sample.ticker.replace('.JK', '')}</span></Td>
                    <Td>{num(sample.score, 2)}</Td>
                    <Td>{int(sample.entryPriceRaw)}</Td>
                    <Td>{int(sample.exitPriceRaw)}</Td>
                    <Td><span className={sample.netReturn != null && sample.netReturn > 0 ? 'text-tv-green' : sample.netReturn != null && sample.netReturn < 0 ? 'text-tv-red' : 'text-tv-muted'}>{pct(sample.netReturn, 3)}</span></Td>
                    <Td>{sample.exitReason}</Td>
                    <Td>{sample.tradable === true ? <span className="text-tv-green">ya</span> : sample.tradable === false ? <span className="text-tv-yellow">tidak</span> : NA}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Scroller>
        )}
      </Card>

      {!result ? (
        <Card title="Hasil Validasi" subtitle="Belum ada validation run yang selesai.">
          <p className="text-sm text-tv-muted">
            Jalankan &quot;Kumpulkan data intraday&quot; lalu &quot;Jalankan validation run&quot;. Sampai itu terjadi, tidak ada
            angka performa yang ditampilkan - halaman ini tidak mengisi kekosongan dengan data contoh.
          </p>
        </Card>
      ) : (
        <>
          {/* 3. PERFORMANCE PER HORIZON */}
          <Card
            title="Performa per Horizon"
            subtitle="Setiap horizon punya statistik sendiri. Angka utama adalah NET return setelah fee beli, fee jual, dan slippage dua sisi."
          >
            <Scroller>
              <table className="w-full text-xs">
                <thead className="text-tv-muted">
                  <tr>
                    <Th>Horizon</Th>
                    <Th>N raw</Th>
                    <Th>N efektif</Th>
                    <Th>Win rate</Th>
                    <Th>Avg net</Th>
                    <Th>Median net</Th>
                    <Th>Expectancy</Th>
                    <Th>Avg win</Th>
                    <Th>Avg loss</Th>
                    <Th>Payoff</Th>
                    <Th>Profit factor</Th>
                    <Th>Max DD ekuitas harian</Th>
                    <Th>Max DD rentetan</Th>
                    <Th>MFE</Th>
                    <Th>MAE</Th>
                    <Th>No fill</Th>
                    <Th>Kena SL</Th>
                    <Th>Kena TP</Th>
                    <Th>CI 95%</Th>
                    <Th>p-value</Th>
                    <Th>q-value (Holm)</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-tv-border">
                  {horizons.map((h: any) => {
                    const corrected = result.multipleTesting?.find((t: any) => t.label?.startsWith(h.horizon));
                    return (
                      <tr key={h.horizon} className="align-top">
                        <Td>
                          <span className="font-semibold text-tv-text">{h.label}</span>
                          <SampleTag status={h.status} />
                        </Td>
                        <Td>{int(h.samplesRaw)}</Td>
                        <Td>{int(h.samplesEffective)}</Td>
                        <Td>{pct(h.performance?.winRate)}</Td>
                        <Td>{pct(h.performance?.avgNetReturn, 3)}</Td>
                        <Td>{pct(h.performance?.medianNetReturn, 3)}</Td>
                        <Td>{bps(h.performance?.avgNetReturn)}</Td>
                        <Td>{pct(h.performance?.avgWin, 3)}</Td>
                        <Td>{pct(h.performance?.avgLoss, 3)}</Td>
                        <Td>{num(h.performance?.payoffRatio)}</Td>
                        <Td>{num(h.performance?.profitFactor)}</Td>
                        <Td>{pct(h.performance?.maxDrawdownDailyEquity, 2)}</Td>
                        <Td>{pct(h.performance?.maxDrawdown, 2)}</Td>
                        <Td>{pct(h.avgMfe, 3)}</Td>
                        <Td>{pct(h.avgMae, 3)}</Td>
                        <Td>{pct(h.noFillPct)}</Td>
                        <Td>{pct(h.stopLossPct)}</Td>
                        <Td>{pct(h.takeProfitPct)}</Td>
                        <Td>
                          {h.bootstrap?.ci95Low == null ? NA : `${(h.bootstrap.ci95Low * 100).toFixed(3)}% .. ${(h.bootstrap.ci95High * 100).toFixed(3)}%`}
                        </Td>
                        <Td>{num(h.permutation?.pValueOneTailed, 4)}</Td>
                        <Td>
                          {corrected?.holm == null ? NA : (
                            <span className={corrected.significantAfterCorrection ? 'text-tv-green' : 'text-tv-text'}>
                              {corrected.holm.toFixed(4)}
                            </span>
                          )}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Scroller>

            <p className="mt-3 text-[11px] text-tv-muted">
              <strong className="text-tv-text">Max DD ekuitas harian</strong>: satu unit modal dibagi rata ke seluruh
              sinyal pada hari yang sama, flat semalam, dimajemukkan antar hari - ini angka drawdown yang bisa dibaca
              sebagai portofolio. <strong className="text-tv-text">Max DD rentetan</strong> adalah jumlah kumulatif
              aditif atas sinyal yang tumpang tindih; ia mengukur rentetan kerugian, BUKAN kinerja akun.
            </p>

            <div className="mt-4 space-y-3">
              {horizons.map((h: any) =>
                h.warnings?.length ? (
                  <div key={h.horizon}>
                    <p className="text-xs font-semibold text-tv-muted mb-1">{h.label}</p>
                    <Warnings items={h.warnings} />
                  </div>
                ) : null
              )}
            </div>
          </Card>

          {/* 4. BUCKET */}
          <Card
            title="Performa per Bucket Skor"
            subtitle="Bucket dengan sampel kecil tetap ditampilkan dan dilabeli, tidak disembunyikan."
          >
            <HorizonTabs horizon={horizon} setHorizon={setHorizon} available={Object.keys(result.buckets ?? {})} />
            <Scroller>
              <table className="w-full text-xs">
                <thead className="text-tv-muted">
                  <tr>
                    <Th>Bucket</Th>
                    <Th>N raw</Th>
                    <Th>N efektif</Th>
                    <Th>Win rate</Th>
                    <Th>Avg net</Th>
                    <Th>Median net</Th>
                    <Th>Profit factor</Th>
                    <Th>CI 95%</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-tv-border">
                  {(result.buckets?.[horizon] ?? []).map((b: any) => (
                    <tr key={b.bucket}>
                      <Td>
                        {b.bucket}
                        <SampleTag status={b.status} />
                      </Td>
                      <Td>{int(b.samplesRaw)}</Td>
                      <Td>{int(b.samplesEffective)}</Td>
                      <Td>{pct(b.winRate)}</Td>
                      <Td>{pct(b.avgNetReturn, 3)}</Td>
                      <Td>{pct(b.medianNetReturn, 3)}</Td>
                      <Td>{num(b.profitFactor)}</Td>
                      <Td>{b.ci95Low == null ? NA : `${(b.ci95Low * 100).toFixed(3)}% .. ${(b.ci95High * 100).toFixed(3)}%`}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Scroller>
            <p className="mt-3 text-xs text-tv-muted">
              Monotonicity {horizon}: rho ={' '}
              <span className="font-number text-tv-text">{num(result.monotonicity?.[horizon]?.rho, 3)}</span>{' '}
              ({result.monotonicity?.[horizon]?.monotonic ? 'skor tinggi cenderung lebih baik' : 'belum menunjukkan urutan yang konsisten'}),
              dihitung atas {int(result.monotonicity?.[horizon]?.bucketsCompared)} bucket.
            </p>
          </Card>

          {/* 5 & 6. TIME OF DAY + LIKUIDITAS */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 lg:gap-6">
            <Card title="Analisis Waktu Sinyal" subtitle="Grid sinyal mengikuti sesi bursa aktif. Pemilihan jam terbaik untuk produksi TIDAK boleh memakai tabel ini.">
              <SliceTable rows={result.timeOfDay?.[horizon] ?? []} keyLabel="Jam WIB" />
            </Card>
            <Card title="Analisis Likuiditas" subtitle="Dikelompokkan dari nilai transaksi sesi berjalan sampai signal_timestamp.">
              <SliceTable rows={result.liquidity?.[horizon] ?? []} keyLabel="Kelompok" />
            </Card>
          </div>

          {/* 7. KONSENTRASI */}
          <Card title="Konsentrasi Ticker dan Sektor" subtitle={`Horizon utama ${result.horizons?.[1]?.horizon ?? 'H30'}. Sektor dibaca dari arsip point-in-time fundamental_history (hanya dibaca).`}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ConcentrationTable title="Per ticker" data={result.concentration?.ticker} />
              <ConcentrationTable title="Per sektor" data={result.concentration?.sector} />
            </div>
          </Card>

          {/* 8. REGIME */}
          <Card title="Kondisi Pasar (Regime)" subtitle={result.regime?.definition}>
            {result.regime?.available ? (
              <SliceTable rows={result.regime.rows} keyLabel="Regime" />
            ) : (
              <p className="text-sm text-tv-muted">
                Regime tidak tersedia untuk jendela ini. Hasil TIDAK dipecah per regime, dan tidak ada klaim bahwa
                model stabil lintas kondisi pasar.
              </p>
            )}
          </Card>

          {/* 9. KALIBRASI */}
          <Card
            title="Kalibrasi Skor"
            subtitle="Menguji apakah skor LensIntraday boleh dibaca sebagai probabilitas. Isotonic di-fit HANYA di TRAIN dan diuji di TEST."
          >
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <Metric label="Sampel" value={int(result.calibration?.samples)} />
              <Metric label="Base rate" value={pct(result.calibration?.naive?.baseRate)} />
              <Metric label="ECE" value={num(result.calibration?.naive?.ece, 4)} />
              <Metric label="Brier" value={num(result.calibration?.naive?.brier, 4)} />
              <Metric label="Brier base rate" value={num(result.calibration?.naive?.brierBaseRate, 4)} />
              <Metric label="Brier skill score" value={num(result.calibration?.naive?.brierSkillScore, 4)} />
              <Metric label="Split TRAIN/TEST" value={result.calibration?.splitDate ?? NA} />
              <Metric
                label="Isotonic memperbaiki di TEST"
                value={result.calibration?.isotonicOnTest ? (result.calibration.isotonicImprovesOutOfSample ? 'ya' : 'tidak') : NA}
              />
            </div>
            {result.calibration?.bins?.length ? (
              <Scroller>
                <table className="w-full text-xs">
                  <thead className="text-tv-muted">
                    <tr>
                      <Th>Bin skor</Th>
                      <Th>N</Th>
                      <Th>Prediksi naif</Th>
                      <Th>Win rate teramati</Th>
                      <Th>Wilson 95%</Th>
                      <Th>Reliabel</Th>
                      <Th>Prediksi di dalam CI</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-tv-border">
                    {result.calibration.bins.map((bin: any) => (
                      <tr key={`${bin.binLow}-${bin.binHigh}`}>
                        <Td>{bin.binLow}-{bin.binHigh}</Td>
                        <Td>{int(bin.samples)}</Td>
                        <Td>{pct(bin.predicted)}</Td>
                        <Td>{pct(bin.observed)}</Td>
                        <Td>{pct(bin.wilsonLow)} .. {pct(bin.wilsonHigh)}</Td>
                        <Td>{bin.reliable ? 'ya' : 'tidak'}</Td>
                        <Td>{bin.predictionWithinCi ? 'ya' : 'TIDAK'}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Scroller>
            ) : null}
            <p
              className={`mt-4 rounded-md border p-3 text-xs ${
                result.calibration?.scoreReadableAsProbability
                  ? 'border-tv-border bg-tv-bg text-tv-text'
                  : 'border-tv-red/40 bg-tv-red/10 text-tv-red'
              }`}
            >
              {result.calibration?.conclusion}
            </p>
          </Card>

          {/* KELAYAKAN EKSEKUSI */}
          <Card
            title="Irisan yang Bisa Dieksekusi"
            subtitle="Grid sinyal sengaja tidak terseleksi supaya bucket skor rendah punya pembanding. Tabel ini membaca hasil yang SAMA pada irisan yang benar-benar bisa dibeli/dijual - menandai, bukan membuang."
          >
            <Scroller>
              <table className="w-full text-xs">
                <thead className="text-tv-muted">
                  <tr>
                    <Th>Horizon</Th>
                    <Th>Porsi lolos</Th>
                    <Th>N efektif</Th>
                    <Th>Win rate</Th>
                    <Th>Avg net</Th>
                    <Th>Median net</Th>
                    <Th>Profit factor</Th>
                    <Th>CI 95%</Th>
                    <Th>Avg net seluruh grid</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-tv-border">
                  {horizons.map((h: any) => (
                    <tr key={h.horizon}>
                      <Td>{h.label}</Td>
                      <Td>{pct(h.tradableShare)}</Td>
                      <Td>{int(h.tradablePerformance?.samplesEffective)}</Td>
                      <Td>{pct(h.tradablePerformance?.winRate)}</Td>
                      <Td>{pct(h.tradablePerformance?.avgNetReturn, 3)}</Td>
                      <Td>{pct(h.tradablePerformance?.medianNetReturn, 3)}</Td>
                      <Td>{num(h.tradablePerformance?.profitFactor)}</Td>
                      <Td>
                        {h.tradableBootstrap?.ci95Low == null
                          ? NA
                          : `${(h.tradableBootstrap.ci95Low * 100).toFixed(3)}% .. ${(h.tradableBootstrap.ci95High * 100).toFixed(3)}%`}
                      </Td>
                      <Td>{pct(h.performance?.avgNetReturn, 3)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Scroller>
            <p className="mt-3 text-[11px] text-tv-muted">
              Gerbang: harga entry di atas gocap, nilai transaksi sesi memadai, dan cukup sering bertransaksi sampai
              waktu sinyal. Baris lama yang diarsipkan sebelum kolom ini ada dihitung{' '}
              <strong className="text-tv-text">tidak layak</strong> — &quot;tidak tahu&quot; bukan &quot;ya&quot;.
            </p>
          </Card>

          {/* SEBARAN KOMPONEN */}
          <Card title="Sebaran Komponen Skor" subtitle={result.componentDiagnostics?.note}>
            {result.componentDiagnostics?.rows?.length ? (
              <Scroller>
                <table className="w-full text-xs">
                  <thead className="text-tv-muted">
                    <tr>
                      <Th>Komponen</Th>
                      <Th>N</Th>
                      <Th>Rata-rata</Th>
                      <Th>p05</Th>
                      <Th>p50</Th>
                      <Th>p95</Th>
                      <Th>Mentok di 0/100</Th>
                      <Th>Sehat</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-tv-border">
                    {result.componentDiagnostics.rows.map((row: any) => (
                      <tr key={row.component}>
                        <Td>{row.component}</Td>
                        <Td>{int(row.samples)}</Td>
                        <Td>{num(row.meanScore, 2)}</Td>
                        <Td>{num(row.p05, 2)}</Td>
                        <Td>{num(row.p50, 2)}</Td>
                        <Td>{num(row.p95, 2)}</Td>
                        <Td>{pct(row.saturatedShare)}</Td>
                        <Td>
                          <span className={row.healthy ? 'text-tv-text' : 'text-tv-yellow'}>
                            {row.healthy ? 'ya' : 'TIDAK'}
                          </span>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Scroller>
            ) : (
              <p className="text-sm text-tv-muted">Belum ada snapshot komponen untuk dianalisis.</p>
            )}
          </Card>

          {/* BIAYA */}
          <Card title="Sensitivitas Biaya dan Slippage" subtitle="Dihitung ulang dari harga bar mentah yang tersimpan - tidak perlu mengambil data provider lagi.">
            <div className="mb-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Metric
                label="Trade kena lantai (sisi mana pun)"
                value={pct(result.spreadFloor?.bindingShare)}
                hint="Slippage ditentukan fraksi harga IDX, bukan asumsi konfigurasi."
              />
              <Metric label="Lantai aktif saat entry" value={pct(result.spreadFloor?.entryBindingShare)} hint="Berdasarkan harga entry." />
              <Metric label="Lantai aktif saat exit" value={pct(result.spreadFloor?.exitBindingShare)} hint="Berdasarkan harga exit." />
              <Metric label="Median slippage entry" value={num(result.spreadFloor?.medianEntrySlippageBps ?? result.spreadFloor?.medianAppliedSlippageBps, 2)} hint="bps sisi beli" />
              <Metric label="Median slippage exit" value={num(result.spreadFloor?.medianExitSlippageBps, 2)} hint="bps sisi jual" />
              <Metric label="Maks slippage terpakai" value={num(result.spreadFloor?.maxAppliedSlippageBps, 2)} hint="bps pada satu sisi" />
            </div>
            <p className="mb-4 rounded-md border border-tv-border bg-tv-bg p-2.5 text-[11px] text-tv-muted">
              {result.spreadFloor?.note}
            </p>
            <Scroller>
              <table className="w-full text-xs">
                <thead className="text-tv-muted">
                  <tr>
                    <Th>Skenario</Th>
                    <Th>Versi biaya</Th>
                    <Th>Avg net</Th>
                    <Th>Median net</Th>
                    <Th>Win rate</Th>
                    <Th>Profit factor</Th>
                    <Th>Masih positif</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-tv-border">
                  {result.costSensitivity?.map((row: any) => (
                    <tr key={row.scenario}>
                      <Td>{row.label}</Td>
                      <Td>{row.costVersion}</Td>
                      <Td>{pct(row.avgNetReturn, 3)}</Td>
                      <Td>{pct(row.medianNetReturn, 3)}</Td>
                      <Td>{pct(row.winRate)}</Td>
                      <Td>{num(row.profitFactor)}</Td>
                      <Td>
                        <span className={row.stillPositive ? 'text-tv-text' : 'text-tv-red'}>
                          {row.stillPositive ? 'ya' : 'tidak'}
                        </span>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Scroller>
          </Card>

          {/* WALK FORWARD */}
          <Card title="Walk-Forward (purged + embargo)" subtitle={result.walkForward?.note}>
            {result.walkForward?.folds?.length ? (
              <>
                <Scroller>
                  <table className="w-full text-xs">
                    <thead className="text-tv-muted">
                      <tr>
                        <Th>Fold</Th>
                        <Th>Train</Th>
                        <Th>Test</Th>
                        <Th>N train</Th>
                        <Th>N test</Th>
                        <Th>Avg net test</Th>
                        <Th>Win rate test</Th>
                        <Th>Embargo</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-tv-border">
                      {result.walkForward.folds.map((f: any) => (
                        <tr key={f.fold}>
                          <Td>{f.fold}</Td>
                          <Td>{f.trainStart} - {f.trainEnd}</Td>
                          <Td>{f.testStart} - {f.testEnd}</Td>
                          <Td>{int(f.trainSamples)}</Td>
                          <Td>{int(f.testSamples)}</Td>
                          <Td>{pct(f.testAvgNetReturn, 3)}</Td>
                          <Td>{pct(f.testWinRate)}</Td>
                          <Td>{int(f.purgedDays)} hari</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Scroller>
                <p className="mt-3 text-xs text-tv-muted">
                  Fold positif: {result.walkForward.positiveFolds}/{result.walkForward.totalFolds}
                </p>
              </>
            ) : (
              <p className="text-sm text-tv-muted">{result.walkForward?.note ?? 'Belum cukup hari bursa untuk walk-forward.'}</p>
            )}
          </Card>

          {/* 10. THRESHOLD SIMULATOR */}
          <Card
            title="Threshold Simulator"
            subtitle="Hanya untuk riset. Slider ini TIDAK mengubah ambang produksi, dan proposal ambang otomatis dibekukan sampai OOS asli memenuhi syarat."
          >
            <div className="flex flex-wrap items-center gap-4 mb-4">
              <label className="flex items-center gap-3 text-xs text-tv-muted">
                <Sliders className="h-4 w-4" />
                Ambang skor
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  className="w-48 accent-tv-accent"
                />
                <span className="font-number text-tv-text w-10">{threshold}</span>
              </label>
              <ActionButton
                label="Simulasikan"
                busy={busy === 'threshold_simulation'}
                disabled={busy != null}
                onClick={() => void runAction('threshold_simulation', { horizon })}
              />
              <ActionButton
                label="Ajukan proposal ambang"
                busy={busy === 'threshold_proposal'}
                disabled={busy != null}
                onClick={() => void runAction('threshold_proposal', { threshold, horizon })}
              />
            </div>

            {thresholdSim ? (
              <>
                <Scroller>
                  <table className="w-full text-xs">
                    <thead className="text-tv-muted">
                      <tr>
                        <Th>Ambang</Th>
                        <Th>Jumlah sinyal</Th>
                        <Th>N efektif</Th>
                        <Th>Win rate</Th>
                        <Th>Avg net</Th>
                        <Th>Median net</Th>
                        <Th>Profit factor</Th>
                        <Th>Max DD</Th>
                        <Th>Konsentrasi top-5</Th>
                        <Th>p-value</Th>
                        <Th>q-value (Holm)</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-tv-border">
                      {thresholdSim.rows?.map((row: any) => (
                        <tr key={row.threshold}>
                          <Td>
                            {row.threshold}
                            <SampleTag status={row.status} />
                          </Td>
                          <Td>{int(row.signals)}</Td>
                          <Td>{int(row.samplesEffective)}</Td>
                          <Td>{pct(row.winRate)}</Td>
                          <Td>{pct(row.avgNetReturn, 3)}</Td>
                          <Td>{pct(row.medianNetReturn, 3)}</Td>
                          <Td>{num(row.profitFactor)}</Td>
                          <Td>{pct(row.maxDrawdown, 2)}</Td>
                          <Td>{num(row.top5TickerAbsShare)}</Td>
                          <Td>{num(row.pValue, 4)}</Td>
                          <Td>{num(row.correctedPValue, 4)}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Scroller>
                <p className="mt-3 rounded-md border border-tv-yellow/40 bg-tv-yellow/10 p-2.5 text-xs text-tv-yellow">
                  {thresholdSim.multipleTestingNote}
                </p>
              </>
            ) : (
              <p className="text-sm text-tv-muted">Tekan &quot;Simulasikan&quot; untuk melihat dampak ambang terhadap sampel dan statistik.</p>
            )}
          </Card>

          {/* 11. WEIGHT OPTIMIZER */}
          <Card
            title="Weight Optimizer LensIntraday"
            subtitle="TRAIN / VALIDATION / TEST berurutan waktu dengan embargo, regularisasi terhadap bobot berjalan, dan batas bobot. Hasilnya proposal untuk ditinjau, bukan perubahan otomatis."
          >
            <ActionButton
              label="Hitung proposal bobot"
              busy={busy === 'weight_proposal'}
              disabled={busy != null}
              onClick={() => void runAction('weight_proposal', { horizon })}
            />
            {weightProposal ? (
              <div className="mt-4">
                {weightProposal.status === 'INSUFFICIENT_DATA' ? (
                  <p className="rounded-md border border-tv-yellow/40 bg-tv-yellow/10 p-3 text-xs text-tv-yellow">
                    {weightProposal.reason}
                  </p>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                      <Metric label="Bobot berjalan" value={JSON.stringify(weightProposal.currentWeights)} />
                      <Metric
                        label="Bobot diusulkan"
                        value={weightProposal.proposedWeights ? JSON.stringify(weightProposal.proposedWeights) : <span className="text-tv-muted">tidak ada usulan</span>}
                      />
                    </div>
                    <Scroller>
                      <table className="w-full text-xs">
                        <thead className="text-tv-muted">
                          <tr>
                            <Th>Split</Th>
                            <Th>Periode</Th>
                            <Th>N</Th>
                            <Th>N efektif</Th>
                            <Th>IC</Th>
                            <Th>Kuintil atas</Th>
                            <Th>Kuintil bawah</Th>
                            <Th>Spread</Th>
                            <Th>p-value</Th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-tv-border">
                          {[weightProposal.train, weightProposal.validation, weightProposal.test]
                            .filter(Boolean)
                            .map((split: any) => (
                              <tr key={split.label}>
                                <Td>{split.label}</Td>
                                <Td>{split.fromDate} - {split.toDate}</Td>
                                <Td>{int(split.samplesRaw)}</Td>
                                <Td>{int(split.samplesEffective)}</Td>
                                <Td>{num(split.informationCoefficient, 4)}</Td>
                                <Td>{pct(split.avgNetReturnTopQuintile, 3)}</Td>
                                <Td>{pct(split.avgNetReturnBottomQuintile, 3)}</Td>
                                <Td>{pct(split.spread, 3)}</Td>
                                <Td>{num(split.pValue, 4)}</Td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </Scroller>
                    <p className="mt-3 text-xs text-tv-muted">{weightProposal.reason}</p>
                  </>
                )}
              </div>
            ) : null}
          </Card>

          {/* GERBANG PENERIMAAN */}
          <Card
            title="Acceptance Gate"
            subtitle={
              result.acceptance?.frozen
                ? 'Kriteria diambil dari protokol OOS yang sudah dibekukan - tidak boleh diubah setelah melihat hasil.'
                : 'Kriteria default. Bekukan protokol OOS untuk mengunci kriteria SEBELUM pengujian dimulai.'
            }
          >
            <Scroller>
              <table className="w-full text-xs">
                <thead className="text-tv-muted">
                  <tr>
                    <Th>Kriteria</Th>
                    <Th>Syarat</Th>
                    <Th>Teramati</Th>
                    <Th>Lolos</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-tv-border">
                  {result.acceptance?.items?.map((item: any) => (
                    <tr key={item.key}>
                      <Td>{item.label}</Td>
                      <Td>{item.required}</Td>
                      <Td>{item.observed}</Td>
                      <Td>
                        <span className={item.passed ? 'text-tv-green' : 'text-tv-red'}>{item.passed ? 'YA' : 'TIDAK'}</span>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Scroller>
            <p className="mt-3 text-xs text-tv-muted">
              Status akhir: <StatusBadge status={result.status} />. Status <code>CANDIDATE_VALIDATED</code> hanya muncul
              kalau SELURUH kriteria lolos DAN run dijalankan dalam mode OOS atas protokol yang sudah dibekukan.
            </p>
          </Card>
        </>
      )}

      {/* PROTOKOL OOS */}
      <Card title="Protokol Forward Out-of-Sample" subtitle="Sekali dibekukan, baris protokol tidak pernah di-UPDATE. Formula berubah = protokol dan model version baru.">
        {dashboard.oosProtocol ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <Metric label="Protocol version" value={dashboard.oosProtocol.protocolVersion} />
              <Metric label="Freeze timestamp" value={wib(dashboard.oosProtocol.freezeTimestamp)} />
              <Metric label="Model version" value={dashboard.oosProtocol.modelVersion} />
              <Metric label="Config hash" value={dashboard.oosProtocol.configHash} />
              <Metric label="Status" value={dashboard.oosProtocol.status} />
            </div>

            {/* Yang membatasi OOS di sini BUKAN pematangan label - horizon terpanjang
                LensIntraday tutup di hari yang sama. Yang dibutuhkan adalah waktu
                kalender, dan itu harus terlihat sebagai angka, bukan cuma kalimat. */}
            <div className="mt-4">
              <h3 className="text-xs font-semibold text-tv-muted uppercase mb-2">
                Progres pengumpulan OOS (hanya sinyal setelah freeze)
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <ProgressMetric
                  label="Hari bursa OOS"
                  current={dashboard.oosProgress.tradingDaysCollected}
                  required={dashboard.oosProgress.tradingDaysRequired}
                />
                <ProgressMetric
                  label="Emiten OOS"
                  current={dashboard.oosProgress.tickersCollected}
                  required={dashboard.oosProgress.tickersRequired}
                />
                <Metric label="Sinyal OOS terkumpul" value={int(dashboard.oosProgress.signalsCollected)} />
                <Metric
                  label="Sisa hari bursa"
                  value={
                    dashboard.oosProgress.tradingDaysRemaining == null
                      ? NA
                      : dashboard.oosProgress.tradingDaysRemaining === 0
                        ? 'terpenuhi'
                        : `${dashboard.oosProgress.tradingDaysRemaining} hari lagi`
                  }
                  hint="Hanya bisa bertambah dengan berjalannya waktu - backfill tidak mempercepatnya."
                />
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-tv-muted">
            Belum ada protokol yang dibekukan. Sebelum freeze, seluruh angka di halaman ini bersifat in-sample dan
            TIDAK boleh disebut hasil out-of-sample.
          </p>
        )}
      </Card>

      {/* HISTORI RUN */}
      <Card title="Histori Validation Run" subtitle="10 run terakhir.">
        {dashboard.recentRuns.length === 0 ? (
          <p className="text-sm text-tv-muted">Belum ada run.</p>
        ) : (
          <Scroller>
            <table className="w-full text-xs">
              <thead className="text-tv-muted">
                <tr>
                  <Th>Run</Th>
                  <Th>Status</Th>
                  <Th>Mulai</Th>
                  <Th>Selesai</Th>
                  <Th>N raw</Th>
                  <Th>N efektif</Th>
                  <Th>Dataset hash</Th>
                  <Th>Protokol</Th>
                  <Th>Dipicu</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tv-border">
                {dashboard.recentRuns.map((run) => (
                  <tr key={run.runId}>
                    <Td>#{run.runId}</Td>
                    <Td>
                      <StatusBadge status={run.status} />
                    </Td>
                    <Td>{wib(run.startedAt)}</Td>
                    <Td>{run.completedAt ? wib(run.completedAt) : NA}</Td>
                    <Td>{int(run.sampleRaw)}</Td>
                    <Td>{int(run.sampleEffective)}</Td>
                    <Td>{run.datasetHash ?? NA}</Td>
                    <Td>{run.protocolVersion ?? NA}</Td>
                    <Td>{run.triggeredBy ?? NA}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Scroller>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ActionButton({
  label,
  onClick,
  busy,
  disabled,
  icon,
}: {
  label: string;
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 rounded-md border border-tv-border bg-tv-bg px-3 py-2 text-xs font-semibold text-tv-text transition-colors hover:bg-tv-hover disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {label}
    </button>
  );
}

function HorizonTabs({ horizon, setHorizon, available }: { horizon: string; setHorizon: (h: string) => void; available: string[] }) {
  if (!available.length) return null;
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {available.map((h) => (
        <button
          key={h}
          onClick={() => setHorizon(h)}
          className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors ${
            horizon === h ? 'border-tv-accent bg-tv-accent/15 text-tv-accent' : 'border-tv-border bg-tv-bg text-tv-muted hover:text-tv-text'
          }`}
        >
          {h}
        </button>
      ))}
    </div>
  );
}

function SliceTable({ rows, keyLabel }: { rows: any[]; keyLabel: string }) {
  if (!rows?.length) return <p className="text-sm text-tv-muted">Belum ada data.</p>;
  return (
    <Scroller>
      <table className="w-full text-xs">
        <thead className="text-tv-muted">
          <tr>
            <Th>{keyLabel}</Th>
            <Th>N raw</Th>
            <Th>N efektif</Th>
            <Th>Win rate</Th>
            <Th>Avg net</Th>
            <Th>Median net</Th>
            <Th>Profit factor</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-tv-border">
          {rows.map((row) => (
            <tr key={row.key}>
              <Td>
                {row.label}
                <SampleTag status={row.status} />
              </Td>
              <Td>{int(row.samplesRaw)}</Td>
              <Td>{int(row.samplesEffective)}</Td>
              <Td>{pct(row.winRate)}</Td>
              <Td>{pct(row.avgNetReturn, 3)}</Td>
              <Td>{pct(row.medianNetReturn, 3)}</Td>
              <Td>{num(row.profitFactor)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </Scroller>
  );
}

function ConcentrationTable({ title, data }: { title: string; data: any }) {
  if (!data) return <p className="text-sm text-tv-muted">{title}: belum ada data.</p>;
  return (
    <div>
      <h3 className="text-xs font-semibold text-tv-muted uppercase mb-2">
        {title} - porsi |P&amp;L| 5 teratas: <span className="font-number text-tv-text">{num(data.top5AbsShare)}</span>
        {data.concentrated ? <span className="ml-2 text-tv-yellow">TERKONSENTRASI</span> : null}
      </h3>
      <Scroller>
        <table className="w-full text-xs">
          <thead className="text-tv-muted">
            <tr>
              <Th>Kunci</Th>
              <Th>N</Th>
              <Th>Total net</Th>
              <Th>Porsi profit</Th>
              <Th>Porsi loss</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-tv-border">
            {[...(data.topWinners ?? []), ...(data.topLosers ?? [])]
              .filter((row, i, arr) => arr.findIndex((x) => x.key === row.key) === i)
              .map((row: any) => (
                <tr key={row.key}>
                  <Td>{row.key}</Td>
                  <Td>{int(row.samples)}</Td>
                  <Td>{pct(row.totalNetReturn, 2)}</Td>
                  <Td>{num(row.shareOfGrossProfit)}</Td>
                  <Td>{num(row.shareOfGrossLoss)}</Td>
                </tr>
              ))}
          </tbody>
        </table>
      </Scroller>
    </div>
  );
}

function describeActionResult(action: ActionName, data: any): string {
  switch (action) {
    case 'collect_data':
      return `Pengumpulan selesai: ${data.tickersProcessed}/${data.tickersRequested} ticker, ${data.signalsWritten} sinyal, ${data.outcomesWritten} outcome, ${data.tickersFailed} gagal${data.budgetExhausted ? ' (batas waktu tercapai, jalankan lagi untuk melanjutkan)' : ''}.`;
    case 'reset_research':
      return `Data riset intraday dihapus: ${data.signalsDeleted ?? 0} sinyal, ${data.outcomesDeleted ?? 0} outcome, ${data.qualityRowsDeleted ?? 0} catatan kualitas, ${data.validationRunsDeleted ?? 0} validation run, dan seluruh protokol/proposal riset.`;
    case 'run_validation':
      return `Validation run selesai dengan status ${data.status}. Sampel efektif ${data.sample?.effective ?? 0}.`;
    case 'freeze_oos':
      return data.reason;
    case 'threshold_proposal':
      return `Proposal ambang #${data.proposalId} disimpan dengan status ${data.status}. ${data.reason}`;
    case 'weight_proposal':
      return data.reason;
    default:
      return 'Selesai.';
  }
}
