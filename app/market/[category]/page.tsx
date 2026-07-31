'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Search, ArrowUpDown, ArrowUp, ArrowDown, TrendingUp, TrendingDown, DollarSign, BarChart3, Sparkles, Activity } from 'lucide-react';

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
      <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0B1121] flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-[#0A1931] dark:text-white font-bold text-lg">Kategori tidak ditemukan</p>
          <Link href="/" className="mt-3 inline-block text-[#3A86FF] font-semibold text-sm hover:underline">&larr; Kembali ke Dashboard</Link>
        </div>
      </div>
    );
  }

  const Icon = config.Icon;

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0B1121] text-slate-900 dark:text-slate-100">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap'); *{font-family:'Plus Jakarta Sans', Inter, sans-serif}`}</style>

      <header className="sticky top-0 z-50 bg-[#0A1931] text-white border-b border-white/10">
        <div className="mx-auto max-w-[1000px] px-4 sm:px-6 lg:px-8 h-[64px] flex items-center gap-4">
          <Link href="/" className="p-2 -ml-2 rounded-full hover:bg-white/10 transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-[#3A86FF] grid place-items-center font-bold text-[13px] tracking-tight">SL</div>
            <span className="font-bold text-[15px] tracking-tight">SahamLens</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1000px] px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
        <div className="flex items-start gap-3 mb-1">
          <div className="h-11 w-11 rounded-xl bg-[#3A86FF]/10 border border-[#3A86FF]/20 text-[#3A86FF] grid place-items-center shrink-0">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-[22px] sm:text-[26px] font-bold tracking-tight text-[#0A1931] dark:text-white">{config.title}</h1>
            <p className="text-[13px] text-slate-500 dark:text-slate-400">{config.sub}</p>
          </div>
        </div>
        <p className="text-[11px] text-slate-400 mb-6">
          {loading ? 'Memuat data...' : `${displayRows.length} saham • Update ${lastUpdated || '--:--'} • Sumber: Yahoo Finance`}
        </p>

        <div className="relative mb-4">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari kode saham..."
            className="w-full bg-white dark:bg-[#152238] border border-slate-200 dark:border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-[14px] text-[#0A1931] dark:text-white focus:outline-none focus:border-[#3A86FF] transition-colors"
          />
        </div>

        <div className="rounded-[18px] border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#152238] overflow-hidden shadow-[0_6px_24px_-12px_rgba(10,25,49,0.08)]">
          <div className="grid grid-cols-[40px_1fr_1fr_1fr] sm:grid-cols-[48px_1fr_1fr_1fr] gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-800/50 bg-slate-50 dark:bg-slate-800/30 text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
            <span>#</span>
            <button onClick={() => toggleSort('symbol')} className="flex items-center gap-1 text-left hover:text-[#0A1931] dark:hover:text-white transition-colors">Kode <SortIcon active={sortKey === 'symbol'} dir={sortDir} /></button>
            <button onClick={() => toggleSort('price')} className="flex items-center gap-1 text-left hover:text-[#0A1931] dark:hover:text-white transition-colors">Harga <SortIcon active={sortKey === 'price'} dir={sortDir} /></button>
            <button onClick={() => toggleSort('metric')} className="flex items-center gap-1 text-right justify-end hover:text-[#0A1931] dark:hover:text-white transition-colors">{config.metricLabel} <SortIcon active={sortKey === 'metric'} dir={sortDir} /></button>
          </div>

          {loading && (
            <div className="px-4 py-10 text-center text-[13px] text-slate-400">Memuat data real-time...</div>
          )}
          {!loading && displayRows.length === 0 && (
            <div className="px-4 py-10 text-center text-[13px] text-slate-400">
              {search ? 'Tidak ada saham yang cocok.' : 'Tidak ada data untuk kategori ini saat ini.'}
            </div>
          )}
          {!loading && displayRows.map((row, idx) => {
            const metricVal = config.metricKey === 'value' || config.metricKey === 'volume' ? 0 : (row[config.metricKey] ?? 0) as number;
            const isDown = config.metricKey === 'changePct' && metricVal < 0;
            const isUp = config.metricKey === 'changePct' && metricVal > 0;
            return (
              <Link
                key={row.symbol}
                href={`/technical/${row.symbol}.JK`}
                className="grid grid-cols-[40px_1fr_1fr_1fr] sm:grid-cols-[48px_1fr_1fr_1fr] gap-2 px-4 py-3 border-b border-slate-50 dark:border-slate-800/30 last:border-b-0 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors items-center"
              >
                <span className="text-[11px] font-mono text-slate-400">{idx + 1}</span>
                <span className="text-[13px] font-bold text-[#0A1931] dark:text-white">{row.symbol}</span>
                <span className="text-[13px] text-slate-600 dark:text-slate-300">Rp {Math.round(row.price).toLocaleString('id-ID')}</span>
                <span className={`text-[13px] font-bold text-right ${isDown ? 'text-red-600' : isUp ? 'text-emerald-600' : 'text-[#0A1931] dark:text-white'}`}>
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
