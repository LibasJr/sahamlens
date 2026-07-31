'use client';

import React, { useState, useRef } from 'react';
import Link from 'next/link';
import { TrendingUp, TrendingDown, BarChart3, DollarSign, ChevronRight, ArrowUpRight, ArrowDownRight, Sparkles, Activity } from 'lucide-react';
import AskAIButton from '@/components/AskAIButton';
import TradingViewChart from '@/components/TradingViewChart';
import CommandPalette from '@/components/CommandPalette';
import { computeIndicators, generateInsight, computeMiniCouncil, type Indicators } from '@/lib/miniCouncil';
import { pickTrendingTicker } from '@/lib/trendingTickers';

type CardItem = { code: string; change: string; value: string; dir: 'up' | 'down' | 'neutral'; href: string };
type CardDef = { id: string; title: string; sub: string; accent: string; Icon: any; key: string; listPath: string };
type Card = CardDef & { items: CardItem[] };

const CARD_DEFS: CardDef[] = [
  { id: 'gainer', title: 'Saham dengan Kenaikan Tertinggi', sub: 'Top Gainer', accent: 'emerald', Icon: TrendingUp, key: 'topGainers', listPath: '/market/top-gainer' },
  { id: 'loser', title: 'Saham dengan Penurunan Terdalam', sub: 'Top Loser', accent: 'red', Icon: TrendingDown, key: 'topLosers', listPath: '/market/top-loser' },
  { id: 'value', title: 'Berdasarkan Nilai Transaksi', sub: 'Top Value • Rp Triliun', accent: 'blue', Icon: DollarSign, key: 'topValue', listPath: '/market/top-value' },
  { id: 'volume', title: 'Berdasarkan Volume Lembar Saham', sub: 'Top Volume • Lot', accent: 'slate', Icon: BarChart3, key: 'topVolume', listPath: '/market/top-volume' },
  { id: 'weeklyGainer', title: 'Penguatan Mingguan Tertinggi', sub: 'Top Gainer • 5 Hari', accent: 'emerald', Icon: ArrowUpRight, key: 'topWeeklyGainers', listPath: '/market/weekly-gainer' },
  { id: 'weeklyLoser', title: 'Pelemahan Mingguan Terdalam', sub: 'Top Loser • 5 Hari', accent: 'red', Icon: ArrowDownRight, key: 'topWeeklyLosers', listPath: '/market/weekly-loser' },
  { id: 'technical', title: 'Sinyal Teknikal Bullish (MA20 > MA50)', sub: 'Technical Signal', accent: 'indigo', Icon: Sparkles, key: 'topTechnical', listPath: '/market/technical-bullish' },
  { id: 'technicalBearish', title: 'Sinyal Teknikal Bearish (MA20 < MA50)', sub: 'Technical Signal', accent: 'red', Icon: TrendingDown, key: 'topTechnicalBearish', listPath: '/market/technical-bearish' },
  { id: 'rsiOversold', title: 'RSI Oversold (Potensi Rebound)', sub: 'RSI (14) Terendah', accent: 'amber', Icon: Activity, key: 'topRsiOversold', listPath: '/market/rsi-oversold' },
];

const TIMEFRAMES = ['1D', '3D', '7D', '1M', '1Y'];

