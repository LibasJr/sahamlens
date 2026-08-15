'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Header from '@/components/Header';
import IntrinsicValue from '@/components/IntrinsicValue';
import PaywallModal from '@/components/PaywallModal';
import { FREE_LIMITS } from '@/shared/constants/limits';
import { MONTHLY_PRICE, formatRupiah } from '@/shared/config/pricing';
import { isMarketOpen } from '@/lib/utils/market';
// TradingViewChart dihapus dari daftar impor: halaman ini tidak pernah merendernya
// (lihat komentar `tech` dihapus di bawah - tidak ada satu pun <TradingViewChart/> di
// file ini). Impor matinya tetap menarik lightweight-charts ke bundel setiap pengunjung
// /fundamental. Ikon Brain & AlertTriangle juga tidak dipakai di mana pun.
import {
  Zap, ArrowUpRight, ArrowDownRight, Layers,
  RefreshCw, ShieldCheck, TrendingUp, Info, Lock
} from 'lucide-react';
import { PageContainer, Skeleton, EmptyState, LoadingFact, TickerAvatar, AnimatedNumber } from '@/components/ui';
import { fmtKali, fmtPersen, fmtTriliun } from '@/shared/format/fundamental-format';
import FundamentalExportCard from '@/components/export/FundamentalExportCard';
import ExportImageButton from '@/components/export/ExportImageButton';
import AnalysisViewModeToggle from '@/components/AnalysisViewModeToggle';
import AnalysisGlossary from '@/components/AnalysisGlossary';
import { buildExportFileName } from '@/shared/format/export-filename';
import { shouldShowLoginPromptFor401 } from '@/lib/auth-gate';
import { useAuthUser } from '@/lib/hooks/useAuthUser';

// Normalisasi simbol: pastikan hanya 1x .JK
const displayTicker = (s: string) => s.replace('.JK', '').replace('.JK', '');

// Tiga indikator ini tetap terbuka agar pengunjung memahami konteks valuasi dan
// profitabilitas. Sisanya disamarkan sampai mereka membuat akun gratis - pola yang
// sama seperti LensTechnical, tetapi CTA-nya sengaja "Daftar Gratis", bukan Pro.
const FUNDAMENTAL_GUEST_VISIBLE_KEYWORDS = ['P/E', 'PBV', 'ROE'];

function isVisibleForFundamentalGuest(label: string): boolean {
  return FUNDAMENTAL_GUEST_VISIBLE_KEYWORDS.some((keyword) => label.includes(keyword));
}

const splitStatusText = (value?: string | null) => {
  const text = (value || '').trim();
  if (!text) return { primary: 'AWAITING', detail: '' };
  const match = text.match(/^([^()]+?)\s*(?:\((.+)\))?$/);
  return {
    primary: (match?.[1] || text).trim(),
    detail: (match?.[2] || '').trim(),
  };
};

