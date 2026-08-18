'use client';

import React from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Award,
  BarChart3,
  Calendar,
  Landmark,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import type { Card3DTheme } from './card-3d-themes';

interface FundamentalMorningStreamCardProps {
  ticker: string;
  stock: {
    name?: string | null;
    current_price?: number | null;
    change_pct?: number | null;
  };
  fundamentals?: Record<string, number | null | undefined>;
  profile?: {
    sector?: string | null;
    industry?: string | null;
  };
  moat?: {
    status?: string | null;
    coveragePct?: number | null;
    supportive?: number | null;
    available?: number | null;
  } | null;
  upcomingEarnings?: {
    date?: string | null;
    fiscalQuarter?: string | null;
    isEstimate?: boolean;
  } | null;
  theme: Card3DTheme;
  exportedAt?: Date;
}

type MetricKind = 'percent' | 'multiple' | 'compact';

const METRICS: Array<{ key: string; code: string; label: string; kind: MetricKind; group: string }> = [
  { key: 'returnOnEquity', code: 'ROE', label: 'Return on Equity', kind: 'percent', group: 'Profitability' },
  { key: 'returnOnAssets', code: 'ROA', label: 'Return on Assets', kind: 'percent', group: 'Profitability' },
  { key: 'profitMargins', code: 'NPM', label: 'Net Profit Margin', kind: 'percent', group: 'Profitability' },
  { key: 'operatingMargins', code: 'OPM', label: 'Operating Margin', kind: 'percent', group: 'Profitability' },
  { key: 'grossMargins', code: 'GPM', label: 'Gross Margin', kind: 'percent', group: 'Profitability' },
  { key: 'trailingPE', code: 'PER', label: 'Price / Earnings', kind: 'multiple', group: 'Valuation' },
  { key: 'forwardPE', code: 'F.PE', label: 'Forward P/E', kind: 'multiple', group: 'Valuation' },
  { key: 'priceToBook', code: 'PBV', label: 'Price / Book', kind: 'multiple', group: 'Valuation' },
  { key: 'revenueGrowth', code: 'REV.G', label: 'Revenue Growth', kind: 'percent', group: 'Growth' },
  { key: 'earningsGrowth', code: 'EPS.G', label: 'Earnings Growth', kind: 'percent', group: 'Growth' },
  { key: 'debtToEquity', code: 'DER', label: 'Debt / Equity', kind: 'multiple', group: 'Balance Sheet' },
  { key: 'currentRatio', code: 'CR', label: 'Current Ratio', kind: 'multiple', group: 'Balance Sheet' },
  { key: 'quickRatio', code: 'QR', label: 'Quick Ratio', kind: 'multiple', group: 'Balance Sheet' },
  { key: 'dividendYield', code: 'DY', label: 'Dividend Yield', kind: 'percent', group: 'Dividend' },
  { key: 'marketCap', code: 'MCAP', label: 'Market Cap', kind: 'compact', group: 'Size' },
  { key: 'totalRevenue', code: 'REV', label: 'Total Revenue', kind: 'compact', group: 'Scale' },
  { key: 'ebitda', code: 'EBITDA', label: 'EBITDA', kind: 'compact', group: 'Scale' },
];

function validNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function fmt(value: number, kind: MetricKind): string {
  if (kind === 'percent') return `${(Math.abs(value) <= 2 ? value * 100 : value).toLocaleString('id-ID', { maximumFractionDigits: 2 })}%`;
  if (kind === 'multiple') return `${value.toLocaleString('id-ID', { maximumFractionDigits: 2 })}x`;
  return new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 2 }).format(value);
}

function formatDate(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(date);
}