function formatCardItems(id: string, arr: any[]): CardItem[] {
  return (arr || []).slice(0, 4).map((s: any) => {
    const href = `/technical/${s.symbol}.JK`;
    const priceStr = `Rp ${Math.round(s.price || 0).toLocaleString('id-ID')}`;
    switch (id) {
      case 'gainer':
        return { code: s.symbol, change: `+${s.changePct.toFixed(2)}%`, value: priceStr, dir: 'up', href };
      case 'loser':
        return { code: s.symbol, change: `${s.changePct.toFixed(2)}%`, value: priceStr, dir: 'down', href };
      case 'value':
        return { code: s.symbol, change: `Rp ${(s.value / 1e12).toFixed(2)} T`, value: priceStr, dir: 'neutral', href };
      case 'volume':
        return { code: s.symbol, change: `${Math.round(s.volume / 100).toLocaleString('id-ID')} lot`, value: priceStr, dir: 'neutral', href };
      case 'weeklyGainer':
        return { code: s.symbol, change: `+${s.changePct.toFixed(2)}%`, value: priceStr, dir: 'up', href };
      case 'weeklyLoser':
        return { code: s.symbol, change: `${s.changePct.toFixed(2)}%`, value: priceStr, dir: 'down', href };
      case 'technical':
        return { code: s.symbol, change: `Skor ${s.score}%`, value: `${s.changePct >= 0 ? '+' : ''}${s.changePct.toFixed(2)}%`, dir: 'up', href };
      case 'technicalBearish':
        return { code: s.symbol, change: `${s.changePct >= 0 ? '+' : ''}${s.changePct.toFixed(2)}%`, value: priceStr, dir: 'down', href };
      case 'rsiOversold':
        return { code: s.symbol, change: `RSI ${s.rsi.toFixed(1)}`, value: `${s.changePct >= 0 ? '+' : ''}${s.changePct.toFixed(2)}%`, dir: s.changePct >= 0 ? 'up' : 'down', href };
      default:
        return { code: s.symbol, change: '-', value: '-', dir: 'neutral', href };
    }
  });
}

function isMarketOpen(d: Date): boolean {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
  const map: any = {};
  parts.forEach(p => { map[p.type] = p.value; });
  const weekday = map.weekday;
  const minutes = parseInt(map.hour, 10) * 60 + parseInt(map.minute, 10);
  const isWeekday = weekday !== 'Sat' && weekday !== 'Sun';
  const isFriday = weekday === 'Fri';
  const session1 = minutes >= 9 * 60 && minutes <= 11 * 60 + 30;
  const session2 = isFriday ? (minutes >= 14 * 60 && minutes <= 15 * 60 + 49) : (minutes >= 13 * 60 + 30 && minutes <= 15 * 60 + 49);
  return isWeekday && (session1 || session2);
}

