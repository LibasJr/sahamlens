'use client';

import { Card } from '@/components/ui';
import { num, pValue, pct } from './shared-ui';
import type { CalibrationDashboardData } from './types';

/** Robust Validation: bootstrap, permutation, Spearman IC, monthly IC/ICIR, monotonicity. */
export function RobustValidationSection({ data }: { data: CalibrationDashboardData }) {
  return (
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
  );
}

/** Forward/Out-of-Sample protocol + retrospective walk-forward. */
export function OosProtocolSection({ data }: { data: CalibrationDashboardData }) {
  return (
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
  );
}
