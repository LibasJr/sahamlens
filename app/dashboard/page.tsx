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
import { AnimatedNumber, SegmentedControl, Input, Select, Skeleton, EmptyState, PageContainer, LoadingFact, TickerAvatar } from '@/components/ui';
import { grantProFromLink, FREE_LIMITS } from '@/lib/limits';
import { computeRole } from '@/lib/hooks/useAuthUser';
import { momentumScore, riskScore } from '@/lib/utils/lens-score-breakdown';
import { calculateRsi } from '@/modules/technical/service/rsi';
import { isMarketOpen } from '@/lib/utils/market';
import { getDecisionPresentation } from '@/modules/eligibility';
import {
  Zap, ArrowUpRight, ArrowDownRight,
  RefreshCw, Users, AlertTriangle, ShieldCheck, TrendingUp, Activity, Download, FileText, Target,
  Sparkles, Calculator, Newspaper, ChevronRight, Radar
} from 'lucide-react';
// jsPDF/jspdf-autotable TIDAK di-import statis di sini (optimasi loading 2026-08-05) -
// keduanya cukup berat dan sebelumnya dibundel ke JS awal /dashboard (halaman paling
// sering dibuka setelah landing page) padahal cuma dipakai kalau pengguna benar-benar
// klik "Download PDF Report". Sekarang di-import dinamis di dalam downloadTechnicalPDF()
// - library itu baru diunduh & di-parse browser saat tombolnya diklik, bukan di setiap
// kunjungan halaman.

// Normalisasi simbol: pastikan hanya 1x .JK
const normTicker = (s: string) => s.replace('.JK', '').replace('.JK', '') + '.JK';
const displayTicker = (s: string) => s.replace('.JK', '').replace('.JK', '');

/** SMA dari candle yang sedang ditampilkan - `undefined` (bukan angka seadanya) kalau
 * bar-nya kurang dari periode, supaya legend chart menampilkan "-" alih-alih rata-rata
 * 60 hari yang dilabeli "MA 200" (audit logika & algoritma 2026-08-05, temuan H-2). */
function smaOf(candles: { close: number }[], period: number): number | undefined {
  if (!candles || candles.length < period) return undefined;
  const slice = candles.slice(-period);
  return Math.round(slice.reduce((sum, c) => sum + c.close, 0) / period);
}

// BUG 3 FIX: MA Status Badge
const getMAStatus = (price: number, ma50: number, ma200: number) => {
  if (!price || !ma50 || !ma200) return { label: 'N/A', color: 'text-tv-muted', bg: 'bg-tv-hover' };
  if (price > ma50 && ma50 > ma200) return { label: 'GOLDEN TREND - Uptrend Kuat', color: 'text-tv-green', bg: 'bg-tv-green/15 border-tv-green/30' };
  if (price > ma50 && price < ma200) return { label: 'REBOUND LEMAH - Di bawah MA200', color: 'text-tv-yellow', bg: 'bg-tv-yellow/15 border-tv-yellow/30' };
  if (price > ma200 && price < ma50) return { label: 'KOREKSI - Di bawah MA50', color: 'text-tv-yellow', bg: 'bg-tv-yellow/15 border-tv-yellow/30' };
  if (price < ma50 && price < ma200) return { label: 'DOWNTREND - Di bawah MA50 & MA200', color: 'text-tv-red', bg: 'bg-tv-red/15 border-tv-red/30' };
  return { label: 'SIDEWAYS', color: 'text-tv-muted', bg: 'bg-tv-hover' };
};


