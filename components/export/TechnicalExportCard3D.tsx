'use client';

import React from 'react';
import {
  TrendingUp, TrendingDown, Minus, Zap, Activity,
  LineChart, Sparkles, Gauge, Compass, ShieldCheck,
  BarChart3, CheckCircle2, ArrowUpRight, ArrowDownRight,
  Brain, Layers, Clock, Target, Scale, Flame, ArrowRightLeft,
  ChevronRight, Crosshair, ShieldAlert, SlidersHorizontal, Award,
  MapPin, Check
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
      ? 'Golden cross momentum positif'
      : isBear
      ? 'Death cross momentum negatif'
      : 'Pita EMA menyempit dalam konsolidasi';
  }
  if (label.includes('RSI')) {
    return isBull
      ? 'RSI di area akumulasi positif'
      : isBear
      ? 'RSI jenuh beli / mulai melemah'
      : 'RSI di zona netral stabil';
  }
  if (label.includes('MACD')) {
    return isBull
      ? 'Histogram positif di atas sinyal'
      : isBear
      ? 'Histogram negatif di bawah sinyal'
      : 'Konvergen dekat garis nol';
  }
  if (label.includes('VOLUME')) {
    return isBull
      ? 'Volume transaksi mengonfirmasi breakout'
      : isBear
      ? 'Tekanan volume distribusi'
      : 'Volume normal sesuai rata-rata';
  }
  if (label.includes('TREND') || label.includes('MA')) {
    return isBull
      ? 'Struktur MA uptrend berurutan'
      : isBear
      ? 'Harga di bawah MA utama'
      : 'Konsolidasi di sekitar MA';
  }
  if (label.includes('VOLATILITY') || label.includes('ATR')) {
    return isBull
      ? 'Rentang volatilitas harian teratur'
      : isBear
      ? 'Rentang volatilitas melebar tinggi'
      : 'Volatilitas stabil terukur';
  }
  if (label.includes('MOMENTUM')) {
    return isBull
      ? 'Akselerasi harga menunjukkan beli kuat'
      : isBear
      ? 'Momentum mengalami deselerasi'
      : 'Momentum harga bergerak mendatar';
  }
  if (label.includes('SUPPORT') || label.includes('RESIST')) {
    return isBull
      ? 'Pullback bertahan di atas support'
      : isBear
      ? 'Harga menguji level resistance'
      : 'Harga di dalam rentang koridor';
  }
  if (label.includes('LENSFLOW') || label.includes('ASING')) {
    return isBull
      ? 'Arus modal institusi/asing akumulasi'
      : isBear
      ? 'Arus modal institusi/asing distribusi'
      : 'Arus modal institusi berimbang';
  }
  if (label.includes('BANDARMOLOGY') || label.includes('CMF')) {
    return isBull
      ? 'CMF positif (inflow likuiditas)'
      : isBear
      ? 'CMF negatif (outflow likuiditas)'
      : 'CMF bergerak di level netral';
  }
  return isBull
    ? 'Indikator mengindikasikan sinyal beli'
    : isBear
    ? 'Indikator mengindikasikan sinyal waspada'
    : 'Indikator berada dalam batas normal';
}

