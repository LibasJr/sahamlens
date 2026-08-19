import { Card } from '@/components/ui/Card';
import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, Database, Globe, ShieldAlert, ShieldCheck } from 'lucide-react';
import { isAdminServer } from '@/modules/user';
import { getOwnershipFlowMonitor } from '@/modules/ownership-flow/service/ownership-flow-monitor.service';
import { KSEI_HOLDING_COMPOSITION_ARCHIVE } from '@/modules/ownership-flow/source/source-registry';

// PANEL STATUS INGESTION OWNERSHIP FLOW.
//
// Server Component: memanggil monitor langsung, tanpa perjalanan bolak-balik
// lewat API-nya sendiri.
//
// Yang WAJIB terlihat di sini dan tidak boleh disembunyikan (§17): tanggal
// observasi terakhir (BUKAN tanggal cron), cakupan universe, jumlah yang belum
// tercakup, status audit sumber, dan alasan gerbang kalau ingestion tertutup.
// Panel yang hanya menampilkan "sinkron terakhir: sukses" sementara puluhan
// emiten diam-diam tidak pernah masuk adalah panel yang menipu operatornya.

export const metadata = { robots: { index: false, follow: false } };

const FRESHNESS_TEXT: Record<string, { label: string; className: string }> = {
  FRESH: { label: 'SEGAR', className: 'bg-tv-green/10 text-tv-green border-tv-green/20' },
  STALE: { label: 'BASI', className: 'bg-tv-warning/10 text-tv-warning border-tv-warning/20' },
  MISSING: { label: 'KOSONG', className: 'bg-white/[0.04] text-tv-muted border-white/[0.08]' },
};

function waktuWib(iso: string | null): string {
  if (!iso) return 'belum pernah';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'waktu tidak terbaca';
  return (
    d.toLocaleString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Jakarta',
    }) + ' WIB'
  );
}

