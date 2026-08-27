'use client';

import React from 'react';
import { Database, Loader2, Lock, PlayCircle, RefreshCw, AlertTriangle } from 'lucide-react';
import { ActionButton, Metric, NA, StatusBadge, ValidationCard, Warnings, int, wib } from './shared-ui';
import type { ActionName, Dashboard, ValidationResult } from './types';

/**
 * "Status Model" + "Aksi Riset". Kartu identitas/cakupan model dan tombol aksi
 * (kumpulkan data, jalankan run, bekukan OOS, reset riset) - dipisah dari file
 * utama karena keduanya adalah satu blok kontrol di bagian atas dashboard.
 */
export function StatusAndActionsSection({
  dashboard,
  result,
  busy,
  actionMessage,
  lookbackDays,
  setLookbackDays,
  onLoad,
  onRunAction,
}: {
  dashboard: Dashboard;
  result: ValidationResult | null;
  busy: ActionName | null;
  actionMessage: string | null;
  lookbackDays: number;
  setLookbackDays: (n: number) => void;
  onLoad: () => void;
  onRunAction: (action: ActionName, payload?: Record<string, unknown>) => void;
}) {
  const { coverage } = dashboard;
  return (
    <>
      <ValidationCard
        title="Status Model"
        subtitle="Identitas dan cakupan data LensIntraday. Angka di sini hanya menyangkut model intraday, bukan LensScore T+20."
        action={
          <ActionButton
            icon={<RefreshCw className="h-3.5 w-3.5" />}
            label="Segarkan"
            onClick={onLoad}
          />
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
      </ValidationCard>

      <ValidationCard
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
            onClick={() => onRunAction('collect_data', { lookbackDays })}
          />
          <ActionButton
            icon={<PlayCircle className="h-4 w-4" />}
            label="Jalankan validation run"
            busy={busy === 'run_validation'}
            disabled={busy != null}
            onClick={() => onRunAction('run_validation', {})}
          />
          <ActionButton
            icon={<PlayCircle className="h-4 w-4" />}
            label="Validation run (OOS saja)"
            busy={busy === 'run_validation'}
            disabled={busy != null || !dashboard.oosProtocol}
            onClick={() => onRunAction('run_validation', { oosOnly: true })}
          />
          <ActionButton
            icon={<Lock className="h-4 w-4" />}
            label="Bekukan protokol OOS"
            busy={busy === 'freeze_oos'}
            disabled={busy != null}
            onClick={() => onRunAction('freeze_oos', {})}
          />
          <ActionButton
            icon={<AlertTriangle className="h-4 w-4" />}
            label="Reset data riset"
            busy={busy === 'reset_research'}
            disabled={busy != null}
            onClick={() => {
              if (window.confirm('Hapus seluruh data LensIntraday untuk masa testing? Data LensRadar, saham, pengguna, dan data produksi tidak akan disentuh.')) {
                onRunAction('reset_research', { confirmation: 'RESET_INTRADAY_RESEARCH' });
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
      </ValidationCard>
    </>
  );
}

export { Loader2 };
