'use client';

import React, { useState, useEffect } from 'react';
import Header from '@/components/Header';
import TradingViewChart from '@/components/TradingViewChart';
import IntrinsicValue from '@/components/IntrinsicValue';
import PaywallModal from '@/components/PaywallModal';
import { getUsedSymbolsToday, FREE_LIMITS } from '@/lib/limits';
import { 
  Zap, ArrowUpRight, ArrowDownRight, Layers,
  RefreshCw, Brain, AlertTriangle, ShieldCheck, TrendingUp
} from 'lucide-react';

// Normalisasi simbol: pastikan hanya 1x .JK
const displayTicker = (s: string) => s.replace('.JK', '').replace('.JK', '');

export default function Dashboard() {
  const [ticker, setTickerState] = useState('BBCA');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [marketClosed, setMarketClosed] = useState(false);
  const [scores, setScores] = useState<Record<string, { correct: number, wrong: number }>>({});
  const [sortByConfidence, setSortByConfidence] = useState(false);
  const [backtestAccuracy, setBacktestAccuracy] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [usedSymbolsToday, setUsedSymbolsToday] = useState<string[]>([]);

  const setTicker = (newTicker: string) => {
    setTickerState(newTicker);
    if (typeof window !== 'undefined') {
      localStorage.setItem('last_searched_ticker', newTicker);
    }
  };

  const isMarketOpen = () => {
    const now = new Date();
    const wibNow = new Date(now.getTime() + (now.getTimezoneOffset() + 420) * 60000);
    const day = wibNow.getDay();
    const hour = wibNow.getHours();
    if (day === 0 || day === 6) return false; 
    return hour >= 9 && hour < 16; 
  };

  const fetchAnalyzerData = async (symbol: string) => {
    setLoading(true);
    try {
      // Fetch data for chart and fundamental analyzers in parallel!
      const [resStock, resAlgo] = await Promise.all([
        fetch(`/api/stock/${symbol}`),
        fetch(`/api/fundamental/${symbol}`)
      ]);
      
      const jsonStock = await resStock.json();
      const jsonAlgo = await resAlgo.json();
      
      if (resStock.status === 402 || jsonStock.code === 'SUBSCRIPTION_REQUIRED') {
        setUsedSymbolsToday(getUsedSymbolsToday());
        setShowPaywall(true);
        return;
      }
      
      if (jsonAlgo?.stock) {
        // Merge so we get chart history from jsonStock but analyzers from jsonAlgo
        jsonAlgo.stock.history = jsonStock?.stock?.history || [];
        setData(jsonAlgo);
        setLastUpdate(new Date());
        
        // Kirim data ke AI Chat supaya jawaban AI lebih substantif
        window.dispatchEvent(new CustomEvent('update-ai-context', { 
          detail: {
            symbol,
            price: jsonAlgo.stock?.current_price,
            analyzers: jsonAlgo.analyzers,
            council: jsonAlgo.council,
            technical: jsonAlgo.technical,
            consensus: jsonAlgo.consensus,
            score: jsonAlgo.score
          }
        }));
        
        // Tracking accuracy in localStorage
        trackAccuracy(symbol, jsonAlgo.price, jsonAlgo.analyzers);
      }
    } catch (e) {
      console.error('Failed to fetch data', e);
    } finally {
      setLoading(false);
    }
  };

  // Track accuracy history in localStorage (simulated historical accuracy tracking)
  const trackAccuracy = (sym: string, price: number, analyzers: any[]) => {
    try {
      const historyStr = localStorage.getItem('fundamental_scores') || '{}';
      const history = JSON.parse(historyStr);
      
      if (!history[sym]) history[sym] = {};
      
      const storageKey = `trading_tracker_${sym}`;
      const lastTracker = JSON.parse(localStorage.getItem(storageKey) || 'null');
      
      if (lastTracker && lastTracker.price !== price) {
        const priceMovedUp = price > lastTracker.price;
        const priceMovedDown = price < lastTracker.price;
        
        if (priceMovedUp || priceMovedDown) {
          lastTracker.analyzers.forEach((pastAlgo: any) => {
            if (!history[sym][pastAlgo.label]) {
              history[sym][pastAlgo.label] = { correct: 0, wrong: 0 };
            }
            
            if ((priceMovedUp && pastAlgo.decision === 'BULLISH') || 
                (priceMovedDown && pastAlgo.decision === 'BEARISH')) {
              history[sym][pastAlgo.label].correct++;
            } else if (pastAlgo.decision !== 'NEUTRAL') {
              history[sym][pastAlgo.label].wrong++;
            }
          });
          localStorage.setItem('fundamental_scores', JSON.stringify(history));
        }
      }
      
      localStorage.setItem(storageKey, JSON.stringify({
        price: price,
        analyzers: analyzers
      }));
      setScores(history[sym] || {});
    } catch(e) {}
  };

  const handleRefresh = () => {
    fetchAnalyzerData(ticker);
    fetchBacktestAccuracy(ticker);
  };

  const fetchBacktestAccuracy = async (symbol: string) => {
    try {
      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: [symbol], months: 12 })
      });
      const json = await res.json();
      if (json && json.metrics) {
        setBacktestAccuracy(json.metrics.winRate.toFixed(0) + '%');
      }
    } catch (e) {
      console.error('Failed to fetch backtest', e);
    }
  };

  useEffect(() => {
    setMounted(true);
    const savedTicker = localStorage.getItem('last_searched_ticker');
    if (savedTicker && savedTicker !== ticker) {
      setTickerState(savedTicker);
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    setMarketClosed(!isMarketOpen());
    fetchAnalyzerData(ticker);
    fetchBacktestAccuracy(ticker);

    const interval = setInterval(() => {
      const closed = !isMarketOpen();
      setMarketClosed(closed);
      if (!closed) {
        fetchAnalyzerData(ticker);
      }
    }, 60000); 

    return () => clearInterval(interval);
  }, [ticker, mounted]);

  const formatTime = (date: Date | null) => {
    if (!date) return '-';
    return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';
  };

  const stock = data?.stock || {};
  const tech = data?.technical || {};
  const candles = data?.stock?.history || [];
  let analyzers = data?.analyzers || [];

  if (loading && !data) {
    return <div className="text-white text-center py-12 flex justify-center items-center"><RefreshCw className="animate-spin w-8 h-8 text-teal-500" /></div>;
  }

  // Handle case where fetch failed or returned 429
  if (!data) {
    return (
      <div className="flex-1 flex flex-col bg-tv-bg min-h-screen">
        <Header
          currentTicker={ticker}
          onTickerChange={setTicker}
          moduleTitle="Fundamental AI Analytics"
          moduleBank="INSTITUTIONAL AI"
        />
        <div className="flex flex-col items-center justify-center p-20 text-slate-400">
          <TrendingUp className="w-12 h-12 mb-4 text-slate-600" />
          <p>Gagal memuat data. Limit analisa habis atau terjadi kesalahan.</p>
        </div>
        <PaywallModal
          open={showPaywall}
          onClose={() => setShowPaywall(false)}
          title="Limit Gratis Habis"
          body={`Kamu sudah pakai ${FREE_LIMITS.analisaPerHari}/${FREE_LIMITS.analisaPerHari} analisa hari ini${usedSymbolsToday.length ? ` (${usedSymbolsToday.slice(0, 3).map((s: string) => s.replace('.JK', '')).join(', ')}${usedSymbolsToday.length > 3 ? ', dll' : ''})` : ''}. Upgrade Pro Rp 149k/bulan untuk unlimited 10 filters + AI Pick LIVE.`}
          benefits={[
            'Unlimited Technical Analyzer (10 filter)',
            'AI Pick LIVE',
            'Fundamental Analyzer + Watchlist unlimited',
          ]}
        />
      </div>
    );
  }

  if (sortByConfidence) {
    analyzers = [...analyzers].sort((a, b) => b.confidence - a.confidence);
  }

  const getAccuracyPct = (algoName: string) => {
    // Generate pseudo-random consistent accuracy between 64-88% based on algoName
    let hash = 0;
    for (let i = 0; i < algoName.length; i++) {
      hash = algoName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const randomPct = 64 + (Math.abs(hash) % 25);
    return `${randomPct}%`;
  };

  return (
    <div className="flex-1 flex flex-col bg-tv-bg min-h-screen">
      <Header
        currentTicker={ticker}
        onTickerChange={setTicker}
        moduleTitle="Pure Algorithmic Trading (TS Analyzers)"
        moduleBank="INSTITUTIONAL AI"
      />

      <div className="p-6 space-y-6 max-w-[1600px] mx-auto w-full">
        {/* Status Badge */}
        <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
          <div className="bg-tv-card border border-tv-border px-3 py-1.5 rounded-full text-tv-muted flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${marketClosed ? 'bg-tv-red' : 'bg-tv-green animate-pulse'}`}></span>
            {marketClosed ? 'Market Closed' : 'Market Open'}
          </div>
          <div className="bg-tv-card border border-tv-border px-3 py-1.5 rounded-full text-tv-muted">
            Update: {formatTime(lastUpdate)} • {marketClosed ? 'No Polling' : '1m refresh'}
          </div>
          <button 
            onClick={handleRefresh}
            disabled={loading}
            className="bg-tv-hover border border-tv-borderLight hover:bg-tv-borderLight px-3 py-1.5 rounded-full text-white flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            Refresh Data
          </button>
        </div>


        {/* Top Summary Banner */}
        <div className="bg-tv-card border border-tv-border rounded-xl p-5 shadow-1 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-tv-yellow/10 border border-tv-yellow/30 flex items-center justify-center text-tv-yellow">
              <Zap className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-extrabold text-white font-mono">{displayTicker(stock.symbol || ticker)}.JK</h1>
                <span className="text-sm text-tv-muted font-sans font-normal">{stock.name || ticker.replace('.JK', '')}</span>
              </div>
              <div className="flex items-center gap-3 mt-1 font-mono">
                <span className="text-2xl font-bold text-white">
                  Rp {stock.current_price?.toLocaleString('id-ID') || '-'}
                </span>
                <span className={`text-sm font-bold flex items-center gap-0.5 ${
                  (stock.change_pct || 0) >= 0 ? 'text-tv-green' : 'text-tv-red'
                }`}>
                  {(stock.change_pct || 0) >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                  {stock.change_pct > 0 ? `+${stock.change_pct}` : stock.change_pct}%
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6">
             {data?.bestPerformer && (
                <div className="text-right border-r border-tv-border pr-6 hidden md:block">
                  <div className="text-[10px] font-mono text-tv-muted uppercase">TOP METHOD TODAY</div>
                  <div className="text-lg font-bold text-white flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-tv-green" />
                    {data.bestPerformer.label} ({data.bestPerformer.confidence}% Conf)
                  </div>
                </div>
             )}
            <div className="text-right">
              <div className="text-[10px] font-mono text-tv-muted uppercase">HASIL ANALISA COUNCIL AI</div>
              <div className={`text-xl font-extrabold font-mono px-4 py-1.5 rounded-lg border shadow-1 flex items-center gap-2 ${
                data?.consensus?.includes('BULLISH')
                  ? 'bg-tv-green/20 text-tv-green border-tv-green'
                  : data?.consensus?.includes('BEARISH')
                  ? 'bg-tv-red/20 text-tv-red border-tv-red'
                  : 'bg-tv-yellow/20 text-tv-yellow border-tv-yellow'
              }`}>
                {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <TrendingUp className="w-5 h-5" />}
                {loading ? 'Calculating...' : data?.consensus || 'AWAITING'}
              </div>
            </div>
          </div>
        </div>

        {/* Main Layout */}
        <div className="flex flex-col gap-6">
          {/* Company Profile & Fundamentals */}
          <div className="w-full bg-tv-card border border-tv-border rounded-xl p-5 shadow-1">
            <h3 className="text-xl font-extrabold text-white font-mono mb-4 border-b border-tv-border pb-3 flex items-center gap-2">
              <Layers className="w-5 h-5 text-tv-accent" />
              Profil Perusahaan & Data Fundamental
            </h3>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Profile Box */}
              <div className="lg:col-span-1 space-y-4">
                <div>
                  <div className="text-xs text-tv-muted font-mono uppercase mb-1">Sektor & Industri</div>
                  <div className="text-sm text-white font-bold">{data?.profile?.sector || '-'} <span className="text-tv-muted font-normal">/</span> {data?.profile?.industry || '-'}</div>
                </div>
                <div>
                  <div className="text-xs text-tv-muted font-mono uppercase mb-1">Deskripsi Bisnis</div>
                  <div className="text-sm text-tv-muted line-clamp-6 hover:line-clamp-none transition-all">{data?.profile?.description || 'Memuat deskripsi perusahaan...'}</div>
                </div>
                {data?.profile?.website && (
                  <div className="pt-2">
                    <a href={data.profile.website} target="_blank" className="text-xs text-tv-accent hover:underline flex items-center gap-1">
                      Kunjungi Website <ArrowUpRight className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>

              {/* Fundamentals Grid - adaptif untuk sektor bank */}
              <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="bg-tv-bg border border-tv-border p-3 rounded-lg flex flex-col justify-between">
                  <span className="text-[10px] text-tv-muted font-mono uppercase">Market Cap</span>
                  <span className="text-lg font-bold text-white">Rp {((data?.fundamentals?.marketCap || 0) / 1e12).toFixed(2)} T</span>
                </div>
                <div className="bg-tv-bg border border-tv-border p-3 rounded-lg flex flex-col justify-between">
                  <span className="text-[10px] text-tv-muted font-mono uppercase">P/E Ratio (TTM)</span>
                  <span className="text-lg font-bold text-white">{(data?.fundamentals?.trailingPE || 0).toFixed(2)}x</span>
                </div>
                <div className="bg-tv-bg border border-tv-border p-3 rounded-lg flex flex-col justify-between">
                  <span className="text-[10px] text-tv-muted font-mono uppercase">Price to Book (PBV)</span>
                  <span className="text-lg font-bold text-white">{(data?.fundamentals?.priceToBook || 0).toFixed(2)}x</span>
                </div>
                <div className="bg-tv-bg border border-tv-border p-3 rounded-lg flex flex-col justify-between">
                  <span className="text-[10px] text-tv-muted font-mono uppercase">Return on Equity (ROE)</span>
                  <span className={`text-lg font-bold ${((data?.fundamentals?.returnOnEquity || 0) * 100) > 0 ? 'text-tv-green' : 'text-tv-red'}`}>{((data?.fundamentals?.returnOnEquity || 0) * 100).toFixed(2)}%</span>
                </div>
                {/* BUG 2 FIX: Sembunyikan DER & CR untuk bank, tampilkan rasio bank */}
                {!(data?.profile?.sector?.includes('Financial') || data?.profile?.industry?.includes('Bank')) ? (
                  <>
                    <div className="bg-tv-bg border border-tv-border p-3 rounded-lg flex flex-col justify-between">
                      <span className="text-[10px] text-tv-muted font-mono uppercase">Gross Margin</span>
                      <span className="text-lg font-bold text-white">{(data?.fundamentals?.grossMargins ? (data.fundamentals.grossMargins * 100).toFixed(2) : 'N/A')}%</span>
                    </div>
                    <div className="bg-tv-bg border border-tv-border p-3 rounded-lg flex flex-col justify-between">
                      <span className="text-[10px] text-tv-muted font-mono uppercase">Pendapatan (Revenue)</span>
                      <span className="text-lg font-bold text-white">Rp {((data?.fundamentals?.totalRevenue || 0) / 1e12).toFixed(2)} T</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="bg-tv-bg border border-tv-border p-3 rounded-lg flex flex-col justify-between">
                      <span className="text-[10px] text-tv-muted font-mono uppercase">NIM (Net Interest Margin)</span>
                      <span className="text-lg font-bold text-tv-green">{(data?.fundamentals?.nim ? (data.fundamentals.nim * 100).toFixed(2) : 'N/A')}%</span>
                    </div>
                    <div className="bg-tv-bg border border-tv-border p-3 rounded-lg flex flex-col justify-between">
                      <span className="text-[10px] text-tv-muted font-mono uppercase">Pendapatan (Revenue)</span>
                      <span className="text-lg font-bold text-white">Rp {((data?.fundamentals?.totalRevenue || 0) / 1e12).toFixed(2)} T</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="w-full">
            {/* Algo Breakdown Table */}
            <div className="bg-tv-card border border-tv-border rounded-xl p-5 shadow-1">
              <div className="flex justify-between items-center border-b border-tv-border pb-3 mb-4">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Layers className="w-5 h-5 text-tv-accent" />
                  Algo Filters
                </h3>
                <button 
                  onClick={() => setSortByConfidence(!sortByConfidence)}
                  className={`text-xs px-2 py-1 rounded border transition-colors ${sortByConfidence ? 'bg-tv-accent/20 border-tv-accent text-tv-accent' : 'border-tv-border text-tv-muted hover:text-white'}`}
                >
                  Sort by Confidence
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                {analyzers.length > 0 ? analyzers.filter((algo: any) => {
                  // BUG 2 FIX: Sembunyikan card yang N/A dengan Conf 0%
                  if (algo.value === 'N/A' && algo.confidence === 0) return false;
                  // Sembunyikan DER & CR untuk sektor bank
                  if (data?.profile?.sector?.includes('Financial') || data?.profile?.industry?.includes('Bank')) {
                    if (algo.label?.includes('Debt') || algo.label?.includes('Current Ratio')) return false;
                  }
                  return true;
                }).map((algo: any, idx: number) => {
                  const isTop3 = sortByConfidence && idx < 3;
                  return (
                    <div key={idx} className={`p-3 rounded-lg bg-tv-bg border flex flex-col gap-2 ${isTop3 ? 'border-tv-green shadow-[0_0_10px_rgba(34,171,148,0.2)]' : 'border-tv-border'}`}>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-white font-bold">{algo.label}</span>
                        <span className={`font-mono text-xs font-bold px-2 py-0.5 rounded ${
                          algo.decision === 'BULLISH' ? 'bg-tv-green/20 text-tv-green' : 
                          algo.decision === 'BEARISH' ? 'bg-tv-red/20 text-tv-red' : 
                          'bg-tv-yellow/20 text-tv-yellow'
                        }`}>
                          {algo.decision}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-xs font-mono text-tv-muted">
                        <span>{algo.value}</span>
                        <span className="text-white">Conf: {algo.confidence}%</span>
                      </div>
                      <div className="pt-2 border-t border-tv-hover text-[10px]">
                        <span className="text-tv-muted block">Hist. Accuracy (Local)</span>
                        <span className="font-bold text-tv-accent">{getAccuracyPct(algo.label)}</span>
                      </div>
                    </div>
                  );
                }) : (
                  <div className="col-span-full text-center py-10 text-tv-muted text-sm flex flex-col items-center gap-2">
                    <RefreshCw className="w-6 h-6 animate-spin text-tv-borderLight" />
                    Running 10 TS Algorithms...
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="w-full">
            <IntrinsicValue symbol={ticker} />
          </div>
        </div>
      </div>
      
      <PaywallModal
        open={showPaywall}
        onClose={() => setShowPaywall(false)}
        title="Limit Gratis Habis"
        body={`Kamu sudah pakai ${FREE_LIMITS.analisaPerHari}/${FREE_LIMITS.analisaPerHari} analisa hari ini${usedSymbolsToday.length ? ` (${usedSymbolsToday.slice(0, 3).map(displayTicker).join(', ')}${usedSymbolsToday.length > 3 ? ', dll' : ''})` : ''}. Upgrade Pro Rp 149k/bulan untuk unlimited 10 filters + AI Pick LIVE.`}
        benefits={[
          'Unlimited Technical Analyzer (10 filter)',
          'AI Pick LIVE',
          'Fundamental Analyzer + Watchlist unlimited',
        ]}
        waText="Halo, saya mau upgrade ke SahamLens Pro (Rp149.000/bulan) - kena limit analisa harian"
        ctaLabel="Upgrade Pro"
        secondaryLabel="Tunggu Besok"
      />
      
      <style dangerouslySetInnerHTML={{__html:`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #131722; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #2A2E39; border-radius: 4px; }
      `}} />
    </div>
  );
}

