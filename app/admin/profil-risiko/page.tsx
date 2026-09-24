import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Activity, ArrowLeft, Gauge, Info, ShieldAlert, TrendingUp } from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { getRiskProfileData, type RiskProfileRow } from '@/modules/risk-profile/service/risk-profile.service';
import {
  RISK_FACTOR_BENCHMARK,
  RISK_FACTOR_CAVEATS,
  RISK_FACTOR_EVIDENCE,
  RISK_FACTOR_SAMPLE,
  RISK_PROFILE_COMPOSITE_FACTORS,
} from '@/modules/risk-profile/constants/risk-factor-evidence';
import { isAdminServer } from '@/modules/user';
import { LANG_COOKIE } from '@/shared/constants/cookie-names';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata = {
  robots: { index: false, follow: false },
  title: 'Profil Risiko & Tren — Admin SahamLens',
  description:
    'Peringkat emiten likuid menurut ciri yang terbukti pada arsip harga SahamLens: volatilitas 60 sesi dan jarak dari puncak 52 minggu. Bukan ramalan arah harga.',
  alternates: { canonical: '/admin/profil-risiko' },
};

const NUMBER_FORMAT = 'id-ID';

function formatNumber(value: number | null, digits = 2): string {
  if (value === null || value === undefined) return 'tidak tersedia';
  return value.toLocaleString(NUMBER_FORMAT, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function formatPercent(value: number | null, digits = 2): string {
  if (value === null || value === undefined) return 'tidak tersedia';
  return `${formatNumber(value, digits)}%`;
}

function formatIdr(value: number | null): string {
  if (value === null || value === undefined) return 'tidak tersedia';
  return value.toLocaleString(NUMBER_FORMAT, { maximumFractionDigits: 0 });
}

function factorById(id: string) {
  return RISK_FACTOR_EVIDENCE.find((entry) => entry.id === id) ?? null;
}

export default async function RiskProfilePage() {
  if (!(await isAdminServer())) redirect('/admin-login');

  const data = await getRiskProfileData();
  const isEn = (await cookies()).get(LANG_COOKIE)?.value === 'en';
  const composite = RISK_PROFILE_COMPOSITE_FACTORS.map((id) => factorById(id)).filter(
    (entry): entry is NonNullable<ReturnType<typeof factorById>> => entry !== null
  );

  return (
    <main className="min-h-screen bg-tv-bg p-4 text-tv-text sm:p-8">
      <div className="mx-auto max-w-6xl">
        <Link href="/admin" className="mb-4 inline-flex items-center gap-1.5 text-sm text-tv-muted hover:text-tv-text">
          <ArrowLeft className="h-4 w-4" /> {isEn ? 'Back to Admin' : 'Kembali ke Admin'}
        </Link>

        <h1 className="flex items-center gap-2 font-heading text-2xl font-bold">
          <Gauge className="h-6 w-6" /> {isEn ? 'Risk & trend profile' : 'Profil Risiko & Tren'}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-tv-muted">
          {isEn
            ? 'Ranking of liquid issuers by two traits that held up out-of-sample on our own price archive: low 60-session volatility and closeness to the 52-week high. Both are computed from closing prices only. This is not a price forecast and not a buy/sell recommendation.'
            : 'Peringkat emiten likuid menurut dua ciri yang bertahan di luar sampel pada arsip harga kami sendiri: volatilitas 60 sesi yang rendah dan kedekatan ke puncak 52 minggu. Keduanya dihitung dari harga penutupan saja. Ini bukan ramalan arah harga dan bukan rekomendasi beli/jual.'}
        </p>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-4">
            <div className="lens-meta uppercase text-tv-muted">{isEn ? 'Last session' : 'Sesi terakhir'}</div>
            <div className="mt-1 font-heading text-xl font-bold">{data.lastSession ?? 'tidak tersedia'}</div>
          </Card>
          <Card className="p-4">
            <div className="lens-meta uppercase text-tv-muted">{isEn ? 'Rated issuers' : 'Emiten diperingkat'}</div>
            <div className="mt-1 font-heading text-xl font-bold">{data.eligible.toLocaleString(NUMBER_FORMAT)}</div>
          </Card>
          <Card className="p-4">
            <div className="lens-meta uppercase text-tv-muted">{isEn ? 'Below liquidity threshold' : 'Di bawah ambang likuiditas'}</div>
            <div className="mt-1 font-heading text-xl font-bold">{data.belowLiquidity.toLocaleString(NUMBER_FORMAT)}</div>
          </Card>
          <Card className="p-4">
            <div className="lens-meta uppercase text-tv-muted">{isEn ? 'History too short' : 'Riwayat belum cukup'}</div>
            <div className="mt-1 font-heading text-xl font-bold">{data.insufficient.toLocaleString(NUMBER_FORMAT)}</div>
          </Card>
        </div>

        <Card className="mt-6 overflow-hidden">
          <div className="border-b border-tv-border p-4">
            <h2 className="flex items-center gap-2 font-heading text-lg font-bold">
              <TrendingUp className="h-5 w-5" />{' '}
              {isEn ? 'Top 80 by combined percentile' : '80 teratas menurut peringkat gabungan'}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-tv-muted">
              {isEn
                ? 'Percentile 100 means the best of the rated issuers for that trait (quietest / closest to its 52-week high). Missing values are stated as unavailable, never filled in.'
                : 'Persentil 100 berarti paling baik di antara emiten yang diperingkat untuk ciri itu (paling tenang / paling dekat puncak 52 minggu). Nilai yang tidak ada ditulis apa adanya, tidak pernah ditambal.'}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-tv-hover text-left lens-meta uppercase text-tv-muted">
                <tr>
                  <th className="px-4 py-2">{isEn ? 'Ticker' : 'Emiten'}</th>
                  <th className="px-4 py-2">{isEn ? 'Close' : 'Penutupan'}</th>
                  <th className="px-4 py-2">{isEn ? 'Vol 60 sessions' : 'Volatilitas 60 sesi'}</th>
                  <th className="px-4 py-2">{isEn ? 'Vol 20 sessions' : 'Volatilitas 20 sesi'}</th>
                  <th className="px-4 py-2">{isEn ? 'From 52w high' : 'Jarak dari puncak 52m'}</th>
                  <th className="px-4 py-2">{isEn ? 'Peak daily 20' : 'Puncak harian 20'}</th>
                  <th className="px-4 py-2">{isEn ? 'Traded value 20d' : 'Nilai transaksi 20h'}</th>
                  <th className="px-4 py-2">{isEn ? 'Pct vol' : 'Pst volatilitas'}</th>
                  <th className="px-4 py-2">{isEn ? 'Pct near high' : 'Pst kedekatan'}</th>
                  <th className="px-4 py-2">{isEn ? 'Combined' : 'Gabungan'}</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row: RiskProfileRow) => (
                  <tr key={row.ticker} className="border-t border-tv-border/60 hover:bg-tv-hover/50">
                    <td className="px-4 py-2 font-medium">{row.ticker.replace('.JK', '')}</td>
                    <td className="px-4 py-2">{formatNumber(row.close, 0)}</td>
                    <td className="px-4 py-2">{formatPercent(row.volatility60Pct)}</td>
                    <td className="px-4 py-2">{formatPercent(row.volatility20Pct)}</td>
                    <td className="px-4 py-2">{formatPercent(row.distanceFromHigh52wPct)}</td>
                    <td className="px-4 py-2">{formatPercent(row.maxDailyReturn20Pct)}</td>
                    <td className="px-4 py-2">{formatIdr(row.avgTradedValue20d)}</td>
                    <td className="px-4 py-2">{row.percentileVolatility ?? 'tidak tersedia'}</td>
                    <td className="px-4 py-2">{row.percentileProximity ?? 'tidak tersedia'}</td>
                    <td className="px-4 py-2 font-semibold">{row.compositePercentile ?? 'tidak tersedia'}</td>
                  </tr>
                ))}
                {data.rows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-6 text-center text-tv-muted">
                      {isEn
                        ? 'No issuer passed the thresholds for the latest session.'
                        : 'Tidak ada emiten yang lolos ambang pada sesi terakhir.'}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="mt-6 p-5">
          <h2 className="flex items-center gap-2 font-heading text-lg font-bold">
            <Activity className="h-5 w-5" /> {isEn ? 'Why these two traits' : 'Mengapa dua ciri ini'}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-tv-muted">
            {isEn
              ? `Measured across the archive (${RISK_FACTOR_SAMPLE.archiveStart} → ${RISK_FACTOR_SAMPLE.archiveEnd}, ${RISK_FACTOR_SAMPLE.tickers} issuers with enough history, ${RISK_FACTOR_SAMPLE.observations.toLocaleString(NUMBER_FORMAT)} observations), 20-session forward returns, train before ${RISK_FACTOR_SAMPLE.oosStart} and out-of-sample after, portfolio costs of ${(RISK_FACTOR_SAMPLE.roundTripCost * 100).toFixed(2)}% per trade included. Only traits positive in both windows were used.`
              : `Diukur pada seluruh arsip (${RISK_FACTOR_SAMPLE.archiveStart} → ${RISK_FACTOR_SAMPLE.archiveEnd}, ${RISK_FACTOR_SAMPLE.tickers} emiten beriwayat cukup, ${RISK_FACTOR_SAMPLE.observations.toLocaleString(NUMBER_FORMAT)} observasi), imbal hasil 20 sesi ke depan, train sebelum ${RISK_FACTOR_SAMPLE.oosStart} dan luar sampel sesudahnya, sudah termasuk biaya portofolio ${(RISK_FACTOR_SAMPLE.roundTripCost * 100).toFixed(2)}% per transaksi. Hanya ciri yang positif di kedua jendela yang dipakai.`}
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left lens-meta uppercase text-tv-muted">
                <tr>
                  <th className="py-2 pr-4">{isEn ? 'Trait' : 'Ciri'}</th>
                  <th className="py-2 pr-4">IC train</th>
                  <th className="py-2 pr-4">IC {isEn ? 'out-of-sample' : 'luar sampel'}</th>
                  <th className="py-2 pr-4">t</th>
                  <th className="py-2 pr-4">{isEn ? 'Positive dates' : 'Tanggal positif'}</th>
                  <th className="py-2 pr-4">{isEn ? 'Top−bottom decile' : 'Desil atas−bawah'}</th>
                  <th className="py-2 pr-4">{isEn ? 'Portfolio net / 20 sessions' : 'Portofolio netto / 20 sesi'}</th>
                  <th className="py-2 pr-4">{isEn ? 'Max drawdown' : 'Drawdown maks'}</th>
                  <th className="py-2">{isEn ? 'Used here' : 'Dipakai di sini'}</th>
                </tr>
              </thead>
              <tbody>
                {RISK_FACTOR_EVIDENCE.map((factor) => {
                  const used = (RISK_PROFILE_COMPOSITE_FACTORS as readonly string[]).includes(factor.id);
                  return (
                    <tr key={factor.id} className="border-t border-tv-border/60">
                      <td className="py-2 pr-4">{factor.label}</td>
                      <td className="py-2 pr-4">{formatNumber(factor.icTrain, 4)}</td>
                      <td className="py-2 pr-4">{formatNumber(factor.icOos, 4)}</td>
                      <td className="py-2 pr-4">{formatNumber(factor.tOos, 2)}</td>
                      <td className="py-2 pr-4">{formatPercent(factor.positiveDateShareOos, 1)}</td>
                      <td className="py-2 pr-4">{formatPercent(factor.decileSpread * 100, 2)}</td>
                      <td className="py-2 pr-4">{formatPercent(factor.portfolioNetMean * 100, 2)}</td>
                      <td className="py-2 pr-4">{formatPercent(factor.portfolioMaxDrawdown * 100, 1)}</td>
                      <td className="py-2">{used ? (isEn ? 'yes' : 'ya') : '—'}</td>
                    </tr>
                  );
                })}
                <tr className="border-t border-tv-border/60 text-tv-muted">
                  <td className="py-2 pr-4">{isEn ? 'Benchmark (all liquid issuers, equal weight)' : 'Patokan (semua emiten likuid, timbang sama)'}</td>
                  <td className="py-2 pr-4">—</td>
                  <td className="py-2 pr-4">—</td>
                  <td className="py-2 pr-4">—</td>
                  <td className="py-2 pr-4">—</td>
                  <td className="py-2 pr-4">—</td>
                  <td className="py-2 pr-4">{formatPercent(RISK_FACTOR_BENCHMARK.mean * 100, 2)}</td>
                  <td className="py-2 pr-4">{formatPercent(RISK_FACTOR_BENCHMARK.maxDrawdown * 100, 1)}</td>
                  <td className="py-2">—</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-tv-muted">
            {isEn
              ? `Combined percentile = average of ${composite.map((entry) => entry.label).join(' and ')}.`
              : `Peringkat gabungan = rata-rata dari ${composite.map((entry) => entry.label).join(' dan ')}.`}{' '}
            {isEn
              ? 'Traits whose evidence flipped out-of-sample (momentum, liquidity) and the production score components are deliberately not used.'
              : 'Ciri yang buktinya berbalik di luar sampel (momentum, likuiditas) dan komponen skor produksi sengaja tidak dipakai.'}
          </p>
        </Card>

        <Card className="mt-6 border-amber-500/40 bg-amber-500/5 p-5">
          <h2 className="flex items-center gap-2 font-heading text-lg font-bold text-amber-300">
            <ShieldAlert className="h-5 w-5" /> {isEn ? 'Limits, stated openly' : 'Batas yang dinyatakan terbuka'}
          </h2>
          <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-tv-muted">
            {RISK_FACTOR_CAVEATS.map((caveat) => (
              <li key={caveat} className="flex gap-2">
                <span>•</span>
                <span>{caveat}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex items-start gap-2 text-xs text-tv-muted">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {isEn
                ? 'Full measurement report: docs/factor-research/factor-scan-2026-09-24.md. Re-runnable with `npm run factor:scan`.'
                : 'Laporan pengukuran lengkap: docs/factor-research/factor-scan-2026-09-24.md. Bisa dijalankan ulang dengan `npm run factor:scan`.'}
            </span>
          </p>
        </Card>
      </div>
    </main>
  );
}