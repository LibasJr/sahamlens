'use client';

import { Button } from '@/components/ui';
import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  IChartApi,
  ISeriesApi,
  CandlestickData,
  HistogramData,
  LineData,
  Time,
} from 'lightweight-charts';
import { Eye, EyeOff, Maximize2, RotateCcw, BarChart2, Layers } from 'lucide-react';
import { formatRupiah } from '@/shared/config/pricing';
import { computeVolumeProfile, type VolumeProfileResult } from '@/lib/utils/volume-profile';

export interface RawCandle {
  date?: string | number | Date;
  time?: string | number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface ProTradingViewChartProps {
  candles: RawCandle[];
  ticker: string;
  className?: string;
}

function calculateEMA(data: { time: Time; close: number }[], period: number): LineData[] {
  if (data.length < period) return [];
  const k = 2 / (period + 1);
  const emaData: LineData[] = [];

  // Start with simple moving average for the first point
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += data[i].close;
  }
  let prevEMA = sum / period;
  emaData.push({ time: data[period - 1].time, value: parseFloat(prevEMA.toFixed(2)) });

  for (let i = period; i < data.length; i++) {
    const currentClose = data[i].close;
    const currentEMA = currentClose * k + prevEMA * (1 - k);
    emaData.push({ time: data[i].time, value: parseFloat(currentEMA.toFixed(2)) });
    prevEMA = currentEMA;
  }

  return emaData;
}

function bacaPaletChart(): { latar: string; teks: string; kisi: string; garis: string; bidik: string } {
  if (typeof window === 'undefined') {
    return { latar: '#080D16', teks: '#94a3b8', kisi: 'rgba(255, 255, 255, 0.04)', garis: 'rgba(255, 255, 255, 0.08)', bidik: 'rgba(255, 255, 255, 0.25)' };
  }
  const isLight = document.documentElement.classList.contains('light');
  if (isLight) {
    return {
      latar: '#FFFFFF',
      teks: '#475569',
      kisi: 'rgba(0, 0, 0, 0.06)',
      garis: 'rgba(0, 0, 0, 0.12)',
      bidik: 'rgba(0, 0, 0, 0.35)',
    };
  }
  return {
    latar: '#080D16',
    teks: '#94a3b8',
    kisi: 'rgba(255, 255, 255, 0.04)',
    garis: 'rgba(255, 255, 255, 0.08)',
    bidik: 'rgba(255, 255, 255, 0.25)',
  };
}

