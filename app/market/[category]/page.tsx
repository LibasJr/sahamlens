'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Search, ArrowUpDown, ArrowUp, ArrowDown, TrendingUp, TrendingDown, DollarSign, BarChart3, Sparkles, Activity } from 'lucide-react';
import { Input, Skeleton, EmptyState } from '@/components/ui';

type Row = { symbol: string; price: number; changePct?: number; value?: number; volume?: number; score?: number; rsi?: number };

const CATEGORY_CONFIG: Record<string, { title: string; sub: string; dataKey: string; Icon: any; metricLabel: string; metricKey: 'changePct' | 'value' | 'volume' | 'score' | 'rsi' }> = {
  'top-gainer': { title: 'Top Gainer', sub: 'Saham dengan kenaikan harian tertinggi', dataKey: 'topGainers', Icon: TrendingUp, metricLabel: 'Perubahan Harian', metricKey: 'changePct' },
  'top-loser': { title: 'Top Loser', sub: 'Saham dengan penurunan harian terdalam', dataKey: 'topLosers', Icon: TrendingDown, metricLabel: 'Perubahan Harian', metricKey: 'changePct' },
  'top-value': { title: 'Top Value', sub: 'Berdasarkan nilai transaksi (harga × volume) hari ini', dataKey: 'topValue', Icon: DollarSign, metricLabel: 'Nilai Transaksi', metricKey: 'value' },
  'top-volume': { title: 'Top Volume', sub: 'Berdasarkan volume lembar saham hari ini', dataKey: 'topVolume', Icon: BarChart3, metricLabel: 'Volume', metricKey: 'volume' },
  'weekly-gainer': { title: 'Top Gainer Mingguan', sub: 'Penguatan tertinggi dalam 5 hari perdagangan terakhir', dataKey: 'topWeeklyGainers', Icon: TrendingUp, metricLabel: 'Perubahan 5 Hari', metricKey: 'changePct' },
  'weekly-loser': { title: 'Top Loser Mingguan', sub: 'Pelemahan terdalam dalam 5 hari perdagangan terakhir', dataKey: 'topWeeklyLosers', Icon: TrendingDown, metricLabel: 'Perubahan 5 Hari', metricKey: 'changePct' },
  'technical-bullish': { title: 'Sinyal Teknikal Bullish', sub: 'Harga di atas MA20, MA20 di atas MA50, volume di atas rata-rata', dataKey: 'topTechnical', Icon: Sparkles, metricLabel: 'Skor Teknikal', metricKey: 'score' },
  'technical-bearish': { title: 'Sinyal Teknikal Bearish', sub: 'Harga di bawah MA20, MA20 di bawah MA50', dataKey: 'topTechnicalBearish', Icon: TrendingDown, metricLabel: 'Perubahan Harian', metricKey: 'changePct' },
  'rsi-oversold': { title: 'RSI Oversold', sub: 'Saham dengan RSI (14) terendah, potensi technical rebound', dataKey: 'topRsiOversold', Icon: Activity, metricLabel: 'RSI (14)', metricKey: 'rsi' },
};

function formatMetric(row: Row, metricKey: string): string {
  switch (metricKey) {
    case 'changePct': return `${(row.changePct ?? 0) >= 0 ? '+' : ''}${(row.changePct ?? 0).toFixed(2)}%`;
    case 'value': return `Rp ${((row.value ?? 0) / 1e12).toFixed(2)} T`;
    case 'volume': return `${Math.round((row.volume ?? 0) / 100).toLocaleString('id-ID')} lot`;
    case 'score': return `${row.score ?? 0}%`;
    case 'rsi': return `${(row.rsi ?? 0).toFixed(1)}`;
    default: return '-';
  }
}

