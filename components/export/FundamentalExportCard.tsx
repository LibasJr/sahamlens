'use client';

import React from 'react';
import {
  Coins, TrendingUp, Scale, Percent, PieChart, Wallet, Layers,
  ShieldCheck, Target, Sparkles, Building2, CheckCircle2, AlertCircle,
  ArrowUpRight, ArrowDownRight, Award, Flame, Users, Landmark,
  BarChart3, Activity, Compass, Gauge, AlertTriangle, ArrowRight,
  CircleDollarSign, DollarSign, Calendar, TrendingDown, FileText,
  LineChart, Zap, Check, Eye, ChevronRight
} from 'lucide-react';
import { fmtKali, fmtPersen, fmtTriliun } from '@/shared/format/fundamental-format';
import { getSectorTheme, type SectorTheme } from './sector-theme';
import SectorIllustration3D from './SectorIllustration3D';

interface AnalyzerItem {
  name?: string;
  label?: string;
  value?: string | number;
  decision?: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | string;
  confidence?: number;
  description?: string;
  raw?: any;
}

interface FundamentalExportCardProps {
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
      technical?: number;
      momentum?: number;
      fundamental?: number;
      moneyFlow?: number;
      risk?: number;
    };
    reasons?: string[];
    riskNotes?: string[];
  };
  technicalAnalyzers?: AnalyzerItem[];
  fundamentalAnalyzers?: AnalyzerItem[];
  fundamentals: {
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
  profile: {
    sector?: string;
    industry?: string;
    description?: string;
    website?: string;
  };
  consensus?: string;
  exportedAt: Date;
}

