'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import TradingViewChart from '@/components/TradingViewChart';
import { computeIndicators, computeMiniCouncil, moneyFlowLabel, type Indicators } from '@/lib/miniCouncil';

// BUG FIX (2026-08-05, laporan user - "chart candle kok gak ada 1M, langsung 1 tahun"):
// lihat catatan lengkap di components/Dashboard.tsx (TIMEFRAMES array yang sama) - 1M/3M
// ditambahkan balik sebagai pilihan, default tetap '1Y'.
const TIMEFRAMES = ['1D', '3D', '7D', '1M', '3M', '1Y', '10Y', 'ALL'];

// Grafik candlestick + timeframe switcher + ringkasan LensAI (10 agen), dipakai
// baik di halaman /technical/[symbol] maupun bisa dipakai ulang di tempat lain yang
// butuh chart+insight ringkas untuk satu simbol.
export default function StockChartPanel({ symbol }: { symbol: string }) {
  const code = symbol.replace('.JK', '');
  const isIndex = code.startsWith('^');
  const [timeframe, setTimeframe] = useState('1Y');
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
    const volumes = chartData.map((h: any) => h.volume);
    return computeIndicators(chartData[chartData.length - 1].time, closes, volumes);
  }, [chartData]);

  const council = useMemo(() => computeMiniCouncil(chartData as any, isIndex), [chartData, isIndex]);
  const finalSignal = council?.finalSignal ?? ind?.signal ?? 'HOLD';

  return (
    <div className="bg-tv-card border border-tv-border rounded-xl p-4 sm:p-5 space-y-4">
      {ind && (
        <div className="flex justify-end">
          <span
            className={`rounded-full border px-2.5 py-1 text-[10px] font-bold font-sans ${
              finalSignal === 'BUY'
                ? 'bg-tv-green/10 border-tv-green/30 text-tv-green'
                : finalSignal === 'SELL'
                ? 'bg-tv-red/10 border-tv-red/30 text-tv-red'
                : 'bg-tv-border text-tv-muted'
            }`}
          >
            {finalSignal}
          </span>
        </div>
      )}

      {chartData.length > 0 ? (
        <TradingViewChart
          symbol={code}
          candles={chartData}
          height={580}
          timeframe={timeframe}
          timeframeOptions={TIMEFRAMES}
          onTimeframeChange={setTimeframe}
          variant="full"
          technical={{
            // null (bukan 'NETRAL') kalau MA belum bisa dihitung - "netral" adalah
            // kesimpulan pasar, ketiadaan data bukan (temuan C-1).
            cross_status: ind?.ma20 != null && ind?.ma50 != null ? (ind.ma20 > ind.ma50 ? 'BULLISH' : 'BEARISH') : null,
            // CMF20 dari OHLCV nyata, bukan turunan volRatio (temuan C-2).
            money_flow_status: moneyFlowLabel(chartData as any),
            ma50: ind?.ma50 ?? undefined,
            ma200: ind?.ma200 ?? undefined,
          }}
        />
      ) : (
        <div className="min-h-[360px] sm:min-h-[460px] flex items-center justify-center bg-[#131722] text-tv-muted rounded-lg">Memuat grafik...</div>
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
