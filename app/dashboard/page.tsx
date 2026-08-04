'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/Header';
import TradingViewChart from '@/components/TradingViewChart';
import BandarFlowPro from '@/components/BandarFlowPro';
import RiskRewardCalculator from '@/components/RiskRewardCalculator';
import AlgoFilters from '@/components/AlgoFilters';
import PaywallModal from '@/components/PaywallModal';
import StockNewsModal from '@/components/StockNewsModal';
import { AnimatedNumber, SegmentedControl, Input, Select, Skeleton, EmptyState } from '@/components/ui';
import { refreshAdminStatus, grantProFromLink, FREE_LIMITS } from '@/lib/limits';
import { momentumScore, riskScore } from '@/lib/utils/lens-score-breakdown';
import {
  Zap, ArrowUpRight, ArrowDownRight,
  RefreshCw, Users, AlertTriangle, ShieldCheck, TrendingUp, Activity, Download, FileText, Target,
  Sparkles, Calculator, Newspaper, ChevronRight, Radar
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// Normalisasi simbol: pastikan hanya 1x .JK
const normTicker = (s: string) => s.replace('.JK', '').replace('.JK', '') + '.JK';
const displayTicker = (s: string) => s.replace('.JK', '').replace('.JK', '');

// BUG 3 FIX: MA Status Badge
const getMAStatus = (price: number, ma50: number, ma200: number) => {
  if (!price || !ma50 || !ma200) return { label: 'N/A', color: 'text-tv-muted', bg: 'bg-tv-hover' };
  if (price > ma50 && ma50 > ma200) return { label: 'GOLDEN TREND - Uptrend Kuat', color: 'text-tv-green', bg: 'bg-tv-green/15 border-tv-green/30' };
  if (price > ma50 && price < ma200) return { label: 'REBOUND LEMAH - Di bawah MA200', color: 'text-tv-yellow', bg: 'bg-tv-yellow/15 border-tv-yellow/30' };
  if (price > ma200 && price < ma50) return { label: 'KOREKSI - Di bawah MA50', color: 'text-tv-yellow', bg: 'bg-tv-yellow/15 border-tv-yellow/30' };
  if (price < ma50 && price < ma200) return { label: 'DOWNTREND - Di bawah MA50 & MA200', color: 'text-tv-red', bg: 'bg-tv-red/15 border-tv-red/30' };
  return { label: 'SIDEWAYS', color: 'text-tv-muted', bg: 'bg-tv-hover' };
};

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [ticker, setTickerState] = useState('DGWG.JK');
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [data, setData] = useState<any>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [marketClosed, setMarketClosed] = useState(false);
  const [scores, setScores] = useState<Record<string, { correct: number, wrong: number }>>({});
  const [sortByConfidence, setSortByConfidence] = useState(true);

  // Timeframe chart terpisah dari /api/stock (yang selalu histori 1 tahun untuk
  // kebutuhan 10 analyzer/scoring) - sama seperti dashboard publik & halaman
  // teknikal, chart di sini pakai /api/public-chart yang mendukung parameter tf.
  const [timeframe, setTimeframe] = useState('1Y');
  const [chartCandles, setChartCandles] = useState<any[]>([]);
  const [radarRank, setRadarRank] = useState<{ finalScore: number; topReasons?: string[] } | null>(null);

  // Berita spesifik emiten yang sedang dilihat - BUKAN berita pasar umum (itu ada di
  // Beranda). Difilter dari RSS yang sama berdasarkan penyebutan ticker/nama perusahaan.
  const [stockNews, setStockNews] = useState<any[]>([]);
  const [loadingStockNews, setLoadingStockNews] = useState(true);
  // Judul beritanya dulu tidak pernah ditampilkan di mana pun - stockNews cuma dipakai
  // menghitung angka di kartu Sentimen. Modal ini menampilkan data yang memang sudah ada.
  const [newsModalOpen, setNewsModalOpen] = useState(false);
  
  // AI Explain Modal State
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiModalData, setAiModalData] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Virtual Trading Modal State
  const [tradeModalOpen, setTradeModalOpen] = useState(false);
  const [tradeType, setTradeType] = useState<'BUY' | 'SELL'>('BUY');
  const [tradeLots, setTradeLots] = useState('10');
  const [tradeNote, setTradeNote] = useState('Algo Signal');
  const [tradeLoading, setTradeLoading] = useState(false);
  const [portfolioData, setPortfolioData] = useState<any>(null);

  // Free-tier "analisa per hari" limit
  const [analisaRemaining, setAnalisaRemaining] = useState<number>(FREE_LIMITS.analisaPerHari);
  const [showPaywall, setShowPaywall] = useState(false);
  // ATURAN BARU (2026-08-01) - halaman ini sekarang bisa dibuka tanpa login (lihat
  // middleware.ts), tapi /api/stock/[ticker] tetap wajib login. State terpisah dari
  // showPaywall (itu utk trial/Pro habis) supaya pesannya jelas beda: ajakan DAFTAR,
  // bukan upgrade Pro (user belum tentu punya akun sama sekali).
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [usedSymbolsToday, setUsedSymbolsToday] = useState<string[]>([]);
  const [adminReady, setAdminReady] = useState(false);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [isTrialExpired, setIsTrialExpired] = useState(false);

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
    setFetchError(false);
    try {
      // Fetch new TS analyzers (which now also returns stock history)
      const resAlgo = await fetch(`/api/stock/${symbol}`, { cache: 'no-store' });
      const jsonAlgo = await resAlgo.json();

      if (resAlgo.status === 401) {
        setShowLoginPrompt(true);
        return;
      }
      if (resAlgo.status === 402 || jsonAlgo.code === 'SUBSCRIPTION_REQUIRED') {
        setAnalisaRemaining(0);
        setUsedSymbolsToday(jsonAlgo.usedSymbols || []);
        setShowPaywall(true);
        return;
      }
      if (!resAlgo.ok || !jsonAlgo?.stock) {
        setFetchError(true);
        return;
      }

      if (jsonAlgo?.stock) {
        setData(jsonAlgo);
        setLastUpdate(new Date());
        // LensRadar rank badge - best-effort, tidak menghalangi render utama kalau gagal
        // atau ticker ini memang tidak ada di daftar ranking hari ini (lihat spec section C).
        fetch('/api/ai-pick', { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => {
            const match = (d?.items || []).find((it: any) => it.symbol.replace('.JK', '') === symbol.replace('.JK', ''));
            setRadarRank(match ? { finalScore: match.finalScore, topReasons: match.topReasons } : null);
          })
          .catch(() => setRadarRank(null));
        if (jsonAlgo._quota) {
          setAnalisaRemaining(jsonAlgo._quota.remaining);
          setUsedSymbolsToday(jsonAlgo._quota.usedSymbols || []);
        } else {
          // Tidak ada _quota di response = Pro/internal (lihat withQuotaInfo di
          // route) - Infinity supaya badge limit di Header disembunyikan
          // (Number.isFinite check), bukan nyangkut di angka lama.
          setAnalisaRemaining(Infinity);
        }
        
        // Kirim data 10 Agent Council ke AI Chat supaya jawaban AI lebih substantif
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
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  };

  const trackAccuracy = (symbol: string, currentPrice: number, currentAnalyzers: any[]) => {
    const storageKey = `trading_tracker_${symbol}`;
    const scoreKey = `trading_scores`;
    
    // Load global scores
    let globalScores = JSON.parse(localStorage.getItem(scoreKey) || '{}');
    
    // Load last prediction
    const lastTracker = JSON.parse(localStorage.getItem(storageKey) || 'null');
    
    if (lastTracker && lastTracker.price !== currentPrice) {
      const priceMovedUp = currentPrice > lastTracker.price;
      const priceMovedDown = currentPrice < lastTracker.price;
      
      if (priceMovedUp || priceMovedDown) {
        lastTracker.analyzers.forEach((pastAlgo: any) => {
          if (!globalScores[pastAlgo.label]) {
            globalScores[pastAlgo.label] = { correct: 0, wrong: 0 };
          }
          
          if ((priceMovedUp && pastAlgo.decision === 'BULLISH') || 
              (priceMovedDown && pastAlgo.decision === 'BEARISH')) {
            globalScores[pastAlgo.label].correct++;
          } else if (pastAlgo.decision !== 'NEUTRAL') {
            globalScores[pastAlgo.label].wrong++;
          }
        });
        localStorage.setItem(scoreKey, JSON.stringify(globalScores));
      }
    }
    
    // Save current state for next comparison
    localStorage.setItem(storageKey, JSON.stringify({
      price: currentPrice,
      analyzers: currentAnalyzers
    }));
    
    setScores(globalScores);
  };

  const handleRefresh = () => fetchAnalyzerData(ticker);

  useEffect(() => {
    setMounted(true);

    // Link "Grant Pro" yang di-generate admin di /admin - lihat lib/limits.ts grantProFromLink().
    if (searchParams.get('grantPro') === '1') {
      grantProFromLink();
    }

    refreshAdminStatus().then((admin) => {
      setIsAdminUser(admin);
      setAdminReady(true);
    });

    // Check 7-day trial status and Admin status from JWT
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(d => {
        if (d.authenticated && d.user) {
          if (d.user.role === 'admin' || d.user.role === 'pro') {
            setIsAdminUser(true);
            setAdminReady(true);
          } else if (d.user.trial_ends_at) {
            const trialEnd = new Date(d.user.trial_ends_at).getTime();
            if (Date.now() > trialEnd) {
              setIsTrialExpired(true);
              setShowPaywall(true);
              setAdminReady(true);
            } else {
              // Valid trial, grant infinite access on UI too (hide 5/5 counter)
              setIsAdminUser(true); 
              setAdminReady(true);
            }
          } else {
            setAdminReady(true);
          }
        }
      })
      .catch(e => console.error(e));

    const urlSymbol = searchParams.get('symbol');
    if (urlSymbol) {
      setTicker(urlSymbol.toUpperCase());
    } else {
      const savedTicker = localStorage.getItem('last_searched_ticker');
      if (savedTicker && savedTicker !== ticker) {
        setTickerState(savedTicker);
      }
    }
    
    // Check if coming from portfolio SELL action
    if (searchParams.get('action') === 'sell') {
       setTradeType('SELL');
       setTradeModalOpen(true);
    }

    // Fetch portfolio for cash balance
    fetch('/api/portfolio')
      .then(res => res.json())
      .then(d => setPortfolioData(d))
      .catch(e => console.error(e));
  }, [searchParams]);

  useEffect(() => {
    // Tunggu refreshAdminStatus() selesai dulu - supaya admin tidak sempat kehitung
    // sebagai pemakaian free-tier biasa sebelum cache admin ke-update (lihat lib/limits.ts).
    if (!mounted || !adminReady) return;

    // Kuota "analisa/hari" free-tier sekarang ditegakkan & dihitung di server
    // (app/api/stock/[ticker]/route.ts, lihat shared/usage/daily-analisa-quota.ts) -
    // dulu incrementAnalisa() di sini cuma stub client (selalu allowed, remaining
    // statis), state analisaRemaining/usedSymbolsToday di-update dari response asli
    // di fetchAnalyzerData (field _quota saat sukses, usedSymbols saat 402).
    setMarketClosed(!isMarketOpen());
    fetchAnalyzerData(ticker);

    const interval = setInterval(() => {
      const closed = !isMarketOpen();
      setMarketClosed(closed);
      if (!closed) {
        fetchAnalyzerData(ticker);
      }
    }, 60000);

    // Load initial scores
    setScores(JSON.parse(localStorage.getItem('trading_scores') || '{}'));

    return () => clearInterval(interval);
  }, [ticker, mounted, adminReady]);

  useEffect(() => {
    if (!mounted) return;
    const code = ticker.replace('.JK', '');
    fetch(`/api/public-chart/${code}?tf=${timeframe}`)
      .then((r) => r.json())
      .then((d) => { if (d?.history?.length > 0) setChartCandles(d.history); })
      .catch(() => {});
  }, [ticker, timeframe, mounted]);

  useEffect(() => {
    if (!mounted || !data?.stock?.symbol) return;
    setLoadingStockNews(true);
    const code = ticker.replace('.JK', '');
    const name = data.stock.name || '';
    fetch(`/api/news/stock/${code}?name=${encodeURIComponent(name)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setStockNews(d?.items || []))
      .catch(() => {})
      .finally(() => setLoadingStockNews(false));
  }, [ticker, mounted, data?.stock?.symbol]);

  const downloadTechnicalPDF = async () => {
    if (!data?.scoring) return;
    
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`${displayTicker(stock.symbol || ticker)} Technical Report - Score ${data.scoring.total_score} ${data.scoring.kategori}`, 14, 20);
    
    let finalY = 30;
    
    // Screenshot chart 
    const chartEl = document.querySelector('.tv-lightweight-charts');
    if (chartEl) {
      try {
        const html2canvas = (await import('html2canvas')).default;
        const canvas = await html2canvas(chartEl as HTMLElement, { scale: 1.5, useCORS: true, backgroundColor: '#0F141D' });
        const imgData = canvas.toDataURL('image/png');
        const imgHeight = (canvas.height * 180) / canvas.width;
        doc.addImage(imgData, 'PNG', 14, 30, 180, imgHeight);
        finalY = 30 + imgHeight + 10;
      } catch (err) {
        console.error("Screenshot error", err);
      }
    }
    
    doc.setFontSize(12);
    doc.text('Technical Indicators', 14, finalY);
    
    const tableData = data.analyzers.map((a: any) => [
      a.label,
      a.value,
      a.decision,
      `${a.confidence}%`
    ]);
    
    autoTable(doc, {
      startY: finalY + 5,
      head: [['Filter', 'Value', 'Signal', 'Confidence']],
      body: tableData
    });

    finalY = (doc as any).lastAutoTable?.finalY || finalY + 30;
    
    doc.setFontSize(11);
    doc.text(`Rekomendasi: ${data.scoring.kategori} dengan skor ${data.scoring.total_score}/100`, 14, finalY + 15);
    doc.text(`Harga di bawah/atas indikator MA konfirmasi trend saat ini.`, 14, finalY + 22);
    
    doc.setFontSize(9);
    doc.text('Disclaimer: Laporan ini di-generate secara otomatis oleh AI. Bukan ajakan beli/jual.', 14, 280);
    
    doc.save(`${displayTicker(stock.symbol || ticker)}_Technical_Report.pdf`);
  };

  const formatTime = (date: Date | null) => {
    if (!date) return '-';
    return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';
  };

  const stock = data?.stock || {};
  const tech = data?.technical || {};
  const candles = chartCandles.length > 0 ? chartCandles : (data?.stock?.history || []);
  let analyzers = data?.analyzers || [];

  if (sortByConfidence) {
    analyzers = [...analyzers].sort((a, b) => b.confidence - a.confidence);
  }

  // LensScore 5-category breakdown (BUILD 002) - turunan dari analyzer Momentum 1D/5D
  // & Volatility (ATR 14) yang sudah dihitung di atas (bagian dari `analyzers`), bukan
  // komputasi baru. Tidak ikut total_score/kategori BUY-SELL.
  const momentum = data?.scoring ? momentumScore(analyzers) : null;
  const risk = data?.scoring ? riskScore(analyzers, stock.current_price ?? data?.price) : null;

  // BUG 4 FIX: Backtest accuracy dari data historis 1 tahun
  // Setiap analyzer type punya estimasi akurasi berdasarkan backtest lokal
  const backtestAccuracy = React.useMemo(() => {
    const history = data?.stock?.history || [];
    if (history.length < 50) return {};

    const results: Record<string, string> = {};
    
    // Simulate backtest for each common indicator
    const closes = history.map((h: any) => h.close);
    
    // RSI backtest: cek apakah saat RSI di zona 50-70, harga naik >3% dalam 10 hari
    let rsiCorrect = 0, rsiTotal = 0;
    for (let i = 20; i < closes.length - 10; i++) {
      // Simple RSI zone check
      const recentGains = closes.slice(i-14, i).reduce((sum: number, c: number, idx: number, arr: number[]) => {
        if (idx === 0) return 0;
        const diff = c - arr[idx-1];
        return sum + (diff > 0 ? diff : 0);
      }, 0) / 14;
      const recentLosses = closes.slice(i-14, i).reduce((sum: number, c: number, idx: number, arr: number[]) => {
        if (idx === 0) return 0;
        const diff = c - arr[idx-1];
        return sum + (diff < 0 ? Math.abs(diff) : 0);
      }, 0) / 14;
      const rs = recentLosses === 0 ? 100 : recentGains / recentLosses;
      const rsi = 100 - (100 / (1 + rs));
      
      if (rsi >= 50 && rsi <= 70) {
        rsiTotal++;
        const futurePrice = closes[Math.min(i + 10, closes.length - 1)];
        if (futurePrice > closes[i] * 1.03) rsiCorrect++;
      }
    }
    if (rsiTotal > 0) results['RSI 14'] = ((rsiCorrect / rsiTotal) * 100).toFixed(0) + '%';

    // Volume spike backtest
    let volCorrect = 0, volTotal = 0;
    const volumes = history.map((h: any) => h.volume);
    for (let i = 20; i < closes.length - 10; i++) {
      const avgVol = volumes.slice(i-20, i).reduce((a: number, b: number) => a + b, 0) / 20;
      if (volumes[i] > avgVol * 1.5 && closes[i] > closes[i-1]) {
        volTotal++;
        const futurePrice = closes[Math.min(i + 10, closes.length - 1)];
        if (futurePrice > closes[i] * 1.03) volCorrect++;
      }
    }
    if (volTotal > 0) results['Volume vs Avg 20D'] = ((volCorrect / volTotal) * 100).toFixed(0) + '%';

    // MA Trend backtest
    let maCorrect = 0, maTotal = 0;
    for (let i = 200; i < closes.length - 10; i++) {
      const sma20 = closes.slice(i-20, i).reduce((a: number, b: number) => a + b, 0) / 20;
      const sma50 = closes.slice(i-50, i).reduce((a: number, b: number) => a + b, 0) / 50;
      const sma200 = closes.slice(i-200, i).reduce((a: number, b: number) => a + b, 0) / 200;
      if (closes[i] > sma20 && sma20 > sma50 && sma50 > sma200) {
        maTotal++;
        const futurePrice = closes[Math.min(i + 10, closes.length - 1)];
        if (futurePrice > closes[i] * 1.03) maCorrect++;
      }
    }
    if (maTotal > 0) results['MA Trend IDX (20,50,200)'] = ((maCorrect / maTotal) * 100).toFixed(0) + '%';

    // MACD backtest
    let macdCorrect = 0, macdTotal = 0;
    const ema12: number[] = [closes[0]];
    const ema26: number[] = [closes[0]];
    for (let i = 1; i < closes.length; i++) {
      ema12.push(closes[i] * (2/13) + ema12[i-1] * (11/13));
      ema26.push(closes[i] * (2/27) + ema26[i-1] * (25/27));
    }
    const macdLine = ema12.map((v: number, i: number) => v - ema26[i]);
    const signal: number[] = [macdLine[0]];
    for (let i = 1; i < macdLine.length; i++) {
      signal.push(macdLine[i] * (2/10) + signal[i-1] * (8/10));
    }
    for (let i = 30; i < closes.length - 10; i++) {
      const hist = macdLine[i] - signal[i];
      if (hist > 0 && macdLine[i] > signal[i]) {
        macdTotal++;
        const futurePrice = closes[Math.min(i + 10, closes.length - 1)];
        if (futurePrice > closes[i] * 1.03) macdCorrect++;
      }
    }
    if (macdTotal > 0) results['MACD (12,26,9)'] = ((macdCorrect / macdTotal) * 100).toFixed(0) + '%';

    return results;
  }, [data, ticker]);

  // Butuh minimal 20 sampel tracking (localStorage, lihat trackAccuracy) sebelum
  // persentase akurasi dianggap cukup representatif - di bawah itu kembalikan null
  // (bukan angka karangan) supaya UI bisa menampilkan "belum cukup data" apa adanya.
  const calcAccuracy = (wins: number, total: number): number | null => {
    if (total < 20) return null;
    const acc = (wins / total) * 100;
    return Math.min(95, Math.max(45, Math.round(acc)));
  };

  const getAccuracyPct = (label: string): string | null => {
    if (backtestAccuracy[label]) {
      // Extract number from '72%' and clamp just in case
      const val = parseInt(backtestAccuracy[label]);
      return Math.min(95, Math.max(45, val)) + '%';
    }
    if (scores[label]) {
      const wins = scores[label].correct;
      const total = scores[label].correct + scores[label].wrong;
      const acc = calcAccuracy(wins, total);
      return acc !== null ? acc + '%' : null;
    }
    return null;
  };

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
          moduleTitle="LensTechnical"
          moduleBank="LENSTECHNICAL"
          analisaRemaining={analisaRemaining}
          analisaTotal={FREE_LIMITS.analisaPerHari}
          isAdmin={isAdminUser}
        />
        <div className="flex flex-col items-center justify-center p-20 text-slate-400">
          <Target className="w-12 h-12 mb-4 text-slate-600" />
          <p>Gagal memuat data. Limit analisa habis atau terjadi kesalahan.</p>
        </div>
        <PaywallModal
          open={showPaywall}
          onClose={() => { if (!isTrialExpired) setShowPaywall(false); }}
          title={isTrialExpired ? "Masa Trial 7 Hari Habis" : "Limit Gratis Habis"}
          body={isTrialExpired ? "Masa trial gratis 7 hari Anda telah berakhir. Upgrade ke Pro sekarang untuk terus menggunakan fitur Pro dari SahamLens." : `Kamu sudah pakai ${FREE_LIMITS.analisaPerHari}/${FREE_LIMITS.analisaPerHari} analisa hari ini${usedSymbolsToday.length ? ` (${usedSymbolsToday.slice(0, 3).map((s: string) => s.replace('.JK', '')).join(', ')}${usedSymbolsToday.length > 3 ? ', dll' : ''})` : ''}. Upgrade Pro Rp 99k/bulan untuk unlimited 10 filters + LensRadar LIVE.`}
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
          body="Analisa teknikal butuh akun (gratis) - daftar sekarang, dapat trial 7 hari akses penuh sebelum diminta upgrade."
          ctaHref="/signup"
          ctaLabel="Daftar Gratis"
          secondaryLabel="Nanti"
        />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-tv-bg min-h-screen">
      <Header
        currentTicker={ticker}
        onTickerChange={setTicker}
        moduleTitle="LensTechnical — Pure Algorithmic Trading"
        moduleBank="LENSTECHNICAL"
        analisaRemaining={analisaRemaining}
        analisaTotal={FREE_LIMITS.analisaPerHari}
        isAdmin={isAdminUser}
      />

      <div className="p-6 space-y-6 max-w-[1600px] mx-auto w-full">
        {/* Status Badge */}
        <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
          <div className="bg-tv-card border border-tv-border px-3 py-1.5 rounded-full text-tv-muted flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${marketClosed ? 'bg-tv-red' : 'bg-tv-green animate-pulse'}`}></span>
            {marketClosed ? 'Market Closed' : 'Market Open'}
          </div>
          <div className="bg-tv-card border border-tv-border px-3 py-1.5 rounded-full text-tv-muted">
            {marketClosed ? 'No Polling' : '1m refresh'}
          </div>
          <button 
            onClick={handleRefresh}
            disabled={loading}
            className="bg-tv-hover border border-tv-borderLight hover:bg-tv-borderLight px-3 py-1.5 rounded-full text-white flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            Refresh Data
          </button>
          
          <button 
            onClick={() => router.push(`/compare?symbol1=${ticker}`)}
            className="bg-tv-hover border border-tv-borderLight hover:bg-tv-borderLight px-3 py-1.5 rounded-full text-white flex items-center gap-2 transition-colors ml-auto"
          >
            ⚔️ Compare
          </button>
          
          <button
            onClick={() => { setTradeType('BUY'); setTradeModalOpen(true); }}
            className="bg-tv-green/10 border border-tv-green/30 hover:bg-tv-green hover:text-white text-tv-green px-4 py-1.5 rounded-full font-bold transition-colors"
          >
            BUY Virtual
          </button>
          <button
            onClick={() => { setTradeType('SELL'); setTradeModalOpen(true); }}
            className="bg-tv-red/10 border border-tv-red/30 hover:bg-tv-red hover:text-white text-tv-red px-4 py-1.5 rounded-full font-bold transition-colors"
          >
            SELL Virtual
          </button>
        </div>


        {/* Hero */}
        {fetchError ? (
          <div className="bg-tv-card border border-tv-border rounded-lg p-5 shadow-2">
            <EmptyState
              title="Data pasar sementara tidak tersedia."
              action={{ label: 'Coba lagi', onClick: () => fetchAnalyzerData(ticker) }}
            />
          </div>
        ) : loading && !data ? (
          <div className="bg-tv-card border border-tv-border rounded-lg p-5 shadow-2 flex items-center gap-4">
            <Skeleton variant="circle" className="w-12 h-12" />
            <div className="space-y-2">
              <Skeleton variant="text" className="w-40 h-6" />
              <Skeleton variant="text" className="w-28" />
            </div>
          </div>
        ) : (
          <div className="bg-tv-card border border-tv-border rounded-lg p-5 shadow-2 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-tv-yellow/10 border border-tv-yellow/30 flex items-center justify-center text-tv-yellow">
                <Zap className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="font-heading text-2xl font-bold text-white">{displayTicker(stock.symbol || ticker)}.JK</h1>
                  <span className="text-sm text-tv-muted font-sans font-normal">{stock.name || ticker.replace('.JK', '')}</span>
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <span className="font-number text-2xl font-bold text-white tabular-nums">
                    Rp {stock.current_price?.toLocaleString('id-ID') || '-'}
                  </span>
                  <span className={`font-number text-sm font-bold flex items-center gap-0.5 ${
                    (stock.change_pct || 0) >= 0 ? 'text-tv-green' : 'text-tv-red'
                  }`}>
                    {(stock.change_pct || 0) >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                    {stock.change_pct > 0 ? `+${stock.change_pct}` : stock.change_pct}%
                  </span>
                </div>
                <p className="text-[11px] text-tv-muted mt-1">Update: {formatTime(lastUpdate)}</p>
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
                <div className="text-[10px] font-mono text-tv-muted uppercase">KONSENSUS AI (MEDIAN + VOTING)</div>
                <div className={`text-xl font-extrabold font-mono px-4 py-1.5 rounded-lg border shadow-1 flex items-center gap-2 ${
                  data?.consensus?.includes('BUY')
                    ? 'bg-tv-green/20 text-tv-green border-tv-green'
                    : data?.consensus?.includes('SELL')
                    ? 'bg-tv-red/20 text-tv-red border-tv-red'
                    : 'bg-tv-yellow/20 text-tv-yellow border-tv-yellow'
                }`}>
                  {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <TrendingUp className="w-5 h-5" />}
                  {loading ? 'Calculating...' : data?.consensus || 'AWAITING'}
                </div>
                {data?.consensusData && (
                  <div className="flex items-center gap-3 mt-1.5 justify-end text-[10px] font-mono text-tv-muted">
                    <span>Vote: <strong className="text-white">{data.consensusData.vote}</strong> (Bull:Bear)</span>
                    <span>|</span>
                    <span>Median: <strong className="text-white">{data.consensusData.median_skor}</strong></span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* AI Summary - breakdown skor + top alasan, dipindah tepat di bawah Hero
            supaya konsensus AI terlihat sebelum user scroll ke chart/teknikal. */}
        {data?.scoring && (
          <div className="w-full bg-tv-card border border-tv-border rounded-lg p-5 shadow-1">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-4 h-4 text-tv-blue" />
              <h2 className="font-heading text-sm font-semibold text-white">AI Summary</h2>
            </div>
            <div className="flex flex-col md:flex-row gap-6 relative">
              {/* Action Buttons - tombol "LensAI" sengaja dihapus dari sini (2026-08-01):
                  sudah ada menu LensAI tersendiri di Sidebar, duplikasi tautan di dalam
                  AI Summary cuma bikin bingung ("ini AI Summary atau LensAI?"). */}
              <div className="absolute top-0 right-0 flex gap-2 z-10">
                <button
                  onClick={downloadTechnicalPDF}
                  className="hidden md:flex bg-tv-card hover:bg-tv-hover border border-tv-borderLight text-white px-3 py-1.5 rounded-lg font-bold text-xs items-center justify-center gap-2 transition-colors"
                >
                  <FileText className="w-3.5 h-3.5" /> Report
                </button>
              </div>

              {/* Score Circle */}
              <div className="flex flex-col items-center justify-center gap-2 min-w-[140px]">
                <div className="text-[10px] font-mono text-tv-muted uppercase tracking-wider text-center flex flex-col gap-1 items-center justify-center">
                  LensScore
                </div>
                <div className={`w-24 h-24 rounded-full border-4 flex items-center justify-center text-3xl font-extrabold font-number ${
                  data.scoring.total_score > 75 ? 'border-tv-green text-tv-green bg-tv-green/10' :
                  data.scoring.total_score >= 60 ? 'border-blue-400 text-blue-400 bg-blue-400/10' :
                  data.scoring.total_score >= 45 ? 'border-tv-yellow text-tv-yellow bg-tv-yellow/10' :
                  'border-tv-red text-tv-red bg-tv-red/10'
                }`}>
                  <AnimatedNumber value={data.scoring.total_score} />
                </div>
                <div className={`text-sm font-bold font-mono px-3 py-1 rounded-full border ${
                  data.scoring.kategori === 'STRONG BUY' ? 'bg-tv-green/20 text-tv-green border-tv-green/50' :
                  data.scoring.kategori === 'BUY' ? 'bg-blue-400/20 text-blue-400 border-blue-400/50' :
                  data.scoring.kategori === 'HOLD' ? 'bg-tv-yellow/20 text-tv-yellow border-tv-yellow/50' :
                  'bg-tv-red/20 text-tv-red border-tv-red/50'
                }`}>
                  {data.scoring.kategori}
                </div>
              </div>

              {/* Score Breakdown */}
              <div className="flex-1 space-y-3">
                <div className="text-[10px] font-mono text-tv-muted uppercase tracking-wider mb-2">BREAKDOWN SKOR</div>
                {/* Technical */}
                <div className="flex items-center gap-3">
                  <span className="text-xs text-tv-muted font-mono w-28">Technical (0-40)</span>
                  <div className="flex-1 bg-tv-hover rounded-full h-3 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-tv-green/80 to-tv-green rounded-full transition-all" style={{width: `${(data.scoring.technical_score / 40) * 100}%`}}></div>
                  </div>
                  <span className="text-sm font-bold text-white font-number w-8 text-right">{data.scoring.technical_score}</span>
                </div>
                {/* Momentum - baru (BUILD 002), turunan dari analyzer Momentum 1D/5D yang
                    sudah dihitung tapi belum ditampilkan di sini. Tidak ikut total_score. */}
                {momentum !== null && (
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-tv-muted font-mono w-28">Momentum (0-100)</span>
                    <div className="flex-1 bg-tv-hover rounded-full h-3 overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-purple-400/80 to-purple-400 rounded-full transition-all" style={{width: `${momentum}%`}}></div>
                    </div>
                    <span className="text-sm font-bold text-white font-number w-8 text-right">{momentum}</span>
                  </div>
                )}
                {/* Fundamental */}
                <div className="flex items-center gap-3">
                  <span className="text-xs text-tv-muted font-mono w-28">Fundamental (0-30)</span>
                  <div className="flex-1 bg-tv-hover rounded-full h-3 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-blue-400/80 to-blue-400 rounded-full transition-all" style={{width: `${(data.scoring.fundamental_score / 30) * 100}%`}}></div>
                  </div>
                  <span className="text-sm font-bold text-white font-number w-8 text-right">{data.scoring.fundamental_score}</span>
                </div>
                {/* Flow */}
                <div className="flex items-center gap-3">
                  <span className="text-xs text-tv-muted font-mono w-28">Money Flow (0-30)</span>
                  <div className="flex-1 bg-tv-hover rounded-full h-3 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-tv-yellow/80 to-tv-yellow rounded-full transition-all" style={{width: `${(data.scoring.flow_score / 30) * 100}%`}}></div>
                  </div>
                  <span className="text-sm font-bold text-white font-number w-8 text-right">{data.scoring.flow_score}</span>
                </div>
                {/* Risk - baru (BUILD 002), turunan dari analyzer Volatility (ATR 14).
                    Makin tinggi = makin aman (konsisten "tinggi = baik" seperti kategori
                    lain) - BUKAN raw volatility percentage. Tidak ikut total_score. */}
                {risk !== null && (
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-tv-muted font-mono w-28">Risk (0-100)</span>
                    <div className="flex-1 bg-tv-hover rounded-full h-3 overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-tv-red/80 to-tv-red rounded-full transition-all" style={{width: `${risk}%`}}></div>
                    </div>
                    <span className="text-sm font-bold text-white font-number w-8 text-right">{risk}</span>
                  </div>
                )}
              </div>

              {/* Reasons & Risk */}
              <div className="flex-1 space-y-3">
                <div className="text-[10px] font-mono text-tv-muted uppercase tracking-wider mb-2">TOP 3 ALASAN</div>
                {data.scoring.alasan_3_poin?.map((reason: string, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className="text-tv-green font-bold">✓</span>
                    <span className="text-tv-text font-mono">{reason}</span>
                  </div>
                ))}
                {data.scoring.risk && (
                  <div className="mt-3 pt-3 border-t border-tv-border">
                    <div className="text-[10px] font-mono text-tv-muted uppercase tracking-wider mb-1">RISK</div>
                    <div className="flex items-start gap-2 text-xs">
                      <span className="text-tv-red font-bold">⚠</span>
                      <span className="text-tv-muted font-mono">{data.scoring.risk}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* LensRadar rank badge - muncul HANYA kalau ticker ini ada di /api/ai-pick
            hari ini, tidak ada status EARLY/WATCH/dst yang dipaksakan (spec section C). */}
        {radarRank && (
          <div className="w-full flex items-center gap-3 bg-tv-purple/10 border border-tv-purple/25 rounded-lg px-4 py-3">
            <Radar className="w-4 h-4 text-tv-purple shrink-0" />
            <div className="min-w-0">
              <span className="text-[10px] font-mono text-tv-muted uppercase">LensRadar</span>
              <div className="text-sm text-white">
                Skor <strong className="font-number">{radarRank.finalScore}</strong>
                {radarRank.topReasons?.[0] && <span className="text-tv-muted"> — {radarRank.topReasons[0]}</span>}
              </div>
            </div>
          </div>
        )}

        {/* Main Layout */}
        <div className="flex flex-col gap-6">
          {/* BUG 3 FIX: MA Status Badge */}
          {data?.scoring && (() => {
            const detail = data.scoring.detail;
            const price = data.price;
            const maResult = analyzers.find((a: any) => a.label?.includes('MA Trend'));
            const maVal = maResult?.value || '';
            const ma50Match = maVal.match(/MA50:(\d+)/);
            const ma200Match = maVal.match(/MA200:(\d+)/);
            const ma50 = ma50Match ? parseInt(ma50Match[1]) : 0;
            const ma200 = ma200Match ? parseInt(ma200Match[1]) : 0;
            const status = getMAStatus(price, ma50, ma200);
            return (
              <div className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border ${status.bg}`}>
                <Activity className={`w-5 h-5 ${status.color}`} />
                <div>
                  <div className="text-[10px] font-mono text-tv-muted uppercase">MA STATUS</div>
                  <div className={`text-sm font-bold font-mono ${status.color}`}>{status.label}</div>
                </div>
                <div className="ml-auto text-right text-xs font-number text-tv-muted">
                  <span>MA50: <strong className="text-white">{ma50 || '-'}</strong></span>
                  <span className="mx-2">|</span>
                  <span>MA200: <strong className="text-white">{ma200 || '-'}</strong></span>
                  <span className="mx-2">|</span>
                  <span>Harga: <strong className="text-white">{price?.toLocaleString('id-ID')}</strong></span>
                </div>
              </div>
            );
          })()}

          <div className="w-full space-y-3">
            <SegmentedControl
              options={['1D', '3D', '7D', '1Y', '10Y', 'ALL'].map((t) => ({ label: t, value: t }))}
              value={timeframe}
              onChange={setTimeframe}
              layoutId="dashboard-timeframe"
            />
            <TradingViewChart
              candles={candles}
              technical={tech}
              symbol={stock.symbol || ticker}
              timeframe={timeframe}
              height={600}
            />
          </div>

          {/* Bandar Flow Analysis */}
          <div className="w-full">
            <BandarFlowPro symbol={stock.symbol || ticker} />
          </div>

          <div className="w-full">
            {/* Risk/Reward Calculator */}
            <RiskRewardCalculator currentPrice={data?.stock?.current_price} analyzers={analyzers} />

            <AlgoFilters
              analyzers={analyzers}
              sortByConfidence={sortByConfidence}
              setSortByConfidence={setSortByConfidence}
              getAccuracyPct={getAccuracyPct}
              isAdmin={isAdminUser}
            />
          </div>
        </div>

        {/* Fundamental (link-out) diganti Sentimen Berita AI - tabel Fundamental
            lengkap sudah punya halaman sendiri (/fundamental), jadi kartu ini dulu
            cuma duplikat pintu masuk. Sentimen dihitung langsung dari stockNews yang
            sudah di-fetch untuk section "Berita" di bawah (bukan panggilan baru,
            bukan data dummy) - vote mayoritas dari n.sentiment tiap artikel. */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(() => {
            const positif = stockNews.filter((n: any) => n.sentiment === 'POSITIF').length;
            const negatif = stockNews.filter((n: any) => n.sentiment === 'NEGATIF').length;
            const netral = stockNews.length - positif - negatif;
            const overall = stockNews.length === 0 ? null : positif > negatif ? 'POSITIF' : negatif > positif ? 'NEGATIF' : 'NETRAL';
            return (
              // <button>, bukan <div onClick> - supaya bisa difokus keyboard dan terbaca
              // pembaca layar sebagai elemen yang memang bisa ditekan.
              <button
                type="button"
                onClick={() => setNewsModalOpen(true)}
                className="group flex items-center gap-4 bg-tv-card border border-tv-border rounded-lg p-4 text-left w-full hover:border-tv-borderLight hover:shadow-2 transition-all duration-250 ease-settle"
              >
                <div className={`w-10 h-10 rounded-md flex items-center justify-center shrink-0 ${
                  overall === 'POSITIF' ? 'bg-tv-green/15 text-tv-green' : overall === 'NEGATIF' ? 'bg-tv-red/15 text-tv-red' : 'bg-tv-hover text-tv-muted'
                }`}>
                  <Newspaper className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-heading text-sm font-semibold text-white">Sentimen Berita AI</h3>
                  <p className="text-xs text-tv-muted">
                    {loadingStockNews
                      ? 'Menganalisis berita...'
                      : overall === null
                      ? 'Belum ada berita spesifik untuk dianalisis'
                      : `${overall} • ${positif} positif, ${negatif} negatif, ${netral} netral dari ${stockNews.length} berita`}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-tv-muted group-hover:text-tv-text transition-colors shrink-0" />
              </button>
            );
          })()}
          <Link
            href={`/dcf?symbol=${displayTicker(stock.symbol || ticker)}`}
            className="group flex items-center gap-4 bg-tv-card border border-tv-border rounded-lg p-4 hover:border-tv-borderLight hover:shadow-2 transition-all duration-250 ease-settle"
          >
            <div className="w-10 h-10 rounded-md bg-tv-gold/15 flex items-center justify-center text-tv-gold shrink-0">
              <Calculator className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-heading text-sm font-semibold text-white">DCF Valuation</h3>
              <p className="text-xs text-tv-muted">Intrinsic Value & Margin of Safety</p>
            </div>
            <ArrowUpRight className="w-4 h-4 text-tv-muted group-hover:text-tv-gold transition-colors" />
          </Link>
        </div>
      </div>

      {/* AI Explain Modal */}
      {aiModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-tv-bg border-2 border-tv-blue/50 rounded-xl w-full max-w-md overflow-hidden shadow-2 flex flex-col">
            <div className="p-4 border-b border-tv-border flex items-center justify-between bg-tv-card">
              <div className="flex items-center gap-2">
                <span className="text-xl">✨</span>
                <h3 className="font-heading text-tv-text font-bold">
                  AI Explain: {aiModalData?.algo?.label}
                </h3>
              </div>
              <button
                onClick={() => setAiModalOpen(false)}
                className="text-tv-muted hover:text-tv-text transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="p-5 flex-1 overflow-y-auto">
              {aiLoading ? (
                <div className="flex flex-col items-center justify-center py-10 gap-3">
                  <RefreshCw className="w-8 h-8 text-tv-blue animate-spin" />
                  <span className="text-sm text-tv-muted">Menganalisis sinyal...</span>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-tv-hover/50 border border-tv-border rounded-lg p-4">
                    <h4 className="text-xs text-tv-muted mb-2 uppercase font-semibold tracking-wide">Penjelasan Logika</h4>
                    <p className="text-sm text-tv-text leading-relaxed">
                      {aiModalData?.explanation}
                    </p>
                  </div>

                  <div className="bg-tv-hover/50 border border-tv-border rounded-lg p-4">
                    <h4 className="text-xs text-tv-muted mb-2 uppercase font-semibold tracking-wide">Data Historis</h4>
                    <p className="text-sm text-tv-text leading-relaxed flex items-start gap-2">
                      <TrendingUp className="w-4 h-4 text-tv-blue mt-0.5" />
                      {aiModalData?.historical}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-tv-border bg-tv-card flex justify-end gap-3">
              <button
                onClick={() => setAiModalOpen(false)}
                className="px-4 py-2 text-sm text-tv-muted hover:text-tv-text transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Virtual Trade Modal */}
      {tradeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-tv-bg border-2 border-tv-border rounded-xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col">
            <div className="p-4 border-b border-tv-border flex items-center justify-between bg-tv-card">
              <div className="flex items-center gap-2">
                <span className="text-xl">💰</span>
                <h3 className="font-heading text-tv-text font-bold">
                  {tradeType} Virtual Trade
                </h3>
              </div>
              <button
                onClick={() => setTradeModalOpen(false)}
                className="text-tv-muted hover:text-tv-text transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4">
               <div>
                 <label className="text-xs text-tv-muted uppercase font-semibold tracking-wide">Symbol</label>
                 <div className="font-bold text-tv-text font-number text-lg">{ticker}</div>
               </div>

               <div>
                 <label className="text-xs text-tv-muted uppercase font-semibold tracking-wide">Current Price</label>
                 <div className="font-bold text-tv-text font-number text-lg">Rp {(stock?.current_price || 0).toLocaleString('id-ID')}</div>
               </div>

               <div>
                 <div className="flex justify-between items-center mb-1.5">
                   <label className="text-xs text-tv-muted uppercase font-semibold tracking-wide">Lots (1 Lot = 100 lembar)</label>
                   {tradeType === 'SELL' && (
                     <span className="text-[10px] text-tv-green bg-tv-green/10 px-2 py-0.5 rounded border border-tv-green/20 font-number">
                       Tersedia: {portfolioData?.holdings?.find((h: any) => h.symbol === ticker)?.lots || 0} Lot
                     </span>
                   )}
                 </div>
                 <Input
                   type="number"
                   value={tradeLots}
                   onChange={e => setTradeLots(e.target.value)}
                   className="font-number"
                 />
               </div>

               <Select label="Trade Reason / Note" value={tradeNote} onChange={e => setTradeNote(e.target.value)}>
                 <option value="Algo Signal">Algo Signal (Analyzer)</option>
                 <option value="Breakout">Breakout MA/Resist</option>
                 <option value="Manual / Feeling">Manual / Feeling</option>
               </Select>

               <div className="pt-4 border-t border-tv-border">
                 <div className="flex justify-between items-center mb-1">
                   <span className="text-xs text-tv-muted">Total Value:</span>
                   <span className="font-bold text-tv-text font-number text-lg">Rp {((stock?.current_price || 0) * (parseInt(tradeLots)||0) * 100).toLocaleString('id-ID')}</span>
                 </div>
                 {portfolioData && (
                   <div className="flex justify-between items-center">
                     <span className="text-xs text-tv-muted">Sisa Cash (Virtual):</span>
                     <span className="text-xs text-tv-muted font-number">Rp {portfolioData?.portfolio?.cash?.toLocaleString('id-ID')}</span>
                   </div>
                 )}
               </div>
            </div>

            <div className="p-4 border-t border-tv-border bg-tv-card flex justify-end gap-3">
              <button
                onClick={() => setTradeModalOpen(false)}
                className="px-4 py-2 text-sm text-tv-muted hover:text-tv-text transition-colors"
                disabled={tradeLoading}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setTradeLoading(true);
                  try {
                    const price = stock?.current_price || 0;
                    const res = await fetch(`/api/portfolio/${tradeType.toLowerCase()}`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        symbol: ticker,
                        price,
                        lots: parseInt(tradeLots),
                        note: tradeNote
                      })
                    });
                    const json = await res.json();
                    if (json.error) {
                      alert(json.error);
                    } else {
                      alert(`Berhasil ${tradeType} ${tradeLots} lot ${ticker}!`);
                      router.push('/portfolio');
                    }
                  } catch(e) {
                    alert('Error: ' + String(e));
                  }
                  setTradeLoading(false);
                }}
                disabled={tradeLoading}
                className={`px-6 py-2 text-sm font-bold rounded-md transition-colors text-white ${
                  tradeType === 'BUY' ? 'bg-tv-green hover:bg-tv-greenHover' : 'bg-tv-red hover:bg-tv-redHover'
                }`}
              >
                {tradeLoading ? 'Processing...' : `Confirm ${tradeType}`}
              </button>
            </div>
          </div>
        </div>
      )}
      
      <StockNewsModal
        open={newsModalOpen}
        onClose={() => setNewsModalOpen(false)}
        symbol={displayTicker(data?.stock?.symbol || ticker)}
        items={stockNews}
      />

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
        body="Analisa teknikal butuh akun (gratis) - daftar sekarang, dapat trial 7 hari akses penuh sebelum diminta upgrade."
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

export default function Dashboard() {
  return (
    <Suspense fallback={null}>
      <DashboardContent />
    </Suspense>
  );
}

