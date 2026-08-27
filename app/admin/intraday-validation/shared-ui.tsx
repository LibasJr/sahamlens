'use client';

import React from 'react';
import { Card as UiCard } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { AlertTriangle, Loader2 } from 'lucide-react';
import type { Nullable, RecentSample, SampleSort, SampleSortKey } from './types';

// ---------------------------------------------------------------------------
// Formatter dan komponen kecil bersama, dipakai di seluruh section Intraday
// Validation Lab. null TIDAK PERNAH menjadi 0 di sini.
// ---------------------------------------------------------------------------

export const NA = <span className="text-tv-muted">n/a</span>;

export function pct(value: Nullable<number>, digits = 2): React.ReactNode {
  if (value == null || !Number.isFinite(value)) return NA;
  return `${(value * 100).toFixed(digits)}%`;
}

export function bps(value: Nullable<number>): React.ReactNode {
  if (value == null || !Number.isFinite(value)) return NA;
  return `${(value * 10_000).toFixed(1)} bps`;
}

export function num(value: Nullable<number>, digits = 3): React.ReactNode {
  if (value == null || !Number.isFinite(value)) return NA;
  return value.toFixed(digits);
}

export function int(value: Nullable<number>): React.ReactNode {
  if (value == null || !Number.isFinite(value)) return NA;
  return value.toLocaleString('id-ID');
}

export function wib(iso: Nullable<string>): string {
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

export function StatusBadge({ status }: { status: string }) {
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

export function ValidationCard({ title, subtitle, children, action }: { title: string; subtitle?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <UiCard as="section" className="border-tv-border mb-6" padding="none" radius="lg" surface="solid" elevation="none" overflow="hidden" highlight={false}>
      <div className="px-4 sm:px-6 py-4 border-b border-tv-border flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg font-bold text-tv-text">{title}</h2>
          {subtitle ? <p className="text-xs text-tv-muted mt-1 max-w-3xl">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      <div className="p-4 sm:p-6">{children}</div>
    </UiCard>
  );
}

export function Metric({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border border-tv-border bg-tv-bg p-3">
      <div className="text-[11px] uppercase tracking-wide text-tv-muted">{label}</div>
      <div className="mt-1 font-number text-sm font-semibold text-tv-text break-words">{value}</div>
      {hint ? <div className="mt-1 text-[11px] text-tv-muted">{hint}</div> : null}
    </div>
  );
}

/** Bar progres netral - tidak berwarna hijau sampai syaratnya benar-benar terpenuhi. */
export function ProgressMetric({ label, current, required }: { label: string; current: number; required: number }) {
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

export function Warnings({ items }: { items: string[] }) {
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

export function Scroller({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">{children}</div>;
}

export function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-left whitespace-nowrap font-semibold">{children}</th>;
}

export function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2 whitespace-nowrap font-number">{children}</td>;
}

export function SampleTag({ status }: { status: string }) {
  if (status !== 'INSUFFICIENT_SAMPLE') return null;
  return <span className="ml-2 rounded bg-tv-yellow/15 px-1.5 py-0.5 text-[10px] font-bold text-tv-yellow">INSUFFICIENT_SAMPLE</span>;
}

export function SortableSampleTh({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: SampleSortKey;
  sort: SampleSort;
  onSort: (key: SampleSortKey) => void;
}) {
  const active = sort.key === sortKey;
  const direction = active ? sort.direction : undefined;
  return (
    <th className="px-3 py-2 text-left whitespace-nowrap font-semibold" aria-sort={direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none'}>
      <Button variant="bare" size="none"
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 rounded text-left hover:text-tv-text focus:outline-none focus-visible:ring-2 focus-visible:ring-tv-blue/60"
        title={`Urutkan berdasarkan ${label}`}
      >
        {label}
        <span aria-hidden="true" className={active ? 'text-tv-blue' : 'text-tv-muted/60'}>{direction === 'asc' ? '↑' : direction === 'desc' ? '↓' : '↕'}</span>
        <span className="sr-only">{active ? `, urutan ${direction === 'asc' ? 'menaik' : 'menurun'}` : ', klik untuk mengurutkan'}</span>
      </Button>
    </th>
  );
}

export function sampleSortValue(sample: RecentSample, key: SampleSortKey): string | number {
  switch (key) {
    case 'signalTimestamp': {
      const timestamp = Date.parse(sample.signalTimestamp);
      return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
    }
    case 'ticker': return sample.ticker;
    case 'score': return sample.score;
    case 'entryPriceRaw': return sample.entryPriceRaw ?? Number.NEGATIVE_INFINITY;
    case 'exitPriceRaw': return sample.exitPriceRaw ?? Number.NEGATIVE_INFINITY;
    case 'netReturn': return sample.netReturn ?? Number.NEGATIVE_INFINITY;
    case 'exitReason': return sample.exitReason;
    case 'tradable': return sample.tradable === true ? 1 : sample.tradable === false ? 0 : -1;
  }
}

export function ActionButton({
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
    <Button variant="bare" size="none"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 rounded-md border border-tv-border bg-tv-bg px-3 py-2 text-xs font-semibold text-tv-text transition-colors hover:bg-tv-hover disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {label}
    </Button>
  );
}

export function HorizonTabs({ horizon, setHorizon, available }: { horizon: string; setHorizon: (h: string) => void; available: string[] }) {
  if (!available.length) return null;
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {available.map((h) => (
        <Button variant="bare" size="none"
          key={h}
          onClick={() => setHorizon(h)}
          className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors ${
            horizon === h ? 'border-tv-accent bg-tv-accent/15 text-tv-accent' : 'border-tv-border bg-tv-bg text-tv-muted hover:text-tv-text'
          }`}
        >
          {h}
        </Button>
      ))}
    </div>
  );
}

export function SliceTable({ rows, keyLabel }: { rows: any[]; keyLabel: string }) {
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

export function ConcentrationTable({ title, data }: { title: string; data: any }) {
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

export function describeActionResult(action: import('./types').ActionName, data: any): string {
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