export default function Dashboard() {
  // Emiten unggulan dipilih acak sekali per kunjungan dari daftar saham likuid/trending -
  // bukan selalu BBCA. Lazy initializer -> hanya jalan sekali saat mount, tidak berubah
  // ulang setiap re-render.
  const [ticker] = useState(() => pickTrendingTicker());
  const [timeframe, setTimeframe] = useState('1M');
  const [ihsg, setIhsg] = useState<{ price: number; change: number; pointChange: number } | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  // Halaman ini (landing page publik "/") sebelumnya SELALU menampilkan tombol "Login"
  // di header, walau user sedang login - jadi begitu user (yang sudah login) balik ke
  // "/" (mis. lewat logo Sidebar atau tombol back), tampilannya terlihat seperti sesinya
  // hilang. Sekarang dicek statusnya, sama seperti Sidebar melakukannya di /api/auth/me.
  const [authUser, setAuthUser] = useState<{ email?: string; role?: string } | null>(null);

  React.useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((d) => { if (d.authenticated && d.user) setAuthUser(d.user); })
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  React.useEffect(() => {
    fetch('/api/live/^JKSE')
      .then(r => r.json())
      .then(data => {
        if (data && data.price) {
          const pointChange = (data.price * data.changePercent / 100);
          setIhsg({ price: data.price, change: data.changePercent, pointChange });
        }
      })
      .catch(console.error);
  }, []);

  const chartRef = useRef<HTMLDivElement>(null);

  const [chartData, setChartData] = useState<any[]>([]);

  const [hoveredTime, setHoveredTime] = useState<string | null>(null);

  React.useEffect(() => {
    setHoveredTime(null); // stale hover position from the previous series wouldn't line up
    fetch(`/api/public-chart/${ticker.symbol}?tf=${timeframe}`)
      .then(r => r.json())
      .then(data => {
         if (data && data.history && data.history.length > 0) {
            setChartData(data.history);
         }
      })
      .catch(console.error);
  }, [timeframe, ticker.symbol]);

  const currentPrice = chartData.length > 0 ? chartData[chartData.length - 1].price : null;
  const prevClose = chartData.length > 1 ? chartData[chartData.length - 2].price : null;
  const change = (currentPrice != null && prevClose != null) ? currentPrice - prevClose : null;
  const changePct = (change != null && prevClose) ? (change / prevClose) * 100 : null;

  // Real technical indicators for the featured card, recomputed for whichever candle
  // is currently hovered on the chart (or the latest one, when nothing is hovered).
  const upToChartData = React.useMemo(() => {
    if (chartData.length < 2) return chartData;
    let idx = chartData.length - 1;
    if (hoveredTime) {
      const found = chartData.findIndex((c: any) => c.time === hoveredTime);
      if (found >= 0) idx = found;
    }
    return chartData.slice(0, idx + 1);
  }, [chartData, hoveredTime]);

  const ind: Indicators | null = React.useMemo(() => {
    if (upToChartData.length < 2) return null;
    const closes = upToChartData.map((h: any) => h.close);
    const volumes = upToChartData.map((h: any) => h.volume || 0);
    return computeIndicators(upToChartData[upToChartData.length - 1].time, closes, volumes);
  }, [upToChartData]);

  // Council AI: 10 agen rule-based, dihitung dari OHLCV asli - dipakai untuk sinyal +
  // ringkasan analisis, supaya insight yang ditampilkan tidak pernah mengarang.
  const council = React.useMemo(() => computeMiniCouncil(upToChartData as any), [upToChartData]);

  const isHovering = hoveredTime != null && ind != null && chartData.length > 0 && ind.time !== chartData[chartData.length - 1].time;

  const insightText = council ? council.summary : (ind ? generateInsight(ind) : 'Memuat analisis teknikal real-time...');
  const finalSignal = council?.finalSignal ?? ind?.signal ?? 'HOLD';

  const [marketCards, setMarketCards] = useState<Card[]>(CARD_DEFS.map(def => ({ ...def, items: [] })));
  const [cardsLoaded, setCardsLoaded] = useState(false);

  React.useEffect(() => {
    fetch('/api/market-summary').then(r => r.json()).then(data => {
      if (data && !data.error) {
        setMarketCards(CARD_DEFS.map(def => ({ ...def, items: formatCardItems(def.id, data[def.key]) })));
        setCardsLoaded(true);
        if (data.timestamp) {
          setLastUpdated(new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }).format(new Date(data.timestamp)) + ' WIB');
        }
      }
    }).catch(console.error);
  }, []);

  const jakartaDate = now ? new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now) : null;
  const jakartaTime = now ? new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false }).format(now) + ' WIB' : null;
  const marketOpen = now ? isMarketOpen(now) : false;

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0B1121] text-slate-900 dark:text-slate-100 selection:bg-[#3A86FF]/20">
      {/* HEADER DEEP NAVY */}
      <header className="sticky top-0 z-50 bg-[#0A1931] text-white border-b border-white/10">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
          <div className="flex h-[64px] items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2.5">
                <img src="/icon-192x192.png" alt="SahamLens" className="h-8 w-8 rounded-lg object-cover" />
                <span className="font-bold text-[16px] tracking-tight font-heading">SahamLens</span>

              </div>
              <div className="hidden md:flex items-center gap-3 pl-6 border-l border-white/15">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] uppercase tracking-widest text-white/60 font-semibold">IHSG Hari Ini</span>
                  <span className="h-1 w-1 rounded-full bg-emerald-400 animate-pulse" />
                </div>
                {ihsg ? (
                  <div className="flex items-baseline gap-2">
                    <span className="text-[18px] font-bold tracking-tight font-number">{ihsg.price.toLocaleString('id-ID', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold ${ihsg.change >= 0 ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}`}>
                      {ihsg.change >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />} {ihsg.change >= 0 ? '+' : ''}{ihsg.change.toFixed(2)}% ({ihsg.change >= 0 ? '+' : ''}{ihsg.pointChange.toFixed(1)})
                    </span>
                  </div>
                ) : (
                  <span className="text-[13px] font-medium text-white/50">Memuat...</span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-[40px] sm:w-[180px] md:w-[220px]">
                <CommandPalette />
              </div>
              <div className="hidden lg:flex items-center gap-2 rounded-full bg-white/10 border border-white/10 px-2.5 py-1">
                <span className={`h-2 w-2 rounded-full animate-pulse ${marketOpen ? 'bg-emerald-400' : 'bg-slate-400'}`} />
                <span className="text-[11px] font-medium text-white">{marketOpen ? 'Live' : 'Tutup'}</span>
              </div>
              <div className="flex items-center gap-2 text-[11px] font-medium text-white/50">
                <span className="hidden sm:inline">{jakartaDate && jakartaTime ? `${jakartaDate} • ${jakartaTime}` : 'Memuat waktu...'}</span>
                <span className="sm:hidden">{jakartaTime || '--:--'}</span>
              </div>
              {authUser ? (
                <Link href="/home" className="ml-2 flex items-center gap-2 rounded-lg bg-[#3A86FF] hover:bg-[#2f6fd6] px-4 py-1.5 text-[12px] font-bold text-white transition-colors border border-[#3A86FF]">
                  Buka Dashboard
                </Link>
              ) : (
                <Link href="/login" className="ml-2 rounded-lg bg-[#3A86FF] hover:bg-[#2f6fd6] px-4 py-1.5 text-[12px] font-bold text-white transition-colors border border-[#3A86FF]">
                  Login
                </Link>
              )}
            </div>
          </div>
          {/* mobile IHSG */}
          <div className="flex md:hidden items-center justify-between pb-3 -mt-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-widest text-white/50 font-semibold">IHSG</span>
              {ihsg ? (
                <>
                  <span className="text-[14px] font-bold">{ihsg.price.toLocaleString('id-ID', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                  <span className={`text-[11px] font-semibold ${ihsg.change >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{ihsg.change >= 0 ? '+' : ''}{ihsg.change.toFixed(2)}%</span>
                </>
              ) : (
                <span className="text-[12px] text-white/50">Memuat...</span>
              )}
            </div>
            <span className={`text-[10px] flex items-center gap-1 ${marketOpen ? 'text-emerald-300' : 'text-white/40'}`}><span className={`h-1.5 w-1.5 rounded-full animate-pulse ${marketOpen ? 'bg-emerald-400' : 'bg-slate-400'}`} />{marketOpen ? 'Market Buka' : 'Market Tutup'}</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
        {/* Title Block */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-[24px] sm:text-[28px] font-bold tracking-tight text-[#0A1931] dark:text-white font-heading">Ringkasan Pasar Hari Ini</h1>
              <AskAIButton prompt="Tolong berikan ringkasan kondisi pasar IHSG hari ini, serta saham-saham apa saja yang menarik untuk diperhatikan berdasarkan data terkini." />
            </div>
            <p className="mt-1 text-[13px] sm:text-[14px] text-slate-500 dark:text-slate-400 font-medium">Data real-time dari Bursa Efek Indonesia (via Yahoo Finance) • {lastUpdated ? <span className="text-[#3A86FF] font-semibold">Update terakhir {lastUpdated}</span> : 'Memuat data...'}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Powered by</span>
            <span className="rounded-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#152238] px-3 py-1 text-[11px] font-bold text-slate-700 dark:text-slate-300 shadow-sm">SahamLens</span>
          </div>
        </div>

        {/* FEATURED CHART CARD */}
        <div className="relative overflow-hidden rounded-[20px] border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#152238] shadow-[0_10px_40px_-12px_rgba(10,25,49,0.12)]">
          <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_0.9fr]">
            {/* Left Chart */}
            <div className="p-5 sm:p-7">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="h-12 w-12 rounded-xl bg-[#0A1931] text-white grid place-items-center font-bold text-[13px] font-heading">{ticker.symbol}</div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-[18px] font-bold text-[#0A1931] dark:text-white tracking-tight font-heading">{ticker.symbol}.JK — {ticker.name}</h2>
                      <span className="hidden sm:inline-flex rounded-full bg-[#0A1931] px-2 py-0.5 text-[10px] font-bold tracking-widest text-white">LQ45 • TRENDING</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-[12px]">
                      <span className="font-semibold text-slate-900 dark:text-slate-100 font-number">{currentPrice != null ? `Rp ${Math.round(currentPrice).toLocaleString('id-ID')}` : 'Memuat...'}</span>
                      {change != null && changePct != null && (
                        <span className={`inline-flex items-center gap-1 font-semibold font-number ${change>=0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {change>=0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />} {change>=0?'+':''}{change.toFixed(0)} ({changePct>=0?'+':''}{changePct.toFixed(2)}%)
                        </span>
                      )}
                      <span className="text-slate-400">{ind ? `Vol: ${(ind.volume / 1e6).toFixed(1)} Jt • Val: Rp ${(ind.value / 1e12).toFixed(2)} T` : 'Memuat volume...'}</span>
                      {isHovering && ind && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#3A86FF]/10 text-[#3A86FF] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                          Data per {ind.time}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 rounded-full bg-slate-100 dark:bg-slate-800/80 p-1">
                  {TIMEFRAMES.map(t=>(
                    <button key={t} onClick={()=>setTimeframe(t)} className={`rounded-full px-3 py-1 text-[11px] font-bold tracking-wide transition ${timeframe===t ? 'bg-[#0A1931] text-white shadow' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-slate-100'}`}>{t}</button>
                  ))}
                </div>
              </div>

              {/* Chart */}
              <div className="relative mt-6 rounded-xl overflow-hidden shadow-1 border border-slate-100 dark:border-slate-800/50">
                {chartData.length > 0 ? (
                  <TradingViewChart
                    symbol={ticker.symbol}
                    candles={chartData}
                    height={340}
                    timeframe={timeframe}
                    onHoverCandle={setHoveredTime}
                    technical={{
                      cross_status: ind?.ma20 != null && ind?.ma50 != null ? (ind.ma20 > ind.ma50 ? 'BULLISH' : 'BEARISH') : 'NETRAL',
                      broker_flow_status: ind?.volRatio != null ? (ind.volRatio > 1 ? 'AKUMULASI' : 'DISTRIBUSI') : 'NETRAL',
                      ma50: ind?.ma50 ?? undefined,
                      ma200: undefined
                    }}
                  />
                ) : (
                  <div className="h-[340px] flex items-center justify-center bg-[#131722] text-white">Memuat grafik...</div>
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-4 items-center bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800/30">
                <div className="text-blue-800 dark:text-blue-300 font-semibold text-[13px] flex items-center gap-2">
                  <Sparkles className="w-4 h-4" /> {isHovering ? `Insight per ${ind?.time}` : `Insight ${ticker.symbol} Terkini`}
                </div>
                <p className="text-[12px] text-blue-700 dark:text-blue-200">
                  {insightText}
                </p>
              </div>
            </div>

            {/* Right Panel - Institutional Analysis */}
            <div className="border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-slate-800 bg-[#FBFDFF] dark:bg-[#152238] p-5 sm:p-7 flex flex-col">
              <div className="flex items-center justify-between">
                <h3 className="text-[12px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Analisis Teknikal Real-Time</h3>
                {ind && (
                  <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${finalSignal === 'BUY' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : finalSignal === 'SELL' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-slate-100 border-slate-200 text-slate-600'}`}>
                    {finalSignal === 'BUY' ? `TREN MENGUAT (${council?.confidence ?? ind.score}%)` : finalSignal === 'SELL' ? `TREN MELEMAH (${council?.confidence ?? ind.score}%)` : `NETRAL (${council?.confidence ?? ind.score}%)`}
                  </span>
                )}
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-white dark:bg-[#152238] border border-slate-200 dark:border-slate-800 p-3 shadow-sm">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Harga Terakhir</div>
                  <div className="mt-1 text-[20px] font-bold tracking-tight text-[#0A1931] dark:text-white font-number">{ind ? `Rp ${Math.round(ind.price).toLocaleString('id-ID')}` : '...'}</div>
                  {ind && <div className={`text-[11px] font-semibold ${ind.changePct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{ind.changePct >= 0 ? '+' : ''}{ind.changePct.toFixed(2)}% hari ini</div>}
                </div>
                <div className="rounded-xl bg-[#0A1931] p-3 text-white">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-white/60">Sinyal Council AI</div>
                  {ind ? (
                    <>
                      <div className="mt-1 flex items-center gap-1.5 text-[15px] font-bold">
                        <span className={`h-5 w-5 rounded-full grid place-items-center text-[#0A1931] text-[11px] ${finalSignal === 'BUY' ? 'bg-emerald-400' : finalSignal === 'SELL' ? 'bg-red-400' : 'bg-slate-300'}`}>{finalSignal === 'BUY' ? '↑' : finalSignal === 'SELL' ? '↓' : '→'}</span> {finalSignal}
                      </div>
                      <div className="text-[11px] text-white/70">
                        {ind.crossLabel}
                      </div>
                    </>
                  ) : <div className="mt-1 text-[13px] text-white/60">Memuat...</div>}
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {ind ? [
                  { k: 'MA20', v: ind.ma20 != null ? Math.round(ind.ma20).toLocaleString('id-ID') : '-', s: ind.ma20 != null ? (ind.price > ind.ma20 ? 'Harga berada di atas MA20' : 'Harga berada di bawah MA20') : 'Data belum cukup', c: ind.ma20 != null && ind.price > ind.ma20 ? 'emerald' : 'slate' },
                  { k: 'MA50', v: ind.ma50 != null ? Math.round(ind.ma50).toLocaleString('id-ID') : '-', s: ind.crossLabel, c: ind.ma20 != null && ind.ma50 != null && ind.ma20 > ind.ma50 ? 'blue' : 'slate' },
                  { k: 'RSI (14)', v: ind.rsi14 != null ? ind.rsi14.toFixed(1) : '-', s: `Status ${ind.rsiLabel}`, c: 'slate' },
                  { k: 'Volume', v: `${(ind.volume / 1e6).toFixed(1)} Jt`, s: ind.volRatio >= 1 ? `Naik ${((ind.volRatio - 1) * 100).toFixed(0)}% dari rata-rata` : `Turun ${((1 - ind.volRatio) * 100).toFixed(0)}% dari rata-rata`, c: ind.volRatio >= 1 ? 'emerald' : 'slate' },
                  // Indikator tambahan dari agen Council AI lain (MACD, S/R, Money Flow,
                  // Volatilitas) - menggantikan kotak "Ringkasan Analisis Teknikal" yang
                  // dulu isinya duplikat persis dengan kartu Insight di kolom kiri.
                  ...(council ? council.agents
                    .filter(a => ['MACD', 'Support/Resistance', 'Money Flow', 'Volatilitas'].includes(a.name))
                    .map(a => ({
                      k: a.name,
                      v: a.signal,
                      s: a.reason,
                      c: a.signal === 'BUY' ? 'emerald' : a.signal === 'SELL' ? 'red' : 'slate',
                    })) : []),
                ].map(r=>(
                  <div key={r.k} className="flex items-center justify-between rounded-lg border border-slate-100 dark:border-slate-800/50 bg-white dark:bg-[#152238] px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className={`h-7 w-7 rounded-full grid place-items-center text-[11px] font-bold shrink-0 ${r.c==='emerald'?'bg-emerald-50 text-emerald-700': r.c==='blue'?'bg-blue-50 text-blue-700': r.c==='red'?'bg-red-50 text-red-700':'bg-slate-100 dark:bg-slate-800/80 text-slate-600'}`}>{r.k[0]}</div>
                      <div className="min-w-0">
                        <div className="text-[12px] font-bold text-slate-900 dark:text-slate-100">{r.k}</div>
                        <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400">{r.s}</div>
                      </div>
                    </div>
                    <div className="text-[12px] font-bold text-[#0A1931] dark:text-white font-number shrink-0 pl-2">{r.v}</div>
                  </div>
                )) : (
                  <div className="text-[12px] text-slate-400 py-4 text-center">Memuat indikator teknikal...</div>
                )}
              </div>

              <div className="mt-auto pt-5">
                <Link href={`/technical/${ticker.symbol}.JK`} className="group flex w-full items-center justify-center gap-2 rounded-full bg-[#3A86FF] px-5 py-3 text-[13px] font-bold text-white shadow-[0_8px_20px_-8px_#3A86FF] hover:bg-[#2f6fd6] transition">
                  Lihat Analisis Lengkap
                  <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* GRID CARDS */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-5">
          {marketCards.map((card) => {
            const accentMap: any = {
              emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
              red: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', dot: 'bg-red-500' },
              blue: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', dot: 'bg-[#3A86FF]' },
              slate: { bg: 'bg-slate-100 dark:bg-slate-800/80', text: 'text-slate-700 dark:text-slate-300', border: 'border-slate-200 dark:border-slate-800', dot: 'bg-slate-600' },
              indigo: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', dot: 'bg-indigo-500' },
              amber: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-500' },
            };
            const accent = accentMap[card.accent] || accentMap.slate;

            return (
              <div key={card.id} className="group relative rounded-[18px] border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#152238] p-5 shadow-[0_6px_24px_-12px_rgba(10,25,49,0.08)] hover:shadow-[0_12px_32px_-10px_rgba(10,25,49,0.14)] hover:-translate-y-[1px] transition-all">
                {/* header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`h-9 w-9 rounded-xl grid place-items-center border ${accent.bg} ${accent.border} ${accent.text}`}>
                      <card.Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="text-[13px] font-bold leading-tight tracking-tight text-[#0A1931] dark:text-white max-w-[180px]">{card.title}</h4>
                      <span className={`mt-0.5 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${accent.bg} ${accent.text}`}>{card.sub}</span>
                    </div>
                  </div>
                  <span className={`h-2 w-2 rounded-full ${accent.dot} shadow-[0_0_0_4px_rgba(0,0,0,0.04)]`} />
                </div>

                {/* list */}
                <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-100 dark:border-slate-800/50 overflow-hidden bg-slate-50 dark:bg-slate-800/50/50">
                  {card.items.length === 0 && (
                    <div className="bg-white dark:bg-[#152238] px-3 py-6 text-center text-[11px] text-slate-400">
                      {cardsLoaded ? 'Belum ada data untuk kategori ini' : 'Memuat data...'}
                    </div>
                  )}
                  {card.items.map((it, idx) => (
                    <Link key={it.code} href={it.href} className="flex items-center justify-between gap-2 bg-white dark:bg-[#152238] px-3 py-[11px] hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="grid h-6 w-6 place-items-center rounded-full bg-[#0A1931] text-[10px] font-bold text-white shrink-0">{idx+1}</span>
                        <div className="min-w-0">
                          <span className="text-[12px] font-bold tracking-tight text-[#0A1931] dark:text-white">{it.code}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className={`text-[12px] font-bold tracking-tight flex items-center justify-end gap-1 ${it.dir === 'down' ? 'text-red-600' : it.dir === 'up' ? 'text-emerald-600' : 'text-[#0A1931] dark:text-white'}`}>
                          {it.dir !== 'neutral' && <span className={`h-1 w-1 rounded-full ${it.dir === 'down' ? 'bg-red-500' : 'bg-emerald-500'}`} />}
                          {it.change}
                        </div>
                        <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400">{it.value}</div>
                      </div>
                    </Link>
                  ))}
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Update {lastUpdated || '--:--'} • IDX</span>
                  <Link href={card.listPath} className="inline-flex items-center gap-1 text-[11px] font-bold text-[#3A86FF] hover:text-[#0A1931] transition">
                    Lihat Seluruhnya <ChevronRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom Meta */}
        <div className="mt-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#152238] px-5 py-4 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full animate-pulse ${marketOpen ? 'bg-emerald-500' : 'bg-slate-400'}`} />
            <span className="font-medium">Data disinkronisasi secara real-time dari Bursa Efek Indonesia • Keterlambatan waktu maksimal 15 menit • Sumber: Yahoo Finance</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-slate-100 dark:bg-slate-800/80 px-2.5 py-1 font-semibold">© {new Date().getFullYear()} SahamLens</span>
          </div>
        </div>
      </main>
    </div>
  );
}
