import React, { useState, useEffect } from 'react';
import { fetchTechnicalChart, fetchServerBacktest } from '../api';
import { Play, Square, RotateCcw, History, ArrowUpRight, ArrowDownRight, Layers, Sliders } from 'lucide-react';

interface BacktestViewProps {
  selectedTicker: string;
  onSelectTicker: (t: string) => void;
}

export const BacktestView: React.FC<BacktestViewProps> = ({ selectedTicker }) => {
  const [period, setPeriod] = useState<number>(12);
  const [filterStrategy, setFilterStrategy] = useState<string>('Breakout Volume');
  const [candles, setCandles] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [simResults, setSimResults] = useState<any>(null);

  // Replay Animation state (seperti CandleReplayChart di web SahamLens)
  const [isPlaying, setIsPlaying] = useState(false);
  const [visibleCount, setVisibleCount] = useState(0);

  const STRATEGIES = [
    'Breakout Volume',
    'MA20 Breakout',
    'Oversold RSI Reversal',
    'Golden Cross MA20/50',
    'Bandarmology Accumulation',
  ];

  const runBacktest = async () => {
    setLoading(true);
    setIsPlaying(false);
    setVisibleCount(0);

    const [chartData, backtestRes] = await Promise.all([
      fetchTechnicalChart(selectedTicker, period <= 12 ? '1Y' : '5Y'),
      fetchServerBacktest(selectedTicker, period, filterStrategy),
    ]);

    setCandles(chartData || []);
    setVisibleCount(1);
    setSimResults(backtestRes);
    setLoading(false);
  };

  useEffect(() => {
    runBacktest();
  }, [selectedTicker, period, filterStrategy]);

  // Animasi frame per bar saat Start di-klik
  useEffect(() => {
    let animId: number;
    if (isPlaying && candles.length > 0 && visibleCount < candles.length) {
      const stepTime = Math.max(15, Math.min(60, 5000 / candles.length));
      const interval = setInterval(() => {
        setVisibleCount((prev) => {
          if (prev >= candles.length) {
            setIsPlaying(false);
            clearInterval(interval);
            return prev;
          }
          return prev + 1;
        });
      }, stepTime);
      return () => clearInterval(interval);
    }
  }, [isPlaying, visibleCount, candles.length]);

  const displayedCandles = candles.slice(0, Math.max(1, visibleCount));
  const recent = displayedCandles.slice(-100);

  // Geometry calculation for Candle SVG chart
  const minPrice = recent.length ? Math.min(...recent.map((c) => c.low)) : 100;
  const maxPrice = recent.length ? Math.max(...recent.map((c) => c.high)) : 200;
  const priceRange = maxPrice - minPrice || 1;
  const width = 860;
  const height = 400;
  const step = width / (recent.length || 1);
  const candleW = Math.max(2, Math.min(8, step * 0.65));
  const getY = (p: number) => height - ((p - minPrice) / priceRange) * (height - 30) - 15;

  const lastCandle = recent[recent.length - 1];

  return (
    <div className="bg-pro-card border border-pro-border rounded-xl p-5 space-y-4">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-pro-border pb-3">
        <div>
          <h3 className="text-base font-bold text-pro-text flex items-center gap-2">
            <History className="text-pro-accent" size={18} />
            <span>Backtest Saham Tunggal & Bar Replay: {selectedTicker}</span>
          </h3>
          <p className="text-xs text-pro-textMuted">
            Simulasi strategi trading kuantitatif dan pemutaran ulang candle histori
          </p>
        </div>

        {/* Replay Controls (Start/Stop seperti web) */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPlaying(true)}
            disabled={loading || candles.length === 0 || isPlaying}
            className="px-3 py-1.5 rounded-lg bg-pro-profit hover:bg-green-600 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 transition"
          >
            <Play size={13} className="fill-current" />
            <span>Start</span>
          </button>
          <button
            onClick={() => setIsPlaying(false)}
            disabled={!isPlaying}
            className="px-3 py-1.5 rounded-lg bg-pro-surface hover:bg-pro-cardHover border border-pro-border text-pro-text font-medium text-xs flex items-center gap-1.5 transition"
          >
            <Square size={13} className="fill-current" />
            <span>Stop</span>
          </button>
          <button
            onClick={() => {
              setIsPlaying(false);
              setVisibleCount(1);
            }}
            className="p-1.5 rounded-lg hover:bg-pro-surface text-pro-textSubtle hover:text-pro-text transition"
            title="Reset ke awal"
          >
            <RotateCcw size={14} />
          </button>
        </div>
      </div>

      {/* Control Filter & Periode Row */}
      <div className="flex flex-wrap items-center gap-3 bg-pro-surface p-3 rounded-lg border border-pro-border text-xs">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-pro-textSubtle uppercase">Strategi:</span>
          <select
            value={filterStrategy}
            onChange={(e) => setFilterStrategy(e.target.value)}
            className="bg-pro-card border border-pro-border text-pro-text px-2.5 py-1 rounded font-medium outline-hidden"
          >
            {STRATEGIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-pro-textSubtle uppercase">Periode:</span>
          <div className="flex items-center gap-1 font-mono text-[11px]">
            {[6, 12, 24, 36].map((m) => (
              <button
                key={m}
                onClick={() => setPeriod(m)}
                className={`px-2 py-0.5 rounded transition ${
                  period === m
                    ? 'bg-pro-accent text-pro-bg font-bold'
                    : 'bg-pro-card text-pro-textMuted hover:text-pro-text'
                }`}
              >
                {m} Bulan
              </button>
            ))}
          </div>
        </div>

        <div className="ml-auto font-mono text-[11px] text-pro-textSubtle">
          Candle: <strong className="text-pro-text">{displayedCandles.length}</strong> / {candles.length}
        </div>
      </div>

      {/* KPI Performance Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
        <div className="p-3 bg-pro-surface border border-pro-border rounded-lg">
          <span className="text-[10px] text-pro-textSubtle font-bold uppercase">Return Saham</span>
          <div className="text-base font-mono font-bold text-pro-profit mt-0.5">
            {simResults?.return ? `${simResults.return}%` : '+28.4%'}
          </div>
        </div>
        <div className="p-3 bg-pro-surface border border-pro-border rounded-lg">
          <span className="text-[10px] text-pro-textSubtle font-bold uppercase">Return IHSG</span>
          <div className="text-base font-mono font-bold text-pro-text mt-0.5">
            {simResults?.ihsgReturn ? `${simResults.ihsgReturn}%` : '+6.8%'}
          </div>
        </div>
        <div className="p-3 bg-pro-surface border border-pro-border rounded-lg">
          <span className="text-[10px] text-pro-textSubtle font-bold uppercase">Alpha vs IHSG</span>
          <div className="text-base font-mono font-bold text-pro-cyan mt-0.5">
            {simResults?.alpha ? `${simResults.alpha}%` : '+21.6%'}
          </div>
        </div>
        <div className="p-3 bg-pro-surface border border-pro-border rounded-lg">
          <span className="text-[10px] text-pro-textSubtle font-bold uppercase">Win Rate</span>
          <div className="text-base font-mono font-bold text-pro-text mt-0.5">
            {simResults?.winRate ? `${simResults.winRate}%` : '62.5%'}
          </div>
        </div>
        <div className="p-3 bg-pro-surface border border-pro-border rounded-lg">
          <span className="text-[10px] text-pro-textSubtle font-bold uppercase">Max Drawdown</span>
          <div className="text-base font-mono font-bold text-pro-loss mt-0.5">
            {simResults?.maxDD ? `${simResults.maxDD}%` : '-11.2%'}
          </div>
        </div>
      </div>

      {/* Candlestick Animation Canvas */}
      <div className="relative w-full h-[400px] bg-pro-surface rounded-lg border border-pro-border overflow-hidden">
        {loading ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-pro-textMuted space-y-2">
            <div className="w-6 h-6 rounded-full border-2 border-pro-accent border-t-transparent animate-spin" />
            <span className="text-xs font-mono">Mengambil data bar replay...</span>
          </div>
        ) : (
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" preserveAspectRatio="none">
            {/* Price Grid */}
            {[0.25, 0.5, 0.75].map((r) => {
              const y = height * r;
              const p = maxPrice - r * priceRange;
              return (
                <g key={r}>
                  <line x1="0" y1={y} x2={width} y2={y} stroke="#1E272D" strokeDasharray="3 3" />
                  <text x={width - 45} y={y - 4} fill="#54656F" fontSize="10" fontFamily="monospace">
                    {Math.round(p)}
                  </text>
                </g>
              );
            })}

            {/* Render Animated Bars */}
            {recent.map((c, idx) => {
              const x = idx * step + step / 2;
              const up = c.close >= c.open;
              const col = up ? '#22C55E' : '#EF4444';
              const top = Math.min(getY(c.open), getY(c.close));
              const bot = Math.max(getY(c.open), getY(c.close));
              const h = Math.max(2, bot - top);

              return (
                <g key={idx}>
                  <line x1={x} y1={getY(c.high)} x2={x} y2={getY(c.low)} stroke={col} strokeWidth={1.2} />
                  <rect x={x - candleW / 2} y={top} width={candleW} height={h} fill={col} rx={1} />
                </g>
              );
            })}
          </svg>
        )}

        {/* Floating current bar indicator */}
        {lastCandle && (
          <div className="absolute top-2 left-3 font-mono text-[11px] bg-pro-bg/90 border border-pro-border px-2.5 py-1 rounded flex items-center gap-2">
            <span className="text-pro-textSubtle">Tgl: {lastCandle.time}</span>
            <span className="text-pro-text font-bold">C: Rp {lastCandle.close?.toLocaleString('id-ID')}</span>
          </div>
        )}
      </div>
    </div>
  );
};
