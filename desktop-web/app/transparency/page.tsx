'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, CheckCircle2, Info, RefreshCw } from 'lucide-react';
import { Button, Card, Skeleton } from '@/components/ui';
import { apiErrorMessage, apiRequest } from '@/shared/http/api-client';
import type { PublicTransparencyData } from '@/modules/lens-radar/service/transparency.service';

function fmt(value: number | null | undefined, suffix = ''): string {
  if (value == null || !Number.isFinite(value)) return 'belum ada';
  return `${value.toLocaleString('id-ID')}${suffix}`;
}

export default function PublicTransparencyPage() {
  const [data, setData] = useState<PublicTransparencyData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    apiRequest<PublicTransparencyData>('/api/transparency', { signal: controller.signal })
      .then(setData)
      .catch((reason) => {
        if (!(reason instanceof DOMException && reason.name === 'AbortError')) {
          setError(apiErrorMessage(reason, 'Data transparansi belum bisa dimuat.'));
        }
      });
    return () => controller.abort();
  }, [reloadKey]);

  if (!data) {
    return (
      <main className="min-h-screen bg-tv-bg p-4 text-tv-text sm:p-8">
        <div className="mx-auto max-w-5xl space-y-5">
          <Skeleton variant="text" className="h-8 w-72" />
          {error ? (
            <Card className="border-tv-red/30 p-6 text-center">
              <p className="text-sm text-tv-muted">{error}</p>
              <Button className="mx-auto mt-4" onClick={() => { setError(null); setReloadKey((value) => value + 1); }}>
                <RefreshCw className="h-4 w-4" /> Coba lagi
              </Button>
            </Card>
          ) : (
            <Skeleton className="h-72 w-full" />
          )}
        </div>
      </main>
    );
  }

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
            Metodologi, status validasi, basis return, versi data, dan batasan model yang aman dibuka publik.
          </p>
        </section>

        <Card as="section" className="mb-6 border-tv-yellow/40 bg-tv-yellow/10 p-5">
          <div className="flex gap-3">
            <StatusIcon className="mt-0.5 h-5 w-5 shrink-0 text-tv-yellow" />
            <div>
              <h2 className="font-semibold text-tv-text">Status: {data.modelStatus}</h2>
              <p className="mt-1 text-sm leading-relaxed text-tv-muted">{data.validation.message}</p>
              <p className="mt-2 text-xs text-tv-muted">{data.disclaimer}</p>
            </div>
          </div>
        </Card>

        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['As-of', data.asOfDate],
            ['Hari validasi', fmt(data.validation.validationDays)],
            ['Sampel T+20 mentah', fmt(data.validation.totalSamples)],
            ['OOS validation', data.validation.outOfSampleStatus],
          ].map(([label, value]) => (
            <Card key={label} className="border-tv-border p-4">
              <div className="text-xs uppercase text-tv-muted">{label}</div>
              <div className="mt-1 font-number text-xl font-bold">{value}</div>
            </Card>
          ))}
        </div>

        <Card as="section" className="mb-6 border-tv-border p-5">
          <h2 className="font-heading text-lg font-bold">Metodologi dan basis return</h2>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-tv-muted">
            {data.methodology.map((item) => <li key={item}>• {item}</li>)}
          </ul>
          <p className="mt-3 rounded-lg border border-tv-border bg-tv-card p-3 text-xs text-tv-muted">
            Return basis: {data.validation.returnBasis}
          </p>
          <div className="mt-3 text-xs text-tv-muted">
            Avg T+20 bucket 80-100: {fmt(data.validation.metricProvenance.highBucketAvgT20.value, '%')}
          </div>
        </Card>

        <Card as="section" className="mb-6 border-tv-border p-5">
          <h2 className="font-heading text-lg font-bold">Versi model dan data</h2>
          <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
            <div><dt className="text-tv-muted">Score version</dt><dd className="mt-1 font-mono text-tv-text">{data.model.scoreVersion}</dd></div>
            <div><dt className="text-tv-muted">Config hash</dt><dd className="mt-1 break-all font-mono text-tv-text">{data.model.scoreConfigHash}</dd></div>
            <div><dt className="text-tv-muted">Price basis</dt><dd className="mt-1 font-mono text-tv-text">{data.model.priceBasis}</dd></div>
            <div><dt className="text-tv-muted">Price data version</dt><dd className="mt-1 font-mono text-tv-text">{data.model.priceDataVersion}</dd></div>
          </dl>
        </Card>

        <Card as="section" className="border-tv-border p-5">
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
