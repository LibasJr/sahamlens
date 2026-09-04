import React, { useState, useEffect } from 'react';
import { fetchTechnicalChart } from '../api';
import { Play, RotateCcw, TrendingUp, TrendingDown, Eye, Layers } from 'lucide-react';

interface ChartWorkspaceProps {
  ticker: string;
}

export const ChartWorkspace: React.FC<ChartWorkspaceProps> = ({ ticker }) => {
  const [candles, setCandles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState('1Y');
  const [activeIndicators, setActiveIndicators] = useState<string[]>(['ema20', 'ema50', 'volume']);
  const [replayIndex, setReplayIndex] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetchTechnicalChart(ticker, timeframe).then((data) => {
      if (mounted) {
        setCandles(data);
        setReplayIndex(data.length);
        setLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, [ticker, timeframe]);

  // Replay timer
  useEffect(() => {
    let timer: any;
    if (isPlaying && replayIndex !== null && replayIndex < candles.length) {
      timer = setInterval(() => {
        setReplayIndex((prev) => {
          if (prev === null || prev >= candles.length) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 70);
    }
    return () => clearInterval(timer);
  }, [isPlaying, replayIndex, candles.length]);

  const visibleCandles = replayIndex !== null ? candles.slice(0, replayIndex) : candles;
  const recent = visibleCandles.slice(-120);

  const toggleIndicator = (id: string) => {
    setActiveIndicators((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-pro-textMuted bg-pro-card rounded-xl border border-pro-border">
        <div className="w-8 h-8 rounded-full border-2 border-pro-accent border-t-transparent animate-spin mb-3" />
        <span className="font-mono text-xs">Memuat Data Candlestick {ticker}...</span>
      </div>
    );
  }

  if (!candles.length) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-pro-textMuted bg-pro-card rounded-xl border border-pro-border">
        <span>Belum ada data riwayat harga untuk {ticker}.</span>
      </div>
    );
  }

  // Calculate coordinates for SVG Canvas Chart
  const minPrice = Math.min(...recent.map((c) => c.low));
  const maxPrice = Math.max(...recent.map((c) => c.high));
  const priceRange = maxPrice - minPrice || 1;
  const maxVol = Math.max(...recent.map((c) => c.volume || 0)) || 1;

  const width = 800;
  const height = 460;
  const chartHeight = height * 0.75;
  const volHeight = height * 0.2;
  const step = width / (recent.length || 1);
  const candleW = Math.max(2, Math.min(8, step * 0.65));

  const getY = (p: number) => chartHeight - ((p - minPrice) / priceRange) * (chartHeight - 30) - 15;

  const lastCandle = recent[recent.length - 1];
  const isUp = lastCandle ? lastCandle.close >= lastCandle.open : true;
  const changeVal = lastCandle ? lastCandle.close - lastCandle.open : 0;
  const changePct = lastCandle && lastCandle.open ? (changeVal / lastCandle.open) * 100 : 0;

  return (
    <div className="bg-pro-card border border-pro-border rounded-xl p-4 flex flex-col gap-3 shadow-sm">
      {/* Chart Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-pro-border pb-3">
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight text-pro-text">{ticker}</h2>
              <span className="text-xs text-pro-textMuted font-mono">BEI • IDR</span>
            </div>
            {lastCandle && (
              <div className="flex items-center gap-2 font-mono text-xs mt-0.5">
                <span className="font-bold text-sm text-pro-text">Rp {lastCandle.close.toLocaleString('id-ID')}</span>
                <span className={`font-semibold px-1.5 py-0.5 rounded text-[11px] ${changePct >= 0 ? 'bg-pro-profitBg text-pro-profit' : 'bg-pro-lossBg text-pro-loss'}`}>
                  {changePct >= 0 ? '+' : ''}{changePct.toFixed(2)}% ({changeVal >= 0 ? '+' : ''}{changeVal})
                </span>
                <span className="text-pro-textSubtle ml-2">Vol: {lastCandle.volume ? (lastCandle.volume / 1_000_000).toFixed(1) + 'M' : '—'}</span>
              </div>
            )}
          </div>
        </div>

        {/* Timeframe selector */}
        <div className="flex items-center gap-1 bg-pro-surface p-1 rounded-lg border border-pro-border font-mono text-xs">
          {['1M', '3M', '6M', '1Y', '5Y'].map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-2 py-1 rounded transition ${
                timeframe === tf
                  ? 'bg-pro-accent text-pro-bg font-bold'
                  : 'text-pro-textMuted hover:text-pro-text'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>

        {/* Indicator Toggles */}
        <div className="flex items-center gap-1.5 text-xs">
          <button
            onClick={() => toggleIndicator('ema20')}
            className={`px-2 py-1 rounded border transition ${
              activeIndicators.includes('ema20')
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-400 font-semibold'
                : 'border-pro-border text-pro-textSubtle hover:text-pro-text'
            }`}
          >
            EMA 20
          </button>
          <button
            onClick={() => toggleIndicator('ema50')}
            className={`px-2 py-1 rounded border transition ${
              activeIndicators.includes('ema50')
                ? 'bg-sky-500/15 border-sky-500/40 text-sky-400 font-semibold'
                : 'border-pro-border text-pro-textSubtle hover:text-pro-text'
            }`}
          >
            EMA 50
          </button>
          <button
            onClick={() => toggleIndicator('volume')}
            className={`px-2 py-1 rounded border transition ${
              activeIndicators.includes('volume')
                ? 'bg-pro-accent/15 border-pro-accent/40 text-pro-accent font-semibold'
                : 'border-pro-border text-pro-textSubtle hover:text-pro-text'
            }`}
          >
            Volume Flow
          </button>
        </div>
      </div>

      {/* Candlestick SVG Rendering Engine */}
      <div className="relative w-full h-[460px] bg-pro-surface rounded-lg border border-pro-border overflow-hidden">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full preserve-3d" preserveAspectRatio="none">
          {/* Horizontal Gridlines */}
          {[0.2, 0.4, 0.6, 0.8].map((ratio) => {
            const y = chartHeight * ratio;
            const p = maxPrice - ratio * priceRange;
            return (
              <g key={ratio}>
                <line x1="0" y1={y} x2={width} y2={y} stroke="#1C262C" strokeDasharray="3 3" />
                <text x={width - 50} y={y - 4} fill="#54656F" fontSize="10" fontFamily="monospace">
                  {Math.round(p).toLocaleString('id-ID')}
                </text>
              </g>
            );
          })}

          {/* Candlesticks & Volume Bars */}
          {recent.map((candle, idx) => {
            const x = idx * step + step / 2;
            const up = candle.close >= candle.open;
            const color = up ? '#22C55E' : '#EF4444';
            const top = Math.min(getY(candle.open), getY(candle.close));
            const bot = Math.max(getY(candle.open), getY(candle.close));
            const barH = Math.max(2, bot - top);

            // Volume bar
            const vH = candle.volume ? (candle.volume / maxVol) * volHeight : 2;
            const vY = height - vH;

            return (
              <g key={candle.time || idx}>
                {/* Volume Bar */}
                {activeIndicators.includes('volume') && (
                  <rect
                    x={x - candleW / 2}
                    y={vY}
                    width={candleW}
                    height={vH}
                    fill={up ? '#22C55E' : '#EF4444'}
                    opacity={0.35}
                  />
                )}
                {/* High-Low Wick */}
                <line x1={x} y1={getY(candle.high)} x2={x} y2={getY(candle.low)} stroke={color} strokeWidth={1.2} />
                {/* Candle Body */}
                <rect
                  x={x - candleW / 2}
                  y={top}
                  width={candleW}
                  height={barH}
                  fill={color}
                  rx={1}
                />
              </g>
            );
          })}
        </svg>

        {/* OHLC Tag Overlay */}
        {lastCandle && (
          <div className="absolute top-2 left-3 flex items-center gap-3 font-mono text-[11px] bg-pro-bg/85 backdrop-blur px-2.5 py-1 rounded border border-pro-border text-pro-textMuted">
            <span>Tgl: {lastCandle.time}</span>
            <span>O: <strong className="text-pro-text">{lastCandle.open}</strong></span>
            <span>H: <strong className="text-pro-text">{lastCandle.high}</strong></span>
            <span>L: <strong className="text-pro-text">{lastCandle.low}</strong></span>
            <span>C: <strong className={isUp ? 'text-pro-profit' : 'text-pro-loss'}>{lastCandle.close}</strong></span>
          </div>
        )}
      </div>

      {/* Bottom Replay & Simulation Controls */}
      <div className="flex items-center justify-between pt-1 font-mono text-xs">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="flex items-center gap-1.5 px-3 py-1 rounded bg-pro-surface hover:bg-pro-border border border-pro-border text-pro-text font-sans font-medium transition"
          >
            <Play size={12} className={isPlaying ? 'text-pro-profit fill-current' : ''} />
            <span>{isPlaying ? 'Pause Replay' : 'Play Bar Replay'}</span>
          </button>
          <button
            onClick={() => {
              setIsPlaying(false);
              setReplayIndex(candles.length);
            }}
            className="p-1 rounded hover:bg-pro-surface text-pro-textSubtle hover:text-pro-text transition"
            title="Reset ke Akhir"
          >
            <RotateCcw size={13} />
          </button>
        </div>

        <div className="flex items-center gap-2 text-pro-textSubtle">
          <span>Bar: {visibleCandles.length} / {candles.length}</span>
          <div className="w-24 h-1.5 bg-pro-surface rounded-full overflow-hidden">
            <div
              className="h-full bg-pro-accent transition-all duration-75"
              style={{ width: `${(visibleCandles.length / (candles.length || 1)) * 100}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