function tanggalObservasi(value: string | null): string {
  if (!value) return 'belum ada';
  const [y, m, d] = value.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export default async function AdminOwnershipFlowPage() {
  if (!(await isAdminServer())) redirect('/admin-login');

  const monitor = await getOwnershipFlowMonitor();
  const freshness = FRESHNESS_TEXT[monitor.freshness] ?? FRESHNESS_TEXT.MISSING;
  const sourceVerified = monitor.source.auditStatus === 'VERIFIED';
  const archiveVerified = KSEI_HOLDING_COMPOSITION_ARCHIVE.auditStatus === 'VERIFIED';

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <Link href="/admin" className="mb-4 inline-flex items-center gap-1.5 text-sm text-tv-muted hover:text-tv-text">
        <ArrowLeft className="h-4 w-4" />
        Kembali ke Admin
      </Link>

      <h1 className="font-heading text-2xl font-bold text-tv-text">Ownership Flow &mdash; Status Ingestion</h1>
      <p className="mt-1 text-sm text-tv-muted">
        Komposisi kepemilikan lokal/asing dari sumber kustodian resmi. Modul terpisah dari Broker Summary.
      </p>

      <div
        className={`mt-5 rounded-xl border p-4 ${
          monitor.historical.ready
            ? 'border-tv-green/20 bg-tv-green/[0.04]'
            : 'border-tv-warning/20 bg-tv-warning/[0.04]'
        }`}
      >
        <div className="flex items-start gap-3">
          {monitor.historical.ready ? (
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-tv-green" />
          ) : (
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-tv-warning" />
          )}
          <div className="min-w-0">
            <p className="font-semibold text-tv-text">
              Arsip bulanan KSEI: {monitor.historical.ready ? 'SIAP DIPAKAI' : 'BELUM SIAP'}
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-tv-muted">
              {monitor.historical.auditStatus} · {monitor.historical.snapshots} snapshot · {monitor.historical.totalRows} baris histori · snapshot terbaru {tanggalObservasi(monitor.historical.latestObservedDate)} ({monitor.historical.latestTickers} emiten).
            </p>
          </div>
        </div>
      </div>

      {/* Gerbang berikut hanya untuk sumber LIVE per-ticker. */}
      {/* GERBANG - kotak paling atas karena inilah yang menentukan apakah data
          bertambah sama sekali. */}
      <div
        className={`mt-5 rounded-xl border p-4 ${
          monitor.gate.allowed
            ? 'border-tv-green/20 bg-tv-green/[0.04]'
            : 'border-tv-warning/20 bg-tv-warning/[0.04]'
        }`}
      >
        <div className="flex items-start gap-3">
          {monitor.gate.allowed ? (
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-tv-green" />
          ) : (
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-tv-warning" />
          )}
          <div className="min-w-0">
            <p className="font-semibold text-tv-text">
              Snapshot live per-ticker: {monitor.gate.allowed ? 'DIIZINKAN' : `TERTUTUP (${monitor.gate.reason})`}
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-tv-muted">{monitor.gate.message}</p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Cron live terakhir" value={waktuWib(monitor.lastRun.startedAt)} sub={monitor.lastRun.status ?? 'belum pernah jalan'} />
        {/* Tanggal observasi SENGAJA dipisahkan dari waktu sinkron - keduanya
            berbeda, dan menyamakannya adalah kesalahan yang seluruh modul ini
            dibangun untuk menghindarinya (§6). */}
        <Stat label="Tanggal observasi" value={tanggalObservasi(monitor.history.latestObservedDate)} sub={monitor.ageDays === null ? 'belum ada data' : `umur ${monitor.ageDays} hari`} />
        <Stat label="Universe" value={String(monitor.universe.size)} sub={`${monitor.universe.covered} tercakup`} />
        <Stat label="Belum tercakup" value={String(monitor.universe.missing)} sub={monitor.universe.missing > 0 ? 'perlu perhatian' : 'lengkap'} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card as="section" className="border-tv-border p-4" padding="none" radius="xl" surface="solid" elevation="none" overflow="visible" highlight={false}>
          <h2 className="flex items-center gap-2 font-heading text-base font-bold text-tv-text">
            <Database className="h-4 w-4 text-tv-blue" />
            Histori tersimpan
          </h2>
          <dl className="mt-3 space-y-2 text-[13px]">
            <Row label="Total baris" value={String(monitor.history.totalRows)} />
            <Row label="Emiten punya data" value={String(monitor.history.distinctTickers)} />
            <Row label="Snapshot historis" value={String(monitor.history.distinctObservedDates)} />
            <Row label="Observasi pertama" value={tanggalObservasi(monitor.history.earliestObservedDate)} />
            <Row label="Pengambilan terakhir" value={waktuWib(monitor.history.lastFetchedAt)} />
            <Row
              label="Kesegaran"
              value={freshness.label}
              valueClassName={`rounded border px-1.5 py-0.5 text-[11px] font-bold ${freshness.className}`}
            />
          </dl>
        </Card>

        <Card as="section" className="border-tv-border p-4" padding="none" radius="xl" surface="solid" elevation="none" overflow="visible" highlight={false}>
          <h2 className="flex items-center gap-2 font-heading text-base font-bold text-tv-text">
            <Globe className="h-4 w-4 text-tv-blue" />
            Sumber data
          </h2>
          <dl className="mt-3 space-y-2 text-[13px]">
            <Row label="ID" value={monitor.source.id} />
            <Row label="Nama" value={monitor.source.name} />
            <Row label="Cadence" value={monitor.source.cadence} />
            <Row
              label="Status audit"
              value={monitor.source.auditStatus}
              valueClassName={`rounded border px-1.5 py-0.5 text-[11px] font-bold ${
                sourceVerified
                  ? 'border-tv-green/20 bg-tv-green/10 text-tv-green'
                  : 'border-tv-warning/20 bg-tv-warning/10 text-tv-warning'
              }`}
            />
            <Row
              label="Arsip bulanan"
              value={`${KSEI_HOLDING_COMPOSITION_ARCHIVE.auditStatus} · ${KSEI_HOLDING_COMPOSITION_ARCHIVE.format}`}
              valueClassName={`rounded border px-1.5 py-0.5 text-[11px] font-bold ${
                archiveVerified
                  ? 'border-tv-green/20 bg-tv-green/10 text-tv-green'
                  : 'border-tv-warning/20 bg-tv-warning/10 text-tv-warning'
              }`}
            />
          </dl>
          <p className="mt-3 break-words rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5 text-[12px] leading-relaxed text-tv-muted">
            {monitor.source.auditNote}
          </p>
          {archiveVerified && (
            <p className="mt-2 rounded-lg border border-tv-green/15 bg-tv-green/[0.035] p-2.5 text-[12px] leading-relaxed text-tv-muted">
              Arsip bulanan KSEI sudah terverifikasi untuk format <code className="rounded bg-white/[0.06] px-1">Balancepos*.txt</code>
              {' '}pipe-delimited. Arsip ini boleh dipakai untuk backfill historis dengan
              {' '}<code className="rounded bg-white/[0.06] px-1">npm run backfill:ownership-flow</code>.
              Gerbang ingestion live tetap terpisah dan masih tertutup sampai sumber snapshot per-ticker lolos audit.
            </p>
          )}
          {!sourceVerified && (
            <p className="mt-2 text-[12px] leading-relaxed text-tv-muted">
              Untuk snapshot live, jalankan <code className="rounded bg-white/[0.06] px-1">npm run audit:ksei-ownership</code> di VPS,
              lalu ikuti checklist di <code className="rounded bg-white/[0.06] px-1">docs/ownership-flow/source-audit.md</code>.
            </p>
          )}
        </Card>
      </div>

      <Card as="section" className="mt-4 border-tv-border p-4" padding="none" radius="xl" surface="solid" elevation="none" overflow="visible" highlight={false}>
        <h2 className="font-heading text-base font-bold text-tv-text">Konfigurasi & eksekusi terakhir</h2>
        <dl className="mt-3 grid gap-2 text-[13px] sm:grid-cols-2">
          <Row label="OWNERSHIP_FLOW_ENABLED" value={monitor.enabled ? 'true' : 'false'} />
          <Row label="OWNERSHIP_FLOW_CRON_ENABLED" value={monitor.cronEnabled ? 'true' : 'false'} />
          <Row label="OWNERSHIP_FLOW_INGESTION_ENABLED" value={monitor.ingestionEnabled ? 'true' : 'false'} />
          <Row label="Durasi eksekusi" value={monitor.lastRun.durationMs === null ? '—' : `${monitor.lastRun.durationMs} ms`} />
        </dl>
        {monitor.lastRun.errorMessage && (
          <p className="mt-3 rounded-lg border border-tv-red/20 bg-tv-red/[0.05] p-2.5 text-[12px] text-tv-text">
            {monitor.lastRun.errorMessage}
          </p>
        )}
        {monitor.lastRun.meta && (
          <pre className="mt-3 max-h-72 overflow-auto rounded-lg border border-white/[0.06] bg-black/30 p-3 text-[11.5px] leading-relaxed text-tv-muted">
            {JSON.stringify(monitor.lastRun.meta, null, 2)}
          </pre>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card as="div" className="border-tv-border p-3.5" padding="none" radius="xl" surface="solid" elevation="none" overflow="visible" highlight={false}>
      <p className="text-[10.5px] uppercase tracking-wide text-tv-muted">{label}</p>
      <p className="mt-1 truncate font-heading text-[15px] font-bold text-tv-text">{value}</p>
      {sub && <p className="mt-0.5 truncate text-[11px] text-tv-muted">{sub}</p>}
    </Card>
  );
}

function Row({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/[0.04] pb-1.5 last:border-0">
      <dt className="shrink-0 text-tv-muted">{label}</dt>
      <dd className={`min-w-0 truncate text-right text-tv-text ${valueClassName ?? ''}`}>{value}</dd>
    </div>
  );
}
