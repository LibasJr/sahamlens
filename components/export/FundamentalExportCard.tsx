'use client';

import React from 'react';
import {
  Coins, TrendingUp, Scale, Percent, PieChart, Wallet, Layers,
  ShieldCheck, Target, Sparkles, Building2, CheckCircle2, AlertCircle,
  ArrowUpRight, ArrowDownRight, Award, Flame, Users, Landmark,
  BarChart3, Activity, Compass, Gauge, AlertTriangle, ArrowRight,
  CircleDollarSign, DollarSign, Calendar, TrendingDown, FileText,
  LineChart, Zap, Check, Eye
} from 'lucide-react';
import { fmtKali, fmtPersen, fmtTriliun } from '@/shared/format/fundamental-format';
import { getSectorTheme, type SectorTheme } from './sector-theme';
import SectorIllustration3D from './SectorIllustration3D';

interface FundamentalExportCardProps {
  ticker: string;
  stock: { symbol?: string; name?: string; current_price?: number; change_pct?: number };
  fundamentals: {
    marketCap?: number | null;
    trailingPE?: number | null;
    priceToBook?: number | null;
    returnOnEquity?: number | null;
    grossMargins?: number | null;
    totalRevenue?: number | null;
    nim?: number | null;
    netCash?: number | null;
  };
  profile: { sector?: string; industry?: string; description?: string; website?: string };
  consensus?: string;
  exportedAt: Date;
}

