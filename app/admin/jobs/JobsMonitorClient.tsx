'use client';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { apiErrorMessage, apiRequest } from '@/shared/http/api-client';

interface JobRow {
  name: string;
  path: string;
  provider: string;
  schedule: string | null;
  scheduleStatus: string;
  lastStatus: string | null;
  lastStartedAt: string | null;
  lastErrorMessage: string | null;
  lastMeta: Record<string, unknown> | null;
  lastSuccessAt: string | null;
  runs24h: number;
  failures24h: number;
  source: string;
}

interface HealthPayload {
  status?: 'ok' | 'degraded';
  checks?: { database?: 'ok' | 'error'; redis?: 'ok' | 'not_configured' | 'error' };
  timestamp?: string;
}

interface SourceHealthRow {
  sourceId: string;
  status: 'HEALTHY' | 'DEGRADED' | 'DOWN' | 'UNKNOWN';
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastLatencyMs: number | null;
  consecutiveFailures: number;
  dataObservedAt: string | null;
  detail: Record<string, unknown>;
}

interface CacheRow {
  id: string;
  label: string;
  state: 'HIT' | 'SNAPSHOT' | 'WAITING' | 'MISS' | 'UNAVAILABLE';
  detail: string | null;
  cacheAgeSec: number | null;
  ttlRemainingSec: number | null;
  lastCronSuccessAt: string | null;
  lastCronStatus: string | null;
  snapshotAt: string | null;
  universeVersion: string | null;
  snapshotSource: 'active' | 'last-successful' | 'legacy' | null;
}

interface WeeklyMaintenanceStatus {
  unit: string;
  scheduleLabel: string;
  timerActive: boolean;
  timerEnabled: boolean;
  serviceRunning: boolean;
  serviceResult: string | null;
  nextRunAt: string | null;
  diagnostics: Array<'SYSTEMD_UNAVAILABLE' | 'REPORT_UNAVAILABLE'>;
  lastReport: {
    startedAt: string;
    finishedAt: string;
    durationMs: number;
    verdict: 'PASS' | 'WARN' | 'FAIL';
    counts: Record<'PASS' | 'WARN' | 'FAIL' | 'SKIP', number>;
    stages: string[];
    commit: string | null;
    steps: Array<{
      id: string;
      stage: string;
      label: string;
      status: 'PASS' | 'WARN' | 'FAIL' | 'SKIP';
      summary: string;
      durationMs: number;
    }>;
  } | null;
}

// Diagnosis ditulis sebagai kalimat, bukan cuma badge status. Perbedaan antara "tidak
// pernah dipanggil", "dipanggil lalu ditolak", dan "dipanggil lalu dilewati" menentukan
// tindakan yang sama sekali berbeda - dan itulah persis yang dulu tidak bisa dibedakan.
function isDisabledByPolicy(job: JobRow): boolean {
  return job.scheduleStatus === 'disabled-by-policy';
}

function diagnose(job: JobRow): { tone: 'ok' | 'warn' | 'bad'; text: string } {
  if (isDisabledByPolicy(job)) {
    return {
      tone: 'warn',
      text: job.source || 'Dinonaktifkan sesuai kebijakan integritas data. Scheduler tidak boleh menjalankan job ini sampai sumber datanya terverifikasi.',
    };
  }
  if (!job.lastStatus) {
    return job.scheduleStatus === 'verify-dashboard'
      ? { tone: 'bad', text: 'Belum pernah tercatat sekali pun. Jadwalnya juga belum terverifikasi di repo - kemungkinan besar cron ini memang belum terdaftar di QStash.' }
      : { tone: 'bad', text: 'Belum pernah tercatat sekali pun, padahal jadwalnya sudah dideklarasikan. Periksa apakah deployment-nya sudah membawa jadwal ini.' };
  }
  if (job.lastStatus === 'REJECTED') {
    return { tone: 'bad', text: 'Dipanggil, tapi ditolak karena signature tidak valid. Ini soal environment variable (signing key), bukan soal jadwal.' };
  }
  if (job.lastStatus === 'FAILED') {
    return { tone: 'bad', text: 'Eksekusi terakhir gagal. Lihat pesan errornya di bawah.' };
  }
  if (job.lastStatus === 'SKIPPED') {
    return { tone: 'warn', text: 'Dipanggil, tapi dilewati. Kalau ini terus terjadi, jadwalnya jatuh di jam yang salah - job-nya hidup, cuma tidak pernah kebagian jendela kerja.' };
  }
  if (job.lastStatus === 'SUCCESS' && !job.lastSuccessAt) {
    return { tone: 'warn', text: 'Status sukses tapi tidak ada catatan sukses sebelumnya.' };
  }
  return { tone: 'ok', text: 'Berjalan normal.' };
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'belum pernah';
  const diffMs = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diffMs)) return 'belum pernah';
  const menit = Math.floor(diffMs / 60000);
  if (menit < 1) return 'baru saja';
  if (menit < 60) return `${menit} menit lalu`;
  const jam = Math.floor(menit / 60);
  if (jam < 24) return `${jam} jam lalu`;
  return `${Math.floor(jam / 24)} hari lalu`;
}

