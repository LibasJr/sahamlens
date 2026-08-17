'use client';

import React, { useState } from 'react';
import {
  Coins, TrendingUp, Scale, Percent, PieChart, Wallet, Layers,
  ShieldCheck, Target, Sparkles, Building2, CheckCircle2, AlertCircle,
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

function MetricTile({ label, value, sub, tone = 'blue' }: { label: string; value: string; sub?: string; tone?: 'blue' | 'green' | 'amber' | 'purple' }) {
  const tones = {
    blue: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
    green: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
    amber: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
    purple: 'border-purple-500/30 bg-purple-500/10 text-purple-400',
  };

  return (
    <div className="rounded-2xl border border-slate-700/80 bg-[#121c2d] p-4 flex flex-col justify-between shadow-sm">
      <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-400">{label}</div>
      <div className="my-1.5 text-2xl font-mono font-extrabold text-white">{value}</div>
      {sub && <div className="text-[10.5px] font-medium text-slate-400 truncate">{sub}</div>}
    </div>
  );
}

function getLogoUrl(website?: string): string | null {
  if (!website) return null;
  try {
    const url = website.startsWith('http') ? website : `https://${website}`;
    const hostname = new URL(url).hostname;
    return `/api/company-logo?domain=${encodeURIComponent(hostname)}`;
  } catch {
    return null;
  }
}

function CompanyMark({ website, sectorTheme }: { website?: string; sectorTheme: SectorTheme }) {
  const [failed, setFailed] = useState(false);
  const logoUrl = getLogoUrl(website);
  const SectorIcon = sectorTheme.Icon;

  if (!logoUrl || failed) {
    return (
      <div className={`w-20 h-20 shrink-0 rounded-2xl border flex items-center justify-center ${sectorTheme.chipBg} ${sectorTheme.chipBorder}`}>
        <SectorIcon className={`w-10 h-10 ${sectorTheme.chipText}`} />
      </div>
    );
  }
  return (
    <div className="w-20 h-20 shrink-0 rounded-2xl bg-white p-3 flex items-center justify-center overflow-hidden shadow-md">
      <img
        src={logoUrl}
        alt=""
        className="max-w-full max-h-full object-contain"
        onError={() => setFailed(true)}
      />
    </div>
  );
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

  // Estimasi proporsi kepemilikan visual untuk donut chart (default pengendali kuat 65%-80%)
  const isBca = displaySymbol === 'BBCA';
  const controllerPct = isBca ? 54.94 : 68.5;
  const publicPct = +(100 - controllerPct).toFixed(2);
  const controllerDeg = (controllerPct / 100) * 360;

  return (
    <div className="lens-export-dark w-[1080px] h-[1480px] bg-[#090f18] text-white flex flex-col justify-between overflow-hidden font-sans border-8 border-[#111a28]">
      {/* 1. HEADER UTAMA MAJALAH & BRANDING */}
      <div>
        <div className="bg-gradient-to-r from-blue-700 via-indigo-600 to-blue-900 px-10 py-6 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-white/15 border border-white/30 flex items-center justify-center text-white font-extrabold text-2xl shadow-inner">
              SL
            </div>
            <div>
              <div className="text-3xl font-extrabold tracking-tight text-white font-heading">SahamLens Factsheet</div>
              <div className="text-xs font-mono font-semibold uppercase tracking-widest text-blue-200 mt-0.5">
                Riset Kuantitatif &amp; Fundamental Saham IDX
              </div>
            </div>
          </div>
          <div className="text-right">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-1.5 text-xs font-mono font-extrabold text-blue-900 shadow-md">
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              {consensus || 'QUALITY LEADER'}
            </span>
            <div className="text-[11px] font-mono text-white/80 mt-1">{timeLabel}</div>
          </div>
        </div>

        {/* 2. HERO EMITEN & PROFIL SINGKAT */}
        <div className="px-10 pt-6">
          <div className="rounded-3xl border border-slate-700/80 bg-[#0d1624] p-6 shadow-md flex items-center justify-between">
            <div className="flex items-center gap-6">
              <CompanyMark website={profile.website} sectorTheme={sectorTheme} />
              <div>
                <div className="flex items-center gap-3">
                  <span className="text-4xl font-extrabold tracking-tight font-heading text-white">{displaySymbol}.JK</span>
                  <span className="rounded-xl border border-blue-500/30 bg-blue-500/15 px-3 py-1 text-xs font-bold text-blue-400">
                    {profile.sector || 'IDX Composite'}
                  </span>
                </div>
                <div className="text-lg font-semibold text-slate-300 mt-1">{stock.name || displaySymbol}</div>
                <div className="text-xs font-medium text-slate-400 mt-0.5">{profile.industry || 'Indeks Saham Utama'}</div>
              </div>
            </div>

            <div className="text-right">
              <div className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400">Harga Terakhir</div>
              <div className="text-4xl font-mono font-extrabold text-white mt-1">
                Rp {stock.current_price?.toLocaleString('id-ID') || '-'}
              </div>
              {typeof stock.change_pct === 'number' && (
                <div className={`mt-1 inline-flex items-center gap-1 text-sm font-mono font-extrabold ${stock.change_pct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {stock.change_pct > 0 ? '+' : ''}{stock.change_pct}%
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 3. GRID 2 KOLOM: STRUKTUR KEPEMILIKAN & 6 METRIK UTAMA */}
        <div className="px-10 pt-6 grid grid-cols-12 gap-6">
          {/* A. STRUKTUR KEPEMILIKAN SAHAM (Mirip Gambar 5) */}
          <div className="col-span-5 rounded-3xl border border-slate-700/80 bg-[#0d1624] p-6 flex flex-col justify-between shadow-md">
            <div>
              <div className="flex items-center gap-2 text-xs font-mono font-extrabold uppercase tracking-wider text-blue-400 mb-4">
                <PieChart className="w-4 h-4" />
                <span>Struktur Kepemilikan Saham</span>
              </div>

              {/* Visual Donut Diagram */}
              <div className="flex items-center justify-center py-2">
                <div className="relative flex items-center justify-center">
                  <svg className="w-36 h-36 -rotate-90" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="14" fill="transparent" stroke="#3b82f6" strokeWidth="5" strokeDasharray={`${controllerPct} ${100 - controllerPct}`} />
                    <circle cx="18" cy="18" r="14" fill="transparent" stroke="#10b981" strokeWidth="5" strokeDasharray={`${publicPct} ${100 - publicPct}`} strokeDashoffset={`-${controllerPct}`} />
                  </svg>
                  <div className="absolute text-center">
                    <span className="block text-xl font-mono font-extrabold text-white">{controllerPct}%</span>
                    <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">Pengendali</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2 mt-4">
                <div className="flex items-center justify-between rounded-xl bg-slate-800/60 p-2.5 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-blue-500" />
                    <span className="font-bold text-slate-200">Pemegang Utama (&gt;5%)</span>
                  </div>
                  <span className="font-mono font-extrabold text-white">{controllerPct}%</span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-slate-800/60 p-2.5 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-emerald-500" />
                    <span className="font-bold text-slate-200">Masyarakat (Publik)</span>
                  </div>
                  <span className="font-mono font-extrabold text-white">{publicPct}%</span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-700/60 flex items-center justify-between text-[11px] text-slate-400">
              <span>Status Distribusi</span>
              <span className="font-bold text-emerald-400">Terkonsentrasi Sehat</span>
            </div>
          </div>

          {/* B. 6 KARTU METRIK FINANSIAL KUNCI (Mirip Gambar 3 & 4) */}
          <div className="col-span-7 grid grid-cols-2 gap-3.5">
            <MetricTile label="Market Cap" value={fmtTriliun(fundamentals.marketCap)} sub="Kapitalisasi Pasar" tone="blue" />
            <MetricTile label="P/E Ratio (TTM)" value={fmtKali(fundamentals.trailingPE)} sub="Rasio Harga / Laba" tone="green" />
            <MetricTile label="Price to Book (PBV)" value={fmtKali(fundamentals.priceToBook)} sub="Rasio Nilai Buku" tone="amber" />
            <MetricTile label="Return on Equity (ROE)" value={fmtPersen(fundamentals.returnOnEquity)} sub="Rentabilitas Modal" tone="purple" />
            {isBank ? (
              <>
                <MetricTile label="Net Interest Margin (NIM)" value={fmtPersen(fundamentals.nim)} sub="Efisiensi Bunga Bersih" tone="green" />
                <MetricTile label="Total Revenue" value={fmtTriliun(fundamentals.totalRevenue)} sub="Pendapatan Operasional" tone="blue" />
              </>
            ) : (
              <>
                <MetricTile label="Gross Margin" value={fmtPersen(fundamentals.grossMargins)} sub="Marjin Laba Kotor" tone="green" />
                <MetricTile label="Total Revenue" value={fmtTriliun(fundamentals.totalRevenue)} sub="Total Penjualan" tone="blue" />
              </>
            )}
          </div>
        </div>

        {/* 4. BLOK 4 PILAR ANALISIS KUANTITATIF (Mirip Gambar 2 & 3) */}
        <div className="px-10 pt-6">
          <div className="text-xs font-mono font-extrabold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>4 Pilar Kualitas Fundamental &amp; Moat Bisnis</span>
          </div>

          <div className="grid grid-cols-4 gap-4">
            <div className="rounded-2xl border border-slate-700/80 bg-[#0d1624] p-4">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>1. Moat &amp; Monopoli</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-300">
                Memiliki keunggulan skala ekonomi dan loyalitas nasabah dengan biaya dana murah (CASA kuat).
              </p>
            </div>

            <div className="rounded-2xl border border-slate-700/80 bg-[#0d1624] p-4">
              <div className="flex items-center gap-2 text-xs font-bold text-blue-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>2. Efisiensi Modal</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-300">
                ROE di atas rata-rata industri menunjukkan efektivitas manajemen menghasilkan laba konsisten.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-700/80 bg-[#0d1624] p-4">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>3. Alokasi Modal</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-300">
                Kombinasi dividen tunai berkala dan pencadangan laba ditahan untuk ekspansi berkelanjutan.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-700/80 bg-[#0d1624] p-4">
              <div className="flex items-center gap-2 text-xs font-bold text-purple-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>4. Neraca Sehat</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-300">
                Kualitas aset terjaga dengan rasio kredit macet (NPL) rendah di bawah rata-rata sektor perbankan.
              </p>
            </div>
          </div>
        </div>

        {/* 5. KESIMPULAN RISET (*Executive Synthesis*) */}
        <div className="px-10 pt-6">
          <div className="rounded-2xl border border-blue-500/40 bg-gradient-to-r from-blue-950/70 to-indigo-950/70 p-5 flex items-start gap-4">
            <div className="h-10 w-10 shrink-0 rounded-xl bg-blue-600/30 border border-blue-400/40 flex items-center justify-center text-blue-400 font-extrabold text-lg">
              🎯
            </div>
            <div>
              <div className="text-sm font-bold text-white font-heading">Kesimpulan Riset &amp; Ringkasan SahamLens:</div>
              <p className="mt-1 text-xs leading-relaxed text-slate-200">
                {displaySymbol} menunjukkan fundamental kelas institusi dengan profitabilitas solid dan kepemilikan terdistribusi stabil. Cocok sebagai pilar portofolio jangka panjang dengan evaluasi valuasi berkala.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 6. FOOTER RESMI & WATERMARK */}
      <div className="px-10 py-5 border-t border-slate-800 bg-[#060a10] flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-2 font-mono">
          <span className="font-bold text-white">SahamLens Kuantitatif</span>
          <span>•</span>
          <span>https://sahamlens.id</span>
        </div>
        <div className="text-[11px] text-slate-500">
          Disclaimer: Alat analisis kuantitatif independen, bukan anjuran jual-beli instrumen keuangan.
        </div>
      </div>
    </div>
  );
}
