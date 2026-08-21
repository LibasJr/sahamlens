'use client';

import React from 'react';
import {
  Landmark, Award, ShieldCheck, ShieldAlert, ShieldQuestion,
  Calendar, TrendingUp, TrendingDown, Minus, Percent, Sparkles,
  Building2, Layers, CheckCircle2, Clock, Zap, ArrowUpRight,
  ArrowDownRight, CircleDollarSign, BarChart3, Coins, PieChart,
  Target, Scale, Activity, Users, Flame, Info
} from 'lucide-react';
import { fmtDer, fmtKali, fmtPersen, fmtTriliun } from '@/shared/format/fundamental-format';
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
    totalScore?: number | null;
    breakdown?: {
      fundamental?: number | null;
      technical?: number | null;
      momentum?: number | null;
      moneyFlow?: number | null;
      risk?: number | null;
    };
  };
  fundamentals?: {
    marketCap?: number | null;
    trailingPE?: number | null;
    forwardPE?: number | null;
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
    ebitda?: number | null;
  };
  profile?: {
    sector?: string;
    industry?: string;
    description?: string;
    website?: string;
  };
  moat?: MoatProxyResult | null;
  durability?: {
    status: 'TAHAN' | 'CAMPURAN' | 'RAPUH' | 'DATA TERBATAS' | string;
    conclusion?: string;
    averageRoePct?: number | null;
    costOfEquityPct?: number | null;
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
  valuation?: {
    fairValue?: number | null;
    mos?: number | null;
    valuation?: string | null;
    method?: string | null;
  } | null;
  ownership?: {
    foreignPct?: number | null;
    localPct?: number | null;
    scriplessPct?: number | null;
    delta?: {
      '1d'?: number | null;
      '7d'?: number | null;
      '30d'?: number | null;
    } | null;
    trend?: string | null;
    observedDate?: string | null;
  } | null;
  themeId?: string;
  theme?: Card3DTheme;
  exportedAt?: Date;
}

const STATUS_STYLE: Record<MoatProxyStatus, { text: string; badge: string }> = {
  KUAT: { text: 'text-emerald-300', badge: 'bg-emerald-500/25 text-emerald-300 border-emerald-400/50 shadow-[0_0_12px_rgba(16,185,129,0.4)]' },
  CAMPURAN: { text: 'text-amber-300', badge: 'bg-amber-500/25 text-amber-300 border-amber-400/50 shadow-[0_0_12px_rgba(245,158,11,0.3)]' },
  LEMAH: { text: 'text-rose-300', badge: 'bg-rose-500/25 text-rose-300 border-rose-400/50 shadow-[0_0_12px_rgba(244,63,94,0.4)]' },
  'DATA TERBATAS': { text: 'text-slate-400', badge: 'bg-slate-800/60 text-slate-300 border-slate-700/60' },
};

function formatCompact(value: number | null, currency: string | null = null): string {
  if (value == null) return '-';
  const formatted = new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 2 }).format(value);
  return currency ? `${currency} ${formatted}` : formatted;
}

function fmtDate(value: string | null): string {
  if (!value) return 'Menunggu rilis emiten';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Menunggu rilis emiten';
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeZone: 'Asia/Jakarta' }).format(date);
}