export default function FundamentalMorningStreamCard({
  ticker,
  stock,
  fundamentals = {},
  profile = {},
  moat,
  upcomingEarnings,
  theme,
  exportedAt = new Date(),
}: FundamentalMorningStreamCardProps) {
  const cleanTicker = ticker.replace('.JK', '').toUpperCase();
  const metricRows = METRICS
    .map((meta) => ({ ...meta, value: fundamentals[meta.key] }))
    .filter((row): row is typeof row & { value: number } => validNumber(row.value))
    .slice(0, 8);

  const groups = Array.from(new Set(metricRows.map((row) => row.group))).slice(0, 3);
  const headline = groups.length > 0
    ? `${groups.join(' • ')} dalam satu snapshot`
    : 'Ringkasan fundamental belum memiliki rasio terkonfirmasi';

  const changePositive = typeof stock.change_pct === 'number' && stock.change_pct >= 0;
  const earningsDate = formatDate(upcomingEarnings?.date);
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
      <div className={`pointer-events-none absolute bottom-0 left-0 h-[420px] w-[420px] ${theme.orbMid} blur-[100px]`} />
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
              <Landmark className="h-7 w-7" />
            </div>
            <div>
              <div className="text-[13px] font-black uppercase tracking-[0.22em] text-slate-400">SahamLens Morning Stream</div>
              <div className="mt-1 text-[20px] font-black text-white">Fundamental Snapshot</div>
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
              <span className="text-[54px] font-black leading-none tracking-tight text-white">{cleanTicker}</span>
              {profile.sector && (
                <span className={`max-w-[260px] truncate rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wider ${theme.accentBorder} ${theme.accentBg} ${theme.accentText}`}>
                  {profile.sector}
                </span>
              )}
            </div>
            <div className="mt-2 max-w-[640px] truncate text-[17px] font-semibold text-slate-300">{stock.name || 'Emiten IDX'}</div>
            <div className={`mt-6 inline-flex items-center gap-2 rounded-2xl border ${theme.accentBorder} ${theme.accentBg} px-4 py-3 text-[19px] font-black ${theme.accentText}`}>
              <BarChart3 className="h-5 w-5" />
              {headline}
            </div>
          </div>

          <div className={`col-span-4 rounded-3xl border ${theme.cardBorder} bg-gradient-to-b ${theme.cardBg} p-6 text-right shadow-[0_16px_40px_rgba(0,0,0,.5)]`}>
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Harga Provider</div>
            <div className="mt-2 text-[44px] font-black leading-none text-white">
              {validNumber(stock.current_price) && stock.current_price > 0
                ? `Rp ${stock.current_price.toLocaleString('id-ID')}`
                : 'Harga tidak tersedia'}
            </div>
            {validNumber(stock.change_pct) && (
              <div className={`mt-3 inline-flex items-center gap-1 text-[18px] font-black ${changePositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                {changePositive ? <ArrowUpRight className="h-5 w-5" /> : <ArrowDownRight className="h-5 w-5" />}
                {changePositive ? '+' : ''}{stock.change_pct.toFixed(2)}%
              </div>
            )}
          </div>
        </div>

        <div className={`mt-8 flex-1 rounded-[32px] border ${theme.cardBorder} bg-gradient-to-b ${theme.cardBg} p-7 shadow-[0_18px_50px_rgba(0,0,0,.55)]`}>
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div className="flex items-center gap-2">
              <Award className={`h-5 w-5 ${theme.accentText}`} />
              <span className="text-[15px] font-black uppercase tracking-[0.12em] text-white">Rasio Fundamental Terpilih</span>
            </div>
            <span className="font-mono text-[11px] text-slate-400">{metricRows.length} field valid</span>
          </div>

          {metricRows.length > 0 ? (
            <div className="mt-5 grid grid-cols-2 gap-4">
              {metricRows.map((row) => (
                <div key={row.key} className="rounded-2xl border border-white/10 bg-black/20 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-black uppercase tracking-wider text-slate-400">{row.code}</div>
                      <div className="mt-1 text-[13px] font-semibold text-slate-300">{row.label}</div>
                    </div>
                    <span className={`rounded-lg border px-2 py-1 text-[9px] font-black ${theme.accentBorder} ${theme.accentText}`}>{row.group}</span>
                  </div>
                  <div className="mt-4 text-[30px] font-black tracking-tight text-white">{fmt(row.value, row.kind)}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-full min-h-[420px] items-center justify-center text-center text-[16px] font-semibold text-slate-500">
              Tidak ada rasio fundamental valid untuk ditampilkan. Sistem tidak membuat angka pengganti.
            </div>
          )}
        </div>

        <div className="mt-6 grid grid-cols-12 gap-4">
          {moat?.status && (
            <div className="col-span-4 rounded-2xl border border-white/10 bg-black/20 p-5">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-500">Moat Proxy <span className="rounded border border-amber-500/30 px-1.5 py-0.5 text-amber-300">PROXY</span></div>
              <div className="mt-2 text-[20px] font-black text-white">{moat.status}</div>
              {validNumber(moat.coveragePct) && <div className="mt-1 text-[11px] text-slate-400">Coverage {moat.coveragePct.toFixed(0)}%</div>}
            </div>
          )}

          {earningsDate && (
            <div className="col-span-4 rounded-2xl border border-white/10 bg-black/20 p-5">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-500"><Calendar className="h-3.5 w-3.5" /> Earnings</div>
              <div className="mt-2 text-[18px] font-black text-white">{earningsDate}</div>
              {upcomingEarnings?.fiscalQuarter && <div className="mt-1 text-[11px] text-slate-400">{upcomingEarnings.fiscalQuarter}</div>}
            </div>
          )}

          <div className={`${moat?.status && earningsDate ? 'col-span-4' : moat?.status || earningsDate ? 'col-span-8' : 'col-span-12'} rounded-2xl border border-white/10 bg-black/20 p-5`}>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-500"><ShieldCheck className="h-3.5 w-3.5 text-cyan-400" /> Data Integrity</div>
            <div className="mt-2 text-[11px] leading-relaxed text-slate-400">
              Missing data disembunyikan, bukan diisi angka contoh. Proxy/model hanya ditampilkan jika tersedia dan diberi label sesuai klasifikasi.
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-5">
          <div className="flex items-center gap-2 text-[11px] font-black text-slate-300">
            <Zap className={`h-4 w-4 ${theme.accentText}`} />
            SahamLens Fundamental Intelligence
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
