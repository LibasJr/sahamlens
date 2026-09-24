import Link from 'next/link';
import { cookies } from 'next/headers';
import { ArrowLeft, Crosshair, Info, ShieldAlert } from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { getEntryScanData, type EntryScanResult } from '@/modules/confirmation/service/entry-scan.service';
import { LANG_COOKIE } from '@/shared/constants/cookie-names';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata = {
  title: 'Pemindai Harga Masuk — SahamLens',
  description:
    'Level masuk, Cutloss, dan sasaran yang dihitung langsung dari arsip harga SahamLens: penutupan terendah/tertinggi 20 sesi dan volatilitas penutupan-ke-penutupan.',
  alternates: { canonical: '/pemindai-harga' },
};

const NUMBER_FORMAT = 'id-ID';

function formatRupiah(value: number | null): string {
  if (value === null) return 'tidak tersedia';
  return value.toLocaleString(NUMBER_FORMAT, { maximumFractionDigits: 0 });
}

function formatPercent(value: number | null): string {
  if (value === null) return 'tidak tersedia';
  return `${value.toLocaleString(NUMBER_FORMAT, { maximumFractionDigits: 2 })}%`;
}

function formatRatio(value: number | null): string {
  if (value === null) return 'tidak dapat dihitung';
  return value.toLocaleString(NUMBER_FORMAT, { maximumFractionDigits: 2 });
}

