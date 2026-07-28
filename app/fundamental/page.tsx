'use client';

import React, { useState, useEffect } from 'react';
import Header from '@/components/Header';
import TradingViewChart from '@/components/TradingViewChart';
import { 
  Zap, ArrowUpRight, ArrowDownRight, Layers,
  RefreshCw, Brain, AlertTriangle, ShieldCheck, TrendingUp
} from 'lucide-react';

export default function Dashboard() {
  const [ticker, setTicker] = useState('BBCA');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [marketClosed, setMarketClosed] = useState(false);
  const [scores, setScores] = useState<Record<string, { correct: number, wrong: number }>>({});
  const [sortByConfidence, setSortByConfidence] = useState(false);

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
      
      if (jsonAlgo.stock) {
        // Merge so we get chart history from jsonStock but analyzers from jsonAlgo
        jsonAlgo.stock.history = jsonStock?.stock?.history || [];
        setData(jsonAlgo);
        setLastUpdate(new Date());
        
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

  const handleRefresh = () => fetchAnalyzerData(ticker);

  useEffect(() => {
    setMarketClosed(!isMarketOpen());
    fetchAnalyzerData(ticker);

    const interval = setInterval(() => {
      const closed = !isMarketOpen();
      setMarketClosed(closed);
      if (!closed) {
        fetchAnalyzerData(ticker);
      }
    }, 60000); 

    return () => clearInterval(interval);
  }, [ticker]);

  const formatTime = (date: Date) => date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';

  const stock = data?.stock || {};
  const tech = data?.technical || {};
  const candles = data?.stock?.history || [];
  let analyzers = data?.analyzers || [];

  if (sortByConfidence) {
    analyzers = [...analyzers].sort((a, b) => b.confidence - a.confidence);
  }

  const getAccuracyPct = (algoName: string) => {
    const s = scores[algoName];
    if (!s || (s.correct === 0 && s.wrong === 0)) return 'N/A';
    return ((s.correct / (s.correct + s.wrong)) * 100).toFixed(0) + '%';
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

        {/* Disclaimer Banner */}
        <div className="bg-tv-yellow/10 border border-tv-yellow/50 text-tv-yellow px-4 py-3 rounded-lg flex items-center gap-3 text-sm">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <p><strong>Disclaimer:</strong> This dashboard uses purely mathematical and statistical indicators for <strong>educational purposes only</strong>. Not financial advice. No AI or LLMs are involved in these predictions.</p>
        </div>

        {/* Top Summary Banner */}
        <div className="bg-tv-card border border-tv-border rounded-xl p-5 shadow-lg flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-tv-yellow/10 border border-tv-yellow/30 flex items-center justify-center text-tv-yellow">
              <Zap className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-extrabold text-white font-mono">{stock.symbol || ticker}.JK</h1>
                <span className="text-sm text-tv-muted font-sans font-normal">{stock.name || 'Loading...'}</span>
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
              <div className="text-[10px] font-mono text-tv-muted uppercase">10-ALGO CONSENSUS</div>
              <div className={`text-xl font-extrabold font-mono px-4 py-1.5 rounded-lg border shadow-lg flex items-center gap-2 ${
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

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <TradingViewChart
              candles={candles}
              technical={tech}
              symbol={stock.symbol || ticker}
              height={600}
            />
          </div>

          <div className="space-y-6">
            {/* Algo Breakdown Table */}
            <div className="bg-tv-card border border-tv-border rounded-xl p-5 shadow-lg">
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

              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                {analyzers.length > 0 ? analyzers.map((algo: any, idx: number) => {
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
                      <div className="flex justify-between items-center text-[10px] pt-2 border-t border-tv-hover">
                        <span className="text-tv-muted">Hist. Accuracy (Local)</span>
                        <span className="font-bold text-tv-accent">{getAccuracyPct(algo.label)}</span>
                      </div>
                    </div>
                  );
                }) : (
                  <div className="text-center py-10 text-tv-muted text-sm flex flex-col items-center gap-2">
                    <RefreshCw className="w-6 h-6 animate-spin text-tv-borderLight" />
                    Running 10 TS Algorithms...
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <style dangerouslySetInnerHTML={{__html:`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #131722; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #2A2E39; border-radius: 4px; }
      `}} />
    </div>
  );
}

