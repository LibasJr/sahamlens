'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Activity, TrendingUp, TrendingDown, BarChart3,
  RefreshCw, ArrowUpRight, ArrowDownRight, Layers, Zap, Menu
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { hasProAccess, refreshAdminStatus, getUsedSymbolsToday, FREE_LIMITS } from '@/lib/limits';
import PaywallModal from '@/components/PaywallModal';
import { Badge } from '@/components/ui';

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
    ? `rgba(16, 185, 129, ${0.1 + intensity / 200})`
    : `rgba(239, 68, 68, ${0.1 + intensity / 200})`;
  const border = isUp
    ? `rgba(16, 185, 129, ${0.2 + intensity / 250})`
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
        <div className="text-xs font-bold text-tv-text truncate">{sector}</div>
        <div className={`text-lg font-extrabold font-number ${isUp ? 'text-tv-green' : 'text-tv-red'}`}>
          {isUp ? '+' : ''}{changePct.toFixed(2)}%
        </div>
      </div>
      <div className="flex flex-wrap gap-1 mt-1 opacity-70 group-hover:opacity-100 transition-opacity">
        {stocks?.slice(0, 4).map((s: any) => (
          <span
            key={s.symbol}
            className={`text-[9px] font-number font-semibold px-1 py-0.5 rounded text-white ${
              s.changePct >= 0 ? 'bg-tv-green/60' : 'bg-tv-red/60'
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
        <div className="bg-tv-green transition-all flex items-center justify-center" style={{ width: `${advPct}%` }}>
          {advPct > 10 && <span className="text-[9px] font-number font-bold text-white">{advancing}</span>}
        </div>
        <div className="bg-tv-muted transition-all flex items-center justify-center" style={{ width: `${uncPct}%` }}>
          {uncPct > 10 && <span className="text-[9px] font-number font-bold text-white">{unchanged}</span>}
        </div>
        <div className="bg-tv-red transition-all flex items-center justify-center" style={{ width: `${decPct}%` }}>
          {decPct > 10 && <span className="text-[9px] font-number font-bold text-white">{declining}</span>}
        </div>
      </div>
      <div className="flex justify-between text-[10px] font-number">
        <span className="text-tv-green">▲ Naik: {advancing} ({advPct.toFixed(0)}%)</span>
        <span className="text-tv-muted">— Stagnan: {unchanged}</span>
        <span className="text-tv-red">▼ Turun: {declining} ({decPct.toFixed(0)}%)</span>
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
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [usedSymbolsToday, setUsedSymbolsToday] = useState<string[]>([]);

  useEffect(() => {
    setIsClient(true);
    refreshAdminStatus().then(() => setPro(hasProAccess()));
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/market-pulse', { cache: 'no-store' });
      if (res.status === 401) {
        setShowLoginPrompt(true);
        return;
      }
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
    <div className="flex-1 flex flex-col bg-tv-bg min-h-screen">
      {/* Top Header */}
      <header className="bg-tv-surface border-b border-tv-border px-4 sm:px-6 py-3 sticky top-0 z-20 shadow-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => window.dispatchEvent(new Event('toggle-sidebar'))}
              className="md:hidden p-2 -ml-2 shrink-0 text-tv-muted hover:text-white rounded-lg hover:bg-white/5"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="p-2 rounded-md bg-tv-blue text-white shrink-0">
              <Activity className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-heading font-bold text-lg text-tv-text tracking-tight truncate">Ringkasan Pasar</h2>
              <p className="text-xs text-tv-muted truncate">IDX Algorithmic Suite — Real-time Market Overview</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 text-xs flex-wrap">
            {isClient && (
              pro ? (
                <Badge variant="success" dot>Realtime</Badge>
              ) : (
                <Badge variant="warning">Delay 15m - Realtime di Pro</Badge>
              )
            )}
            <div className="bg-tv-hover border border-tv-border px-3 py-1.5 rounded-full text-tv-muted whitespace-nowrap">
              Update: {isClient && lastUpdate ? formatTime(lastUpdate) : 'Loading...'}
            </div>
            <button
              onClick={fetchData}
              disabled={loading}
              className="bg-tv-hover border border-tv-border hover:bg-tv-borderLight px-3 py-1.5 rounded-full text-tv-text flex items-center gap-2 transition-colors disabled:opacity-50 whitespace-nowrap"
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
                className={`bg-tv-card border rounded-lg p-4 shadow-1 transition-all hover:shadow-2 ${
                  isUp ? 'border-tv-green/30' : 'border-tv-red/30'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-[10px] text-tv-muted uppercase font-semibold tracking-wide">{idx.fullName}</div>
                    <div className="text-lg font-extrabold text-tv-text font-number">{idx.name}</div>
                  </div>
                  <div className={`flex items-center gap-1 text-sm font-bold font-number ${isUp ? 'text-tv-green' : 'text-tv-red'}`}>
                    {isUp ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                    {isUp ? '+' : ''}{idx.changePct}%
                  </div>
                </div>
                <div className="flex items-end justify-between">
                  <div className="text-2xl font-extrabold text-tv-text font-number">
                    {idx.price?.toLocaleString('id-ID', { maximumFractionDigits: 0 })}
                  </div>
                  <Sparkline data={idx.sparkline} color={isUp ? '#10B981' : '#EF4444'} />
                </div>
              </div>
            );
          }) : (
            [1, 2, 3, 4].map(i => (
              <div key={i} className="bg-tv-card border border-tv-border rounded-lg p-4 shadow-1 animate-pulse">
                <div className="h-4 bg-tv-hover rounded w-20 mb-2" />
                <div className="h-6 bg-tv-hover rounded w-16 mb-3" />
                <div className="h-8 bg-tv-hover rounded w-full" />
              </div>
            ))
          )}
        </div>

        {/* === SECTION 1.5: BREAKOUT WIDGET === */}
        <div className="bg-tv-card border border-tv-blue/30 rounded-lg p-5 shadow-1 relative overflow-hidden">
          <div className="flex items-center justify-between border-b border-tv-border pb-3 mb-4">
            <div>
              <h3 className="font-heading text-base font-bold text-tv-text flex items-center gap-2">
                <Zap className="w-5 h-5 text-tv-blue" />
                Top 3 Breakout Hari Ini
                <Badge variant="danger" dot>Live</Badge>
              </h3>
            </div>
            <a href="/breakout-radar" className="text-xs text-tv-blue hover:text-tv-text flex items-center gap-1 transition-colors">
              Lihat Semua Radar &rarr;
            </a>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {loading ? (
              [1, 2, 3].map(i => (
                <div key={i} className="bg-tv-hover/50 border border-tv-border rounded-lg p-4 animate-pulse h-24" />
              ))
            ) : breakoutData.length > 0 ? (
              breakoutData.slice(0, 3).map((item, idx) => (
                <a key={item.symbol} href={`/?symbol=${item.symbol}`} className="bg-tv-hover/50 border border-tv-border hover:border-tv-blue/50 transition-colors rounded-lg p-4 group">
                  <div className="flex justify-between items-start mb-2">
                    <div className="font-bold text-tv-text font-number flex items-center gap-2">
                      <span className="text-xs text-tv-muted">#{idx + 1}</span> {item.symbol}
                    </div>
                    <div className="text-xs font-bold text-tv-blue font-number">{item.change}</div>
                  </div>
                  <div className="text-[10px] text-tv-muted line-clamp-1 mb-2">
                    {item.reason}
                  </div>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-tv-border">
                    <span className="text-xs text-tv-text font-number">Score: {item.score}/8</span>
                    <span className="text-[9px] text-tv-muted bg-tv-hover px-2 rounded font-number">RR {item.rr}</span>
                  </div>
                </a>
              ))
            ) : (
              <div className="col-span-3 text-center py-6 text-sm text-tv-muted">
                Belum ada saham yang masuk radar breakout.
              </div>
            )}
          </div>
        </div>

        {/* === SECTION 2: SECTOR HEATMAP === */}
        <div className="bg-tv-card border border-tv-border rounded-lg p-5 shadow-1">
          <div className="flex items-center justify-between border-b border-tv-border pb-3 mb-4">
            <h3 className="font-heading text-base font-bold text-tv-text flex items-center gap-2">
              <Layers className="w-5 h-5 text-tv-green" />
              Sector Heatmap IDX
            </h3>
            <span className="text-[10px] text-tv-muted">
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
                <div key={i} className="bg-tv-hover rounded-lg h-24 animate-pulse" />
              ))}
            </div>
          )}
        </div>

        {/* === SECTION 3: MARKET BREADTH === */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
          {/* Breadth Overview + Top Volume/Value - dikelompokkan di kolom kiri supaya
              tingginya seimbang dengan kartu Top Movers di sebelah kanan */}
          <div className="lg:col-span-2 space-y-4">
          <div className="bg-tv-card border border-tv-border rounded-lg p-5 shadow-1">
            <div className="flex items-center justify-between border-b border-tv-border pb-3 mb-4">
              <h3 className="font-heading text-base font-bold text-tv-text flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-tv-green" />
                Market Breadth
              </h3>
              <span className="text-[10px] text-tv-muted">
                {data?.breadth?.total || 0} Saham Terpantau
              </span>
            </div>

            {data?.breadth ? (
              <div className="space-y-6">
                <BreadthBar {...data.breadth} />

                {/* Metrics Row */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-tv-bg border border-tv-green/20 rounded-lg p-4 text-center">
                    <div className="text-3xl font-extrabold text-tv-green font-number">{data.breadth.advancing}</div>
                    <div className="text-[10px] text-tv-muted uppercase font-semibold tracking-wide mt-1">Naik (Advance)</div>
                  </div>
                  <div className="bg-tv-bg border border-tv-border rounded-lg p-4 text-center">
                    <div className="text-3xl font-extrabold text-tv-muted font-number">{data.breadth.unchanged}</div>
                    <div className="text-[10px] text-tv-muted uppercase font-semibold tracking-wide mt-1">Stagnan</div>
                  </div>
                  <div className="bg-tv-bg border border-tv-red/20 rounded-lg p-4 text-center">
                    <div className="text-3xl font-extrabold text-tv-red font-number">{data.breadth.declining}</div>
                    <div className="text-[10px] text-tv-muted uppercase font-semibold tracking-wide mt-1">Turun (Decline)</div>
                  </div>
                </div>

                {/* A/D Ratio */}
                <div className="flex items-center gap-4 bg-tv-bg border border-tv-border rounded-lg p-4">
                  <div className="flex-1">
                    <div className="text-[10px] text-tv-muted uppercase font-semibold tracking-wide">Advance / Decline Ratio</div>
                    <div className={`text-2xl font-extrabold font-number ${
                      data.breadth.advanceDeclineRatio >= 1 ? 'text-tv-green' : 'text-tv-red'
                    }`}>
                      {data.breadth.advanceDeclineRatio}
                    </div>
                  </div>
                  <div className={`px-4 py-2 rounded-lg border text-sm font-bold ${
                    data.breadth.advanceDeclineRatio > 1.5
                      ? 'bg-tv-green/20 text-tv-green border-tv-green/30'
                      : data.breadth.advanceDeclineRatio >= 1
                      ? 'bg-tv-blue/20 text-tv-blue border-tv-blue/30'
                      : data.breadth.advanceDeclineRatio >= 0.7
                      ? 'bg-tv-warning/20 text-tv-warning border-tv-warning/30'
                      : 'bg-tv-red/20 text-tv-red border-tv-red/30'
                  }`}>
                    {data.breadth.advanceDeclineRatio > 1.5 ? 'SANGAT BULLISH'
                      : data.breadth.advanceDeclineRatio >= 1 ? 'BULLISH'
                      : data.breadth.advanceDeclineRatio >= 0.7 ? 'NETRAL'
                      : 'BEARISH'}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-tv-muted">
                <RefreshCw className="w-6 h-6 animate-spin text-tv-green mb-3" />
                <span className="text-sm">Memuat data breadth...</span>
              </div>
            )}
          </div>

          {/* Top Volume & Top Value - dipindah ke sini (bawah Market Breadth) dari kartu
              Top Movers supaya tinggi kolom kiri/kanan lebih seimbang */}
          <div className="bg-tv-card border border-tv-border rounded-lg p-5 shadow-1">
            <h3 className="font-heading text-base font-bold text-tv-text flex items-center gap-2 border-b border-tv-border pb-3 mb-4">
              <BarChart3 className="w-5 h-5 text-tv-blue" />
              Top Volume & Value Transaksi
            </h3>

            {data?.breadth ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Top Volume */}
                <div>
                  <div className="text-[10px] text-tv-blue uppercase font-semibold tracking-wide mb-2 flex items-center gap-1">
                    <BarChart3 className="w-3 h-3" /> Top Volume
                  </div>
                  <div className="space-y-1.5">
                    {data.breadth.topVolume?.map((s: any, i: number) => (
                      <div
                        key={s.symbol}
                        onClick={() => router.push(`/dashboard?symbol=${s.symbol}`)}
                        className="flex items-center justify-between bg-tv-bg rounded-lg px-3 py-2 border border-tv-blue/10 cursor-pointer hover:bg-tv-hover transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-tv-muted w-4 font-number">{i + 1}</span>
                          <span className="text-sm font-bold text-tv-text font-number">{s.symbol}</span>
                        </div>
                        <span className="text-sm font-bold text-tv-blue font-number">{Math.round((s.volume || 0) / 100).toLocaleString('id-ID')} lot</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Top Value */}
                <div>
                  <div className="text-[10px] text-tv-warning uppercase font-semibold tracking-wide mb-2 flex items-center gap-1">
                    <Zap className="w-3 h-3" /> Top Value Transaksi
                  </div>
                  <div className="space-y-1.5">
                    {data.breadth.topValue?.map((s: any, i: number) => (
                      <div
                        key={s.symbol}
                        onClick={() => router.push(`/dashboard?symbol=${s.symbol}`)}
                        className="flex items-center justify-between bg-tv-bg rounded-lg px-3 py-2 border border-tv-warning/10 cursor-pointer hover:bg-tv-hover transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-tv-muted w-4 font-number">{i + 1}</span>
                          <span className="text-sm font-bold text-tv-text font-number">{s.symbol}</span>
                        </div>
                        <span className="text-sm font-bold text-tv-warning font-number">Rp {((s.value || 0) / 1e12).toFixed(2)} T</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-tv-muted">
                <RefreshCw className="w-6 h-6 animate-spin text-tv-green mb-3" />
                <span className="text-sm">Memuat...</span>
              </div>
            )}
          </div>
          </div>

          {/* Top Movers */}
          <div className="bg-tv-card border border-tv-border rounded-lg p-5 shadow-1">
            <h3 className="font-heading text-base font-bold text-tv-text flex items-center gap-2 border-b border-tv-border pb-3 mb-4">
              <Zap className="w-5 h-5 text-tv-yellow" />
              Top Movers
            </h3>

            {data?.breadth ? (
              <div className="space-y-4">
                {/* Top Gainers */}
                <div>
                  <div className="text-[10px] text-tv-green uppercase font-semibold tracking-wide mb-2 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" /> Top Gainers
                  </div>
                  <div className="space-y-1.5">
                    {data.breadth.topGainers?.map((s: any, i: number) => (
                      <div
                        key={s.symbol}
                        onClick={() => router.push(`/dashboard?symbol=${s.symbol}`)}
                        className="flex items-center justify-between bg-tv-bg rounded-lg px-3 py-2 border border-tv-green/10 cursor-pointer hover:bg-tv-hover transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-tv-muted w-4 font-number">{i + 1}</span>
                          <span className="text-sm font-bold text-tv-text font-number">{s.symbol}</span>
                        </div>
                        <span className="text-sm font-bold text-tv-green font-number">+{s.changePct}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Top Losers */}
                <div>
                  <div className="text-[10px] text-tv-red uppercase font-semibold tracking-wide mb-2 flex items-center gap-1">
                    <TrendingDown className="w-3 h-3" /> Top Losers
                  </div>
                  <div className="space-y-1.5">
                    {data.breadth.topLosers?.map((s: any, i: number) => (
                      <div
                        key={s.symbol}
                        onClick={() => router.push(`/dashboard?symbol=${s.symbol}`)}
                        className="flex items-center justify-between bg-tv-bg rounded-lg px-3 py-2 border border-tv-red/10 cursor-pointer hover:bg-tv-hover transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-tv-muted w-4 font-number">{i + 1}</span>
                          <span className="text-sm font-bold text-tv-text font-number">{s.symbol}</span>
                        </div>
                        <span className="text-sm font-bold text-tv-red font-number">{s.changePct}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-tv-muted">
                <RefreshCw className="w-6 h-6 animate-spin text-tv-green mb-3" />
                <span className="text-sm">Memuat...</span>
              </div>
            )}
          </div>
        </div>
      </div>
      <PaywallModal
        open={showPaywall}
        onClose={() => setShowPaywall(false)}
        title="Limit Gratis Habis"
        body={`Kamu sudah pakai ${FREE_LIMITS.analisaPerHari}/${FREE_LIMITS.analisaPerHari} analisa hari ini${usedSymbolsToday.length ? ` (${usedSymbolsToday.slice(0, 3).map(displayTicker).join(', ')}${usedSymbolsToday.length > 3 ? ', dll' : ''})` : ''}. Upgrade Pro Rp 99k/bulan untuk unlimited 10 filters + AI Pick LIVE.`}
        benefits={[
          'Unlimited Technical Analyzer (10 filter)',
          'AI Pick LIVE',
          'Fundamental Analyzer + Watchlist unlimited',
        ]}
        secondaryLabel="Tunggu Besok"
      />
      <PaywallModal
        open={showLoginPrompt}
        onClose={() => setShowLoginPrompt(false)}
        title="Daftar Dulu untuk Lihat Ringkasan Pasar"
        body="Ringkasan Pasar butuh akun (gratis) - daftar sekarang, dapat trial 7 hari akses penuh sebelum diminta upgrade."
        ctaHref="/signup"
        ctaLabel="Daftar Gratis"
        secondaryLabel="Nanti"
      />
    </div>
  );
}