export function ProTradingViewChart({ candles, ticker, className = '' }: ProTradingViewChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const ema20SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ema50SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ema200SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);

  const [showEMA20, setShowEMA20] = useState(true);
  const [showEMA50, setShowEMA50] = useState(true);
  const [showEMA200, setShowEMA200] = useState(true);
  const [showVolume, setShowVolume] = useState(true);
  const [showVPVR, setShowVPVR] = useState(true);
  const [activeRange, setActiveRange] = useState<'1M' | '3M' | '6M' | '1Y' | 'ALL'>('6M');

  // Compute Volume Profile
  const volumeProfile = useMemo(() => {
    return computeVolumeProfile(candles || [], 20);
  }, [candles]);

  // Crosshair live status
  const [hoverData, setHoverData] = useState<{
    dateStr: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number | null;
    changePct: number;
  } | null>(null);

  // Parse and format data
  const formattedData = useMemo(() => {
    if (!candles || candles.length === 0) return { candlesticks: [], volumes: [], emaSource: [] };

    const parsed: { time: Time; open: number; high: number; low: number; close: number; volume: number | null }[] = [];

    for (const c of candles) {
      let dateObj: Date | null = null;
      if (c.date) {
        dateObj = new Date(c.date);
      } else if (c.time) {
        dateObj = typeof c.time === 'number' ? new Date(c.time * 1000) : new Date(c.time);
      }
      if (!dateObj || isNaN(dateObj.getTime())) continue;

      const timeStr = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}` as Time;

      const open = Number(c.open);
      const high = Number(c.high);
      const low = Number(c.low);
      const close = Number(c.close);
      const volume = typeof c.volume === 'number' && !isNaN(c.volume) ? Number(c.volume) : null;

      if (open > 0 && high > 0 && low > 0 && close > 0) {
        parsed.push({ time: timeStr, open, high, low, close, volume });
      }
    }

    const uniqueMap = new Map<string, typeof parsed[0]>();
    parsed.forEach((item) => uniqueMap.set(item.time as string, item));
    const sorted = Array.from(uniqueMap.values()).sort((a, b) => ((a.time as string) > (b.time as string) ? 1 : -1));

    const candlesticks: CandlestickData[] = sorted.map((c) => ({
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    const volumes: HistogramData[] = sorted
      .filter((c) => typeof c.volume === 'number' && Number.isFinite(c.volume) && c.volume >= 0)
      .map((c) => ({
        time: c.time,
        value: c.volume as number,
        color: c.close >= c.open ? 'rgba(34, 197, 94, 0.35)' : 'rgba(239, 68, 68, 0.35)',
      }));

    const emaSource = sorted.map((c) => ({ time: c.time, close: c.close }));

    return { candlesticks, volumes, emaSource };
  }, [candles]);

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const palet = bacaPaletChart();

    // Create TradingView Chart
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: palet.latar },
        textColor: palet.teks,
        fontSize: 11,
        // --font-geist-mono tidak pernah didefinisikan di mana pun (app/layout.tsx hanya
        // menyediakan --font-inter dan --font-jetbrains-mono), jadi label harga & sumbu
        // selama ini jatuh ke monospace generik - satu-satunya angka di aplikasi yang
        // fontnya berbeda dari sisanya.
        fontFamily: 'var(--font-jetbrains-mono), ui-monospace, monospace',
      },
      grid: {
        vertLines: { color: palet.kisi },
        horzLines: { color: palet.kisi },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: palet.bidik,
          width: 1,
          style: 3,
          labelBackgroundColor: palet.latar,
        },
        horzLine: {
          color: palet.bidik,
          width: 1,
          style: 3,
          labelBackgroundColor: palet.latar,
        },
      },
      timeScale: {
        borderColor: palet.garis,
        timeVisible: false,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: palet.garis,
        scaleMargins: {
          top: 0.1,
          bottom: 0.2,
        },
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });

    chartRef.current = chart;

    // 1. Candlestick Series
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });
    candleSeriesRef.current = candleSeries;

    // 2. Volume Series (sub-layer)
    const volumeSeries = chart.addHistogramSeries({
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: '', // overlay
    });
    chart.priceScale('').applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });
    volumeSeriesRef.current = volumeSeries;

    // 3. EMA Line Overlays
    const ema20Series = chart.addLineSeries({
      color: '#06b6d4', // cyan
      lineWidth: 2,
      title: 'EMA 20',
      priceLineVisible: false,
      crosshairMarkerVisible: false,
    });
    ema20SeriesRef.current = ema20Series;

    const ema50Series = chart.addLineSeries({
      color: '#f97316', // orange
      lineWidth: 2,
      title: 'EMA 50',
      priceLineVisible: false,
      crosshairMarkerVisible: false,
    });
    ema50SeriesRef.current = ema50Series;

    const ema200Series = chart.addLineSeries({
      color: '#a855f7', // purple
      lineWidth: 2,
      title: 'EMA 200',
      priceLineVisible: false,
      crosshairMarkerVisible: false,
    });
    ema200SeriesRef.current = ema200Series;

    // Subscribe to crosshair moves for interactive HUD
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData || !candleSeriesRef.current) {
        setHoverData(null);
        return;
      }

      const candleData = param.seriesData.get(candleSeriesRef.current) as CandlestickData | undefined;
      const volData = volumeSeriesRef.current ? (param.seriesData.get(volumeSeriesRef.current) as HistogramData | undefined) : undefined;

      if (candleData) {
        const changePct = ((candleData.close - candleData.open) / candleData.open) * 100;
        setHoverData({
          dateStr: String(param.time),
          open: candleData.open,
          high: candleData.high,
          low: candleData.low,
          close: candleData.close,
          volume: volData?.value ?? null,
          changePct: parseFloat(changePct.toFixed(2)),
        });
      }
    });

    // Auto-resize
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight || 420,
        });
      }
    };

    window.addEventListener('resize', handleResize);
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(chartContainerRef.current);

    // Theme mutation observer
    const themeObserver = new MutationObserver(() => {
      if (!chartRef.current) return;
      const p = bacaPaletChart();
      chartRef.current.applyOptions({
        layout: {
          background: { type: ColorType.Solid, color: p.latar },
          textColor: p.teks,
        },
        grid: {
          vertLines: { color: p.kisi },
          horzLines: { color: p.kisi },
        },
        crosshair: {
          vertLine: { color: p.bidik, labelBackgroundColor: p.latar },
          horzLine: { color: p.bidik, labelBackgroundColor: p.latar },
        },
        timeScale: { borderColor: p.garis },
        rightPriceScale: { borderColor: p.garis },
      });
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      themeObserver.disconnect();
      chart.remove();
    };
  }, []);

  // Update data when formattedData changes
  useEffect(() => {
    if (!chartRef.current || !candleSeriesRef.current) return;

    if (formattedData.candlesticks.length > 0) {
      candleSeriesRef.current.setData(formattedData.candlesticks);

      if (volumeSeriesRef.current) {
        volumeSeriesRef.current.setData(showVolume ? formattedData.volumes : []);
      }

      if (ema20SeriesRef.current) {
        const ema20 = calculateEMA(formattedData.emaSource, 20);
        ema20SeriesRef.current.setData(showEMA20 ? ema20 : []);
      }

      if (ema50SeriesRef.current) {
        const ema50 = calculateEMA(formattedData.emaSource, 50);
        ema50SeriesRef.current.setData(showEMA50 ? ema50 : []);
      }

      if (ema200SeriesRef.current) {
        const ema200 = calculateEMA(formattedData.emaSource, 200);
        ema200SeriesRef.current.setData(showEMA200 ? ema200 : []);
      }

      // Default view: last 120 bars (~6 months)
      const totalBars = formattedData.candlesticks.length;
      chartRef.current.timeScale().setVisibleLogicalRange({
        from: Math.max(0, totalBars - 120),
        to: totalBars,
      });
    }
  }, [formattedData, showEMA20, showEMA50, showEMA200, showVolume]);

  const handleRangeChange = (range: '1M' | '3M' | '6M' | '1Y' | 'ALL') => {
    setActiveRange(range);
    if (!chartRef.current || formattedData.candlesticks.length === 0) return;

    const totalBars = formattedData.candlesticks.length;
    let barsToShow = totalBars;

    switch (range) {
      case '1M':
        barsToShow = 22;
        break;
      case '3M':
        barsToShow = 65;
        break;
      case '6M':
        barsToShow = 130;
        break;
      case '1Y':
        barsToShow = 260;
        break;
      case 'ALL':
        barsToShow = totalBars;
        break;
    }

    chartRef.current.timeScale().setVisibleLogicalRange({
      from: Math.max(0, totalBars - barsToShow),
      to: totalBars,
    });
  };

  const handleResetZoom = () => {
    if (chartRef.current) {
      chartRef.current.timeScale().fitContent();
    }
  };

  const latestCandle = formattedData.candlesticks[formattedData.candlesticks.length - 1];
  const displayData = hoverData || (latestCandle ? {
    dateStr: String(latestCandle.time),
    open: latestCandle.open,
    high: latestCandle.high,
    low: latestCandle.low,
    close: latestCandle.close,
    volume: formattedData.volumes[formattedData.volumes.length - 1]?.value ?? null,
    changePct: parseFloat((((latestCandle.close - latestCandle.open) / latestCandle.open) * 100).toFixed(2)),
  } : null);

  return (
    <div className={`relative flex flex-col rounded-2xl border border-tv-border bg-tv-card overflow-hidden shadow-2 ${className}`}>
      {/* Top Interactive Toolbar & Live HUD */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-tv-border bg-tv-card/95 px-4 py-2.5 backdrop-blur-md">
        {/* Left: Ticker & Live OHLCV HUD */}
        <div className="flex items-center gap-3 flex-wrap text-xs">
          <div className="flex items-center gap-2">
            <span className="font-heading font-bold text-tv-text tracking-wide">
              {ticker.replace('.JK', '')}
            </span>
            <span className="text-[10px] text-tv-muted font-mono uppercase bg-tv-hover px-1.5 py-0.5 rounded border border-tv-border">
              Daily
            </span>
          </div>

          {displayData && (
            <div className="flex items-center gap-2.5 font-number text-[11px] text-tv-muted flex-wrap">
              <span className="text-tv-muted font-mono">{displayData.dateStr}</span>
              <span>O: <strong className="text-tv-text">{displayData.open.toLocaleString('id-ID')}</strong></span>
              <span>H: <strong className="text-tv-green">{displayData.high.toLocaleString('id-ID')}</strong></span>
              <span>L: <strong className="text-tv-red">{displayData.low.toLocaleString('id-ID')}</strong></span>
              <span>C: <strong className="text-tv-text">{displayData.close.toLocaleString('id-ID')}</strong></span>
              <span className={`font-bold ${displayData.changePct >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
                {displayData.changePct >= 0 ? '+' : ''}{displayData.changePct}%
              </span>
              {displayData.volume !== null && (
                <span className="hidden md:inline text-tv-muted">
                  Vol: {displayData.volume > 1e6 ? `${(displayData.volume / 1e6).toFixed(2)}M` : displayData.volume.toLocaleString('id-ID')}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Right: Indicators & Range Toggle */}
        <div className="flex items-center gap-2 flex-wrap ml-auto">
          {/* EMA Pills */}
          <div className="flex items-center gap-1 border-r border-tv-border pr-2">
            <Button variant="bare" size="none"
              type="button"
              onClick={() => setShowEMA20(!showEMA20)}
              title="Toggle EMA 20 (Trend Jangka Pendek)"
              className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono transition-all ${
                showEMA20
                  ? 'bg-cyan-500/20 text-cyan-500 dark:text-cyan-400 border border-cyan-500/40 shadow-[0_0_8px_rgba(6,182,212,0.2)]'
                  : 'bg-tv-hover text-tv-muted/40 line-through'
              }`}
            >
              EMA 20
            </Button>

            <Button variant="bare" size="none"
              type="button"
              onClick={() => setShowEMA50(!showEMA50)}
              title="Toggle EMA 50 (Trend Jangka Menengah)"
              className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono transition-all ${
                showEMA50
                  ? 'bg-orange-500/20 text-orange-500 dark:text-orange-400 border border-orange-500/40 shadow-[0_0_8px_rgba(249,115,22,0.2)]'
                  : 'bg-tv-hover text-tv-muted/40 line-through'
              }`}
            >
              EMA 50
            </Button>

            <Button variant="bare" size="none"
              type="button"
              onClick={() => setShowEMA200(!showEMA200)}
              title="Toggle EMA 200 (Garis Batas Bullish/Bearish Mayor)"
              className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono transition-all ${
                showEMA200
                  ? 'bg-purple-500/20 text-purple-500 dark:text-purple-400 border border-purple-500/40 shadow-[0_0_8px_rgba(168,85,247,0.2)]'
                  : 'bg-tv-hover text-tv-muted/40 line-through'
              }`}
            >
              EMA 200
            </Button>

            <Button variant="bare" size="none"
              type="button"
              onClick={() => setShowVPVR(!showVPVR)}
              title="Toggle Volume Profile (VPVR & POC)"
              className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono transition-all ${
                showVPVR
                  ? 'bg-amber-500/20 text-amber-500 dark:text-amber-400 border border-amber-500/40 shadow-[0_0_8px_rgba(245,158,11,0.2)]'
                  : 'bg-tv-hover text-tv-muted/40 line-through'
              }`}
            >
              VPVR / POC
            </Button>

            <Button variant="bare" size="none"
              type="button"
              onClick={() => setShowVolume(!showVolume)}
              title="Toggle Volume Bar"
              aria-label={showVolume ? 'Sembunyikan bar volume' : 'Tampilkan bar volume'}
              className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-all ${
                showVolume ? 'bg-tv-hover text-tv-text' : 'bg-transparent text-tv-muted/40'
              }`}
            >
              <BarChart2 className="h-3 w-3" />
            </Button>
          </div>

          {/* Range Selector */}
          <div className="flex items-center gap-1 bg-tv-hover/50 p-0.5 rounded-lg border border-tv-border">
            {(['1M', '3M', '6M', '1Y', 'ALL'] as const).map((r) => (
              <Button variant="bare" size="none"
                key={r}
                type="button"
                onClick={() => handleRangeChange(r)}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                  activeRange === r
                    ? 'bg-tv-blue text-white shadow-sm'
                    : 'text-tv-muted hover:text-tv-text'
                }`}
              >
                {r === '1M' ? '1B' : r === '3M' ? '3B' : r === '6M' ? '6B' : r === '1Y' ? '1T' : 'Semua'}
              </Button>
            ))}
          </div>

          <Button variant="bare" size="none"
            type="button"
            onClick={handleResetZoom}
            title="Reset Zoom / Fit Content"
            aria-label="Reset zoom chart ke tampilan penuh"
            className="p-1 rounded-lg text-tv-muted hover:text-tv-text hover:bg-tv-hover transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Floating VPVR / POC Legend Badge */}
      {showVPVR && volumeProfile && (
        <div className="absolute top-12 left-4 z-10 flex items-center gap-2 flex-wrap pointer-events-none">
          <div className="flex items-center gap-1.5 rounded-lg bg-tv-card/90 backdrop-blur-md px-2.5 py-1 border border-amber-500/30 text-[10px] font-number text-amber-500 dark:text-amber-300 shadow-md">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span>POC (Point of Control): <strong>Rp {volumeProfile.pocPrice.toLocaleString('id-ID')}</strong></span>
          </div>
          <div className="flex items-center gap-1.5 rounded-lg bg-tv-card/90 backdrop-blur-md px-2 py-1 border border-tv-border text-[10px] font-number text-tv-muted">
            <span>Value Area (70% Vol): <strong className="text-tv-text">Rp {volumeProfile.valPrice.toLocaleString('id-ID')} - {volumeProfile.vahPrice.toLocaleString('id-ID')}</strong></span>
          </div>
        </div>
      )}

      {/* Chart Canvas Area */}
      <div ref={chartContainerRef} className="h-[420px] w-full" />
    </div>
  );
}
