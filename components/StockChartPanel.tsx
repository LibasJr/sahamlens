'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import TradingViewChart from '@/components/TradingViewChart';
import { computeIndicators, computeMiniCouncil, type Indicators } from '@/lib/miniCouncil';

const TIMEFRAMES = ['1D', '3D', '7D', '1M', '1Y', 'ALL'];

// Grafik candlestick + timeframe switcher + ringkasan LensAI (10 agen), dipakai
// baik di halaman /technical/[symbol] maupun bisa dipakai ulang di tempat lain yang
// butuh chart+insight ringkas untuk satu simbol.
export default function StockChartPanel({ symbol }: { symbol: string }) {
  const code = symbol.replace('.JK', '');
  const [timeframe, setTimeframe] = useState('1M');
  const [chartData, setChartData] = useState<any[]>([]);

  useEffect(() => {
    setChartData([]);
    fetch(`/api/public-chart/${code}?tf=${timeframe}`)
      .then((r) => r.json())
      .then((data) => {
        if (data && data.history && data.history.length > 0) setChartData(data.history);
      })
      .catch(console.error);
  }, [code, timeframe]);

  const ind: Indicators | null = useMemo(() => {
    if (chartData.length < 2) return null;
    const closes = chartData.map((h: any) => h.close);
    const volumes = chartData.map((h: any) => h.volume || 0);
    return computeIndicators(chartData[chartData.length - 1].time, closes, volumes);
  }, [chartData]);

  const council = useMemo(() => computeMiniCouncil(chartData as any), [chartData]);
  const finalSignal = council?.finalSignal ?? ind?.signal ?? 'HOLD';

  return (
    <div className="bg-tv-card border border-tv-border rounded-xl p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 rounded-full bg-tv-hover p-1">
          {TIMEFRAMES.map((t) => (
            <button
              key={t}
              onClick={() => setTimeframe(t)}
              className={`rounded-full px-3 py-1 text-[11px] font-bold tracking-wide font-mono transition ${
                timeframe === t ? 'bg-tv-blue text-white shadow' : 'text-tv-muted hover:text-white'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        {ind && (
          <span
            className={`rounded-full border px-2.5 py-1 text-[10px] font-bold font-mono ${
              finalSignal === 'BUY'
                ? 'bg-tv-green/10 border-tv-green/30 text-tv-green'
                : finalSignal === 'SELL'
                ? 'bg-tv-red/10 border-tv-red/30 text-tv-red'
                : 'bg-tv-border text-tv-muted'
            }`}
          >
            {finalSignal}
          </span>
        )}
      </div>

      {chartData.length > 0 ? (
        <TradingViewChart
          symbol={code}
          candles={chartData}
          height={340}
          timeframe={timeframe}
          technical={{
            cross_status: ind?.ma20 != null && ind?.ma50 != null ? (ind.ma20 > ind.ma50 ? 'BULLISH' : 'BEARISH') : 'NETRAL',
            broker_flow_status: ind?.volRatio != null ? (ind.volRatio > 1 ? 'AKUMULASI' : 'DISTRIBUSI') : 'NETRAL',
            ma50: ind?.ma50 ?? undefined,
            ma200: undefined,
          }}
        />
      ) : (
        <div className="h-[340px] flex items-center justify-center bg-[#131722] text-tv-muted rounded-lg">Memuat grafik...</div>
      )}

      <div className="flex items-start gap-2 rounded-lg bg-tv-hover border border-tv-border p-3">
        <Sparkles className="w-4 h-4 text-tv-blue shrink-0 mt-0.5" />
        <p className="text-[12px] leading-[1.5] text-tv-muted">
          {council ? council.summary : ind ? 'Menghitung ringkasan LensAI...' : 'Memuat data teknikal...'}
        </p>
      </div>
    </div>
  );
}