export default async function EntryScanPage() {
  const data = await getEntryScanData();
  const isEn = (await cookies()).get(LANG_COOKIE)?.value === 'en';
  const shown = data.rows.slice(0, 80);

  return (
    <main className="min-h-screen bg-tv-bg p-4 text-tv-text sm:p-8">
      <div className="mx-auto max-w-6xl">
        <Link href="/" className="mb-4 inline-flex items-center gap-1.5 text-sm text-tv-muted hover:text-tv-text">
          <ArrowLeft className="h-4 w-4" /> {isEn ? 'Back' : 'Kembali'}
        </Link>

        <h1 className="flex items-center gap-2 font-heading text-2xl font-bold">
          <Crosshair className="h-6 w-6" /> {isEn ? 'Entry price scanner' : 'Pemindai Harga Masuk'}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-tv-muted">
          {isEn
            ? 'Three numbers per issuer, all computed from SahamLens\' own price archive: entry level, stop, and target. Nothing comes from an outside call, an analyst estimate, or a filled-in value.'
            : 'Tiga angka per emiten, semuanya dihitung dari arsip harga SahamLens sendiri: level masuk, Cutloss, dan sasaran. Tidak ada yang berasal dari panggilan luar, taksiran analis, atau nilai tambalan.'}
        </p>

        <Card as="section" padding="none" radius="xl" elevation="none" highlight={false} overflow="visible" className="mb-6 mt-4 border-tv-border p-5">
          <h2 className="flex items-center gap-2 font-heading text-lg font-bold">
            <Info className="h-4 w-4" /> {isEn ? 'How the numbers are made' : 'Cara angka ini dibuat'}
          </h2>
          <ul className="mt-2 space-y-1 text-sm text-tv-muted">
            <li>
              • {isEn ? 'Session date' : 'Tanggal sesi'}: <span className="font-number text-tv-text">{data.date ?? 'tidak tersedia'}</span> ·{' '}
              {isEn ? 'issuers with enough history' : 'emiten dengan riwayat cukup'}:{' '}
              <span className="font-number text-tv-text">{data.rows.length + data.belowLiquidityFloor.length}</span> /{' '}
              <span className="font-number text-tv-text">{data.totalTickers}</span>
            </li>
            <li>
              • {isEn ? 'Liquidity floor' : 'Ambang likuiditas'}: {isEn ? 'average 20-day traded value at least' : 'rata-rata nilai transaksi 20 hari minimal'}{' '}
              <span className="font-number text-tv-text">
                Rp {data.options.minimumAvgTradedValue20d.toLocaleString(NUMBER_FORMAT, { maximumFractionDigits: 0 })}
              </span>
              {' — '}
              {isEn
                ? `${data.belowLiquidityFloor.length} issuers fall below it and are listed separately, not hidden.`
                : `${data.belowLiquidityFloor.length} emiten di bawah ambang ini dan didaftarkan terpisah, bukan disembunyikan.`}
            </li>
            <li>
              • {isEn ? 'Entry level' : 'Level masuk'} = {isEn ? 'lowest close of the last' : 'penutupan terendah'} {data.options.levelWindow}{' '}
              {isEn ? 'sessions' : 'sesi terakhir'} · {isEn ? 'target' : 'sasaran'} = {isEn ? 'highest close of the same window' : 'penutupan tertinggi jendela yang sama'}
            </li>
            <li>
              • {isEn ? 'Cut loss' : 'Cutloss'} = {isEn ? 'entry level minus' : 'level masuk dikurangi'} {data.options.stopVolatilityMultiple}{' '}
              {isEn ? '× daily volatility' : '× volatilitas harian'}
            </li>
            <li>
              • {isEn ? 'Volatility here is close-to-close (log returns over' : 'Volatilitas di sini penutupan-ke-penutupan (imbal hasil logaritma'} {data.options.volatilityWindow}{' '}
              {isEn ? 'sessions), not intraday ATR — the archive does not store high/low.' : 'sesi), bukan ATR intraday — arsip tidak menyimpan high/low.'}
            </li>
            <li>
              • {isEn ? 'Issuers with fewer than' : 'Emiten dengan riwayat kurang dari'} {data.options.minimumSessions} {isEn ? 'sessions are listed separately, not filled in.' : 'sesi didaftarkan terpisah, bukan ditambal.'}
            </li>
          </ul>
        </Card>

        <Card as="section" padding="none" radius="xl" elevation="none" highlight={false} overflow="visible" className="border-tv-border p-5">
          {shown.length === 0 ? (
            <p className="text-sm text-tv-muted">
              {isEn
                ? 'No issuer currently has enough archived sessions to compute levels. The page stays empty rather than showing sample rows.'
                : 'Belum ada emiten dengan riwayat sesi yang cukup untuk menghitung level. Halaman ini dibiarkan kosong daripada menampilkan baris contoh.'}
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-tv-muted">
                    <tr>
                      <th className="py-2 pr-3">{isEn ? 'Ticker' : 'Emiten'}</th>
                      <th className="py-2 pr-3">{isEn ? 'Last close' : 'Penutupan akhir'}</th>
                      <th className="py-2 pr-3">{isEn ? 'Entry' : 'Masuk'}</th>
                      <th className="py-2 pr-3">{isEn ? 'Cut loss' : 'Cutloss'}</th>
                      <th className="py-2 pr-3">{isEn ? 'Target' : 'Sasaran'}</th>
                      <th className="py-2 pr-3">{isEn ? 'Risk/reward' : 'Risiko/imbal'}</th>
                      <th className="py-2 pr-3">{isEn ? 'Daily volatility' : 'Volatilitas harian'}</th>
                      <th className="py-2">{isEn ? 'Sessions' : 'Sesi'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((row: EntryScanResult) => (
                      <tr key={row.ticker} className="border-t border-tv-border">
                        <td className="py-2 pr-3 font-semibold font-number">{row.ticker}</td>
                        <td className="py-2 pr-3 font-number">{formatRupiah(row.lastClose)}</td>
                        <td className="py-2 pr-3 font-number">{formatRupiah(row.entry)}</td>
                        <td className="py-2 pr-3 font-number">{formatRupiah(row.stop)}</td>
                        <td className="py-2 pr-3 font-number">{formatRupiah(row.target)}</td>
                        <td className="py-2 pr-3 font-number">{formatRatio(row.riskReward)}</td>
                        <td className="py-2 pr-3 font-number">{formatPercent(row.volatilityPct)}</td>
                        <td className="py-2 font-number">{row.sessions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-4 text-xs text-tv-muted">
                {isEn
                  ? `Showing ${shown.length} of ${data.rows.length} issuers with a computable ratio, largest first.`
                  : `Menampilkan ${shown.length} dari ${data.rows.length} emiten yang rasionya dapat dihitung, terbesar lebih dulu.`}
              </p>
            </>
          )}
        </Card>

        {data.insufficient.length > 0 ? (
          <Card as="section" padding="none" radius="xl" elevation="none" highlight={false} overflow="visible" className="mt-6 border-tv-border p-5">
            <h2 className="flex items-center gap-2 font-heading text-lg font-bold">
              <ShieldAlert className="h-4 w-4" /> {isEn ? 'Ratio cannot be computed' : 'Rasio tidak dapat dihitung'} ({data.insufficient.length})
            </h2>
            <p className="mt-1 text-xs text-tv-muted">
              {isEn
                ? 'Shown so you know it is missing, not skipped.'
                : 'Ditampilkan supaya jelas ada yang belum bisa dihitung, bukan dilewati diam-diam.'}{' '}
              {isEn
                ? `History too short: ${data.insufficient.length - data.belowLiquidityFloor.length} · below liquidity floor: ${data.belowLiquidityFloor.length}.`
                : `Riwayat kurang: ${data.insufficient.length - data.belowLiquidityFloor.length} · di bawah ambang likuiditas: ${data.belowLiquidityFloor.length}.`}
            </p>
            <ul className="mt-3 space-y-1 text-sm text-tv-muted">
              {data.insufficient.slice(0, 25).map((row) => (
                <li key={row.ticker}>
                  • <span className="font-number text-tv-text">{row.ticker}</span> — {row.note}
                </li>
              ))}
            </ul>
            {data.insufficient.length > 25 ? (
              <p className="mt-2 text-xs text-tv-muted">
                …{isEn ? 'and' : 'dan'} {data.insufficient.length - 25} {isEn ? 'more.' : 'emiten lain.'}
              </p>
            ) : null}
          </Card>
        ) : null}

        <Card as="section" padding="none" radius="xl" elevation="none" highlight={false} overflow="visible" className="mt-6 border-tv-border p-5">
          <h2 className="flex items-center gap-2 font-heading text-lg font-bold">
            <ShieldAlert className="h-4 w-4" /> {isEn ? 'What this is not' : 'Yang bukan'}
          </h2>
          <ul className="mt-3 space-y-1 text-sm text-tv-muted">
            <li>
              • {isEn
                ? 'Not a recommendation. A tidy risk/reward ratio only means the three archived numbers line up — it says nothing about which way the price will go, and our own validity page shows the score separates outcomes weakly.'
                : 'Bukan rekomendasi. Rasio risiko/imbal yang rapi hanya berarti tiga angka arsip itu tersusun logis — ia tidak menyatakan arah harga akan ke mana, dan halaman transparansi kami sendiri menunjukkan skor memisahkan hasil dengan lemah.'}
            </li>
            <li>
              • {isEn
                ? 'Levels are recalculated from closes alone; there is no intraday high/low in the archive, so ATR-based stops cannot be produced honestly.'
                : 'Level dihitung hanya dari penutupan; arsip tidak punya high/low intraday, jadi Cutloss berbasis ATR tidak bisa diproduksi secara jujur.'}
            </li>
          </ul>
        </Card>
      </div>
    </main>
  );
}