export default function FundamentalExportCard({
  ticker,
  stock,
  scoring,
  technicalAnalyzers = [],
  fundamentalAnalyzers = [],
  fundamentals,
  profile,
  consensus,
  exportedAt,
}: FundamentalExportCardProps) {
  const displaySymbol = ticker.replace('.JK', '');
  const timeLabel = exportedAt.toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }) + ' WIB';

  const price = stock.current_price ?? null;
  const isPositive = stock.change_pct != null ? stock.change_pct >= 0 : null;
  const lensScore = scoring?.totalScore ?? null;

  const getDecisionBadge = (decision?: string, confidence?: number) => {
    const isBull = decision === 'BULLISH';
    const isBear = decision === 'BEARISH';
    const bg = isBull ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : isBear ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' : 'bg-slate-700/60 text-slate-300 border-slate-600/60';

    return (
      <div className="flex items-center gap-1.5 shrink-0">
        <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-black border uppercase ${bg}`}>
          {decision || 'N/A'}
        </span>
        {confidence != null && (
          <span className="text-[8.5px] font-mono text-slate-400">
            Conf: {confidence}%
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="lens-export-dark w-[1080px] bg-[#050912] text-white flex flex-col overflow-hidden font-sans border-[10px] border-[#0a1222] shadow-2xl">
      {/* =========================================================================
       * 1. HEADER UTAMA
       * ========================================================================= */}
      <div className="bg-gradient-to-r from-[#081326] via-[#0e2142] to-[#0a162d] px-8 py-4 border-b border-blue-500/30 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 p-0.5 shadow-lg flex items-center justify-center">
            <div className="h-full w-full bg-[#070e1c] rounded-[10px] flex items-center justify-center font-heading font-extrabold text-xl text-blue-400">
              SL
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-black tracking-tight text-white font-heading">SahamLens Analytics Report</span>
              <span className="rounded-md bg-blue-500/20 border border-blue-400/30 px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-widest text-blue-300">
                SahamLens Data Snapshot
              </span>
            </div>
            <div className="text-[11px] font-mono text-slate-300">
              Laporan Analisis Komprehensif Berdasarkan Engine Kuantitatif SahamLens
            </div>
          </div>
        </div>

        <div className="text-right">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 px-3 py-1 text-xs font-mono font-extrabold text-emerald-300 shadow-sm">
            <Zap className="w-3.5 h-3.5 text-emerald-400" />
            <span>{consensus || 'DATA N/A'}</span>
          </div>
          <div className="text-[10.5px] font-mono text-slate-400 mt-0.5">{timeLabel}</div>
        </div>
      </div>

      {/* =========================================================================
       * 2. BANNER EMITEN: LOGO 3D, HARGA BESAR, TREND & SIGNAL BADGE
       * ========================================================================= */}
      <div className="px-8 pt-4">
        <div className="rounded-2xl border border-slate-700/80 bg-[#0a1220] p-4 shadow-lg flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-20 w-20 shrink-0 rounded-2xl bg-[#060c16] border border-blue-500/30 p-1 flex items-center justify-center shadow-inner overflow-hidden">
              <SectorIllustration3D sector={profile.sector || profile.industry} ticker={displaySymbol} className="w-full h-full" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <span className="text-3xl font-black tracking-tight font-heading text-white">{displaySymbol}.JK</span>
                <span className="rounded-lg border border-blue-500/40 bg-blue-500/20 px-2.5 py-0.5 text-xs font-bold text-blue-300">
                  {profile.sector || 'Sektor N/A'}
                </span>
                <span className="rounded-lg border border-slate-600 bg-slate-800/80 px-2.5 py-0.5 text-xs font-semibold text-slate-300">
                  {profile.industry || 'Industri N/A'}
                </span>
              </div>
              <div className="text-sm font-bold text-slate-200 mt-1">{stock.name || `${displaySymbol} Tbk`}</div>
              <div className="text-xs text-slate-400 font-mono mt-0.5">
                Market Cap: {fmtTriliun(fundamentals.marketCap)} • Volume: {stock.volume != null ? `${(stock.volume / 1000000).toFixed(1)} Jt` : 'N/A'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-5">
            <div className="rounded-xl border border-slate-700/80 bg-[#060c16] px-4 py-2 text-center">
              <div className="text-[9.5px] font-mono font-bold uppercase text-slate-400">LensScore</div>
              <div className="text-2xl font-black font-number text-emerald-400">{lensScore != null ? `${lensScore}/100` : 'N/A'}</div>
              <div className="text-[8.5px] font-bold text-emerald-400 uppercase">
                {lensScore != null ? (lensScore >= 80 ? 'Grade A+' : lensScore >= 60 ? 'Grade B' : 'Grade C') : 'Score tidak tersedia'}
              </div>
            </div>

            <div className="text-right">
              <div className="text-[9.5px] font-mono font-bold uppercase text-slate-400">Harga Terkini</div>
              <div className="text-3xl font-black font-number text-white mt-0.5">
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

      {/* =========================================================================
       * 3. WIDGET 1: LENSTECHNICAL (INDIKATOR TEKNIKAL SAHAMLENS)
       * ========================================================================= */}
      <div className="px-8 pt-3.5">
        <div className="rounded-2xl border border-slate-700/80 bg-[#0a1220] p-4 shadow-md">
          <div className="flex items-center justify-between border-b border-slate-700/60 pb-2 mb-3">
            <div className="flex items-center gap-2 text-xs font-mono font-extrabold uppercase tracking-wider text-blue-400">
              <LineChart className="w-4 h-4 text-blue-400" />
              <span>LensTechnical • 8 Indikator Teknikal &amp; Smart Money</span>
            </div>
            <span className="text-[10px] font-mono font-bold text-slate-400">Analisis dari payload SahamLens</span>
          </div>

          <div className="grid grid-cols-4 gap-2.5">
            {technicalAnalyzers.length > 0 ? (
              technicalAnalyzers.slice(0, 8).map((t, idx) => (
                <div key={idx} className="rounded-xl border border-slate-700/60 bg-[#060c16] p-2.5 flex flex-col justify-between">
                  <div className="flex items-start justify-between gap-1 mb-1">
                    <span className="text-[10px] font-mono font-bold text-slate-300 line-clamp-1">{t.label || t.name}</span>
                    {getDecisionBadge(t.decision, t.confidence)}
                  </div>
                  <div className="text-xs font-mono font-extrabold text-white mt-1 line-clamp-1">
                    {t.value ?? 'N/A'}
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-4 rounded-xl border border-slate-700/60 bg-[#060c16] p-4 text-xs text-slate-400">Analyzer teknikal tidak tersedia pada payload export.</div>
            )}
          </div>
        </div>
      </div>

      {/* =========================================================================
       * 4. WIDGET 2: LENSFUNDAMENTAL (INDIKATOR FUNDAMENTAL & KINERJA LABA)
       * ========================================================================= */}
      <div className="px-8 pt-3.5">
        <div className="rounded-2xl border border-slate-700/80 bg-[#0a1220] p-4 shadow-md">
          <div className="flex items-center justify-between border-b border-slate-700/60 pb-2 mb-3">
            <div className="flex items-center gap-2 text-xs font-mono font-extrabold uppercase tracking-wider text-emerald-400">
              <Landmark className="w-4 h-4 text-emerald-400" />
              <span>LensFundamental • 8 Rasio Finansial &amp; Profitabilitas</span>
            </div>
            <span className="text-[10px] font-mono font-bold text-slate-400">Snapshot fundamental dari payload SahamLens</span>
          </div>

          <div className="grid grid-cols-4 gap-2.5">
            {fundamentalAnalyzers.length > 0 ? (
              fundamentalAnalyzers.slice(0, 8).map((f, idx) => (
                <div key={idx} className="rounded-xl border border-slate-700/60 bg-[#060c16] p-2.5 flex flex-col justify-between">
                  <div className="flex items-start justify-between gap-1 mb-1">
                    <span className="text-[10px] font-mono font-bold text-slate-300 line-clamp-1">{f.label || f.name}</span>
                    {getDecisionBadge(f.decision, f.confidence)}
                  </div>
                  <div className="text-xs font-mono font-extrabold text-white mt-1 line-clamp-1">
                    {f.value ?? 'N/A'}
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-4 rounded-xl border border-slate-700/60 bg-[#060c16] p-4 text-xs text-slate-400">Analyzer fundamental tidak tersedia pada payload export.</div>
            )}
          </div>
        </div>
      </div>

      {/* =========================================================================
       * 5. WIDGET 3: BREAKDOWN SKOR LENSSCORE & PROFIL PERUSAHAAN
       * ========================================================================= */}
      <div className="px-8 pt-3.5">
        <div className="grid grid-cols-2 gap-3.5">
          {/* Breakdown Skor */}
          <div className="rounded-2xl border border-slate-700/80 bg-[#0a1220] p-4">
            <div className="text-xs font-mono font-extrabold uppercase tracking-wider text-blue-400 mb-2 flex items-center gap-1.5">
              <Gauge className="w-4 h-4 text-blue-400" />
              <span>Breakdown Skor LensScore</span>
            </div>
            <div className="space-y-2 text-xs font-mono">
              <div>
                <div className="flex justify-between text-slate-300 mb-0.5">
                  <span>Technical Score</span>
                  <span className="font-bold text-emerald-400">{scoring?.breakdown?.technical != null ? `${scoring.breakdown.technical} / 40` : 'N/A'}</span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-400" style={{ width: `${scoring?.breakdown?.technical != null ? Math.max(0, Math.min(100, (scoring.breakdown.technical / 40) * 100)) : 0}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-slate-300 mb-0.5">
                  <span>Momentum Score</span>
                  <span className="font-bold text-purple-400">{scoring?.breakdown?.momentum != null ? `${scoring.breakdown.momentum} / 100` : 'N/A'}</span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-purple-400" style={{ width: `${scoring?.breakdown?.momentum != null ? Math.max(0, Math.min(100, scoring.breakdown.momentum)) : 0}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-slate-300 mb-0.5">
                  <span>Fundamental Score</span>
                  <span className="font-bold text-blue-400">{scoring?.breakdown?.fundamental != null ? `${scoring.breakdown.fundamental} / 30` : 'N/A'}</span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-400" style={{ width: `${scoring?.breakdown?.fundamental != null ? Math.max(0, Math.min(100, (scoring.breakdown.fundamental / 30) * 100)) : 0}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-slate-300 mb-0.5">
                  <span>Money Flow Score</span>
                  <span className="font-bold text-amber-400">{scoring?.breakdown?.moneyFlow != null ? `${scoring.breakdown.moneyFlow} / 30` : 'N/A'}</span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-400" style={{ width: `${scoring?.breakdown?.moneyFlow != null ? Math.max(0, Math.min(100, (scoring.breakdown.moneyFlow / 30) * 100)) : 0}%` }} />
                </div>
              </div>
            </div>
          </div>

          {/* Deskripsi & Ringkasan */}
          <div className="rounded-2xl border border-slate-700/80 bg-[#0a1220] p-4 flex flex-col justify-between">
            <div>
              <div className="text-xs font-mono font-extrabold uppercase tracking-wider text-purple-400 mb-1.5 flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-purple-400" />
                <span>Profil &amp; Deskripsi Perusahaan</span>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-200 line-clamp-4">
                {profile.description || 'Deskripsi perusahaan tidak tersedia pada payload export ini.'}
              </p>
            </div>
            <div className="mt-2 pt-2 border-t border-slate-800 text-[10px] font-mono text-emerald-400 flex items-center justify-between">
              <span>Sektor: {profile.sector || 'IDX'}</span>
              <span>Industri: {profile.industry || 'Umum'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
       * 6. FOOTER RESMI & WATERMARK BRANDING
       * ========================================================================= */}
      <div className="px-8 py-3.5 border-t border-slate-800 bg-[#02050a] mt-3 flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-2 font-mono">
          <span className="font-extrabold text-white">SahamLens Analytics Engine</span>
          <span>•</span>
          <span className="text-blue-400">https://sahamlens.id</span>
        </div>
        <div className="text-[10px] text-slate-500 font-mono">
          Data berasal dari payload SahamLens; field yang tidak tersedia ditampilkan N/A • Bukan anjuran transaksi langsung.
        </div>
      </div>
    </div>
  );
}