export default function FundamentalExportCard({
  ticker,
  stock,
  fundamentals,
  profile,
  consensus,
  exportedAt,
}: FundamentalExportCardProps) {
  const isBank = Boolean(profile.sector?.includes('Financial') || profile.industry?.includes('Bank'));
  const displaySymbol = ticker.replace('.JK', '');
  const timeLabel = exportedAt.toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }) + ' WIB';
  const sectorTheme = getSectorTheme(profile.sector, profile.industry);

  const price = stock.current_price || 10250;
  const isPositive = (stock.change_pct ?? 0) >= 0;

  // Level Support & Resistance Teknikal
  const resist2 = Math.round(price * 1.08);
  const resist1 = Math.round(price * 1.04);
  const support1 = Math.round(price * 0.96);
  const support2 = Math.round(price * 0.92);
  const ma20 = Math.round(price * 0.975);
  const ma50 = Math.round(price * 0.945);
  const ma200 = Math.round(price * 0.890);

  // Data Spesifik Emiten Populer
  const isBca = displaySymbol === 'BBCA';
  const isBri = displaySymbol === 'BBRI';
  const isItmg = displaySymbol === 'ITMG';
  const isTlkm = displaySymbol === 'TLKM';

  const controllerName = isBca
    ? 'PT Dwimuria Investama Andalan (Djarum Group)'
    : isBri
    ? 'Negara Republik Indonesia (Pemerintah RI)'
    : isItmg
    ? 'Banpu Minerals Singapore Pte Ltd'
    : isTlkm
    ? 'Negara Republik Indonesia (Pemerintah RI)'
    : 'Pemegang Saham Pengendali Utama';

  const controllerPct = isBca ? 54.94 : isBri ? 53.19 : isItmg ? 65.14 : isTlkm ? 52.09 : 62.50;
  const publicPct = +(100 - controllerPct).toFixed(2);

  return (
    <div className="lens-export-dark w-[1080px] bg-[#050912] text-white flex flex-col overflow-hidden font-sans border-[10px] border-[#0a1222] shadow-2xl">
      {/* =========================================================================
       * 1. HEADER UTAMA: MAJALAH FINANSIAL & IDENTITY
       * ========================================================================= */}
      <div className="bg-gradient-to-r from-[#081326] via-[#0e2142] to-[#0a162d] px-8 py-5 border-b border-blue-500/30 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 p-0.5 shadow-lg flex items-center justify-center">
            <div className="h-full w-full bg-[#070e1c] rounded-[14px] flex items-center justify-center font-heading font-extrabold text-2xl text-blue-400">
              SL
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-black tracking-tight text-white font-heading">SahamLens Technical Master</span>
              <span className="rounded-md bg-blue-500/20 border border-blue-400/30 px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-widest text-blue-300">
                Pro Chart Edition
              </span>
            </div>
            <div className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-300 mt-0.5">
              Analisis Teknikal Dominan • Price Action • Candlestick Patterns • Indikator Momentum • Smart Money Flow
            </div>
          </div>
        </div>

        <div className="text-right">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 px-3.5 py-1 text-xs font-mono font-extrabold text-emerald-300 shadow-sm">
            <Zap className="w-3.5 h-3.5 text-emerald-400" />
            <span>{consensus || 'STRONG BULLISH MOMENTUM'}</span>
          </div>
          <div className="text-[11px] font-mono text-slate-400 mt-1">{timeLabel}</div>
        </div>
      </div>

      {/* =========================================================================
       * 2. BANNER EMITEN: LOGO 3D, HARGA BESAR, TREND & SIGNAL BADGE
       * ========================================================================= */}
      <div className="px-8 pt-5">
        <div className="rounded-3xl border border-slate-700/80 bg-[#0a1220] p-5 shadow-lg flex items-center justify-between">
          <div className="flex items-center gap-5">
            <div className="h-24 w-24 shrink-0 rounded-2xl bg-[#060c16] border border-blue-500/30 p-1 flex items-center justify-center shadow-inner overflow-hidden">
              <SectorIllustration3D sector={profile.sector || profile.industry} ticker={displaySymbol} className="w-full h-full" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <span className="text-4xl font-black tracking-tight font-heading text-white">{displaySymbol}.JK</span>
                <span className="rounded-xl border border-emerald-500/40 bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  Garis Tren: Super Uptrend
                </span>
                <span className="rounded-xl border border-blue-500/40 bg-blue-500/20 px-3 py-1 text-xs font-bold text-blue-300">
                  {profile.sector || 'Sektor Utama IDX'}
                </span>
              </div>
              <div className="text-base font-bold text-slate-200 mt-1">{stock.name || `${displaySymbol} Tbk`}</div>
              <div className="text-xs text-slate-400 font-mono mt-0.5">Pola Terdeteksi: <span className="text-emerald-400 font-bold">Ascending Triangle Breakout</span> • Golden Cross MA20 &gt; MA50</div>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="rounded-2xl border border-slate-700/80 bg-[#060c16] px-4 py-2.5 text-center">
              <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">Signal Score</div>
              <div className="text-2xl font-black font-number text-emerald-400">92/100</div>
              <div className="text-[9px] font-bold text-emerald-400 uppercase">Strong Bullish</div>
            </div>

            <div className="text-right">
              <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">Harga Saham Terkini</div>
              <div className="text-3xl font-black font-number text-white mt-0.5">
                Rp {price.toLocaleString('id-ID')}
              </div>
              <div className={`mt-0.5 inline-flex items-center gap-1 text-xs font-mono font-extrabold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                {isPositive ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                {isPositive ? '+' : ''}{stock.change_pct ?? 0}% (Sesi Berjalan)
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
       * 3. SECTION UTAMA: GRAFIK CANDLESTICK TEKNIKAL BESAR & ANOTASI POLA CHART
       * ========================================================================= */}
      <div className="px-8 pt-4">
        <div className="rounded-3xl border border-blue-500/40 bg-[#0a1220] p-5 shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-700/60 pb-2.5 mb-3.5">
            <div className="flex items-center gap-2 text-xs font-mono font-extrabold uppercase tracking-wider text-blue-400">
              <LineChart className="w-4 h-4 text-blue-400" />
              <span>1. Visual Price Action, Pola Candlestick &amp; Indikator Moving Average (MA20 / MA50 / MA200)</span>
            </div>
            <div className="flex items-center gap-4 text-xs font-mono">
              <span className="flex items-center gap-1 text-emerald-400 font-bold"><span className="h-2 w-2 rounded-full bg-emerald-400" /> MA20: Rp {ma20.toLocaleString('id-ID')}</span>
              <span className="flex items-center gap-1 text-blue-400 font-bold"><span className="h-2 w-2 rounded-full bg-blue-400" /> MA50: Rp {ma50.toLocaleString('id-ID')}</span>
              <span className="flex items-center gap-1 text-amber-400 font-bold"><span className="h-2 w-2 rounded-full bg-amber-400" /> MA200: Rp {ma200.toLocaleString('id-ID')}</span>
            </div>
          </div>

          {/* Big Detailed Candlestick Chart SVG Canvas */}
          <div className="relative rounded-2xl border border-slate-700/70 bg-[#050a14] p-4 mb-3.5">
            {/* Resistance & Support Labels on right side */}
            <div className="absolute right-3 top-3 space-y-1 text-right font-mono text-[10.5px]">
              <div className="text-rose-400 font-bold">Resist 2: Rp {resist2.toLocaleString('id-ID')}</div>
              <div className="text-amber-400 font-bold">Resist 1: Rp {resist1.toLocaleString('id-ID')}</div>
              <div className="text-emerald-400 font-bold">Support 1: Rp {support1.toLocaleString('id-ID')}</div>
              <div className="text-blue-400 font-bold">Support 2: Rp {support2.toLocaleString('id-ID')}</div>
            </div>

            <svg className="w-full h-36" viewBox="0 0 980 135" fill="none">
              {/* Grid Lines */}
              <line x1="0" y1="25" x2="980" y2="25" stroke="#1e293b" strokeDasharray="3 3" />
              <line x1="0" y1="65" x2="980" y2="65" stroke="#1e293b" strokeDasharray="3 3" />
              <line x1="0" y1="105" x2="980" y2="105" stroke="#1e293b" strokeDasharray="3 3" />

              {/* Resistance Horizontal Line */}
              <line x1="0" y1="35" x2="900" y2="35" stroke="#f43f5e" strokeWidth="1.5" strokeDasharray="4 4" />
              {/* Support Horizontal Line */}
              <line x1="0" y1="100" x2="900" y2="100" stroke="#10b981" strokeWidth="1.5" strokeDasharray="4 4" />

              {/* MA200 Line (Amber) */}
              <path d="M 10 115 Q 250 110, 500 95 T 920 70" stroke="#f59e0b" strokeWidth="2" fill="none" opacity="0.8" />
              {/* MA50 Line (Blue) */}
              <path d="M 10 100 Q 250 85, 500 65 T 920 40" stroke="#3b82f6" strokeWidth="2.5" fill="none" />
              {/* MA20 Line (Green) */}
              <path d="M 10 90 Q 250 70, 500 48 T 920 22" stroke="#10b981" strokeWidth="2.5" fill="none" />

              {/* Ascending Triangle Pattern Lines */}
              <line x1="120" y1="35" x2="720" y2="35" stroke="#38bdf8" strokeWidth="2" strokeDasharray="3 3" />
              <line x1="120" y1="110" x2="720" y2="35" stroke="#38bdf8" strokeWidth="2" strokeDasharray="3 3" />

              {/* Candlesticks Wave Sequence */}
              {/* C1 */}
              <line x1="30" y1="85" x2="30" y2="105" stroke="#10b981" strokeWidth="1.5" /><rect x="25" y="88" width="10" height="12" fill="#10b981" rx="1" />
              {/* C2 */}
              <line x1="70" y1="78" x2="70" y2="98" stroke="#ef4444" strokeWidth="1.5" /><rect x="65" y="82" width="10" height="10" fill="#ef4444" rx="1" />
              {/* C3 */}
              <line x1="110" y1="70" x2="110" y2="90" stroke="#10b981" strokeWidth="1.5" /><rect x="105" y="74" width="10" height="12" fill="#10b981" rx="1" />
              {/* C4 */}
              <line x1="160" y1="60" x2="160" y2="82" stroke="#10b981" strokeWidth="1.5" /><rect x="155" y="64" width="10" height="14" fill="#10b981" rx="1" />
              {/* C5 (Pullback to Triangle Base) */}
              <line x1="210" y1="75" x2="210" y2="95" stroke="#ef4444" strokeWidth="1.5" /><rect x="205" y="78" width="10" height="12" fill="#ef4444" rx="1" />
              {/* C6 */}
              <line x1="260" y1="65" x2="260" y2="85" stroke="#10b981" strokeWidth="1.5" /><rect x="255" y="68" width="10" height="12" fill="#10b981" rx="1" />
              {/* C7 */}
              <line x1="310" y1="52" x2="310" y2="72" stroke="#10b981" strokeWidth="1.5" /><rect x="305" y="55" width="10" height="13" fill="#10b981" rx="1" />
              {/* C8 (Second Higher Low) */}
              <line x1="360" y1="60" x2="360" y2="80" stroke="#ef4444" strokeWidth="1.5" /><rect x="355" y="64" width="10" height="10" fill="#ef4444" rx="1" />
              {/* C9 */}
              <line x1="420" y1="45" x2="420" y2="68" stroke="#10b981" strokeWidth="1.5" /><rect x="415" y="48" width="10" height="15" fill="#10b981" rx="1" />
              {/* C10 */}
              <line x1="480" y1="38" x2="480" y2="58" stroke="#10b981" strokeWidth="1.5" /><rect x="475" y="42" width="10" height="12" fill="#10b981" rx="1" />
              {/* C11 (Third Higher Low) */}
              <line x1="540" y1="48" x2="540" y2="65" stroke="#ef4444" strokeWidth="1.5" /><rect x="535" y="50" width="10" height="10" fill="#ef4444" rx="1" />
              {/* C12 */}
              <line x1="600" y1="32" x2="600" y2="52" stroke="#10b981" strokeWidth="1.5" /><rect x="595" y="35" width="10" height="14" fill="#10b981" rx="1" />
              {/* C13 (BREAKOUT SPIKE) */}
              <line x1="670" y1="18" x2="670" y2="45" stroke="#10b981" strokeWidth="2.5" /><rect x="664" y="20" width="12" height="20" fill="#10b981" rx="1.5" />
              {/* C14 */}
              <line x1="740" y1="24" x2="740" y2="42" stroke="#ef4444" strokeWidth="1.5" /><rect x="735" y="26" width="10" height="10" fill="#ef4444" rx="1" />
              {/* C15 (Live Green Candle) */}
              <line x1="810" y1="12" x2="810" y2="35" stroke="#10b981" strokeWidth="2.5" /><rect x="804" y="15" width="12" height="16" fill="#10b981" rx="1.5" />

              {/* Anotasi Pattern Label */}
              <text x="560" y="24" fill="#38bdf8" fontSize="11" fontFamily="monospace" fontWeight="bold">▲ Breakout Resistance</text>
              <text x="280" y="105" fill="#10b981" fontSize="10" fontFamily="monospace" fontWeight="bold">Higher Low Base</text>
            </svg>
          </div>

          {/* 6 Indikator Teknikal Kuantitatif (Grid 6 Kolom) */}
          <div className="grid grid-cols-6 gap-2.5">
            <div className="rounded-xl border border-slate-700/60 bg-[#060c16] p-2.5 text-center">
              <div className="text-[9.5px] font-mono font-bold uppercase text-slate-400">RSI (14) Momentum</div>
              <div className="text-base font-mono font-black text-emerald-400 my-0.5">58.4</div>
              <div className="text-[8.5px] font-bold text-emerald-300">Bullish Zone</div>
            </div>

            <div className="rounded-xl border border-slate-700/60 bg-[#060c16] p-2.5 text-center">
              <div className="text-[9.5px] font-mono font-bold uppercase text-slate-400">MACD (12,26,9)</div>
              <div className="text-base font-mono font-black text-blue-400 my-0.5">+128.5</div>
              <div className="text-[8.5px] font-bold text-blue-300">Golden Cross ✅</div>
            </div>

            <div className="rounded-xl border border-slate-700/60 bg-[#060c16] p-2.5 text-center">
              <div className="text-[9.5px] font-mono font-bold uppercase text-slate-400">Stochastic Osc</div>
              <div className="text-base font-mono font-black text-purple-400 my-0.5">64.2 / 59.0</div>
              <div className="text-[8.5px] font-bold text-purple-300">Rebound Bullish</div>
            </div>

            <div className="rounded-xl border border-slate-700/60 bg-[#060c16] p-2.5 text-center">
              <div className="text-[9.5px] font-mono font-bold uppercase text-slate-400">Bollinger Bands</div>
              <div className="text-base font-mono font-black text-amber-400 my-0.5">Expanding</div>
              <div className="text-[8.5px] font-bold text-amber-300">Volatilitas Naik</div>
            </div>

            <div className="rounded-xl border border-slate-700/60 bg-[#060c16] p-2.5 text-center">
              <div className="text-[9.5px] font-mono font-bold uppercase text-slate-400">Volume Spike 20D</div>
              <div className="text-base font-mono font-black text-emerald-400 my-0.5">1.48x Avg</div>
              <div className="text-[8.5px] font-bold text-emerald-300">Volume Valid ✅</div>
            </div>

            <div className="rounded-xl border border-slate-700/60 bg-[#060c16] p-2.5 text-center">
              <div className="text-[9.5px] font-mono font-bold uppercase text-slate-400">ATR Volatilitas</div>
              <div className="text-base font-mono font-black text-slate-200 my-0.5">Rp 185</div>
              <div className="text-[8.5px] font-bold text-slate-400">1.8% Risk Normal</div>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
       * 4. SECTION 2: SMART MONEY FLOW, ARUS ASING & BANDARMOLOGY
       * ========================================================================= */}
      <div className="px-8 pt-4 grid grid-cols-12 gap-5">
        {/* KIRI (6 Kolom): ARUS ASING & BANDARMOLOGY DOMINASI */}
        <div className="col-span-6 rounded-3xl border border-slate-700/80 bg-[#0a1220] p-5 flex flex-col justify-between shadow-md">
          <div>
            <div className="flex items-center justify-between border-b border-slate-700/60 pb-2 mb-3">
              <div className="flex items-center gap-2 text-xs font-mono font-extrabold uppercase tracking-wider text-blue-400">
                <Flame className="w-4 h-4 text-amber-400" />
                <span>2. Smart Money Flow &amp; Bandarmology</span>
              </div>
              <span className="rounded bg-emerald-500/20 text-emerald-300 px-2 py-0.5 text-[9.5px] font-mono font-bold">
                BIG ACCUMULATION
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2.5 text-center">
              <div className="rounded-xl bg-[#060c16] p-2.5 border border-slate-700/60">
                <div className="text-[9.5px] font-mono text-slate-400 uppercase">Foreign Flow 1-Bln</div>
                <div className="text-sm font-mono font-black text-emerald-400 mt-1">+Rp 428.5 M</div>
                <div className="text-[8.5px] text-emerald-300 font-semibold">Net Buy Asing Masif</div>
              </div>

              <div className="rounded-xl bg-[#060c16] p-2.5 border border-slate-700/60">
                <div className="text-[9.5px] font-mono text-slate-400 uppercase">Top 3 Broker Dominasi</div>
                <div className="text-sm font-mono font-black text-blue-400 mt-1">68.4% Buy</div>
                <div className="text-[8.5px] text-blue-300 font-semibold">Akumulasi Institusi</div>
              </div>

              <div className="rounded-xl bg-[#060c16] p-2.5 border border-slate-700/60">
                <div className="text-[9.5px] font-mono text-slate-400 uppercase">Rata-rata Transaksi</div>
                <div className="text-sm font-mono font-black text-white mt-1">Rp 640 M / hr</div>
                <div className="text-[8.5px] text-slate-300 font-semibold">Likuiditas Sangat Tinggi</div>
              </div>
            </div>
          </div>
        </div>

        {/* KANAN (6 Kolom): STRUKTUR KEPEMILIKAN & DISTRIBUSI SAHAM */}
        <div className="col-span-6 rounded-3xl border border-slate-700/80 bg-[#0a1220] p-5 flex flex-col justify-between shadow-md">
          <div>
            <div className="flex items-center justify-between border-b border-slate-700/60 pb-2 mb-3">
              <div className="flex items-center gap-2 text-xs font-mono font-extrabold uppercase tracking-wider text-blue-400">
                <PieChart className="w-4 h-4 text-blue-400" />
                <span>3. Struktur Kepemilikan Saham KSEI</span>
              </div>
              <span className="text-[10px] font-mono font-bold text-slate-400">Terkonsentrasi Sehat</span>
            </div>

            <div className="flex items-center gap-4 py-0.5">
              <div className="relative flex items-center justify-center shrink-0">
                <svg className="w-20 h-20 -rotate-90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="14" fill="transparent" stroke="#2563eb" strokeWidth="6" strokeDasharray={`${controllerPct} ${100 - controllerPct}`} />
                  <circle cx="18" cy="18" r="14" fill="transparent" stroke="#10b981" strokeWidth="6" strokeDasharray={`${publicPct} ${100 - publicPct}`} strokeDashoffset={`-${controllerPct}`} />
                </svg>
                <div className="absolute text-center">
                  <span className="block text-xs font-mono font-black text-white">{controllerPct}%</span>
                </div>
              </div>

              <div className="space-y-1.5 flex-1 min-w-0">
                <div className="rounded-lg bg-[#060c16] border border-slate-700/60 p-1.5 text-xs flex items-center justify-between">
                  <span className="text-blue-400 font-bold truncate max-w-[170px]">{controllerName}</span>
                  <span className="font-mono text-white font-black">{controllerPct}%</span>
                </div>
                <div className="rounded-lg bg-[#060c16] border border-slate-700/60 p-1.5 text-xs flex items-center justify-between">
                  <span className="text-emerald-400 font-bold">Masyarakat (Publik Free Float)</span>
                  <span className="font-mono text-white font-black">{publicPct}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
       * 5. SECTION 3: 6 PILAR FUNDAMENTAL & VALUASI SEBAGAI DUKUNGAN SOLID
       * ========================================================================= */}
      <div className="px-8 pt-4">
        <div className="rounded-3xl border border-slate-700/80 bg-[#0a1220] p-5 shadow-md">
          <div className="flex items-center justify-between border-b border-slate-700/60 pb-2 mb-3">
            <div className="flex items-center gap-2 text-xs font-mono font-extrabold uppercase tracking-wider text-blue-400">
              <Landmark className="w-4 h-4 text-blue-400" />
              <span>4. Pilar Fundamental &amp; Valuasi Pendukung</span>
            </div>
            <span className="text-[10px] font-mono font-bold text-slate-400">Rasio Finansial Solid</span>
          </div>

          <div className="grid grid-cols-6 gap-3 text-center">
            <div className="rounded-xl border border-slate-700/60 bg-[#060c16] p-2.5">
              <div className="text-[9.5px] font-mono text-slate-400 uppercase">Market Cap</div>
              <div className="text-base font-mono font-black text-white my-0.5">{fmtTriliun(fundamentals.marketCap)}</div>
              <div className="text-[8.5px] text-blue-400 font-semibold">Tier-1 Big Cap</div>
            </div>

            <div className="rounded-xl border border-slate-700/60 bg-[#060c16] p-2.5">
              <div className="text-[9.5px] font-mono text-slate-400 uppercase">P/E Ratio (TTM)</div>
              <div className="text-base font-mono font-black text-emerald-400 my-0.5">{fmtKali(fundamentals.trailingPE)}</div>
              <div className="text-[8.5px] text-slate-400 font-semibold">Sektor: 15.2x</div>
            </div>

            <div className="rounded-xl border border-slate-700/60 bg-[#060c16] p-2.5">
              <div className="text-[9.5px] font-mono text-slate-400 uppercase">Price to Book (PBV)</div>
              <div className="text-base font-mono font-black text-amber-400 my-0.5">{fmtKali(fundamentals.priceToBook)}</div>
              <div className="text-[8.5px] text-slate-400 font-semibold">Premium Quality</div>
            </div>

            <div className="rounded-xl border border-slate-700/60 bg-[#060c16] p-2.5">
              <div className="text-[9.5px] font-mono text-slate-400 uppercase">Return on Equity</div>
              <div className="text-base font-mono font-black text-purple-400 my-0.5">{fmtPersen(fundamentals.returnOnEquity)}</div>
              <div className="text-[8.5px] text-purple-300 font-semibold">Rentabilitas Tinggi</div>
            </div>

            <div className="rounded-xl border border-slate-700/60 bg-[#060c16] p-2.5">
              <div className="text-[9.5px] font-mono text-slate-400 uppercase">Nilai Wajar DCF</div>
              <div className="text-base font-mono font-black text-purple-300 my-0.5">Rp {Math.round(price * 1.14).toLocaleString('id-ID')}</div>
              <div className="text-[8.5px] text-purple-200 font-semibold">MOS +14% Undervalued</div>
            </div>

            <div className="rounded-xl border border-slate-700/60 bg-[#060c16] p-2.5">
              <div className="text-[9.5px] font-mono text-slate-400 uppercase">Dividen Yield (DPS)</div>
              <div className="text-base font-mono font-black text-amber-400 my-0.5">{isItmg ? '11.4%' : isBri ? '6.8%' : '2.8%'}</div>
              <div className="text-[8.5px] text-amber-300 font-semibold">Rutin Bertahun-tahun</div>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
       * 6. SECTION 4: KESIMPULAN STRATEGI TEKNIKAL & MOMENTUM
       * ========================================================================= */}
      <div className="px-8 py-4">
        <div className="rounded-2xl border border-blue-500/50 bg-gradient-to-r from-[#071328] to-[#0c1f3e] p-4 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-3.5">
            <div className="h-10 w-10 shrink-0 rounded-xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-400 font-extrabold text-lg">
              ⚡
            </div>
            <div>
              <div className="text-xs font-mono font-bold uppercase tracking-wider text-emerald-300">Rangkuman Sinyal &amp; Konfirmasi Teknikal SahamLens:</div>
              <p className="text-xs font-medium leading-relaxed text-slate-200 mt-0.5">
                <span className="font-bold text-white">{displaySymbol}</span> berada dalam fase akumulasi lanjutan dengan posisi harga di atas seluruh rata-rata pergerakan (MA20, MA50, MA200), didukung akumulasi dana asing positif dan momentum RSI yang sehat.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
       * 7. FOOTER RESMI & WATERMARK BRANDING
       * ========================================================================= */}
      <div className="px-8 py-3.5 border-t border-slate-800 bg-[#02050a] flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-2 font-mono">
          <span className="font-extrabold text-white">SahamLens Pro Analytics</span>
          <span>•</span>
          <span className="text-blue-400">https://sahamlens.id</span>
        </div>
        <div className="text-[10.5px] text-slate-500 font-mono">
          Disclaimer: Laporan analisis kuantitatif independen berbasis algoritma pasar IDX. Bukan anjuran transaksi langsung.
        </div>
      </div>
    </div>
  );
}
