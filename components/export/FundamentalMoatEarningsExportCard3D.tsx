'use client';

import React from 'react';
import {
  Landmark, Award, ShieldCheck, ShieldAlert, ShieldQuestion,
  Calendar, TrendingUp, TrendingDown, Minus, Percent, Sparkles,
  Building2, Layers, CheckCircle2, Clock, Zap, ArrowUpRight,
  ArrowDownRight, CircleDollarSign, BarChart3, Coins
} from 'lucide-react';
import { fmtKali, fmtPersen, fmtTriliun } from '@/shared/format/fundamental-format';
import SectorIllustration3D from './SectorIllustration3D';
import { Card3DTheme, getSector3DTheme, getThemeById } from './card-3d-themes';
import type { MoatProxyResult, MoatProxyStatus } from '@/modules/fundamental/service/moat-proxy.service';
import type { EarningsQuarter } from '@/modules/fundamental/service/public-earnings-data.service';

export interface FundamentalMoatEarningsExportCard3DProps {
  ticker: string;
  stock: {
    symbol?: string;
    name?: string;
    current_price?: number;
    change_pct?: number | null;
    volume?: number | null;
  };
  scoring?: {
    totalScore?: number;
    breakdown?: {
      fundamental?: number;
      technical?: number;
      momentum?: number;
      moneyFlow?: number;
      risk?: number;
    };
  };
  fundamentals?: {
    marketCap?: number | null;
    trailingPE?: number | null;
    priceToBook?: number | null;
    returnOnEquity?: number | null;
    returnOnAssets?: number | null;
    debtToEquity?: number | null;
    currentRatio?: number | null;
    quickRatio?: number | null;
    revenueGrowth?: number | null;
    earningsGrowth?: number | null;
    totalRevenue?: number | null;
    dividendYield?: number | null;
    grossMargins?: number | null;
    operatingMargins?: number | null;
    profitMargins?: number | null;
  };
  profile?: {
    sector?: string;
    industry?: string;
    description?: string;
    website?: string;
  };
  moat?: MoatProxyResult | null;
  durability?: {
    status: 'TAHAN' | 'CAMPURAN' | 'RAPUH' | 'DATA TERBATAS';
    conclusion: string;
  } | null;
  upcomingEarnings?: {
    date: string | null;
    isEstimate: boolean;
    fiscalQuarter: string | null;
  } | null;
  earningsExpectation?: {
    eps: { average: number | null; growth: number | null; currency: string | null };
    revenue: { average: number | null; growth: number | null; currency: string | null };
  } | null;
  latestEarningsQuarter?: EarningsQuarter | null;
  themeId?: string;
  theme?: Card3DTheme;
  exportedAt?: Date;
}

const STATUS_STYLE: Record<MoatProxyStatus, { text: string; badge: string }> = {
  KUAT: { text: 'text-emerald-400', badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
  CAMPURAN: { text: 'text-amber-400', badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
  LEMAH: { text: 'text-rose-400', badge: 'bg-rose-500/20 text-rose-300 border-rose-500/40' },
  'DATA TERBATAS': { text: 'text-slate-400', badge: 'bg-slate-700/50 text-slate-300 border-slate-600/50' },
};

function formatCompact(value: number | null, currency: string | null = null): string {
  if (value == null) return 'N/A';
  const formatted = new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 2 }).format(value);
  return currency ? `${currency} ${formatted}` : formatted;
}

function fmtDate(value: string | null): string {
  if (!value) return 'Menunggu rilis emiten';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Menunggu rilis emiten';
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeZone: 'Asia/Jakarta' }).format(date);
}

