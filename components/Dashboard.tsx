'use client';

import React, { useState, useRef } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { TrendingUp, ChevronRight, ArrowUpRight, ArrowDownRight, Sparkles } from 'lucide-react';
import TradingViewChart from '@/components/TradingViewChart';
import CommandPalette from '@/components/CommandPalette';
import { computeIndicators, generateInsight, computeMiniCouncil, moneyFlowLabel, type Indicators } from '@/lib/miniCouncil';
import { Card, SegmentedControl, Skeleton, EmptyState, LoadingFact, TickerAvatar } from '@/components/ui';
import { isMarketOpen } from '@/lib/utils/market';

// BUG FIX (2026-08-05, laporan user - "chart candle kok gak ada 1M, langsung 1 tahun"):
// '1M'/'3M' DIHILANGKAN dari daftar pilihan (bukan cuma default) - backend
// (app/api/public-chart/[ticker]/route.ts) sebenarnya sudah lama mendukung keduanya
// (tf=1M -> range 1mo, tf=3M -> range 3mo), yang berubah dulu cuma DEFAULT timeframe
// (dari '1M' ke '1Y', lihat komentar di route itu) - opsi 1M/3M ikut hilang dari sini
// sebagai efek samping yang tidak disengaja. Ditambahkan balik sebagai PILIHAN, default
// tetap '1Y' (tidak mengubah keputusan default yang sudah eksplisit).
const TIMEFRAMES = ['1D', '3D', '7D', '1M', '3M', '1Y', '10Y', 'ALL'];