function duration(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return 'tidak tersedia';
  if (seconds < 60) return `${Math.round(seconds)} dtk`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} menit`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 48) return remainingMinutes ? `${hours} jam ${remainingMinutes} menit` : `${hours} jam`;
  return `${Math.floor(hours / 24)} hari`;
}

function dateTime(iso: string | null): string {
  if (!iso) return 'belum tersedia';
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return 'belum tersedia';
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(date);
}

const TONE_CLASS = {
  ok: 'border-tv-green/30 bg-tv-green/[0.05]',
  warn: 'border-tv-yellow/30 bg-tv-yellow/[0.05]',
  bad: 'border-tv-red/30 bg-tv-red/[0.05]',
} as const;

const BADGE_CLASS = {
  ok: 'bg-tv-green/10 text-tv-green border-tv-green/30',
  warn: 'bg-tv-yellow/10 text-tv-yellow border-tv-yellow/30',
  bad: 'bg-tv-red/10 text-tv-red border-tv-red/30',
} as const;

const CACHE_STATE_STYLE = {
  HIT: { card: 'border-tv-green/25 bg-tv-green/[0.04]', badge: 'border-tv-green/30 bg-tv-green/10 text-tv-green' },
  SNAPSHOT: { card: 'border-tv-yellow/30 bg-tv-yellow/[0.04]', badge: 'border-tv-yellow/30 bg-tv-yellow/10 text-tv-yellow' },
  WAITING: { card: 'border-tv-blue/30 bg-tv-blue/[0.04]', badge: 'border-tv-blue/30 bg-tv-blue/10 text-tv-blue' },
  MISS: { card: 'border-tv-red/30 bg-tv-red/[0.04]', badge: 'border-tv-red/30 bg-tv-red/10 text-tv-red' },
  UNAVAILABLE: { card: 'border-tv-red/30 bg-tv-red/[0.04]', badge: 'border-tv-red/30 bg-tv-red/10 text-tv-red' },
} as const;

export default function JobsMonitorClient() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [caches, setCaches] = useState<CacheRow[]>([]);
  const [sourceHealth, setSourceHealth] = useState<SourceHealthRow[]>([]);
  const [weeklyMaintenance, setWeeklyMaintenance] = useState<WeeklyMaintenanceStatus | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [json, healthJson] = await Promise.all([
        apiRequest<any>('/api/admin/jobs', { cache: 'no-store' }),
        apiRequest<HealthPayload>('/api/health', { cache: 'no-store' }),
      ]);
      setJobs(json.jobs ?? []);
      setCaches(json.caches ?? []);
      setSourceHealth(json.sourceHealth ?? []);
      setWeeklyMaintenance(json.weeklyMaintenance ?? null);
      setHealth(healthJson);
    } catch (error) {
      setError(apiErrorMessage(error, 'Gagal memuat status job', true));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="text-sm text-tv-muted">Memuat status job...</div>;
  if (error) {
    return (
      <Card as="div" className="border-tv-red/30 p-5 text-sm text-tv-red" padding="none" radius="xl" surface="solid" elevation="none" overflow="visible" highlight={false}>
        {error}
        <Button variant="bare" size="none" type="button" onClick={load} className="ml-3 underline">Coba lagi</Button>
      </Card>
    );
  }

  const bermasalah = jobs.filter((j) => diagnose(j).tone === 'bad').length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-tv-muted">
          {jobs.length} job terdaftar
          {bermasalah > 0 && <span className="text-tv-red font-bold"> • {bermasalah} perlu perhatian</span>}
        </p>
        <Button variant="bare" size="none"
          type="button"
          onClick={load}
          className="inline-flex items-center gap-2 rounded-lg border border-tv-border px-3 py-2 text-sm hover:border-tv-borderLight"
        >
          <RefreshCw className="h-4 w-4" />
          Muat ulang
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card as="div" className="border-tv-border p-4" padding="none" radius="xl" surface="solid" elevation="none" overflow="visible" highlight={false}>
          <div className="text-xs text-tv-muted">Database</div>
          <div className={`mt-1 text-sm font-bold ${health?.checks?.database === 'ok' ? 'text-tv-green' : 'text-tv-red'}`}>{health?.checks?.database === 'ok' ? 'Terhubung' : 'Tidak tersedia'}</div>
        </Card>
        <Card as="div" className="border-tv-border p-4" padding="none" radius="xl" surface="solid" elevation="none" overflow="visible" highlight={false}>
          <div className="text-xs text-tv-muted">Cache Redis</div>
          <div className={`mt-1 text-sm font-bold ${health?.checks?.redis === 'ok' ? 'text-tv-green' : health?.checks?.redis === 'not_configured' ? 'text-tv-yellow' : 'text-tv-red'}`}>{health?.checks?.redis === 'ok' ? 'Terhubung' : health?.checks?.redis === 'not_configured' ? 'Tidak dikonfigurasi' : 'Tidak tersedia'}</div>
        </Card>
        <Card as="div" className="border-tv-border p-4" padding="none" radius="xl" surface="solid" elevation="none" overflow="visible" highlight={false}>
          <div className="text-xs text-tv-muted">Deploy production</div>
          <div className="mt-1 text-sm font-bold text-tv-muted">Verifikasi di GitHub Actions</div>
          <div className="mt-1 text-[11px] leading-relaxed text-tv-muted">Riwayat deploy tidak direka dari data aplikasi.</div>
        </Card>
      </div>

      {weeklyMaintenance && (() => {
        const report = weeklyMaintenance.lastReport;
        const findings = report?.steps.filter((step) => step.status === 'WARN' || step.status === 'FAIL') ?? [];
        const systemdUnavailable = weeklyMaintenance.diagnostics.includes('SYSTEMD_UNAVAILABLE');
        const tone = report?.verdict === 'FAIL' || systemdUnavailable
          ? 'bad'
          : report?.verdict === 'WARN' || !weeklyMaintenance.timerActive || !weeklyMaintenance.timerEnabled
            ? 'warn'
            : 'ok';
        const badge = weeklyMaintenance.serviceRunning
          ? 'SEDANG BERJALAN'
          : systemdUnavailable
            ? 'STATUS TIMER TIDAK TERBACA'
            : weeklyMaintenance.timerActive && weeklyMaintenance.timerEnabled
              ? 'JADWAL AKTIF'
              : 'JADWAL TIDAK AKTIF';

        return (
          <Card as="section" className={`p-4 ${TONE_CLASS[tone]}`} padding="none" radius="xl" surface="solid" elevation="none" overflow="visible" highlight={false}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-heading text-base font-bold text-tv-text">Update Mingguan</h2>
                <p className="mt-1 text-xs leading-relaxed text-tv-muted">
                  Refresh data lambat berubah, audit keamanan, verifikasi produksi, dan pemeriksaan dependency. Job hanya melapor; tidak mengubah dependency atau commit otomatis.
                </p>
              </div>
              <span className={`rounded-full border px-3 py-1 text-xs font-bold ${BADGE_CLASS[tone]}`}>{badge}</span>
            </div>

            <div className="mt-4 grid gap-3 text-xs sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border border-tv-border p-3">
                <div className="text-tv-muted">Jadwal</div>
                <div className="mt-1 font-bold text-tv-text">{weeklyMaintenance.scheduleLabel}</div>
              </div>
              <div className="rounded-lg border border-tv-border p-3">
                <div className="text-tv-muted">Berikutnya</div>
                <div className="mt-1 font-bold text-tv-text">{dateTime(weeklyMaintenance.nextRunAt)}</div>
              </div>
              <div className="rounded-lg border border-tv-border p-3">
                <div className="text-tv-muted">Laporan terakhir</div>
                <div className="mt-1 font-bold text-tv-text">{dateTime(report?.finishedAt ?? null)}</div>
                <div className="mt-1 text-[11px] text-tv-muted">Durasi {report ? duration(report.durationMs / 1_000) : 'belum tersedia'}</div>
              </div>
              <div className="rounded-lg border border-tv-border p-3">
                <div className="text-tv-muted">Versi yang diaudit</div>
                <div className="mt-1 font-mono font-bold text-tv-text">{report?.commit ?? 'belum tersedia'}</div>
                <div className="mt-1 text-[11px] text-tv-muted">systemd: {weeklyMaintenance.serviceResult ?? 'belum tersedia'}</div>
              </div>
            </div>

            {report ? (
              <>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(['PASS', 'WARN', 'FAIL', 'SKIP'] as const).map((status) => (
                    <div key={status} className="rounded-lg border border-tv-border p-3 text-center">
                      <div className="font-number text-lg font-bold text-tv-text">{report.counts[status]}</div>
                      <div className="text-[10px] font-bold text-tv-muted">{status}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 text-xs text-tv-muted">Tahap aktual: {report.stages.join(' → ') || 'tidak tercatat'}</div>
                {findings.length > 0 ? (
                  <div className="mt-4 space-y-2">
                    <div className="text-xs font-bold text-tv-text">Temuan yang perlu dilihat</div>
                    {findings.map((step) => (
                      <div key={`${step.stage}:${step.id}`} className={`rounded-lg border p-3 text-xs ${step.status === 'FAIL' ? 'border-tv-red/30 bg-tv-red/[0.04]' : 'border-tv-yellow/30 bg-tv-yellow/[0.04]'}`}>
                        <span className={`font-bold ${step.status === 'FAIL' ? 'text-tv-red' : 'text-tv-yellow'}`}>{step.status}</span>
                        <span className="ml-2 font-semibold text-tv-text">{step.label}</span>
                        <p className="mt-1 leading-relaxed text-tv-muted">{step.summary}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 text-xs font-semibold text-tv-green">Laporan terakhir tidak memiliki WARN atau FAIL.</p>
                )}
              </>
            ) : (
              <p className="mt-4 text-xs text-tv-yellow">Laporan mingguan belum tersedia atau belum dapat dibaca.</p>
            )}
          </Card>
        );
      })()}

      <Card as="section" className="border-tv-border p-4" padding="none" radius="xl" surface="solid" elevation="none" overflow="visible" highlight={false}>
          <h2 className="font-heading text-base font-bold text-tv-text">Data Source Health</h2>
          <p className="mt-1 text-xs text-tv-muted">Status provider dicatat dari request nyata; kegagalan health logging tidak pernah mengubah data finansial.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {sourceHealth.map((source) => (
              <div key={source.sourceId} className="rounded-lg border border-tv-border p-3">
                <div className="flex items-center justify-between gap-2"><span className="text-sm font-bold text-tv-text">{source.sourceId}</span><span className={`text-xs font-bold ${source.status === 'HEALTHY' ? 'text-tv-green' : 'text-tv-red'}`}>{source.status}</span></div>
                <div className="mt-2 text-[11px] text-tv-muted">Sukses: {timeAgo(source.lastSuccessAt)} · gagal: {timeAgo(source.lastFailureAt)}</div>
                <div className="mt-1 text-[11px] text-tv-muted">Latency terakhir: {source.lastLatencyMs == null ? '—' : `${source.lastLatencyMs} ms`} · kegagalan beruntun: {source.consecutiveFailures}</div>
                {source.dataObservedAt && <div className="mt-1 text-[11px] text-tv-muted">Data observed: {timeAgo(source.dataObservedAt)}</div>}
              </div>
            ))}
          </div>
          {sourceHealth.length === 0 && <p className="mt-4 rounded-lg border border-tv-yellow/30 bg-tv-yellow/[0.04] p-3 text-xs text-tv-yellow">Belum ada telemetry provider yang berhasil tersimpan. Status tidak dianggap sehat sampai request nyata mencatat hasilnya.</p>}
        </Card>

      <Card as="section" className="border-tv-border p-4" padding="none" radius="xl" surface="solid" elevation="none" overflow="visible" highlight={false}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="font-heading text-base font-bold text-tv-text">Kesehatan Cache Data</h2>
            <p className="mt-1 text-xs leading-relaxed text-tv-muted">
              Cache Redis untuk sumber data besar. Umur dihitung dari TTL penulis cache; waktu cron menunjukkan worker terakhir yang berhasil.
            </p>
          </div>
          <span className="text-[11px] text-tv-muted">Cache akun pribadi tidak ditampilkan atau dibagikan.</span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {caches.map((cache) => {
            const style = CACHE_STATE_STYLE[cache.state];
            return (
              <div key={cache.id} className={`rounded-lg border p-3 ${style.card}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-bold text-tv-text">{cache.label}</div>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${style.badge}`}>
                    {cache.state}
                  </span>
                </div>
                {cache.state === 'HIT' || cache.state === 'SNAPSHOT' ? (
                  <>
                    <div className="mt-3 text-xs text-tv-muted">{cache.state === 'SNAPSHOT' ? 'Umur snapshot' : 'Umur cache'}</div>
                    <div className="font-number text-sm font-bold text-tv-text">{duration(cache.cacheAgeSec)}</div>
                    {cache.ttlRemainingSec != null && <div className="mt-2 text-[11px] text-tv-muted">TTL tersisa {duration(cache.ttlRemainingSec)}</div>}
                    {cache.universeVersion && <div className="mt-1 text-[11px] text-tv-muted">Universe {cache.universeVersion}</div>}
                  </>
                ) : (
                  <p className={`mt-3 text-xs leading-relaxed ${cache.state === 'WAITING' ? 'text-tv-blue' : 'text-tv-red'}`}>{cache.detail}</p>
                )}
                {cache.state === 'SNAPSHOT' && cache.detail && <p className="mt-2 text-[11px] leading-relaxed text-tv-yellow">{cache.detail}</p>}
                <div className="mt-3 border-t border-tv-border pt-2 text-[11px] text-tv-muted">
                  Cron terakhir: <span className="font-semibold text-tv-text">{timeAgo(cache.lastCronSuccessAt)}</span>
                  {cache.lastCronStatus && <span> · {cache.lastCronStatus}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="space-y-3">
        {jobs.map((job) => {
          const d = diagnose(job);
          return (
            <div key={job.name} className={`rounded-xl border p-4 ${TONE_CLASS[d.tone]}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-heading font-bold text-tv-text">{job.name}</div>
                  <div className="mt-0.5 font-mono text-[11px] text-tv-muted">{job.path}</div>
                </div>
                <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-bold ${BADGE_CLASS[d.tone]}`}>
                  {isDisabledByPolicy(job) ? 'DINONAKTIFKAN' : (job.lastStatus ?? 'BELUM ADA CATATAN')}
                </span>
              </div>

              <p className="mt-3 text-sm leading-relaxed text-tv-text">{d.text}</p>

              <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                <div>
                  <div className="text-tv-muted">Terakhir jalan</div>
                  <div className="font-bold">{timeAgo(job.lastStartedAt)}</div>
                </div>
                <div>
                  <div className="text-tv-muted">Terakhir SUKSES</div>
                  <div className="font-bold">{timeAgo(job.lastSuccessAt)}</div>
                </div>
                <div>
                  <div className="text-tv-muted">Eksekusi 24 jam</div>
                  <div className="font-number font-bold">{job.runs24h}</div>
                </div>
                <div>
                  <div className="text-tv-muted">Gagal 24 jam</div>
                  <div className={`font-number font-bold ${job.failures24h > 0 ? 'text-tv-red' : ''}`}>{job.failures24h}</div>
                </div>
              </div>

              <div className="mt-3 text-xs text-tv-muted">
                Jadwal: {isDisabledByPolicy(job)
                  ? <span className="font-semibold text-tv-yellow">dinonaktifkan oleh kebijakan integritas data</span>
                  : job.schedule
                    ? <code className="font-mono text-tv-text">{job.schedule}</code>
                    : job.provider === 'systemd' && job.source.includes('BELUM dipasang')
                      ? <span className="text-tv-yellow">belum terpasang otomatis di VPS — pengumpulan manual tetap dapat berjalan</span>
                      : <span className="text-tv-yellow">belum terverifikasi ({job.provider})</span>}
              </div>

              {job.lastErrorMessage && (
                <p className="mt-2 rounded-lg bg-tv-bg p-2 font-mono text-[11px] leading-relaxed text-tv-red">
                  {job.lastErrorMessage}
                </p>
              )}

              {job.lastMeta && Object.keys(job.lastMeta).length > 0 && (
                <p className="mt-2 font-mono text-[11px] text-tv-muted">
                  Hasil terakhir: {JSON.stringify(job.lastMeta)}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