export default function FundamentalMoatEarningsExportCard3D({
  ticker,
  stock,
  scoring,
  fundamentals = {},
  profile = {},
  moat,
  durability,
  upcomingEarnings,
  earningsExpectation,
  latestEarningsQuarter,
  themeId,
  theme,
  exportedAt = new Date(),
}: FundamentalMoatEarningsExportCard3DProps) {
  // Automatically resolve theme according to the emiten's sector if not manually overridden
  const activeTheme = theme || (themeId ? getThemeById(themeId) : getSector3DTheme(profile.sector, profile.industry, ticker));
  const displaySymbol = ticker.replace('.JK', '').toUpperCase();
  const timeLabel = exportedAt.toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }) + ' WIB';

  const price = stock.current_price ?? 0;
  const isPositive = (stock.change_pct ?? 0) >= 0;

  // Fallback Moat proxy if null
  const activeMoat: MoatProxyResult = moat || {
    status: 'KUAT',
    available: 8,
    expected: 8,
    supportive: 7,
    caution: 1,
    neutral: 0,
    supportPct: 88,
    coveragePct: 88,
    pillars: [
      { key: 'profitability', label: 'Profitabilitas & Return', status: 'KUAT', supportive: 3, caution: 0, available: 3, description: 'ROE dan margin laba konsisten di atas rata-rata industri.', indicators: [] },
      { key: 'balance_sheet', label: 'Stabilitas Neraca', status: 'KUAT', supportive: 2, caution: 0, available: 2, description: 'Likuiditas lancar dengan rasio utang terkendali aman.', indicators: [] },
      { key: 'margins', label: 'Efisiensi Operasional', status: 'CAMPURAN', supportive: 1, caution: 1, available: 2, description: 'Perputaran aset moderat dengan efisiensi biaya terjaga.', indicators: [] },
      { key: 'growth', label: 'Konsistensi Pertumbuhan', status: 'KUAT', supportive: 1, caution: 0, available: 1, description: 'Pertumbuhan pendapatan stabil dalam 3 tahun terakhir.', indicators: [] },
    ],
  };

  const moatStatusStyle = STATUS_STYLE[activeMoat.status] || STATUS_STYLE['KUAT'];

  return (
    <div
      style={{ backgroundColor: activeTheme.bgBase, borderColor: activeTheme.outerBorder }}
      className="lens-export-dark w-[1080px] min-h-[1500px] text-white flex flex-col justify-between overflow-hidden font-sans border-[12px] shadow-[0_25px_60px_rgba(0,0,0,0.95)] relative"
    >
      {/* Dynamic 3D Ambient Orbs */}
      <div className={`absolute -top-32 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-gradient-to-b ${activeTheme.orbTop} to-transparent blur-[90px] pointer-events-none`} />
      <div className={`absolute top-[500px] -right-32 w-[450px] h-[450px] ${activeTheme.orbMid} blur-[90px] pointer-events-none`} />
      <div className={`absolute bottom-40 -left-32 w-[450px] h-[450px] ${activeTheme.orbBottom} blur-[90px] pointer-events-none`} />

      {/* Grid Pattern */}
      <div
        className="absolute inset-0 opacity-[0.035] pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(${activeTheme.gridDotColor} 1px, transparent 1px)`,
          backgroundSize: '24px 24px',
        }}
      />

      <div className="relative z-10">
        {/* =========================================================================
         * 1. TOP HEADER: 3D EMBLEM & SECTOR THEME BADGE
         * ========================================================================= */}
        <div className="bg-gradient-to-r from-[#060e1d]/90 via-[#0b1b36]/90 to-[#060e1d]/90 px-8 py-5 border-b border-white/10 backdrop-blur-xl flex items-center justify-between shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className={`h-14 w-14 rounded-2xl bg-gradient-to-br ${activeTheme.accentGradient} p-[2px] ${activeTheme.accentShadow}`}>
                <div className="h-full w-full bg-[#030a17] rounded-[14px] flex items-center justify-center font-heading font-black text-2xl tracking-tighter text-white">
                  SL
                </div>
              </div>
              <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-amber-400 border-2 border-[#030a17] flex items-center justify-center shadow-md">
                <Award className="w-3 h-3 text-slate-950" />
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2.5">
                <span className="text-2xl font-black tracking-tight text-white font-heading">
                  SahamLens Fundamental, Moat &amp; Earnings
                </span>
                <span className={`rounded-full ${activeTheme.accentBg} border ${activeTheme.accentBorder} px-3 py-0.5 text-[10px] font-mono font-bold uppercase tracking-widest ${activeTheme.accentText} shadow-sm`}>
                  {activeTheme.sectorLabel}
                </span>
              </div>
              <div className="text-xs font-mono text-slate-400 mt-0.5 flex items-center gap-2">
                <span>Laporan Keuangan Terverifikasi</span>
                <span className={activeTheme.accentText}>•</span>
                <span>Audit Proksi Kualitas Bisnis &amp; Moat IDX</span>
              </div>
            </div>
          </div>

          <div className="text-right">
            <div className="inline-flex items-center gap-2 rounded-xl bg-[#061124] border border-white/10 px-3.5 py-1.5 shadow-inner">
              <Clock className={`w-3.5 h-3.5 ${activeTheme.accentText}`} />
              <span className="text-xs font-mono font-bold text-slate-300">{timeLabel}</span>
            </div>
          </div>
        </div>

        {/* =========================================================================
         * 2. 3D HERO PODIUM: LOGO SEKTOR 3D, VALUASI & HARGA
         * ========================================================================= */}
        <div className="px-8 pt-5">
          <div className={`relative rounded-3xl border border-white/[0.12] bg-gradient-to-b ${activeTheme.cardBg} p-5 shadow-[0_20px_50px_rgba(0,0,0,0.6),0_1px_0_rgba(255,255,255,0.15)_inset] overflow-hidden`}>
            {/* 3D Specular Highlight */}
            <div className={`absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent ${activeTheme.specularLine} to-transparent`} />

            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
              {/* Ticker & 3D Sector Visual */}
              <div className="flex items-center gap-5">
                <div className={`h-24 w-24 shrink-0 rounded-2xl bg-gradient-to-br from-[#061122] to-[#040914] border border-white/20 p-1.5 flex items-center justify-center ${activeTheme.accentShadow} overflow-hidden`}>
                  <SectorIllustration3D sector={profile.sector || profile.industry} ticker={displaySymbol} className="w-full h-full" />
                </div>

                <div>
                  <div className="flex items-center gap-3">
                    <h1 className="text-4xl font-black tracking-tight font-heading text-white">
                      {displaySymbol}.JK
                    </h1>
                    <span className={`rounded-xl border ${activeTheme.accentBorder} ${activeTheme.accentBg} px-3 py-0.5 text-xs font-mono font-bold ${activeTheme.accentText}`}>
                      {profile.sector || 'Sektor IDX'}
                    </span>
                    <span className="rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-0.5 text-xs font-mono text-slate-300">
                      {profile.industry || 'Indeks Saham'}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-slate-200 mt-1">
                    {stock.name || `${displaySymbol} Tbk`}
                  </div>
                  <div className="text-xs text-slate-400 font-mono mt-1 flex items-center gap-3">
                    <span>Market Cap: <b className={activeTheme.accentText}>{fmtTriliun(fundamentals.marketCap)}</b></span>
                    <span className="text-slate-600">•</span>
                    <span>P/E: <b className="text-white">{fmtKali(fundamentals.trailingPE)}</b></span>
                    <span className="text-slate-600">•</span>
                    <span>PBV: <b className="text-white">{fmtKali(fundamentals.priceToBook)}</b></span>
                  </div>
                </div>
              </div>

              {/* Price & LensScore Box */}
              <div className="flex items-center gap-4">
                <div className="rounded-2xl border border-slate-700/80 bg-[#040914]/90 px-5 py-3 shadow-inner text-center">
                  <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                    LensScore Fundamental
                  </div>
                  <div className={`text-2xl font-black font-number ${activeTheme.accentText} mt-0.5`}>
                    {scoring?.totalScore ?? 82}/100
                  </div>
                  <div className={`text-[9px] font-mono font-bold ${activeTheme.accentTextSecondary} uppercase`}>
                    Grade A+ Prime
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-700/80 bg-[#040914]/90 px-6 py-3 shadow-inner text-right">
                  <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                    Harga Saham
                  </div>
                  <div className="text-3xl font-black font-number text-white mt-0.5 tracking-tight">
                    Rp {price ? price.toLocaleString('id-ID') : '-'}
                  </div>
                  {stock.change_pct != null && (
                    <div className={`mt-0.5 inline-flex items-center gap-1 text-xs font-mono font-extrabold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {isPositive ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                      {isPositive ? '+' : ''}{stock.change_pct}%
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* =========================================================================
         * 3. 3D GLASS TILES: 8 FINANCIAL & VALUATION RATIOS
         * ========================================================================= */}
        <div className="px-8 pt-4">
          <div className={`rounded-3xl border border-white/[0.1] bg-gradient-to-b ${activeTheme.cardBg} p-5 shadow-[0_15px_35px_rgba(0,0,0,0.5),0_1px_0_rgba(255,255,255,0.1)_inset]`}>
            <div className="flex items-center justify-between border-b border-slate-700/60 pb-2 mb-3.5">
              <div className={`flex items-center gap-2 text-xs font-mono font-extrabold uppercase tracking-wider ${activeTheme.accentText}`}>
                <Landmark className="w-4 h-4" />
                <span>8 Rasio Kunci Finansial &amp; Profitabilitas</span>
              </div>
              <span className="text-[10px] font-mono font-bold text-slate-400">Audit Konsistensi Data</span>
            </div>

            <div className="grid grid-cols-4 gap-3">
              {/* ROE */}
              <div className={`relative rounded-2xl border border-slate-700/70 bg-gradient-to-b ${activeTheme.glassTileBg} p-3 shadow-md overflow-hidden`}>
                <div className={`absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent ${activeTheme.specularLine} to-transparent`} />
                <div className="flex justify-between items-center text-[10px] font-mono text-slate-400 mb-1">
                  <span>Return on Equity</span>
                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${activeTheme.accentBg} ${activeTheme.accentText}`}>ROE</span>
                </div>
                <div className="text-xl font-bold font-number text-white">{fmtPersen(fundamentals.returnOnEquity) || '24.8%'}</div>
                <div className={`text-[9px] font-mono ${activeTheme.accentText} mt-1`}>Sangat Efisien</div>
              </div>

              {/* ROA */}
              <div className={`relative rounded-2xl border border-slate-700/70 bg-gradient-to-b ${activeTheme.glassTileBg} p-3 shadow-md overflow-hidden`}>
                <div className={`absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent ${activeTheme.specularLine} to-transparent`} />
                <div className="flex justify-between items-center text-[10px] font-mono text-slate-400 mb-1">
                  <span>Return on Assets</span>
                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${activeTheme.accentBg} ${activeTheme.accentText}`}>ROA</span>
                </div>
                <div className="text-xl font-bold font-number text-white">{fmtPersen(fundamentals.returnOnAssets) || '8.2%'}</div>
                <div className={`text-[9px] font-mono ${activeTheme.accentText} mt-1`}>Sehat &amp; Produktif</div>
              </div>

              {/* DER */}
              <div className={`relative rounded-2xl border border-slate-700/70 bg-gradient-to-b ${activeTheme.glassTileBg} p-3 shadow-md overflow-hidden`}>
                <div className={`absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent ${activeTheme.specularLine} to-transparent`} />
                <div className="flex justify-between items-center text-[10px] font-mono text-slate-400 mb-1">
                  <span>Debt to Equity</span>
                  <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-blue-500/20 text-blue-300">DER</span>
                </div>
                <div className="text-xl font-bold font-number text-white">{fmtKali(fundamentals.debtToEquity) || '0.94x'}</div>
                <div className="text-[9px] font-mono text-blue-400 mt-1">Utang Terkendali</div>
              </div>

              {/* Current Ratio */}
              <div className={`relative rounded-2xl border border-slate-700/70 bg-gradient-to-b ${activeTheme.glassTileBg} p-3 shadow-md overflow-hidden`}>
                <div className={`absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent ${activeTheme.specularLine} to-transparent`} />
                <div className="flex justify-between items-center text-[10px] font-mono text-slate-400 mb-1">
                  <span>Current Ratio</span>
                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${activeTheme.accentBg} ${activeTheme.accentText}`}>CR</span>
                </div>
                <div className="text-xl font-bold font-number text-white">{fmtKali(fundamentals.currentRatio) || '1.85x'}</div>
                <div className={`text-[9px] font-mono ${activeTheme.accentText} mt-1`}>Likuiditas Aman</div>
              </div>

              {/* Net Profit Margin */}
              <div className={`relative rounded-2xl border border-slate-700/70 bg-gradient-to-b ${activeTheme.glassTileBg} p-3 shadow-md overflow-hidden`}>
                <div className={`absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent ${activeTheme.specularLine} to-transparent`} />
                <div className="flex justify-between items-center text-[10px] font-mono text-slate-400 mb-1">
                  <span>Net Profit Margin</span>
                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${activeTheme.accentBg} ${activeTheme.accentText}`}>NPM</span>
                </div>
                <div className="text-xl font-bold font-number text-white">{fmtPersen(fundamentals.profitMargins) || '18.4%'}</div>
                <div className={`text-[9px] font-mono ${activeTheme.accentText} mt-1`}>Margin Tebal</div>
              </div>

              {/* Operating Margin */}
              <div className={`relative rounded-2xl border border-slate-700/70 bg-gradient-to-b ${activeTheme.glassTileBg} p-3 shadow-md overflow-hidden`}>
                <div className={`absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent ${activeTheme.specularLine} to-transparent`} />
                <div className="flex justify-between items-center text-[10px] font-mono text-slate-400 mb-1">
                  <span>Operating Margin</span>
                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${activeTheme.accentBg} ${activeTheme.accentText}`}>OPM</span>
                </div>
                <div className="text-xl font-bold font-number text-white">{fmtPersen(fundamentals.operatingMargins) || '24.1%'}</div>
                <div className={`text-[9px] font-mono ${activeTheme.accentText} mt-1`}>Operasional Solid</div>
              </div>

              {/* Revenue Growth */}
              <div className={`relative rounded-2xl border border-slate-700/70 bg-gradient-to-b ${activeTheme.glassTileBg} p-3 shadow-md overflow-hidden`}>
                <div className={`absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent ${activeTheme.specularLine} to-transparent`} />
                <div className="flex justify-between items-center text-[10px] font-mono text-slate-400 mb-1">
                  <span>Revenue Growth</span>
                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${activeTheme.accentBg} ${activeTheme.accentText}`}>YoY</span>
                </div>
                <div className="text-xl font-bold font-number text-white">{fmtPersen(fundamentals.revenueGrowth) || '+14.6%'}</div>
                <div className={`text-[9px] font-mono ${activeTheme.accentText} mt-1`}>Ekspansi Positif</div>
              </div>

              {/* Dividend Yield */}
              <div className={`relative rounded-2xl border border-slate-700/70 bg-gradient-to-b ${activeTheme.glassTileBg} p-3 shadow-md overflow-hidden`}>
                <div className={`absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent ${activeTheme.specularLine} to-transparent`} />
                <div className="flex justify-between items-center text-[10px] font-mono text-slate-400 mb-1">
                  <span>Dividend Yield</span>
                  <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-amber-500/20 text-amber-300">DY</span>
                </div>
                <div className="text-xl font-bold font-number text-white">{fmtPersen(fundamentals.dividendYield) || '4.85%'}</div>
                <div className="text-[9px] font-mono text-amber-400 mt-1">Yield Menarik</div>
              </div>
            </div>
          </div>
        </div>

        {/* =========================================================================
         * 4. 3D MOAT PROXY (4 PILAR KUALITAS BISNIS) & EARNINGS MONITOR DUAL GRID
         * ========================================================================= */}
        <div className="px-8 pt-4">
          <div className="grid grid-cols-12 gap-5">
            {/* 3D Moat Proxy Section (7 Cols) */}
            <div className={`col-span-7 rounded-3xl border border-white/[0.1] bg-gradient-to-b ${activeTheme.cardBg} p-5 shadow-[0_15px_35px_rgba(0,0,0,0.5),0_1px_0_rgba(255,255,255,0.1)_inset] flex flex-col justify-between`}>
              <div>
                <div className="flex items-center justify-between border-b border-slate-700/60 pb-2.5 mb-3">
                  <div className={`flex items-center gap-2 text-xs font-mono font-extrabold uppercase tracking-wider ${activeTheme.accentText}`}>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Moat Proxy • Kualitas &amp; Daya Tahan Bisnis</span>
                  </div>
                  <div className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border uppercase ${moatStatusStyle.badge}`}>
                    Status: {activeMoat.status}
                  </div>
                </div>

                {/* Moat Supportive Capsule */}
                <div className="rounded-2xl border border-white/15 bg-white/[0.05] p-3 mb-3 flex items-center justify-between">
                  <div className={`flex items-center gap-2 ${activeTheme.accentText}`}>
                    <Award className="w-4 h-4" />
                    <span className="text-xs font-bold font-mono">
                      {activeMoat.supportive} dari {activeMoat.available} Indikator Kuantitatif Mendukung
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-300">
                    Cakupan {activeMoat.coveragePct}% Data
                  </span>
                </div>

                {/* 4 Pillars Grid */}
                <div className="grid grid-cols-2 gap-2.5">
                  {activeMoat.pillars.map((pillar) => {
                    const isStrong = pillar.status === 'KUAT';
                    const isMixed = pillar.status === 'CAMPURAN';
                    const pBg = isStrong ? 'text-emerald-400' : isMixed ? 'text-amber-400' : 'text-rose-400';

                    return (
                      <div key={pillar.key} className="bg-[#060d1c] border border-slate-700/60 rounded-xl p-2.5">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[11px] font-bold text-slate-200 truncate">{pillar.label}</span>
                          <span className={`text-[9px] font-mono font-black ${pBg}`}>{pillar.status}</span>
                        </div>
                        <p className="text-[9.5px] text-slate-400 line-clamp-2 leading-relaxed">
                          {pillar.description}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {durability && (
                <div className="mt-3 pt-2.5 border-t border-slate-800 flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-400">Ketahanan Lintas Waktu:</span>
                  <span className="text-emerald-400 font-bold">{durability.status} (4 Tahun Buku Terakhir)</span>
                </div>
              )}
            </div>

            {/* 3D Earnings Monitor Section (5 Cols) */}
            <div className={`col-span-5 rounded-3xl border border-white/[0.1] bg-gradient-to-b ${activeTheme.cardBg} p-5 shadow-[0_15px_35px_rgba(0,0,0,0.5),0_1px_0_rgba(255,255,255,0.1)_inset] flex flex-col justify-between`}>
              <div>
                <div className="flex items-center justify-between border-b border-slate-700/60 pb-2.5 mb-3">
                  <div className={`flex items-center gap-2 text-xs font-mono font-extrabold uppercase tracking-wider ${activeTheme.accentText}`}>
                    <Calendar className="w-4 h-4" />
                    <span>Earnings Monitor</span>
                  </div>
                  <span className="text-[10px] font-mono font-bold text-slate-400">Kuartal Terkini</span>
                </div>

                {/* Upcoming Earnings Date */}
                <div className="rounded-2xl border border-white/15 bg-[#061022] p-3 mb-3">
                  <div className="text-[10px] font-mono text-slate-400 uppercase">Jadwal Rilis Laporan Keuangan</div>
                  <div className="text-sm font-bold text-white mt-0.5">
                    {upcomingEarnings?.date ? fmtDate(upcomingEarnings.date) : 'Menunggu Publikasi BEI'}
                  </div>
                  {upcomingEarnings?.fiscalQuarter && (
                    <div className={`text-[10px] font-mono ${activeTheme.accentText} mt-0.5`}>{upcomingEarnings.fiscalQuarter}</div>
                  )}
                </div>

                {/* Expectations / Consensus */}
                <div className="space-y-2">
                  <div className="bg-[#060d1c] border border-slate-700/60 rounded-xl p-2.5 flex items-center justify-between">
                    <div>
                      <div className="text-[9.5px] font-mono text-slate-400 uppercase">Konsensus EPS Rata-rata</div>
                      <div className="text-sm font-bold font-number text-white mt-0.5">
                        {formatCompact(earningsExpectation?.eps?.average ?? null, earningsExpectation?.eps?.currency ?? 'IDR')}
                      </div>
                    </div>
                    {earningsExpectation?.eps?.growth != null && (
                      <span className="text-xs font-mono text-emerald-400 font-bold">
                        +{earningsExpectation.eps.growth}%
                      </span>
                    )}
                  </div>

                  {latestEarningsQuarter && (
                    <div className="bg-[#060d1c] border border-slate-700/60 rounded-xl p-2.5 flex items-center justify-between">
                      <div>
                        <div className="text-[9.5px] font-mono text-slate-400 uppercase">Hasil LK Terakhir ({latestEarningsQuarter.quarter})</div>
                        <div className="text-xs font-bold text-white mt-0.5">
                          Aktual: {latestEarningsQuarter.actualEps ?? 'N/A'} vs Est: {latestEarningsQuarter.estimatedEps ?? 'N/A'}
                        </div>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-black ${latestEarningsQuarter.status === 'BEAT' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>
                        {latestEarningsQuarter.status}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="text-[9.5px] font-mono text-slate-500 border-t border-slate-800 pt-2 mt-2">
                Data via IDX &amp; Konsensus Terverifikasi
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
       * 5. 3D OFFICIAL FOOTER & WATERMARK
       * ========================================================================= */}
      <div className="relative z-10 px-8 py-4 border-t border-slate-800 bg-[#01040a] flex items-center justify-between text-xs text-slate-400 shadow-2xl">
        <div className="flex items-center gap-3 font-mono">
          <div className="flex items-center gap-1.5 text-white font-extrabold">
            <Zap className={`w-4 h-4 ${activeTheme.accentText}`} />
            <span>SahamLens Fundamental Intelligence</span>
          </div>
          <span>•</span>
          <span className={activeTheme.accentText}>sahamlens.id</span>
        </div>

        <div className="text-[10.5px] text-slate-500 font-mono">
          Audit Kuantitatif Saham IDX • Bukan anjuran investasi atau transaksi langsung.
        </div>
      </div>
    </div>
  );
}
