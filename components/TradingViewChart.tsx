'use me';
'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi } from 'lightweight-charts';

interface CandleData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface TechnicalData {
  ma50?: number;
  ma100?: number;
  ma200?: number;
  support_1?: number;
  support_2?: number;
  resistance_1?: number;
  resistance_2?: number;
  cross_status?: string | null;
  /** Label arus dana yang SUDAH dihitung pemanggil dari OHLCV nyata (Chaikin Money
   * Flow, lihat modules/market/service/foreign-flow-proxy.ts). `null`/undefined berarti
   * BELUM/TIDAK bisa dihitung - komponen ini menampilkan "N/A", TIDAK PERNAH menebak.
   *
   * BUG FIX (audit logika & algoritma 2026-08-05, temuan C-1): field ini SEBELUMNYA
   * bernama `broker_flow_status` dan dirender dengan fallback `|| 'AKUMULASI'`. Satu-
   * satunya pemanggil yang memberi nilai lewat /api/stock (`app/dashboard/page.tsx`)
   * membaca `data.technical` yang SELALU objek kosong (`technical: {}` di route-nya),
   * jadi fallback itu aktif 100% request: setiap saham, setiap kondisi pasar,
   * menampilkan "Bandar Flow: AKUMULASI" yang tidak pernah dihitung dari apa pun.
   * Nama field diganti supaya pemanggil lama yang masih mengirim `broker_flow_status`
   * (nilai turunan volume, temuan C-2) tidak diam-diam tetap lolos. */
  money_flow_status?: string | null;
}

interface TradingViewChartProps {
  candles: CandleData[];
  technical: TechnicalData;
  symbol: string;
  height?: number;
  timeframe?: string;
  onHoverCandle?: (time: string | null) => void;
}

