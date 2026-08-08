'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ColorType, createChart, type IChartApi } from 'lightweight-charts';
import FinancialChartToolbar from '@/components/chart/FinancialChartToolbar';
import {
  DEFAULT_CHART_INDICATORS,
  atrSeries,
  bollingerSeries,
  cmfSeries,
  emaSeries,
  heikinAshi,
  indicatorLabel,
  latestFinite,
  macdSeries,
  rsiSeries,
  smaSeries,
  type ChartCandle,
  type ChartType,
  type IndicatorConfig,
} from '@/lib/chart-indicators';

interface CandleData extends ChartCandle {}

interface TechnicalData {
  ma50?: number;
  ma100?: number;
  ma200?: number;
  support_1?: number;
  support_2?: number;
  resistance_1?: number;
  resistance_2?: number;
  cross_status?: string | null;
  money_flow_status?: string | null;
}

interface TradingViewChartProps {
  candles: CandleData[];
  technical: TechnicalData;
  symbol: string;
  height?: number;
  timeframe?: string;
  timeframeOptions?: string[];
  onTimeframeChange?: (timeframe: string) => void;
  variant?: 'compact' | 'full';
  onHoverCandle?: (time: string | null) => void;
}

type HoverIndicatorValue = { label: string; value: string };
type HoverSeriesRef = { series: any; label: string; formatter: (value: number) => string };

const PREFS_KEY = 'sahamlens.chart.preferences.v1';
const OVERLAY_COLORS = ['#f0b90b', '#ab47bc', '#2962ff', '#ff9800', '#26a69a'];
const OSCILLATOR_COLORS = ['#7e57c2', '#42a5f5', '#ffa726', '#26a69a'];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sanitizeIndicators(input: unknown): IndicatorConfig[] {
  if (!Array.isArray(input)) return DEFAULT_CHART_INDICATORS.map((indicator) => ({ ...indicator }));
  const allowed = new Set(['SMA', 'EMA', 'BB', 'VOLUME', 'RSI', 'MACD', 'ATR', 'CMF']);
  const safe = input
    .filter((value): value is IndicatorConfig => Boolean(value && typeof value === 'object' && allowed.has((value as IndicatorConfig).kind)))
    .slice(0, 9)
    .map((indicator, index) => ({
      ...indicator,
      id: typeof indicator.id === 'string' && indicator.id ? indicator.id : `${indicator.kind.toLowerCase()}-${index}`,
      visible: indicator.visible !== false,
    }));
  return safe;
}

function chartTypeLabel(type: ChartType): string {
  switch (type) {
    case 'candlestick': return 'Candlestick';
    case 'bar': return 'OHLC Bars';
    case 'line': return 'Line';
    case 'area': return 'Area';
    case 'baseline': return 'Baseline';
    case 'heikin-ashi': return 'Heikin Ashi';
  }
}

function formatNumber(value: number, digits = 2): string {
  return value.toLocaleString('id-ID', { maximumFractionDigits: digits });
}

function timeKey(time: any): string {
  if (time == null) return '';
  if (typeof time === 'object' && 'year' in time && 'month' in time && 'day' in time) {
    return `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')}`;
  }
  return String(time);
}

function resolveChartHeight(width: number, requestedHeight: number, variant: 'compact' | 'full', fullscreenHeight?: number): number {
  if (fullscreenHeight && fullscreenHeight > 480) {
    return clamp(fullscreenHeight - 165, 420, 900);
  }
  if (variant === 'compact') {
    const natural = width * 0.52;
    return Math.round(clamp(natural, 290, Math.max(360, requestedHeight)));
  }
  const natural = width * 0.58;
  return Math.round(clamp(natural, 360, Math.max(540, requestedHeight)));
}

