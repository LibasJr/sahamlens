import Link from 'next/link';
import { ArrowLeft, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { getPublicTransparencyData } from '@/modules/lens-radar/service/transparency.service';
import { cookies } from 'next/headers';
import { LANG_COOKIE } from '@/shared/constants/cookie-names';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata = {
  title: 'Transparansi Model SahamLens',
  description: 'Metodologi, status validasi, sumber data, dan batasan LensRadar/LensScore.',
  alternates: { canonical: '/transparency' },
};

function fmt(value: number | null | undefined, suffix = '', isEn = false) {
  if (value == null || !Number.isFinite(value)) return isEn ? 'not available' : 'belum ada';
  return `${value.toLocaleString(isEn ? 'en-US' : 'id-ID')}${suffix}`;
}

export default async function PublicTransparencyPage() {
  const data = await getPublicTransparencyData();
  const isEn = (await cookies()).get(LANG_COOKIE)?.value === 'en';
  const isValidated = data.modelStatus === 'VALIDATED_OUT_OF_SAMPLE';
  const StatusIcon = isValidated ? CheckCircle2 : AlertTriangle;

  return (
    <main className="min-h-screen bg-tv-bg p-4 text-tv-text sm:p-8">
      <div className="mx-auto max-w-5xl">
        <Link href="/" className="mb-4 inline-flex items-center gap-1.5 text-sm text-tv-muted hover:text-tv-text">
          <ArrowLeft className="h-4 w-4" /> {isEn ? 'Back' : 'Kembali'}
        </Link>

        <section className="mb-8">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-tv-accent">Public model transparency</p>
          <h1 className="lens-page-title">{isEn ? 'SahamLens Model Transparency' : 'Transparansi Model SahamLens'}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-tv-muted">
            {isEn ? 'This page explains how LensRadar and LensScore are calculated, their validation status, return basis, data as-of date, and limitations that are safe to disclose publicly. Raw samples, anomalies, row-level calibration, and operator diagnostics remain in the admin panel.' : 'Halaman ini menjelaskan cara LensRadar/LensScore dihitung, status validasi, basis return, data as-of, dan batasan yang aman dibuka publik. Detail raw sample, anomali, kalibrasi baris, dan diagnostik operator tetap di panel admin.'}
          </p>
        </section>

        <Card as="section" padding="none" radius="xl" elevation="none" highlight={false} overflow="visible" className="mb-6 border-tv-yellow/40 bg-tv-yellow/10 p-5">
          <div className="flex gap-3">
            <StatusIcon className="mt-0.5 h-5 w-5 shrink-0 text-tv-yellow" />
            <div>
              <h2 className="font-semibold text-tv-text">Status: {data.modelStatus}</h2>
              <p className="mt-1 text-sm leading-relaxed text-tv-muted">{isEn ? (isValidated ? 'The model has passed the configured out-of-sample validation requirements.' : 'The model remains research-only until sample and out-of-sample requirements are met.') : data.validation.message}</p>
              <p className="mt-2 text-xs text-tv-muted">{isEn ? 'SahamLens is a research tool. Model outputs are non-actionable and are not investment advice.' : 'SahamLens adalah alat riset. Output model non-actionable dan bukan nasihat investasi.'}</p>
            </div>
          </div>
        </Card>

        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card as="div" padding="none" radius="xl" elevation="none" highlight={false} overflow="visible" className="border-tv-border p-4">
            <div className="text-xs uppercase text-tv-muted">As-of</div>
            <div className="mt-1 font-number text-xl font-bold">{data.asOfDate}</div>
          </Card>
          <Card as="div" padding="none" radius="xl" elevation="none" highlight={false} overflow="visible" className="border-tv-border p-4">
            <div className="text-xs uppercase text-tv-muted">{isEn ? 'Validation days' : 'Hari validasi'}</div>
            <div className="mt-1 font-number text-xl font-bold">{fmt(data.validation.validationDays, '', isEn)}</div>
          </Card>
          <Card as="div" padding="none" radius="xl" elevation="none" highlight={false} overflow="visible" className="border-tv-border p-4">
            <div className="text-xs uppercase text-tv-muted">{isEn ? 'Raw T+20 samples' : 'Sampel T+20 mentah'}</div>
            <div className="mt-1 font-number text-xl font-bold">{fmt(data.validation.totalSamples, '', isEn)}</div>
          </Card>
          <Card as="div" padding="none" radius="xl" elevation="none" highlight={false} overflow="visible" className="border-tv-border p-4">
            <div className="text-xs uppercase text-tv-muted">OOS validation</div>
            <div className="mt-1 font-number text-xl font-bold">{data.validation.outOfSampleStatus}</div>
          </Card>
        </div>

        <Card as="section" padding="none" radius="xl" elevation="none" highlight={false} overflow="visible" className="mb-6 border-tv-border p-5">
          <h2 className="font-heading text-lg font-bold">{isEn ? 'Methodology and return basis' : 'Metodologi dan basis return'}</h2>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-tv-muted">
            {(isEn ? ['LensScore is frozen by model version and configuration hash before forward results are calculated.', 'Validation uses point-in-time data and only includes signals that pass model-version, price-basis, liquidity, coverage, and eligibility checks.', 'High-score buckets are compared with lower-score buckets using decorrelated T+20 samples.', 'Issuer counts are reported in layers: the official IDX catalog, names in the score archive, and names that pass the validation gate.', 'Public status remains research-only until sample-size and out-of-sample requirements are met.'] : data.methodology).map((item) => <li key={item}>• {item}</li>)}
          </ul>
          <p className="mt-3 rounded-lg border border-tv-border bg-tv-card p-3 text-xs text-tv-muted">
            Return basis: {data.validation.returnBasis}
          </p>
          <Card as="div" padding="none" radius="lg" elevation="none" highlight={false} overflow="visible" className="mt-3 border-tv-border p-3 text-xs text-tv-muted">
            <div className="font-semibold text-tv-text">{isEn ? 'Core metric provenance example' : 'Contoh provenance metrik inti'}</div>
            <div className="mt-1">Avg T+20 bucket 80-100: {fmt(data.validation.metricProvenance.highBucketAvgT20.value, '%', isEn)}</div>
            <div>{isEn ? 'Source' : 'Sumber'}: {data.validation.metricProvenance.highBucketAvgT20.provenance.source} · confidence: {data.validation.metricProvenance.highBucketAvgT20.provenance.confidence}</div>
          </Card>
        </Card>

        <Card as="section" padding="none" radius="xl" elevation="none" highlight={false} overflow="visible" className="mb-6 border-tv-border p-5">
          <h2 className="font-heading text-lg font-bold">{isEn ? 'Model and data versions' : 'Versi model dan data'}</h2>
          <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
            <div><dt className="text-tv-muted">Score version</dt><dd className="mt-1 font-mono text-tv-text">{data.model.scoreVersion}</dd></div>
            <div><dt className="text-tv-muted">Config hash</dt><dd className="mt-1 break-all font-mono text-tv-text">{data.model.scoreConfigHash}</dd></div>
            <div><dt className="text-tv-muted">Price basis</dt><dd className="mt-1 font-mono text-tv-text">{data.model.priceBasis}</dd></div>
            <div><dt className="text-tv-muted">Price data version</dt><dd className="mt-1 font-mono text-tv-text">{data.model.priceDataVersion}</dd></div>
          </dl>
        </Card>

        <Card as="section" padding="none" radius="xl" elevation="none" highlight={false} overflow="visible" className="mb-6 border-tv-border p-5">
          <h2 className="font-heading text-lg font-bold">{isEn ? 'Bucket results: the average is not enough' : 'Hasil per bucket: rata-rata saja tidak cukup'}</h2>
          <p className="mt-2 text-xs leading-relaxed text-tv-muted">
            {isEn
              ? 'A right-skewed return distribution makes the average look better than the trade that is typically experienced. Median, win-rate, and excess versus the same-day market average are shown so the difference is visible.'
              : 'Distribusi return yang miring ke kanan membuat rata-rata terlihat lebih baik daripada trade yang biasanya dialami. Median, win-rate, dan excess terhadap rata-rata pasar di tanggal yang sama ikut ditampilkan supaya bedanya terlihat.'}
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[460px] text-xs">
              <thead className="text-tv-muted">
                <tr>
                  <th className="py-1 text-left font-medium">Bucket</th>
                  <th className="py-1 text-right font-medium">{isEn ? 'Samples' : 'Sampel'}</th>
                  <th className="py-1 text-right font-medium">Avg T+20</th>
                  <th className="py-1 text-right font-medium">Median T+20</th>
                  <th className="py-1 text-right font-medium">Win</th>
                  <th className="py-1 text-right font-medium">Excess</th>
                </tr>
              </thead>
              <tbody className="font-number">
                {data.validation.buckets.map((bucket) => (
                  <tr key={bucket.bucket} className="border-t border-tv-border">
                    <td className="py-1">{bucket.bucket}</td>
                    <td className="py-1 text-right">{fmt(bucket.samples, '', isEn)}</td>
                    <td className="py-1 text-right">{fmt(bucket.avgT20, '%', isEn)}</td>
                    <td className="py-1 text-right">{fmt(bucket.medianT20, '%', isEn)}</td>
                    <td className="py-1 text-right">{fmt(bucket.winRateT20, '%', isEn)}</td>
                    <td className="py-1 text-right">{fmt(bucket.excessT20, '%', isEn)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3 className="mt-5 font-semibold text-tv-text">{isEn ? 'Score deciles (equal sample size per row)' : 'Desil skor (jumlah sampel setara per baris)'}</h3>
          <p className="mt-1 text-xs leading-relaxed text-tv-muted">
            {isEn
              ? 'The official buckets are heavily unbalanced, so the top bucket has little statistical power. Deciles use an equal denominator and are not affected by one large bucket.'
              : 'Bucket resmi sangat tidak seimbang sehingga bucket teratas nyaris tidak punya daya statistik. Desil memakai penyebut yang setara dan tidak bisa dibentuk oleh satu bucket besar.'}
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[460px] text-xs">
              <thead className="text-tv-muted">
                <tr>
                  <th className="py-1 text-left font-medium">{isEn ? 'Decile' : 'Desil'}</th>
                  <th className="py-1 text-right font-medium">{isEn ? 'Score range' : 'Rentang skor'}</th>
                  <th className="py-1 text-right font-medium">{isEn ? 'Samples' : 'Sampel'}</th>
                  <th className="py-1 text-right font-medium">Avg T+20</th>
                  <th className="py-1 text-right font-medium">Median T+20</th>
                  <th className="py-1 text-right font-medium">Win</th>
                  <th className="py-1 text-right font-medium">Excess</th>
                </tr>
              </thead>
              <tbody className="font-number">
                {data.validation.deciles.map((row) => (
                  <tr key={row.decile} className="border-t border-tv-border">
                    <td className="py-1">{row.decile}</td>
                    <td className="py-1 text-right">{row.scoreMin}&ndash;{row.scoreMax}</td>
                    <td className="py-1 text-right">{fmt(row.samples, '', isEn)}</td>
                    <td className="py-1 text-right">{fmt(row.avgT20, '%', isEn)}</td>
                    <td className="py-1 text-right">{fmt(row.medianT20, '%', isEn)}</td>
                    <td className="py-1 text-right">{fmt(row.winRateT20, '%', isEn)}</td>
                    <td className="py-1 text-right">{fmt(row.excessT20, '%', isEn)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card as="section" padding="none" radius="xl" elevation="none" highlight={false} overflow="visible" className="mb-6 border-tv-border p-5">
          <h2 className="font-heading text-lg font-bold">{isEn ? 'Issuer coverage: three layers, three different numbers' : 'Cakupan emiten: tiga lapisan, tiga angka berbeda'}</h2>
          <p className="mt-2 text-xs leading-relaxed text-tv-muted">
            {isEn
              ? 'The issuer count depends on which layer is counted: the official IDX listing, the names ever scored in the archive, or the names that actually pass the validation gate. Only the last layer is the basis for the metrics on this page, so it is always the smallest of the three.'
              : 'Jumlah emiten tergantung lapisan yang dihitung: daftar resmi BEI, nama yang pernah dihitung skornya di arsip, atau nama yang benar-benar lolos gerbang validasi. Hanya lapisan terakhir yang menjadi dasar angka di halaman ini, jadi selalu yang terkecil dari ketiganya.'}
          </p>
          <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
            <div><dt className="text-tv-muted">{isEn ? 'IDX catalog' : 'Katalog BEI'}</dt><dd className="mt-1 font-number text-lg font-bold">{fmt(data.validation.emitenCoverage.catalogEmiten, '', isEn)}</dd></div>
            <div><dt className="text-tv-muted">{isEn ? 'In score archive' : 'Di arsip skor'}</dt><dd className="mt-1 font-number text-lg font-bold">{fmt(data.validation.emitenCoverage.archiveEmiten, '', isEn)}</dd></div>
            <div><dt className="text-tv-muted">{isEn ? 'Pass validation gate' : 'Lolos gerbang validasi'}</dt><dd className="mt-1 font-number text-lg font-bold">{fmt(data.validation.emitenCoverage.validationEmiten, '', isEn)}</dd></div>
            <div><dt className="text-tv-muted">{isEn ? 'Validation rows' : 'Baris validasi'}</dt><dd className="mt-1 font-number text-lg font-bold">{fmt(data.validation.emitenCoverage.validationRows, '', isEn)}</dd></div>
          </dl>
          <ul className="mt-3 space-y-1 text-xs leading-relaxed text-tv-muted">
            <li>
              • {isEn ? 'Issuers per signal date in the validation population: median' : 'Emiten per tanggal sinyal pada populasi validasi: median'}{' '}
              {fmt(data.validation.emitenCoverage.perDay.median, '', isEn)} · min {fmt(data.validation.emitenCoverage.perDay.min, '', isEn)} · max {fmt(data.validation.emitenCoverage.perDay.max, '', isEn)}
            </li>
            <li>
              • {isEn ? 'Latest signal date' : 'Tanggal sinyal terakhir'} {data.validation.emitenCoverage.perDay.latestDate ?? '-'}: {fmt(data.validation.emitenCoverage.perDay.latest, '', isEn)} {isEn ? 'issuers' : 'emiten'}
            </li>
            <li>
              • {isEn ? 'Listed issuers with no archive row yet (e.g. suspended): ' : 'Emiten tercatat yang belum punya satu baris arsip pun (mis. tersuspensi): '}{fmt(data.validation.emitenCoverage.catalogWithoutArchiveData, '', isEn)}
            </li>
          </ul>
        </Card>

        <Card as="section" padding="none" radius="xl" elevation="none" highlight={false} overflow="visible" className="border-tv-border p-5">
          <h2 className="flex items-center gap-2 font-heading text-lg font-bold"><Info className="h-4 w-4" /> {isEn ? 'Known limitations' : 'Batasan yang diketahui'}</h2>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-tv-muted">
            {(isEn ? ['Historical validation does not guarantee future returns.', 'Results remain sensitive to data coverage, liquidity filters, fees, slippage, and market-regime changes.', 'Incomplete or unversioned observations are excluded rather than treated as valid evidence.'] : data.limitations).map((item) => <li key={item}>• {item}</li>)}
          </ul>
          <p className="mt-3 text-xs text-tv-muted">{isEn ? 'Limitations reviewed' : 'Limitasi direview'}: {data.limitationsReviewedOn}</p>
        </Card>
      </div>
    </main>
  );
}