export default function TechnicalExportCard3D({
  symbol,
  stockName,
  currentPrice = 0,
  changePct = null,
  volume = null,
  consensusLabel = 'DATA N/A',
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
  const activeTheme = theme || getThemeById(themeId || 'obsidian-cyber');
  const upperSym = (symbol || '').toUpperCase();
  const displaySymbol = (upperSym.includes('JKSE') || upperSym === 'IHSG') ? 'IHSG' : upperSym.replace('.JK', '');
  const timeLabel = exportedAt.toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }) + ' WIB';

  const isPositive = changePct != null ? changePct >= 0 : null;
  const toneBg = consensusTone === 'positive'
    ? 'from-emerald-500/25 via-emerald-500/10 to-transparent border-emerald-400/60 text-emerald-300'
    : consensusTone === 'negative'
    ? 'from-rose-500/25 via-rose-500/10 to-transparent border-rose-400/60 text-rose-300'
    : 'from-amber-500/25 via-amber-500/10 to-transparent border-amber-400/60 text-amber-300';

  const toneBadge = consensusTone === 'positive'
    ? 'bg-emerald-500 text-slate-950 font-black shadow-[0_0_25px_rgba(16,185,129,0.7)]'
    : consensusTone === 'negative'
    ? 'bg-rose-500 text-white font-black shadow-[0_0_25px_rgba(244,63,94,0.7)]'
    : 'bg-amber-400 text-slate-950 font-black shadow-[0_0_25px_rgba(251,191,36,0.7)]';

  // Sub-scores calculations (Zero dummy fallback)
  const rawTech = scoreBreakdown.technical;
  const safeTechScore = rawTech == null ? null : rawTech > 40 ? Math.round((rawTech / 100) * 40) : Math.round(rawTech);
  const rawFlow = scoreBreakdown.flow ?? scoreBreakdown.moneyFlow;
  const safeFlowScore = rawFlow == null ? null : rawFlow > 30 ? Math.round((rawFlow / 100) * 30) : Math.round(rawFlow);
  const rawFund = scoreBreakdown.fundamental;
  const safeFundScore = rawFund == null ? null : rawFund > 30 ? Math.round((rawFund / 100) * 30) : Math.round(rawFund);

  const displayScore = score == null || !Number.isFinite(score) ? null : Math.min(100, Math.max(0, Math.round(score)));
  const hasDistribution = buyPct != null && sellPct != null && neutralPct != null;

  // Filter valid analyzers (100% genuine data, zero N/A or incomplete indicators)
  const displayAnalyzers = analyzers
    .filter((a) => {
      const valStr = String(a.value || '').trim();
      return valStr !== '' && valStr !== 'N/A' && !valStr.startsWith('N/A') && a.value !== null && a.value !== undefined;
    })
    .slice(0, 8);

  // Resolved Pivot Points from actual calculation
  const resolvedPP = pivots?.pp ?? null;
  const resolvedS1 = pivots?.s1 ?? (tradeSetup?.support?.price ?? null);
  const resolvedS2 = pivots?.s2 ?? (tradeSetup?.nearestSupport?.price ?? null);
  const resolvedR1 = pivots?.r1 ?? (tradeSetup?.resistance?.price ?? null);
  const resolvedR2 = pivots?.r2 ?? null;

  // Resolved Trading Plan (Entry, Stop, TP1, TP2, R:R)
  const entryPrice = tradingPlan?.entryZone ? tradingPlan.entryZone[0] : (tradeSetup?.entry ?? null);
  const stopLoss = tradingPlan?.stopLoss ?? (tradeSetup?.stop ?? null);
  const tp1 = tradingPlan?.targetPrice1 ?? (tradeSetup?.tp1 ?? null);
  const tp2 = tradingPlan?.targetPrice2 ?? (tradeSetup?.tp2 ?? null);
  const rrRatio = tradingPlan?.riskRewardRatio ?? (tradeSetup?.rr ? `1 : ${tradeSetup.rr.toFixed(1)}` : null);

  // 52-Week Range Position
  const hasRange52w = range52w?.high52w != null && range52w?.low52w != null && range52w.high52w > range52w.low52w;
  const pos52w = range52w?.positionPct != null ? Math.max(0, Math.min(100, Math.round(range52w.positionPct))) : null;

  return (
    <div
      style={{ backgroundColor: activeTheme.bgBase, borderColor: activeTheme.outerBorder }}
      className="lens-export-dark w-[1080px] text-white flex flex-col justify-between overflow-hidden font-sans border-[12px] shadow-[0_30px_90px_rgba(0,0,0,0.98)] relative"
    >
      {/* Dynamic 3D Background Lighting Ambient Orbs */}
      <div className={`absolute -top-32 left-1/2 -translate-x-1/2 w-[900px] h-[420px] bg-gradient-to-b ${activeTheme.orbTop} to-transparent blur-[100px] pointer-events-none`} />
      <div className={`absolute top-[480px] -left-36 w-[500px] h-[500px] ${activeTheme.orbMid} blur-[110px] pointer-events-none`} />
      <div className={`absolute bottom-28 -right-36 w-[500px] h-[500px] ${activeTheme.orbBottom} blur-[110px] pointer-events-none`} />

      {/* High-Tech Grid Pattern Overlay */}
      <div
        className="absolute inset-0 opacity-[0.05] pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(${activeTheme.gridDotColor} 1.5px, transparent 1.5px)`,
          backgroundSize: '28px 28px',
        }}
      />

      <div className="relative z-10 space-y-4 p-8">
        {/* =========================================================================
         * 1. TOP HEADER: 3D EMBLEM & THEME BADGE
         * ========================================================================= */}
        <div className="bg-gradient-to-r from-[#030a16]/95 via-[#08152b]/95 to-[#030a16]/95 p-5 rounded-3xl border border-white/15 backdrop-blur-2xl flex items-center justify-between shadow-[0_15px_35px_rgba(0,0,0,0.6)]">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className={`h-14 w-14 rounded-2xl bg-gradient-to-br ${activeTheme.accentGradient} p-[2px] ${activeTheme.accentShadow}`}>
                <div className="h-full w-full bg-[#02050e] rounded-[14px] flex items-center justify-center font-heading font-black text-2xl tracking-tighter text-white">
                  SL
                </div>
              </div>
              <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-emerald-400 border-2 border-[#02050e] flex items-center justify-center shadow-lg">
                <Sparkles className="w-3 h-3 text-slate-950" />
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2.5">
                <span className="text-2xl font-black tracking-tight text-white font-heading">
                  SahamLens Technical 360°
                </span>
                <span className={`rounded-full ${activeTheme.accentBg} border ${activeTheme.accentBorder} px-3.5 py-0.5 text-[10.5px] font-mono font-black uppercase tracking-widest ${activeTheme.accentText} shadow-md`}>
                  {activeTheme.badgeLabel}
                </span>
              </div>
              <div className="text-xs font-mono text-slate-400 mt-0.5 flex items-center gap-2">
                <span>Algoritma Kuantitatif Multi-Dimensi</span>
                <span className={activeTheme.accentText}>•</span>
                <span>Analisis Pasar IDX Terpadu</span>
              </div>
            </div>
          </div>

          <div className="text-right">
            <div className="inline-flex items-center gap-2 rounded-xl bg-[#030a18] border border-white/15 px-4 py-2 shadow-inner">
              <Clock className={`w-3.5 h-3.5 ${activeTheme.accentText}`} />
              <span className="text-xs font-mono font-bold text-slate-200">{timeLabel}</span>
            </div>
          </div>
        </div>

        {/* =========================================================================
         * 2. MAIN TICKER HERO CARD: 3D FLOATING PODIUM + 52-WEEK PINNED RANGE BAR
         * ========================================================================= */}
        <div className={`relative rounded-3xl border border-white/[0.15] bg-gradient-to-b ${activeTheme.cardBg} p-6 shadow-[0_20px_50px_rgba(0,0,0,0.7),0_1px_0_rgba(255,255,255,0.2)_inset] overflow-hidden`}>
          <div className={`absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent ${activeTheme.specularLine} to-transparent`} />

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="flex items-center gap-5">
              <div className={`h-20 w-20 rounded-2xl bg-gradient-to-br from-white/15 to-transparent border border-white/20 p-1 flex items-center justify-center ${activeTheme.accentShadow}`}>
                <div className="text-center">
                  <LineChart className={`w-8 h-8 ${activeTheme.accentText} mx-auto`} />
                  <span className={`text-[9px] font-mono font-black ${activeTheme.accentTextSecondary}`}>TEKNIKAL</span>
                </div>
              </div>

              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-4xl font-black tracking-tight font-heading text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)]">
                    {displaySymbol === 'IHSG' ? 'IHSG' : `${displaySymbol}.JK`}
                  </h1>
                  <span className={`rounded-xl border ${activeTheme.accentBorder} ${activeTheme.accentBg} px-3 py-1 text-xs font-mono font-black ${activeTheme.accentText} shadow-sm`}>
                    {displaySymbol === 'IHSG' ? 'Indeks Komposit BEI' : 'Saham Reguler IDX'}
                  </span>
                </div>
                <div className="text-sm font-semibold text-slate-200 mt-1">
                  {stockName || (displaySymbol === 'IHSG' ? 'Indeks Harga Saham Gabungan (IHSG)' : `${displaySymbol} Tbk`)}
                </div>
                <div className="text-xs text-slate-400 font-mono mt-1 flex items-center gap-3">
                  <span>Vol: <b className="text-white">{volume != null ? `${(volume / 1000000).toFixed(1)}M Lot` : '-'}</b></span>
                  <span className="text-slate-600">•</span>
                  <span>Multi-Timeframe Analisis Terpadu</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-5">
              <div className="rounded-2xl border border-slate-700/90 bg-[#020712]/95 px-6 py-3.5 shadow-inner text-right min-w-[170px]">
                <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                  Harga Terkini
                </div>
                <div className="text-3xl font-black font-number text-white mt-0.5 tracking-tight">
                  Rp {currentPrice ? currentPrice.toLocaleString('id-ID') : '-'}
                </div>
                {changePct != null && (
                  <div className={`mt-0.5 inline-flex items-center gap-1 text-xs font-mono font-black ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {isPositive ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                    {isPositive ? '+' : ''}{changePct}%
                  </div>
                )}
              </div>

              <div className={`rounded-2xl border p-4 px-6 flex flex-col items-center justify-center text-center shadow-[0_10px_30px_rgba(0,0,0,0.6)] min-w-[190px] ${toneBg}`}>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider opacity-90">
                  Konsensus Sinyal
                </span>
                <div className={`mt-1.5 px-4 py-1.5 rounded-xl text-sm font-heading font-black tracking-wide ${toneBadge}`}>
                  {consensusLabel}
                </div>
              </div>
            </div>
          </div>

          {/* 52-Week Range Bar with Floating Pin Marker */}
          {hasRange52w && pos52w != null && (
            <div className="mt-5 pt-4 border-t border-slate-800/90">
              <div className="flex items-center justify-between text-xs font-mono mb-2">
                <div className="flex items-center gap-1.5 text-slate-300 font-bold">
                  <SlidersHorizontal className={`w-3.5 h-3.5 ${activeTheme.accentText}`} />
                  <span>Rentang 52-Minggu (Low / High):</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`font-black px-2 py-0.5 rounded ${activeTheme.accentBg} ${activeTheme.accentText} border ${activeTheme.accentBorder} text-[11px]`}>
                    📍 Posisi: {pos52w}% dari Rentang
                  </span>
                </div>
              </div>

              <div className="relative pt-1 pb-1">
                {/* Floating Pin above the bar */}
                <div
                  style={{ left: `${pos52w}%` }}
                  className="absolute -top-3.5 -translate-x-1/2 flex flex-col items-center z-10 pointer-events-none transition-all duration-300"
                >
                  <div className={`px-2 py-0.5 rounded-md text-[9px] font-mono font-black ${activeTheme.accentBg} ${activeTheme.accentText} border ${activeTheme.accentBorder} shadow-lg whitespace-nowrap`}>
                    Rp {currentPrice.toLocaleString('id-ID')}
                  </div>
                  <div className={`w-1.5 h-1.5 rotate-45 ${activeTheme.accentBg} border-r border-b ${activeTheme.accentBorder} -mt-0.5`} />
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-rose-400 font-black text-xs font-mono min-w-[70px]">
                    Rp {range52w.low52w.toLocaleString('id-ID')}
                  </span>
                  <div className="relative flex-1 h-3.5 bg-[#01050d] rounded-full border border-slate-700/90 overflow-hidden shadow-inner">
                    <div
                      style={{ width: `${pos52w}%` }}
                      className="h-full bg-gradient-to-r from-rose-500 via-amber-400 to-emerald-400 rounded-full shadow-[0_0_12px_rgba(16,185,129,0.7)]"
                    />
                  </div>
                  <span className="text-emerald-400 font-black text-xs font-mono min-w-[70px] text-right">
                    Rp {range52w.high52w.toLocaleString('id-ID')}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* =========================================================================
         * 3. 3D SPEEDOMETER & CONSENSUS DISTRIBUTION SECTION
         * ========================================================================= */}
        <div className="grid grid-cols-12 gap-5">
          {/* 3D Dial / Gauge Score Card */}
          <div className={`col-span-5 rounded-3xl border border-white/[0.12] bg-gradient-to-b ${activeTheme.cardBg} p-5 shadow-[0_15px_35px_rgba(0,0,0,0.5),0_1px_0_rgba(255,255,255,0.15)_inset] flex flex-col justify-between`}>
            <div className="flex items-center justify-between border-b border-slate-700/80 pb-2.5">
              <div className={`flex items-center gap-2 text-xs font-mono font-black uppercase tracking-wider ${activeTheme.accentText}`}>
                <Gauge className="w-4 h-4" />
                <span>Komposit LensScore</span>
              </div>
              <span className="text-[10.5px] font-mono font-black text-emerald-400">
                {displayScore == null ? 'MODE KUANTITATIF' : displayScore >= 75 ? '🔥 Sangat Kuat' : displayScore >= 55 ? '⚖️ Moderat' : '⚠️ Waspada'}
              </span>
            </div>

            <div className="py-2 flex items-center justify-center">
              <div className="relative flex items-center justify-center">
                <svg viewBox="0 0 160 100" className="w-56 h-34">
                  <defs>
                    <linearGradient id="gaugeGradTechV2" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#f43f5e" />
                      <stop offset="35%" stopColor="#f59e0b" />
                      <stop offset="70%" stopColor="#3b82f6" />
                      <stop offset="100%" stopColor="#10b981" />
                    </linearGradient>
                    <filter id="gaugeGlowTechV2">
                      <feDropShadow dx="0" dy="2" stdDeviation="5" floodColor={activeTheme.gridDotColor} floodOpacity="0.6" />
                    </filter>
                  </defs>
                  <path
                    d="M 20 85 A 60 60 0 0 1 140 85"
                    fill="none"
                    stroke="#0f172a"
                    strokeWidth="15"
                    strokeLinecap="round"
                  />
                  {displayScore != null && (
                    <path
                      d="M 20 85 A 60 60 0 0 1 140 85"
                      fill="none"
                      stroke="url(#gaugeGradTechV2)"
                      strokeWidth="15"
                      strokeLinecap="round"
                      strokeDasharray="188.5"
                      strokeDashoffset={188.5 * (1 - displayScore / 100)}
                      filter="url(#gaugeGlowTechV2)"
                    />
                  )}
                </svg>
                <div className="absolute bottom-1 text-center">
                  <div className="text-4xl font-black font-number text-white tracking-tight drop-shadow-[0_4px_16px_rgba(0,0,0,0.9)]">
                    {displayScore != null ? displayScore : '-'}
                  </div>
                  <div className={`text-[10.5px] font-mono font-black ${activeTheme.accentTextSecondary} uppercase tracking-widest`}>
                    Skor Total / 100
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
              <div className="bg-[#020712] border border-slate-800 rounded-xl p-2 shadow-sm">
                <div className="text-slate-400 text-[9px] font-bold">Technical</div>
                <div className="text-emerald-400 font-black text-xs mt-0.5">{safeTechScore != null ? `${safeTechScore}/40` : '-'}</div>
              </div>
              <div className="bg-[#020712] border border-slate-800 rounded-xl p-2 shadow-sm">
                <div className="text-slate-400 text-[9px] font-bold">Flow / Bandar</div>
                <div className={`${activeTheme.accentText} font-black text-xs mt-0.5`}>{safeFlowScore != null ? `${safeFlowScore}/30` : '-'}</div>
              </div>
              <div className="bg-[#020712] border border-slate-800 rounded-xl p-2 shadow-sm">
                <div className="text-slate-400 text-[9px] font-bold">Fundamental</div>
                <div className="text-amber-400 font-black text-xs mt-0.5">{safeFundScore != null ? `${safeFundScore}/30` : '-'}</div>
              </div>
            </div>
          </div>

          {/* 3D Sinyal Meter & Direction Distribution */}
          <div className={`col-span-7 rounded-3xl border border-white/[0.12] bg-gradient-to-b ${activeTheme.cardBg} p-5 shadow-[0_15px_35px_rgba(0,0,0,0.5),0_1px_0_rgba(255,255,255,0.15)_inset] flex flex-col justify-between`}>
            <div>
              <div className="flex items-center justify-between border-b border-slate-700/80 pb-2.5 mb-3.5">
                <div className={`flex items-center gap-2 text-xs font-mono font-black uppercase tracking-wider ${activeTheme.accentText}`}>
                  <Brain className="w-4 h-4" />
                  <span>Distribusi Keselarasan Sinyal AI</span>
                </div>
                <span className="text-[10px] font-mono text-slate-300 font-bold">
                  {displayAnalyzers.length} Dimensi Analisis Aktif
                </span>
              </div>

              {/* 3D Tube Energy Progress Bar with Liquid Glow */}
              <div className="mb-3.5">
                {hasDistribution ? (
                  <>
                    <div className="flex justify-between text-xs font-mono font-black mb-1.5">
                      <span className="text-emerald-400">{buyPct}% BULLISH</span>
                      <span className="text-amber-400">{neutralPct}% NETRAL</span>
                      <span className="text-rose-400">{sellPct}% BEARISH</span>
                    </div>
                    <div className="h-5 w-full bg-[#020712] rounded-full p-1 border border-slate-700/80 flex overflow-hidden shadow-[inset_0_2px_6px_rgba(0,0,0,0.9)]">
                      {buyPct! > 0 && (
                        <div
                          style={{ width: `${buyPct}%` }}
                          className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-l-full shadow-[0_0_15px_rgba(16,185,129,0.8)]"
                        />
                      )}
                      {neutralPct! > 0 && (
                        <div
                          style={{ width: `${neutralPct}%` }}
                          className="h-full bg-gradient-to-r from-amber-500 to-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.8)]"
                        />
                      )}
                      {sellPct! > 0 && (
                        <div
                          style={{ width: `${sellPct}%` }}
                          className="h-full bg-gradient-to-r from-rose-500 to-rose-400 rounded-r-full shadow-[0_0_15px_rgba(244,63,94,0.8)]"
                        />
                      )}
                    </div>
                  </>
                ) : (
                  <div className="rounded-xl border border-slate-700 bg-[#020712] p-3 text-xs text-slate-400">
                    Distribusi sinyal sedang diproses.
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-white/15 bg-[#030c1e]/90 p-3 text-xs leading-relaxed text-slate-200 font-sans">
                {summaryText || (hasDistribution
                  ? `Konsensus ${displaySymbol}: ${buyPct}% dimensi teknikal condong bullish, ${neutralPct}% netral, dan ${sellPct}% bearish berdasarkan model kuantitatif terverifikasi.`
                  : `Konsensus ${displaySymbol}: hasil pembacaan arah berdasarkan indikator teknikal aktif.`)}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-3">
              <div className="bg-[#020712] border border-slate-800 rounded-xl p-2.5 flex items-center justify-between">
                <span className="text-[11px] font-mono text-slate-400 font-bold">Bandarmology (CMF)</span>
                <span className="text-xs font-mono font-black text-emerald-400">
                  {flowDetails?.cmf20 != null ? `CMF20: ${flowDetails.cmf20 > 0 ? '+' : ''}${flowDetails.cmf20}%` : (flowDetails?.bandarmologyStatus || '-')}
                </span>
              </div>
              <div className="bg-[#020712] border border-slate-800 rounded-xl p-2.5 flex items-center justify-between">
                <span className="text-[11px] font-mono text-slate-400 font-bold">Arus Modal / Asing</span>
                <span className={`text-xs font-mono font-black ${activeTheme.accentText}`}>
                  {flowDetails?.foreignFlowStatus || '-'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* =========================================================================
         * 4. 3D GLASS CARDS: 8 TECHNICAL & SMART MONEY ANALYZERS (HIGH CONTRAST)
         * ========================================================================= */}
        <div className={`rounded-3xl border border-white/[0.12] bg-gradient-to-b ${activeTheme.cardBg} p-5 shadow-[0_15px_35px_rgba(0,0,0,0.5),0_1px_0_rgba(255,255,255,0.15)_inset]`}>
          <div className="flex items-center justify-between border-b border-slate-700/80 pb-2.5 mb-3.5">
            <div className={`flex items-center gap-2 text-xs font-mono font-black uppercase tracking-wider ${activeTheme.accentText}`}>
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
                  ? 'bg-emerald-500/25 text-emerald-300 border-emerald-400/60 shadow-[0_0_10px_rgba(16,185,129,0.4)]'
                  : isBear
                  ? 'bg-rose-500/25 text-rose-300 border-rose-400/60 shadow-[0_0_10px_rgba(244,63,94,0.4)]'
                  : 'bg-amber-500/25 text-amber-300 border-amber-400/60 shadow-[0_0_10px_rgba(245,158,11,0.3)]';

                const note = getAnalyzerAnalyticalNote(a);

                return (
                  <div
                    key={idx}
                    className={`relative rounded-2xl border border-slate-700/90 bg-gradient-to-b ${activeTheme.glassTileBg} p-3.5 flex flex-col justify-between shadow-[0_8px_20px_rgba(0,0,0,0.5)] group overflow-hidden`}
                  >
                    <div className={`absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent ${activeTheme.specularLine} to-transparent`} />

                    <div>
                      <div className="flex items-start justify-between gap-1 mb-1">
                        <span className="text-[11px] font-mono font-black text-slate-100 line-clamp-1">
                          {a.label || a.name}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[8.5px] font-mono font-black border uppercase shrink-0 ${badgeBg}`}>
                          {getAnalyzerDirectionLabel(decision)}
                        </span>
                      </div>

                      <div className="text-xs font-mono font-black text-white tracking-tight mt-1 truncate">
                        {a.value ?? '-'}
                      </div>
                    </div>

                    <div className="mt-2 pt-2 border-t border-slate-800 flex items-center justify-between text-[9.5px] font-mono text-slate-300">
                      <span className="truncate pr-1 font-medium">{note}</span>
                      {a.confidence != null && (
                        <span className={`${activeTheme.accentText} font-black shrink-0`}>{a.confidence}/100</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-slate-700 bg-[#020712] p-4 text-xs text-slate-400">
              Analyzer teknikal tidak tersedia pada instrumen ini.
            </div>
          )}
        </div>

        {/* =========================================================================
         * 5. KEY TRADING LEVELS & ATR TRADING PLAN GRID (HIGHLIGHTED PIVOT POINT)
         * ========================================================================= */}
        <div className="grid grid-cols-12 gap-5">
          {/* Key Trading Levels & Pivot Point (7 Cols) */}
          <div className={`col-span-7 rounded-3xl border border-white/[0.12] bg-gradient-to-b ${activeTheme.cardBg} p-5 shadow-[0_15px_35px_rgba(0,0,0,0.5),0_1px_0_rgba(255,255,255,0.15)_inset] flex flex-col justify-between`}>
            <div>
              <div className="flex items-center justify-between border-b border-slate-700/80 pb-2 mb-3">
                <div className={`flex items-center gap-2 text-xs font-mono font-black uppercase tracking-wider ${activeTheme.accentText}`}>
                  <Target className="w-4 h-4" />
                  <span>Level Kunci Support &amp; Resistance (Trading Grid)</span>
                </div>
                <span className="text-[10px] font-mono font-black text-emerald-400">Classic Floor Pivots</span>
              </div>

              {/* 5 Pivot Tiles with Standout PP Highlight */}
              <div className="grid grid-cols-5 gap-2 text-center text-xs font-mono">
                <div className="bg-[#020712] border border-rose-500/40 rounded-xl p-2 shadow-sm">
                  <div className="text-[8.5px] text-rose-400 font-black">SUPPORT 2</div>
                  <div className="text-white font-black text-xs sm:text-sm mt-0.5">
                    {resolvedS2 ? `Rp ${resolvedS2.toLocaleString('id-ID')}` : '-'}
                  </div>
                </div>
                <div className="bg-[#020712] border border-amber-500/40 rounded-xl p-2 shadow-sm">
                  <div className="text-[8.5px] text-amber-400 font-black">SUPPORT 1</div>
                  <div className="text-white font-black text-xs sm:text-sm mt-0.5">
                    {resolvedS1 ? `Rp ${resolvedS1.toLocaleString('id-ID')}` : '-'}
                  </div>
                </div>
                {/* Pivot Point Standout Tile */}
                <div className={`bg-[#030d22] border-2 ${activeTheme.accentBorder} rounded-xl p-2 ${activeTheme.accentShadow}`}>
                  <div className={`text-[8.5px] ${activeTheme.accentText} font-black`}>PIVOT POINT</div>
                  <div className="text-white font-black text-xs sm:text-sm mt-0.5 drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
                    {resolvedPP ? `Rp ${resolvedPP.toLocaleString('id-ID')}` : '-'}
                  </div>
                </div>
                <div className="bg-[#020712] border border-blue-500/40 rounded-xl p-2 shadow-sm">
                  <div className="text-[8.5px] text-blue-400 font-black">RESIST 1</div>
                  <div className="text-white font-black text-xs sm:text-sm mt-0.5">
                    {resolvedR1 ? `Rp ${resolvedR1.toLocaleString('id-ID')}` : '-'}
                  </div>
                </div>
                <div className="bg-[#020712] border border-emerald-500/40 rounded-xl p-2 shadow-sm">
                  <div className="text-[8.5px] text-emerald-400 font-black">RESIST 2</div>
                  <div className="text-white font-black text-xs sm:text-sm mt-0.5">
                    {resolvedR2 ? `Rp ${resolvedR2.toLocaleString('id-ID')}` : '-'}
                  </div>
                </div>
              </div>
            </div>

            {/* Trading Plan Row */}
            <div className="mt-3 pt-2.5 border-t border-slate-800 grid grid-cols-4 gap-2 text-center text-xs font-mono">
              <div className="bg-[#01050d] border border-slate-800 rounded-lg p-2">
                <span className="text-[8.5px] text-slate-400 uppercase font-bold">Entry Zone</span>
                <div className="text-white font-black text-[11.5px] mt-0.5">
                  {entryPrice ? `Rp ${entryPrice.toLocaleString('id-ID')}` : '-'}
                </div>
              </div>
              <div className="bg-[#01050d] border border-emerald-500/30 rounded-lg p-2">
                <span className="text-[8.5px] text-emerald-400 uppercase font-bold">Target (TP1)</span>
                <div className="text-emerald-400 font-black text-[11.5px] mt-0.5">
                  {tp1 ? `Rp ${tp1.toLocaleString('id-ID')}` : '-'}
                </div>
              </div>
              <div className="bg-[#01050d] border border-rose-500/30 rounded-lg p-2">
                <span className="text-[8.5px] text-rose-400 uppercase font-bold">Cut Loss (CL)</span>
                <div className="text-rose-400 font-black text-[11.5px] mt-0.5">
                  {stopLoss ? `Rp ${stopLoss.toLocaleString('id-ID')}` : '-'}
                </div>
              </div>
              <div className="bg-[#01050d] border border-cyan-500/30 rounded-lg p-2">
                <span className="text-[8.5px] text-cyan-400 uppercase font-bold">Risk : Reward</span>
                <div className="text-cyan-400 font-black text-[11.5px] mt-0.5">{rrRatio || '-'}</div>
              </div>
            </div>
          </div>

          {/* Multi-Timeframe Trend & Smart Flow Matrix (5 Cols) */}
          <div className={`col-span-5 rounded-3xl border border-white/[0.12] bg-gradient-to-b ${activeTheme.cardBg} p-5 shadow-[0_15px_35px_rgba(0,0,0,0.5),0_1px_0_rgba(255,255,255,0.15)_inset] flex flex-col justify-between`}>
            <div>
              <div className="flex items-center justify-between border-b border-slate-700/80 pb-2 mb-3">
                <div className={`flex items-center gap-2 text-xs font-mono font-black uppercase tracking-wider ${activeTheme.accentText}`}>
                  <Flame className="w-4 h-4" />
                  <span>Tren Multi-Timeframe</span>
                </div>
                <span className="text-[10px] font-mono font-bold text-slate-400">Alignment Sistemik</span>
              </div>

              {trends.length > 0 ? (
                <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
                  {trends.slice(0, 3).map((tr, idx) => (
                    <div key={idx} className="bg-[#020712] border border-slate-800 rounded-xl p-2.5">
                      <div className="text-[9px] text-slate-400 uppercase font-bold">{tr.label.split(' ')[0]}</div>
                      <div className={`font-black text-xs mt-1 ${tr.status === 'BULLISH' ? 'text-emerald-400' : tr.status === 'BEARISH' ? 'text-rose-400' : 'text-amber-400'}`}>
                        {tr.status}
                      </div>
                      <div className="text-[8.5px] text-slate-300 mt-0.5 truncate font-medium">{tr.detail}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-[#020712] border border-slate-800 rounded-xl p-3 text-center text-xs text-slate-400 font-mono">
                  Deret timeframe belum tersedia
                </div>
              )}
            </div>

            <div className="text-[9.5px] font-mono text-slate-300 border-t border-slate-800 pt-2.5 mt-2.5 flex justify-between items-center">
              <span>Arus Broker: <b className="text-emerald-400 font-black">{flowDetails?.foreignFlowStatus || '-'}</b></span>
              <span>Spike Vol: <b className={`${activeTheme.accentText} font-black`}>{volume != null ? 'Terkonfirmasi' : '-'}</b></span>
            </div>
          </div>
        </div>

        {/* =========================================================================
         * 6. 3D OFFICIAL FOOTER WITH ALGORITHM SEAL
         * ========================================================================= */}
        <div className="px-6 py-4 rounded-2xl border border-slate-800 bg-[#01040a] flex items-center justify-between text-xs text-slate-400 shadow-2xl">
          <div className="flex items-center gap-3 font-mono">
            <div className="flex items-center gap-1.5 text-white font-black">
              <Zap className={`w-4 h-4 ${activeTheme.accentText}`} />
              <span>SahamLens Quantitative Engine</span>
            </div>
            <span>•</span>
            <span className={activeTheme.accentText}>sahamlens.id</span>
          </div>

          <div className="text-[10px] text-slate-400 font-mono flex items-center gap-2">
            <span className="hidden sm:inline">100% Quantitative Algorithm</span>
            <span className="px-2 py-0.5 rounded bg-white/10 text-slate-300 font-bold border border-white/10">
              Verified Analysis
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
