'use client';

import { Card, EmptyState } from '@/components/ui';
import { MIN_EFFECTIVE_SAMPLES_FOR_VALIDATION } from '@/modules/lens-radar/constants/research-status';
import { EMPTY, num, pct } from './shared-ui';
import type { CalibrationDashboardData } from './types';

/** Kartu headline (as-of, run stats, histori valid, observasi T+20) + identitas model. */
export function HeadlineCardsSection({ data }: { data: CalibrationDashboardData }) {
  return (
    <>
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
          <div className="text-xs text-tv-muted uppercase">Observasi T+20 mentah</div>
          <div className="font-number text-xl font-bold mt-1">{data.observationsT20.toLocaleString('id-ID')}</div>
          <div className="lens-meta text-tv-muted mt-0.5">
            Sampel efektif edge: {num(data.genuineOos.highBucketSamples)}/{MIN_EFFECTIVE_SAMPLES_FOR_VALIDATION} · {num(data.genuineOos.lowBucketSamples)}/{MIN_EFFECTIVE_SAMPLES_FOR_VALIDATION}
          </div>
          <div className="lens-meta text-tv-muted mt-0.5">
            Hari bursa sejak sinyal pertama: {data.t20MaturityProgress.tradingDaysElapsed}/{data.t20MaturityProgress.requiredTradingDays}
          </div>
        </Card>
      </div>

      <Card as="section" padding="none" radius="xl" elevation="none" overflow="visible" highlight={false} className="border-tv-border bg-tv-card/40 p-4 text-xs">
        <h2 className="font-bold uppercase tracking-wide text-tv-text">Identitas model riset yang diuji</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div><div className="text-tv-muted">Versi skor</div><div className="mt-1 font-number text-tv-text">{data.scoreVersion || data.requestedScoreVersion}</div></div>
          <div><div className="text-tv-muted">Hash konfigurasi</div><div className="mt-1 break-all font-mono lens-number text-tv-text">{data.scoreConfigHash}</div></div>
          <div><div className="text-tv-muted">Histori ditolak</div><div className="mt-1 font-number text-tv-text">{data.rejectedRows.toLocaleString('id-ID')} baris ({data.configRejectedRows.toLocaleString('id-ID')} beda konfigurasi)</div></div>
        </div>
        {data.versionRejectedReason && <p className="mt-3 leading-relaxed text-tv-yellow">{data.versionRejectedReason}</p>}
      </Card>
    </>
  );
}

/** Coverage Fundamental PIT (H-06). */
export function FundamentalCoverageSection({ data }: { data: CalibrationDashboardData }) {
  return (
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
              <div className="lens-meta text-tv-muted">{row.date}</div>
              <div className="mt-0.5 font-number text-sm font-semibold">{pct(row.coveragePct)}</div>
              <div className="lens-meta text-tv-muted">{num(row.rowsWithFundamental)}/{num(row.totalRows)}</div>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

/** Nol observasi bukan kegagalan - progres pengumpulan T+20. */
export function ObservationProgressSection({ data }: { data: CalibrationDashboardData }) {
  if (data.observationsT20 > 0) return null;
  return (
    <Card as="div" padding="none" radius="xl" elevation="none" overflow="hidden" highlight={false} className="border-tv-border">
      <EmptyState
        illustration="collecting"
        title="Observasi T+20 belum terkumpul"
        description="Setiap sinyal baru bisa dihitung setelah 20 hari bursa berlalu sejak tanggal skornya. Seluruh angka di bawah akan tetap kosong sampai itu terpenuhi - halaman ini sengaja tidak menampilkan angka pengganti."
        progress={{
          current: data.t20MaturityProgress.tradingDaysElapsed,
          total: data.t20MaturityProgress.requiredTradingDays,
          unit: 'hari bursa',
          label: 'Menuju kematangan T+20 pertama',
        }}
      />
      <p className="pb-5 text-center lens-caption text-tv-muted">
        Histori mentah tersedia: <span className="font-number text-tv-text">{num(data.sourceRows)}</span> baris
        dari <span className="font-number text-tv-text">{num(data.uniqueTickers)}</span> emiten.
      </p>
    </Card>
  );
}
