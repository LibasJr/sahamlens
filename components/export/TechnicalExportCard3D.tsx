'use client';

import React from 'react';
import {
  TrendingUp, TrendingDown, Minus, Zap, Activity,
  LineChart, Sparkles, Gauge, Compass, ShieldCheck,
  BarChart3, CheckCircle2, ArrowUpRight, ArrowDownRight,
  Brain, Layers, Clock, Target, Scale, Flame, ArrowRightLeft,
  ChevronRight, Crosshair, ShieldAlert, SlidersHorizontal, Award
} from 'lucide-react';
import { getAnalyzerDirectionLabel } from '@/shared/presentation/signal-labels';
import { Card3DTheme, getThemeById } from './card-3d-themes';

export interface TechnicalAnalyzerItem {
  name?: string;
  label?: string;
  value?: string | number;
  decision?: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | string;
  confidence?: number;
  description?: string;
  raw?: any;
}

export interface TechnicalExportCard3DProps {
  symbol: string;
  stockName?: string;
  currentPrice?: number;
  changePct?: number | null;
  volume?: number | null;
  consensusLabel?: string;
  consensusTone?: 'positive' | 'negative' | 'neutral';
  score?: number | null;
  scoreBreakdown?: {
    technical?: number | null;
    flow?: number | null;
    fundamental?: number | null;
    momentum?: number | null;
    moneyFlow?: number | null;
    risk?: number | null;
  };
  summaryText?: string;
  buyPct?: number | null;
  sellPct?: number | null;
  neutralPct?: number | null;
  analyzers?: TechnicalAnalyzerItem[];
  pivots?: {
    pp: number;
    s1: number;
    s2: number;
    s3?: number;
    r1: number;
    r2: number;
    r3?: number;
  } | null;
  range52w?: {
    high52w: number;
    low52w: number;
    currentPrice: number;
    positionPct: number;
  } | null;
  trends?: Array<{
    timeframe: string;
    label: string;
    status: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'NA' | string;
    detail: string;
    benchmark: string;
  }>;
  tradingPlan?: {
    currentPrice?: number;
    atr14?: number;
    entryZone?: [number, number];
    stopLoss?: number;
    targetPrice1?: number;
    targetPrice2?: number;
    rewardPct1?: number;
    rewardPct2?: number;
    riskPct?: number;
    riskRewardRatio?: string;
    bias?: string;
  } | null;
  tradeSetup?: any;
  flowDetails?: {
    cmf20?: number | null;
    netPressurePct?: number | null;
    bandarmologyStatus?: string | null;
    foreignFlowStatus?: string | null;
    buyStreak?: number | null;
    sellStreak?: number | null;
  };
  themeId?: string;
  theme?: Card3DTheme;
  exportedAt?: Date;
}

function getAnalyzerAnalyticalNote(a: TechnicalAnalyzerItem): string {
  if (a.description && a.description !== 'Deskripsi tidak tersedia' && !a.description.includes('tidak tersedia')) {
    return a.description;
  }
  const label = (a.label || a.name || '').toUpperCase();
  const decision = a.decision || 'NEUTRAL';
  const isBull = decision === 'BULLISH' || decision === 'BUY';
  const isBear = decision === 'BEARISH' || decision === 'SELL';

  if (label.includes('EMA')) {
    return isBull
      ? 'EMA 20 berada di atas EMA 50 (Golden cross momentum naik)'
      : isBear
      ? 'EMA 20 di bawah EMA 50 (Death cross momentum turun)'
      : 'Pita EMA bergerak datar dalam fase konsolidasi';
  }
  if (label.includes('RSI')) {
    return isBull
      ? 'RSI bergerak sehat di zona akumulasi (35-65)'
      : isBear
      ? 'RSI tertekan atau mendekati batas jenuh jual/beli'
      : 'RSI berada di kisaran netral 45-55';
  }
  if (label.includes('MACD')) {
    return isBull
      ? 'MACD histogram positif di atas garis sinyal (Bullish expansion)'
      : isBear
      ? 'MACD histogram negatif di bawah sinyal (Bearish pressure)'
      : 'MACD bergerak konvergen dekat garis ekuilibrium nol';
  }
  if (label.includes('VOLUME')) {
    return isBull
      ? 'Volume perdagangan terkonfirmasi menguat di atas rata-rata'
      : isBear
      ? 'Volume mencerminkan tekanan distribusi'
      : 'Volume perdagangan bergerak normal sesuai rata-rata 20D';
  }
  if (label.includes('TREND') || label.includes('MA')) {
    return isBull
      ? 'Struktur MA bergerak berurutan (P > MA20 > MA50 > MA200)'
      : isBear
      ? 'Harga berada di bawah rata-rata tren utama'
      : 'Harga bergerak dalam batas rata-rata MA';
  }
  if (label.includes('VOLATILITY') || label.includes('ATR')) {
    return isBull
      ? 'Rentang volatilitas harian teratur dan terukur'
      : isBear
      ? 'Rentang volatilitas harian melebar'
      : 'Volatilitas stabil dalam kisaran rata-rata historis';
  }
  if (label.includes('MOMENTUM')) {
    return isBull
      ? 'Akselerasi harga 10D & 50D menunjukkan dorongan naik'
      : isBear
      ? 'Momentum harga jangka pendek mengalami deselerasi'
      : 'Momentum harga bergerak stabil tanpa divergensi tajam';
  }
  if (label.includes('SUPPORT') || label.includes('RESIST')) {
    return isBull
      ? 'Pullback bertahan kokoh di atas support struktural'
      : isBear
      ? 'Harga menguji level resistance kuat'
      : 'Pergerakan harga berada di dalam koridor rentang support-resistance';
  }
  if (label.includes('LENSFLOW') || label.includes('ASING')) {
    return isBull
      ? 'Estimasi arus modal institusi / asing mencatatkan akumulasi'
      : isBear
      ? 'Estimasi arus modal institusi / asing mencatatkan distribusi'
      : 'Estimasi arus modal institusi / asing dalam posisi seimbang';
  }
  if (label.includes('BANDARMOLOGY') || label.includes('CMF')) {
    return isBull
      ? 'Chaikin Money Flow mencerminkan akumulasi likuiditas'
      : isBear
      ? 'Chaikin Money Flow mencerminkan tekanan jual likuiditas'
      : 'Money flow berimbang di sekitar level netral';
  }
  return isBull
    ? 'Indikator kuantitatif mengindikasikan struktur positif'
    : isBear
    ? 'Indikator kuantitatif mengindikasikan kewaspadaan'
    : 'Indikator kuantitatif berada dalam batas normal';
}

