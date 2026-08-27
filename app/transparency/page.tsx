import Link from 'next/link';
import { ArrowLeft, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { getPublicTransparencyData } from '@/modules/lens-radar/service/transparency.service';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata = {
  title: 'Transparansi Model SahamLens',
  description: 'Metodologi, status validasi, sumber data, dan batasan LensRadar/LensScore.',
};

function fmt(value: number | null | undefined, suffix = '') {
  if (value == null || !Number.isFinite(value)) return 'belum ada';
  return `${value.toLocaleString('id-ID')}${suffix}`;
}

export default async function PublicTransparencyPage() {
  const data = await getPublicTransparencyData();
  const isValidated = data.modelStatus === 'VALIDATED_OUT_OF_SAMPLE';
  const StatusIcon = isValidated ? CheckCircle2 : AlertTriangle;

  return (
    <main className="min-h-screen bg-tv-bg p-4 text-tv-text sm:p-8">
      <div className="mx-auto max-w-5xl">
        <Link href="/" className="mb-4 inline-flex items-center gap-1.5 text-sm text-tv-muted hover:text-tv-text">
          <ArrowLeft className="h-4 w-4" /> Kembali
        </Link>

        <section className="mb-8">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-tv-accent">Public model transparency</p>
          <h1 className="lens-page-title">Transparansi Model SahamLens</h1>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-tv-muted">
            Halaman ini menjelaskan cara LensRadar/LensScore dihitung, status validasi, basis return,
            data as-of, dan batasan yang aman dibuka publik. Detail raw sample, anomali, kalibrasi baris,
            dan diagnostik operator tetap di panel admin.
          </p>
        </section>

        <Card as="section" padding="none" radius="xl" elevation="none" highlight={false} overflow="visible" className="mb-6 border-tv-yellow/40 bg-tv-yellow/10 p-5">
          <div className="flex gap-3">
            <StatusIcon className="mt-0.5 h-5 w-5 shrink-0 text-tv-yellow" />
            <div>
              <h2 className="font-semibold text-tv-text">Status: {data.modelStatus}</h2>
              <p className="mt-1 text-sm leading-relaxed text-tv-muted">{data.validation.message}</p>
              <p className="mt-2 text-xs text-tv-muted">SahamLens adalah alat riset. Output model non-actionable dan bukan nasihat investasi.</p>
            </div>
          </div>
        </Card>

        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card as="div" padding="none" radius="xl" elevation="none" highlight={false} overflow="visible" className="border-tv-border p-4">
            <div className="text-xs uppercase text-tv-muted">As-of</div>
            <div className="mt-1 font-number text-xl font-bold">{data.asOfDate}</div>
          </Card>
          <Card as="div" padding="none" radius="xl" elevation="none" highlight={false} overflow="visible" className="border-tv-border p-4">
            <div className="text-xs uppercase text-tv-muted">Hari validasi</div>
            <div className="mt-1 font-number text-xl font-bold">{fmt(data.validation.validationDays)}</div>
          </Card>
          <Card as="div" padding="none" radius="xl" elevation="none" highlight={false} overflow="visible" className="border-tv-border p-4">
            <div className="text-xs uppercase text-tv-muted">Sampel T+20 mentah</div>
            <div className="mt-1 font-number text-xl font-bold">{fmt(data.validation.totalSamples)}</div>
          </Card>
          <Card as="div" padding="none" radius="xl" elevation="none" highlight={false} overflow="visible" className="border-tv-border p-4">
            <div className="text-xs uppercase text-tv-muted">OOS validation</div>
            <div className="mt-1 font-number text-xl font-bold">{data.validation.outOfSampleStatus}</div>
          </Card>
        </div>

        <Card as="section" padding="none" radius="xl" elevation="none" highlight={false} overflow="visible" className="mb-6 border-tv-border p-5">
          <h2 className="font-heading text-lg font-bold">Metodologi dan basis return</h2>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-tv-muted">
            {data.methodology.map((item) => <li key={item}>• {item}</li>)}
          </ul>
          <p className="mt-3 rounded-lg border border-tv-border bg-tv-card p-3 text-xs text-tv-muted">
            Return basis: {data.validation.returnBasis}
          </p>
          <Card as="div" padding="none" radius="lg" elevation="none" highlight={false} overflow="visible" className="mt-3 border-tv-border p-3 text-xs text-tv-muted">
            <div className="font-semibold text-tv-text">Contoh provenance metrik inti</div>
            <div className="mt-1">Avg T+20 bucket 80-100: {fmt(data.validation.metricProvenance.highBucketAvgT20.value, '%')}</div>
            <div>Sumber: {data.validation.metricProvenance.highBucketAvgT20.provenance.source} · confidence: {data.validation.metricProvenance.highBucketAvgT20.provenance.confidence}</div>
          </Card>
        </Card>

        <Card as="section" padding="none" radius="xl" elevation="none" highlight={false} overflow="visible" className="mb-6 border-tv-border p-5">
          <h2 className="font-heading text-lg font-bold">Versi model dan data</h2>
          <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
            <div><dt className="text-tv-muted">Score version</dt><dd className="mt-1 font-mono text-tv-text">{data.model.scoreVersion}</dd></div>
            <div><dt className="text-tv-muted">Config hash</dt><dd className="mt-1 break-all font-mono text-tv-text">{data.model.scoreConfigHash}</dd></div>
            <div><dt className="text-tv-muted">Price basis</dt><dd className="mt-1 font-mono text-tv-text">{data.model.priceBasis}</dd></div>
            <div><dt className="text-tv-muted">Price data version</dt><dd className="mt-1 font-mono text-tv-text">{data.model.priceDataVersion}</dd></div>
          </dl>
        </Card>

        <Card as="section" padding="none" radius="xl" elevation="none" highlight={false} overflow="visible" className="border-tv-border p-5">
          <h2 className="flex items-center gap-2 font-heading text-lg font-bold"><Info className="h-4 w-4" /> Batasan yang diketahui</h2>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-tv-muted">
            {data.limitations.map((item) => <li key={item}>• {item}</li>)}
          </ul>
          <p className="mt-3 text-xs text-tv-muted">Limitasi direview: {data.limitationsReviewedOn}</p>
        </Card>
      </div>
    </main>
  );
}
