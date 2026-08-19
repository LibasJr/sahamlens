import { guard } from '@/lib/sahamLensGuard';
guard();

import { runController } from '@/shared/http/next-response.adapter';
import { NotFoundError } from '@/shared/errors/app-error';
import { getOwnershipFlowConfig } from '@/modules/ownership-flow/config/ownership-flow.config';
import { getOwnershipFlowList } from '@/modules/ownership-flow/service/ownership-flow-query.service';
import { getOwnershipUniverse } from '@/modules/ownership-flow/service/ownership-flow-ingest.service';
import { getPrimarySource, getSourceById } from '@/modules/ownership-flow/source/source-registry';
import { getOwnershipHistoryStats } from '@/modules/ownership-flow/repository/ownership-flow-history.repository';
import { logger } from '@/shared/logger/logger';

// DAFTAR OWNERSHIP FLOW seluruh universe - sumber data halaman /ownership-flow.
//
// Mengembalikan SELURUH ticker universe, termasuk yang BELUM punya observasi
// (freshness MISSING). Itu disengaja: menyaring emiten tanpa data akan membuat
// tabel terlihat lengkap padahal cakupannya belum penuh, dan operator kehilangan
// satu-satunya petunjuk visual bahwa ingestion belum menjangkau semuanya.

export const maxDuration = 60;

export async function GET() {
  return runController(async () => {
  const config = getOwnershipFlowConfig();
  if (!config.enabled) {
    // Dulu 404 dengan `code: 'FEATURE_DISABLED'` yang ditulis tangan. Kode mesin itu
    // BUKAN bagian dari katalog ErrorCode, jadi klien yang men-switch atas `code` tidak
    // pernah bisa menanganinya bersama kode lain. NotFoundError memberi 404 yang sama
    // dengan `code: 'NOT_FOUND'` yang memang ada di katalog; pesannya tetap menjelaskan
    // bahwa fiturnya belum diaktifkan, bukan bahwa datanya hilang.
    throw new NotFoundError('Ownership Flow belum diaktifkan');
  }

  {
    const universe = getOwnershipUniverse(config.universeLimit);
    const [rows, stats] = await Promise.all([
      getOwnershipFlowList(universe),
      getOwnershipHistoryStats(),
    ]);

    const source = (stats.latestSource ? getSourceById(stats.latestSource) : null) ?? getPrimarySource();
    const tickersWithData = rows.filter((row) => row.observedDate !== null).length;
    const tickersOnLatestDate = stats.latestObservedDate
      ? rows.filter((row) => row.observedDate === stats.latestObservedDate).length
      : 0;

    return {
      status: 200,
      body: {
      source: {
        id: source.id,
        name: source.name,
        baseUrl: source.baseUrl,
        cadence: source.cadence,
        // Status audit ikut dikirim supaya UI bisa menjelaskan dengan jujur
        // KENAPA tabelnya masih kosong, alih-alih menampilkan "tidak ada data"
        // yang tidak memberi tahu apa-apa.
        auditStatus: source.auditStatus,
      },
      universeSize: universe.length,
      latestObservedDate: stats.latestObservedDate,
      coverage: {
        tickersWithData,
        tickersOnLatestDate,
        totalObservations: stats.totalRows,
        firstObservedDate: stats.earliestObservedDate,
      },
      deltaUnit: 'percentage_point',
      experimental: true,
      inFinalScore: false,
      rows: rows.map((row) => ({
        ticker: row.ticker.replace('.JK', ''),
        observedDate: row.observedDate,
        foreignPct: row.foreignPct,
        localPct: row.localPct,
        delta: {
          '1d': row.delta.d1.pp,
          '7d': row.delta.d7.pp,
          '30d': row.delta.d30.pp,
        },
        deltaGapDays: {
          '1d': row.delta.d1.actualGapDays,
          '7d': row.delta.d7.actualGapDays,
          '30d': row.delta.d30.actualGapDays,
        },
        previous: row.previous,
        trend: row.trend,
        freshness: row.freshness,
        ageDays: row.ageDays,
      })),
      },
    };
  }
    // catch generik dihapus: runController menghasilkan 500 yang sama sambil mencatat
    // error lengkap ke shared/logger dengan X-Request-Id yang juga diterima klien.
  });
}