function paneBounds(index: number, count: number): { start: number; end: number } {
  if (count <= 0) return { start: 1, end: 1 };
  const region = Math.min(0.48, 0.15 * count);
  const startRegion = 1 - region;
  const paneHeight = region / count;
  const gap = Math.min(0.012, paneHeight * 0.08);
  return {
    start: startRegion + index * paneHeight + gap,
    end: startRegion + (index + 1) * paneHeight - gap,
  };
}

export default function TradingViewChart({
  candles,
  technical,
  symbol,
  height = 520,
  timeframe = '1Y',
  timeframeOptions = [],
  onTimeframeChange,
  variant = 'full',
  onHoverCandle,
}: TradingViewChartProps) {
  const isIndexSymbol = symbol.startsWith('^');
  const shellRef = useRef<HTMLDivElement>(null);
  const chartHostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const onHoverCandleRef = useRef(onHoverCandle);
  onHoverCandleRef.current = onHoverCandle;

  const [chartType, setChartType] = useState<ChartType>('candlestick');
  const [indicators, setIndicators] = useState<IndicatorConfig[]>(() => DEFAULT_CHART_INDICATORS.map((indicator) => ({ ...indicator })));
  const [hoverOhlc, setHoverOhlc] = useState<CandleData | null>(candles[candles.length - 1] ?? null);
  const [hoverTime, setHoverTime] = useState<string | null>(candles[candles.length - 1]?.time ?? null);
  const [hoverIndicators, setHoverIndicators] = useState<HoverIndicatorValue[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  const visibleIndicators = useMemo(() => indicators.filter((indicator) => indicator.visible !== false), [indicators]);
  const oscillatorIndicators = useMemo(() => visibleIndicators.filter((indicator) => (
    indicator.kind === 'VOLUME' || indicator.kind === 'RSI' || indicator.kind === 'MACD' || indicator.kind === 'ATR' || indicator.kind === 'CMF'
  )), [visibleIndicators]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(PREFS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as { chartType?: ChartType; indicators?: IndicatorConfig[] };
        const allowedTypes: ChartType[] = ['candlestick', 'bar', 'line', 'area', 'baseline', 'heikin-ashi'];
        if (parsed.chartType && allowedTypes.includes(parsed.chartType)) setChartType(parsed.chartType);
        if (parsed.indicators) setIndicators(sanitizeIndicators(parsed.indicators));
      }
    } catch (error) {
      console.warn('Chart preferences could not be restored:', error);
    } finally {
      setPrefsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!prefsLoaded) return;
    try {
      window.localStorage.setItem(PREFS_KEY, JSON.stringify({ chartType, indicators }));
    } catch (error) {
      console.warn('Chart preferences could not be saved:', error);
    }
  }, [chartType, indicators, prefsLoaded]);

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(document.fullscreenElement === shellRef.current);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (!chartHostRef.current || candles.length === 0) return;

    setHoverOhlc(candles[candles.length - 1] ?? null);
    setHoverTime(candles[candles.length - 1]?.time ?? null);
    setHoverIndicators([]);
    chartHostRef.current.innerHTML = '';

    const activeOscillators = visibleIndicators.filter((indicator) => (
      indicator.kind === 'VOLUME' || indicator.kind === 'RSI' || indicator.kind === 'MACD' || indicator.kind === 'ATR' || indicator.kind === 'CMF'
    ));
    const oscillatorRegion = activeOscillators.length > 0 ? Math.min(0.48, 0.15 * activeOscillators.length) : 0;
    const initialWidth = Math.max(1, chartHostRef.current.clientWidth);
    const initialHeight = resolveChartHeight(initialWidth, height, variant, document.fullscreenElement === shellRef.current ? shellRef.current?.clientHeight : undefined);

    const chart = createChart(chartHostRef.current, {
      width: initialWidth,
      height: initialHeight,
      layout: {
        background: { type: ColorType.Solid, color: '#131722' },
        textColor: '#d1d4dc',
        fontSize: 11,
        fontFamily: 'JetBrains Mono, monospace',
      },
      localization: {
        priceFormatter: (price: number) => isIndexSymbol
          ? price.toLocaleString('id-ID', { maximumFractionDigits: 2 })
          : Math.round(price).toLocaleString('id-ID'),
      },
      grid: {
        vertLines: { color: '#1e222d' },
        horzLines: { color: '#1e222d' },
      },
      crosshair: {
        mode: 1,
        vertLine: { color: '#787b86', width: 1, style: 3, visible: true, labelVisible: true },
        horzLine: { color: '#787b86', width: 1, style: 3, visible: true, labelVisible: true },
      },
      rightPriceScale: {
        borderColor: '#2a2e39',
        scaleMargins: {
          top: 0.08,
          bottom: oscillatorRegion > 0 ? oscillatorRegion + 0.04 : 0.1,
        },
      },
      timeScale: {
        borderColor: '#2a2e39',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
        barSpacing: variant === 'compact' ? 7 : 8,
        minBarSpacing: 1.5,
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

    const intraday = (time: string) => time.includes('T');
    const toChartTime = (time: string): any => intraday(time) ? Math.floor(new Date(time).getTime() / 1000) : time;
    const reverseTimeMap = new Map<string, string>();
    const candleByTime = new Map<string, CandleData>();
    candles.forEach((candle) => {
      const key = timeKey(toChartTime(candle.time));
      reverseTimeMap.set(key, candle.time);
      candleByTime.set(candle.time, candle);
    });

    const sourceCandles = chartType === 'heikin-ashi' ? heikinAshi(candles) : candles;
    let priceSeries: any;

    if (chartType === 'candlestick' || chartType === 'heikin-ashi') {
      priceSeries = chart.addCandlestickSeries({
        upColor: '#089981',
        downColor: '#f23645',
        borderVisible: false,
        wickUpColor: '#089981',
        wickDownColor: '#f23645',
      });
      priceSeries.setData(sourceCandles.map((candle) => ({
        time: toChartTime(candle.time), open: candle.open, high: candle.high, low: candle.low, close: candle.close,
      })));
    } else if (chartType === 'bar') {
      priceSeries = chart.addBarSeries({
        upColor: '#089981',
        downColor: '#f23645',
        thinBars: true,
        openVisible: true,
      });
      priceSeries.setData(candles.map((candle) => ({
        time: toChartTime(candle.time), open: candle.open, high: candle.high, low: candle.low, close: candle.close,
      })));
    } else if (chartType === 'area') {
      priceSeries = chart.addAreaSeries({
        lineColor: '#2962ff',
        topColor: 'rgba(41, 98, 255, 0.32)',
        bottomColor: 'rgba(41, 98, 255, 0.02)',
        lineWidth: 2,
      });
      priceSeries.setData(candles.map((candle) => ({ time: toChartTime(candle.time), value: candle.close })));
    } else if (chartType === 'baseline') {
      priceSeries = chart.addBaselineSeries({
        baseValue: { type: 'price', price: candles[0]?.close ?? 0 },
        topLineColor: '#089981',
        topFillColor1: 'rgba(8, 153, 129, 0.28)',
        topFillColor2: 'rgba(8, 153, 129, 0.03)',
        bottomLineColor: '#f23645',
        bottomFillColor1: 'rgba(242, 54, 69, 0.03)',
        bottomFillColor2: 'rgba(242, 54, 69, 0.28)',
        lineWidth: 2,
      });
      priceSeries.setData(candles.map((candle) => ({ time: toChartTime(candle.time), value: candle.close })));
    } else {
      priceSeries = chart.addLineSeries({ color: '#2962ff', lineWidth: 2 });
      priceSeries.setData(candles.map((candle) => ({ time: toChartTime(candle.time), value: candle.close })));
    }

    if (technical.support_1 != null) {
      priceSeries.createPriceLine({
        price: technical.support_1,
        color: '#089981',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: `S1 ${Math.round(technical.support_1).toLocaleString('id-ID')}`,
      });
    }
    if (technical.resistance_1 != null) {
      priceSeries.createPriceLine({
        price: technical.resistance_1,
        color: '#f23645',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: `R1 ${Math.round(technical.resistance_1).toLocaleString('id-ID')}`,
      });
    }

    const hoverSeries: HoverSeriesRef[] = [];
    let overlayColorIndex = 0;
    let oscillatorColorIndex = 0;

    const addValueLine = (values: Array<number | null>, color: string, title: string, scaleId?: string, lineWidth = 1) => {
      const series = chart.addLineSeries({
        color,
        lineWidth: lineWidth as any,
        title,
        priceScaleId: scaleId,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      series.setData(values.flatMap((value, index) => value == null ? [] : [{ time: toChartTime(candles[index].time), value }]));
      return series;
    };

    visibleIndicators.filter((indicator) => indicator.kind === 'SMA' || indicator.kind === 'EMA' || indicator.kind === 'BB').forEach((indicator) => {
      const color = OVERLAY_COLORS[overlayColorIndex % OVERLAY_COLORS.length];
      overlayColorIndex += 1;
      if (indicator.kind === 'SMA') {
        const values = smaSeries(candles, indicator.period ?? 20);
        const series = addValueLine(values, color, indicatorLabel(indicator));
        hoverSeries.push({ series, label: indicatorLabel(indicator), formatter: (value) => formatNumber(value, isIndexSymbol ? 2 : 0) });
      } else if (indicator.kind === 'EMA') {
        const values = emaSeries(candles, indicator.period ?? 20);
        const series = addValueLine(values, color, indicatorLabel(indicator));
        hoverSeries.push({ series, label: indicatorLabel(indicator), formatter: (value) => formatNumber(value, isIndexSymbol ? 2 : 0) });
      } else {
        const bands = bollingerSeries(candles, indicator.period ?? 20, indicator.stdDev ?? 2);
        const middle = addValueLine(bands.middle, color, `${indicatorLabel(indicator)} Mid`);
        const upper = addValueLine(bands.upper, 'rgba(41, 98, 255, 0.8)', `${indicatorLabel(indicator)} Upper`);
        const lower = addValueLine(bands.lower, 'rgba(41, 98, 255, 0.8)', `${indicatorLabel(indicator)} Lower`);
        hoverSeries.push(
          { series: middle, label: 'BB Mid', formatter: (value) => formatNumber(value, isIndexSymbol ? 2 : 0) },
          { series: upper, label: 'BB Up', formatter: (value) => formatNumber(value, isIndexSymbol ? 2 : 0) },
          { series: lower, label: 'BB Low', formatter: (value) => formatNumber(value, isIndexSymbol ? 2 : 0) },
        );
      }
    });

    activeOscillators.forEach((indicator, paneIndex) => {
      const scaleId = `indicator-${paneIndex}`;
      const bounds = paneBounds(paneIndex, activeOscillators.length);
      const applyPaneScale = () => chart.priceScale(scaleId).applyOptions({
        scaleMargins: { top: bounds.start, bottom: 1 - bounds.end },
      });
      const color = OSCILLATOR_COLORS[oscillatorColorIndex % OSCILLATOR_COLORS.length];
      oscillatorColorIndex += 1;

      if (indicator.kind === 'VOLUME') {
        const series = chart.addHistogramSeries({
          priceScaleId: scaleId,
          priceFormat: { type: 'volume' },
          priceLineVisible: false,
          lastValueVisible: false,
        });
        series.setData(candles.map((candle) => ({
          time: toChartTime(candle.time),
          value: candle.volume,
          color: candle.close >= candle.open ? 'rgba(8, 153, 129, 0.45)' : 'rgba(242, 54, 69, 0.45)',
        })));
        applyPaneScale();
        hoverSeries.push({ series, label: 'Vol', formatter: (value) => value.toLocaleString('id-ID', { notation: value >= 1_000_000 ? 'compact' : 'standard', maximumFractionDigits: 1 }) });
        return;
      }

      if (indicator.kind === 'RSI') {
        const values = rsiSeries(candles, indicator.period ?? 14);
        const series = addValueLine(values, color, indicatorLabel(indicator), scaleId, 2);
        applyPaneScale();
        const guide30 = addValueLine(candles.map(() => 30), 'rgba(120, 123, 134, 0.55)', 'RSI 30', scaleId);
        const guide70 = addValueLine(candles.map(() => 70), 'rgba(120, 123, 134, 0.55)', 'RSI 70', scaleId);
        guide30.applyOptions({ lineStyle: 2, lastValueVisible: false });
        guide70.applyOptions({ lineStyle: 2, lastValueVisible: false });
        hoverSeries.push({ series, label: indicatorLabel(indicator), formatter: (value) => value.toFixed(1) });
        return;
      }

      if (indicator.kind === 'MACD') {
        const values = macdSeries(candles, indicator.fast ?? 12, indicator.slow ?? 26, indicator.signal ?? 9);
        const macdLine = addValueLine(values.macd, color, 'MACD', scaleId, 2);
        applyPaneScale();
        const signalLine = addValueLine(values.signal, '#f0b90b', 'Signal', scaleId, 1);
        const histogram = chart.addHistogramSeries({ priceScaleId: scaleId, priceLineVisible: false, lastValueVisible: false });
        histogram.setData(values.histogram.flatMap((value, index) => value == null ? [] : [{
          time: toChartTime(candles[index].time), value, color: value >= 0 ? 'rgba(8, 153, 129, 0.5)' : 'rgba(242, 54, 69, 0.5)',
        }]));
        hoverSeries.push(
          { series: macdLine, label: 'MACD', formatter: (value) => formatNumber(value, 2) },
          { series: signalLine, label: 'Signal', formatter: (value) => formatNumber(value, 2) },
        );
        return;
      }

      if (indicator.kind === 'ATR') {
        const values = atrSeries(candles, indicator.period ?? 14);
        const series = addValueLine(values, color, indicatorLabel(indicator), scaleId, 2);
        applyPaneScale();
        hoverSeries.push({ series, label: indicatorLabel(indicator), formatter: (value) => formatNumber(value, 2) });
        return;
      }

      if (indicator.kind === 'CMF') {
        const values = cmfSeries(candles, indicator.period ?? 20);
        const series = addValueLine(values, color, indicatorLabel(indicator), scaleId, 2);
        applyPaneScale();
        const zero = addValueLine(candles.map(() => 0), 'rgba(120, 123, 134, 0.55)', 'CMF 0', scaleId);
        zero.applyOptions({ lineStyle: 2, lastValueVisible: false });
        hoverSeries.push({ series, label: indicatorLabel(indicator), formatter: (value) => value.toFixed(3) });
      }
    });

    chart.timeScale().fitContent();

    const handleCrosshairMove = (param: any) => {
      const originalTime = param.time != null ? reverseTimeMap.get(timeKey(param.time)) : null;
      onHoverCandleRef.current?.(originalTime ?? null);
      const candle = originalTime ? candleByTime.get(originalTime) : null;
      setHoverOhlc(candle ?? candles[candles.length - 1] ?? null);
      setHoverTime(originalTime ?? candles[candles.length - 1]?.time ?? null);

      if (!param.seriesData || typeof param.seriesData.get !== 'function') {
        setHoverIndicators([]);
        return;
      }
      const values: HoverIndicatorValue[] = [];
      hoverSeries.forEach((entry) => {
        const data = param.seriesData.get(entry.series) as any;
        const value = typeof data?.value === 'number' ? data.value : typeof data?.close === 'number' ? data.close : null;
        if (value != null && Number.isFinite(value)) values.push({ label: entry.label, value: entry.formatter(value) });
      });
      setHoverIndicators(values.slice(0, 8));
    };
    chart.subscribeCrosshairMove(handleCrosshairMove);

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || !chartHostRef.current || chartRef.current !== chart) return;
      const width = Math.max(1, Math.floor(entry.contentRect.width));
      const shellHeight = document.fullscreenElement === shellRef.current ? shellRef.current?.clientHeight : undefined;
      const nextHeight = resolveChartHeight(width, height, variant, shellHeight);
      chart.resize(width, nextHeight);
    });
    resizeObserver.observe(chartHostRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      chart.remove();
      if (chartRef.current === chart) chartRef.current = null;
    };
  }, [candles, chartType, height, isIndexSymbol, technical.resistance_1, technical.support_1, variant, visibleIndicators]);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement === shellRef.current) {
        await document.exitFullscreen();
      } else if (shellRef.current?.requestFullscreen) {
        await shellRef.current.requestFullscreen();
      }
    } catch (error) {
      console.warn('Fullscreen chart tidak tersedia:', error);
    }
  };

  const resetChart = () => {
    setChartType('candlestick');
    setIndicators(DEFAULT_CHART_INDICATORS.map((indicator) => ({ ...indicator })));
    requestAnimationFrame(() => chartRef.current?.timeScale().fitContent());
  };

  const displayedSymbol = symbol.startsWith('^') ? symbol : (symbol.endsWith('.JK') ? symbol : `${symbol}.JK`);
  const change = hoverOhlc ? hoverOhlc.close - hoverOhlc.open : 0;
  const changePct = hoverOhlc?.open ? (change / hoverOhlc.open) * 100 : 0;

  const paneLabels = useMemo(() => oscillatorIndicators.map((indicator, index) => {
    let latest: number | null = null;
    if (indicator.kind === 'RSI') latest = latestFinite(rsiSeries(candles, indicator.period ?? 14));
    else if (indicator.kind === 'ATR') latest = latestFinite(atrSeries(candles, indicator.period ?? 14));
    else if (indicator.kind === 'CMF') latest = latestFinite(cmfSeries(candles, indicator.period ?? 20));
    else if (indicator.kind === 'MACD') latest = latestFinite(macdSeries(candles, indicator.fast ?? 12, indicator.slow ?? 26, indicator.signal ?? 9).macd);
    const bounds = paneBounds(index, oscillatorIndicators.length);
    return {
      id: indicator.id,
      label: indicatorLabel(indicator),
      latest: latest == null ? null : indicator.kind === 'RSI' ? latest.toFixed(1) : latest.toFixed(2),
      top: `${bounds.start * 100}%`,
    };
  }), [candles, oscillatorIndicators]);

  return (
    <div
      ref={shellRef}
      className={`min-w-0 overflow-hidden border border-tv-border bg-tv-card shadow-1 ${isFullscreen ? 'h-screen w-screen rounded-none' : 'rounded-xl'}`}
    >
      <FinancialChartToolbar
        symbol={displayedSymbol}
        timeframe={timeframe}
        timeframeOptions={timeframeOptions}
        onTimeframeChange={onTimeframeChange}
        chartType={chartType}
        onChartTypeChange={setChartType}
        indicators={indicators}
        onIndicatorsChange={setIndicators}
        onFitContent={() => chartRef.current?.timeScale().fitContent()}
        onReset={resetChart}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
        variant={variant}
      />

      <div className="flex min-w-0 flex-col gap-2 border-b border-tv-border px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="shrink-0 font-mono text-sm font-bold tracking-wide text-white">{displayedSymbol}</span>
          <span className="shrink-0 rounded-md bg-tv-hover px-2 py-1 text-[10px] font-semibold text-tv-muted">{timeframe === 'ALL' ? 'MAX' : timeframe}</span>
          <span className="hidden truncate text-[11px] text-tv-muted md:inline">{chartTypeLabel(chartType)}{chartType === 'heikin-ashi' ? ' · derived visual' : ''}</span>
          <span className={`hidden shrink-0 rounded-md border px-2 py-1 text-[10px] font-semibold sm:inline ${
            !technical.cross_status
              ? 'border-tv-border bg-tv-hover text-tv-muted'
              : technical.cross_status.includes('BULLISH')
                ? 'border-tv-green/30 bg-tv-green/10 text-tv-green'
                : technical.cross_status.includes('BEARISH')
                  ? 'border-tv-red/30 bg-tv-red/10 text-tv-red'
                  : 'border-tv-border bg-tv-hover text-tv-muted'
          }`}>
            {technical.cross_status || 'MA N/A'}
          </span>
        </div>

        <div className="min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex w-max items-center gap-3 text-[10px] font-mono text-tv-muted">
            <span>MA50 <strong className="text-tv-text">{technical.ma50 != null ? formatNumber(technical.ma50, isIndexSymbol ? 2 : 0) : 'N/A'}</strong></span>
            <span>MA200 <strong className="text-tv-text">{technical.ma200 != null ? formatNumber(technical.ma200, isIndexSymbol ? 2 : 0) : 'N/A'}</strong></span>
            <span>CMF20 <strong className="text-tv-text">{technical.money_flow_status || 'N/A'}</strong></span>
          </div>
        </div>
      </div>

      <div className="relative min-w-0 overflow-hidden bg-[#131722]">
        <div ref={chartHostRef} className="min-w-0 w-full" />

        {hoverOhlc && (
          <div className="pointer-events-none absolute left-2 top-2 z-20 max-w-[calc(100%-1rem)] overflow-hidden rounded-lg border border-tv-border/70 bg-tv-card/90 px-2.5 py-2 shadow-lg backdrop-blur-sm sm:left-3 sm:top-3">
            <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-mono">
              <span className="text-tv-muted">{hoverTime ? hoverTime.replace('T', ' ').replace('.000Z', ' UTC') : ''}</span>
              <span className={change >= 0 ? 'text-tv-green' : 'text-tv-red'}>{change >= 0 ? '+' : ''}{changePct.toFixed(2)}%</span>
            </div>
            <div className="flex max-w-full flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-mono sm:text-[11px]">
              <span className="text-tv-muted">O <strong className="text-tv-text">{formatNumber(hoverOhlc.open, isIndexSymbol ? 2 : 0)}</strong></span>
              <span className="text-tv-muted">H <strong className="text-tv-green">{formatNumber(hoverOhlc.high, isIndexSymbol ? 2 : 0)}</strong></span>
              <span className="text-tv-muted">L <strong className="text-tv-red">{formatNumber(hoverOhlc.low, isIndexSymbol ? 2 : 0)}</strong></span>
              <span className="text-tv-muted">C <strong className={hoverOhlc.close >= hoverOhlc.open ? 'text-tv-green' : 'text-tv-red'}>{formatNumber(hoverOhlc.close, isIndexSymbol ? 2 : 0)}</strong></span>
              {hoverIndicators.map((item) => (
                <span key={`${item.label}-${item.value}`} className="text-tv-muted">{item.label} <strong className="text-tv-text">{item.value}</strong></span>
              ))}
            </div>
          </div>
        )}

        {paneLabels.map((pane) => (
          <div key={pane.id} className="pointer-events-none absolute left-0 right-0 z-10 border-t border-tv-border/70" style={{ top: pane.top }}>
            <span className="absolute left-2 top-1 rounded bg-[#131722]/85 px-1.5 py-0.5 text-[9px] font-mono font-semibold text-tv-muted sm:left-3 sm:text-[10px]">
              {pane.label}{pane.latest != null ? `  ${pane.latest}` : ''}
            </span>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-tv-border bg-tv-bg/70 px-3 py-2 text-[10px] text-tv-muted sm:px-4">
        <span className="truncate">Mouse/touch: pan · wheel/pinch: zoom · crosshair: OHLC + indikator</span>
        {chartType === 'heikin-ashi' && <span className="shrink-0 text-tv-yellow">HA hanya visual turunan OHLC</span>}
      </div>
    </div>
  );
}
