'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw, Shield, Target } from 'lucide-react';

type MarketRegime = 'BULL' | 'SIDEWAYS' | 'BEAR' | 'UNKNOWN';

interface Metrics {
  samples: number;
  avgReturnPct: number | null;
  medianReturnPct: number | null;
  winRatePct: number | null;
  tp1HitRatePct: number | null;
  tp2ReachRatePct: number | null;
  slHitRatePct: number | null;
  expectancyPct: number | null;
  profitFactor: number | null;
  avgMaePct: number | null;
  p95MaePct: number | null;
  avgMfePct: number | null;
  avgDaysHeld: number | null;
  medianDaysToTp1: number | null;
  sufficient: boolean;
}
interface ParameterSet {
  id: string; label: string; baseline: boolean;
  supportBufferAtr: number; minStopDistanceAtr: number; fallbackStopAtr: number;
  minLongRr: number; tp1R: number; tp2R: number;
}
interface Candidate {
  parameters: ParameterSet;
  overall: Metrics; train: Metrics; validation: Metrics; holdout: Metrics;
  byRegime: Array<{ regime: MarketRegime; metrics: Metrics }>;
  note: string;
}
interface Dashboard {
  protocolVersion: 'tpcl-lab-v1.0';
  researchOnly: true;
  genuineOos: false;
  scoreVersion: string;
  priceBasis: 'RAW';
  scoreThreshold: number;
  roundTripCostPct: number;
  atrPeriod: number;
  structureLookback: number;
  holdingDays: number;
  rawSignalRows: number;
  usableSignalsBaseline: number;
  firstSignalDate: string | null;
  lastSignalDate: string | null;
  splitDates: { trainEnd: string | null; validationEnd: string | null };
  baseline: Candidate;
  candidates: Candidate[];
  guardrails: string[];
}

function pct(v: number | null, digits = 2) {
  return v == null || !Number.isFinite(v) ? '—' : `${v.toFixed(digits)}%`;
}
function n(v: number | null, digits = 2) {
  return v == null || !Number.isFinite(v) ? '—' : v.toFixed(digits);
}
function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-tv-border bg-tv-bg/60 p-4">
      <div className="text-[11px] uppercase tracking-wide text-tv-muted">{label}</div>
      <div className="mt-1 font-number text-xl font-bold text-tv-text">{value}</div>
      {sub && <div className="mt-1 text-[10px] text-tv-muted">{sub}</div>}
    </div>
  );
}
function MetricsGrid({ metrics }: { metrics: Metrics }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <MetricCard label="Samples" value={metrics.samples.toLocaleString('id-ID')} sub={metrics.sufficient ? 'sample gate terpenuhi' : 'sample masih tipis'} />
      <MetricCard label="Expectancy" value={pct(metrics.expectancyPct)} />
      <MetricCard label="Profit Factor" value={n(metrics.profitFactor, 3)} />
      <MetricCard label="TP1 hit" value={pct(metrics.tp1HitRatePct)} />
      <MetricCard label="SL hit" value={pct(metrics.slHitRatePct)} />
      <MetricCard label="TP2 reached" value={pct(metrics.tp2ReachRatePct)} sub="MFE reach, bukan exit rule" />
      <MetricCard label="Avg MAE" value={pct(metrics.avgMaePct)} />
      <MetricCard label="MAE P95 (worst tail)" value={pct(metrics.p95MaePct)} />
      <MetricCard label="Avg MFE" value={pct(metrics.avgMfePct)} />
      <MetricCard label="Median return" value={pct(metrics.medianReturnPct)} />
      <MetricCard label="Avg days held" value={n(metrics.avgDaysHeld, 1)} />
      <MetricCard label="Median days to TP1" value={n(metrics.medianDaysToTp1, 1)} />
    </div>
  );
}

