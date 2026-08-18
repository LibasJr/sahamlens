'use client';

import React from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  LineChart,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react';
import type { Card3DTheme } from './card-3d-themes';

interface TechnicalAnalyzerLike {
  key?: string;
  name?: string;
  label?: string;
  value?: unknown;
  decision?: string | null;
  signal?: string | null;
  description?: string | null;
  confidence?: number | null;
}

export interface TechnicalMorningStreamCardProps {
  symbol: string;
  stockName?: string | null;
  currentPrice?: number | null;
  changePct?: number | null;
  volume?: number | null;
  analyzers?: TechnicalAnalyzerLike[];
  theme: Card3DTheme;
  exportedAt?: Date;
}

function isUsefulValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'number') return Number.isFinite(value);
  const text = String(value).trim();
  if (!text) return false;
  const upper = text.toUpperCase();
  return !['N/A', 'NA', 'NULL', 'UNAVAILABLE', 'DATA N/A', '-'].includes(upper) && !upper.startsWith('N/A');
}

function normalizeDecision(raw?: string | null): 'BULLISH' | 'BEARISH' | 'NEUTRAL' {
  const value = String(raw || '').toUpperCase();
  if (['BULLISH', 'BUY', 'STRONG_BUY', 'POSITIVE', 'UP'].includes(value)) return 'BULLISH';
  if (['BEARISH', 'SELL', 'STRONG_SELL', 'NEGATIVE', 'DOWN'].includes(value)) return 'BEARISH';
  return 'NEUTRAL';
}

function formatVolume(value?: number | null): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

