'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Header from '@/components/Header';
import IntrinsicValue from '@/components/IntrinsicValue';
import PaywallModal from '@/components/PaywallModal';
import { getUsedSymbolsToday, FREE_LIMITS } from '@/lib/limits';
import { isMarketOpen } from '@/lib/utils/market';
// TradingViewChart dihapus dari daftar impor: halaman ini tidak pernah merendernya
// (lihat komentar `tech` dihapus di bawah - tidak ada satu pun <TradingViewChart/> di
// file ini). Impor matinya tetap menarik lightweight-charts ke bundel setiap pengunjung
// /fundamental. Ikon Brain & AlertTriangle juga tidak dipakai di mana pun.
import {
  Zap, ArrowUpRight, ArrowDownRight, Layers,
  RefreshCw, ShieldCheck, TrendingUp
} from 'lucide-react';
import { PageContainer, Skeleton, EmptyState, LoadingFact, TickerAvatar, AnimatedNumber } from '@/components/ui';
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
  const [fetchError, setFetchError] = useState(false);
  const fundamentalExportRef = useRef<HTMLDivElement>(null);

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
        setShowLoginPrompt(true);
        return;
      }
      if (resStock.status === 402 || jsonStock.code === 'SUBSCRIPTION_REQUIRED') {
        setUsedSymbolsToday(getUsedSymbolsToday());
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
              description={`Kuota gratis ${FREE_LIMITS.analisaPerHari} analisa per hari sudah terpakai${usedSymbolsToday.length ? ` untuk ${usedSymbolsToday.slice(0, 3).map(displayTicker).join(', ')}` : ''}. Kuota disetel ulang besok.`}
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
        <div className="bg-tv-card border border-tv-border rounded-xl p-5 shadow-1 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {/* Ikon petir kuning identik untuk semua emiten diganti avatar per-emiten. */}
            <TickerAvatar symbol={stock.symbol || ticker} size="lg" />
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-extrabold text-white font-heading">{displayTicker(stock.symbol || ticker)}.JK</h1>
                <span className="text-sm text-tv-muted font-sans font-normal">{stock.name || ticker.replace('.JK', '')}</span>
              </div>
              <div className="flex items-center gap-3 mt-1">
                {typeof stock.current_price === 'number' && Number.isFinite(stock.current_price) ? (
                  <AnimatedNumber
                    value={stock.current_price}
                    format={(n) => `Rp ${Math.round(n).toLocaleString('id-ID')}`}
                    className="font-number text-2xl font-bold text-white tabular-nums"
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

          <div className="flex items-center gap-6">
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
            <div className="text-right">
              <div className="text-[10px] text-tv-muted uppercase tracking-wide">Valuasi Harga</div>
              {/* BUG FIX (2026-08-06, laporan user "font beda, kegedean"): font-mono
                  (JetBrains Mono, dikhususkan untuk kolom angka - lihat tailwind.config.js)
                  dulu dipakai untuk kata status ("UNDERVALUED"), bukan angka - itu sumber
                  "font-nya beda" dari badge sejenis di LensTechnical (yang sudah font-sans).
                  Ukuran turun dari text-xl font-extrabold ke text-sm font-bold - proporsional
                  ke label 10px di atasnya, tidak lagi 2x lebih besar dari sekitarnya. */}
              <div className={`text-sm font-bold font-sans px-3 py-1.5 rounded-lg border shadow-1 flex items-center gap-1.5 ${
                data?.consensus?.includes('UNDERVALUED')
                  ? 'bg-tv-green/20 text-tv-green border-tv-green'
                  : data?.consensus?.includes('OVERVALUED')
                  ? 'bg-tv-red/20 text-tv-red border-tv-red'
                  : 'bg-tv-yellow/20 text-tv-yellow border-tv-yellow'
              }`}>
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
                {loading ? 'Calculating...' : data?.consensus || 'AWAITING'}
              </div>
            </div>

            {/* Badge baru (audit skor fundamental 2026-08-05): "bisnisnya bagus atau
                buruk" dijawab TERPISAH dari "sahamnya murah atau mahal" di atas - dua
                pertanyaan beda, gak dicampur jadi satu skor yang menyesatkan (lihat
                consensus-labels.service.ts). */}
            <div className="text-right">
              <div className="text-[10px] text-tv-muted uppercase tracking-wide">Kualitas Fundamental</div>
              <div className={`text-sm font-bold font-sans px-3 py-1.5 rounded-lg border shadow-1 flex items-center gap-1.5 ${
                data?.fundamentalQuality?.label === 'BAGUS'
                  ? 'bg-tv-green/20 text-tv-green border-tv-green'
                  : data?.fundamentalQuality?.label === 'BURUK'
                  ? 'bg-tv-red/20 text-tv-red border-tv-red'
                  : 'bg-tv-yellow/20 text-tv-yellow border-tv-yellow'
              }`}>
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                {loading
                  ? 'Calculating...'
                  : data?.fundamentalQuality
                  ? `${data.fundamentalQuality.label} (${data.fundamentalQuality.pct}%)`
                  : 'AWAITING'}
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
                  LensTechnical
                </h3>
                <button 
                  onClick={() => setSortByConfidence(!sortByConfidence)}
                  className={`text-xs px-2 py-1 rounded border transition-colors ${sortByConfidence ? 'bg-tv-accent/20 border-tv-accent text-tv-accent' : 'border-tv-border text-tv-muted hover:text-white'}`}
                >
                  Sort by Confidence
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 max-h-[500px] overflow-y-auto pr-2">
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
                        {/* Lihat catatan label yang sama di components/AlgoFilters.tsx
                            (audit 2026-08-05, temuan C-3). */}
                        <span className="text-tv-muted block">Hit-rate tracking lokal</span>
                        <span className="font-bold text-tv-accent">{getAccuracyPct(algo.label) ?? 'Sampel belum cukup'}</span>
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

