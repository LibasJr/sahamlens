import Link from 'next/link';
import { cookies } from 'next/headers';
import { ArrowLeft, CalendarClock, CheckCircle2, Clock, HelpCircle, ShieldAlert, XCircle } from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { getDailyMapData, type DailyMapJobRow } from '@/modules/confirmation/service/daily-map.service';
import { LANG_COOKIE } from '@/shared/constants/cookie-names';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata = {
  title: 'Peta Alur Harian — SahamLens',
  description:
    'Kapan setiap data SahamLens benar-benar diperbarui: jam jalan, status terakhir, dan bukti riwayat dari log tugas — bukan jadwal yang ditulis tangan.',
  alternates: { canonical: '/panduan-harian' },
};

function formatWib(timestamp: string | null): string {
  if (!timestamp) return 'belum tercatat';
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return 'belum tercatat';
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}

function StatusBadge({ job, isEn }: { job: DailyMapJobRow; isEn: boolean }) {
  if (job.lastStatus === 'SUCCESS') {
    return (
      <span className="inline-flex items-center gap-1 text-emerald-400">
        <CheckCircle2 className="h-3.5 w-3.5" /> {isEn ? 'last run succeeded' : 'run terakhir berhasil'}
      </span>
    );
  }
  if (job.lastStatus === 'FAILED') {
    return (
      <span className="inline-flex items-center gap-1 text-rose-400">
        <XCircle className="h-3.5 w-3.5" /> {isEn ? 'last run failed' : 'run terakhir gagal'}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-amber-400">
      <HelpCircle className="h-3.5 w-3.5" /> {isEn ? 'no record yet' : 'belum ada riwayat'}
    </span>
  );
}

export default async function DailyMapPage() {
  const data = await getDailyMapData();
  const isEn = (await cookies()).get(LANG_COOKIE)?.value === 'en';

  return (
    <main className="min-h-screen bg-tv-bg p-4 text-tv-text sm:p-8">
      <div className="mx-auto max-w-5xl">
        <Link href="/" className="mb-4 inline-flex items-center gap-1.5 text-sm text-tv-muted hover:text-tv-text">
          <ArrowLeft className="h-4 w-4" /> {isEn ? 'Back' : 'Kembali'}
        </Link>

        <h1 className="flex items-center gap-2 font-heading text-2xl font-bold">
          <CalendarClock className="h-6 w-6" /> {isEn ? 'Daily schedule map' : 'Peta Alur Harian'}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-tv-muted">
          {isEn
            ? 'Which data is fresh when, so you do not read an old number as if it were today\'s. Every row below comes from the real task log: the hour it usually runs, the last run, and the last status. A task with no log entry is shown as having no record — never as a success.'
            : 'Data mana yang sudah segar dan kapan, supaya angka lama tidak dibaca seolah angka hari ini. Setiap baris di bawah berasal dari log tugas yang benar-benar berjalan: jam biasanya, run terakhir, dan status terakhir. Tugas tanpa catatan ditampilkan sebagai belum ada riwayat — tidak pernah dianggap berhasil.'}
        </p>

        <Card as="section" padding="none" radius="xl" elevation="none" highlight={false} overflow="visible" className="mt-4 border-tv-border p-5">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-tv-muted">
                <tr>
                  <th className="py-2 pr-3">{isEn ? 'Data' : 'Data'}</th>
                  <th className="py-2 pr-3">{isEn ? 'What it refreshes' : 'Yang diperbarui'}</th>
                  <th className="py-2 pr-3">{isEn ? 'Usual hours (WIB)' : 'Jam biasanya (WIB)'}</th>
                  <th className="py-2 pr-3">{isEn ? 'Last run' : 'Run terakhir'}</th>
                  <th className="py-2">{isEn ? 'Runs / 7 days' : 'Jalan / 7 hari'}</th>
                </tr>
              </thead>
              <tbody>
                {data.jobs.map((job) => (
                  <tr key={job.jobName} className="border-t border-tv-border align-top">
                    <td className="py-2 pr-3">
                      {job.page ? (
                        <Link href={job.page} className="font-semibold hover:underline">
                          {job.label}
                        </Link>
                      ) : (
                        <span className="font-semibold">{job.label}</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-tv-muted">{job.whatItRefreshes}</td>
                    <td className="py-2 pr-3 font-number">{job.usualWindow ?? (isEn ? 'no record' : 'belum ada riwayat')}</td>
                    <td className="py-2 pr-3">
                      <div className="font-number">{job.recorded ? formatWib(job.lastRunAt) : isEn ? 'no record' : 'belum ada riwayat'}</div>
                      <div className="text-xs">
                        <StatusBadge job={job} isEn={isEn} />
                      </div>
                    </td>
                    <td className="py-2 font-number">{job.recorded ? job.runsLast7Days : 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 flex items-start gap-1.5 text-xs leading-relaxed text-tv-muted">
            <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {isEn
              ? 'Hours are read from the task history itself, so a job that has never run shows no hour at all. Internal failure details are not published here; they stay in the admin panel.'
              : 'Jam dibaca dari riwayat tugas itu sendiri, jadi tugas yang belum pernah jalan tidak punya jam sama sekali. Rincian kegagalan internal tidak diterbitkan di sini; ada di panel admin.'}
          </p>
        </Card>

        {data.undocumentedJobs.length > 0 ? (
          <Card as="section" padding="none" radius="xl" elevation="none" highlight={false} overflow="visible" className="mt-6 border-tv-border p-5">
            <h2 className="flex items-center gap-2 font-heading text-lg font-bold">
              <HelpCircle className="h-4 w-4" /> {isEn ? 'Running but not described yet' : 'Sudah berjalan tetapi belum ada keterangannya'}
            </h2>
            <ul className="mt-2 space-y-1 text-sm text-tv-muted">
              {data.undocumentedJobs.map((job) => (
                <li key={job.jobName}>
                  • <span className="font-number text-tv-text">{job.jobName}</span> — {isEn ? 'last run' : 'run terakhir'}{' '}
                  <span className="font-number text-tv-text">{formatWib(job.lastRunAt)}</span>, {job.runsLast7Days}{' '}
                  {isEn ? 'runs in 7 days' : 'kali dalam 7 hari'}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-tv-muted">
              {isEn
                ? 'Listed as-is so nothing hidden runs silently behind the scenes.'
                : 'Ditampilkan apa adanya supaya tidak ada tugas yang berjalan diam-diam di belakang layar.'}
            </p>
          </Card>
        ) : null}

        <Card as="section" padding="none" radius="xl" elevation="none" highlight={false} overflow="visible" className="mt-6 border-tv-border p-5">
          <h2 className="flex items-center gap-2 font-heading text-lg font-bold">
            <ShieldAlert className="h-4 w-4" /> {isEn ? 'Suggested reading order' : 'Saran urutan membaca'}
          </h2>
          <p className="mt-1 text-xs text-tv-muted">
            {isEn
              ? 'This part is guidance, not measured data — it is our recommendation, not a reading.'
              : 'Bagian ini panduan, bukan data terukur — ini saran kami, bukan hasil pembacaan.'}
          </p>
          <ul className="mt-3 space-y-1 text-sm text-tv-muted">
            <li>
              • {isEn ? 'Before the session: ' : 'Sebelum sesi: '}
              <Link href="/calendar" className="hover:underline">Agenda korporasi</Link>
              {isEn ? ' and ' : ' dan '}
              <Link href="/market-pulse" className="hover:underline">Konteks pasar</Link>.
            </li>
            <li>
              • {isEn ? 'During the session: ' : 'Saat sesi: '}
              <Link href="/market-pulse" className="hover:underline">Denyut pasar</Link>
              {isEn ? ', then ' : ', lalu '}
              <Link href="/dashboard" className="hover:underline">bukti teknikal</Link>
              {isEn ? ' per emiten.' : ' per emiten.'}
            </li>
            <li>
              • {isEn ? 'After the close: ' : 'Setelah penutupan: '}
              <Link href="/cross-check" className="hover:underline">{isEn ? 'Double confirmation' : 'Konfirmasi Ganda'}</Link>
              {isEn ? ' to see which issuers independent sources agree on.' : ' untuk melihat emiten mana yang disepakati sumber berbeda.'}
            </li>
            <li>
              • {isEn ? 'Once real money is involved: ' : 'Kalau sudah melibatkan uang sungguhan: '}
              <Link href="/transparency" className="hover:underline">{isEn ? 'Transparency' : 'Transparansi'}</Link>
              {isEn ? ' first — check how far the score actually separates outcomes before trusting it.' : ' lebih dulu — cek sejauh mana skor benar-benar memisahkan hasil sebelum memercayainya.'}
            </li>
          </ul>
        </Card>
      </div>
    </main>
  );
}