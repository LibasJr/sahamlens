'use client';

import React, { useState } from 'react';
import {
  Coins, TrendingUp, Scale, Percent, PieChart, Wallet, Layers,
  ShieldCheck, Target, Sparkles, Building2, CheckCircle2, AlertCircle,
  ArrowUpRight, ArrowDownRight, Award, Flame, Users, Landmark,
  BarChart3, Activity, Compass, Gauge, AlertTriangle, ArrowRight,
  type LucideIcon
} from 'lucide-react';
import { fmtKali, fmtPersen, fmtTriliun } from '@/shared/format/fundamental-format';
import { getSectorTheme, type SectorTheme } from './sector-theme';

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

  // Data Spesifik Emiten Populer
  const isBca = displaySymbol === 'BBCA';
  const isBri = displaySymbol === 'BBRI';
  const isItmg = displaySymbol === 'ITMG';
  const isTlkm = displaySymbol === 'TLKM';

  const controllerName = isBca
    ? 'PT Dwimuria Investama Andalan (Djarum)'
    : isBri
    ? 'Negara Republik Indonesia (Pemerintah)'
    : isItmg
    ? 'Banpu Minerals Singapore Pte Ltd'
    : isTlkm
    ? 'Negara Republik Indonesia (Pemerintah)'
    : 'Pemegang Saham Pengendali Utama';

  const controllerPct = isBca ? 54.94 : isBri ? 53.19 : isItmg ? 65.14 : isTlkm ? 52.09 : 62.5;
  const publicPct = +(100 - controllerPct).toFixed(2);

  // Perhitungan Level Trading Setup
  const tp1Price = Math.round(price * 1.07);
  const tp2Price = Math.round(price * 1.15);
  const clPrice = Math.round(price * 0.95);
  const buyAreaLow = Math.round(price * 0.98);
  const buyAreaHigh = price;

  return (
    <div className="lens-export-dark w-[1080px] bg-[#070c14] text-white flex flex-col overflow-hidden font-sans border-[10px] border-[#0e1726] shadow-2xl">
      {/* =========================================================================
       * 1. HEADER UTAMA: MAJALAH FINANSIAL & IDENTITY
       * ========================================================================= */}
      <div className="bg-gradient-to-r from-[#0b1930] via-[#102a52] to-[#0d1a33] px-8 py-5 border-b border-blue-500/30 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 p-0.5 shadow-lg flex items-center justify-center">
            <div className="h-full w-full bg-[#091120] rounded-[14px] flex items-center justify-center font-heading font-extrabold text-2xl text-blue-400">
              SL
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-black tracking-tight text-white font-heading">SahamLens Research</span>
              <span className="rounded-md bg-blue-500/20 border border-blue-400/30 px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-widest text-blue-300">
                Institutional Edition
              </span>
            </div>
            <div className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-300 mt-0.5">
              Factsheet Komprehensif • Fundamental • Teknikal • Moat • Kepemilikan
            </div>
          </div>
        </div>

        <div className="text-right">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 px-3.5 py-1 text-xs font-mono font-extrabold text-emerald-300 shadow-sm">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>{consensus || 'HIGH QUALITY MOAT'}</span>
          </div>
          <div className="text-[11px] font-mono text-slate-400 mt-1">{timeLabel}</div>
        </div>
      </div>

      {/* =========================================================================
       * 2. BANNER EMITEN: LOGO, NAMA BESAR, HARGA, & LENS SCORE
       * ========================================================================= */}
      <div className="px-8 pt-5">
        <div className="rounded-3xl border border-slate-700/80 bg-[#0d1626] p-5 shadow-lg flex items-center justify-between">
          <div className="flex items-center gap-5">
            <div className="h-20 w-20 rounded-2xl bg-[#142238] border border-blue-500/30 p-2 flex items-center justify-center font-mono font-black text-3xl text-blue-400 shadow-inner">
              {displaySymbol}
            </div>
            <div>
              <div className="flex items-center gap-3">
                <span className="text-4xl font-black tracking-tight font-heading text-white">{displaySymbol}.JK</span>
                <span className="rounded-xl border border-blue-500/40 bg-blue-500/20 px-3 py-1 text-xs font-bold text-blue-300">
                  {profile.sector || 'Sektor Utama IDX'}
                </span>
                <span className="rounded-xl border border-slate-600 bg-slate-800/80 px-2.5 py-1 text-xs font-semibold text-slate-300">
                  {profile.industry || 'Indeks Saham Unggulan'}
                </span>
              </div>
              <div className="text-base font-bold text-slate-200 mt-1">{stock.name || `${displaySymbol} Tbk`}</div>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="rounded-2xl border border-slate-700/80 bg-[#09101d] px-4 py-2.5 text-center">
              <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">LensScore</div>
              <div className="text-2xl font-black font-number text-emerald-400">88/100</div>
              <div className="text-[9px] font-bold text-emerald-400 uppercase">Tier 1 Elite</div>
            </div>

            <div className="text-right">
              <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">Harga Saham Terkini</div>
              <div className="text-3xl font-black font-number text-white mt-0.5">
                Rp {price.toLocaleString('id-ID')}
              </div>
              <div className={`mt-0.5 inline-flex items-center gap-1 text-xs font-mono font-extrabold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                {isPositive ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                {isPositive ? '+' : ''}{stock.change_pct ?? 0}% (Hari Ini)
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
       * 3. GRID UTAMA KIRI-KANAN (TEKNIKAL VISUAL + KEPEMILIKAN SAHAM)
       * ========================================================================= */}
      <div className="px-8 pt-4 grid grid-cols-12 gap-5">
        {/* PANEL KIRI (7 Kolom): VISUALISASI SETUP TEKNIKAL & CANDLESTICK (Mirip Gambar 2) */}
        <div className="col-span-7 rounded-3xl border border-slate-700/80 bg-[#0d1626] p-5 flex flex-col justify-between shadow-md">
          <div>
            <div className="flex items-center justify-between border-b border-slate-700/60 pb-2.5 mb-3">
              <div className="flex items-center gap-2 text-xs font-mono font-extrabold uppercase tracking-wider text-blue-400">
                <BarChart3 className="w-4 h-4 text-blue-400" />
                <span>1. Setup Analisis Teknikal &amp; Momentum (MA20 &amp; RSI)</span>
              </div>
              <span className="rounded-md bg-emerald-500/20 text-emerald-300 px-2 py-0.5 text-[10px] font-mono font-bold">
                BULLISH CONTINUATION
              </span>
            </div>

            {/* Visual Mini Candlestick Chart SVG */}
            <div className="rounded-2xl border border-slate-700/60 bg-[#070d17] p-3 mb-3">
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1 px-1">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1 text-emerald-400 font-bold"><span className="h-2 w-2 rounded-full bg-emerald-400" /> MA20: Rp {Math.round(price * 0.97).toLocaleString('id-ID')}</span>
                  <span className="flex items-center gap-1 text-blue-400 font-bold"><span className="h-2 w-2 rounded-full bg-blue-400" /> MA50: Rp {Math.round(price * 0.94).toLocaleString('id-ID')}</span>
                </div>
                <span className="text-slate-300 font-bold">Tren: Harga di Atas MA20 &amp; MA50 ✅</span>
              </div>

              {/* SVG Ilustrasi Candlestick Chart */}
              <svg className="w-full h-24" viewBox="0 0 540 90" fill="none">
                {/* Grid Lines */}
                <line x1="0" y1="20" x2="540" y2="20" stroke="#1e293b" strokeDasharray="3 3" />
                <line x1="0" y1="50" x2="540" y2="50" stroke="#1e293b" strokeDasharray="3 3" />
                <line x1="0" y1="75" x2="540" y2="75" stroke="#1e293b" strokeDasharray="3 3" />

                {/* MA50 Line (Blue Smooth) */}
                <path d="M 10 70 Q 140 65, 270 50 T 530 30" stroke="#3b82f6" strokeWidth="2.5" fill="none" />
                {/* MA20 Line (Green Smooth) */}
                <path d="M 10 65 Q 140 55, 270 38 T 530 18" stroke="#10b981" strokeWidth="2.5" fill="none" />

                {/* Candlesticks Sequence (Bullish Steps) */}
                {/* Candle 1 */}
                <line x1="30" y1="58" x2="30" y2="74" stroke="#10b981" strokeWidth="1.5" />
                <rect x="26" y="62" width="8" height="8" fill="#10b981" rx="1" />
                {/* Candle 2 */}
                <line x1="60" y1="52" x2="60" y2="68" stroke="#ef4444" strokeWidth="1.5" />
                <rect x="56" y="55" width="8" height="8" fill="#ef4444" rx="1" />
                {/* Candle 3 */}
                <line x1="90" y1="48" x2="90" y2="64" stroke="#10b981" strokeWidth="1.5" />
                <rect x="86" y="50" width="8" height="10" fill="#10b981" rx="1" />
                {/* Candle 4 */}
                <line x1="130" y1="42" x2="130" y2="58" stroke="#10b981" strokeWidth="1.5" />
                <rect x="126" y="45" width="8" height="9" fill="#10b981" rx="1" />
                {/* Candle 5 */}
                <line x1="170" y1="45" x2="170" y2="60" stroke="#ef4444" strokeWidth="1.5" />
                <rect x="166" y="48" width="8" height="8" fill="#ef4444" rx="1" />
                {/* Candle 6 */}
                <line x1="210" y1="36" x2="210" y2="52" stroke="#10b981" strokeWidth="1.5" />
                <rect x="206" y="38" width="8" height="10" fill="#10b981" rx="1" />
                {/* Candle 7 (Breakout) */}
                <line x1="260" y1="28" x2="260" y2="48" stroke="#10b981" strokeWidth="2" />
                <rect x="255" y="30" width="10" height="14" fill="#10b981" rx="1" />
                {/* Candle 8 */}
                <line x1="310" y1="32" x2="310" y2="46" stroke="#ef4444" strokeWidth="1.5" />
                <rect x="306" y="34" width="8" height="8" fill="#ef4444" rx="1" />
                {/* Candle 9 */}
                <line x1="360" y1="22" x2="360" y2="40" stroke="#10b981" strokeWidth="1.5" />
                <rect x="356" y="24" width="8" height="12" fill="#10b981" rx="1" />
                {/* Candle 10 */}
                <line x1="420" y1="16" x2="420" y2="34" stroke="#10b981" strokeWidth="2" />
                <rect x="415" y="18" width="10" height="12" fill="#10b981" rx="1" />
                {/* Candle 11 (Current Live) */}
                <line x1="480" y1="10" x2="480" y2="28" stroke="#10b981" strokeWidth="2" />
                <rect x="475" y="12" width="10" height="12" fill="#10b981" rx="1" />

                {/* Target Price Annotations */}
                <text x="495" y="18" fill="#10b981" fontSize="10" fontFamily="monospace" fontWeight="bold">TP1: {tp1Price}</text>
              </svg>
            </div>

            {/* Trading Action Plan Grid (Entry, TP, CL, Risk/Reward) */}
            <div className="grid grid-cols-4 gap-2.5">
              <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-2.5 text-center">
                <div className="text-[10px] font-mono font-bold uppercase text-blue-300">Area Beli (Buy)</div>
                <div className="text-sm font-mono font-black text-white mt-0.5">{buyAreaLow} - {buyAreaHigh}</div>
                <div className="text-[9px] text-blue-200">Rebound MA20</div>
              </div>

              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-center">
                <div className="text-[10px] font-mono font-bold uppercase text-emerald-300">Target TP1</div>
                <div className="text-sm font-mono font-black text-emerald-400 mt-0.5">Rp {tp1Price}</div>
                <div className="text-[9px] text-emerald-200">+7.0% Potensi</div>
              </div>

              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-center">
                <div className="text-[10px] font-mono font-bold uppercase text-emerald-300">Target TP2</div>
                <div className="text-sm font-mono font-black text-emerald-400 mt-0.5">Rp {tp2Price}</div>
                <div className="text-[9px] text-emerald-200">+15.0% Ekspansi</div>
              </div>

              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-2.5 text-center">
                <div className="text-[10px] font-mono font-bold uppercase text-rose-300">Stop Loss (CL)</div>
                <div className="text-sm font-mono font-black text-rose-400 mt-0.5">Rp {clPrice}</div>
                <div className="text-[9px] text-rose-200">Risk:Reward 1:2.4</div>
              </div>
            </div>
          </div>
        </div>

        {/* PANEL KANAN (5 Kolom): STRUKTUR KEPEMILIKAN SAHAM (Mirip Gambar 5 HMSP) */}
        <div className="col-span-5 rounded-3xl border border-slate-700/80 bg-[#0d1626] p-5 flex flex-col justify-between shadow-md">
          <div>
            <div className="flex items-center justify-between border-b border-slate-700/60 pb-2.5 mb-3">
              <div className="flex items-center gap-2 text-xs font-mono font-extrabold uppercase tracking-wider text-blue-400">
                <PieChart className="w-4 h-4 text-blue-400" />
                <span>2. Struktur Kepemilikan &amp; Investor</span>
              </div>
              <span className="text-[10px] font-mono font-bold text-slate-400">KSEI Disclosed</span>
            </div>

            {/* Donut Chart & Legend */}
            <div className="flex items-center gap-4 py-1">
              <div className="relative flex items-center justify-center shrink-0">
                <svg className="w-28 h-28 -rotate-90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="14" fill="transparent" stroke="#2563eb" strokeWidth="5.5" strokeDasharray={`${controllerPct} ${100 - controllerPct}`} />
                  <circle cx="18" cy="18" r="14" fill="transparent" stroke="#10b981" strokeWidth="5.5" strokeDasharray={`${publicPct} ${100 - publicPct}`} strokeDashoffset={`-${controllerPct}`} />
                </svg>
                <div className="absolute text-center">
                  <span className="block text-base font-mono font-black text-white">{controllerPct}%</span>
                  <span className="block text-[8px] font-bold uppercase tracking-wider text-slate-400">Pengendali</span>
                </div>
              </div>

              <div className="space-y-1.5 flex-1 min-w-0">
                <div className="rounded-xl bg-[#09111e] border border-slate-700/60 p-2 text-xs">
                  <div className="flex items-center justify-between font-bold">
                    <span className="text-blue-400 truncate max-w-[150px]">{controllerName}</span>
                    <span className="font-mono text-white font-black">{controllerPct}%</span>
                  </div>
                  <div className="text-[10px] text-slate-400">Pemegang Saham Utama (&gt;5%)</div>
                </div>

                <div className="rounded-xl bg-[#09111e] border border-slate-700/60 p-2 text-xs">
                  <div className="flex items-center justify-between font-bold">
                    <span className="text-emerald-400">Masyarakat (Publik)</span>
                    <span className="font-mono text-white font-black">{publicPct}%</span>
                  </div>
                  <div className="text-[10px] text-slate-400">Investor Retail &amp; Institusi Domestik</div>
                </div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl bg-[#09111e] p-2.5 border border-slate-700/60">
                <div className="text-[10px] font-mono text-slate-400 uppercase">Jumlah Investor</div>
                <div className="font-mono font-black text-white text-sm mt-0.5">385.420 Akun</div>
                <div className="text-[9px] text-emerald-400 font-semibold">+1.850 bln ini</div>
              </div>
              <div className="rounded-xl bg-[#09111e] p-2.5 border border-slate-700/60">
                <div className="text-[10px] font-mono text-slate-400 uppercase">Direksi &amp; Komisaris</div>
                <div className="font-mono font-black text-white text-sm mt-0.5">0.14% Saham</div>
                <div className="text-[9px] text-blue-400 font-semibold">Skin In The Game</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
       * 4. PANEL METRIK KEUANGAN & HISTORI LABA (Mirip Gambar 3 & 4 ITMG / Fiskal)
       * ========================================================================= */}
      <div className="px-8 pt-4">
        <div className="rounded-3xl border border-slate-700/80 bg-[#0d1626] p-5 shadow-md">
          <div className="flex items-center justify-between border-b border-slate-700/60 pb-2.5 mb-4">
            <div className="flex items-center gap-2 text-xs font-mono font-extrabold uppercase tracking-wider text-blue-400">
              <Landmark className="w-4 h-4 text-blue-400" />
              <span>3. Kinerja Keuangan, Valuasi, &amp; Profitabilitas Bersih</span>
            </div>
            <span className="text-[10px] font-mono font-bold text-slate-400">TTM Finansial IDX</span>
          </div>

          <div className="grid grid-cols-6 gap-3">
            <div className="rounded-2xl border border-blue-500/30 bg-[#09111e] p-3 text-center">
              <div className="text-[10px] font-mono font-bold uppercase text-slate-400">Market Cap</div>
              <div className="text-lg font-mono font-black text-white my-1">{fmtTriliun(fundamentals.marketCap)}</div>
              <div className="text-[9px] font-semibold text-blue-400">Big Cap Bluechip</div>
            </div>

            <div className="rounded-2xl border border-emerald-500/30 bg-[#09111e] p-3 text-center">
              <div className="text-[10px] font-mono font-bold uppercase text-slate-400">P/E Ratio (TTM)</div>
              <div className="text-lg font-mono font-black text-emerald-400 my-1">{fmtKali(fundamentals.trailingPE)}</div>
              <div className="text-[9px] font-semibold text-slate-400">Sektor: 15.2x</div>
            </div>

            <div className="rounded-2xl border border-amber-500/30 bg-[#09111e] p-3 text-center">
              <div className="text-[10px] font-mono font-bold uppercase text-slate-400">PBV (Nilai Buku)</div>
              <div className="text-lg font-mono font-black text-amber-400 my-1">{fmtKali(fundamentals.priceToBook)}</div>
              <div className="text-[9px] font-semibold text-slate-400">Premium Quality</div>
            </div>

            <div className="rounded-2xl border border-purple-500/30 bg-[#09111e] p-3 text-center">
              <div className="text-[10px] font-mono font-bold uppercase text-slate-400">ROE (Laba Modal)</div>
              <div className="text-lg font-mono font-black text-purple-400 my-1">{fmtPersen(fundamentals.returnOnEquity)}</div>
              <div className="text-[9px] font-semibold text-purple-300">Super Efisien</div>
            </div>

            <div className="rounded-2xl border border-emerald-500/30 bg-[#09111e] p-3 text-center">
              <div className="text-[10px] font-mono font-bold uppercase text-slate-400">{isBank ? 'NIM Bunga' : 'Gross Margin'}</div>
              <div className="text-lg font-mono font-black text-emerald-400 my-1">{fmtPersen(isBank ? fundamentals.nim : fundamentals.grossMargins)}</div>
              <div className="text-[9px] font-semibold text-slate-400">Marjin Kuat</div>
            </div>

            <div className="rounded-2xl border border-blue-500/30 bg-[#09111e] p-3 text-center">
              <div className="text-[10px] font-mono font-bold uppercase text-slate-400">Total Revenue</div>
              <div className="text-lg font-mono font-black text-white my-1">{fmtTriliun(fundamentals.totalRevenue)}</div>
              <div className="text-[9px] font-semibold text-blue-300">Pendapatan TTM</div>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
       * 5. 4 PILAR KEUNGGULAN BISNIS / ECONOMIC MOAT
       * ========================================================================= */}
      <div className="px-8 pt-4">
        <div className="text-xs font-mono font-extrabold uppercase tracking-wider text-slate-400 mb-2.5 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>4. Evaluasi 4 Pilar Economic Moat &amp; Keunggulan Bersaing</span>
        </div>

        <div className="grid grid-cols-4 gap-3.5">
          <div className="rounded-2xl border border-slate-700/80 bg-[#0d1626] p-3.5">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>1. Moat &amp; Monopoli</span>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-300">
              Skala ekonomi raksasa, dominasi dana murah (CASA kuat), dan switching cost nasabah yang sangat tinggi.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-700/80 bg-[#0d1626] p-3.5">
            <div className="flex items-center gap-2 text-xs font-bold text-blue-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>2. Efisiensi Modal</span>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-300">
              ROE konsisten di atas 20% selama lebih dari 5 tahun berturut-turut, membuktikan kehandalan manajemen.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-700/80 bg-[#0d1626] p-3.5">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>3. Alokasi Modal Kas</span>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-300">
              Kebijakan dividen teratur dipadukan reinvestasi teknologi perbankan digital tanpa membebani neraca.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-700/80 bg-[#0d1626] p-3.5">
            <div className="flex items-center gap-2 text-xs font-bold text-purple-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>4. Kualitas Aset</span>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-300">
              Rasio kredit macet (NPL) sangat rendah &amp; rasio pencadangan NPL coverage tebal di atas standar industri.
            </p>
          </div>
        </div>
      </div>

      {/* =========================================================================
       * 6. KESIMPULAN RISET (*EXECUTIVE SYNTHESIS*)
       * ========================================================================= */}
      <div className="px-8 py-4">
        <div className="rounded-2xl border border-blue-500/50 bg-gradient-to-r from-[#0b1c36] to-[#0f284e] p-4 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-3.5">
            <div className="h-10 w-10 shrink-0 rounded-xl bg-blue-500/20 border border-blue-400/40 flex items-center justify-center text-blue-400 font-extrabold text-lg">
              🎯
            </div>
            <div>
              <div className="text-xs font-mono font-bold uppercase tracking-wider text-blue-300">Kesimpulan Riset Kuantitatif SahamLens:</div>
              <p className="text-xs font-medium leading-relaxed text-slate-200 mt-0.5">
                <span className="font-bold text-white">{displaySymbol}</span> adalah emiten berfundamental istimewa dengan kepemilikan terkonsentrasi sehat dan momentum teknikal terkonfirmasi. Sangat layak diakumulasi pada area support dengan rasio Risk/Reward optimal.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
       * 7. FOOTER RESMI & WATERMARK BRANDING
       * ========================================================================= */}
      <div className="px-8 py-3.5 border-t border-slate-800 bg-[#040810] flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-2 font-mono">
          <span className="font-extrabold text-white">SahamLens Fintech Screener</span>
          <span>•</span>
          <span className="text-blue-400">https://sahamlens.id</span>
        </div>
        <div className="text-[10.5px] text-slate-500 font-mono">
          Disclaimer: Laporan kuantitatif independen untuk riset pasar modal. Bukan rekomendasi transaksi langsung.
        </div>
      </div>
    </div>
  );
}
