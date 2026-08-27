'use client';

import { Metric, NA, ProgressMetric, Scroller, StatusBadge, Td, Th, ValidationCard, int, wib } from './shared-ui';
import type { Dashboard } from './types';

/** Protokol OOS beku + progres pengumpulan sinyal setelah freeze. */
export function OosProtocolSection({ dashboard }: { dashboard: Dashboard }) {
  return (
    <ValidationCard title="Protokol Forward Out-of-Sample" subtitle="Sekali dibekukan, baris protokol tidak pernah di-UPDATE. Formula berubah = protokol dan model version baru.">
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
    </ValidationCard>
  );
}

/** 10 run terakhir. */
export function RunHistorySection({ recentRuns }: { recentRuns: Dashboard['recentRuns'] }) {
  return (
    <ValidationCard title="Histori Validation Run" subtitle="10 run terakhir.">
      {recentRuns.length === 0 ? (
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
              {recentRuns.map((run) => (
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
    </ValidationCard>
  );
}
