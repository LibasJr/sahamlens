'use me';
'use client';

import React, { useEffect, useRef } from 'react';
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
  cross_status?: string;
  broker_flow_status?: string;
  net_flow_billion_idr?: number;
}

interface TradingViewChartProps {
  candles: CandleData[];
  technical: TechnicalData;
  symbol: string;
  height?: number;
  timeframe?: string;
}

export default function TradingViewChart({
  candles,
  technical,
  symbol,
  height = 480,
  timeframe = '1M'
}: TradingViewChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current || !candles || candles.length === 0) return;

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

    // Candlestick Series
    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#089981',
      downColor: '#f23645',
      borderVisible: false,
      wickUpColor: '#089981',
      wickDownColor: '#f23645'
    });

    const formattedCandles = candles.map((c) => ({
      time: c.time,
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
      time: c.time,
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
        return { time: c.time, value: avg };
      }).filter((item): item is { time: string; value: number } => item !== null);
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
        return { time: c.time, value: avg };
      }).filter((item): item is { time: string; value: number } => item !== null);
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
      chart.remove();
    };
  }, [candles, technical, height]);

  return (
    <div className="bg-tv-card border border-tv-border rounded-xl p-4 flex flex-col gap-3 shadow-lg">
      {/* Chart Top Information Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-tv-border pb-3">
        <div className="flex items-center gap-3">
          <span className="font-bold font-mono text-base text-white tracking-wider">
            {symbol.endsWith('.JK') ? symbol : `${symbol}.JK`}
          </span>
          <span className="text-xs text-tv-muted font-mono">{timeframe === 'ALL' ? '15Y' : timeframe} Candlestick</span>
          <span className={`text-xs font-mono font-semibold px-2 py-0.5 rounded border ${
            (technical.cross_status || '').includes('BULLISH')
              ? 'bg-tv-green/10 text-tv-green border-tv-green/30'
              : 'bg-tv-red/10 text-tv-red border-tv-red/30'
          }`}>
            {technical.cross_status || 'MA STATUS'}
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
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-tv-green" />
            <span className="text-tv-text font-bold">Bandar Flow: {technical.broker_flow_status || 'AKUMULASI'}</span>
          </div>
        </div>
      </div>

      {/* Lightweight Chart Render Canvas */}
      <div ref={chartContainerRef} className="w-full rounded-lg overflow-hidden relative" />
    </div>
  );
}
