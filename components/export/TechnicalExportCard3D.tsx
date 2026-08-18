'use client';

import React from 'react';
import {
  TrendingUp, TrendingDown, Minus, Zap, Activity,
  LineChart, Sparkles, Gauge, Compass, ShieldCheck,
  BarChart3, CheckCircle2, ArrowUpRight, ArrowDownRight,
  Brain, Layers, Clock, Target, Scale, Flame, ArrowRightLeft,
  ChevronRight
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
    momentum?: number | null;
    moneyFlow?: number | null;
    risk?: number | null;
  };
  summaryText?: string;
  buyPct?: number | null;
  sellPct?: number | null;
  neutralPct?: number | null;
  analyzers?: TechnicalAnalyzerItem[];
  themeId?: string;
  theme?: Card3DTheme;
  exportedAt?: Date;
}

export default function TechnicalExportCard3D({
  symbol,
  stockName,
  currentPrice,
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
  themeId,
  theme,
  exportedAt = new Date(),
}: TechnicalExportCard3DProps) {
  const activeTheme = theme || getThemeById(themeId || 'sapphire-bank');
  const upperSym = symbol.toUpperCase();
  const displaySymbol = (upperSym.includes('JKSE') || upperSym === 'IHSG') ? 'IHSG' : symbol.replace('.JK', '').toUpperCase();
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

  // Compute calculated sub-scores properly so they don't exceed their maximum bounds
  const rawTech = scoreBreakdown.technical;
  const safeTechScore = rawTech == null ? null : rawTech > 40 ? Math.round((rawTech / 100) * 40) : Math.round(rawTech);
  const safeMomentumScore = scoreBreakdown.momentum == null ? null : Math.min(100, Math.round(scoreBreakdown.momentum));
  const displayScore = score == null || !Number.isFinite(score) ? null : Math.min(100, Math.max(0, score));
  const hasDistribution = buyPct != null && sellPct != null && neutralPct != null;

  // Filter out any analyzer with empty/N/A values
  const displayAnalyzers = analyzers
    .filter((a) => a.value !== 'N/A' && a.value !== null && a.value !== undefined)
    .slice(0, 8);

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
                <span>Data pasar eksternal • Technical Engine turunan</span>
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
         * 2. MAIN TICKER HERO CARD: 3D FLOATING PODIUM
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
                  {stockName || (displaySymbol === 'IHSG' ? 'Indeks Harga Saham Gabungan (IHSG)' : displaySymbol)}
                </div>
                <div className="text-xs text-slate-400 font-mono mt-1 flex items-center gap-3">
                  <span>Vol: {volume != null ? `${(volume / 1000000).toFixed(1)}M` : 'N/A'}</span>
                  <span className="text-slate-600">•</span>
                  <span>Multi-Timeframe Analisis Terpadu</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-5">
              <div className="rounded-2xl border border-slate-700/80 bg-[#050b18]/90 px-6 py-3.5 shadow-inner text-right">
                <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                  Harga Provider
                </div>
                <div className="text-3xl font-black font-number text-white mt-0.5 tracking-tight">
                  Rp {currentPrice ? currentPrice.toLocaleString('id-ID') : '-'}
                </div>
                {changePct != null && (
                  <div className={`mt-0.5 inline-flex items-center gap-1 text-xs font-mono font-extrabold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {isPositive ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                    {isPositive ? '+' : ''}{changePct}%
                  </div>
                )}
              </div>

              <div className={`rounded-2xl border p-4 px-6 flex flex-col items-center justify-center text-center shadow-[0_10px_30px_rgba(0,0,0,0.5)] ${toneBg}`}>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider opacity-80">
                  Konsensus Sinyal
                </span>
                <div className={`mt-1.5 px-4 py-1 rounded-xl text-sm font-heading font-black tracking-wide ${toneBadge}`}>
                  {consensusLabel}
                </div>
              </div>
            </div>
          </div>
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
                {displayScore == null ? 'DATA N/A' : displayScore >= 75 ? '🔥 Sangat Kuat' : displayScore >= 55 ? '⚖️ Moderat' : '⚠️ Waspada'}
              </span>
            </div>

            <div className="py-3 flex items-center justify-center">
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
                    {displayScore ?? 'N/A'}
                  </div>
                  <div className={`text-[10px] font-mono font-bold ${activeTheme.accentTextSecondary} uppercase tracking-widest`}>
                    Skor Total / 100
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-center text-xs font-mono">
              <div className="bg-[#050b18] border border-slate-800 rounded-xl p-2">
                <div className="text-slate-400 text-[9.5px]">Technical Pts</div>
                <div className="text-emerald-400 font-bold text-sm mt-0.5">{safeTechScore != null ? `${safeTechScore} / 40` : 'N/A'}</div>
              </div>
              <div className="bg-[#050b18] border border-slate-800 rounded-xl p-2">
                <div className="text-slate-400 text-[9.5px]">Momentum Pts</div>
                <div className={`${activeTheme.accentText} font-bold text-sm mt-0.5`}>{safeMomentumScore != null ? `${safeMomentumScore} / 100` : 'N/A'}</div>
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
                  {displayAnalyzers.length} Analyzer Aktif
                </span>
              </div>

              {/* 3D Tube Energy Progress Bar */}
              <div className="mb-3">
                {hasDistribution ? <>
                  <div className="flex justify-between text-xs font-mono font-bold mb-1.5">
                    <span className="text-emerald-400">{buyPct}% BULLISH</span>
                    <span className="text-amber-400">{neutralPct}% NETRAL</span>
                    <span className="text-rose-400">{sellPct}% BEARISH</span>
                  </div>
                  <div className="h-5 w-full bg-[#050b18] rounded-full p-1 border border-slate-700 flex overflow-hidden shadow-[inset_0_2px_4px_rgba(0,0,0,0.8)]">
                  {buyPct! > 0 && (
                    <div
                      style={{ width: `${buyPct}%` }}
                      className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-l-full shadow-[0_0_12px_rgba(16,185,129,0.7)]"
                    />
                  )}
                  {neutralPct! > 0 && (
                    <div
                      style={{ width: `${neutralPct}%` }}
                      className="h-full bg-gradient-to-r from-amber-500 to-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.7)]"
                    />
                  )}
                  {sellPct! > 0 && (
                    <div
                      style={{ width: `${sellPct}%` }}
                      className="h-full bg-gradient-to-r from-rose-500 to-rose-400 rounded-r-full shadow-[0_0_12px_rgba(244,63,94,0.7)]"
                    />
                  )}
                  </div>
                </> : <div className="rounded-xl border border-slate-700 bg-[#050b18] p-3 text-xs text-slate-400">Distribusi sinyal tidak tersedia.</div>}
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#050e20]/80 p-3 text-xs leading-relaxed text-slate-300 font-sans">
                {summaryText || (hasDistribution
                  ? `Konsensus ${displaySymbol}: ${buyPct}% bullish, ${neutralPct}% netral, dan ${sellPct}% bearish berdasarkan analyzer yang tersedia.`
                  : `Konsensus ${displaySymbol}: distribusi analyzer tidak tersedia pada payload export.`)}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-3">
              <div className="bg-[#050b18] border border-slate-800 rounded-xl p-2.5 flex items-center justify-between">
                <span className="text-[11px] font-mono text-slate-400">Money Flow Score</span>
                <span className="text-xs font-mono font-black text-emerald-400">{scoreBreakdown.moneyFlow != null ? `${scoreBreakdown.moneyFlow}` : 'N/A'}</span>
              </div>
              <div className="bg-[#050b18] border border-slate-800 rounded-xl p-2.5 flex items-center justify-between">
                <span className="text-[11px] font-mono text-slate-400">Risk Score</span>
                <span className={`text-xs font-mono font-black ${activeTheme.accentText}`}>{scoreBreakdown.risk != null ? `${scoreBreakdown.risk}` : 'N/A'}</span>
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
              Status indikator dari payload SahamLens
            </span>
          </div>

          {displayAnalyzers.length > 0 ? <div className="grid grid-cols-4 gap-3">
            {displayAnalyzers.map((a, idx) => {
              const decision = a.decision || 'NEUTRAL';
              const isBull = decision === 'BULLISH' || decision === 'BUY';
              const isBear = decision === 'BEARISH' || decision === 'SELL';

              const badgeBg = isBull
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                : isBear
                ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 shadow-[0_0_10px_rgba(244,63,94,0.3)]'
                : 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-[0_0_10px_rgba(245,158,11,0.2)]';

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
                      {a.value ?? 'N/A'}
                    </div>
                  </div>

                  <div className="mt-2 pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-[9px] font-mono text-slate-400">
                    <span>{a.description || 'Deskripsi tidak tersedia'}</span>
                    {a.confidence != null && (
                      <span className={`${activeTheme.accentText} font-bold`}>{a.confidence}/100</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div> : <div className="rounded-xl border border-slate-700 bg-[#050b18] p-4 text-xs text-slate-400">Analyzer teknikal tidak tersedia pada payload export.</div>}
        </div>

        {/* =========================================================================
         * 5. NEW SECTION: 3D KEY TRADING LEVELS & BANDARMOLOGY MATRIX (FILL BOTTOM SPACE)
         * ========================================================================= */}
        <div className="grid grid-cols-12 gap-5">
          {/* Key Trading Levels & Pivot Point (7 Cols) */}
          <div className={`col-span-7 rounded-3xl border border-white/[0.1] bg-gradient-to-b ${activeTheme.cardBg} p-5 shadow-[0_15px_35px_rgba(0,0,0,0.5),0_1px_0_rgba(255,255,255,0.1)_inset]`}>
            <div className="flex items-center justify-between border-b border-slate-700/60 pb-2 mb-3">
              <div className={`flex items-center gap-2 text-xs font-mono font-extrabold uppercase tracking-wider ${activeTheme.accentText}`}>
                <Target className="w-4 h-4" />
                <span>Level Kunci Support &amp; Resistance (Trading Grid)</span>
              </div>
              <span className="text-[10px] font-mono font-bold text-slate-400">Tidak diestimasi dari harga saja</span>
            </div>

            <div className="grid grid-cols-5 gap-2 text-center text-xs font-mono">
              <div className="bg-[#050b18] border border-rose-500/30 rounded-xl p-2">
                <div className="text-[9px] text-rose-400 font-bold">SUPPORT 2</div>
                <div className="text-white font-black text-sm mt-0.5">N/A</div>
              </div>
              <div className="bg-[#050b18] border border-amber-500/30 rounded-xl p-2">
                <div className="text-[9px] text-amber-400 font-bold">SUPPORT 1</div>
                <div className="text-white font-black text-sm mt-0.5">N/A</div>
              </div>
              <div className="bg-[#050b18] border border-cyan-500/40 rounded-xl p-2 shadow-[0_0_15px_rgba(6,182,212,0.2)]">
                <div className={`text-[9px] ${activeTheme.accentText} font-bold`}>PIVOT POINT</div>
                <div className="text-white font-black text-sm mt-0.5">N/A</div>
              </div>
              <div className="bg-[#050b18] border border-blue-500/30 rounded-xl p-2">
                <div className="text-[9px] text-blue-400 font-bold">RESIST 1</div>
                <div className="text-white font-black text-sm mt-0.5">N/A</div>
              </div>
              <div className="bg-[#050b18] border border-emerald-500/30 rounded-xl p-2">
                <div className="text-[9px] text-emerald-400 font-bold">RESIST 2</div>
                <div className="text-white font-black text-sm mt-0.5">N/A</div>
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
                <span className="text-[10px] font-mono font-bold text-slate-400">N/A bila timeframe tidak diberikan</span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
                <div className="bg-[#050b18] border border-slate-800 rounded-xl p-2">
                  <div className="text-[9.5px] text-slate-400">Harian (1D)</div>
                  <div className="text-slate-400 font-black text-xs mt-1">N/A</div>
                </div>
                <div className="bg-[#050b18] border border-slate-800 rounded-xl p-2">
                  <div className="text-[9.5px] text-slate-400">Mingguan (1W)</div>
                  <div className="text-slate-400 font-black text-xs mt-1">N/A</div>
                </div>
                <div className="bg-[#050b18] border border-slate-800 rounded-xl p-2">
                  <div className="text-[9.5px] text-slate-400">Bulanan (1M)</div>
                  <div className="text-slate-400 font-black text-xs mt-1">N/A</div>
                </div>
              </div>
            </div>

            <div className="text-[9.5px] font-mono text-slate-500 border-t border-slate-800 pt-2 mt-2 flex justify-between">
              <span>Arus broker: <b className="text-slate-400">N/A</b></span>
              <span>Spike Vol: <b className="text-slate-400">N/A</b></span>
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
            Engine Analisis Saham Indonesia • Bukan anjuran/rekomendasi beli atau jual langsung.
          </div>
        </div>
      </div>
    </div>
  );
}