export default function TradingViewChart({
  candles,
  technical,
  symbol,
  height = 480,
  timeframe = '1M',
  onHoverCandle
}: TradingViewChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const onHoverCandleRef = useRef(onHoverCandle);
  onHoverCandleRef.current = onHoverCandle;

  // Kotak info Open/High/Low/Close di kiri-atas canvas - update saat kursor digerakkan
  // di atas candle (lihat handleCrosshairMove), balik ke candle terakhir saat kursor
  // keluar dari chart. State ini SENGAJA tidak masuk dependency effect di bawah -
  // updatenya cuma re-render JSX overlay, bukan bikin ulang chart (lihat catatan
  // dependency array effect di bawah soal kenapa itu penting).
  const [hoverOhlc, setHoverOhlc] = useState<CandleData | null>(candles[candles.length - 1] ?? null);

  useEffect(() => {
    if (!chartContainerRef.current || !candles || candles.length === 0) return;
    setHoverOhlc(candles[candles.length - 1]);

    chartContainerRef.current.innerHTML = '';

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: height,
      layout: {
        background: { type: ColorType.Solid, color: '#131722' },
        textColor: '#d1d4dc',
        fontSize: 11,
        fontFamily: 'JetBrains Mono, monospace'
      },
      grid: {
        vertLines: { color: '#1e222d' },
        horzLines: { color: '#1e222d' }
      },
      crosshair: {
        mode: 1,
        vertLine: {
          color: '#787b86',
          width: 1,
          style: 3,
          visible: true
        },
        horzLine: {
          color: '#787b86',
          width: 1,
          style: 3,
          visible: true
        }
      },
      rightPriceScale: {
        borderColor: '#2a2e39',
        scaleMargins: {
          top: 0.1,
          bottom: 0.25
        }
      },
      timeScale: {
        borderColor: '#2a2e39',
        timeVisible: true,
        secondsVisible: false
      }
    });

    chartRef.current = chart;

    // lightweight-charts requires either a 'yyyy-mm-dd' business-day string (daily/weekly/
    // monthly candles) or a Unix-seconds number (intraday candles) - it rejects a full ISO
    // datetime string. Our API returns full ISO strings for intraday timeframes (1D/3D/7D)
    // so they can be told apart from other same-day candles; convert here for the chart
    // library only, and keep a reverse lookup so hover callbacks can report back the
    // original c.time string the rest of the app (indicator lookups) expects.
    const isIntradayTime = (t: string) => t.includes('T');
    const toChartTime = (t: string): any => (isIntradayTime(t) ? Math.floor(new Date(t).getTime() / 1000) : t);
    const reverseTimeMap = new Map<string | number, string>();
    candles.forEach((c) => reverseTimeMap.set(toChartTime(c.time), c.time));

    // Candlestick Series
    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#089981',
      downColor: '#f23645',
      borderVisible: false,
      wickUpColor: '#089981',
      wickDownColor: '#f23645'
    });

    const formattedCandles = candles.map((c) => ({
      time: toChartTime(c.time),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close
    }));

    candlestickSeries.setData(formattedCandles);

    // Volume Histogram Series
    const volumeSeries = chart.addHistogramSeries({
      color: '#26a69a',
      priceFormat: {
        type: 'volume'
      },
      priceScaleId: 'volume'
    });

    chart.priceScale('volume').applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0
      }
    });

    const formattedVolume = candles.map((c) => ({
      time: toChartTime(c.time),
      value: c.volume,
      color: c.close >= c.open ? 'rgba(8, 153, 129, 0.4)' : 'rgba(242, 54, 69, 0.4)'
    }));

    volumeSeries.setData(formattedVolume);

    // Moving Averages calculation & series overlay
    if (candles.length > 50) {
      const ma50Series = chart.addLineSeries({
        color: '#f0b90b',
        lineWidth: 1,
        title: 'MA 50'
      });
      const ma50Data = candles.map((c, i) => {
        if (i < 49) return null;
        const slice = candles.slice(i - 49, i + 1);
        const avg = slice.reduce((sum, item) => sum + item.close, 0) / 50;
        return { time: toChartTime(c.time), value: avg };
      }).filter((item): item is { time: any; value: number } => item !== null);
      ma50Series.setData(ma50Data);
    }

    if (candles.length > 200) {
      const ma200Series = chart.addLineSeries({
        color: '#ab47bc',
        lineWidth: 1,
        title: 'MA 200'
      });
      const ma200Data = candles.map((c, i) => {
        if (i < 199) return null;
        const slice = candles.slice(i - 199, i + 1);
        const avg = slice.reduce((sum, item) => sum + item.close, 0) / 200;
        return { time: toChartTime(c.time), value: avg };
      }).filter((item): item is { time: any; value: number } => item !== null);
      ma200Series.setData(ma200Data);
    }

    // Support / Resistance Lines
    if (technical.support_1) {
      candlestickSeries.createPriceLine({
        price: technical.support_1,
        color: '#089981',
        lineWidth: 1,
        lineStyle: 2, // Dashed
        axisLabelVisible: true,
        title: `S1: Rp ${technical.support_1}`
      });
    }

    if (technical.resistance_1) {
      candlestickSeries.createPriceLine({
        price: technical.resistance_1,
        color: '#f23645',
        lineWidth: 1,
        lineStyle: 2, // Dashed
        axisLabelVisible: true,
        title: `R1: Rp ${technical.resistance_1}`
      });
    }

    chart.timeScale().fitContent();

    const handleCrosshairMove = (param: any) => {
      const original = param.time != null ? reverseTimeMap.get(param.time) : null;
      onHoverCandleRef.current?.(original ?? null);
      const candle = original ? candles.find((c) => c.time === original) : null;
      setHoverOhlc(candle ?? candles[candles.length - 1] ?? null);
    };
    chart.subscribeCrosshairMove(handleCrosshairMove);

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth
        });
      }
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      chart.remove();
    };
    // BUG FIX: dependency sebelumnya `technical` (seluruh objek), bukan field yang
    // benar-benar dipakai di effect ini (cuma support_1/resistance_1 - dipakai untuk
    // price line). Pemanggil (Dashboard.tsx, StockChartPanel.tsx) selalu bikin object
    // literal `technical={{...}}` baru di setiap render, termasuk render yang dipicu
    // onHoverCandle (hover -> setState di parent -> re-render -> object baru).
    // Akibatnya effect ini jalan ulang di HAMPIR SETIAP gerakan mouse, chart di-teardown
    // total (`innerHTML=''` + createChart lagi) lalu fitContent() lagi - jadi pan/zoom
    // user langsung "dilempar balik" ke fit-all, kelihatan seperti chart timeframe
    // panjang (1Y) "tidak bisa digeser". Depend ke primitif yang benar-benar dipakai
    // saja supaya chart tidak dibuat ulang gara-gara hover.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, height, technical.support_1, technical.resistance_1]);

  return (
    <div className="bg-tv-card border border-tv-border rounded-xl p-4 flex flex-col gap-3 shadow-1">
      {/* Chart Top Information Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-tv-border pb-3">
        <div className="flex items-center gap-3">
          <span className="font-bold font-mono text-base text-white tracking-wider">
            {symbol.startsWith('^') ? symbol : (symbol.endsWith('.JK') ? symbol : `${symbol}.JK`)}
          </span>
          <span className="text-xs text-tv-muted font-mono">{timeframe === 'ALL' ? '15Y' : timeframe} Candlestick</span>
          {/* BUG FIX (audit 2026-08-05, temuan C-1): badge ini sebelumnya diwarnai MERAH
              (bearish) untuk status yang tidak diketahui - `''.includes('BULLISH')` false
              jatuh ke cabang merah, jadi "MA STATUS" (artinya: data tidak ada) tampil
              dengan isyarat visual bearish. Sekarang tiga keadaan dibedakan: bullish,
              bearish, dan TIDAK DIKETAHUI (netral abu-abu, teks "MA N/A"). */}
          <span className={`text-xs font-mono font-semibold px-2 py-0.5 rounded border ${
            !technical.cross_status
              ? 'bg-tv-hover text-tv-muted border-tv-border'
              : technical.cross_status.includes('BULLISH')
                ? 'bg-tv-green/10 text-tv-green border-tv-green/30'
                : technical.cross_status.includes('BEARISH')
                  ? 'bg-tv-red/10 text-tv-red border-tv-red/30'
                  : 'bg-tv-hover text-tv-muted border-tv-border'
          }`}>
            {technical.cross_status || 'MA N/A'}
          </span>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-[11px] font-mono">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#f0b90b]" />
            <span className="text-tv-muted">MA 50: Rp {technical.ma50?.toLocaleString('id-ID') || '-'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#ab47bc]" />
            <span className="text-tv-muted">MA 200: Rp {technical.ma200?.toLocaleString('id-ID') || '-'}</span>
          </div>
          {/* "Money Flow", BUKAN "Bandar Flow": angka ini proxy Chaikin Money Flow dari
              harga+volume, bukan data transaksi broker (IDX tidak menyediakan feed itu
              gratis) - penamaan disamakan dengan Screener & BandarFlowPro yang sudah
              jujur. Tanpa data -> "N/A", bukan tebakan. */}
          <div className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${
              technical.money_flow_status?.startsWith('AKUMULASI') ? 'bg-tv-green'
                : technical.money_flow_status?.startsWith('DISTRIBUSI') ? 'bg-tv-red'
                : 'bg-tv-muted'
            }`} />
            <span className="text-tv-text font-bold">
              Money Flow (CMF20): {technical.money_flow_status || 'N/A'}
            </span>
          </div>
        </div>
      </div>

      {/* Lightweight Chart Render Canvas - wrapper terpisah dari chartContainerRef supaya
          overlay OHLC (React-rendered) tidak ikut kehapus saat effect di atas menjalankan
          chartContainerRef.current.innerHTML = '' (itu langsung memanipulasi DOM di luar
          React, kalau overlay ada di DALAM node yang sama React bisa kehilangan jejak node-nya). */}
      <div className="w-full rounded-lg overflow-hidden relative">
        <div ref={chartContainerRef} className="w-full" />
        {hoverOhlc && (
          <div className="absolute top-2 left-2 z-10 flex items-center gap-2 text-[11px] font-mono bg-tv-card/80 backdrop-blur-sm px-2 py-1 rounded pointer-events-none">
            <span className="text-tv-muted">O <span className="text-tv-text">{hoverOhlc.open.toLocaleString('id-ID')}</span></span>
            <span className="text-tv-muted">H <span className="text-tv-green">{hoverOhlc.high.toLocaleString('id-ID')}</span></span>
            <span className="text-tv-muted">L <span className="text-tv-red">{hoverOhlc.low.toLocaleString('id-ID')}</span></span>
            <span className="text-tv-muted">C <span className={hoverOhlc.close >= hoverOhlc.open ? 'text-tv-green' : 'text-tv-red'}>{hoverOhlc.close.toLocaleString('id-ID')}</span></span>
          </div>
        )}
      </div>
    </div>
  );
}