// BUG FIX (2026-08-01): sama seperti /dcf - dulu tidak baca ?symbol= dari URL sama
// sekali, cuma localStorage. Ditambah prioritas URL param supaya link dari Technical
// Analyzer (yang sekarang mengirim ?symbol=<ticker aktif>) langsung akurat.
function FundamentalContent() {
  const searchParams = useSearchParams();
  const { loading: authLoading, resolved: authResolved, user } = useAuthUser();
  const [ticker, setTickerState] = useState('BBCA');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [marketClosed, setMarketClosed] = useState(false);
  const [scores, setScores] = useState<Record<string, { correct: number, wrong: number }>>({});
  const [sortByConfidence, setSortByConfidence] = useState(false);
  const [viewMode, setViewMode] = useState<'compact' | 'full'>('full');
  const [mounted, setMounted] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const fundamentalExportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem('sahamlens.analysis-view.fundamental');
    if (saved === 'compact' || saved === 'full') {
      setViewMode(saved);
      return;
    }
    if (window.matchMedia('(max-width: 767px)').matches) setViewMode('compact');
  }, []);

  const changeViewMode = (mode: 'compact' | 'full') => {
    setViewMode(mode);
    window.localStorage.setItem('sahamlens.analysis-view.fundamental', mode);
  };

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
      // Fetch data for chart and fundamental analyzers in parallel!
      const [resStock, resAlgo] = await Promise.all([
        fetch(`/api/stock/${symbol}`),
        fetch(`/api/fundamental/${symbol}`)
      ]);

      const jsonStock = await resStock.json();
      const jsonAlgo = await resAlgo.json();

      if (resStock.status === 401) {
        if (await shouldShowLoginPromptFor401()) {
          setShowLoginPrompt(true);
        } else {
          setFetchError(true);
        }
        return;
      }
      if (resStock.status === 402 || jsonStock.code === 'SUBSCRIPTION_REQUIRED') {
        setShowPaywall(true);
        return;
      }

      // BUG FIX (2026-08-06): status `resAlgo` tidak pernah diperiksa - hanya
      // `resStock`. Padahal data halaman ini SELURUHNYA berasal dari jsonAlgo.
      // Kalau /api/fundamental membalas 500, alurnya jatuh diam-diam ke cabang
      // `if (jsonAlgo?.stock)` yang gagal, `data` tetap null, dan halaman
      // menampilkan "Limit analisa habis atau terjadi kesalahan" - menyalahkan
      // kuota pengguna atas kegagalan server.
      if (!resAlgo.ok || jsonAlgo?.error || !jsonAlgo?.stock) {
        setFetchError(true);
        return;
      }

      {
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
            score: jsonAlgo.score,
            modelSignal: jsonStock?.scoring?.kategori,
            decision: jsonStock?.decision,
            eligibility: jsonStock?.eligibility
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
      if (!document.hidden && !closed) {
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
  // `tech` dan `candles` dihapus (audit 2026-08-05 / 2026-08-06): keduanya variabel
  // mati - /api/fundamental tidak pernah mengembalikan field `technical`, dan halaman
  // ini tidak merender chart sama sekali, jadi histori candle-nya tidak pernah dipakai.
  let analyzers = data?.analyzers || [];

  if (loading && !data) {
    return (
      <div className="flex-1 flex flex-col bg-tv-bg min-h-screen">
        <Header currentTicker={ticker} onTickerChange={setTicker} moduleTitle="LensFundamental" moduleBank="LENSFUNDAMENTAL" />
        {/* Sebelumnya satu spinner teal-500 - warna yang tidak ada di palet - di tengah
            halaman kosong. Kerangka di bawah mengikuti bentuk halaman aslinya. */}
        <PageContainer className="p-4 md:p-6 lg:p-7 space-y-6">
          <Skeleton className="h-24 w-full" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Skeleton className="h-48 w-full" />
            <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-3 gap-4">
              {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
            </div>
          </div>
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
          moduleTitle="LensFundamental"
          moduleBank="LENSFUNDAMENTAL"
        />
        {/* Pesan lama menyalahkan kuota pengguna untuk SEMUA sebab kegagalan, dan
            tidak menyediakan tombol coba lagi sama sekali. */}
        <PageContainer className="p-4 md:p-6 lg:p-7">
          {showLoginPrompt ? (
            <EmptyState
              illustration="locked"
              title="Analisa fundamental butuh akun"
              description="Daftar gratis - dapat trial 7 hari akses penuh sebelum diminta upgrade."
              action={{ label: 'Daftar Gratis', onClick: () => { window.location.href = '/signup'; } }}
            />
          ) : showPaywall ? (
            <EmptyState
              illustration="locked"
              title="Kuota analisa hari ini sudah habis"
              description={`Kuota gratis ${FREE_LIMITS.analisaPerHari} analisa per hari sudah terpakai. Kuota disetel ulang besok.`}
              action={{ label: 'Lihat Paket Pro', onClick: () => setShowPaywall(true) }}
            />
          ) : (
            <EmptyState
              illustration="empty"
              title={`Data fundamental ${displayTicker(ticker)} gagal dimuat`}
              description="Permintaan ke sumber data tidak sampai. Emiten yang baru tercatat atau jarang diperdagangkan kadang memang belum punya data fundamental di sumber ini."
              action={{ label: 'Coba lagi', onClick: () => fetchAnalyzerData(ticker) }}
            />
          )}
        </PageContainer>
        <PaywallModal
          open={showPaywall}
          onClose={() => setShowPaywall(false)}
          title="Limit Gratis Habis"
          body={`Kamu sudah pakai ${FREE_LIMITS.analisaPerHari}/${FREE_LIMITS.analisaPerHari} analisa hari ini. Upgrade Pro ${formatRupiah(MONTHLY_PRICE)}/bulan untuk unlimited 10 filters + LensRadar LIVE.`}
          benefits={[
            'Unlimited LensTechnical (10 filter)',
            'LensRadar LIVE, LensConsensus & Compare Tool',
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

  const filteredAnalyzers = analyzers.filter((algo: any) => {
    if (algo.value === 'N/A' && algo.confidence === 0) return false;
    if (data?.profile?.sector?.includes('Financial') || data?.profile?.industry?.includes('Bank')) {
      if (algo.label?.includes('Debt') || algo.label?.includes('Current Ratio') || algo.label?.includes('Quick Ratio')) return false;
    }
    return true;
  });

  // Mode Ringkas tidak memilih tiga confidence tertinggi secara buta. Pilih satu wakil
  // dari dimensi valuasi, profitabilitas, dan pertumbuhan/margin agar tidak cherry-pick.
  const compactAnalyzers = (() => {
    const groups = [
      ['P/E', 'PBV', 'Valuation'],
      ['ROE', 'ROA', 'Profitability'],
      ['Operating Margin', 'Net Profit Margin', 'Revenue Growth', 'EPS Growth', 'Dividend Yield'],
    ];
    const picked: any[] = [];
    for (const keywords of groups) {
      const candidates = filteredAnalyzers.filter((algo: any) => keywords.some((k) => algo.label?.includes(k)) && !picked.includes(algo));
      candidates.sort((a: any, b: any) => (b.confidence || 0) - (a.confidence || 0));
      if (candidates[0]) picked.push(candidates[0]);
    }
    for (const algo of filteredAnalyzers) {
      if (picked.length >= 3) break;
      if (!picked.includes(algo)) picked.push(algo);
    }
    return picked.slice(0, 3);
  })();
  const displayedAnalyzers = viewMode === 'compact' ? compactAnalyzers : filteredAnalyzers;
  const lowSampleCount = displayedAnalyzers.filter((algo: any) => getAccuracyPct(algo.label) == null).length;
  // Kalau status sesi gagal dibaca, jangan mengunci UI secara keliru. Hanya tamu yang
  // sudah terkonfirmasi melihat teaser kartu; user yang sudah login tetap melihat
  // seluruh indikator, terlepas dari status trial/Pro-nya.
  const isConfirmedGuest = authResolved && !authLoading && !user;
  const lockedAnalyzerCount = isConfirmedGuest
    ? filteredAnalyzers.filter((algo: any) => !isVisibleForFundamentalGuest(algo.label)).length
    : 0;

  return (
    <div className="flex-1 flex flex-col bg-tv-bg min-h-screen">
      <Header
        currentTicker={ticker}
        onTickerChange={setTicker}
        moduleTitle="LensFundamental"
        moduleBank="LENSFUNDAMENTAL"
      />

      <PageContainer className="p-4 md:p-6 lg:p-7 space-y-6">
        {/* Status Badge */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
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

        <AnalysisViewModeToggle mode={viewMode} onChange={changeViewMode} />
        <AnalysisGlossary />

        {/* Kartu export offscreen - selalu di DOM (kalau data ada) supaya ExportImageButton
            punya node valid untuk di-screenshot, tapi tidak terlihat/tidak mengubah layout
            halaman.
            BUG FIX (2026-08-05, percobaan #2): percobaan #1 (`width:0, height:0,
            overflow:hidden` LANGSUNG di elemen yang di-ref/di-capture) bikin
            html-to-image screenshot kotak 0x0 -> PNG 0 byte (dikonfirmasi user). Sekarang
            wrapper penyembunyi (opacity:0, tidak ke-klik, tidak ganggu layout user) dipisah
            dari elemen yang di-ref - elemen yang di-ref TIDAK dikasih style penyembunyi
            apa pun jadi ukuran aslinya (1080x1350, dari class di FundamentalExportCard)
            tetap utuh saat di-capture. opacity tidak diwariskan sebagai computed style ke
            child, jadi computed opacity elemen yang di-ref tetap 1 walau wrapper luarnya 0. */}
        {data && (
          <div style={{ position: 'fixed', top: 0, left: 0, opacity: 0, pointerEvents: 'none', zIndex: -1 }}>
            <div ref={fundamentalExportRef}>
            <FundamentalExportCard
              ticker={ticker}
              stock={stock}
              fundamentals={data?.fundamentals || {}}
              profile={data?.profile || {}}
              consensus={data?.consensus}
              exportedAt={new Date()}
            />
            </div>
          </div>
        )}

        {/* Top Summary Banner */}
        <div className="bg-tv-card border border-tv-border rounded-xl p-4 sm:p-5 shadow-1 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            {/* Ikon petir kuning identik untuk semua emiten diganti avatar per-emiten. */}
            <TickerAvatar symbol={stock.symbol || ticker} size="lg" />
            <div>
              <div className="flex min-w-0 items-baseline gap-2 sm:gap-3">
                <h1 className="shrink-0 text-xl font-bold tracking-tight text-white font-heading sm:text-2xl">{displayTicker(stock.symbol || ticker)}.JK</h1>
                <span className="min-w-0 truncate text-xs text-tv-muted font-sans font-normal sm:text-sm">{stock.name || ticker.replace('.JK', '')}</span>
              </div>
              <div className="flex items-center gap-3 mt-1">
                {typeof stock.current_price === 'number' && Number.isFinite(stock.current_price) ? (
                  <AnimatedNumber
                    value={stock.current_price}
                    format={(n) => `Rp ${Math.round(n).toLocaleString('id-ID')}`}
                    className="font-number text-xl font-bold text-white tabular-nums sm:text-2xl"
                  />
                ) : (
                  <span className="text-sm text-tv-muted">Harga tidak tersedia dari sumber data</span>
                )}
                {typeof stock.change_pct === 'number' && Number.isFinite(stock.change_pct) ? (
                  <span className={`font-number text-sm font-bold flex items-center gap-0.5 ${
                    stock.change_pct >= 0 ? 'text-tv-green' : 'text-tv-red'
                  }`}>
                    {stock.change_pct >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                    {stock.change_pct > 0 ? `+${stock.change_pct}` : stock.change_pct}%
                  </span>
                ) : (
                  <span className="text-sm font-bold text-tv-muted">N/A</span>
                )}
              </div>
            </div>
          </div>

          <div className="grid w-full grid-cols-2 gap-3 md:flex md:w-auto md:items-stretch md:gap-3">
             {data?.bestPerformer && (
                <div className="text-right border-r border-tv-border pr-6 hidden md:block">
                  <div className="text-[10px] text-tv-muted uppercase tracking-wide">TOP METHOD TODAY</div>
                  <div className="text-lg font-bold text-white flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-tv-green" />
                    {data.bestPerformer.label} ({data.bestPerformer.confidence}% Conf)
                  </div>
                </div>
             )}
            {/* BUG FIX (audit skor fundamental 2026-08-05, laporan user - KOTA.JK
                dilabeli "UNDERVALUED" di sini padahal Intrinsic Value bilang overvalued
                253%): badge ini SEKARANG murni valuasi (murah/mahal, dari margin of
                safety hasil calculateIntrinsicValue - metode yang SAMA dipakai Intrinsic
                Value di bawah), bukan lagi vote 13-analyzer campur aduk kualitas+valuasi.
                Cek warna diganti dari 'BULLISH'/'BEARISH' (kata itu sudah tidak pernah
                muncul lagi di string consensus) jadi 'UNDERVALUED'/'OVERVALUED'. */}
            <div className="min-w-0">
              {/* BUG FIX (2026-08-14, laporan pengguna - kartu "Bagus" & "Undervalued"
                  tidak sejajar di HP): label "Kualitas Fundamental" lebih panjang dari
                  "Valuasi Harga" dan pecah jadi 2 baris di layar sempit, sementara
                  labelnya sendiri tidak punya tinggi tetap - jadi kartu di bawahnya ikut
                  turun cuma di satu kolom. min-h di sini menyamakan tinggi kedua label
                  (cukup untuk 2 baris) supaya kedua kartu selalu mulai di garis yang sama,
                  baik labelnya 1 baris maupun 2 baris. */}
              <div className="mb-1.5 flex min-h-[28px] items-center justify-center text-center text-[10px] font-sans font-semibold uppercase tracking-wide text-tv-muted">Valuasi Harga</div>
              {(() => {
                const valuation = splitStatusText(data?.consensus);
                return (
                  <div className={`min-h-[64px] w-full rounded-xl border px-3 py-2 flex flex-col items-center justify-center text-center font-sans ${
                    data?.consensus?.includes('UNDERVALUED')
                      ? 'bg-tv-green/10 text-tv-green border-tv-green/30'
                      : data?.consensus?.includes('OVERVALUED')
                      ? 'bg-tv-red/10 text-tv-red border-tv-red/30'
                      : 'bg-tv-yellow/10 text-tv-yellow border-tv-yellow/30'
                  }`}>
                    <div className="flex items-center justify-center gap-1.5">
                      {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4 shrink-0" />}
                      <span className="text-sm font-bold leading-tight">{loading ? 'Calculating...' : valuation.primary}</span>
                    </div>
                    {!loading && valuation.detail && <div className="mt-1 text-[11px] font-semibold opacity-80 sm:text-xs">{valuation.detail}</div>}
                  </div>
                );
              })()}
            </div>

            <div className="min-w-0">
              {/* BUG FIX (2026-08-14, laporan pengguna lanjutan - min-h-[28px] ternyata
                  belum cukup untuk 2 baris di beberapa lebar layar, kartu masih tidak
                  sejajar): label dipendekkan jadi "Fundamental" saja supaya SELALU 1
                  baris seperti "Valuasi Harga" di sampingnya - pendekatan yang lebih
                  tahan lebar layar mana pun daripada menebak tinggi 2 baris. */}
              <div className="mb-1.5 flex min-h-[28px] items-center justify-center text-center text-[10px] font-sans font-semibold uppercase tracking-wide text-tv-muted">Fundamental</div>
              <div className={`min-h-[64px] w-full rounded-xl border px-3 py-2 flex flex-col items-center justify-center text-center font-sans ${
                data?.fundamentalQuality?.label === 'BAGUS'
                  ? 'bg-tv-green/10 text-tv-green border-tv-green/30'
                  : data?.fundamentalQuality?.label === 'BURUK'
                  ? 'bg-tv-red/10 text-tv-red border-tv-red/30'
                  : 'bg-tv-yellow/10 text-tv-yellow border-tv-yellow/30'
              }`}>
                <div className="flex items-center justify-center gap-1.5">
                  {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4 shrink-0" />}
                  <span className="text-sm font-bold leading-tight">
                    {loading ? 'Calculating...' : data?.fundamentalQuality?.label || 'AWAITING'}
                  </span>
                </div>
                {!loading && data?.fundamentalQuality && (
                  <div className="mt-1 text-[11px] font-semibold opacity-80 sm:text-xs">Score {data.fundamentalQuality.pct}%</div>
                )}
              </div>
            </div>
            </div>
          </div>

        {/* Storytelling: dua badge di atas sengaja memisahkan "murah atau mahal" dari
            "bisnisnya bagus atau buruk" - tapi yang menentukan keputusan justru
            KOMBINASI keduanya, dan itu tidak pernah dinyatakan di mana pun. Empat
            kuadrannya punya arti yang sangat berbeda, termasuk perangkap klasik
            "murah karena memang bisnisnya sedang rusak". */}
        {data?.consensus && data?.fundamentalQuality?.label && (() => {
          const murah = data.consensus.includes('UNDERVALUED');
          const mahal = data.consensus.includes('OVERVALUED');
          const bagus = data.fundamentalQuality.label === 'BAGUS';
          const buruk = data.fundamentalQuality.label === 'BURUK';
          if (!(murah || mahal) || !(bagus || buruk)) return null;

          const verdict =
            murah && bagus ? { tone: 'border-tv-green/30 bg-tv-green/5 text-tv-green', text: 'Bisnisnya dinilai bagus DAN harganya di bawah nilai wajar - kuadran yang paling dicari. Periksa apakah ada risiko yang belum tercermin di rasio (perkara hukum, ketergantungan pada satu pelanggan, tata kelola).' }
            : murah && buruk ? { tone: 'border-tv-warning/30 bg-tv-warning/5 text-tv-warning', text: 'Harganya murah TAPI kualitas fundamentalnya buruk. Ini pola perangkap nilai (value trap): harga rendah sering merupakan penilaian pasar yang benar atas bisnis yang sedang memburuk, bukan diskon.' }
            : mahal && bagus ? { tone: 'border-tv-blue/30 bg-tv-blue/5 text-tv-blue', text: 'Bisnisnya bagus TAPI harganya sudah di atas nilai wajar. Kualitas tidak menghapus risiko harga - membeli perusahaan bagus di harga terlalu tinggi tetap bisa merugi bertahun-tahun.' }
            : { tone: 'border-tv-red/30 bg-tv-red/5 text-tv-red', text: 'Harganya di atas nilai wajar DAN kualitas fundamentalnya buruk - kuadran dengan pembenaran paling lemah dari kedua sisi.' };

          return (
            <div className={`rounded-lg border px-4 py-3 ${verdict.tone}`}>
              <div className="text-[10px] font-semibold uppercase tracking-wide opacity-70">Kombinasi Valuasi &times; Kualitas</div>
              <p className="mt-1 text-[11px] leading-relaxed text-tv-text">{verdict.text}</p>
            </div>
          );
        })()}

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
                  <div className="text-xs text-tv-muted uppercase tracking-wide mb-1">Sektor & Industri</div>
                  {/* `|| '-'` sebelumnya menghasilkan "- / -" yang tidak membedakan
                      "emiten ini belum diklasifikasi sumber data" dari "gagal dimuat". */}
                  <div className="text-sm text-white font-bold">
                    {data?.profile?.sector || data?.profile?.industry ? (
                      <>
                        {data?.profile?.sector || 'Sektor belum diklasifikasi'}
                        <span className="text-tv-muted font-normal"> / </span>
                        {data?.profile?.industry || 'industri belum diklasifikasi'}
                      </>
                    ) : (
                      <span className="text-tv-muted font-normal">Sumber data belum mengklasifikasi emiten ini</span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-tv-muted uppercase tracking-wide mb-1">Deskripsi Bisnis</div>
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
                  LensFundamental
                </h3>
                <button 
                  onClick={() => setSortByConfidence(!sortByConfidence)}
                  className={`text-xs px-2 py-1 rounded border transition-colors ${sortByConfidence ? 'bg-tv-accent/20 border-tv-accent text-tv-accent' : 'border-tv-border text-tv-muted hover:text-white'}`}
                >
                  Sort by Confidence
                </button>
              </div>

              {lockedAnalyzerCount > 0 && (
                <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-tv-yellow/30 bg-tv-yellow/10 px-3 py-2 text-xs text-tv-yellow">
                  <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{lockedAnalyzerCount} indikator fundamental terkunci (ROA, rasio likuiditas, margin, pertumbuhan, dll).</span>
                  <a href="/signup" className="font-bold underline underline-offset-2 hover:text-white">Daftar gratis untuk buka</a>
                </div>
              )}

              {lowSampleCount > 0 && (
                <div className="mb-4 rounded-lg border border-tv-border bg-tv-bg/70 px-3 py-2 text-[11px] leading-relaxed text-tv-muted">
                  <span className="font-semibold text-tv-text">Validasi historis indikator masih mengumpulkan sampel.</span>{' '}
                  {lowSampleCount} dari {displayedAnalyzers.length} indikator yang tampil belum mencapai minimum 20 observasi. Detail hit-rate akan muncul setelah sampel cukup.
                </div>
              )}
              {viewMode === 'compact' && filteredAnalyzers.length > displayedAnalyzers.length && (
                <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-tv-blue/25 bg-tv-blue/10 px-3 py-2 text-[11px] text-tv-muted">
                  <span>Mode Ringkas menampilkan wakil valuasi, profitabilitas, dan pertumbuhan/margin — bukan hanya tiga confidence tertinggi.</span>
                  <button type="button" onClick={() => changeViewMode('full')} className="shrink-0 font-semibold text-tv-blue">Lihat semua</button>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 max-h-[500px] overflow-y-auto pr-2">
                {displayedAnalyzers.length > 0 ? displayedAnalyzers.map((algo: any, idx: number) => {
                  const isTop3 = sortByConfidence && idx < 3;
                  const lockedForGuest = isConfirmedGuest && !isVisibleForFundamentalGuest(algo.label);
                  if (lockedForGuest) {
                    return (
                      <div key={idx} className="relative flex min-h-[104px] flex-col gap-2 overflow-hidden rounded-lg border border-tv-border bg-tv-bg p-3">
                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-tv-bg/70 backdrop-blur-[3px]">
                          <a
                            href="/signup"
                            className="flex items-center gap-1 rounded-full border border-tv-yellow/40 bg-tv-yellow/10 px-2 py-1 text-[10px] font-bold text-tv-yellow transition-colors hover:border-tv-yellow hover:text-white"
                            aria-label={`Daftar gratis untuk membuka indikator ${algo.label}`}
                          >
                            <Lock className="h-3 w-3" aria-hidden="true" /> Daftar Gratis
                          </a>
                        </div>
                        <div className="flex justify-between items-center text-sm blur-sm select-none" aria-hidden="true">
                          <span className="text-white font-bold">{algo.label}</span>
                          <span className="font-sans text-xs font-bold px-2 py-0.5 rounded bg-tv-yellow/20 text-tv-yellow">
                            {algo.decision}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-xs font-mono text-tv-muted blur-sm select-none" aria-hidden="true">
                          <span>{algo.value}</span>
                          <span className="text-white">Conf: {algo.confidence}%</span>
                        </div>
                      </div>
                    );
                  }
                  return (
                    // shadow hex rgba(34,171,148,...) adalah hijau kebiruan dari palet
                    // lama - tidak sama dengan tv-green mana pun yang dipakai sekarang.
                    <div key={idx} className={`p-3 rounded-lg bg-tv-bg border flex flex-col gap-2 transition-colors ${isTop3 ? 'border-tv-green shadow-[0_0_10px_rgba(34,197,94,0.2)]' : 'border-tv-border hover:border-tv-borderLight'}`}>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-white font-bold">{algo.label}</span>
                        {/* BUG FIX (2026-08-06, sweep "font beda" - laporan user): font-mono
                            khusus data tabular/kode (aturan app/globals.css), bukan kata status. */}
                        <span className={`font-sans text-xs font-bold px-2 py-0.5 rounded ${
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
                        {getAccuracyPct(algo.label) ? (
                          <>
                            <span className="text-tv-muted block">Hit-rate historis (saham ini)</span>
                            <span className="font-bold text-tv-accent">{getAccuracyPct(algo.label)}</span>
                          </>
                        ) : (
                          <span className="inline-flex rounded-full border border-tv-border bg-tv-card px-2 py-0.5 font-medium text-tv-muted" title="Belum mencapai minimum 20 observasi">
                            Sampel rendah <Info className="ml-1 h-3 w-3" aria-hidden="true" />
                          </span>
                        )}
                      </div>
                    </div>
                  );
                }) : loading ? (
                  <>
                    {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-[104px] w-full" />)}
                    <div className="col-span-full"><LoadingFact /></div>
                  </>
                ) : (
                  <div className="col-span-full">
                    <EmptyState
                      illustration="empty"
                      title="Belum ada indikator fundamental untuk emiten ini"
                      description="Sumber data tidak menyediakan rasio keuangan yang cukup untuk dihitung. Emiten yang baru tercatat biasanya butuh beberapa periode laporan sebelum rasionya muncul."
                    />
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
        body={`Kamu sudah pakai ${FREE_LIMITS.analisaPerHari}/${FREE_LIMITS.analisaPerHari} analisa hari ini. Upgrade Pro ${formatRupiah(MONTHLY_PRICE)}/bulan untuk unlimited 10 filters + LensRadar LIVE.`}
        benefits={[
          'Unlimited LensTechnical (10 filter)',
          'LensRadar LIVE, LensConsensus & Compare Tool',
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

      {/* Blok <style> .custom-scrollbar dihapus - warnanya (#131722/#2A2E39) berasal
          dari palet yang lebih tua dari tv-*, dan app/globals.css sudah menata seluruh
          scrollbar aplikasi dengan warna palet yang berlaku. */}
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
