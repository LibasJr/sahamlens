import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ArrowLeft, Info, Link2, ShieldAlert } from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { getCrossCheckData, type CrossCheckRow, type CrossCheckSignal } from '@/modules/confirmation/service/cross-check.service';
import { isAdminServer } from '@/modules/user';
import { LANG_COOKIE } from '@/shared/constants/cookie-names';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata = {
  robots: { index: false, follow: false },
  title: 'Konfirmasi Ganda — Admin SahamLens',
  description:
    'Tabel silang sinyal SahamLens per emiten: skor, rekomendasi, kepemilikan asing, dan likuiditas, dengan sumber dan status ketersediaan apa adanya.',
  alternates: { canonical: '/admin/konfirmasi-ganda' },
};

function formatValue(signal: CrossCheckSignal, isEn: boolean): string {
  if (signal.value === null) return isEn ? 'not available' : 'tidak tersedia';
  if (typeof signal.value === 'string') return signal.value;
  if (signal.unit === '% asing') return `${signal.value.toLocaleString(isEn ? 'en-US' : 'id-ID')}%`;
  if (signal.unit === 'rupiah/hari') {
    const inBillions = signal.value / 1_000_000_000;
    return isEn ? `Rp ${inBillions.toFixed(2)} bn/day` : `Rp ${inBillions.toFixed(2)} M/hari`;
  }
  return signal.value.toLocaleString(isEn ? 'en-US' : 'id-ID');
}

function StatusText({ signal, isEn }: { signal: CrossCheckSignal; isEn: boolean }) {
  if (signal.status === 'CONFIRMED') {
    return <span className="font-semibold text-emerald-400">{isEn ? 'confirmed' : 'terkonfirmasi'}</span>;
  }
  if (signal.status === 'NOT_CONFIRMED') {
    return <span className="text-tv-muted">{isEn ? 'not confirmed' : 'tidak terkonfirmasi'}</span>;
  }
  return <span className="text-amber-400">{isEn ? 'not available' : 'tidak tersedia'}</span>;
}

function Row({ row, isEn }: { row: CrossCheckRow; isEn: boolean }) {
  return (
    <tr className="border-t border-tv-border align-top">
      <td className="py-2 pr-3 font-number font-semibold">{row.ticker}</td>
      {row.signals.map((signal) => (
        <td key={signal.key} className="py-2 pr-3">
          <div className="font-number">{formatValue(signal, isEn)}</div>
          <div className="text-xs">
            <StatusText signal={signal} isEn={isEn} />
          </div>
        </td>
      ))}
      <td className="py-2 font-number font-semibold">
        {row.confirmations}/{row.signalsAvailable}
      </td>
    </tr>
  );
}

