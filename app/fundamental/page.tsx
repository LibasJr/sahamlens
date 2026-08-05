'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Header from '@/components/Header';
import TradingViewChart from '@/components/TradingViewChart';
import IntrinsicValue from '@/components/IntrinsicValue';
import PaywallModal from '@/components/PaywallModal';
import { getUsedSymbolsToday, FREE_LIMITS } from '@/lib/limits';
import { isMarketOpen } from '@/lib/utils/market';
import {
  Zap, ArrowUpRight, ArrowDownRight, Layers,
  RefreshCw, Brain, AlertTriangle, ShieldCheck, TrendingUp
} from 'lucide-react';
import { PageContainer } from '@/components/ui';
import { fmtKali, fmtPersen, fmtTriliun } from '@/shared/format/fundamental-format';
import FundamentalExportCard from '@/components/export/FundamentalExportCard';
import ExportImageButton from '@/components/export/ExportImageButton';
import { buildExportFileName } from '@/shared/format/export-filename';

// Normalisasi simbol: pastikan hanya 1x .JK
const displayTicker = (s: string) => s.replace('.JK', '').replace('.JK', '');

// BUG FIX (2026-08-01): sama seperti /dcf - dulu tidak baca ?symbol= dari URL sama
// sekali, cuma localStorage. Ditambah prioritas URL param supaya link dari Technical
// Analyzer (yang sekarang mengirim ?symbol=<ticker aktif>) langsung akurat.
function FundamentalContent() {
  const searchParams = useSearchParams();
  const [ticker, setTickerState] = useState('BBCA');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [marketClosed, setMarketClosed] = useState(false);
  const [scores, setScores] = useState<Record<string, { correct: number, wrong: number }>>({});
  const [sortByConfidence, setSortByConfidence] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [usedSymbolsToday, setUsedSymbolsToday] = useState<string[]>([]);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const fundamentalExportRef = useRef<HTMLDivElement>(null);

  const setTicker = (newTicker: string) => {
    setTickerState(newTicker);
    if (typeof window !== 'undefined') {
      localStorage.setItem('last_searched_ticker', newTicker);
    }
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
      
      if (resStock.status === 401) {
        setShowLoginPrompt(true);
        return;
      }
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
  };

  useEffect(() => {
    setMounted(true);
    const urlSymbol = searchParams.get('symbol');
    if (urlSymbol) {
      // WAJIB pakai setTicker (bukan setTickerState) - sebelumnya dibuka via
      // link ?symbol= dari halaman lain (mis. dari Dashboard) menampilkan ticker
      // yang benar TAPI tidak ikut menulis localStorage, jadi DCF/halaman lain
      // yang membaca localStorage yang sama tidak pernah tahu emiten ini baru dilihat.
      setTicker(urlSymbol.toUpperCase());
      return;
    }
    const savedTicker = localStorage.getItem('last_searched_ticker');
    if (savedTicker && savedTicker !== ticker) {
      setTickerState(savedTicker);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mounted) return;
    setMarketClosed(!isMarketOpen(new Date()));
    fetchAnalyzerData(ticker);

    const interval = setInterval(() => {
      const closed = !isMarketOpen(new Date());
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
  // `tech` dihapus (audit 2026-08-05): variabel mati - /api/fundamental tidak pernah
  // mengembalikan field `technical`, dan halaman ini tidak merender chart sama sekali.
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
          moduleTitle="LensFundamental"
          moduleBank="LENSFUNDAMENTAL"
        />
        <div className="flex flex-col items-center justify-center p-20 text-slate-400">
          <TrendingUp className="w-12 h-12 mb-4 text-slate-600" />
          <p>Gagal memuat data. Limit analisa habis atau terjadi kesalahan.</p>
        </div>
        <PaywallModal
          open={showPaywall}
          onClose={() => setShowPaywall(false)}
          title="Limit Gratis Habis"
          body={`Kamu sudah pakai ${FREE_LIMITS.analisaPerHari}/${FREE_LIMITS.analisaPerHari} analisa hari ini${usedSymbolsToday.length ? ` (${usedSymbolsToday.slice(0, 3).map((s: string) => s.replace('.JK', '')).join(', ')}${usedSymbolsToday.length > 3 ? ', dll' : ''})` : ''}. Upgrade Pro Rp 99k/bulan untuk unlimited 10 filters + LensRadar LIVE.`}
          benefits={[
            'Unlimited LensTechnical (10 filter)',
            'LensRadar LIVE, LensAI & Compare Tool',
            'Watchlist & Alert unlimited',
          ]}
        />
        <PaywallModal
          open={showLoginPrompt}
          onClose={() => setShowLoginPrompt(false)}
          title="Daftar Dulu untuk Lihat Hasil"
          body="Analisa fundamental butuh akun (gratis) - daftar sekarang, dapat trial 7 hari akses penuh sebelum diminta upgrade."
          ctaHref="/signup"
          ctaLabel="Daftar Gratis"
          secondaryLabel="Nanti"
        />
      </div>
    );
  }

  if (sortByConfidence) {
    analyzers = [...analyzers].sort((a, b) => b.confidence - a.confidence);
  }

  // Akurasi real dari tracking lokal (localStorage, lihat trackAccuracy) - prediksi
  // BULLISH/BEARISH terakhir dicocokkan ke pergerakan harga kunjungan berikutnya.
  // Butuh minimal 20 sampel sebelum dianggap representatif; di bawah itu null
  // (bukan angka karangan) supaya UI bisa menampilkan "belum cukup data" apa adanya.
  //
  // BUG FIX (audit logika & algoritma 2026-08-05, temuan C-3): nilainya dulu di-clamp
  // ke rentang 45-95% - hit-rate riil 20% ditampilkan "45%". Clamp dihapus dan jumlah
  // sampel ikut dilaporkan, sama seperti app/dashboard/page.tsx.
  const getAccuracyPct = (algoName: string): string | null => {
    const score = scores[algoName];
    if (!score) return null;
    const total = score.correct + score.wrong;
    if (total < 20) return null;
    return `${Math.round((score.correct / total) * 100)}% (n=${total})`;
  };

  return (
    <div className="flex-1 flex flex-col bg-tv-bg min-h-screen">
      <Header
        currentTicker={ticker}
        onTickerChange={setTicker}
        moduleTitle="LensFundamental"
        moduleBank="LENSFUNDAMENTAL"
      />

      <PageContainer className="p-6 space-y-6">
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
          <ExportImageButton
            targetRef={fundamentalExportRef}
            fileName={buildExportFileName('Fundamental', ticker)}
            label="Export Kartu Fundamental"
            disabled={!data}
          />
        </div>

        {/* Kartu export offscreen - selalu di DOM (kalau data ada) supaya ExportImageButton
            punya node valid untuk di-screenshot, tapi tidak terlihat/tidak mengubah layout
            halaman (position absolute + geser jauh ke luar viewport). */}
        {data && (
          <div ref={fundamentalExportRef} style={{ position: 'absolute', left: -9999, top: 0 }}>
            <FundamentalExportCard
              ticker={ticker}
              stock={stock}
              fundamentals={data?.fundamentals || {}}
              profile={data?.profile || {}}
              consensus={data?.consensus}
              exportedAt={new Date()}
            />
          </div>
        )}

        {/* Top Summary Banner */}
        <div className="bg-tv-card border border-tv-border rounded-xl p-5 shadow-1 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-tv-yellow/10 border border-tv-yellow/30 flex items-center justify-center text-tv-yellow">
              <Zap className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-extrabold text-white font-heading">{displayTicker(stock.symbol || ticker)}.JK</h1>
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
              <div className="text-[10px] font-mono text-tv-muted uppercase">HASIL ANALISA LENSAI</div>
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
            <h3 className="text-xl font-extrabold text-white font-heading mb-4 border-b border-tv-border pb-3 flex items-center gap-2">
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
                  <span className="text-[10px] text-tv-muted uppercase">Market Cap</span>
                  <span className="font-number text-lg font-bold text-white">{fmtTriliun(data?.fundamentals?.marketCap)}</span>
                </div>
                <div className="bg-tv-bg border border-tv-border p-3 rounded-lg flex flex-col justify-between">
                  <span className="text-[10px] text-tv-muted uppercase">P/E Ratio (TTM)</span>
                  <span className="font-number text-lg font-bold text-white">{fmtKali(data?.fundamentals?.trailingPE)}</span>
                </div>
                <div className="bg-tv-bg border border-tv-border p-3 rounded-lg flex flex-col justify-between">
                  <span className="text-[10px] text-tv-muted uppercase">Price to Book (PBV)</span>
                  <span className="font-number text-lg font-bold text-white">{fmtKali(data?.fundamentals?.priceToBook)}</span>
                </div>
                <div className="bg-tv-bg border border-tv-border p-3 rounded-lg flex flex-col justify-between">
                  <span className="text-[10px] text-tv-muted uppercase">Return on Equity (ROE)</span>
                  <span className={`font-number text-lg font-bold ${
                    data?.fundamentals?.returnOnEquity == null ? 'text-tv-muted'
                      : data.fundamentals.returnOnEquity > 0 ? 'text-tv-green' : 'text-tv-red'
                  }`}>{fmtPersen(data?.fundamentals?.returnOnEquity)}</span>
                </div>
                {/* BUG 2 FIX: Sembunyikan DER & CR untuk bank, tampilkan rasio bank */}
                {!(data?.profile?.sector?.includes('Financial') || data?.profile?.industry?.includes('Bank')) ? (
                  <>
                    <div className="bg-tv-bg border border-tv-border p-3 rounded-lg flex flex-col justify-between">
                      <span className="text-[10px] text-tv-muted uppercase">Gross Margin</span>
                      <span className="font-number text-lg font-bold text-white">{fmtPersen(data?.fundamentals?.grossMargins)}</span>
                    </div>
                    <div className="bg-tv-bg border border-tv-border p-3 rounded-lg flex flex-col justify-between">
                      <span className="text-[10px] text-tv-muted uppercase">Pendapatan (Revenue)</span>
                      <span className="font-number text-lg font-bold text-white">{fmtTriliun(data?.fundamentals?.totalRevenue)}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="bg-tv-bg border border-tv-border p-3 rounded-lg flex flex-col justify-between">
                      <span className="text-[10px] text-tv-muted uppercase">NIM (Net Interest Margin)</span>
                      <span className="font-number text-lg font-bold text-tv-green">{fmtPersen(data?.fundamentals?.nim)}</span>
                    </div>
                    <div className="bg-tv-bg border border-tv-border p-3 rounded-lg flex flex-col justify-between">
                      <span className="text-[10px] text-tv-muted uppercase">Pendapatan (Revenue)</span>
                      <span className="font-number text-lg font-bold text-white">{fmtTriliun(data?.fundamentals?.totalRevenue)}</span>
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
                <h3 className="text-base font-bold text-white font-heading flex items-center gap-2">
                  <Layers className="w-5 h-5 text-tv-accent" />
                  LensTechnical
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
                    if (algo.label?.includes('Debt') || algo.label?.includes('Current Ratio') || algo.label?.includes('Quick Ratio')) return false;
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
                        {/* Lihat catatan label yang sama di components/AlgoFilters.tsx
                            (audit 2026-08-05, temuan C-3). */}
                        <span className="text-tv-muted block">Hit-rate tracking lokal</span>
                        <span className="font-bold text-tv-accent">{getAccuracyPct(algo.label) ?? 'Sampel belum cukup'}</span>
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
      </PageContainer>

      <PaywallModal
        open={showPaywall}
        onClose={() => setShowPaywall(false)}
        title="Limit Gratis Habis"
        body={`Kamu sudah pakai ${FREE_LIMITS.analisaPerHari}/${FREE_LIMITS.analisaPerHari} analisa hari ini${usedSymbolsToday.length ? ` (${usedSymbolsToday.slice(0, 3).map(displayTicker).join(', ')}${usedSymbolsToday.length > 3 ? ', dll' : ''})` : ''}. Upgrade Pro Rp 99k/bulan untuk unlimited 10 filters + LensRadar LIVE.`}
        benefits={[
          'Unlimited LensTechnical (10 filter)',
          'LensRadar LIVE, LensAI & Compare Tool',
          'Watchlist & Alert unlimited',
        ]}
        secondaryLabel="Tunggu Besok"
      />
      <PaywallModal
        open={showLoginPrompt}
        onClose={() => setShowLoginPrompt(false)}
        title="Daftar Dulu untuk Lihat Hasil"
        body="Analisa fundamental butuh akun (gratis) - daftar sekarang, dapat trial 7 hari akses penuh sebelum diminta upgrade."
        ctaHref="/signup"
        ctaLabel="Daftar Gratis"
        secondaryLabel="Nanti"
      />

      <style dangerouslySetInnerHTML={{__html:`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #131722; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #2A2E39; border-radius: 4px; }
      `}} />
    </div>
  );
}

export default function FundamentalPage() {
  return (
    <Suspense fallback={<div className="flex-1 bg-tv-bg min-h-screen" />}>
      <FundamentalContent />
    </Suspense>
  );
}

