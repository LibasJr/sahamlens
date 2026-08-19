'use client';

import dynamic from 'next/dynamic';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { AnimatedNumber, Card, TickerAvatar } from '@/components/ui';
import { formatPct, toneClass } from '@/components/dashboard/dashboard-analysis';

const TradingViewChart = dynamic(() => import('@/components/TradingViewChart'), {
  ssr: false,
  loading: () => <div className="h-[420px] w-full animate-pulse rounded-xl bg-tv-surface" aria-label="Memuat chart" />,
});

export function DashboardIndexSection(props: {
  stock: any;
  candles: any[];
  chartTechnical: any;
  timeframe: string;
  setTimeframe: (timeframe: string) => void;
  summary: ReturnType<typeof import('@/components/dashboard/dashboard-analysis').buildIndexTechnicalSummary>;
}) {
  const { stock, candles, chartTechnical, timeframe, setTimeframe, summary } = props;
  return (
    <>
      <Card padding="none" radius="2xl" elevation="md" overflow="visible" highlight={false} className="border-white/[0.075] p-4 sm:p-5">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <TickerAvatar symbol="IHSG" size="lg" />
          <div>
            <div className="flex min-w-0 items-baseline gap-2 sm:gap-3">
              <h1 className="shrink-0 font-heading text-xl font-bold tracking-tight text-white sm:text-2xl md:text-[28px]">IHSG</h1>
              <span className="min-w-0 truncate text-xs font-normal text-tv-muted font-sans sm:text-sm">Indeks Harga Saham Gabungan</span>
            </div>
            <div className="mt-1 flex items-center gap-3">
              {typeof stock.current_price === 'number' ? (
                <AnimatedNumber
                  value={stock.current_price}
                  format={(value) => value.toLocaleString('id-ID', { maximumFractionDigits: 2 })}
                  className="font-number text-xl font-bold tracking-tight text-white tabular-nums sm:text-2xl md:text-[28px]"
                />
              ) : (
                <span className="text-sm text-tv-muted">Level IHSG tidak tersedia</span>
              )}
              {stock.change_pct != null && (
                <span className={`flex items-center gap-0.5 font-number text-sm font-bold ${stock.change_pct >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
                  {stock.change_pct >= 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                  {stock.change_pct > 0 ? `+${stock.change_pct}` : stock.change_pct}%
                </span>
              )}
            </div>
          </div>
        </div>
      </Card>

      <TradingViewChart
        candles={candles}
        technical={chartTechnical}
        symbol="^JKSE"
        timeframe={timeframe}
        timeframeOptions={['1D', '3D', '7D', '1M', '3M', '1Y', '10Y', 'ALL']}
        onTimeframeChange={setTimeframe}
        variant="full"
        height={600}
      />

      {summary && (
        <Card padding="none" radius="2xl" elevation="md" overflow="visible" highlight={false} className="border-white/[0.075] p-4 sm:p-5">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-tv-muted">Analisa Teknikal IHSG</p>
              <h2 className="mt-1 font-heading text-lg font-bold text-white sm:text-xl">
                Sentimen pasar: <span className={summary.sentimentTone}>{summary.sentiment}</span>
              </h2>
            </div>
            <div className={`rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-bold ${summary.trendTone}`}>
              {summary.trend}
            </div>
          </div>

          <p className="mb-4 text-sm leading-relaxed text-tv-muted">{summary.explanation}</p>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            <Metric title="Perubahan">
              <MetricRow label="1D" value={formatPct(summary.change1D)} tone={toneClass(summary.change1D)} />
              <MetricRow label="5D" value={formatPct(summary.change5D)} tone={toneClass(summary.change5D)} />
              <MetricRow label="20D" value={formatPct(summary.change20D)} tone={toneClass(summary.change20D)} />
            </Metric>
            <Metric title="Moving Average">
              <MetricRow label="MA20" value={summary.ma20?.toLocaleString('id-ID') ?? 'N/A'} />
              <MetricRow label="MA50" value={summary.ma50?.toLocaleString('id-ID') ?? 'N/A'} />
              <MetricRow label="MA200" value={summary.ma200?.toLocaleString('id-ID') ?? 'N/A'} />
            </Metric>
            <Metric title="Momentum">
              <MetricRow label="RSI14" value={summary.rsi?.toFixed(1) ?? 'N/A'} tone={summary.momentumTone} />
              <div className="text-xs leading-relaxed text-tv-muted">{summary.momentum}</div>
            </Metric>
            <Metric title="Risiko Pasar">
              <MetricRow label="Vol 20D annual" value={summary.vol20 != null ? `${summary.vol20}%` : 'N/A'} />
              <div className="text-xs leading-relaxed text-tv-muted">{summary.structure}</div>
            </Metric>
          </div>

          <div className="mt-4 rounded-xl border border-tv-blue/20 bg-tv-blue/10 p-3 text-xs leading-relaxed text-tv-muted">
            Kesimpulan ini membaca IHSG sebagai kondisi pasar keseluruhan. Untuk keputusan saham individual, tetap cek teknikal emiten masing-masing karena saham kuat bisa naik saat IHSG datar, dan saham lemah bisa turun saat IHSG menguat.
          </div>
        </Card>
      )}

      <Card padding="none" radius="xl" elevation="none" overflow="visible" highlight={false} className="border-tv-border p-4 text-sm leading-relaxed text-tv-muted">
        IHSG adalah indeks pasar, bukan saham emiten. Di menu Teknikal ini SahamLens menampilkan chart, tren, momentum, dan volatilitas IHSG. Analisis teknikal saham, TP/CL, fundamental, broker flow, dan rekomendasi per lot tidak ditampilkan untuk indeks.
      </Card>
    </>
  );
}

function Metric(props: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-tv-border bg-tv-bg/70 p-3">
      <p className="lens-meta font-semibold uppercase tracking-[0.12em] text-tv-muted">{props.title}</p>
      <div className="mt-2 space-y-1 text-sm">{props.children}</div>
    </div>
  );
}

function MetricRow(props: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-tv-muted">{props.label}</span>
      <span className={`font-number font-bold ${props.tone ?? 'text-white'}`}>{props.value}</span>
    </div>
  );
}