export default async function CrossCheckPage() {
  if (!(await isAdminServer())) redirect('/admin-login');

  const data = await getCrossCheckData();
  const isEn = (await cookies()).get(LANG_COOKIE)?.value === 'en';
  const signalKeys = data.rows[0]?.signals.map((signal) => signal.key) ?? [
    'lensScore',
    'recommendation',
    'foreignOwnership',
    'liquidity',
  ];
  const headers: Record<string, string> = {
    lensScore: isEn ? 'LensScore' : 'Skor Lens',
    recommendation: isEn ? 'Recommendation' : 'Rekomendasi',
    foreignOwnership: isEn ? 'Foreign ownership' : 'Kepemilikan asing',
    liquidity: isEn ? '20-day liquidity' : 'Likuiditas 20 hari',
  };

  return (
    <main className="min-h-screen bg-tv-bg p-4 text-tv-text sm:p-8">
      <div className="mx-auto max-w-6xl">
        <Link href="/admin" className="mb-4 inline-flex items-center gap-1.5 text-sm text-tv-muted hover:text-tv-text">
          <ArrowLeft className="h-4 w-4" /> {isEn ? 'Back to Admin' : 'Kembali ke Admin'}
        </Link>

        <h1 className="flex items-center gap-2 font-heading text-2xl font-bold">
          <Link2 className="h-6 w-6" /> {isEn ? 'Double confirmation' : 'Konfirmasi Ganda'}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-tv-muted">
          {isEn
            ? 'One signal is one point of view. Two independent signals naming the same issuer mean more than one signal naming it very confidently. Every column below is a direct reading of an existing SahamLens source — no new scoring, no estimates, no filled-in numbers.'
            : 'Satu sinyal hanya satu sudut pandang. Dua sinyal berbeda yang menunjuk emiten sama jauh lebih berarti daripada satu sinyal yang menunjuknya dengan sangat meyakinkan. Setiap kolom di bawah adalah pembacaan langsung sumber yang sudah ada di SahamLens — tidak ada skor baru, tidak ada taksiran, tidak ada angka yang ditambal.'}
        </p>

        <Card as="section" padding="none" radius="xl" elevation="none" highlight={false} overflow="visible" className="mb-6 mt-4 border-tv-border p-5">
          <h2 className="flex items-center gap-2 font-heading text-lg font-bold">
            <Info className="h-4 w-4" /> {isEn ? 'Session and coverage' : 'Sesi dan cakupan'}
          </h2>
          <ul className="mt-2 space-y-1 text-sm text-tv-muted">
            <li>
              • {isEn ? 'Session date' : 'Tanggal sesi'}: <span className="font-number text-tv-text">{data.date ?? (isEn ? 'not available' : 'tidak tersedia')}</span>
              {data.scoreVersion ? (
                <>
                  {' '}
                  ({isEn ? 'score version' : 'versi skor'} <span className="font-number text-tv-text">{data.scoreVersion}</span>)
                </>
              ) : null}
            </li>
            <li>
              • {isEn ? 'Issuers in the table' : 'Emiten dalam tabel'}: <span className="font-number text-tv-text">{data.coveredTickers}</span>
            </li>
            <li>
              • {isEn ? 'Thresholds in use' : 'Ambang yang dipakai'}: {isEn ? 'LensScore ≥ ' : 'Skor Lens ≥ '}
              <span className="font-number text-tv-text">{data.thresholds.lensScore}</span>, {isEn ? '20-day traded value ≥ Rp ' : 'nilai transaksi 20 hari ≥ Rp '}
              <span className="font-number text-tv-text">{data.thresholds.advValue20d.toLocaleString(isEn ? 'en-US' : 'id-ID')}</span>
            </li>
            {data.coverageNotes.map((note) => (
              <li key={note}>• {note}</li>
            ))}
          </ul>
        </Card>

        {data.rows.length === 0 ? (
          <Card as="section" padding="none" radius="xl" elevation="none" highlight={false} overflow="visible" className="border-tv-border p-5">
            <h2 className="flex items-center gap-2 font-heading text-lg font-bold">
              <ShieldAlert className="h-4 w-4" /> {isEn ? 'Nothing to cross-check yet' : 'Belum ada yang bisa disilangkan'}
            </h2>
            <p className="mt-2 text-sm text-tv-muted">
              {isEn
                ? 'The score archive has no session yet, so there is nothing to compare. This page stays empty rather than showing example numbers.'
                : 'Arsip skor belum punya sesi, jadi belum ada yang bisa dibandingkan. Halaman ini dibiarkan kosong daripada menampilkan angka contoh.'}
            </p>
          </Card>
        ) : (
          <Card as="section" padding="none" radius="xl" elevation="none" highlight={false} overflow="visible" className="border-tv-border p-5">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-tv-muted">
                  <tr>
                    <th className="py-2 pr-3">{isEn ? 'Ticker' : 'Emiten'}</th>
                    {signalKeys.map((key) => (
                      <th key={key} className="py-2 pr-3">
                        {headers[key] ?? key}
                      </th>
                    ))}
                    <th className="py-2">{isEn ? 'Confirmations' : 'Konfirmasi'}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <Row key={row.ticker} row={row} isEn={isEn} />
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-tv-muted">
              {isEn
                ? 'Value shown is the raw reading. A cell marked "not available" means the source has no row for that issuer — it is never replaced by zero or an estimate. Confirmations count only cells marked "confirmed".'
                : 'Nilai yang tampil adalah angka mentah dari sumbernya. Sel bertanda "tidak tersedia" berarti sumbernya tidak punya baris untuk emiten itu — tidak pernah diganti nol atau taksiran. Kolom konfirmasi hanya menghitung sel bertanda "terkonfirmasi".'}
            </p>
          </Card>
        )}

        <Card as="section" padding="none" radius="xl" elevation="none" highlight={false} overflow="visible" className="mt-6 border-tv-border p-5">
          <h2 className="flex items-center gap-2 font-heading text-lg font-bold">
            <ShieldAlert className="h-4 w-4" /> {isEn ? 'Known limitations' : 'Batasan yang diketahui'}
          </h2>
          <ul className="mt-3 space-y-1 text-sm text-tv-muted">
            <li>
              • {isEn
                ? 'This table does not produce a new score or a buy/sell verdict; it only shows where independent sources agree.'
                : 'Tabel ini tidak menghasilkan skor baru atau vonis beli/jual; ia hanya menunjukkan di mana sumber-sumber yang berbeda sepakat.'}
            </li>
            <li>
              • {isEn
                ? 'Recommendation scans cover only recent sessions. Older sessions show "not available" for that column.'
                : 'Pemindaian rekomendasi hanya mencakup sesi-sesi terakhir. Sesi lama akan menampilkan "tidak tersedia" pada kolom itu.'}
            </li>
            <li>
              • {isEn
                ? 'Ownership data is periodic (KSEI report), so its change is measured between reports, not between sessions.'
                : 'Data kepemilikan bersifat berkala (laporan KSEI), jadi perubahannya diukur antar-laporan, bukan antar-sesi.'}
            </li>
            <li>
              • {isEn
                ? 'UMA/suspension status is not shown here: its real-time source is only available in the admin ARA gate.'
                : 'Status UMA/suspensi tidak ditampilkan di sini: sumber real-time-nya hanya tersedia di gerbang admin ARA.'}
            </li>
          </ul>
        </Card>
      </div>
    </main>
  );
}