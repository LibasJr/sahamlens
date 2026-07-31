'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Activity, TrendingUp, TrendingDown, BarChart3,
  RefreshCw, ArrowUpRight, ArrowDownRight, Layers, Zap
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { hasProAccess, refreshAdminStatus, getUsedSymbolsToday, FREE_LIMITS } from '@/lib/limits';
import PaywallModal from '@/components/PaywallModal';

// Normalisasi simbol: pastikan hanya 1x .JK
const displayTicker = (s: string) => s.replace('.JK', '').replace('.JK', '');

// Mini Sparkline SVG
function Sparkline({ data, color, width = 120, height = 32 }: { data: number[]; color: string; width?: number; height?: number }) {
  if (!data || data.length < 2) return <div className="w-[120px] h-8 bg-tv-hover rounded animate-pulse" />;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((val - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');

  const fillPoints = `0,${height} ${points} ${width},${height}`;

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={fillPoints} fill={`url(#grad-${color.replace('#', '')})`} />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Sector Heatmap Tile
function HeatmapTile({ sector, changePct, marketCap, stocks, maxMcap }: any) {
  const size = Math.max(1, Math.sqrt(marketCap / (maxMcap || 1))) * 100;
  const isUp = changePct >= 0;
  const intensity = Math.min(Math.abs(changePct) * 40, 100);
  
  const bg = isUp
    ? `rgba(20, 184, 166, ${0.1 + intensity / 200})`
    : `rgba(239, 68, 68, ${0.1 + intensity / 200})`;
  const border = isUp
    ? `rgba(20, 184, 166, ${0.2 + intensity / 250})`
    : `rgba(239, 68, 68, ${0.2 + intensity / 250})`;

  return (
    <div
      className="rounded-lg p-3 flex flex-col justify-between transition-all hover:scale-[1.02] cursor-default group"
      style={{
        backgroundColor: bg,
        borderWidth: 1,
        borderColor: border,
        minHeight: `${Math.max(90, size * 0.8)}px`
      }}
    >
      <div>
        <div className="text-xs font-bold text-white truncate">{sector}</div>
        <div className={`text-lg font-extrabold font-mono ${isUp ? 'text-[#14b8a6]' : 'text-red-400'}`}>
          {isUp ? '+' : ''}{changePct.toFixed(2)}%
        </div>
      </div>
      <div className="flex flex-wrap gap-1 mt-1 opacity-70 group-hover:opacity-100 transition-opacity">
        {stocks?.slice(0, 4).map((s: any) => (
          <span
            key={s.symbol}
            className={`text-[9px] font-mono px-1 py-0.5 rounded ${
              s.changePct >= 0 ? 'bg-[#14b8a6]/20 text-[#14b8a6]' : 'bg-red-500/20 text-red-400'
            }`}
          >
            {s.symbol} {s.changePct >= 0 ? '+' : ''}{s.changePct.toFixed(1)}%
          </span>
        ))}
      </div>
    </div>
  );
}

// Breadth Bar
function BreadthBar({ advancing, declining, unchanged, total }: any) {
  const advPct = (advancing / total) * 100;
  const decPct = (declining / total) * 100;
  const uncPct = (unchanged / total) * 100;

  return (
    <div className="space-y-2">
      <div className="flex h-5 rounded-full overflow-hidden">
        <div className="bg-[#14b8a6] transition-all flex items-center justify-center" style={{ width: `${advPct}%` }}>
          {advPct > 10 && <span className="text-[9px] font-mono font-bold text-white">{advancing}</span>}
        </div>
        <div className="bg-gray-600 transition-all flex items-center justify-center" style={{ width: `${uncPct}%` }}>
          {uncPct > 10 && <span className="text-[9px] font-mono font-bold text-white">{unchanged}</span>}
        </div>
        <div className="bg-red-500 transition-all flex items-center justify-center" style={{ width: `${decPct}%` }}>
          {decPct > 10 && <span className="text-[9px] font-mono font-bold text-white">{declining}</span>}
        </div>
      </div>
      <div className="flex justify-between text-[10px] font-mono">
        <span className="text-[#14b8a6]">▲ Naik: {advancing} ({advPct.toFixed(0)}%)</span>
        <span className="text-gray-400">— Stagnan: {unchanged}</span>
        <span className="text-red-400">▼ Turun: {declining} ({decPct.toFixed(0)}%)</span>
      </div>
    </div>
  );
}

export default function MarketPulse() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [breakoutData, setBreakoutData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [pro, setPro] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [usedSymbolsToday, setUsedSymbolsToday] = useState<string[]>([]);

  useEffect(() => {
    setIsClient(true);
    refreshAdminStatus().then(() => setPro(hasProAccess()));
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/market-pulse', { cache: 'no-store' });
      const json = await res.json();
      
      if (res.status === 402 || json.code === 'SUBSCRIPTION_REQUIRED') {
        setUsedSymbolsToday(getUsedSymbolsToday());
        setShowPaywall(true);
        return;
      }
      
      const res2 = await fetch('/api/breakout-radar');
      if (res2.ok) {
        const json2 = await res2.json();
        setBreakoutData(json2.data || []);
      }

      if (json) {
        setData(json);
        setLastUpdate(new Date());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 120000); // 2 min refresh
    return () => clearInterval(interval);
  }, []);

  const maxMcap = useMemo(() => {
    if (!data?.sectorHeatmap) return 1;
    return Math.max(...data.sectorHeatmap.map((s: any) => s.marketCap || 0));
  }, [data]);

  const formatTime = (date: Date) => date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';

  return (
    <div className="flex-1 flex flex-col bg-[#0f172a] min-h-screen">
      {/* Top Header */}
      <header className="bg-[#131c2e] border-b border-[#1e293b] px-6 py-3 sticky top-0 z-20 shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-[#14b8a6]/10 border border-[#14b8a6]/30 text-[#14b8a6]">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-lg text-white tracking-tight">Market Pulse</h2>
              <p className="text-xs text-gray-500 font-mono">IDX Algorithmic Suite — Real-time Market Overview</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs font-mono">
            {isClient && (
              pro ? (
                <div className="bg-[#14b8a6]/10 border border-[#14b8a6]/30 px-3 py-1.5 rounded-full text-[#14b8a6] font-bold">
                  REALTIME
                </div>
              ) : (
                <div className="bg-tv-yellow/10 border border-tv-yellow/30 px-3 py-1.5 rounded-full text-tv-yellow font-bold">
                  DELAY 15m - Realtime di Pro
                </div>
              )
            )}
            <div className="bg-[#1e293b] border border-[#334155] px-3 py-1.5 rounded-full text-gray-400">
              Update: {isClient && lastUpdate ? formatTime(lastUpdate) : 'Loading...'}
            </div>
            <button
              onClick={fetchData}
              disabled={loading}
              className="bg-[#1e293b] border border-[#334155] hover:bg-[#334155] px-3 py-1.5 rounded-full text-white flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </header>

      <div className="p-6 space-y-6 max-w-[1600px] mx-auto w-full">
        {/* === SECTION 1: INDEX CARDS === */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {data?.indices ? data.indices.map((idx: any) => {
            const isUp = idx.changePct >= 0;
            return (
              <div
                key={idx.name}
                className={`bg-[#131c2e] border rounded-xl p-4 shadow-1 transition-all hover:shadow-xl ${
                  isUp ? 'border-[#14b8a6]/30' : 'border-red-500/30'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-[10px] font-mono text-gray-500 uppercase">{idx.fullName}</div>
                    <div className="text-lg font-extrabold text-white font-mono">{idx.name}</div>
                  </div>
                  <div className={`flex items-center gap-1 text-sm font-bold font-mono ${isUp ? 'text-[#14b8a6]' : 'text-red-400'}`}>
                    {isUp ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                    {isUp ? '+' : ''}{idx.changePct}%
                  </div>
                </div>
                <div className="flex items-end justify-between">
                  <div className="text-2xl font-extrabold text-white font-mono">
                    {idx.price?.toLocaleString('id-ID', { maximumFractionDigits: 0 })}
                  </div>
                  <Sparkline data={idx.sparkline} color={isUp ? '#14b8a6' : '#ef4444'} />
                </div>
              </div>
            );
          }) : (
            // Skeleton
            [1, 2, 3, 4].map(i => (
              <div key={i} className="bg-[#131c2e] border border-[#1e293b] rounded-xl p-4 shadow-1 animate-pulse">
                <div className="h-4 bg-[#1e293b] rounded w-20 mb-2" />
                <div className="h-6 bg-[#1e293b] rounded w-16 mb-3" />
                <div className="h-8 bg-[#1e293b] rounded w-full" />
              </div>
            ))
          )}
        </div>

        {/* === SECTION 1.5: BREAKOUT WIDGET === */}
        <div className="bg-[#131c2e] border border-teal-500/30 rounded-xl p-5 shadow-1 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-teal-500/10 rounded-bl-full -z-10" />
          <div className="flex items-center justify-between border-b border-[#1e293b] pb-3 mb-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Zap className="w-5 h-5 text-teal-400" />
                Top 3 Breakout Hari Ini
                <span className="text-[9px] bg-red-500 text-white px-2 py-0.5 rounded font-mono animate-pulse">LIVE</span>
              </h3>
            </div>
            <a href="/breakout-radar" className="text-xs font-mono text-teal-400 hover:text-teal-300 flex items-center gap-1">
              Lihat Semua Radar &rarr;
            </a>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {loading ? (
              [1, 2, 3].map(i => (
                <div key={i} className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 animate-pulse h-24" />
              ))
            ) : breakoutData.length > 0 ? (
              breakoutData.slice(0, 3).map((item, idx) => (
                <a key={item.symbol} href={`/?symbol=${item.symbol}`} className="bg-slate-800/50 border border-slate-700 hover:border-teal-500/50 transition-colors rounded-lg p-4 group">
                  <div className="flex justify-between items-start mb-2">
                    <div className="font-bold text-white font-mono flex items-center gap-2">
                      <span className="text-xs text-slate-500">#{idx + 1}</span> {item.symbol}
                    </div>
                    <div className="text-xs font-bold text-teal-400">{item.change}</div>
                  </div>
                  <div className="text-[10px] font-mono text-slate-400 line-clamp-1 mb-2">
                    {item.reason}
                  </div>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-700">
                    <span className="text-xs font-mono text-white">Score: {item.score}/8</span>
                    <span className="text-[9px] font-mono text-slate-300 bg-slate-700 px-2 rounded">RR {item.rr}</span>
                  </div>
                </a>
              ))
            ) : (
              <div className="col-span-3 text-center py-6 text-sm text-slate-500 font-mono">
                Belum ada saham yang masuk radar breakout.
              </div>
            )}
          </div>
        </div>

        {/* === SECTION 2: SECTOR HEATMAP === */}
        <div className="bg-[#131c2e] border border-[#1e293b] rounded-xl p-5 shadow-1">
          <div className="flex items-center justify-between border-b border-[#1e293b] pb-3 mb-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-[#14b8a6]" />
              Sector Heatmap IDX
            </h3>
            <span className="text-[10px] font-mono text-gray-500">
              11 Sektor • Ukuran ~ Market Cap • Warna ~ % Perubahan Hari Ini
            </span>
          </div>

          {data?.sectorHeatmap ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {data.sectorHeatmap.map((sector: any) => (
                <HeatmapTile key={sector.sector} {...sector} maxMcap={maxMcap} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {[...Array(11)].map((_, i) => (
                <div key={i} className="bg-[#1e293b] rounded-lg h-24 animate-pulse" />
              ))}
            </div>
          )}
        </div>

        {/* === SECTION 3: MARKET BREADTH === */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Breadth Overview */}
          <div className="lg:col-span-2 bg-[#131c2e] border border-[#1e293b] rounded-xl p-5 shadow-1">
            <div className="flex items-center justify-between border-b border-[#1e293b] pb-3 mb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-[#14b8a6]" />
                Market Breadth
              </h3>
              <span className="text-[10px] font-mono text-gray-500">
                {data?.breadth?.total || 0} Saham Terpantau
              </span>
            </div>

            {data?.breadth ? (
              <div className="space-y-6">
                <BreadthBar {...data.breadth} />

                {/* Metrics Row */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-[#0f172a] border border-[#14b8a6]/20 rounded-lg p-4 text-center">
                    <div className="text-3xl font-extrabold text-[#14b8a6] font-mono">{data.breadth.advancing}</div>
                    <div className="text-[10px] font-mono text-gray-500 uppercase mt-1">Naik (Advance)</div>
                  </div>
                  <div className="bg-[#0f172a] border border-[#334155] rounded-lg p-4 text-center">
                    <div className="text-3xl font-extrabold text-gray-400 font-mono">{data.breadth.unchanged}</div>
                    <div className="text-[10px] font-mono text-gray-500 uppercase mt-1">Stagnan</div>
                  </div>
                  <div className="bg-[#0f172a] border border-red-500/20 rounded-lg p-4 text-center">
                    <div className="text-3xl font-extrabold text-red-400 font-mono">{data.breadth.declining}</div>
                    <div className="text-[10px] font-mono text-gray-500 uppercase mt-1">Turun (Decline)</div>
                  </div>
                </div>

                {/* A/D Ratio */}
                <div className="flex items-center gap-4 bg-[#0f172a] border border-[#1e293b] rounded-lg p-4">
                  <div className="flex-1">
                    <div className="text-[10px] font-mono text-gray-500 uppercase">Advance / Decline Ratio</div>
                    <div className={`text-2xl font-extrabold font-mono ${
                      data.breadth.advanceDeclineRatio >= 1 ? 'text-[#14b8a6]' : 'text-red-400'
                    }`}>
                      {data.breadth.advanceDeclineRatio}
                    </div>
                  </div>
                  <div className={`px-4 py-2 rounded-lg border text-sm font-bold font-mono ${
                    data.breadth.advanceDeclineRatio > 1.5
                      ? 'bg-[#14b8a6]/20 text-[#14b8a6] border-[#14b8a6]/30'
                      : data.breadth.advanceDeclineRatio >= 1
                      ? 'bg-blue-400/20 text-blue-400 border-blue-400/30'
                      : data.breadth.advanceDeclineRatio >= 0.7
                      ? 'bg-yellow-400/20 text-yellow-400 border-yellow-400/30'
                      : 'bg-red-500/20 text-red-400 border-red-500/30'
                  }`}>
                    {data.breadth.advanceDeclineRatio > 1.5 ? 'SANGAT BULLISH'
                      : data.breadth.advanceDeclineRatio >= 1 ? 'BULLISH'
                      : data.breadth.advanceDeclineRatio >= 0.7 ? 'NETRAL'
                      : 'BEARISH'}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-gray-500">
                <RefreshCw className="w-6 h-6 animate-spin text-[#14b8a6] mb-3" />
                <span className="text-sm font-mono">Memuat data breadth...</span>
              </div>
            )}
          </div>

          {/* Top Movers */}
          <div className="bg-[#131c2e] border border-[#1e293b] rounded-xl p-5 shadow-1">
            <h3 className="text-base font-bold text-white flex items-center gap-2 border-b border-[#1e293b] pb-3 mb-4">
              <Zap className="w-5 h-5 text-yellow-400" />
              Top Movers
            </h3>

            {data?.breadth ? (
              <div className="space-y-4">
                {/* Top Gainers */}
                <div>
                  <div className="text-[10px] font-mono text-[#14b8a6] uppercase mb-2 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" /> Top Gainers
                  </div>
                  <div className="space-y-1.5">
                    {data.breadth.topGainers?.map((s: any, i: number) => (
                      <div 
                        key={s.symbol} 
                        onClick={() => router.push(`/dashboard?symbol=${s.symbol}`)}
                        className="flex items-center justify-between bg-[#0f172a] rounded-lg px-3 py-2 border border-[#14b8a6]/10 cursor-pointer hover:bg-[#131c2e]"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-gray-600 w-4">{i + 1}</span>
                          <span className="text-sm font-bold text-white font-mono">{s.symbol}</span>
                        </div>
                        <span className="text-sm font-bold text-[#14b8a6] font-mono">+{s.changePct}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Top Losers */}
                <div>
                  <div className="text-[10px] font-mono text-red-400 uppercase mb-2 flex items-center gap-1">
                    <TrendingDown className="w-3 h-3" /> Top Losers
                  </div>
                  <div className="space-y-1.5">
                    {data.breadth.topLosers?.map((s: any, i: number) => (
                      <div
                        key={s.symbol}
                        onClick={() => router.push(`/dashboard?symbol=${s.symbol}`)}
                        className="flex items-center justify-between bg-[#0f172a] rounded-lg px-3 py-2 border border-red-500/10 cursor-pointer hover:bg-[#131c2e]"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-gray-600 w-4">{i + 1}</span>
                          <span className="text-sm font-bold text-white font-mono">{s.symbol}</span>
                        </div>
                        <span className="text-sm font-bold text-red-400 font-mono">{s.changePct}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Top Volume - datanya sudah dihitung backend (breadth.topVolume) tapi
                    sebelumnya tidak pernah ditampilkan di sini. */}
                <div>
                  <div className="text-[10px] font-mono text-blue-400 uppercase mb-2 flex items-center gap-1">
                    <BarChart3 className="w-3 h-3" /> Top Volume
                  </div>
                  <div className="space-y-1.5">
                    {data.breadth.topVolume?.map((s: any, i: number) => (
                      <div
                        key={s.symbol}
                        onClick={() => router.push(`/dashboard?symbol=${s.symbol}`)}
                        className="flex items-center justify-between bg-[#0f172a] rounded-lg px-3 py-2 border border-blue-500/10 cursor-pointer hover:bg-[#131c2e]"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-gray-600 w-4">{i + 1}</span>
                          <span className="text-sm font-bold text-white font-mono">{s.symbol}</span>
                        </div>
                        <span className="text-sm font-bold text-blue-400 font-mono">{Math.round((s.volume || 0) / 100).toLocaleString('id-ID')} lot</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Top Value - sama, sudah dihitung backend (breadth.topValue). */}
                <div>
                  <div className="text-[10px] font-mono text-amber-400 uppercase mb-2 flex items-center gap-1">
                    <Zap className="w-3 h-3" /> Top Value Transaksi
                  </div>
                  <div className="space-y-1.5">
                    {data.breadth.topValue?.map((s: any, i: number) => (
                      <div
                        key={s.symbol}
                        onClick={() => router.push(`/dashboard?symbol=${s.symbol}`)}
                        className="flex items-center justify-between bg-[#0f172a] rounded-lg px-3 py-2 border border-amber-500/10 cursor-pointer hover:bg-[#131c2e]"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-gray-600 w-4">{i + 1}</span>
                          <span className="text-sm font-bold text-white font-mono">{s.symbol}</span>
                        </div>
                        <span className="text-sm font-bold text-amber-400 font-mono">Rp {((s.value || 0) / 1e12).toFixed(2)} T</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-gray-500">
                <RefreshCw className="w-6 h-6 animate-spin text-[#14b8a6] mb-3" />
                <span className="text-sm font-mono">Memuat...</span>
              </div>
            )}
          </div>
        </div>
      </div>
      <PaywallModal
        open={showPaywall}
        onClose={() => setShowPaywall(false)}
        title="Limit Gratis Habis"
        body={`Kamu sudah pakai ${FREE_LIMITS.analisaPerHari}/${FREE_LIMITS.analisaPerHari} analisa hari ini${usedSymbolsToday.length ? ` (${usedSymbolsToday.slice(0, 3).map(displayTicker).join(', ')}${usedSymbolsToday.length > 3 ? ', dll' : ''})` : ''}. Upgrade Pro Rp 149k/bulan untuk unlimited 10 filters + Breakout Radar LIVE.`}
        benefits={[
          'Unlimited Technical Analyzer (10 filter)',
          'Breakout Radar LIVE',
          'Fundamental Analyzer + Watchlist unlimited',
        ]}
        waText="Halo, saya mau upgrade ke SahamLens Pro (Rp149.000/bulan) - kena limit analisa harian"
        ctaLabel="Upgrade Pro"
        secondaryLabel="Tunggu Besok"
      />
    </div>
  );
}
