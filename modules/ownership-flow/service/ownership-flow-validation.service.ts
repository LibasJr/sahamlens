import { listOwnershipHistoryBySource } from '../repository/ownership-flow-history.repository';
import { diffCalendarDays } from './ownership-delta';

const SOURCE = 'KSEI_HOLDING_COMPOSITION';
const MIN_SNAPSHOTS_FOR_THRESHOLD_RESEARCH = 12;
const MAX_PUBLICATION_LAG_DAYS_FOR_PIT = 7;
const MIN_PIT_SNAPSHOTS_FOR_PREDICTIVE_STUDY = 12;

export interface OwnershipFlowValidationDashboard {
  researchOnly: true;
  source: string;
  snapshots: number;
  rows: number;
  comparableChanges: number;
  firstObservedDate: string | null;
  lastObservedDate: string | null;
  absoluteDeltaPercentilesPp: { p50: number | null; p75: number | null; p90: number | null; p95: number | null };
  positiveChanges: number;
  negativeChanges: number;
  unchangedChanges: number;
  structuralBreakChanges: number;
  thresholdResearchStatus: 'INSUFFICIENT_HISTORY' | 'DISTRIBUTION_READY_RESEARCH_ONLY';
  predictiveValidationStatus: 'NOT_PIT_ELIGIBLE' | 'PIT_ELIGIBLE_BUT_NOT_RUN';
  pitEligibleRows: number;
  pitEligibleSnapshots: number;
  backfilledRows: number;
  minPitSnapshotsForPredictiveStudy: number;
  maxPublicationLagDaysAllowed: number;
  guardrails: string[];
}

function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const v = sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  return Math.round(v * 10_000) / 10_000;
}

function fetchedDateKey(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export async function getOwnershipFlowValidationDashboard(): Promise<OwnershipFlowValidationDashboard> {
  const rows = await listOwnershipHistoryBySource(SOURCE);
  const dates = [...new Set(rows.map((r) => r.observedDate))].sort();
  const byTicker = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byTicker.get(row.ticker);
    if (list) list.push(row);
    else byTicker.set(row.ticker, [row]);
  }

  const deltas: number[] = [];
  let positive = 0;
  let negative = 0;
  let unchanged = 0;
  let structuralBreakChanges = 0;
  let pitEligibleRows = 0;
  let backfilledRows = 0;
  const pitEligibleDates = new Set<string>();

  for (const tickerRows of byTicker.values()) {
    for (let i = 0; i < tickerRows.length; i += 1) {
      const current = tickerRows[i];
      const fetched = fetchedDateKey(current.fetchedAt);
      if (fetched) {
        const lag = diffCalendarDays(current.observedDate, fetched);
        if (lag >= 0 && lag <= MAX_PUBLICATION_LAG_DAYS_FOR_PIT) {
          pitEligibleRows += 1;
          pitEligibleDates.add(current.observedDate);
        } else if (lag > MAX_PUBLICATION_LAG_DAYS_FOR_PIT) backfilledRows += 1;
      } else {
        backfilledRows += 1;
      }
      if (i === 0) continue;
      const previous = tickerRows[i - 1];
      if (current.foreignPct == null || previous.foreignPct == null) continue;
      if (
        current.totalSecurities != null && previous.totalSecurities != null &&
        Number.isFinite(current.totalSecurities) && Number.isFinite(previous.totalSecurities) &&
        current.totalSecurities > 0 && previous.totalSecurities > 0 &&
        current.totalSecurities !== previous.totalSecurities
      ) {
        structuralBreakChanges += 1;
        continue;
      }
      const delta = Math.round((current.foreignPct - previous.foreignPct) * 10_000) / 10_000;
      deltas.push(delta);
      if (delta > 0) positive += 1;
      else if (delta < 0) negative += 1;
      else unchanged += 1;
    }
  }

  const abs = deltas.map(Math.abs);
  const enoughSnapshots = dates.length >= MIN_SNAPSHOTS_FOR_THRESHOLD_RESEARCH;
  // Historical backfills may coexist forever. They must be EXCLUDED from predictive
  // studies, not force the entire dataset to remain unusable forever. Unlock only after
  // enough distinct future snapshots were actually captured near publication time.
  const pitEligible = pitEligibleDates.size >= MIN_PIT_SNAPSHOTS_FOR_PREDICTIVE_STUDY;

  return {
    researchOnly: true,
    source: SOURCE,
    snapshots: dates.length,
    rows: rows.length,
    comparableChanges: deltas.length,
    firstObservedDate: dates[0] ?? null,
    lastObservedDate: dates.at(-1) ?? null,
    absoluteDeltaPercentilesPp: {
      p50: percentile(abs, 0.5),
      p75: percentile(abs, 0.75),
      p90: percentile(abs, 0.9),
      p95: percentile(abs, 0.95),
    },
    positiveChanges: positive,
    negativeChanges: negative,
    unchangedChanges: unchanged,
    structuralBreakChanges,
    thresholdResearchStatus: enoughSnapshots ? 'DISTRIBUTION_READY_RESEARCH_ONLY' : 'INSUFFICIENT_HISTORY',
    predictiveValidationStatus: pitEligible ? 'PIT_ELIGIBLE_BUT_NOT_RUN' : 'NOT_PIT_ELIGIBLE',
    pitEligibleRows,
    pitEligibleSnapshots: pitEligibleDates.size,
    backfilledRows,
    minPitSnapshotsForPredictiveStudy: MIN_PIT_SNAPSHOTS_FOR_PREDICTIVE_STUDY,
    maxPublicationLagDaysAllowed: MAX_PUBLICATION_LAG_DAYS_FOR_PIT,
    guardrails: [
      `Minimum ${MIN_SNAPSHOTS_FOR_THRESHOLD_RESEARCH} snapshot berbeda sebelum persentil boleh dipertimbangkan sebagai kandidat ambang.`,
      'Persentil perubahan hanya DESKRIPTIF; tidak otomatis mengaktifkan FOREIGN_ACCUMULATION/DISTRIBUTION.',
      'Perubahan antar-snapshot dengan total_securities berbeda dikeluarkan dari distribusi delta sebagai structural break/corporate-action guard.',
      'Backfill arsip yang diunduh jauh setelah observed_date tidak boleh dipakai seolah sinyal telah tersedia pada tanggal historis tersebut (look-ahead).',
      `Validasi prediktif baru boleh dimulai setelah minimal ${MIN_PIT_SNAPSHOTS_FOR_PREDICTIVE_STUDY} snapshot PIT berbeda; row backfill lama wajib dikeluarkan dari sample prediktif, bukan dicampur.`,
      'Return forward untuk snapshot PIT harus dihitung dari waktu informasi benar-benar tersedia (fetched/published), bukan dari observed_date yang lebih awal.',
    ],
  };
}
