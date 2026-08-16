import { getLastRun } from '../../../shared/scheduler/job-run-log.repository';
import { getOwnershipFlowConfig } from '../config/ownership-flow.config';
import {
  getLatestObservationsFor,
  getOwnershipHistoryStats,
  type OwnershipHistoryStats,
} from '../repository/ownership-flow-history.repository';
import { assessFreshness } from '../scoring/ownership-flow-classification';
import {
  canIngest,
  getPrimarySource,
  getSourceById,
  KSEI_HOLDING_COMPOSITION_ARCHIVE,
} from '../source/source-registry';
import type { FreshnessStatus, SourceAuditStatus } from '../types/ownership-flow.types';
import { getOwnershipUniverse } from './ownership-flow-ingest.service';

// STATUS INGESTION UNTUK PANEL ADMIN.
//
// Prinsip yang dipegang di sini: KEGAGALAN SEBAGIAN TIDAK BOLEH DISEMBUNYIKAN
// (§17). Panel yang cuma menampilkan "sinkron terakhir: sukses" sementara 40
// ticker diam-diam tidak pernah masuk adalah panel yang menipu operatornya
// sendiri. Karena itu `missing` dihitung eksplisit dari selisih universe dengan
// ticker yang benar-benar punya observasi pada tanggal terbaru.

export const OWNERSHIP_FLOW_JOB_NAME = 'ownership-flow-scan';

export interface OwnershipFlowMonitor {
  /** Modul aktif (UI/API terlihat). */
  enabled: boolean;
  cronEnabled: boolean;
  ingestionEnabled: boolean;
  /** Hasil gerbang gabungan - inilah yang benar-benar menentukan boleh menulis. */
  gate: { allowed: boolean; reason: string; message: string };
  source: {
    id: string;
    name: string;
    baseUrl: string;
    auditStatus: SourceAuditStatus;
    cadence: string;
    auditNote: string;
  };
  lastRun: {
    status: string | null;
    startedAt: string | null;
    finishedAt: string | null;
    durationMs: number | null;
    errorMessage: string | null;
    meta: Record<string, unknown> | null;
  };
  history: OwnershipHistoryStats;
  universe: {
    size: number;
    /** Punya observasi pada latestObservedDate. */
    covered: number;
    /** Tidak punya observasi pada latestObservedDate - angka yang wajib terlihat. */
    missing: number;
  };
  freshness: FreshnessStatus;
  ageDays: number | null;
  historical: {
    ready: boolean;
    sourceId: string;
    auditStatus: SourceAuditStatus;
    cadence: string;
    snapshots: number;
    totalRows: number;
    latestObservedDate: string | null;
    latestTickers: number;
  };
}

/**
 * Rangkum kesehatan ingestion.
 *
 * Dipanggil HANYA dari halaman/route admin - ia menyentuh beberapa query
 * agregat yang tidak pantas dijalankan pada tiap request pengguna biasa.
 */
export async function getOwnershipFlowMonitor(): Promise<OwnershipFlowMonitor> {
  const config = getOwnershipFlowConfig();
  const source = getPrimarySource();
  const gate = canIngest(source, config);

  const [stats, archiveStats, lastRun] = await Promise.all([
    getOwnershipHistoryStats(),
    getOwnershipHistoryStats(KSEI_HOLDING_COMPOSITION_ARCHIVE.id),
    getLastRun(OWNERSHIP_FLOW_JOB_NAME),
  ]);

  const universe = getOwnershipUniverse(config.universeLimit);
  const universeSize = universe.length;
  const latestByUniverse = await getLatestObservationsFor(universe);
  const covered = stats.latestObservedDate
    ? Array.from(latestByUniverse.values()).filter((row) => row.observedDate === stats.latestObservedDate).length
    : 0;
  const latestSource = (stats.latestSource ? getSourceById(stats.latestSource) : null) ?? source;
  const { freshness, ageDays } = assessFreshness(stats.latestObservedDate, latestSource.cadence);
  const historicalReady =
    KSEI_HOLDING_COMPOSITION_ARCHIVE.auditStatus === 'VERIFIED' &&
    archiveStats.distinctObservedDates >= 2 &&
    archiveStats.totalRows > 0;

  const startedAt = toIso(lastRun?.started_at);
  const finishedAt = toIso(lastRun?.finished_at);

  return {
    enabled: config.enabled,
    cronEnabled: config.cronEnabled,
    ingestionEnabled: config.ingestionEnabled,
    gate: { allowed: gate.allowed, reason: gate.reason, message: gate.message },
    source: {
      id: source.id,
      name: source.name,
      baseUrl: source.baseUrl,
      auditStatus: source.auditStatus,
      cadence: source.cadence,
      auditNote: source.auditNote,
    },
    lastRun: {
      status: lastRun?.status ?? null,
      startedAt,
      finishedAt,
      durationMs:
        startedAt && finishedAt ? new Date(finishedAt).getTime() - new Date(startedAt).getTime() : null,
      errorMessage: lastRun?.error_message ?? null,
      meta: (lastRun?.meta as Record<string, unknown> | undefined) ?? null,
    },
    history: stats,
    universe: {
      size: universeSize,
      covered,
      // Tidak pernah negatif: kalau tabel memuat ticker di luar universe saat ini
      // (universe pernah berubah), selisihnya di-nol-kan alih-alih menampilkan
      // angka yang membingungkan.
      missing: Math.max(0, universeSize - covered),
    },
    freshness,
    ageDays,
    historical: {
      ready: historicalReady,
      sourceId: KSEI_HOLDING_COMPOSITION_ARCHIVE.id,
      auditStatus: KSEI_HOLDING_COMPOSITION_ARCHIVE.auditStatus,
      cadence: KSEI_HOLDING_COMPOSITION_ARCHIVE.cadence,
      snapshots: archiveStats.distinctObservedDates,
      totalRows: archiveStats.totalRows,
      latestObservedDate: archiveStats.latestObservedDate,
      latestTickers: archiveStats.tickersOnLatestDate,
    },
  };
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}