export default function MarketCategoryPage() {
  const params = useParams();
  const category = String(params.category || '');
  const config = CATEGORY_CONFIG[category];

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<'symbol' | 'price' | 'metric'>('metric');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  React.useEffect(() => {
    if (!config) { setLoading(false); return; }
    fetch('/api/market-summary')
      .then(r => r.json())
      .then(data => {
        if (data && !data.error) {
          setRows(data[config.dataKey] || []);
          if (data.timestamp) {
            setLastUpdated(new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }).format(new Date(data.timestamp)) + ' WIB');
          }
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [category]);

  const displayRows = useMemo(() => {
    let out = rows.filter(r => r.symbol.toLowerCase().includes(search.trim().toLowerCase()));
    const metricOf = (r: Row) => config ? (r[config.metricKey] ?? 0) as number : 0;
    out = [...out].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'symbol') cmp = a.symbol.localeCompare(b.symbol);
      else if (sortKey === 'price') cmp = a.price - b.price;
      else cmp = metricOf(a) - metricOf(b);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return out;
  }, [rows, search, sortKey, sortDir, config]);

  const toggleSort = (key: 'symbol' | 'price' | 'metric') => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir(key === 'symbol' ? 'asc' : 'desc'); }
  };

  const SortIcon = ({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) =>
    !active ? <ArrowUpDown className="h-3 w-3 opacity-40" /> : dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;

  if (!config) {
    return (
      <div className="min-h-screen bg-tv-bg flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-tv-text font-bold text-lg font-heading">Kategori tidak ditemukan</p>
          <Link href="/" className="mt-3 inline-block text-tv-blue font-semibold text-sm hover:underline">&larr; Kembali ke Dashboard</Link>
        </div>
      </div>
    );
  }

  const Icon = config.Icon;

  return (
    <div className="min-h-screen bg-tv-bg text-tv-text">
      <header className="sticky top-0 z-50 bg-tv-surface text-white border-b border-tv-border">
        <div className="mx-auto max-w-[1000px] px-4 sm:px-6 lg:px-8 h-[64px] flex items-center gap-4">
          <Link href="/" className="p-2 -ml-2 rounded-full hover:bg-white/10 transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-md bg-tv-blue grid place-items-center font-bold text-[13px] tracking-tight">SL</div>
            <span className="font-bold text-[15px] tracking-tight font-heading">SahamLens</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1000px] px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
        <div className="flex items-start gap-3 mb-1">
          <div className="h-11 w-11 rounded-lg bg-tv-blue/10 border border-tv-blue/20 text-tv-blue grid place-items-center shrink-0">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-[22px] sm:text-2xl font-bold tracking-tight text-tv-text font-heading">{config.title}</h1>
            <p className="text-[13px] text-tv-muted">{config.sub}</p>
          </div>
        </div>
        <p className="text-[11px] text-tv-muted mb-6">
          {loading ? 'Memuat data...' : `${displayRows.length} saham • Update ${lastUpdated || '--:--'} • Sumber: Yahoo Finance`}
        </p>

        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari kode saham..."
          leftIcon={<Search className="h-4 w-4" />}
          className="mb-4"
        />

        <div className="rounded-lg border border-tv-border bg-tv-card overflow-hidden shadow-1">
          <div className="grid grid-cols-[40px_1fr_1fr_1fr] sm:grid-cols-[48px_1fr_1fr_1fr] gap-2 px-4 py-3 border-b border-tv-border/60 bg-tv-hover/40 text-[11px] font-bold uppercase tracking-widest text-tv-muted">
            <span>#</span>
            <button onClick={() => toggleSort('symbol')} className="flex items-center gap-1 text-left hover:text-tv-text transition-colors">Kode <SortIcon active={sortKey === 'symbol'} dir={sortDir} /></button>
            <button onClick={() => toggleSort('price')} className="flex items-center gap-1 text-left hover:text-tv-text transition-colors">Harga <SortIcon active={sortKey === 'price'} dir={sortDir} /></button>
            <button onClick={() => toggleSort('metric')} className="flex items-center gap-1 text-right justify-end hover:text-tv-text transition-colors">{config.metricLabel} <SortIcon active={sortKey === 'metric'} dir={sortDir} /></button>
          </div>

          {loading && (
            <div className="p-4 space-y-3">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} variant="text" className="w-full" />)}
            </div>
          )}
          {!loading && displayRows.length === 0 && (
            <EmptyState
              icon={<Search className="w-5 h-5" />}
              title={search ? 'Tidak ada saham yang cocok' : 'Belum ada data'}
              description={search ? 'Coba kata kunci lain.' : 'Tidak ada data untuk kategori ini saat ini.'}
            />
          )}
          {!loading && displayRows.map((row, idx) => {
            const metricVal = config.metricKey === 'value' || config.metricKey === 'volume' ? 0 : (row[config.metricKey] ?? 0) as number;
            const isDown = config.metricKey === 'changePct' && metricVal < 0;
            const isUp = config.metricKey === 'changePct' && metricVal > 0;
            return (
              <Link
                key={row.symbol}
                href={`/technical/${row.symbol}.JK`}
                className="grid grid-cols-[40px_1fr_1fr_1fr] sm:grid-cols-[48px_1fr_1fr_1fr] gap-2 px-4 py-3 border-b border-tv-border/40 last:border-b-0 hover:bg-tv-hover transition-colors items-center"
              >
                <span className="text-[11px] font-number text-tv-muted">{idx + 1}</span>
                <span className="text-[13px] font-bold text-tv-text">{row.symbol}</span>
                <span className="text-[13px] text-tv-muted font-number">Rp {Math.round(row.price).toLocaleString('id-ID')}</span>
                <span className={`text-[13px] font-bold text-right font-number ${isDown ? 'text-tv-red' : isUp ? 'text-tv-green' : 'text-tv-text'}`}>
                  {formatMetric(row, config.metricKey)}
                </span>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}