export default function TpclValidationClient() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/admin/tpcl-validation');
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Gagal memuat TP/CL Validation Lab');
      setData(json);
    } catch (e: any) {
      setError(e?.message || 'Gagal memuat TP/CL Validation Lab');
      setData(null);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  if (loading) return (
    <div className="rounded-xl border border-tv-border bg-tv-card p-6 text-sm text-tv-muted">
      Menghitung setup historis dan mengambil OHLC... proses pertama bisa agak lama.
    </div>
  );
  if (error || !data) return (
    <div className="rounded-xl border border-tv-red/30 bg-tv-red/10 p-5">
      <div className="font-bold text-tv-red">Validation gagal dimuat</div>
      <div className="text-sm text-tv-muted mt-1">{error}</div>
      <button onClick={load} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-tv-border px-3 py-2 text-sm">
        <RefreshCw className="w-4 h-4" /> Coba lagi
      </button>
    </div>
  );

  const b = data.baseline;
  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-tv-yellow/30 bg-tv-yellow/10 p-4">
        <div className="flex items-center gap-2 font-bold text-tv-yellow">
          <Shield className="w-5 h-5" /> RESEARCH ONLY · Bukan genuine OOS
        </div>
        <p className="mt-2 text-xs text-tv-muted">
          Split 60/20/20 hanya diagnostic temporal retrospektif. Parameter baseline sudah pernah dikembangkan
          dengan akses histori, jadi HOLDOUT di halaman ini tidak boleh disebut genuine out-of-sample.
        </p>
      </section>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Protocol" value={data.protocolVersion} />
        <MetricCard label="Score version" value={data.scoreVersion} />
        <MetricCard label="Raw signals ≥80" value={data.rawSignalRows.toLocaleString('id-ID')} />
        <MetricCard label="Usable baseline" value={data.usableSignalsBaseline.toLocaleString('id-ID')} />
        <MetricCard label="Price basis" value={data.priceBasis} sub="executable trading price" />
        <MetricCard label="ATR / lookback" value={`${data.atrPeriod} / ${data.structureLookback}`} />
        <MetricCard label="Holding horizon" value={`T+${data.holdingDays}`} />
        <MetricCard label="Round-trip cost" value={pct(data.roundTripCostPct)} />
      </div>

      <section className="rounded-xl border border-tv-border bg-tv-card p-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="font-heading text-lg font-bold flex items-center gap-2">
              <Target className="w-5 h-5 text-tv-green" /> Production Baseline
            </h2>
            <p className="text-xs text-tv-muted mt-1">
              buffer {b.parameters.supportBufferAtr} ATR · min stop {b.parameters.minStopDistanceAtr} ATR ·
              fallback {b.parameters.fallbackStopAtr} ATR · min RR {b.parameters.minLongRr} ·
              TP1 {b.parameters.tp1R}R · TP2 {b.parameters.tp2R}R
            </p>
          </div>
          <span className="rounded-full border border-tv-green/30 bg-tv-green/10 px-3 py-1 text-[10px] font-semibold text-tv-green">
            SINGLE SOURCE OF TRUTH
          </span>
        </div>
        <MetricsGrid metrics={b.overall} />
      </section>

      <section className="rounded-xl border border-tv-border bg-tv-card p-5">
        <h2 className="font-heading text-lg font-bold mb-1">Temporal Split Diagnostic</h2>
        <p className="text-xs text-tv-muted mb-4">
          Train sampai {data.splitDates.trainEnd ?? '—'} · Validation sampai {data.splitDates.validationEnd ?? '—'} · sisanya Holdout.
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {[
            ['TRAIN', b.train], ['VALIDATION', b.validation], ['HOLDOUT', b.holdout],
          ].map(([label, m]) => {
            const mm = m as Metrics;
            return (
              <div key={label as string} className="rounded-xl border border-tv-border bg-tv-bg/50 p-4">
                <div className="font-bold text-sm">{label as string}</div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-tv-muted">N</span><div className="font-number">{mm.samples}</div></div>
                  <div><span className="text-tv-muted">Expectancy</span><div className="font-number">{pct(mm.expectancyPct)}</div></div>
                  <div><span className="text-tv-muted">PF</span><div className="font-number">{n(mm.profitFactor, 3)}</div></div>
                  <div><span className="text-tv-muted">TP1 hit</span><div className="font-number">{pct(mm.tp1HitRatePct)}</div></div>
                  <div><span className="text-tv-muted">SL hit</span><div className="font-number">{pct(mm.slHitRatePct)}</div></div>
                  <div><span className="text-tv-muted">MAE P95 worst</span><div className="font-number">{pct(mm.p95MaePct)}</div></div>
                </div>
                {!mm.sufficient && <div className="mt-3 text-[10px] text-tv-yellow">Sampel belum cukup untuk kesimpulan kuat.</div>}
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border border-tv-border bg-tv-card p-5 overflow-x-auto">
        <h2 className="font-heading text-lg font-bold mb-1">Parameter Sensitivity</h2>
        <p className="text-xs text-tv-muted mb-4">
          Candidate hanya untuk menguji apakah edge terlalu sensitif terhadap parameter. Tidak ada ranking otomatis dan tidak ada tombol apply.
        </p>
        <table className="w-full min-w-[920px] text-xs">
          <thead className="text-tv-muted">
            <tr className="border-b border-tv-border">
              <th className="text-left py-2">Set</th><th className="text-right">N</th>
              <th className="text-right">Expectancy</th><th className="text-right">PF</th>
              <th className="text-right">TP1</th><th className="text-right">SL</th>
              <th className="text-right">MAE P95 worst</th><th className="text-right">Val Exp.</th>
              <th className="text-right">Holdout Exp.</th>
            </tr>
          </thead>
          <tbody>
            {data.candidates.map((row) => (
              <tr key={row.parameters.id} className="border-b border-tv-border/70">
                <td className="py-3">
                  <div className="font-semibold text-tv-text">{row.parameters.label}</div>
                  <div className="text-[10px] text-tv-muted">
                    {row.parameters.supportBufferAtr}/{row.parameters.minStopDistanceAtr}/{row.parameters.fallbackStopAtr} ATR ·
                    RR {row.parameters.minLongRr} · {row.parameters.tp1R}R/{row.parameters.tp2R}R
                  </div>
                </td>
                <td className="text-right font-number">{row.overall.samples}</td>
                <td className="text-right font-number">{pct(row.overall.expectancyPct)}</td>
                <td className="text-right font-number">{n(row.overall.profitFactor, 3)}</td>
                <td className="text-right font-number">{pct(row.overall.tp1HitRatePct)}</td>
                <td className="text-right font-number">{pct(row.overall.slHitRatePct)}</td>
                <td className="text-right font-number">{pct(row.overall.p95MaePct)}</td>
                <td className="text-right font-number">{pct(row.validation.expectancyPct)}</td>
                <td className="text-right font-number">{pct(row.holdout.expectancyPct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-xl border border-tv-border bg-tv-card p-5">
        <h2 className="font-heading text-lg font-bold mb-4">Baseline by IHSG Regime</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {b.byRegime.map((row) => (
            <div key={row.regime} className="rounded-xl border border-tv-border bg-tv-bg/50 p-4">
              <div className="font-bold">{row.regime}</div>
              <div className="mt-3 text-xs space-y-1">
                <div className="flex justify-between"><span className="text-tv-muted">N</span><span className="font-number">{row.metrics.samples}</span></div>
                <div className="flex justify-between"><span className="text-tv-muted">Expectancy</span><span className="font-number">{pct(row.metrics.expectancyPct)}</span></div>
                <div className="flex justify-between"><span className="text-tv-muted">PF</span><span className="font-number">{n(row.metrics.profitFactor, 3)}</span></div>
                <div className="flex justify-between"><span className="text-tv-muted">TP1</span><span className="font-number">{pct(row.metrics.tp1HitRatePct)}</span></div>
                <div className="flex justify-between"><span className="text-tv-muted">SL</span><span className="font-number">{pct(row.metrics.slHitRatePct)}</span></div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-tv-border bg-tv-card p-5">
        <h2 className="font-heading text-lg font-bold flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-tv-yellow" /> Guardrails
        </h2>
        <div className="mt-3 space-y-2">
          {data.guardrails.map((text) => (
            <div key={text} className="flex items-start gap-2 text-xs text-tv-muted">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-tv-green" /><span>{text}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