const signalBadgeTone = (signal: string | null | undefined) =>
  signal === 'STRONG BUY' ? 'bg-tv-green/20 text-tv-green border-tv-green/50' :
  signal === 'BUY' ? 'bg-tv-blue/20 text-tv-blue border-tv-blue/50' :
  signal === 'HOLD' || signal === 'DATA TIDAK CUKUP' ? 'bg-tv-yellow/20 text-tv-yellow border-tv-yellow/50' :
  signal === 'SELL' ? 'bg-tv-red/20 text-tv-red border-tv-red/50' :
  'bg-tv-hover text-tv-muted border-tv-border';

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
            score: jsonAlgo.score,
            modelSignal: jsonAlgo.scoring?.kategori,
            decision: jsonAlgo.decision,
            eligibility: jsonAlgo.eligibility
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

    // BUG FIX (2026-08-06, dilaporkan user "pelanggan Pro 1 bulan masih dapat notif
    // limit habis"): blok ini dulu memutuskan status Pro dari `role === 'pro'` lalu
    // jatuh ke cabang trial_ends_at. Panel admin TIDAK PERNAH menulis role - hanya
    // is_pro & pro_expires_at - jadi pelanggan berbayar terbaca role 'free' dengan
    // trial yang sudah lewat, dan langsung disodori paywall. Sekarang keputusannya
    // dari computeRole() (lib/hooks/useAuthUser.ts), logic yang sama dengan
    // checkProAccess() di server, sehingga UI dan API tidak lagi berbeda pendapat.
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(d => {
        const user = d.authenticated && d.user ? d.user : null;
        const { effectiveRole, isTrialExpired } = computeRole(user);
        setIsAdminUser(effectiveRole !== 'guest');
        setIsTrialExpired(isTrialExpired);
        setShowPaywall(isTrialExpired);
        setAdminReady(true);
      })
      .catch(() => setAdminReady(true));

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
    setMarketClosed(!isMarketOpen(new Date()));
    fetchAnalyzerData(ticker);

    const interval = setInterval(() => {
      const closed = !isMarketOpen(new Date());
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

    const [{ jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ]);
    const doc = new jsPDF();
    doc.setFontSize(16);
    // Presentation semantics: hasil LensScore tetap terlihat sebagai SINYAL MODEL,
    // sedangkan recommendation actionable hanya boleh berasal dari `decision.action`.
    // MODEL_UNVALIDATED bukan sinonim NETRAL dan bukan penolakan atas sahamnya.
    const decisionPresentation = getDecisionPresentation(data.scoring.kategori, data.decision);
    const reportLabel = decisionPresentation.recommendationLabel
      ?? decisionPresentation.modelSignalLabel
      ?? 'STATUS MODEL TIDAK TERSEDIA';
    doc.text(`${displayTicker(stock.symbol || ticker)} Technical Report - Score ${data.scoring.total_score} - ${reportLabel}`, 14, 20);
    
    let finalY = 30;
    
    // Screenshot chart 
    const chartEl = document.querySelector('.tv-lightweight-charts');
    if (chartEl) {
      try {
        const html2canvas = (await import('html2canvas')).default;
        // Latar PNG disamakan dengan tv-bg palet baru (#0B0F19) - sebelumnya #0F141D,
        // sehingga chart di dalam PDF punya kotak latar yang sedikit beda dari halaman.
        const canvas = await html2canvas(chartEl as HTMLElement, { scale: 1.5, useCORS: true, backgroundColor: '#0B0F19' });
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
    const decisionText = decisionPresentation.actionable
      ? `${decisionPresentation.recommendationLabel} dengan skor ${data.scoring.total_score}/100.`
      : `${decisionPresentation.modelSignalLabel || 'Sinyal model tidak tersedia'}. Status: ${decisionPresentation.statusLabel || 'rekomendasi tidak tersedia'}. ${decisionPresentation.explanation || ''} Skor ${data.scoring.total_score}/100 tetap ditampilkan sebagai informasi.`;
    const decisionLines = doc.splitTextToSize(decisionText, 180);
    doc.text(decisionLines, 14, finalY + 15);
    doc.text(`Harga di bawah/atas indikator MA mengonfirmasi tren saat ini.`, 14, finalY + 20 + (decisionLines.length * 5));
    
    doc.setFontSize(9);
    doc.text('Disclaimer: Laporan ini di-generate secara otomatis oleh AI. Bukan ajakan beli/jual.', 14, 280);
    
    doc.save(`${displayTicker(stock.symbol || ticker)}_Technical_Report.pdf`);
  };

  const formatTime = (date: Date | null) => {
    if (!date) return '-';
    return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';
  };

  const stock = data?.stock || {};
  const candles = chartCandles.length > 0 ? chartCandles : (data?.stock?.history || []);
  let analyzers = data?.analyzers || [];

  if (sortByConfidence) {
    analyzers = [...analyzers].sort((a, b) => b.confidence - a.confidence);
  }

  // BUG FIX (audit logika & algoritma 2026-08-05, temuan C-1): halaman ini SEBELUMNYA
  // meneruskan `data?.technical || {}` ke TradingViewChart - dan /api/stock/[ticker]
  // SELALU mengembalikan `technical: {}` (objek kosong permanen), jadi setiap field di
  // header chart jatuh ke fallback-nya, termasuk "Bandar Flow: AKUMULASI" hardcoded yang
  // tampil untuk SEMUA saham di SEMUA kondisi. Sekarang header chart diisi dari analyzer
  // yang benar-benar dihitung route itu (EMA cross & Bandarmology CMF, keduanya lewat
  // `raw` - bukan parsing string tampilan), dan `undefined`/null kalau analyzer-nya tidak
  // tersedia sehingga UI menampilkan "N/A".
  const emaAnalyzer = analyzers.find((a: any) => a.label?.includes('EMA'));
  const cmfAnalyzer = analyzers.find((a: any) => a.label?.includes('Bandarmology'));
  const cmfRaw = cmfAnalyzer?.raw;
  const chartTechnical = {
    cross_status:
      typeof emaAnalyzer?.raw?.ema20 === 'number' && typeof emaAnalyzer?.raw?.ema50 === 'number'
        ? (emaAnalyzer.raw.ema20 > emaAnalyzer.raw.ema50 ? 'BULLISH' : 'BEARISH')
        : null,
    money_flow_status:
      typeof cmfRaw?.cmf20 === 'number'
        ? `${cmfRaw.status === 'BULLISH' ? 'AKUMULASI' : cmfRaw.status === 'BEARISH' ? 'DISTRIBUSI' : 'NETRAL'} (${cmfRaw.cmf20 > 0 ? '+' : ''}${cmfRaw.cmf20}%)`
        : null,
    // MA50/MA200 dihitung dari candle yang SEDANG ditampilkan; `undefined` kalau bar-nya
    // kurang dari periode - legend menampilkan "-", bukan rata-rata bar seadanya yang
    // dilabeli MA200 (temuan H-2).
    ma50: smaOf(candles, 50),
    ma200: smaOf(candles, 200),
  };

  // Kesegaran data pasar dari `_meta` yang dikirim /api/stock (temuan C-8). Tiga keadaan
  // yang WAJIB bisa dibedakan pengguna: data intraday (delayed ~15 menit), data penutupan
  // (EOD), dan data cache darurat saat Yahoo down (bisa berumur sampai 24 jam).
  const dataFreshness = React.useMemo(() => {
    const meta = data?._meta;
    if (!meta) return null;
    const ts = meta.dataTimestamp ? new Date(meta.dataTimestamp) : null;
    const jam = ts ? ts.toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' WIB' : null;
    const isStaleCache = meta.source === 'stale-cache';
    const ageJam = typeof meta.ageSeconds === 'number' ? Math.round(meta.ageSeconds / 3600) : null;
    if (isStaleCache) {
      return {
        warn: true,
        label: `CACHE DARURAT${ageJam != null ? ` (~${ageJam} jam lalu)` : ''}`,
        detail: meta.staleReason || 'Sumber data sedang tidak bisa dihubungi - angka di halaman ini adalah data terakhir yang berhasil diambil, bukan kondisi pasar saat ini.',
      };
    }
    if (meta.freshness === 'STALE') {
      return { warn: true, label: `BASI${jam ? ` - bar terakhir ${jam}` : ''}`, detail: 'Bar harga terakhir dari sumber data lebih tua dari 1 hari bursa.' };
    }
    if (meta.freshness === 'EOD') return { warn: false, label: `Penutupan (EOD)${jam ? ` - ${jam}` : ''}`, detail: null };
    if (meta.freshness === 'DELAYED') return { warn: false, label: `Delayed ~15 menit${jam ? ` - ${jam}` : ''}`, detail: null };
    return { warn: true, label: 'Waktu data tidak diketahui', detail: 'Sumber data tidak mengirim timestamp bar harga.' };
  }, [data]);

  // LensScore 5-category breakdown (BUILD 002) - turunan dari analyzer Momentum 1D/5D
  // & Volatility (ATR 14) yang sudah dihitung di atas (bagian dari `analyzers`), bukan
  // komputasi baru. Tidak ikut total_score/kategori BUY-SELL.
  const momentum = data?.scoring ? momentumScore(analyzers) : null;
  const risk = data?.scoring ? riskScore(analyzers, stock.current_price ?? data?.price) : null;
  const decisionPresentation = data?.scoring
    ? getDecisionPresentation(data.scoring.kategori, data.decision)
    : null;

  // Backtest hit-rate per indikator, dihitung dari histori harga NYATA saham yang sedang
  // dibuka: "berapa persen dari sinyal indikator ini yang diikuti kenaikan > 3% dalam 10
  // hari bursa berikutnya".
  //
  // BUG FIX (audit logika & algoritma 2026-08-05, temuan C-3): dua hal diperbaiki.
  // (1) RSI di sini dihitung dengan RATA-RATA ARITMATIK SEDERHANA - persis bug H-01 yang
  //     sudah diperbaiki di modules/technical/service/rsi.ts (Wilder smoothing) tapi tidak
  //     pernah sampai ke blok ini, sehingga "akurasi RSI" diukur atas definisi RSI yang
  //     BERBEDA dari RSI yang ditampilkan di kartu indikator persis di sebelahnya.
  //     Sekarang memakai calculateRsi() bersama.
  // (2) Hasilnya dulu di-clamp ke rentang 45-95% di getAccuracyPct() - hit-rate riil 20%
  //     ditampilkan "45%", 100% jadi "95%". Itu bukan fallback data hilang, itu angka
  //     hasil hitungan yang dipalsukan supaya terlihat kredibel. Clamp dihapus; jumlah
  //     sampel ikut dilaporkan supaya pengguna tahu angka itu dari berapa kejadian.
  const backtestAccuracy = React.useMemo<Record<string, { pct: number; samples: number }>>(() => {
    const history = data?.stock?.history || [];
    if (history.length < 50) return {};

    const results: Record<string, { pct: number; samples: number }> = {};
    const closes: number[] = history.map((h: any) => h.close);
    const HORIZON = 10;      // hari bursa ke depan
    const TARGET_GAIN = 1.03; // +3%
    const MIN_SAMPLES = 20;   // di bawah ini tidak dilaporkan sama sekali

    const record = (label: string, correct: number, total: number) => {
      if (total >= MIN_SAMPLES) results[label] = { pct: Math.round((correct / total) * 100), samples: total };
    };
    const hit = (i: number) => closes[Math.min(i + HORIZON, closes.length - 1)] > closes[i] * TARGET_GAIN;

    // RSI 14 (Wilder) - zona 50-70
    let rsiCorrect = 0, rsiTotal = 0;
    for (let i = 20; i < closes.length - HORIZON; i++) {
      const rsi = calculateRsi(closes.slice(0, i + 1), 14);
      if (rsi === null) continue;
      if (rsi >= 50 && rsi <= 70) { rsiTotal++; if (hit(i)) rsiCorrect++; }
    }
    record('RSI 14', rsiCorrect, rsiTotal);

    // Volume spike (> 1.5x rata-rata 20 hari) + candle hijau
    let volCorrect = 0, volTotal = 0;
    const volumes: number[] = history.map((h: any) => h.volume || 0);
    for (let i = 20; i < closes.length - HORIZON; i++) {
      const avgVol = volumes.slice(i - 20, i).reduce((a, b) => a + b, 0) / 20;
      if (avgVol > 0 && volumes[i] > avgVol * 1.5 && closes[i] > closes[i - 1]) {
        volTotal++; if (hit(i)) volCorrect++;
      }
    }
    record('Volume vs Avg 20D', volCorrect, volTotal);

    // MA Trend penuh (P > MA20 > MA50 > MA200)
    let maCorrect = 0, maTotal = 0;
    for (let i = 200; i < closes.length - HORIZON; i++) {
      const sma20 = closes.slice(i - 20, i).reduce((a, b) => a + b, 0) / 20;
      const sma50 = closes.slice(i - 50, i).reduce((a, b) => a + b, 0) / 50;
      const sma200 = closes.slice(i - 200, i).reduce((a, b) => a + b, 0) / 200;
      if (closes[i] > sma20 && sma20 > sma50 && sma50 > sma200) {
        maTotal++; if (hit(i)) maCorrect++;
      }
    }
    record('MA Trend IDX (20,50,200)', maCorrect, maTotal);

    // MACD histogram positif
    let macdCorrect = 0, macdTotal = 0;
    const ema12: number[] = [closes[0]];
    const ema26: number[] = [closes[0]];
    for (let i = 1; i < closes.length; i++) {
      ema12.push(closes[i] * (2 / 13) + ema12[i - 1] * (11 / 13));
      ema26.push(closes[i] * (2 / 27) + ema26[i - 1] * (25 / 27));
    }
    const macdLine = ema12.map((v: number, i: number) => v - ema26[i]);
    const signal: number[] = [macdLine[0]];
    for (let i = 1; i < macdLine.length; i++) {
      signal.push(macdLine[i] * (2 / 10) + signal[i - 1] * (8 / 10));
    }
    for (let i = 30; i < closes.length - HORIZON; i++) {
      if (macdLine[i] - signal[i] > 0) { macdTotal++; if (hit(i)) macdCorrect++; }
    }
    record('MACD (12,26,9)', macdCorrect, macdTotal);

    return results;
  }, [data]);

  // Butuh minimal 20 sampel tracking (localStorage, lihat trackAccuracy) sebelum
  // persentase dianggap representatif - di bawah itu null (bukan angka karangan),
  // dan nilainya TIDAK di-clamp (temuan C-3).
  const calcAccuracy = (wins: number, total: number): number | null => {
    if (total < 20) return null;
    return Math.round((wins / total) * 100);
  };

  // Selalu menyertakan jumlah sampel: "62% (n=41)" - angka tanpa n tidak bisa dinilai
  // pembaca apakah 2 kejadian atau 200.
  const getAccuracyPct = (label: string): string | null => {
    const bt = backtestAccuracy[label];
    if (bt) return `${bt.pct}% (n=${bt.samples})`;
    if (scores[label]) {
      const wins = scores[label].correct;
      const total = scores[label].correct + scores[label].wrong;
      const acc = calcAccuracy(wins, total);
      return acc !== null ? `${acc}% (n=${total})` : null;
    }
    return null;
  };

  if (loading && !data) {
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
        {/* Dulu satu spinner tunggal berwarna teal-500 - warna yang tidak ada di
            palet mana pun - di tengah halaman kosong, tanpa petunjuk apa yang
            sedang disiapkan. Kerangka di bawah mengikuti bentuk halaman aslinya. */}
        <PageContainer className="p-6 space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-32 w-full" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
          <Skeleton className="h-[320px] w-full" />
          <LoadingFact />
        </PageContainer>
      </div>
    );
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
        {/* BUG FIX (2026-08-06): pesan lama - "Gagal memuat data. Limit analisa habis
            atau terjadi kesalahan." - menggabungkan dua sebab yang sangat berbeda
            menjadi satu tebakan, dan tidak menyediakan jalan keluar apa pun (tanpa
            tombol coba lagi). Padahal state penyebabnya SUDAH dibedakan di
            fetchAnalyzerData: showLoginPrompt (401), showPaywall (402), fetchError.
            Blok EmptyState 'Coba lagi' yang ada di bawah tidak pernah terpakai untuk
            kasus ini karena ia hidup di cabang yang menuntut `data` sudah terisi -
            padahal kegagalan muat PERTAMA justru meninggalkan `data` null dan
            berhenti di sini. */}
        <PageContainer className="p-6">
          {showLoginPrompt ? (
            <EmptyState
              illustration="locked"
              title="Analisa teknikal butuh akun"
              description="Daftar gratis - dapat trial 7 hari akses penuh sebelum diminta upgrade."
              action={{ label: 'Daftar Gratis', onClick: () => { window.location.href = '/signup'; } }}
            />
          ) : showPaywall ? (
            <EmptyState
              illustration="locked"
              title={isTrialExpired ? 'Masa trial 7 hari sudah berakhir' : 'Kuota analisa hari ini sudah habis'}
              description={
                isTrialExpired
                  ? 'Upgrade ke Pro untuk melanjutkan analisa tanpa batas.'
                  : `Kuota gratis ${FREE_LIMITS.analisaPerHari} analisa per hari sudah terpakai${usedSymbolsToday.length ? ` untuk ${usedSymbolsToday.slice(0, 3).map(displayTicker).join(', ')}` : ''}. Kuota disetel ulang besok.`
              }
              action={{ label: 'Lihat Paket Pro', onClick: () => setShowPaywall(true) }}
            />
          ) : (
            <EmptyState
              illustration="empty"
              title={`Data ${displayTicker(ticker)} gagal dimuat`}
              description="Permintaan ke sumber data tidak sampai. Ini bukan berarti sahamnya bermasalah - coba lagi, atau cari emiten lain lewat kolom pencarian di atas."
              action={{ label: 'Coba lagi', onClick: () => fetchAnalyzerData(ticker) }}
            />
          )}
        </PageContainer>
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
        moduleTitle="LensTechnical â€” Pure Algorithmic Trading"
        moduleBank="LENSTECHNICAL"
        analisaRemaining={analisaRemaining}
        analisaTotal={FREE_LIMITS.analisaPerHari}
        isAdmin={isAdminUser}
      />

      <PageContainer className="p-6 space-y-6">
        {/* Status Badge */}
        <div className="flex flex-wrap items-center gap-3 text-xs font-sans">
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
            âš”ï¸ Compare
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
          <>
          {/* Peringatan kesegaran data (temuan C-8) - tampil HANYA kalau data yang sedang
              dirender memang bukan data pasar terkini. Seluruh angka di halaman ini
              (harga, skor, kategori BUY/SELL) diturunkan dari payload yang sama. */}
          {dataFreshness?.warn && (
            <div className="mb-4 rounded-lg border border-tv-yellow/40 bg-tv-yellow/10 p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-tv-yellow shrink-0 mt-0.5" />
              <div className="text-[11px] leading-relaxed text-tv-yellow">
                <b>{dataFreshness.label}</b>
                {dataFreshness.detail && <span className="block text-tv-text/80 mt-0.5">{dataFreshness.detail}</span>}
              </div>
            </div>
          )}
          <div className="bg-tv-card border border-tv-border rounded-lg p-5 shadow-2 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              {/* Ikon petir kuning yang sama dipakai untuk SEMUA saham - tidak
                  membedakan apa pun. Diganti avatar berwarna deterministik per emiten. */}
              <TickerAvatar symbol={stock.symbol || ticker} size="lg" />
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="font-heading text-2xl font-bold text-white">{displayTicker(stock.symbol || ticker)}.JK</h1>
                  <span className="text-sm text-tv-muted font-sans font-normal">{stock.name || ticker.replace('.JK', '')}</span>
                </div>
                <div className="flex items-center gap-3 mt-1">
                  {/* `|| '-'` sebelumnya merender "Rp -" saat harga tidak ada: sebuah
                      tanda hubung yang tidak memberi tahu apakah datanya hilang, nol,
                      atau belum sempat dimuat. */}
                  {typeof stock.current_price === 'number' ? (
                    <AnimatedNumber
                      value={stock.current_price}
                      format={(n) => `Rp ${Math.round(n).toLocaleString('id-ID')}`}
                      className="font-number text-2xl font-bold text-white tabular-nums"
                    />
                  ) : (
                    <span className="text-sm text-tv-muted">Harga tidak tersedia dari sumber data</span>
                  )}
                  {/* Temuan M-7: null (tidak terukur) dibedakan dari 0 (benar-benar flat). */}
                  {stock.change_pct == null ? (
                    <span className="font-number text-sm font-bold text-tv-muted">Perubahan N/A</span>
                  ) : (
                    <span className={`font-number text-sm font-bold flex items-center gap-0.5 ${
                      stock.change_pct >= 0 ? 'text-tv-green' : 'text-tv-red'
                    }`}>
                      {stock.change_pct >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                      {stock.change_pct > 0 ? `+${stock.change_pct}` : stock.change_pct}%
                    </span>
                  )}
                </div>
                {/* BUG FIX (audit logika & algoritma 2026-08-05, temuan C-8): baris ini
                    dulu HANYA menampilkan jam saat browser menerima response - bukan umur
                    data pasarnya. /api/stock/[ticker] sudah lama mengirim `_meta`
                    (source live/stale-cache, freshness DELAYED/EOD/STALE, dataTimestamp
                    dari `meta.regularMarketTime` Yahoo), termasuk saat menyajikan cache
                    darurat yang bisa berumur sampai 24 jam - tapi TIDAK ADA satu pun
                    pembacaan `_meta` di halaman ini, sehingga data kemarin/minggu lalu
                    dirender identik dengan data hari ini. Sekarang ditampilkan apa adanya. */}
                <p className="text-[11px] text-tv-muted mt-1">
                  Diterima: {formatTime(lastUpdate)}
                  {dataFreshness && <span className="ml-2">â€¢ Data pasar: {dataFreshness.label}</span>}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-6">
               {data?.bestPerformer && (
                  <div className="text-right border-r border-tv-border pr-6 hidden md:block">
                    <div className="text-[10px] font-sans font-semibold text-tv-muted uppercase">TOP METHOD TODAY</div>
                    <div className="text-lg font-bold text-white flex items-center gap-2">
                      <ShieldCheck className="w-5 h-5 text-tv-green" />
                      {data.bestPerformer.label} ({data.bestPerformer.confidence}% Conf)
                    </div>
                  </div>
               )}
              <div className="text-right">
                <div className="text-[10px] font-sans font-semibold text-tv-muted uppercase">KONSENSUS AI (MEDIAN + VOTING)</div>
                {/* BUG FIX (2026-08-06, laporan user "kegedean"): text-xl font-extrabold
                    turun ke text-sm font-bold - disamakan dengan badge sejenis di halaman
                    Fundamental (Valuasi Harga/Kualitas Fundamental), supaya "verdict badge"
                    konsisten ukurannya di semua halaman, bukan cuma di halaman ini. */}
                <div className={`text-sm font-bold font-sans px-3 py-1.5 rounded-lg border shadow-1 flex items-center gap-1.5 ${
                  data?.consensus?.includes('BUY')
                    ? 'bg-tv-green/20 text-tv-green border-tv-green'
                    : data?.consensus?.includes('SELL')
                    ? 'bg-tv-red/20 text-tv-red border-tv-red'
                    : 'bg-tv-yellow/20 text-tv-yellow border-tv-yellow'
                }`}>
                  {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
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
          </>
        )}

        {/* AI Summary - breakdown skor + top alasan, dipindah tepat di bawah Hero
            supaya konsensus AI terlihat sebelum user scroll ke chart/teknikal. */}
        {data?.scoring && (
          <div className="w-full bg-tv-card border border-tv-border rounded-lg p-5 shadow-1">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-4 h-4 text-tv-blue" />
              <h2 className="font-heading text-sm font-semibold text-white">Technical Summary</h2>
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
                <div className="text-[10px] font-sans font-semibold text-tv-muted uppercase tracking-wider text-center flex flex-col gap-1 items-center justify-center">
                  LensScore
                </div>
                <div className={`w-24 h-24 rounded-full border-4 flex items-center justify-center text-3xl font-extrabold font-number ${
                  data.scoring.total_score > 75 ? 'border-tv-green text-tv-green bg-tv-green/10' :
                  data.scoring.total_score >= 60 ? 'border-tv-blue text-tv-blue bg-tv-blue/10' :
                  data.scoring.total_score >= 45 ? 'border-tv-yellow text-tv-yellow bg-tv-yellow/10' :
                  'border-tv-red text-tv-red bg-tv-red/10'
                }`}>
                  <AnimatedNumber value={data.scoring.total_score} />
                </div>
                {/* Hasil model, kelayakan, dan recommendation actionable adalah tiga
                    hal berbeda. `decision.action` adalah satu-satunya sumber aksi;
                    `scoring.kategori` tetap ditampilkan sebagai sinyal informasional. */}
                {decisionPresentation?.actionable ? (
                  <div className={`text-sm font-bold font-sans px-3 py-1 rounded-full border ${signalBadgeTone(data.decision?.action)}`}>
                    {decisionPresentation.recommendationLabel}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1.5">
                    {decisionPresentation?.modelSignalLabel && (
                      <div className={`text-xs font-bold font-sans px-3 py-1 rounded-full border text-center ${signalBadgeTone(decisionPresentation.modelSignal)}`}>
                        {decisionPresentation.modelSignalLabel}
                      </div>
                    )}
                    {decisionPresentation?.statusLabel && (
                      <div className={`text-[10px] font-bold font-sans px-2.5 py-1 rounded-full border text-center ${
                        decisionPresentation.kind === 'MODEL_UNVALIDATED'
                          ? 'bg-tv-yellow/10 text-tv-yellow border-tv-yellow/40'
                          : decisionPresentation.kind === 'INELIGIBLE'
                            ? 'bg-tv-red/10 text-tv-red border-tv-red/40'
                            : 'bg-tv-hover text-tv-muted border-tv-border'
                      }`}>
                        {decisionPresentation.statusLabel}
                      </div>
                    )}
                  </div>
                )}
                {!decisionPresentation?.actionable && decisionPresentation?.explanation && (
                  <p className="text-[11px] leading-snug text-tv-muted text-center max-w-[240px]">
                    {decisionPresentation.explanation}
                  </p>
                )}
              </div>

              {/* Score Breakdown */}
              <div className="flex-1 space-y-3">
                <div className="text-[10px] font-sans font-semibold text-tv-muted uppercase tracking-wider mb-2">BREAKDOWN SKOR</div>
                {/* Technical */}
                <div className="flex items-center gap-3">
                  <span className="text-xs text-tv-muted font-sans w-28">Technical (0-40)</span>
                  <div className="flex-1 bg-tv-hover rounded-full h-3 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-tv-green/80 to-tv-green rounded-full transition-[width] duration-700 ease-settle" style={{width: `${(data.scoring.technical_score / 40) * 100}%`}}></div>
                  </div>
                  <span className="text-sm font-bold text-white font-number w-8 text-right">{data.scoring.technical_score}</span>
                </div>
                {/* Momentum - baru (BUILD 002), turunan dari analyzer Momentum 1D/5D yang
                    sudah dihitung tapi belum ditampilkan di sini. Tidak ikut total_score. */}
                {momentum !== null && (
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-tv-muted font-sans w-28">Momentum (0-100)</span>
                    <div className="flex-1 bg-tv-hover rounded-full h-3 overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-tv-purple/80 to-tv-purple rounded-full transition-[width] duration-700 ease-settle" style={{width: `${momentum}%`}}></div>
                    </div>
                    <span className="text-sm font-bold text-white font-number w-8 text-right">{momentum}</span>
                  </div>
                )}
                {/* Fundamental */}
                <div className="flex items-center gap-3">
                  <span className="text-xs text-tv-muted font-sans w-28">Fundamental (0-30)</span>
                  <div className="flex-1 bg-tv-hover rounded-full h-3 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-tv-blue/80 to-tv-blue rounded-full transition-[width] duration-700 ease-settle" style={{width: `${(data.scoring.fundamental_score / 30) * 100}%`}}></div>
                  </div>
                  <span className="text-sm font-bold text-white font-number w-8 text-right">{data.scoring.fundamental_score}</span>
                </div>
                {/* Flow */}
                <div className="flex items-center gap-3">
                  <span className="text-xs text-tv-muted font-sans w-28">Money Flow (0-30)</span>
                  <div className="flex-1 bg-tv-hover rounded-full h-3 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-tv-yellow/80 to-tv-yellow rounded-full transition-[width] duration-700 ease-settle" style={{width: `${(data.scoring.flow_score / 30) * 100}%`}}></div>
                  </div>
                  <span className="text-sm font-bold text-white font-number w-8 text-right">{data.scoring.flow_score}</span>
                </div>
                {/* Risk - baru (BUILD 002), turunan dari analyzer Volatility (ATR 14).
                    Makin tinggi = makin aman (konsisten "tinggi = baik" seperti kategori
                    lain) - BUKAN raw volatility percentage. Tidak ikut total_score. */}
                {risk !== null && (
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-tv-muted font-sans w-28">Risk (0-100)</span>
                    <div className="flex-1 bg-tv-hover rounded-full h-3 overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-tv-red/80 to-tv-red rounded-full transition-[width] duration-700 ease-settle" style={{width: `${risk}%`}}></div>
                    </div>
                    <span className="text-sm font-bold text-white font-number w-8 text-right">{risk}</span>
                  </div>
                )}

                {/* Storytelling: lima bar di atas menunjukkan komponen mana yang kuat,
                    tapi tidak pernah menyebut komponen mana yang MENAHAN skornya.
                    Dihitung dari porsi tiap komponen terhadap pagunya sendiri, bukan
                    dari nilai mentah - technical 20/40 dan fundamental 20/30 bukan
                    prestasi yang sama. */}
                {(() => {
                  const parts = [
                    { name: 'Technical', pct: data.scoring.technical_score / 40 },
                    { name: 'Fundamental', pct: data.scoring.fundamental_score / 30 },
                    { name: 'Money Flow', pct: data.scoring.flow_score / 30 },
                  ].filter((p) => Number.isFinite(p.pct));
                  if (parts.length < 3) return null;
                  const sorted = [...parts].sort((a, b) => b.pct - a.pct);
                  const best = sorted[0];
                  const worst = sorted[sorted.length - 1];
                  return (
                    <p className="mt-3 pt-3 border-t border-tv-border text-[11px] leading-relaxed text-tv-muted">
                      Skor ini paling ditopang <span className="text-tv-text font-medium">{best.name}</span> ({Math.round(best.pct * 100)}% dari pagunya)
                      dan paling ditahan <span className="text-tv-text font-medium">{worst.name}</span> ({Math.round(worst.pct * 100)}%).
                      {worst.pct < 0.4 && ` Perbaikan terbesar untuk saham ini akan datang dari sisi ${worst.name.toLowerCase()}.`}
                    </p>
                  );
                })()}
              </div>

              {/* Reasons & Risk */}
              <div className="flex-1 space-y-3">
                <div className="text-[10px] font-sans font-semibold text-tv-muted uppercase tracking-wider mb-2">TOP 3 ALASAN</div>
                {data.scoring.alasan_3_poin?.map((reason: string, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className="text-tv-green font-bold">âœ“</span>
                    <span className="text-tv-text font-sans">{reason}</span>
                  </div>
                ))}
                {data.scoring.risk && (
                  <div className="mt-3 pt-3 border-t border-tv-border">
                    <div className="text-[10px] font-sans font-semibold text-tv-muted uppercase tracking-wider mb-1">RISK</div>
                    <div className="flex items-start gap-2 text-xs">
                      <span className="text-tv-red font-bold">âš </span>
                      <span className="text-tv-muted font-sans">{data.scoring.risk}</span>
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
              <span className="text-[10px] font-sans font-semibold text-tv-muted uppercase">LensRadar</span>
              <div className="text-sm text-white">
                Skor <strong className="font-number">{radarRank.finalScore}</strong>
                {radarRank.topReasons?.[0] && <span className="text-tv-muted"> â€” {radarRank.topReasons[0]}</span>}
              </div>
            </div>
          </div>
        )}

        {/* Main Layout */}
        <div className="flex flex-col gap-6">
          {/* BUG 3 FIX: MA Status Badge */}
          {data?.scoring && (() => {
            // BUG FIX (audit 2026-08-05, temuan M-8): MA50/MA200 dulu di-parse dari
            // string tampilan analyzer; kalau analyzer mengembalikan 'N/A' (histori < 200
            // bar) hasilnya 0, dan getMAStatus(price, 0, 0) menyimpulkan UPTREND karena
            // harga selalu > 0. Sekarang pakai `raw` dan tampilkan "data belum cukup".
            const price = data.price;
            const maResult = analyzers.find((a: any) => a.label?.includes('MA Trend'));
            const ma50 = typeof maResult?.raw?.ma50 === 'number' ? maResult.raw.ma50 : null;
            const ma200 = typeof maResult?.raw?.ma200 === 'number' ? maResult.raw.ma200 : null;
            const maDataReady = ma50 != null && ma200 != null && typeof price === 'number';
            const status = maDataReady
              ? getMAStatus(price, ma50 as number, ma200 as number)
              : { label: 'Data historis belum cukup (butuh 200 hari bursa)', color: 'text-tv-muted', bg: 'bg-tv-hover border-tv-border' };
            return (
              <div className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border ${status.bg}`}>
                <Activity className={`w-5 h-5 ${status.color}`} />
                <div>
                  <div className="text-[10px] font-sans font-semibold text-tv-muted uppercase">MA STATUS</div>
                  <div className={`text-sm font-bold font-sans ${status.color}`}>{status.label}</div>
                </div>
                <div className="ml-auto text-right text-xs font-number text-tv-muted">
                  <span>MA50: <strong className="text-white">{ma50 != null ? Math.round(ma50) : 'N/A'}</strong></span>
                  <span className="mx-2">|</span>
                  <span>MA200: <strong className="text-white">{ma200 != null ? Math.round(ma200) : 'N/A'}</strong></span>
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
              technical={chartTechnical}
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
                      : `${overall} â€¢ ${positif} positif, ${negatif} negatif, ${netral} netral dari ${stockNews.length} berita`}
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
      </PageContainer>

      {/* AI Explain Modal */}
      {aiModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-tv-bg border-2 border-tv-blue/50 rounded-xl w-full max-w-md overflow-hidden shadow-2 flex flex-col">
            <div className="p-4 border-b border-tv-border flex items-center justify-between bg-tv-card">
              <div className="flex items-center gap-2">
                <span className="text-xl">âœ¨</span>
                <h3 className="font-heading text-tv-text font-bold">
                  AI Explain: {aiModalData?.algo?.label}
                </h3>
              </div>
              <button
                onClick={() => setAiModalOpen(false)}
                className="text-tv-muted hover:text-tv-text transition-colors"
              >
                âœ•
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
                <span className="text-xl">ðŸ’°</span>
                <h3 className="font-heading text-tv-text font-bold">
                  {tradeType} Virtual Trade
                </h3>
              </div>
              <button
                onClick={() => setTradeModalOpen(false)}
                className="text-tv-muted hover:text-tv-text transition-colors"
              >
                âœ•
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

      {/* Blok <style> .custom-scrollbar dihapus: kelas itu tidak dipakai satu kali pun
          di file ini (CSS mati), dan warnanya - #131722/#2A2E39 - berasal dari palet
          yang bahkan lebih tua dari tv-* sebelum penggantian hari ini. Scrollbar
          global sudah diatur di app/globals.css. */}
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