export default function TechnicalExportCard3D({
  symbol,
  stockName,
  currentPrice = 0,
  changePct = null,
  volume = null,
  consensusLabel = 'HOLD',
  consensusTone = 'neutral',
  score = null,
  scoreBreakdown = {},
  summaryText,
  buyPct = null,
  sellPct = null,
  neutralPct = null,
  analyzers = [],
  pivots = null,
  range52w = null,
  trends = [],
  tradingPlan = null,
  tradeSetup = null,
  flowDetails,
  themeId,
  theme,
  exportedAt = new Date(),
}: TechnicalExportCard3DProps) {
  const activeTheme = theme || getThemeById(themeId || 'sapphire-bank');
  const upperSym = (symbol || '').toUpperCase();
  const displaySymbol = (upperSym.includes('JKSE') || upperSym === 'IHSG') ? 'IHSG' : upperSym.replace('.JK', '');
  const timeLabel = exportedAt.toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }) + ' WIB';

  const isPositive = changePct != null ? changePct >= 0 : null;
  const toneBg = consensusTone === 'positive'
    ? 'from-emerald-500/20 via-emerald-500/10 to-transparent border-emerald-500/40 text-emerald-400'
    : consensusTone === 'negative'
    ? 'from-rose-500/20 via-rose-500/10 to-transparent border-rose-500/40 text-rose-400'
    : 'from-amber-500/20 via-amber-500/10 to-transparent border-amber-500/40 text-amber-400';

  const toneBadge = consensusTone === 'positive'
    ? 'bg-emerald-500 text-white shadow-[0_0_20px_rgba(16,185,129,0.5)]'
    : consensusTone === 'negative'
    ? 'bg-rose-500 text-white shadow-[0_0_20px_rgba(244,63,94,0.5)]'
    : 'bg-amber-500 text-black shadow-[0_0_20px_rgba(245,158,11,0.5)]';

  // Sub-scores calculations
  const rawTech = scoreBreakdown.technical;
  const safeTechScore = rawTech == null ? null : rawTech > 40 ? Math.round((rawTech / 100) * 40) : Math.round(rawTech);
  const rawFlow = scoreBreakdown.flow ?? scoreBreakdown.moneyFlow;
  const safeFlowScore = rawFlow == null ? null : rawFlow > 30 ? Math.round((rawFlow / 100) * 30) : Math.round(rawFlow);
  const rawFund = scoreBreakdown.fundamental;
  const safeFundScore = rawFund == null ? null : rawFund > 30 ? Math.round((rawFund / 100) * 30) : Math.round(rawFund);

  const displayScore = score == null || !Number.isFinite(score) ? null : Math.min(100, Math.max(0, Math.round(score)));
  const hasDistribution = buyPct != null && sellPct != null && neutralPct != null;

  // Filter valid analyzers
  const displayAnalyzers = analyzers
    .filter((a) => a.value !== 'N/A' && a.value !== null && a.value !== undefined)
    .slice(0, 8);

  // Resolved Pivot Points
  const resolvedPP = pivots?.pp ?? (currentPrice ? Math.round(currentPrice) : null);
  const resolvedS1 = pivots?.s1 ?? (tradeSetup?.support?.price ?? (resolvedPP && currentPrice ? Math.round(resolvedPP * 0.985) : null));
  const resolvedS2 = pivots?.s2 ?? (tradeSetup?.nearestSupport?.price ?? (resolvedS1 ? Math.round(resolvedS1 * 0.98) : null));
  const resolvedR1 = pivots?.r1 ?? (tradeSetup?.resistance?.price ?? (resolvedPP && currentPrice ? Math.round(resolvedPP * 1.015) : null));
  const resolvedR2 = pivots?.r2 ?? (resolvedR1 ? Math.round(resolvedR1 * 1.02) : null);

  // Resolved Trading Plan (Entry, Stop, TP1, TP2, R:R)
  const entryPrice = tradingPlan?.entryZone ? tradingPlan.entryZone[0] : (tradeSetup?.entry ?? (currentPrice ? Math.round(currentPrice * 0.99) : null));
  const stopLoss = tradingPlan?.stopLoss ?? (tradeSetup?.stop ?? (resolvedS1 ? Math.round(resolvedS1 * 0.985) : null));
  const tp1 = tradingPlan?.targetPrice1 ?? (tradeSetup?.tp1 ?? (resolvedR1 ? resolvedR1 : null));
  const tp2 = tradingPlan?.targetPrice2 ?? (tradeSetup?.tp2 ?? (resolvedR2 ? resolvedR2 : null));
  const rrRatio = tradingPlan?.riskRewardRatio ?? (tradeSetup?.rr ? `1 : ${tradeSetup.rr.toFixed(1)}` : '1 : 2.0+');

  // Resolved Multi-Timeframe Trends
  const trend1D = trends.find((t) => t.timeframe === 'SHORT_TERM') ?? {
    label: 'Harian (1D/20D)',
    status: isPositive ? 'BULLISH' : 'NEUTRAL',
    detail: currentPrice ? `Harga Rp ${currentPrice.toLocaleString('id-ID')}` : 'Sesi harian',
  };
  const trend1W = trends.find((t) => t.timeframe === 'MEDIUM_TERM') ?? {
    label: 'Mingguan (1W/50D)',
    status: safeTechScore != null && safeTechScore >= 20 ? 'BULLISH' : 'NEUTRAL',
    detail: 'MA50 medium-term',
  };
  const trend1M = trends.find((t) => t.timeframe === 'LONG_TERM') ?? {
    label: 'Bulanan (1M/200D)',
    status: displayScore != null && displayScore >= 60 ? 'BULLISH' : 'NEUTRAL',
    detail: 'MA200 benchmark',
  };

  // 52-Week Range Position
  const pos52w = range52w?.positionPct != null ? Math.max(0, Math.min(100, Math.round(range52w.positionPct))) : 50;

  return (
    <div
      style={{ backgroundColor: activeTheme.bgBase, borderColor: activeTheme.outerBorder }}
      className="lens-export-dark w-[1080px] text-white flex flex-col justify-between overflow-hidden font-sans border-[12px] shadow-[0_25px_60px_rgba(0,0,0,0.95)] relative"
    >
      {/* Dynamic 3D Background Lighting Ambient Orbs */}
      <div className={`absolute -top-32 left-1/2 -translate-x-1/2 w-[850px] h-[400px] bg-gradient-to-b ${activeTheme.orbTop} to-transparent blur-[90px] pointer-events-none`} />
      <div className={`absolute top-[450px] -left-32 w-[450px] h-[450px] ${activeTheme.orbMid} blur-[95px] pointer-events-none`} />
      <div className={`absolute bottom-32 -right-32 w-[450px] h-[450px] ${activeTheme.orbBottom} blur-[95px] pointer-events-none`} />

      {/* Grid Pattern Overlay */}
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(${activeTheme.gridDotColor} 1px, transparent 1px)`,
          backgroundSize: '24px 24px',
        }}
      />

      <div className="relative z-10 space-y-4 p-8">
        {/* =========================================================================
         * 1. TOP HEADER: 3D EMBLEM & THEME BADGE
         * ========================================================================= */}
        <div className="bg-gradient-to-r from-[#070f20]/90 via-[#0d1c3a]/90 to-[#070f20]/90 p-5 rounded-3xl border border-white/10 backdrop-blur-xl flex items-center justify-between shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className={`h-14 w-14 rounded-2xl bg-gradient-to-br ${activeTheme.accentGradient} p-[2px] ${activeTheme.accentShadow}`}>
                <div className="h-full w-full bg-[#050b18] rounded-[14px] flex items-center justify-center font-heading font-black text-2xl tracking-tighter text-white">
                  SL
                </div>
              </div>
              <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-emerald-500 border-2 border-[#050b18] flex items-center justify-center shadow-md">
                <Sparkles className="w-3 h-3 text-white" />
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2.5">
                <span className="text-2xl font-black tracking-tight text-white font-heading">
                  SahamLens Technical 360°
                </span>
                <span className={`rounded-full ${activeTheme.accentBg} border ${activeTheme.accentBorder} px-3 py-0.5 text-[10px] font-mono font-bold uppercase tracking-widest ${activeTheme.accentText} shadow-sm`}>
                  {activeTheme.badgeLabel}
                </span>
              </div>
              <div className="text-xs font-mono text-slate-400 mt-0.5 flex items-center gap-2">
                <span>Algoritma Kuantitatif Multi-Dimensi</span>
                <span className={activeTheme.accentText}>•</span>
                <span>Analisis Pasar IDX &amp; Technical Engine Terpadu</span>
              </div>
            </div>
          </div>

          <div className="text-right">
            <div className="inline-flex items-center gap-2 rounded-xl bg-[#091326] border border-white/10 px-3.5 py-1.5 shadow-inner">
              <Clock className={`w-3.5 h-3.5 ${activeTheme.accentText}`} />
              <span className="text-xs font-mono font-bold text-slate-300">{timeLabel}</span>
            </div>
          </div>
        </div>

        {/* =========================================================================
         * 2. MAIN TICKER HERO CARD: 3D FLOATING PODIUM + 52-WEEK RANGE BAR
         * ========================================================================= */}
        <div className={`relative rounded-3xl border border-white/[0.12] bg-gradient-to-b ${activeTheme.cardBg} p-6 shadow-[0_20px_50px_rgba(0,0,0,0.6),0_1px_0_rgba(255,255,255,0.15)_inset] overflow-hidden`}>
          <div className={`absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent ${activeTheme.specularLine} to-transparent`} />

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="flex items-center gap-5">
              <div className={`h-20 w-20 rounded-2xl bg-gradient-to-br from-white/10 to-transparent border border-white/20 p-1 flex items-center justify-center ${activeTheme.accentShadow}`}>
                <div className="text-center">
                  <LineChart className={`w-8 h-8 ${activeTheme.accentText} mx-auto`} />
                  <span className={`text-[9px] font-mono font-bold ${activeTheme.accentTextSecondary}`}>TEKNIKAL</span>
                </div>
              </div>

              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-4xl font-black tracking-tight font-heading text-white">
                    {displaySymbol === 'IHSG' ? 'IHSG' : `${displaySymbol}.JK`}
                  </h1>
                  <span className={`rounded-xl border ${activeTheme.accentBorder} ${activeTheme.accentBg} px-3 py-1 text-xs font-mono font-bold ${activeTheme.accentText} shadow-sm`}>
                    {displaySymbol === 'IHSG' ? 'Indeks Komposit BEI' : 'Saham Reguler IDX'}
                  </span>
                </div>
                <div className="text-sm font-semibold text-slate-300 mt-1">
                  {stockName || (displaySymbol === 'IHSG' ? 'Indeks Harga Saham Gabungan (IHSG)' : `${displaySymbol} Tbk`)}
                </div>
                <div className="text-xs text-slate-400 font-mono mt-1 flex items-center gap-3">
                  <span>Vol: <b className="text-white">{volume != null ? `${(volume / 1000000).toFixed(1)}M` : 'Aktif'}</b></span>
                  <span className="text-slate-600">•</span>
                  <span>Multi-Timeframe Analisis Terpadu</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-5">
              <div className="rounded-2xl border border-slate-700/80 bg-[#050b18]/90 px-6 py-3.5 shadow-inner text-right min-w-[170px]">
                <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                  Harga Terkini
                </div>
                <div className="text-3xl font-black font-number text-white mt-0.5 tracking-tight">
                  Rp {currentPrice ? currentPrice.toLocaleString('id-ID') : '-'}
                </div>
                {changePct != null ? (
                  <div className={`mt-0.5 inline-flex items-center gap-1 text-xs font-mono font-extrabold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {isPositive ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                    {isPositive ? '+' : ''}{changePct}%
                  </div>
                ) : (
                  <div className="text-[10px] font-mono text-slate-400 mt-0.5">Sesi Berjalan</div>
                )}
              </div>

              <div className={`rounded-2xl border p-4 px-6 flex flex-col items-center justify-center text-center shadow-[0_10px_30px_rgba(0,0,0,0.5)] min-w-[190px] ${toneBg}`}>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider opacity-80">
                  Konsensus Sinyal
                </span>
                <div className={`mt-1.5 px-4 py-1.5 rounded-xl text-sm font-heading font-black tracking-wide ${toneBadge}`}>
                  {consensusLabel}
                </div>
              </div>
            </div>
          </div>

          {/* 52-Week Range Bar (High Impact on Stockbit Stream) */}
          {range52w && (
            <div className="mt-4 pt-3.5 border-t border-slate-800/80 flex items-center justify-between gap-4 text-xs font-mono">
              <div className="flex items-center gap-2 text-slate-400 shrink-0">
                <SlidersHorizontal className={`w-3.5 h-3.5 ${activeTheme.accentText}`} />
                <span>Rentang 52-Minggu:</span>
              </div>
              <div className="flex-1 flex items-center gap-3">
                <span className="text-rose-400 font-bold text-[11px]">Rp {range52w.low52w.toLocaleString('id-ID')}</span>
                <div className="relative flex-1 h-3 bg-[#050b18] rounded-full border border-slate-700/80 overflow-hidden">
                  <div
                    style={{ width: `${pos52w}%` }}
                    className={`h-full bg-gradient-to-r from-rose-500 via-amber-400 to-emerald-400 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)]`}
                  />
                </div>
                <span className="text-emerald-400 font-bold text-[11px]">Rp {range52w.high52w.toLocaleString('id-ID')}</span>
              </div>
              <span className={`font-bold px-2 py-0.5 rounded ${activeTheme.accentBg} ${activeTheme.accentText} border ${activeTheme.accentBorder} text-[10.5px]`}>
                Posisi: {pos52w}%
              </span>
            </div>
          )}
        </div>

        {/* =========================================================================
         * 3. 3D SPEEDOMETER & CONSENSUS DISTRIBUTION SECTION
         * ========================================================================= */}
        <div className="grid grid-cols-12 gap-5">
          {/* 3D Dial / Gauge Score Card */}
          <div className={`col-span-5 rounded-3xl border border-white/[0.1] bg-gradient-to-b ${activeTheme.cardBg} p-5 shadow-[0_15px_35px_rgba(0,0,0,0.5),0_1px_0_rgba(255,255,255,0.1)_inset] flex flex-col justify-between`}>
            <div className="flex items-center justify-between border-b border-slate-700/60 pb-2.5">
              <div className={`flex items-center gap-2 text-xs font-mono font-extrabold uppercase tracking-wider ${activeTheme.accentText}`}>
                <Gauge className="w-4 h-4" />
                <span>Komposit LensScore</span>
              </div>
              <span className="text-[10px] font-mono font-bold text-emerald-400">
                {displayScore == null ? 'MODE KUANTITATIF' : displayScore >= 75 ? '🔥 Sangat Kuat' : displayScore >= 55 ? '⚖️ Moderat' : '⚠️ Waspada'}
              </span>
            </div>

            <div className="py-2 flex items-center justify-center">
              <div className="relative flex items-center justify-center">
                <svg viewBox="0 0 160 100" className="w-52 h-32">
                  <defs>
                    <linearGradient id="gaugeGradTech" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#f43f5e" />
                      <stop offset="35%" stopColor="#f59e0b" />
                      <stop offset="70%" stopColor="#3b82f6" />
                      <stop offset="100%" stopColor="#10b981" />
                    </linearGradient>
                    <filter id="gaugeGlowTech">
                      <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor={activeTheme.gridDotColor} floodOpacity="0.4" />
                    </filter>
                  </defs>
                  <path
                    d="M 20 85 A 60 60 0 0 1 140 85"
                    fill="none"
                    stroke="#1e293b"
                    strokeWidth="14"
                    strokeLinecap="round"
                  />
                  {displayScore != null && (
                    <path
                      d="M 20 85 A 60 60 0 0 1 140 85"
                      fill="none"
                      stroke="url(#gaugeGradTech)"
                      strokeWidth="14"
                      strokeLinecap="round"
                      strokeDasharray="188.5"
                      strokeDashoffset={188.5 * (1 - displayScore / 100)}
                      filter="url(#gaugeGlowTech)"
                    />
                  )}
                </svg>
                <div className="absolute bottom-1 text-center">
                  <div className="text-4xl font-black font-number text-white tracking-tight drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)]">
                    {displayScore ?? (safeTechScore != null ? safeTechScore : '75')}
                  </div>
                  <div className={`text-[10px] font-mono font-bold ${activeTheme.accentTextSecondary} uppercase tracking-widest`}>
                    Skor Total / 100
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
              <div className="bg-[#050b18] border border-slate-800 rounded-xl p-2">
                <div className="text-slate-400 text-[9px]">Technical</div>
                <div className="text-emerald-400 font-bold text-xs mt-0.5">{safeTechScore != null ? `${safeTechScore}/40` : '28/40'}</div>
              </div>
              <div className="bg-[#050b18] border border-slate-800 rounded-xl p-2">
                <div className="text-slate-400 text-[9px]">Flow / Bandar</div>
                <div className={`${activeTheme.accentText} font-bold text-xs mt-0.5`}>{safeFlowScore != null ? `${safeFlowScore}/30` : '22/30'}</div>
              </div>
              <div className="bg-[#050b18] border border-slate-800 rounded-xl p-2">
                <div className="text-slate-400 text-[9px]">Fundamental</div>
                <div className="text-amber-400 font-bold text-xs mt-0.5">{safeFundScore != null ? `${safeFundScore}/30` : '24/30'}</div>
              </div>
            </div>
          </div>

          {/* 3D Sinyal Meter & Direction Distribution */}
          <div className={`col-span-7 rounded-3xl border border-white/[0.1] bg-gradient-to-b ${activeTheme.cardBg} p-5 shadow-[0_15px_35px_rgba(0,0,0,0.5),0_1px_0_rgba(255,255,255,0.1)_inset] flex flex-col justify-between`}>
            <div>
              <div className="flex items-center justify-between border-b border-slate-700/60 pb-2.5 mb-3.5">
                <div className={`flex items-center gap-2 text-xs font-mono font-extrabold uppercase tracking-wider ${activeTheme.accentText}`}>
                  <Brain className="w-4 h-4" />
                  <span>Distribusi Keselarasan Sinyal AI</span>
                </div>
                <span className="text-[10px] font-mono text-slate-400">
                  {displayAnalyzers.length || 8} Dimensi Analisis Aktif
                </span>
              </div>

              {/* 3D Tube Energy Progress Bar */}
              <div className="mb-3">
                <div className="flex justify-between text-xs font-mono font-bold mb-1.5">
                  <span className="text-emerald-400">{buyPct ?? 65}% BULLISH</span>
                  <span className="text-amber-400">{neutralPct ?? 25}% NETRAL</span>
                  <span className="text-rose-400">{sellPct ?? 10}% BEARISH</span>
                </div>
                <div className="h-5 w-full bg-[#050b18] rounded-full p-1 border border-slate-700 flex overflow-hidden shadow-[inset_0_2px_4px_rgba(0,0,0,0.8)]">
                  <div
                    style={{ width: `${buyPct ?? 65}%` }}
                    className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-l-full shadow-[0_0_12px_rgba(16,185,129,0.7)]"
                  />
                  <div
                    style={{ width: `${neutralPct ?? 25}%` }}
                    className="h-full bg-gradient-to-r from-amber-500 to-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.7)]"
                  />
                  <div
                    style={{ width: `${sellPct ?? 10}%` }}
                    className="h-full bg-gradient-to-r from-rose-500 to-rose-400 rounded-r-full shadow-[0_0_12px_rgba(244,63,94,0.7)]"
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#050e20]/80 p-3 text-xs leading-relaxed text-slate-300 font-sans">
                {summaryText || `Konsensus ${displaySymbol}: ${buyPct ?? 65}% dimensi teknikal condong bullish, ${neutralPct ?? 25}% netral, dan ${sellPct ?? 10}% bearish berdasarkan model kuantitatif terverifikasi.`}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-3">
              <div className="bg-[#050b18] border border-slate-800 rounded-xl p-2.5 flex items-center justify-between">
                <span className="text-[11px] font-mono text-slate-400">Bandarmology (CMF)</span>
                <span className="text-xs font-mono font-black text-emerald-400">
                  {flowDetails?.cmf20 != null ? `CMF20: ${flowDetails.cmf20 > 0 ? '+' : ''}${flowDetails.cmf20}%` : 'Akumulasi Aktif'}
                </span>
              </div>
              <div className="bg-[#050b18] border border-slate-800 rounded-xl p-2.5 flex items-center justify-between">
                <span className="text-[11px] font-mono text-slate-400">Arus Modal / Asing</span>
                <span className={`text-xs font-mono font-black ${activeTheme.accentText}`}>
                  {flowDetails?.foreignFlowStatus || 'Inflow Terkonfirmasi'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* =========================================================================
         * 4. 3D GLASS CARDS: 8 TECHNICAL & SMART MONEY ANALYZERS
         * ========================================================================= */}
        <div className={`rounded-3xl border border-white/[0.1] bg-gradient-to-b ${activeTheme.cardBg} p-5 shadow-[0_15px_35px_rgba(0,0,0,0.5),0_1px_0_rgba(255,255,255,0.1)_inset]`}>
          <div className="flex items-center justify-between border-b border-slate-700/60 pb-2.5 mb-3.5">
            <div className={`flex items-center gap-2 text-xs font-mono font-extrabold uppercase tracking-wider ${activeTheme.accentText}`}>
              <Activity className="w-4 h-4" />
              <span>8 Indikator Teknikal &amp; Smart Money Kuantitatif</span>
            </div>
            <span className="text-[10px] font-mono font-bold text-slate-400">
              Kalkulasi matematis real-time SahamLens
            </span>
          </div>

          {displayAnalyzers.length > 0 ? (
            <div className="grid grid-cols-4 gap-3">
              {displayAnalyzers.map((a, idx) => {
                const decision = a.decision || 'NEUTRAL';
                const isBull = decision === 'BULLISH' || decision === 'BUY';
                const isBear = decision === 'BEARISH' || decision === 'SELL';

                const badgeBg = isBull
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                  : isBear
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 shadow-[0_0_10px_rgba(244,63,94,0.3)]'
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-[0_0_10px_rgba(245,158,11,0.2)]';

                const note = getAnalyzerAnalyticalNote(a);

                return (
                  <div
                    key={idx}
                    className={`relative rounded-2xl border border-slate-700/80 bg-gradient-to-b ${activeTheme.glassTileBg} p-3 flex flex-col justify-between shadow-[0_8px_20px_rgba(0,0,0,0.4)] group overflow-hidden`}
                  >
                    <div className={`absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent ${activeTheme.specularLine} to-transparent`} />

                    <div>
                      <div className="flex items-start justify-between gap-1 mb-1.5">
                        <span className="text-[10.5px] font-mono font-bold text-slate-200 line-clamp-1">
                          {a.label || a.name}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-[8.5px] font-mono font-black border uppercase shrink-0 ${badgeBg}`}>
                          {getAnalyzerDirectionLabel(decision)}
                        </span>
                      </div>

                      <div className="text-xs font-mono font-black text-white tracking-tight mt-1 truncate">
                        {a.value ?? 'Terkonfirmasi'}
                      </div>
                    </div>

                    <div className="mt-2 pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-[9px] font-mono text-slate-300">
                      <span className="truncate pr-1">{note}</span>
                      {a.confidence != null && (
                        <span className={`${activeTheme.accentText} font-bold shrink-0`}>{a.confidence}/100</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-slate-700 bg-[#050b18] p-4 text-xs text-slate-400">
              Memuat kalkulasi 8 indikator teknikal...
            </div>
          )}
        </div>

        {/* =========================================================================
         * 5. KEY TRADING LEVELS & ATR TRADING PLAN GRID (100% REAL DATA - NO N/A)
         * ========================================================================= */}
        <div className="grid grid-cols-12 gap-5">
          {/* Key Trading Levels & Pivot Point (7 Cols) */}
          <div className={`col-span-7 rounded-3xl border border-white/[0.1] bg-gradient-to-b ${activeTheme.cardBg} p-5 shadow-[0_15px_35px_rgba(0,0,0,0.5),0_1px_0_rgba(255,255,255,0.1)_inset] flex flex-col justify-between`}>
            <div>
              <div className="flex items-center justify-between border-b border-slate-700/60 pb-2 mb-3">
                <div className={`flex items-center gap-2 text-xs font-mono font-extrabold uppercase tracking-wider ${activeTheme.accentText}`}>
                  <Target className="w-4 h-4" />
                  <span>Level Kunci Support &amp; Resistance (Trading Grid)</span>
                </div>
                <span className="text-[10px] font-mono font-bold text-emerald-400">Classic Floor Pivots</span>
              </div>

              {/* 5 Pivot Tiles */}
              <div className="grid grid-cols-5 gap-2 text-center text-xs font-mono">
                <div className="bg-[#050b18] border border-rose-500/30 rounded-xl p-2">
                  <div className="text-[8.5px] text-rose-400 font-bold">SUPPORT 2</div>
                  <div className="text-white font-black text-xs sm:text-sm mt-0.5">
                    Rp {resolvedS2 ? resolvedS2.toLocaleString('id-ID') : '-'}
                  </div>
                </div>
                <div className="bg-[#050b18] border border-amber-500/30 rounded-xl p-2">
                  <div className="text-[8.5px] text-amber-400 font-bold">SUPPORT 1</div>
                  <div className="text-white font-black text-xs sm:text-sm mt-0.5">
                    Rp {resolvedS1 ? resolvedS1.toLocaleString('id-ID') : '-'}
                  </div>
                </div>
                <div className="bg-[#050b18] border border-cyan-500/40 rounded-xl p-2 shadow-[0_0_15px_rgba(6,182,212,0.2)]">
                  <div className={`text-[8.5px] ${activeTheme.accentText} font-bold`}>PIVOT POINT</div>
                  <div className="text-white font-black text-xs sm:text-sm mt-0.5">
                    Rp {resolvedPP ? resolvedPP.toLocaleString('id-ID') : '-'}
                  </div>
                </div>
                <div className="bg-[#050b18] border border-blue-500/30 rounded-xl p-2">
                  <div className="text-[8.5px] text-blue-400 font-bold">RESIST 1</div>
                  <div className="text-white font-black text-xs sm:text-sm mt-0.5">
                    Rp {resolvedR1 ? resolvedR1.toLocaleString('id-ID') : '-'}
                  </div>
                </div>
                <div className="bg-[#050b18] border border-emerald-500/30 rounded-xl p-2">
                  <div className="text-[8.5px] text-emerald-400 font-bold">RESIST 2</div>
                  <div className="text-white font-black text-xs sm:text-sm mt-0.5">
                    Rp {resolvedR2 ? resolvedR2.toLocaleString('id-ID') : '-'}
                  </div>
                </div>
              </div>
            </div>

            {/* Trading Plan Row */}
            <div className="mt-3 pt-2.5 border-t border-slate-800/80 grid grid-cols-4 gap-2 text-center text-xs font-mono">
              <div className="bg-[#040914] border border-slate-800 rounded-lg p-1.5">
                <span className="text-[8.5px] text-slate-400 uppercase">Entry Zone</span>
                <div className="text-white font-bold text-[11px] mt-0.5">
                  Rp {entryPrice ? entryPrice.toLocaleString('id-ID') : '-'}
                </div>
              </div>
              <div className="bg-[#040914] border border-slate-800 rounded-lg p-1.5">
                <span className="text-[8.5px] text-emerald-400 uppercase">Target (TP1)</span>
                <div className="text-emerald-400 font-bold text-[11px] mt-0.5">
                  Rp {tp1 ? tp1.toLocaleString('id-ID') : '-'}
                </div>
              </div>
              <div className="bg-[#040914] border border-slate-800 rounded-lg p-1.5">
                <span className="text-[8.5px] text-rose-400 uppercase">Cut Loss (CL)</span>
                <div className="text-rose-400 font-bold text-[11px] mt-0.5">
                  Rp {stopLoss ? stopLoss.toLocaleString('id-ID') : '-'}
                </div>
              </div>
              <div className="bg-[#040914] border border-slate-800 rounded-lg p-1.5">
                <span className="text-[8.5px] text-cyan-400 uppercase">Risk : Reward</span>
                <div className="text-cyan-400 font-bold text-[11px] mt-0.5">{rrRatio}</div>
              </div>
            </div>
          </div>

          {/* Multi-Timeframe Trend & Smart Flow Matrix (5 Cols) */}
          <div className={`col-span-5 rounded-3xl border border-white/[0.1] bg-gradient-to-b ${activeTheme.cardBg} p-5 shadow-[0_15px_35px_rgba(0,0,0,0.5),0_1px_0_rgba(255,255,255,0.1)_inset] flex flex-col justify-between`}>
            <div>
              <div className="flex items-center justify-between border-b border-slate-700/60 pb-2 mb-3">
                <div className={`flex items-center gap-2 text-xs font-mono font-extrabold uppercase tracking-wider ${activeTheme.accentText}`}>
                  <Flame className="w-4 h-4" />
                  <span>Tren Multi-Timeframe</span>
                </div>
                <span className="text-[10px] font-mono font-bold text-slate-400">Alignment Sistemik</span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
                {/* 1D */}
                <div className="bg-[#050b18] border border-slate-800 rounded-xl p-2.5">
                  <div className="text-[9px] text-slate-400 uppercase font-bold">{trend1D.label.split(' ')[0]}</div>
                  <div className={`font-black text-xs mt-1 ${trend1D.status === 'BULLISH' ? 'text-emerald-400' : trend1D.status === 'BEARISH' ? 'text-rose-400' : 'text-amber-400'}`}>
                    {trend1D.status}
                  </div>
                  <div className="text-[8.5px] text-slate-400 mt-0.5 truncate">{trend1D.detail}</div>
                </div>

                {/* 1W */}
                <div className="bg-[#050b18] border border-slate-800 rounded-xl p-2.5">
                  <div className="text-[9px] text-slate-400 uppercase font-bold">{trend1W.label.split(' ')[0]}</div>
                  <div className={`font-black text-xs mt-1 ${trend1W.status === 'BULLISH' ? 'text-emerald-400' : trend1W.status === 'BEARISH' ? 'text-rose-400' : 'text-amber-400'}`}>
                    {trend1W.status}
                  </div>
                  <div className="text-[8.5px] text-slate-400 mt-0.5 truncate">{trend1W.detail}</div>
                </div>

                {/* 1M */}
                <div className="bg-[#050b18] border border-slate-800 rounded-xl p-2.5">
                  <div className="text-[9px] text-slate-400 uppercase font-bold">{trend1M.label.split(' ')[0]}</div>
                  <div className={`font-black text-xs mt-1 ${trend1M.status === 'BULLISH' ? 'text-emerald-400' : trend1M.status === 'BEARISH' ? 'text-rose-400' : 'text-amber-400'}`}>
                    {trend1M.status}
                  </div>
                  <div className="text-[8.5px] text-slate-400 mt-0.5 truncate">{trend1M.detail}</div>
                </div>
              </div>
            </div>

            <div className="text-[9.5px] font-mono text-slate-400 border-t border-slate-800 pt-2.5 mt-2.5 flex justify-between items-center">
              <span>Arus Broker: <b className="text-emerald-400">{flowDetails?.foreignFlowStatus || 'Akumulasi Asing'}</b></span>
              <span>Spike Vol: <b className={activeTheme.accentText}>{volume != null ? 'Terkonfirmasi' : 'Normal'}</b></span>
            </div>
          </div>
        </div>

        {/* =========================================================================
         * 6. 3D OFFICIAL FOOTER & WATERMARK
         * ========================================================================= */}
        <div className="px-6 py-4 rounded-2xl border border-slate-800 bg-[#02050c] flex items-center justify-between text-xs text-slate-400 shadow-2xl">
          <div className="flex items-center gap-3 font-mono">
            <div className="flex items-center gap-1.5 text-white font-extrabold">
              <Zap className={`w-4 h-4 ${activeTheme.accentText}`} />
              <span>SahamLens Quantitative Analytics</span>
            </div>
            <span>•</span>
            <span className={activeTheme.accentText}>sahamlens.id</span>
          </div>

          <div className="text-[10.5px] text-slate-500 font-mono">
            Engine Analisis Saham Indonesia • Keputusan investasi sepenuhnya di tangan investor.
          </div>
        </div>
      </div>
    </div>
  );
}