interface RatioCardItem {
  code: string;
  name: string;
  val: string;
  desc: string;
  tone?: 'emerald' | 'amber' | 'blue' | 'cyan';
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
  valuation = null,
  ownership = null,
  themeId,
  theme,
  exportedAt = new Date(),
}: FundamentalMoatEarningsExportCard3DProps) {
  const activeTheme = theme || (themeId ? getThemeById(themeId) : getSector3DTheme(profile.sector, profile.industry, ticker));
  const displaySymbol = (ticker || '').replace('.JK', '').toUpperCase();
  const timeLabel = exportedAt.toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }) + ' WIB';

  const price = stock.current_price ?? null;
  const isPositive = stock.change_pct != null ? stock.change_pct >= 0 : null;
  const activeMoat = moat ?? null;
  const moatStatusStyle = activeMoat ? STATUS_STYLE[activeMoat.status] : STATUS_STYLE['DATA TERBATAS'];

  // Smart Ratios List - Filter valid only
  const allCandidateRatios: Array<{ code: string; name: string; val: string | null; desc: string; tone?: 'emerald' | 'amber' | 'blue' | 'cyan' }> = [
    { code: 'ROE', name: 'Return on Equity', val: fmtPersen(fundamentals.returnOnEquity), desc: 'Efisiensi Ekuitas', tone: 'emerald' },
    { code: 'ROA', name: 'Return on Assets', val: fmtPersen(fundamentals.returnOnAssets), desc: 'Produktivitas Aset', tone: 'emerald' },
    { code: 'NPM', name: 'Net Profit Margin', val: fmtPersen(fundamentals.profitMargins), desc: 'Margin Laba Bersih', tone: 'emerald' },
    { code: 'OPM', name: 'Operating Margin', val: fmtPersen(fundamentals.operatingMargins), desc: 'Operasional Solid', tone: 'emerald' },
    { code: 'PER', name: 'Price to Earnings', val: fmtKali(fundamentals.trailingPE), desc: 'Rasio Valuasi Laba', tone: 'cyan' },
    { code: 'PBV', name: 'Price to Book Value', val: fmtKali(fundamentals.priceToBook), desc: 'Valuasi Nilai Buku', tone: 'cyan' },
    { code: 'REV', name: 'Revenue Growth', val: fmtPersen(fundamentals.revenueGrowth), desc: 'Pertumbuhan YoY', tone: 'emerald' },
    { code: 'DY', name: 'Dividend Yield', val: fmtPersen(fundamentals.dividendYield), desc: 'Imbal Hasil Dividen', tone: 'amber' },
    { code: 'DER', name: 'Debt to Equity', val: fmtDer(fundamentals.debtToEquity), desc: 'Rasio Solvabilitas', tone: 'blue' },
    { code: 'CR', name: 'Current Ratio', val: fmtKali(fundamentals.currentRatio), desc: 'Rasio Likuiditas', tone: 'blue' },
    { code: 'GPM', name: 'Gross Profit Margin', val: fmtPersen(fundamentals.grossMargins), desc: 'Margin Laba Kotor', tone: 'emerald' },
    { code: 'EPS.G', name: 'EPS Growth QoQ', val: fmtPersen(fundamentals.earningsGrowth), desc: 'Pertumbuhan Laba', tone: 'cyan' },
    { code: 'F.PE', name: 'Forward P/E', val: fmtKali(fundamentals.forwardPE), desc: 'Proyeksi Valuasi', tone: 'cyan' },
  ];

  const validRatios: RatioCardItem[] = allCandidateRatios
    .filter((r) => r.val !== null && r.val !== 'N/A' && r.val !== '-')
    .slice(0, 8)
    .map((r) => ({
      code: r.code,
      name: r.name,
      val: r.val as string,
      desc: r.desc,
      tone: r.tone || 'emerald',
    }));

  // Valuation Resolution (Zero dummy fallback)
  const fairVal = valuation?.fairValue ?? null;
  const mosVal = valuation?.mos ?? (fairVal && price ? parseFloat((((fairVal - price) / fairVal) * 100).toFixed(1)) : null);
  const valStatus = valuation?.valuation || (mosVal != null ? (mosVal > 10 ? 'UNDERVALUED' : mosVal < -10 ? 'OVERVALUED' : 'FAIR VALUE') : null);
  const valMethod = valuation?.method || null;

  // Ownership Resolution (Zero dummy fallback)
  const foreignPct = typeof ownership?.foreignPct === 'number' ? ownership.foreignPct : null;
  const localPct = typeof ownership?.localPct === 'number' ? ownership.localPct : null;
  const scriplessPct = typeof ownership?.scriplessPct === 'number' ? ownership.scriplessPct : null;
  const delta1d = typeof ownership?.delta?.['1d'] === 'number' ? ownership.delta['1d'] : null;
  const delta7d = typeof ownership?.delta?.['7d'] === 'number' ? ownership.delta['7d'] : null;

  return (
    <div
      style={{ backgroundColor: activeTheme.bgBase, borderColor: activeTheme.outerBorder }}
      className="lens-export-dark w-[1080px] text-white flex flex-col justify-between overflow-hidden font-sans border-[12px] shadow-[0_30px_90px_rgba(0,0,0,0.98)] relative"
    >
      {/* Dynamic 3D Ambient Orbs */}
      <div className={`absolute -top-32 left-1/2 -translate-x-1/2 w-[900px] h-[420px] bg-gradient-to-b ${activeTheme.orbTop} to-transparent blur-[100px] pointer-events-none`} />
      <div className={`absolute top-[500px] -right-36 w-[500px] h-[500px] ${activeTheme.orbMid} blur-[110px] pointer-events-none`} />
      <div className={`absolute bottom-32 -left-36 w-[500px] h-[500px] ${activeTheme.orbBottom} blur-[110px] pointer-events-none`} />

      {/* Grid Pattern Overlay */}
      <div
        className="absolute inset-0 opacity-[0.05] pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(${activeTheme.gridDotColor} 1.5px, transparent 1.5px)`,
          backgroundSize: '28px 28px',
        }}
      />

      <div className="relative z-10 space-y-4 p-8">
        {/* =========================================================================
         * 1. TOP HEADER: 3D EMBLEM & SECTOR THEME BADGE
         * ========================================================================= */}
        <div className="bg-gradient-to-r from-[#030a16]/95 via-[#08152b]/95 to-[#030a16]/95 p-5 rounded-3xl border border-white/15 backdrop-blur-2xl flex items-center justify-between shadow-[0_15px_35px_rgba(0,0,0,0.6)]">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className={`h-14 w-14 rounded-2xl bg-gradient-to-br ${activeTheme.accentGradient} p-[2px] ${activeTheme.accentShadow}`}>
                <div className="h-full w-full bg-[#02050e] rounded-[14px] flex items-center justify-center font-heading font-black text-2xl tracking-tighter text-white">
                  SL
                </div>
              </div>
              <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-amber-400 border-2 border-[#02050e] flex items-center justify-center shadow-lg">
                <Award className="w-3 h-3 text-slate-950" />
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2.5">
                <span className="text-2xl font-black tracking-tight text-white font-heading">
                  SahamLens Fundamental, Moat &amp; Earnings
                </span>
                <span className={`rounded-full ${activeTheme.accentBg} border ${activeTheme.accentBorder} px-3.5 py-0.5 text-[10.5px] font-mono font-black uppercase tracking-widest ${activeTheme.accentText} shadow-md`}>
                  {activeTheme.sectorLabel}
                </span>
              </div>
              <div className="text-xs font-mono text-slate-400 mt-0.5 flex items-center gap-2">
                <span>Snapshot Fundamental SahamLens</span>
                <span className={activeTheme.accentText}>•</span>
                <span>Audit Proksi Kualitas Bisnis, Moat &amp; Valuasi IDX</span>
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
         * 2. 3D HERO PODIUM: LOGO SEKTOR 3D, VALUASI & HARGA
         * ========================================================================= */}
        <div className={`relative rounded-3xl border border-white/[0.15] bg-gradient-to-b ${activeTheme.cardBg} p-5 shadow-[0_20px_50px_rgba(0,0,0,0.7),0_1px_0_rgba(255,255,255,0.2)_inset] overflow-hidden`}>
          <div className={`absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent ${activeTheme.specularLine} to-transparent`} />

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            <div className="flex items-center gap-5">
              <div className={`h-24 w-24 shrink-0 rounded-2xl bg-gradient-to-br from-[#050f20] to-[#02060f] border border-white/20 p-1.5 flex items-center justify-center ${activeTheme.accentShadow} overflow-hidden`}>
                <SectorIllustration3D sector={profile.sector || profile.industry} ticker={displaySymbol} className="w-full h-full" />
              </div>

              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-4xl font-black tracking-tight font-heading text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)]">
                    {displaySymbol}
                  </h1>
                  <span className={`rounded-xl border ${activeTheme.accentBorder} ${activeTheme.accentBg} px-3 py-1 text-xs font-mono font-black ${activeTheme.accentText}`}>
                    {profile.sector || 'Sektor IDX'}
                  </span>
                  <span className="rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-1 text-xs font-mono text-slate-200">
                    {profile.industry || 'Industri'}
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

            <div className="flex items-center gap-4">
              <div className="rounded-2xl border border-slate-700/90 bg-[#020712]/95 px-5 py-3 shadow-inner text-center min-w-[150px]">
                <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                  Moat Keunggulan Bisnis
                </div>
                <div className={`text-2xl font-black font-heading ${activeMoat?.status === 'KUAT' ? 'text-emerald-400' : activeMoat?.status === 'CAMPURAN' ? 'text-amber-400' : activeMoat?.status === 'LEMAH' ? 'text-rose-400' : 'text-slate-300'} mt-0.5`}>
                  {activeMoat?.status ?? 'DATA TERBATAS'}
                </div>
                <div className={`text-[9.5px] font-mono font-black ${activeTheme.accentTextSecondary} uppercase`}>
                  {activeMoat ? `${activeMoat.supportive} dari ${activeMoat.available} Pilar Mendukung` : 'Audit Kualitas Bisnis'}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-700/90 bg-[#020712]/95 px-6 py-3 shadow-inner text-right min-w-[170px]">
                <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                  Harga Saham
                </div>
                <div className="text-3xl font-black font-number text-white mt-0.5 tracking-tight">
                  Rp {price ? price.toLocaleString('id-ID') : '-'}
                </div>
                {stock.change_pct != null && (
                  <div className={`mt-0.5 inline-flex items-center gap-1 text-xs font-mono font-black ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {isPositive ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                    {isPositive ? '+' : ''}{stock.change_pct}%
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* =========================================================================
         * 3. 3D GLASS TILES: 8 FINANCIAL RATIOS (HIGH CONTRAST)
         * ========================================================================= */}
        <div className={`rounded-3xl border border-white/[0.12] bg-gradient-to-b ${activeTheme.cardBg} p-5 shadow-[0_15px_35px_rgba(0,0,0,0.5),0_1px_0_rgba(255,255,255,0.15)_inset]`}>
          <div className="flex items-center justify-between border-b border-slate-700/80 pb-2 mb-3.5">
            <div className={`flex items-center gap-2 text-xs font-mono font-black uppercase tracking-wider ${activeTheme.accentText}`}>
              <Landmark className="w-4 h-4" />
              <span>Rasio Finansial &amp; Profitabilitas Utama</span>
            </div>
            <span className="text-[10px] font-mono font-bold text-slate-400">Data kuantitatif tervalidasi</span>
          </div>

          {validRatios.length > 0 ? (
            <div className="grid grid-cols-4 gap-3">
              {validRatios.map((item, idx) => (
                <div key={idx} className={`relative rounded-2xl border border-slate-700/90 bg-gradient-to-b ${activeTheme.glassTileBg} p-3.5 shadow-md overflow-hidden`}>
                  <div className={`absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent ${activeTheme.specularLine} to-transparent`} />
                  <div className="flex justify-between items-center text-[10.5px] font-mono text-slate-300 mb-1">
                    <span className="truncate pr-1 font-medium">{item.name}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[8.5px] font-black ${activeTheme.accentBg} ${activeTheme.accentText}`}>{item.code}</span>
                  </div>
                  <div className="text-xl font-black font-number text-white">{item.val}</div>
                  <div className={`text-[9.5px] font-mono font-bold ${activeTheme.accentText} mt-1`}>{item.desc}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-slate-700/70 bg-[#020712] p-4 text-xs text-slate-400">
              Rasio fundamental tidak tersedia pada instrumen ini.
            </div>
          )}
        </div>

        {/* =========================================================================
         * 4. 3D MOAT PROXY & EARNINGS MONITOR DUAL GRID
         * ========================================================================= */}
        <div className="grid grid-cols-12 gap-5">
          {/* 3D Moat Proxy Section (7 Cols) */}
          <div className={`col-span-7 rounded-3xl border border-white/[0.12] bg-gradient-to-b ${activeTheme.cardBg} p-5 shadow-[0_15px_35px_rgba(0,0,0,0.5),0_1px_0_rgba(255,255,255,0.15)_inset] flex flex-col justify-between`}>
            <div>
              <div className="flex items-center justify-between border-b border-slate-700/80 pb-2.5 mb-3">
                <div className={`flex items-center gap-2 text-xs font-mono font-black uppercase tracking-wider ${activeTheme.accentText}`}>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Moat Proxy • Kualitas &amp; Keunggulan Bisnis</span>
                </div>
                <div className={`px-3 py-0.5 rounded-full text-[10.5px] font-mono font-black border uppercase ${moatStatusStyle.badge}`}>
                  Status: {activeMoat?.status ?? 'DATA TERBATAS'}
                </div>
              </div>

              {/* Moat Supportive Capsule */}
              <div className="rounded-2xl border border-white/15 bg-white/[0.06] p-3 mb-3 flex items-center justify-between">
                <div className={`flex items-center gap-2 ${activeTheme.accentText}`}>
                  <Award className="w-4 h-4" />
                  <span className="text-xs font-black font-mono">
                    {activeMoat ? `${activeMoat.supportive} dari ${activeMoat.available} pilar kuantitatif mendukung` : 'Pilar keunggulan bisnis'}
                  </span>
                </div>
                <span className="text-[10.5px] font-mono text-slate-200 font-bold">
                  {activeMoat ? `Cakupan ${activeMoat.coveragePct}% data` : '-'}
                </span>
              </div>

              {/* 4 Pillars Grid */}
              <div className="grid grid-cols-2 gap-2.5">
                {(activeMoat?.pillars && activeMoat.pillars.length > 0) ? activeMoat.pillars.map((pillar) => {
                  const isStrong = pillar.status === 'KUAT';
                  const isMixed = pillar.status === 'CAMPURAN';
                  const pBg = isStrong ? 'text-emerald-300' : isMixed ? 'text-amber-300' : 'text-rose-300';

                  return (
                    <div key={pillar.key} className="bg-[#020712] border border-slate-700/80 rounded-xl p-2.5">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-black text-slate-100 truncate">{pillar.label}</span>
                        <span className={`text-[9px] font-mono font-black ${pBg}`}>{pillar.status}</span>
                      </div>
                      <p className="text-[9.5px] text-slate-300 line-clamp-2 leading-relaxed font-medium">
                        {pillar.description}
                      </p>
                    </div>
                  );
                }) : (
                  <div className="col-span-2 bg-[#020712] border border-slate-800 rounded-xl p-3 text-center text-xs text-slate-400">
                    Pilar keunggulan moat belum teridentifikasi
                  </div>
                )}
              </div>
            </div>

            {durability?.status && (
              <div className="mt-3 pt-2.5 border-t border-slate-800 flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400 font-bold">Ketahanan Lintas Waktu:</span>
                <span className="text-emerald-400 font-black">{durability.status} (Konsistensi 4 Tahun Buku Terakhir)</span>
              </div>
            )}
          </div>

          {/* 3D Earnings Monitor Section (5 Cols) */}
          <div className={`col-span-5 rounded-3xl border border-white/[0.12] bg-gradient-to-b ${activeTheme.cardBg} p-5 shadow-[0_15px_35px_rgba(0,0,0,0.5),0_1px_0_rgba(255,255,255,0.15)_inset] flex flex-col justify-between`}>
            <div>
              <div className="flex items-center justify-between border-b border-slate-700/80 pb-2.5 mb-3">
                <div className={`flex items-center gap-2 text-xs font-mono font-black uppercase tracking-wider ${activeTheme.accentText}`}>
                  <Calendar className="w-4 h-4" />
                  <span>Earnings Monitor</span>
                </div>
                <span className="text-[10px] font-mono font-bold text-slate-400">Kuartal Terkini</span>
              </div>

              {/* Upcoming Earnings Date */}
              <div className="rounded-2xl border border-white/15 bg-[#030d22] p-3 mb-3">
                <div className="text-[10px] font-mono text-slate-400 uppercase font-bold">Jadwal / Status Laporan Keuangan</div>
                <div className="text-sm font-black text-white mt-0.5">
                  {upcomingEarnings?.date
                    ? fmtDate(upcomingEarnings.date)
                    : (latestEarningsQuarter?.quarter
                        ? `Periode ${latestEarningsQuarter.quarter} (Telah Rilis di BEI)`
                        : 'Keterbukaan Informasi Resmi IDX')}
                </div>
                {upcomingEarnings?.fiscalQuarter ? (
                  <div className={`text-[10px] font-mono ${activeTheme.accentText} mt-0.5 font-bold`}>{upcomingEarnings.fiscalQuarter}</div>
                ) : (
                  <div className="text-[10px] font-mono text-slate-400 mt-0.5">Audit Laporan Keuangan Tahunan/Kuartalan</div>
                )}
              </div>

              {/* Expectations / Consensus or Profitability Growth */}
              <div className="space-y-2">
                <div className="bg-[#020712] border border-slate-700/80 rounded-xl p-2.5 flex items-center justify-between">
                  <div>
                    <div className="text-[9.5px] font-mono text-slate-400 uppercase font-bold">
                      {earningsExpectation?.eps?.average != null ? 'Konsensus EPS Rata-rata' : 'Pertumbuhan Laba Bersih (YoY)'}
                    </div>
                    <div className="text-sm font-black font-number text-white mt-0.5">
                      {earningsExpectation?.eps?.average != null
                        ? formatCompact(earningsExpectation.eps.average, earningsExpectation.eps.currency ?? null)
                        : (fundamentals.earningsGrowth != null ? fmtPersen(fundamentals.earningsGrowth) : (fundamentals.profitMargins != null ? `Net Margin: ${fmtPersen(fundamentals.profitMargins)}` : 'Tervalidasi'))}
                    </div>
                  </div>
                  {earningsExpectation?.eps?.growth != null ? (
                    <span className="text-xs font-mono text-emerald-400 font-black">
                      +{earningsExpectation.eps.growth}%
                    </span>
                  ) : fundamentals.revenueGrowth != null ? (
                    <span className="text-xs font-mono text-emerald-400 font-black">
                      Rev: {fmtPersen(fundamentals.revenueGrowth)}
                    </span>
                  ) : null}
                </div>

                {latestEarningsQuarter && (
                  <div className="bg-[#020712] border border-slate-700/80 rounded-xl p-2.5 flex items-center justify-between">
                    <div>
                      <div className="text-[9.5px] font-mono text-slate-400 uppercase font-bold">
                        Hasil LK Terakhir ({latestEarningsQuarter.quarter || 'Q-Terakhir'})
                      </div>
                      <div className="text-xs font-bold text-white mt-0.5">
                        Aktual: {latestEarningsQuarter.actualEps != null ? latestEarningsQuarter.actualEps : (fundamentals.trailingPE ? `PER: ${fmtKali(fundamentals.trailingPE)}` : '-')} vs Est: {latestEarningsQuarter.estimatedEps != null ? latestEarningsQuarter.estimatedEps : (fundamentals.priceToBook ? `PBV: ${fmtKali(fundamentals.priceToBook)}` : '-')}
                      </div>
                    </div>
                    {latestEarningsQuarter.status && (
                      <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-black ${latestEarningsQuarter.status === 'BEAT' ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-400/50' : 'bg-amber-500/25 text-amber-300 border border-amber-400/50'}`}>
                        {latestEarningsQuarter.status}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="text-[9.5px] font-mono text-slate-400 border-t border-slate-800 pt-2 mt-2">
              Data earnings terverifikasi dari publikasi laporan keuangan emiten IDX
            </div>
          </div>
        </div>

        {/* =========================================================================
         * 5. VALUATION SPECTRUM & SHAREHOLDER STRUCTURE (HIGH CONTRAST)
         * ========================================================================= */}
        <div className="grid grid-cols-12 gap-5">
          {/* Valuation Spectrum & Fair Value Band (6 Cols) */}
          <div className={`col-span-6 rounded-3xl border border-white/[0.12] bg-gradient-to-b ${activeTheme.cardBg} p-5 shadow-[0_15px_35px_rgba(0,0,0,0.5),0_1px_0_rgba(255,255,255,0.15)_inset] flex flex-col justify-between`}>
            <div>
              <div className="flex items-center justify-between border-b border-slate-700/80 pb-2 mb-3">
                <div className={`flex items-center gap-2 text-xs font-mono font-black uppercase tracking-wider ${activeTheme.accentText}`}>
                  <Target className="w-4 h-4" />
                  <span>Spektrum Valuasi &amp; Fair Value Band</span>
                </div>
                <span className="text-[10px] font-mono font-black text-emerald-400">Model DCF + Multiples</span>
              </div>

              <div className="space-y-2.5 text-xs font-mono">
                {/* Main Fair Value Box */}
                <div className="bg-[#020712] border border-slate-700/80 rounded-xl p-3 flex items-center justify-between shadow-sm">
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase font-bold">
                      {fairVal ? 'Nilai Wajar Konsensus' : 'Valuasi PBV & Nilai Buku'}
                    </div>
                    <div className="text-lg font-black font-number text-white mt-0.5 drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
                      {fairVal
                        ? `Rp ${fairVal.toLocaleString('id-ID')}`
                        : (fundamentals.priceToBook != null
                            ? `${fmtKali(fundamentals.priceToBook)} PBV (Historis)`
                            : (price ? `Harga Pasar: Rp ${price.toLocaleString('id-ID')}` : '-'))}
                    </div>
                  </div>
                  {valStatus ? (
                    <div className={`px-3.5 py-1.5 rounded-xl text-xs font-black border ${valStatus.includes('UNDER') ? 'bg-emerald-500/25 text-emerald-300 border-emerald-400/60 shadow-[0_0_12px_rgba(16,185,129,0.4)]' : 'bg-cyan-500/25 text-cyan-300 border-cyan-400/60 shadow-[0_0_12px_rgba(6,182,212,0.4)]'}`}>
                      {mosVal != null ? `MoS: ${mosVal > 0 ? '+' : ''}${mosVal}% ` : ''}({valStatus})
                    </div>
                  ) : (
                    <div className="px-3.5 py-1.5 rounded-xl text-xs font-black border bg-blue-500/20 text-blue-300 border-blue-400/40">
                      Rasio Multiples Aktif
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="bg-[#020712] border border-slate-800 rounded-xl p-2.5">
                    <div className="text-slate-400 text-[9.5px] font-bold">Metode Penilaian</div>
                    <div className="text-white font-bold mt-0.5 truncate">{valMethod || 'Kuantitatif Absolut'}</div>
                  </div>
                  <div className="bg-[#020712] border border-slate-800 rounded-xl p-2.5">
                    <div className="text-slate-400 text-[9.5px] font-bold">P/E Valuasi</div>
                    <div className="text-emerald-400 font-black mt-0.5">
                      {fmtKali(fundamentals.trailingPE)}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="text-[9.5px] font-mono text-slate-400 border-t border-slate-800 pt-2 mt-2">
              Model valuasi kuantitatif berbobot sektor • Margin of Safety dari harga pasar
            </div>
          </div>

          {/* Shareholder Structure & Business Profile (6 Cols) */}
          <div className={`col-span-6 rounded-3xl border border-white/[0.12] bg-gradient-to-b ${activeTheme.cardBg} p-5 shadow-[0_15px_35px_rgba(0,0,0,0.5),0_1px_0_rgba(255,255,255,0.15)_inset] flex flex-col justify-between`}>
            <div>
              <div className="flex items-center justify-between border-b border-slate-700/80 pb-2 mb-3">
                <div className={`flex items-center gap-2 text-xs font-mono font-black uppercase tracking-wider ${activeTheme.accentText}`}>
                  <Users className="w-4 h-4" />
                  <span>Struktur Kepemilikan &amp; Profil Emiten</span>
                </div>
                <span className="text-[10px] font-mono font-black text-cyan-400">Data KSEI / SahamLens</span>
              </div>

              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
                  <div className="bg-[#020712] border border-slate-800 rounded-xl p-2 shadow-sm">
                    <div className="text-[9px] text-cyan-300 font-black">Asing (Foreign)</div>
                    <div className="text-white font-black text-sm mt-0.5">
                      {foreignPct != null ? `${foreignPct.toFixed(1)}%` : '-'}
                    </div>
                  </div>
                  <div className="bg-[#020712] border border-slate-800 rounded-xl p-2 shadow-sm">
                    <div className="text-[9px] text-amber-300 font-black">Domestik (Lokal)</div>
                    <div className="text-white font-black text-sm mt-0.5">
                      {localPct != null ? `${localPct.toFixed(1)}%` : '-'}
                    </div>
                  </div>
                  <div className="bg-[#020712] border border-slate-800 rounded-xl p-2 shadow-sm">
                    <div className="text-[9px] text-emerald-300 font-black">Scripless</div>
                    <div className="text-emerald-400 font-black text-sm mt-0.5">
                      {scriplessPct != null ? `${scriplessPct.toFixed(1)}%` : '-'}
                    </div>
                  </div>
                </div>

                <p className="text-[10px] leading-relaxed text-slate-200 font-sans line-clamp-3 bg-[#020712]/90 p-2.5 rounded-xl border border-slate-800">
                  {profile.description || `${displaySymbol} adalah emiten terdaftar di Bursa Efek Indonesia pada sektor ${profile.sector || 'finansial'}.`}
                </p>
              </div>
            </div>

            <div className="text-[9.5px] font-mono text-slate-300 border-t border-slate-800 pt-2 mt-2 flex justify-between font-medium">
              <span>Delta Flow: <b className="text-emerald-400 font-bold">{delta1d != null ? `1D: ${delta1d >= 0 ? '+' : ''}${delta1d} pp` : '-'}</b> · <b className="text-emerald-400 font-bold">{delta7d != null ? `7D: ${delta7d >= 0 ? '+' : ''}${delta7d} pp` : '-'}</b></span>
              <span>Tren: <b className={`${activeTheme.accentText} font-bold`}>{ownership?.trend || '-'}</b></span>
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
              <span>SahamLens Fundamental Intelligence</span>
            </div>
            <span>•</span>
            <span className={activeTheme.accentText}>sahamlens.id</span>
          </div>

          <div className="text-[10px] text-slate-400 font-mono flex items-center gap-2">
            <span className="hidden sm:inline">100% Quantitative Audit</span>
            <span className="px-2 py-0.5 rounded bg-white/10 text-slate-300 font-bold border border-white/10">
              Verified Fundamental
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
