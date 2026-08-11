'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

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
}

// Diagnosis ditulis sebagai kalimat, bukan cuma badge status. Perbedaan antara "tidak
// pernah dipanggil", "dipanggil lalu ditolak", dan "dipanggil lalu dilewati" menentukan
// tindakan yang sama sekali berbeda - dan itulah persis yang dulu tidak bisa dibedakan.
function diagnose(job: JobRow): { tone: 'ok' | 'warn' | 'bad'; text: string } {
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

export default function JobsMonitorClient() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/jobs', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error || 'Gagal memuat status job');
        return;
      }
      setJobs(json.jobs ?? []);
    } catch {
      setError('Gagal memuat status job');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="text-sm text-tv-muted">Memuat status job...</div>;
  if (error) {
    return (
      <div className="rounded-xl border border-tv-red/30 bg-tv-card p-5 text-sm text-tv-red">
        {error}
        <button type="button" onClick={load} className="ml-3 underline">Coba lagi</button>
      </div>
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
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-2 rounded-lg border border-tv-border px-3 py-2 text-sm hover:border-tv-borderLight"
        >
          <RefreshCw className="h-4 w-4" />
          Muat ulang
        </button>
      </div>

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
                  {job.lastStatus ?? 'BELUM ADA CATATAN'}
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
                Jadwal: {job.schedule
                  ? <code className="font-mono text-tv-text">{job.schedule}</code>
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