// Running text ticker - saham + harga terkini, scroll otomatis di bawah header. List
// digandakan 2x supaya loop-nya mulus (translateX 0 -> -50% = tepat 1 putaran list asli).
function TickerTape({ items, failed }: { items: { symbol: string; price: number; changePct: number }[]; failed?: boolean }) {
  if (!items.length) {
    return (
      <div className="bg-tv-surface border-b border-tv-border h-[34px] flex items-center px-4">
        {failed ? (
          // Tanpa ini, kegagalan mengambil ringkasan pasar membuat baris ini tertulis
          // "Memuat harga saham..." selamanya di bagian paling atas halaman publik.
          <span className="text-[11px] text-tv-muted">
            Harga berjalan tidak tersedia saat ini. Bagian lain halaman tetap berfungsi.
          </span>
        ) : (
          <div className="flex items-center gap-4">
            {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} variant="text" className="w-24 h-3" />)}
          </div>
        )}
      </div>
    );
  }

  const loopItems = [...items, ...items];
  // Durasi proporsional ke jumlah item (bukan angka tetap) - dulu 70s fix terlalu cepat
  // begitu daftarnya panjang (~100 saham gabungan gainer+loser jadi cuma ~1.4 detik per
  // saham, kebaca sekilas doang). ~3.2 detik/saham konstan, minimum 60s biar daftar
  // pendek pun tetap santai dibaca.
  const durationSec = Math.max(60, Math.round(items.length * 3.2));

  return (
    // Bar warnanya SENGAJA tetap penuh layar (bg-tv-surface di div terluar) - itu bagian
    // dari desain full-bleed header+ticker, bukan bug. Yang bug adalah batas KONTEN-nya:
    // header pakai max-w-[1600px] mx-auto (di layar lebar, logo "SahamLens" mulai jauh
    // dari tepi sungguhan), tapi ticker cuma px-4 tanpa batas lebar - item pertamanya
    // mulai nyaris di tepi layar, terlihat "menembus" lewat batas tulisan SahamLens.
    // overflow-hidden dipindah ke wrapper max-w-[1600px] yang sama supaya area scroll
    // ticker sejajar dengan konten lain, warnanya tetap penuh.
    <div className="sahamlens-ticker-wrap bg-tv-surface border-b border-tv-border">
      {/* px-4 sm:px-6 lg:px-8 sama persis dengan header (baris ~299) supaya item
          pertama ticker sejajar tepat dengan huruf "S" di logo, bukan cuma mendekati. */}
      <div className="max-w-[1600px] mx-auto overflow-hidden px-4 sm:px-6 lg:px-8">
      <div className="sahamlens-ticker-track flex whitespace-nowrap py-2" style={{ animationDuration: `${durationSec}s` }}>
        {loopItems.map((item, i) => (
          <Link
            key={`${item.symbol}-${i}`}
            href={`/technical/${item.symbol}.JK`}
            className="flex items-center gap-1.5 px-4 text-[12px] font-number shrink-0 hover:opacity-80 transition-opacity"
          >
            <span className="font-bold text-tv-text">{item.symbol}</span>
            <span className="text-tv-muted">Rp {Math.round(item.price || 0).toLocaleString('id-ID')}</span>
            <span className={`font-semibold flex items-center gap-0.5 ${item.changePct >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
              {item.changePct >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {item.changePct >= 0 ? '+' : ''}{item.changePct.toFixed(2)}%
            </span>
            <span className="text-tv-border ml-3">|</span>
          </Link>
        ))}
      </div>
      </div>
      <style dangerouslySetInnerHTML={{ __html: `
        .sahamlens-ticker-track { animation-name: sahamlens-ticker-scroll; animation-timing-function: linear; animation-iteration-count: infinite; width: max-content; }
        .sahamlens-ticker-track:hover { animation-play-state: paused; }
        @keyframes sahamlens-ticker-scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        /* SENGAJA tidak menghormati prefers-reduced-motion di sini. Ini ticker harga
           berjalan (live data), bukan animasi dekoratif - sama seperti running text
           kurs/skor pertandingan, pengguna mengharapkannya bergerak terus. Percobaan
           sebelumnya mematikan animasi lewat media query itu, dan hasilnya persis
           keluhan "diam total" karena fallback overflow-scroll-nya juga salah pasang
           (ada di TRACK yang width:max-content, bukan di pembungkus) - dua lapis
           kegagalan sekaligus. Dibuang semua, ticker sekarang selalu jalan. */
      `}} />
    </div>
  );
}

// Running text vertikal - level TP1/TP2 (Golden Cross) / CL1/CL2 (Dead Cross) berbasis
// ATR-14 (lihat breakout.service.ts + app/api/daily-picks/route.ts). Pola sama dengan
// TickerTape di atas (translate + duplikasi list 2x untuk loop mulus, pause on hover),
// cuma sumbu Y bukan X.
function VerticalSignalTicker({ items }: {
  items: { symbol: string; price: number; changePct: number; tp1: number; tp2: number; cl1: number; cl2: number }[];
}) {
  // Sumber emiten = hasil ranking LensRadar (aiPicks), BUKAN Golden/Dead Cross lagi
  // (permintaan user 2026-08-04). Tiap saham nampilin TP1/TP2 DAN CL1/CL2 sekaligus -
  // TP = target potensi naik, CL = level waspada/cut-loss, keduanya relevan buat saham
  // manapun terlepas arah pergerakannya, bukan cuma salah satu tergantung tipe sinyal.
  if (!items.length) {
    return <p className="text-[11px] text-tv-muted py-4 text-center flex-1">Belum ada setup TP/CL valid RR ≥ 1,5 untuk pantauan saat ini.</p>;
  }
  const loopItems = [...items, ...items];
  const durationSec = Math.max(20, Math.round(items.length * 4.5));
  return (
    <div className="relative flex-1 overflow-hidden min-h-[120px]">
      <div className="sahamlens-vticker-track flex flex-col" style={{ animationDuration: `${durationSec}s` }}>
        {loopItems.map((s, i) => (
          <Link
            key={`${s.symbol}-${i}`}
            href={`/technical/${s.symbol}.JK`}
            className="block px-3 py-2.5 border-b border-tv-border/40 hover:bg-tv-hover/40 transition-colors shrink-0"
          >
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-bold font-number text-tv-text">{s.symbol}</span>
              <span className="text-[12px] font-number text-tv-text">Rp {Math.round(s.price).toLocaleString('id-ID')}</span>
            </div>
            <div className="mt-0.5 flex items-center justify-between">
              <span className="text-[10px] font-bold text-tv-blue">LensRadar</span>
              <span className={`text-[10px] font-number flex items-center gap-0.5 ${s.changePct >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
                {s.changePct >= 0 ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownRight className="h-2.5 w-2.5" />}
                {s.changePct >= 0 ? '+' : ''}{s.changePct.toFixed(2)}%
              </span>
            </div>
            <div className="mt-0.5 flex items-center justify-between">
              <span className="text-[10px] font-bold font-number text-tv-green">TP1: {s.tp1.toLocaleString('id-ID')}</span>
              <span className="text-[10px] font-bold font-number text-tv-green">TP2: {s.tp2.toLocaleString('id-ID')}</span>
            </div>
            <div className="mt-0.5 flex items-center justify-between">
              <span className="text-[10px] font-bold font-number text-tv-red">CL1: {s.cl1.toLocaleString('id-ID')}</span>
              <span className="text-[10px] font-bold font-number text-tv-red">CL2: {s.cl2.toLocaleString('id-ID')}</span>
            </div>
          </Link>
        ))}
      </div>
      <style dangerouslySetInnerHTML={{ __html: `
        .sahamlens-vticker-track { animation-name: sahamlens-vticker-scroll; animation-timing-function: linear; animation-iteration-count: infinite; }
        .sahamlens-vticker-track:hover { animation-play-state: paused; }
        @keyframes sahamlens-vticker-scroll { from { transform: translateY(0); } to { transform: translateY(-50%); } }
      `}} />
    </div>
  );
}

export default function Dashboard() {
  // Default chart beranda = IHSG (permintaan eksplisit) - bukan lagi saham trending
  // acak. User tetap bisa ketik nama emiten di search (CommandPalette onSelect di
  // bawah) untuk mengganti chart ke saham tertentu; ticker.symbol yang diawali '^'
  // (mis. '^JKSE') dipakai sebagai penanda "ini indeks, bukan saham" di seluruh
  // kartu chart di bawah (lihat isIndex).
  const [ticker, setTicker] = useState<{ symbol: string; name: string }>({
    symbol: '^JKSE',
    name: 'Indeks Harga Saham Gabungan',
  });
  const isIndex = ticker.symbol.startsWith('^');
  const displaySymbol = isIndex ? 'IHSG' : `${ticker.symbol}.JK`;
  const [timeframe, setTimeframe] = useState('1Y');
  const [ihsg, setIhsg] = useState<{ price: number; change: number; pointChange: number } | null>(null);
  const [ihsgFailed, setIhsgFailed] = useState(false);
  const [tickerFailed, setTickerFailed] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  React.useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  React.useEffect(() => {
    fetch('/api/live/^JKSE')
      .then(r => r.json())
      .then(data => {
        if (
          data &&
          typeof data.price === 'number' &&
          Number.isFinite(data.price) &&
          data.price > 0 &&
          typeof data.changePercent === 'number' &&
          Number.isFinite(data.changePercent)
        ) {
          const pointChange = (data.price * data.changePercent / 100);
          setIhsg({ price: data.price, change: data.changePercent, pointChange });
        } else {
          setIhsgFailed(true);
        }
      })
      .catch((e) => { console.error(e); setIhsgFailed(true); });
  }, []);

  const chartRef = useRef<HTMLDivElement>(null);

  const [chartData, setChartData] = useState<any[]>([]);

  const [hoveredTime, setHoveredTime] = useState<string | null>(null);

  // BUG FIX (2026-08-06): ketiga pengambilan data di halaman ini (chart, IHSG header,
  // dan market-summary untuk ticker berjalan) sebelumnya berakhir di `.catch(console.error)`
  // tanpa satu pun state kegagalan. Kalau salah satunya gagal, tampilannya berhenti
  // permanen di teks "Memuat..." - tanpa penjelasan, tanpa tombol, dan tanpa batas waktu.
  // Ini halaman publik yang terindeks, jadi keadaan itu bisa dilihat siapa saja.
  const [chartError, setChartError] = useState(false);

  const loadChart = React.useCallback(() => {
    setChartError(false);
    setHoveredTime(null); // stale hover position from the previous series wouldn't line up
    fetch(`/api/public-chart/${encodeURIComponent(ticker.symbol)}?tf=${timeframe}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('chart'))))
      .then(data => {
         if (data && data.history && data.history.length > 0) {
            setChartData(data.history);
         } else {
            setChartError(true);
         }
      })
      .catch((e) => { console.error(e); setChartError(true); });
  }, [timeframe, ticker.symbol]);

  React.useEffect(() => { loadChart(); }, [loadChart]);

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
    const volumes = upToChartData.map((h: any) => h.volume);
    return computeIndicators(upToChartData[upToChartData.length - 1].time, closes, volumes);
  }, [upToChartData]);

  // LensAI: 10 agen rule-based, dihitung dari OHLCV asli - dipakai untuk sinyal +
  // ringkasan analisis, supaya insight yang ditampilkan tidak pernah mengarang.
  const council = React.useMemo(() => computeMiniCouncil(upToChartData as any, isIndex), [upToChartData, isIndex]);

  const isHovering = hoveredTime != null && ind != null && chartData.length > 0 && ind.time !== chartData[chartData.length - 1].time;

  const insightText = council ? council.summary : (ind ? generateInsight(ind) : 'Memuat analisis teknikal real-time...');
  const finalSignal = council?.finalSignal ?? ind?.signal ?? 'HOLD';

  // Kirim konteks chart yang sedang tampil ke AI Chat (permintaan eksplisit: LensAI
  // sebelumnya tidak tahu apa-apa soal chart di Beranda - halaman ini TIDAK PERNAH
  // dispatch 'update-ai-context' sama sekali, jadi saat user tanya soal IHSG di
  // Beranda, LensAI menjawab dari pengetahuan umumnya sendiri tanpa tahu index sedang
  // ditampilkan, dan tanpa penanda "ini index bukan saham" - lihat app/api/chat/route.ts
  // untuk aturan index vs saham di system prompt).
  React.useEffect(() => {
    window.dispatchEvent(new CustomEvent('update-ai-context', {
      detail: {
        symbol: ticker.symbol,
        name: ticker.name,
        isIndex,
        price: currentPrice,
        changePct,
        consensus: finalSignal,
      },
    }));
  }, [ticker.symbol, ticker.name, isIndex, currentPrice, changePct, finalSignal]);

  // Running text ticker (header strip) - saham paling aktif ditransaksikan (topValue,
  // dari /api/market-summary yang SUDAH dipanggil di bawah, tidak ada fetch tambahan).
  const [tickerItems, setTickerItems] = useState<{ symbol: string; price: number; changePct: number }[]>([]);

  // Cuplikan 5 teratas AI Pick - menggantikan widget "Hari Ini AI Menemukan" yang tiap
  // barisnya dulu menuju kategori berbeda di halaman AI Pick. Setelah 8 tab itu dilebur
  // jadi satu daftar berperingkat (2026-08-03), tautan per-kategori tidak punya tujuan
  // lagi dan semua baris mengarah ke halaman yang sama - membingungkan. Sekarang beranda
  // langsung menampilkan isi peringkatnya, dan tiap kode saham menuju analisis teknikalnya.
  const [aiPicks, setAiPicks] = useState<
    {
      symbol: string; price: number; changePct: number; finalScore: number;
      // `signals` menggantikan `bonuses` (audit skor 2026-08-05) - sinyal hari ini jadi
      // label, bukan poin. Opsional: response bisa berasal dari cache lama.
      signals?: string[];
      coverage?: number | null;
      tp1: number | null; tp2: number | null; cl1: number | null; cl2: number | null;
    }[] | null
  >(null);
  // Panel ini live (cron refresh tiap 5 menit ngikutin harga pasar) - ranking top-5 bisa
  // geser antar refresh kalau beberapa menit sudah lewat. Label "Update HH:MM" bikin ini
  // kelihatan sebagai data live yang wajar berubah, bukan seperti acak/bug (keluhan user
  // 2026-08-04 - panel ini sebelumnya tidak punya indikator jam sama sekali).
  const [aiPicksUpdatedAt, setAiPicksUpdatedAt] = useState<string | null>(null);
  const [aiPicksNote, setAiPicksNote] = useState<string | null>(null);
  const [aiPicksAdvisoryEnabled, setAiPicksAdvisoryEnabled] = useState(false);

  React.useEffect(() => {
    fetch('/api/ai-pick')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        // Butuh akun/trial - pengunjung yang trialnya habis dapat 402. Tampilkan daftar
        // kosong dengan pesan, bukan error, supaya beranda tetap utuh.
        const usableData = data && !data.error ? data : null;
        setAiPicks(usableData ? (usableData.items || []).slice(0, 5) : []);
        setAiPicksNote(typeof usableData?.note === 'string' ? usableData.note : null);
        setAiPicksAdvisoryEnabled(
          usableData?.advisoryEnabled === true || usableData?.modelValidation?.validated === true
        );
        if (data?.computedAt) {
          setAiPicksUpdatedAt(new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }).format(new Date(data.computedAt)) + ' WIB');
        }
      })
      .catch(() => {
        setAiPicks([]);
        setAiPicksNote(null);
        setAiPicksAdvisoryEnabled(false);
      });
  }, []);

  const [newsItems, setNewsItems] = useState<{ title: string; link: string; source: string; sentiment: string; pubDate: string }[]>([]);
  const [loadingNews, setLoadingNews] = useState(true);

  React.useEffect(() => {
    fetch('/api/news', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setNewsItems((d?.items || []).slice(0, 6)))
      .catch(() => {})
      .finally(() => setLoadingNews(false));
  }, []);

  // Jadwal Terdekat (Dividen/Earnings) - ngisi ruang kosong di bawah "Berita Terkini"
  // (kolom kiri lebih pendek dari panel kanan LensRadar/TP-CL). Pola sama persis
  // dengan app/home/page.tsx (fetch + flatten + sort sudah dipakai di sana).
  const [calendarEvents, setCalendarEvents] = useState<
    { date: string; symbol: string; type: 'DIVIDEND' | 'EARNINGS'; title: string }[] | null
  >(null);

  React.useEffect(() => {
    fetch('/api/calendar', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const map = d?.events as Record<string, { symbol: string; type: 'DIVIDEND' | 'EARNINGS'; title: string }[]> | undefined;
        if (!map) { setCalendarEvents([]); return; }
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
        const flat = Object.entries(map)
          .filter(([date]) => date >= today)
          .flatMap(([date, events]) => events.map((e) => ({ date, ...e })))
          .sort((a, b) => a.date.localeCompare(b.date))
          .slice(0, 5);
        setCalendarEvents(flat);
      })
      .catch(() => setCalendarEvents([]));
  }, []);

  React.useEffect(() => {
    fetch('/api/market-summary').then(r => r.json()).then(data => {
      if (data && !data.error) {
        // topGainers + topLosers (bukan topValue - itu tidak punya field changePct)
        // digabung supaya ticker menampilkan campuran saham naik & turun, dideduplikasi.
        const combined = [...(data.topGainers || []), ...(data.topLosers || [])];
        const seen = new Set<string>();
        const uniqueTicker = combined.filter((s: any) => {
          if (seen.has(s.symbol)) return false;
          seen.add(s.symbol);
          return true;
        });
        if (uniqueTicker.length) {
          setTickerItems(uniqueTicker.map((s: any) => ({ symbol: s.symbol, price: s.price, changePct: s.changePct })));
        }
        if (data.timestamp) {
          setLastUpdated(new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }).format(new Date(data.timestamp)) + ' WIB');
        }
      } else {
        setTickerFailed(true);
      }
    }).catch((e) => { console.error(e); setTickerFailed(true); });
  }, []);

  const jakartaDate = now ? new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now) : null;
  const jakartaTime = now ? new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false }).format(now) + ' WIB' : null;
  const marketOpen = now ? isMarketOpen(now) : false;

  return (
    <div className="min-h-screen bg-tv-bg text-tv-text selection:bg-tv-blue/20">
      {/* HEADER */}
      <header className="sticky top-0 z-50 bg-tv-surface text-white border-b border-tv-border">
        <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8">
          <div className="flex h-[64px] items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2.5">
                <img src="/sahamlens-scope.png" alt="SahamLens" className="h-8 w-8 rounded-full object-cover" />
                <span className="font-bold text-[16px] tracking-tight font-heading">SahamLens</span>
              </div>
              <div className="hidden md:flex items-center gap-3 pl-6 border-l border-white/15">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] uppercase tracking-widest text-white/60 font-semibold">IHSG Hari Ini</span>
                  <span className="h-1 w-1 rounded-full bg-tv-green animate-pulse" />
                </div>
                {ihsg ? (
                  <div className="flex items-baseline gap-2">
                    <span className="text-[18px] font-bold tracking-tight font-number">{ihsg.price.toLocaleString('id-ID', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold ${ihsg.change >= 0 ? 'bg-tv-green/15 text-tv-green' : 'bg-tv-red/15 text-tv-red'}`}>
                      {ihsg.change >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />} {ihsg.change >= 0 ? '+' : ''}{ihsg.change.toFixed(2)}% ({ihsg.change >= 0 ? '+' : ''}{ihsg.pointChange.toFixed(1)})
                    </span>
                  </div>
                ) : ihsgFailed ? (
                  <span className="text-[12px] font-medium text-white/50">IHSG tidak tersedia</span>
                ) : (
                  <Skeleton variant="text" className="w-32 h-4" />
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-[40px] sm:w-[180px] md:w-[220px]">
                <CommandPalette onSelect={(symbol, name) => setTicker({ symbol, name })} />
              </div>
              <div className="hidden lg:flex items-center gap-2 rounded-full bg-white/10 border border-white/10 px-2.5 py-1">
                <span className={`h-2 w-2 rounded-full animate-pulse ${marketOpen ? 'bg-tv-green' : 'bg-white/30'}`} />
                <span className="text-[11px] font-medium text-white">{marketOpen ? 'Live' : 'Tutup'}</span>
              </div>
              <div className="flex items-center gap-2 text-[11px] font-medium text-white/50">
                <span className="hidden sm:inline">{jakartaDate && jakartaTime ? `${jakartaDate} • ${jakartaTime}` : 'Memuat waktu...'}</span>
                <span className="sm:hidden">{jakartaTime || '--:--'}</span>
              </div>
              {/* BUG FIX (2026-08-05, permintaan user): halaman ini (root `/`) satu-satunya
                  yang tidak lewat AppShell/TopMarketBar (lihat AppShell.tsx cabang
                  isLandingPage), jadi satu-satunya halaman yang sebelumnya TIDAK punya
                  tombol "Ask LensAI" di pojok kanan atas - sebelumnya cuma tombol bulat
                  mengambang (AIChat.tsx) yang sekarang dihapus karena dobel di halaman
                  lain. Tombol ini dispatch event yang sama ('open-ai-chat') persis seperti
                  TopMarketBar.tsx, supaya perilakunya identik di semua halaman. */}
              <button
                type="button"
                onClick={() => window.dispatchEvent(new Event('open-ai-chat'))}
                title="Ask LensAI"
                aria-label="Ask LensAI"
                className="hidden sm:flex items-center gap-1.5 rounded-full bg-tv-blue/10 hover:bg-tv-blue/20 text-tv-blue px-3 py-1.5 text-[11px] font-semibold transition-colors"
              >
                <Sparkles className="h-3.5 w-3.5" /> Ask LensAI
              </button>
              {/* "Buka Dashboard" untuk SEMUA pengunjung (bukan cuma yang sudah login) -
                  /home bisa dibuka tanpa akun (aturan akses eksplorasi 2026-08-01), jadi
                  ajakan menjelajah lebih pas daripada "Login" yang terkesan wajib akun
                  dari awal. Menu yang memang butuh akun akan minta daftar saat dipakai. */}
              <Link href="/home" className="ml-2 flex items-center gap-2 rounded-md bg-tv-blue hover:bg-tv-blueHover px-4 py-1.5 text-[12px] font-bold text-white transition-all">
                Buka Dashboard
              </Link>
            </div>
          </div>
          {/* mobile IHSG */}
          <div className="flex md:hidden items-center justify-between pb-3 -mt-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-widest text-white/50 font-semibold">IHSG</span>
              {ihsg ? (
                <>
                  <span className="text-[14px] font-bold font-number">{ihsg.price.toLocaleString('id-ID', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                  <span className={`text-[11px] font-semibold ${ihsg.change >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>{ihsg.change >= 0 ? '+' : ''}{ihsg.change.toFixed(2)}%</span>
                </>
              ) : ihsgFailed ? (
                <span className="text-[12px] text-white/50">tidak tersedia</span>
              ) : (
                <Skeleton variant="text" className="w-24 h-3.5" />
              )}
            </div>
            <span className={`text-[10px] flex items-center gap-1 ${marketOpen ? 'text-tv-green' : 'text-white/40'}`}><span className={`h-1.5 w-1.5 rounded-full animate-pulse ${marketOpen ? 'bg-tv-green' : 'bg-white/30'}`} />{marketOpen ? 'Market Buka' : 'Market Tutup'}</span>
          </div>
        </div>
      </header>

      <TickerTape items={tickerItems} failed={tickerFailed} />

      <main className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
        {/* Marketing Hero - tagline "Lihat Peluang Lebih Jelas." sudah dipakai di
            metadata (app/layout.tsx) tapi belum pernah dirender di halaman manapun.
            Section aditif, tidak mengubah struktur Title Block/ringkasan pasar di
            bawahnya.
            POLISH (2026-08-05, keluhan user "kelihatan kaku"): bg flat bg-tv-card/50
            diganti gradient-accent-soft (biru->ungu, sudah didefinisikan di
            tailwind.config.js) + glow blur dekoratif di belakang icon (glow-purple,
            juga sudah ada di config) - murni CSS, tidak ada konten/data baru. */}
        <Card padding="none" className="relative overflow-hidden mb-6 flex items-center justify-between gap-6 bg-gradient-accent-soft border border-tv-border/60 px-5 py-4 sm:px-8 sm:py-6 shadow-none">
          <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-glow-purple blur-2xl" />
          <div className="min-w-0 relative">
            <h2 className="font-heading text-xl sm:text-2xl font-bold tracking-tight text-tv-text">Lihat Peluang Lebih Jelas.</h2>
            <p className="mt-1.5 text-[13px] sm:text-sm text-tv-muted max-w-md">
              Screener & analisis saham IDX berbasis data riil dan AI - teknikal, fundamental, backtest, dan rekomendasi dalam satu aplikasi.
            </p>
          </div>
          <img
            src="/sahamlens-scope.png"
            alt="SahamLens"
            className="relative hidden sm:block h-20 md:h-28 w-auto shrink-0 object-contain drop-shadow-[0_0_20px_rgba(139,92,246,0.35)]"
          />
        </Card>

        {/* Title Block */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[24px] sm:text-2xl font-bold tracking-tight text-tv-text font-heading">Ringkasan Pasar Hari Ini</h1>
            <p className="mt-1 text-[13px] sm:text-[14px] text-tv-muted font-medium">
              {lastUpdated
                ? <span className="text-tv-blue font-semibold">Update terakhir {lastUpdated}</span>
                : tickerFailed
                  ? <span>Waktu pembaruan tidak diketahui</span>
                  : <Skeleton variant="text" className="w-40 h-4 inline-block align-middle" />}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-tv-muted">Powered by</span>
            <span className="rounded-full border border-tv-border bg-tv-card px-3 py-1 text-[11px] font-bold text-tv-text shadow-1">SahamLens</span>
          </div>
        </div>

        {/* Ringkasan pasar dari tickerItems yang SUDAH ada di memori (gabungan
            topGainers + topLosers dari /api/market-summary) - tidak ada permintaan
            jaringan baru. Sebelumnya judul "Ringkasan Pasar Hari Ini" berdiri langsung
            di atas sebuah chart tanpa satu pun ringkasan; pengunjung harus menyimpulkan
            kondisi pasar sendiri dari running text yang lewat di atas. */}
        {tickerItems.length > 0 && (() => {
          const naik = tickerItems.filter((t) => t.changePct > 0).length;
          const turun = tickerItems.filter((t) => t.changePct < 0).length;
          const sorted = [...tickerItems].sort((a, b) => b.changePct - a.changePct);
          const teratas = sorted[0];
          const terbawah = sorted[sorted.length - 1];
          const stats = [
            { label: 'Menguat', value: String(naik), tone: 'text-tv-green', sub: `dari ${tickerItems.length} saham teraktif` },
            { label: 'Melemah', value: String(turun), tone: 'text-tv-red', sub: `dari ${tickerItems.length} saham teraktif` },
            { label: 'Penguatan tertinggi', value: teratas.symbol, tone: 'text-tv-green', sub: `+${teratas.changePct.toFixed(2)}%` },
            { label: 'Pelemahan terdalam', value: terbawah.symbol, tone: 'text-tv-red', sub: `${terbawah.changePct.toFixed(2)}%` },
          ];
          return (
            <div className="mb-6">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {stats.map((s) => (
                  <Card key={s.label} padding="none" hoverable className="px-4 py-3">
                    <div className="text-[10px] uppercase tracking-wide text-tv-muted">{s.label}</div>
                    <div className={`mt-1 font-number text-lg font-bold ${s.tone}`}>{s.value}</div>
                    <div className="text-[10px] text-tv-muted mt-0.5">{s.sub}</div>
                  </Card>
                ))}
              </div>
              {/* Batasan cakupan disebut apa adanya: ini daftar saham TERAKTIF, bukan
                  seluruh emiten IDX, jadi rasionya tidak boleh dibaca sebagai breadth
                  pasar keseluruhan. */}
              <p className="mt-2 text-[11px] leading-relaxed text-tv-muted">
                Dihitung dari daftar saham teraktif hari ini, bukan seluruh emiten IDX -
                angka ini menggambarkan yang paling banyak ditransaksikan, bukan luas pergerakan pasar.
              </p>
            </div>
          );
        })()}

        {/* FEATURED CHART CARD */}
        <Card padding="none" className="relative overflow-hidden rounded-xl shadow-2">
          <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_0.9fr]">
            {/* Left Chart */}
            <div className="p-5 sm:p-7">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  {/* Kotak 48x48 ini dulu diisi displaySymbol utuh - untuk saham
                      nilainya "BBCA.JK" (7 karakter di font 13px), yang meluber keluar
                      kotaknya. Indeks kebetulan pas karena "IHSG" cuma 4 huruf. */}
                  {isIndex ? (
                    <div className="h-12 w-12 shrink-0 rounded-lg bg-tv-blue text-white grid place-items-center font-bold text-[13px] font-number">IHSG</div>
                  ) : (
                    <TickerAvatar symbol={ticker.symbol} size="lg" />
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-[18px] font-bold text-tv-text tracking-tight font-heading">{displaySymbol} — {ticker.name}</h2>
                      {isIndex ? (
                        <span className="hidden sm:inline-flex rounded-full bg-tv-blue/15 text-tv-blue px-2 py-0.5 text-[10px] font-bold tracking-widest">INDEKS UTAMA</span>
                      ) : (
                        <span className="hidden sm:inline-flex rounded-full bg-tv-gold/15 text-tv-gold px-2 py-0.5 text-[10px] font-bold tracking-widest">SAHAM PILIHAN</span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-[12px]">
                      <span className="font-semibold text-tv-text font-number">{currentPrice != null ? `Rp ${Math.round(currentPrice).toLocaleString('id-ID')}` : 'Memuat...'}</span>
                      {change != null && changePct != null && (
                        <span className={`inline-flex items-center gap-1 font-semibold font-number ${change>=0 ? 'text-tv-green' : 'text-tv-red'}`}>
                          {change>=0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />} {change>=0?'+':''}{change.toFixed(0)} ({changePct>=0?'+':''}{changePct.toFixed(2)}%)
                        </span>
                      )}
                      {/* BUG FIX (2026-08-06): penjaganya cuma `!= null`, sedangkan
                          nol LOLOS pemeriksaan itu. Untuk IHSG - tampilan default
                          halaman depan - sumber data tidak mengirim volume indeks,
                          jadi baris ini tertulis "Vol: 0.0 Jt • Val: Rp 0.00 T":
                          angka nol yang terbaca sebagai hasil pengukuran, seolah
                          hari itu tidak ada transaksi sama sekali di bursa. */}
                      <span className="text-tv-muted">
                        {(ind?.volume ?? 0) > 0 && (ind?.value ?? 0) > 0
                          ? `Vol: ${((ind!.volume as number) / 1e6).toFixed(1)} Jt • Val: Rp ${((ind!.value as number) / 1e12).toFixed(2)} T`
                          : isIndex
                            ? 'Volume agregat indeks tidak tersedia dari sumber data'
                            : 'Volume tidak tersedia'}
                      </span>
                      {isHovering && ind && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-tv-blue/10 text-tv-blue px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                          Data per {ind.time}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {/* max-w-full + overflow-x-auto (permintaan user) - 8 pilihan timeframe
                    (nambah 1M/3M) muat digulir ke samping di layar sempit, bukan
                    ke-wrap jadi berbaris-baris atau kepotong. */}
                <div className="max-w-full overflow-x-auto">
                  <SegmentedControl
                    options={TIMEFRAMES.map(t => ({ label: t, value: t }))}
                    value={timeframe}
                    onChange={setTimeframe}
                    layoutId="landing-timeframe"
                    className="shrink-0"
                  />
                </div>
              </div>

              {/* Chart */}
              <div className="relative mt-6 rounded-lg overflow-hidden shadow-1 border border-tv-border/50">
                {chartData.length > 0 ? (
                  <TradingViewChart
                    symbol={ticker.symbol}
                    candles={chartData}
                    height={340}
                    timeframe={timeframe}
                    onHoverCandle={setHoveredTime}
                    technical={{
                      // null (bukan 'NETRAL') kalau MA belum bisa dihitung (temuan C-1),
                      // dan CMF20 dari OHLCV nyata alih-alih turunan volRatio (temuan C-2).
                      cross_status: ind?.ma20 != null && ind?.ma50 != null ? (ind.ma20 > ind.ma50 ? 'BULLISH' : 'BEARISH') : null,
                      money_flow_status: moneyFlowLabel(upToChartData as any),
                      ma50: ind?.ma50 ?? undefined,
                      ma200: ind?.ma200 ?? undefined
                    }}
                  />
                ) : chartError ? (
                  <div className="bg-tv-bg">
                    <EmptyState
                      illustration="empty"
                      title={`Grafik ${displaySymbol} gagal dimuat`}
                      description="Data harga tidak berhasil diambil untuk rentang waktu ini. Coba rentang lain, atau muat ulang grafiknya."
                      action={{ label: 'Muat ulang grafik', onClick: loadChart }}
                    />
                  </div>
                ) : (
                  <div className="h-[340px] bg-tv-bg p-4 flex flex-col justify-end gap-2">
                    {/* Kerangka menyerupai bentuk chart batang, bukan teks "Memuat grafik..."
                        di tengah kotak kosong setinggi 340px. */}
                    <div className="flex items-end gap-1.5 h-full">
                      {[38, 55, 47, 68, 60, 78, 71, 85, 66, 74, 90, 62, 80, 95, 72].map((h, i) => (
                        <Skeleton key={i} className="flex-1 rounded-t" style={{ height: `${h}%` }} />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-4 items-center bg-tv-blue/10 p-4 rounded-lg border border-tv-blue/20">
                <div className="text-tv-blue font-semibold text-[13px] flex items-center gap-2">
                  <Sparkles className="w-4 h-4" /> {isHovering ? `Insight per ${ind?.time}` : `Insight ${displaySymbol} Terkini`}
                </div>
                <p className="text-[12px] text-tv-text/80">
                  {insightText}
                </p>
              </div>

              {/* Berita Terkini - dipindah ke bawah Insight (sebelumnya di grid card
                  bawah, nyisain ruang kosong sendirian di baris terakhir grid 3 kolom).
                  Ngisi ruang kosong di bawah Insight box juga (kolom kiri lebih pendek
                  dari panel kanan LensRadar/TP-CL). */}
              <Card padding="md" className="mt-4 shadow-none">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="font-heading text-[13px] font-bold text-tv-text">Berita Terkini</h4>
                  <Link href="/news" className="text-[11px] font-bold text-tv-blue hover:text-tv-text transition">Lihat Semua</Link>
                </div>
                <div className="mt-3 divide-y divide-tv-border/60">
                  {loadingNews ? (
                    <div className="space-y-2.5">
                      {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
                    </div>
                  ) : newsItems.length === 0 ? (
                    <EmptyState
                      illustration="search"
                      title="Belum ada berita pada siklus ini"
                      description="Sumber RSS disegarkan tiap 15 menit."
                    />
                  ) : (
                    newsItems.map((n) => (
                      <a key={n.link || n.title} href={n.link} target="_blank" rel="noopener noreferrer" className="block py-2.5 first:pt-0 last:pb-0 hover:opacity-80 transition-opacity">
                        <p className="text-[12px] font-medium text-tv-text leading-snug line-clamp-2">{n.title}</p>
                        <p className="text-[10px] text-tv-muted mt-1 flex items-center gap-1.5">
                          {n.source}
                          {/* Sentimen sudah dihitung dan dikirim API yang sama, tapi di
                              halaman depan dibuang - padahal itu pembeda utamanya dari
                              daftar berita biasa. */}
                          {n.sentiment && (
                            <span className={`rounded px-1.5 py-px text-[9px] font-bold ${
                              n.sentiment === 'POSITIF' ? 'bg-tv-green/15 text-tv-green'
                                : n.sentiment === 'NEGATIF' ? 'bg-tv-red/15 text-tv-red'
                                : 'bg-tv-hover text-tv-muted'
                            }`}>{n.sentiment}</span>
                          )}
                        </p>
                      </a>
                    ))
                  )}
                </div>
              </Card>

              {/* Jadwal Terdekat - dividen/earnings, sumber sama dengan widget di Beranda
                  (/home). Cakupan cuma Dividen & Earnings, lihat catatan di
                  corporate-calendar.service.ts soal RUPS/Stock Split. */}
              <Card padding="md" className="mt-4 shadow-none">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="font-heading text-[13px] font-bold text-tv-text">Jadwal Terdekat</h4>
                  <Link href="/calendar" className="text-[11px] font-bold text-tv-blue hover:text-tv-text transition">Lihat Semua</Link>
                </div>
                <div className="mt-3">
                  {calendarEvents === null ? (
                    <div className="space-y-2">
                      {[0, 1].map((i) => <Skeleton key={i} className="h-11 w-full" />)}
                    </div>
                  ) : calendarEvents.length === 0 ? (
                    <EmptyState
                      illustration="empty"
                      title="Belum ada jadwal dalam waktu dekat"
                      description="Cakupan terbatas Dividen & Earnings - RUPS dan stock split tidak tersedia di sumber data ini."
                    />
                  ) : (
                    <div className="space-y-2">
                      {calendarEvents.map((e, i) => (
                        <Link
                          key={`${e.symbol}-${e.date}-${i}`}
                          href={`/technical/${e.symbol}.JK`}
                          className="flex items-center justify-between gap-2 bg-tv-bg/50 border border-tv-border rounded-md px-3 py-2 hover:border-tv-borderLight transition-colors"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-number text-[12px] font-bold text-tv-text">{e.symbol}</span>
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${e.type === 'DIVIDEND' ? 'bg-tv-green/15 text-tv-green' : 'bg-tv-blue/15 text-tv-blue'}`}>
                                {e.type === 'DIVIDEND' ? 'Dividen' : 'Earnings'}
                              </span>
                            </div>
                            <div className="text-[10px] text-tv-muted truncate">{e.title}</div>
                          </div>
                          <span className="text-[11px] text-tv-muted font-number shrink-0">
                            {new Date(e.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            </div>

            {/* Right Panel - "Hari Ini AI Menemukan": ringkasan temuan pasar hari ini (bukan
                indikator 1 saham) - hook supaya pengunjung buka aplikasi tiap hari sebelum
                login/signup. Setiap angka real (bukan dikarang), lihat app/api/daily-picks. */}
            <div className="border-t lg:border-t-0 lg:border-l border-tv-border bg-tv-bg/40 p-5 sm:p-7 flex flex-col min-h-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-lg leading-none">🔥</span>
                  <h3 className="font-heading text-[13px] font-bold text-tv-text truncate">Pantauan LensRadar</h3>
                </div>
                <Link href="/breakout-radar" className="text-[11px] text-tv-blue hover:underline shrink-0">
                  Lihat semua
                </Link>
              </div>
              <p className="text-[11px] text-tv-muted mt-1">
                Skor komposit teknikal, fundamental, dan arus dana dari 109 saham likuid IDX.
                Klik kode saham untuk analisis teknikalnya; ini scanner, bukan instruksi beli/jual.
              </p>
              <p className="text-[10px] text-tv-muted mt-1">
                Data live, update {aiPicksUpdatedAt || '--:--'} - ranking bisa berubah tiap beberapa menit ngikutin harga pasar.
              </p>
              {aiPicksNote && (
                <p className={`text-[10px] mt-2 rounded-md border px-2.5 py-2 leading-relaxed ${
                  aiPicksAdvisoryEnabled
                    ? 'border-tv-border bg-tv-card/60 text-tv-muted'
                    : 'border-tv-yellow/30 bg-tv-yellow/10 text-tv-yellow'
                }`}>
                  {aiPicksNote}
                </p>
              )}

              <div className="mt-4 flex flex-col gap-2">
                {aiPicks === null ? (
                  <div className="space-y-2">
                    {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-11 w-full" />)}
                    <LoadingFact className="mt-2" />
                  </div>
                ) : aiPicks.length === 0 ? (
                  <EmptyState
                    illustration="search"
                    title="Belum ada yang lolos hari ini"
                    description="Pemindaian berjalan normal dan hasilnya nihil. Saham berdata tidak lengkap atau berlikuiditas sangat rendah sengaja dikeluarkan - daftar kosong adalah jawaban yang benar untuk hari seperti ini."
                  />
                ) : (
                  aiPicks.map((p, idx) => (
                    <Link
                      key={p.symbol}
                      href={`/technical/${p.symbol}`}
                      className="group flex items-center justify-between gap-2 rounded-lg border border-tv-border/60 bg-tv-card px-3 py-2.5 hover:border-tv-borderLight transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-[11px] text-tv-muted font-number w-4 shrink-0">{idx + 1}</span>
                        <TickerAvatar symbol={p.symbol} size="sm" />
                        <span className="text-[13px] font-bold font-number text-tv-text shrink-0">
                          {p.symbol.replace('.JK', '')}
                        </span>
                        <span className={`text-[11px] font-number shrink-0 ${p.changePct >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
                          {p.changePct >= 0 ? '+' : ''}{p.changePct.toFixed(1)}%
                        </span>
                        {/* Sinyal hanya ditampilkan kalau memang ADA. Teks pengganti
                            "tanpa sinyal khusus" sebelumnya terulang di hampir setiap
                            baris - kolom yang isinya sama untuk semua baris tidak
                            membedakan apa pun, ia cuma menambah keramaian. */}
                        {p.signals?.length ? (
                          <span className="text-[10px] text-tv-blue truncate hidden sm:inline">
                            {p.signals.join(', ')}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {/* Bar skor: peringkat relatif antar baris terbaca sekilas.
                            Membandingkan 85 dan 77 lewat angka menuntut pembacaan
                            baris per baris. */}
                        <span className="hidden sm:block h-1 w-10 rounded-full bg-tv-hover overflow-hidden">
                          <span
                            className="block h-full rounded-full bg-tv-green"
                            style={{ width: `${Math.min(100, Math.max(0, p.finalScore))}%` }}
                          />
                        </span>
                        {/* Skala dinyatakan eksplisit (audit skor 2026-08-05) - angka
                            telanjang "97" dulu terbaca 97/100 padahal skalanya 0-140. */}
                        <span className="text-[13px] font-bold font-number text-tv-text">{p.finalScore}<span className="text-[10px] font-normal text-tv-muted">/100</span></span>
                        <ChevronRight className="h-3.5 w-3.5 text-tv-muted group-hover:translate-x-0.5 transition" />
                      </div>
                    </Link>
                  ))
                )}
              </div>

              {/* Proyeksi Level Harga - proyeksi ATR-14 dari emiten LensRadar (aiPicks di
                  atas, BUKAN Golden/Dead Cross lagi - permintaan user 2026-08-04), running
                  text vertikal (lihat VerticalSignalTicker). Tanpa gembok Premium.
                  RENAME (2026-08-05, permintaan user): "Sinyal TP/CL Hari Ini" -> "Proyeksi
                  Level Harga" - "sinyal" terkesan rekomendasi beli/jual, padahal ini murni
                  proyeksi level harga (TP/CL) berbasis ATR, bukan sinyal aksi. */}
              <div className="mt-5 pt-4 border-t border-tv-border flex-1 flex flex-col min-h-0">
                <h4 className="font-heading text-[12px] font-bold text-tv-text flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-tv-green" />
                  Proyeksi Level Harga
                </h4>
                <p className="text-[10px] text-tv-muted mt-1">
                  Proyeksi ATR-14 dari emiten LensRadar - bukan jaminan harga akan tercapai.
                </p>
                {aiPicks === null ? (
                  <div className="flex-1 space-y-2 py-2">
                    {[0, 1].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
                  </div>
                ) : (
                  <VerticalSignalTicker
                    items={aiPicks.filter(
                      (p): p is typeof aiPicks[number] & { tp1: number; tp2: number; cl1: number; cl2: number } =>
                        p.tp1 != null && p.tp2 != null && p.cl1 != null && p.cl2 != null
                    )}
                  />
                )}
              </div>
            </div>
          </div>
        </Card>

        {/* Bottom Meta */}
        <Card padding="none" className="mt-8 flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-[11px] text-tv-muted shadow-none">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full animate-pulse ${marketOpen ? 'bg-tv-green' : 'bg-tv-muted'}`} />
            {/* BUG FIX (audit BUILD 002, item disclaimer sumber data): wording lama "real-time
                dari Bursa Efek Indonesia" memberi kesan feed langsung IDX, padahal sumbernya
                Yahoo Finance (pihak ketiga, ada delay) - IDX tidak menyediakan feed gratis. */}
            <span className="font-medium">Data bersumber dari Yahoo Finance (pihak ketiga), dapat mengalami keterlambatan hingga ~15 menit • Informasi &amp; rekomendasi di aplikasi ini bersifat informatif, bukan nasihat investasi</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-tv-hover px-2.5 py-1 font-semibold">© {new Date().getFullYear()} SahamLens</span>
          </div>
        </Card>
      </main>
    </div>
  );
}