export default function TechnicalMorningStreamCard({
  symbol,
  stockName,
  currentPrice,
  changePct,
  volume,
  analyzers = [],
  theme,
  exportedAt = new Date(),
}: TechnicalMorningStreamCardProps) {
  const cleanSymbol = symbol.replace('.JK', '').toUpperCase();
  const validAnalyzers = analyzers
    .filter((item) => isUsefulValue(item.value))
    .slice(0, 8);

  const counts = validAnalyzers.reduce(
    (acc, item) => {
      const direction = normalizeDecision(item.decision ?? item.signal);
      acc[direction] += 1;
      return acc;
    },
    { BULLISH: 0, BEARISH: 0, NEUTRAL: 0 }
  );

  const headline =
    validAnalyzers.length === 0
      ? 'Ringkasan teknikal belum memiliki indikator terkonfirmasi'
      : counts.BULLISH >= counts.BEARISH + 2
        ? 'Momentum teknikal dominan positif'
        : counts.BEARISH >= counts.BULLISH + 2
          ? 'Tekanan teknikal dominan negatif'
          : 'Sinyal teknikal cenderung campuran';

  const headlineTone =
    counts.BULLISH >= counts.BEARISH + 2
      ? 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10'
      : counts.BEARISH >= counts.BULLISH + 2
        ? 'text-rose-300 border-rose-500/40 bg-rose-500/10'
        : 'text-amber-300 border-amber-500/40 bg-amber-500/10';

  const changePositive = typeof changePct === 'number' && changePct >= 0;
  const timeLabel = exportedAt.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  });

  return (
    <div
      className="lens-export-dark relative flex h-[1350px] w-[1080px] flex-col overflow-hidden border-[12px] text-white shadow-[0_30px_90px_rgba(0,0,0,.95)]"
      style={{ backgroundColor: theme.bgBase, borderColor: theme.outerBorder }}
    >
      <div className={`pointer-events-none absolute -top-40 left-1/2 h-[420px] w-[900px] -translate-x-1/2 bg-gradient-to-b ${theme.orbTop} to-transparent blur-[110px]`} />
      <div className={`pointer-events-none absolute bottom-0 right-0 h-[420px] w-[420px] ${theme.orbBottom} blur-[100px]`} />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage: `radial-gradient(${theme.gridDotColor} 1px, transparent 1px)`,
          backgroundSize: '24px 24px',
        }}
      />

      <div className="relative z-10 flex h-full flex-col p-12">
        <div className="flex items-center justify-between border-b border-white/10 pb-7">
          <div className="flex items-center gap-4">
            <div className={`flex h-14 w-14 items-center justify-center rounded-2xl border ${theme.accentBorder} ${theme.accentBg} ${theme.accentText}`}>
              <LineChart className="h-7 w-7" />
            </div>
            <div>
              <div className="text-[13px] font-black uppercase tracking-[0.22em] text-slate-400">SahamLens Morning Stream</div>
              <div className="mt-1 text-[20px] font-black text-white">Technical Snapshot</div>
            </div>
          </div>
          <div className="text-right font-mono text-[12px] text-slate-400">
            <div>{timeLabel} WIB</div>
            <div className={`mt-1 font-bold ${theme.accentText}`}>REAL / DERIVED • NO FALLBACK</div>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-12 gap-7">
          <div className="col-span-8">
            <div className="flex items-center gap-3">
              <span className="text-[54px] font-black leading-none tracking-tight text-white">{cleanSymbol}</span>
              <span className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-wider ${theme.accentBorder} ${theme.accentBg} ${theme.accentText}`}>
                IDX
              </span>
            </div>
            <div className="mt-2 max-w-[620px] truncate text-[17px] font-semibold text-slate-300">{stockName || 'Emiten IDX'}</div>
            <div className={`mt-6 inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-[19px] font-black ${headlineTone}`}>
              {counts.BULLISH >= counts.BEARISH + 2 ? <TrendingUp className="h-5 w-5" /> : counts.BEARISH >= counts.BULLISH + 2 ? <TrendingDown className="h-5 w-5" /> : <Activity className="h-5 w-5" />}
              {headline}
              <span className="ml-1 rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-[9px] font-bold tracking-widest text-slate-400">HEURISTIC</span>
            </div>
          </div>

          <div className={`col-span-4 rounded-3xl border ${theme.cardBorder} bg-gradient-to-b ${theme.cardBg} p-6 text-right shadow-[0_16px_40px_rgba(0,0,0,.5)]`}>
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Harga Provider</div>
            <div className="mt-2 text-[44px] font-black leading-none text-white">
              {typeof currentPrice === 'number' && Number.isFinite(currentPrice) && currentPrice > 0
                ? `Rp ${currentPrice.toLocaleString('id-ID')}`
                : 'Harga tidak tersedia'}
            </div>
            {typeof changePct === 'number' && Number.isFinite(changePct) && (
              <div className={`mt-3 inline-flex items-center gap-1 text-[18px] font-black ${changePositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                {changePositive ? <ArrowUpRight className="h-5 w-5" /> : <ArrowDownRight className="h-5 w-5" />}
                {changePositive ? '+' : ''}{changePct.toFixed(2)}%
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 grid grid-cols-3 gap-4">
          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.07] p-4">
            <div className="text-[10px] font-black uppercase tracking-wider text-emerald-400">Bullish</div>
            <div className="mt-1 text-[28px] font-black text-white">{counts.BULLISH}</div>
          </div>
          <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] p-4">
            <div className="text-[10px] font-black uppercase tracking-wider text-amber-400">Netral</div>
            <div className="mt-1 text-[28px] font-black text-white">{counts.NEUTRAL}</div>
          </div>
          <div className="rounded-2xl border border-rose-500/25 bg-rose-500/[0.07] p-4">
            <div className="text-[10px] font-black uppercase tracking-wider text-rose-400">Bearish</div>
            <div className="mt-1 text-[28px] font-black text-white">{counts.BEARISH}</div>
          </div>
        </div>

        <div className={`mt-6 flex-1 rounded-[32px] border ${theme.cardBorder} bg-gradient-to-b ${theme.cardBg} p-7 shadow-[0_18px_50px_rgba(0,0,0,.55)]`}>
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div className="flex items-center gap-2">
              <BarChart3 className={`h-5 w-5 ${theme.accentText}`} />
              <span className="text-[15px] font-black uppercase tracking-[0.12em] text-white">Indikator Utama</span>
            </div>
            <span className="font-mono text-[11px] text-slate-400">{validAnalyzers.length} data terkonfirmasi</span>
          </div>

          {validAnalyzers.length > 0 ? (
            <div className="mt-5 grid grid-cols-2 gap-4">
              {validAnalyzers.map((item, index) => {
                const direction = normalizeDecision(item.decision ?? item.signal);
                const tone = direction === 'BULLISH'
                  ? 'border-emerald-500/30 text-emerald-300'
                  : direction === 'BEARISH'
                    ? 'border-rose-500/30 text-rose-300'
                    : 'border-amber-500/30 text-amber-300';
                return (
                  <div key={`${item.key || item.name || item.label || 'metric'}-${index}`} className={`rounded-2xl border bg-black/20 p-5 ${tone}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-[12px] font-black uppercase tracking-wider text-slate-300">{item.label || item.name || item.key || 'Indikator'}</div>
                        <div className="mt-2 truncate text-[23px] font-black text-white">{String(item.value)}</div>
                      </div>
                      <span className={`shrink-0 rounded-lg border px-2 py-1 text-[9px] font-black ${tone}`}>{direction}</span>
                    </div>
                    {item.description && !String(item.description).toLowerCase().includes('tidak tersedia') && (
                      <div className="mt-3 line-clamp-2 text-[11px] leading-relaxed text-slate-400">{item.description}</div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex h-full min-h-[320px] items-center justify-center text-center text-[16px] font-semibold text-slate-500">
              Tidak ada indikator teknikal valid untuk ditampilkan. Sistem tidak membuat angka pengganti.
            </div>
          )}
        </div>

        <div className="mt-6 grid grid-cols-12 gap-4">
          <div className="col-span-7 rounded-2xl border border-white/10 bg-black/20 p-5">
            <div className="flex items-center gap-2 text-[12px] font-black text-white">
              <ShieldCheck className="h-4 w-4 text-cyan-400" />
              Prinsip Data
            </div>
            <div className="mt-2 text-[11px] leading-relaxed text-slate-400">
              Hanya field yang tersedia dari payload SahamLens yang dicantumkan. Missing data tidak diisi dengan angka dummy, default, atau proyeksi tersembunyi.
            </div>
          </div>
          <div className="col-span-5 rounded-2xl border border-white/10 bg-black/20 p-5">
            <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">Volume sesi/provider</div>
            <div className="mt-2 text-[18px] font-black text-white">{formatVolume(volume) || 'Tidak dicantumkan'}</div>
            <div className="mt-1 text-[10px] text-slate-500">Tidak diproyeksikan menjadi volume full-day.</div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-5">
          <div className="flex items-center gap-2 text-[11px] font-black text-slate-300">
            <Zap className={`h-4 w-4 ${theme.accentText}`} />
            SahamLens Quantitative Analytics
          </div>
          <div className="flex items-center gap-2 text-[10px] text-slate-500">
            <Sparkles className="h-3.5 w-3.5" />
            Ringkasan data • bukan rekomendasi transaksi
          </div>
        </div>
      </div>
    </div>
  );
}
