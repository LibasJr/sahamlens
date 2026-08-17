'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import SiteFooter from '@/components/SiteFooter';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import {
  ArrowUpRight, ArrowDownRight, Sparkles, LineChart, Building2,
  History, Users, Filter, Target, BarChart3, Waves, Search,
  ArrowRight, ShieldCheck, Cpu, Zap, CheckCircle2, Clock
} from 'lucide-react';

import { Card, Skeleton, EmptyState, LoadingFact, TickerAvatar } from '@/components/ui';
import { fadeUp, staggerContainer } from '@/lib/motion';
import { isMarketOpen } from '@/lib/utils/market';
import ThemeToggle from '@/components/ThemeToggle';
import GettingStartedGuide from '@/components/GettingStartedGuide';
import LanguageSwitcher from '@/components/ui/LanguageSwitcher';
import { useLanguage } from '@/lib/i18n';
import { AI_PICK_UNIVERSE, ACTIVE_LIQUID_UNIVERSE_VERSION } from '@/modules/market/constants/ai-pick-universe';


const CommandPalette = dynamic(() => import('@/components/CommandPalette'), { ssr: false });
const ACTIVE_UNIVERSE_COUNT = AI_PICK_UNIVERSE.length;

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
          // min-h-6 = 24px, ambang WCAG 2.5.8. Tanpa ini tautan hanya setinggi
          // barisnya (terukur 19px): py-2 ada di track, bukan di tautannya, jadi area
          // yang benar-benar bisa disentuh lebih pendek dari yang terlihat.
          //
          // Pemisah antar item kini border-r, bukan glyph "|". Sebagai teks ia terukur
          // 1,29:1 dan dihitung 200 kali sebagai kegagalan kontras - padahal ia murni
          // dekoratif. Sebagai border ia tidak lagi teks (tidak tunduk 1.4.3, tidak
          // dibacakan pembaca layar) dan 200 simpul DOM ikut hilang.
          <Link
            key={`${item.symbol}-${i}`}
            href={`/technical/${item.symbol}.JK`}
            className="flex min-h-6 shrink-0 items-center gap-1.5 border-r border-tv-border px-4 text-[12px] font-number transition-opacity hover:opacity-80"
          >
            <span className="font-bold text-tv-text">{item.symbol}</span>
            <span className="text-tv-muted">Rp {Math.round(item.price || 0).toLocaleString('id-ID')}</span>
            <span className={`font-semibold flex items-center gap-0.5 ${item.changePct >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
              {item.changePct >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {item.changePct >= 0 ? '+' : ''}{item.changePct.toFixed(2)}%
            </span>
          </Link>
        ))}
      </div>
      </div>
    </div>
  );
}

type StockSignalItem = {
  symbol: string; price: number; changePct: number; finalScore: number;
  signals?: string[]; tp1: number | null; tp2: number | null;
  cl1: number | null; cl2: number | null; flagged?: boolean;
  brokerNetValue?: number | null; brokerTradeDate?: string | null;
};

function formatBrokerFlow(value: number): string {
  return new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 }).format(Math.abs(value));
}

function StockSignalRunningText({ items, advisoryEnabled }: { items: StockSignalItem[]; advisoryEnabled: boolean }) {
  const durationSec = Math.max(28, items.length * 7);
  const renderGroup = (copy: number) => (
    <div className="flex shrink-0 gap-3 pr-3" aria-hidden={copy === 1 ? true : undefined}>
      {items.map((item) => {
        const label = item.flagged ? 'WASPADA' : advisoryEnabled ? 'BUY' : 'INFORMASI';
        const tone = item.flagged
          ? 'border-tv-red/30 bg-tv-red/10 text-tv-red'
          : advisoryEnabled
            ? 'border-tv-green/30 bg-tv-green/10 text-tv-green'
            : 'border-tv-gold/30 bg-tv-gold/10 text-tv-gold';
        return (
          <Link
            key={`${copy}-${item.symbol}`}
            href={`/technical/${item.symbol}`}
            tabIndex={copy === 1 ? -1 : undefined}
            className="group/signal flex w-[280px] shrink-0 items-center gap-3 rounded-xl border border-tv-border bg-tv-card/90 px-4 py-3 transition-colors hover:border-tv-borderLight hover:bg-tv-cardAlt sm:w-[320px]"
          >
            <TickerAvatar symbol={item.symbol} size="md" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-number text-sm font-bold text-tv-text group-hover/signal:text-tv-blue">{item.symbol.replace('.JK', '')}</span>
                <span className={`font-number text-[10px] font-semibold ${item.changePct >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
                  {item.changePct >= 0 ? '+' : ''}{item.changePct.toFixed(2)}%
                </span>
              </div>
              <div className="mt-1 truncate text-[10px] text-tv-muted">{item.signals?.[0] || `LensScore ${Math.round(item.finalScore)}/100`}</div>
              {item.tp1 != null && item.cl1 != null ? (
                <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-0.5 font-number text-[10px] font-semibold leading-tight">
                  <span className="text-tv-green">TP1 {item.tp1.toLocaleString('id-ID')}</span>
                  <span className="text-tv-red">CL1 {item.cl1.toLocaleString('id-ID')}</span>
                  {item.tp2 != null && <span className="text-tv-green/80">TP2 {item.tp2.toLocaleString('id-ID')}</span>}
                  {item.cl2 != null && <span className="text-tv-red/80">CL2 {item.cl2.toLocaleString('id-ID')}</span>}
                </div>
              ) : (
                <div className="mt-1.5 text-[10px] font-medium text-tv-muted">TP/CL belum tersedia</div>
              )}
              {typeof item.brokerNetValue === 'number' && item.brokerNetValue !== 0 && (
                <div className={`mt-1.5 text-[10px] font-semibold ${item.brokerNetValue > 0 ? 'text-tv-green' : 'text-tv-red'}`}>
                  Bandar: Net {item.brokerNetValue > 0 ? 'Buy' : 'Sell'} Rp{formatBrokerFlow(item.brokerNetValue)}
                </div>
              )}
            </div>
            <div className="shrink-0 text-right">
              <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-bold tracking-wide ${tone}`}>{label}</span>
              <div className="mt-1.5 font-number text-[10px] text-tv-muted">Rp {Math.round(item.price).toLocaleString('id-ID')}</div>
            </div>
          </Link>
        );
      })}
    </div>
  );
  return (
    <div className="sahamlens-signal-wrap overflow-hidden py-1" role="region" aria-label="Running text signal saham">
      <div className="sahamlens-signal-track flex w-max" style={{ animationDuration: `${durationSec}s` }}>
        {renderGroup(0)}{renderGroup(1)}
      </div>
    </div>
  );
}

type DashboardProps = {
  initialIhsg?: {
    price: number;
    change: number;
    pointChange: number;
    // Ikut dikirim sejak 2026-08-13 supaya penanda umur data juga muncul pada render
    // pertama (SSR), bukan hanya setelah fetch klien selesai.
    dataTimestamp?: string | null;
    ageSeconds?: number | null;
  } | null;
  initialRenderedAt?: string;
  initialLensRadar?: {
    items: { symbol: string; price: number; finalScore: number; flagged?: boolean; tp1: number | null; tp2: number | null; cl1: number | null; signals?: string[]; coverage?: number | null; cl2?: number | null; changePct?: number; brokerNetValue?: number | null; brokerTradeDate?: string | null }[];
    computedAt: string | null;
    advisoryEnabled: boolean;
    note: string | null;
  } | null;
};

export default function Dashboard({ initialIhsg = null, initialRenderedAt, initialLensRadar = null }: DashboardProps) {
  const { t, language } = useLanguage();
  const router = useRouter();
  const [quickSearch, setQuickSearch] = useState('');
  const [guideVisible, setGuideVisible] = useState<boolean | null>(null);
  const [guideOpenRequest, setGuideOpenRequest] = useState(0);

  const handleQuickSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = quickSearch.trim().toUpperCase().replace('.JK', '');
    if (clean) {
      router.push(`/technical/${clean}.JK`);
    }
  };

  const [ihsg, setIhsg] = useState<{ price: number; change: number; pointChange: number; dataTimestamp?: string | null; ageSeconds?: number | null } | null>(initialIhsg);
  const [ihsgFailed, setIhsgFailed] = useState(false);
  const [tickerFailed, setTickerFailed] = useState(false);
  const [now, setNow] = useState<Date | null>(() => initialRenderedAt ? new Date(initialRenderedAt) : null);

  React.useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => {
      if (!document.hidden) setNow(new Date());
    }, 30000);
    return () => clearInterval(t);
  }, []);

  React.useEffect(() => {
    const controller = new AbortController();
    fetch('/api/live/^JKSE', { signal: controller.signal })
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
          // Poin dihitung dari previousClose kalau tersedia. Rumus lama
          // `price * changePercent / 100` memakai harga SEKARANG sebagai penyebut dan
          // mengalikan persentase yang sudah dibulatkan - terukur menampilkan +30,9
          // untuk IHSG yang sebenarnya bergerak +30,5.
          const pointChange = typeof data.previousClose === 'number' && data.previousClose > 0
            ? data.price - data.previousClose
            : (data.price * data.changePercent / 100);
          setIhsg({
            price: data.price,
            change: data.changePercent,
            pointChange,
            dataTimestamp: typeof data.dataTimestamp === 'string' ? data.dataTimestamp : null,
            ageSeconds: typeof data.ageSeconds === 'number' ? data.ageSeconds : null,
          });
        } else {
          setIhsgFailed(true);
        }
      })
      .catch((e) => {
        if (!(e instanceof DOMException && e.name === 'AbortError')) { console.error(e); setIhsgFailed(true); }
      });
    return () => controller.abort();
  }, []);

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
      flagged?: boolean;
      brokerNetValue?: number | null; brokerTradeDate?: string | null;
    }[] | null
  >(initialLensRadar?.items ? initialLensRadar.items.map((item) => ({
    ...item,
    changePct: typeof item.changePct === 'number' ? item.changePct : 0,
    cl2: item.cl2 ?? null,
  })) : null);
  // Panel ini live (cron refresh tiap 5 menit ngikutin harga pasar) - ranking top-5 bisa
  // geser antar refresh kalau beberapa menit sudah lewat. Label "Update HH:MM" bikin ini
  // kelihatan sebagai data live yang wajar berubah, bukan seperti acak/bug (keluhan user
  // 2026-08-04 - panel ini sebelumnya tidak punya indikator jam sama sekali).
  const [aiPicksUpdatedAt, setAiPicksUpdatedAt] = useState<string | null>(() => {
    if (!initialLensRadar?.computedAt) return null;
    return new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }).format(new Date(initialLensRadar.computedAt)) + ' WIB';
  });
  const [aiPicksNote, setAiPicksNote] = useState<string | null>(initialLensRadar?.note ?? null);
  const [aiPicksAdvisoryEnabled, setAiPicksAdvisoryEnabled] = useState(initialLensRadar?.advisoryEnabled === true);

  React.useEffect(() => {
    const controller = new AbortController();
    fetch('/api/ai-pick', { signal: controller.signal })
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
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setAiPicks([]);
        setAiPicksNote(null);
        setAiPicksAdvisoryEnabled(false);
      });
    return () => controller.abort();
  }, []);

  const [newsItems, setNewsItems] = useState<{ title: string; link: string; source: string; sentiment: string; pubDate: string }[]>([]);
  const [loadingNews, setLoadingNews] = useState(true);

  React.useEffect(() => {
    const controller = new AbortController();
    fetch('/api/news', { cache: 'no-store', signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setNewsItems((d?.items || []).slice(0, 6)))
      .catch((error) => { if (!(error instanceof DOMException && error.name === 'AbortError')) console.error('News fetch failed', error); })
      .finally(() => { if (!controller.signal.aborted) setLoadingNews(false); });
    return () => controller.abort();
  }, []);

  // Jadwal Terdekat (Dividen/Earnings) - ngisi ruang kosong di bawah "Berita Terkini"
  // (kolom kiri lebih pendek dari panel kanan LensRadar/TP-CL). Pola sama persis
  // dengan app/home/page.tsx (fetch + flatten + sort sudah dipakai di sana).
  const [calendarEvents, setCalendarEvents] = useState<
    { date: string; symbol: string; type: 'DIVIDEND' | 'EARNINGS'; title: string }[] | null
  >(null);

  React.useEffect(() => {
    const controller = new AbortController();
    fetch('/api/calendar', { cache: 'no-store', signal: controller.signal })
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
      .catch((error) => { if (!(error instanceof DOMException && error.name === 'AbortError')) setCalendarEvents([]); });
    return () => controller.abort();
  }, []);

  React.useEffect(() => {
    const controller = new AbortController();
    fetch('/api/market-summary', { signal: controller.signal }).then(r => r.json()).then(data => {
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
      } else {
        setTickerFailed(true);
      }
    }).catch((e) => {
      if (!(e instanceof DOMException && e.name === 'AbortError')) { console.error(e); setTickerFailed(true); }
    });
    return () => controller.abort();
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
                {/* Logo header halaman depan - `priority` karena ia di atas lipatan dan
                    ikut dinilai sebagai kandidat LCP di mobile. */}
                <Image src="/sahamlens-logo.png" alt="SahamLens" width={32} height={32} priority className="h-8 w-8 rounded-xl object-contain shadow-sm" />
                <span className="font-bold text-[16px] tracking-tight font-heading">SahamLens</span>
              </div>
              <div className="hidden md:flex items-center gap-3 pl-6 border-l border-white/15">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] uppercase tracking-widest text-white/60 font-semibold">{t('hero.ihsgTitle')}</span>
                  <span className="h-1 w-1 rounded-full bg-tv-green animate-pulse" />
                </div>
                {ihsg ? (
                  <div className="flex items-baseline gap-2">
                    <span className="text-[18px] font-bold tracking-tight font-number">{ihsg.price.toLocaleString(language === 'id' ? 'id-ID' : 'en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold ${ihsg.change >= 0 ? 'bg-tv-green/15 text-tv-green' : 'bg-tv-red/15 text-tv-red'}`}>
                      {ihsg.change >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />} {ihsg.change >= 0 ? '+' : ''}{ihsg.change.toFixed(2)}% ({ihsg.change >= 0 ? '+' : ''}{ihsg.pointChange.toFixed(1)})
                    </span>
                  </div>
                ) : ihsgFailed ? (
                  <span className="text-[12px] font-medium text-white/50">{t('common.noData')}</span>
                ) : (
                  <Skeleton variant="text" className="w-32 h-4" />
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <LanguageSwitcher variant="pill" className="hidden sm:inline-flex" />
              <LanguageSwitcher variant="compact" className="sm:hidden" />
              <ThemeToggle />
              <div className="w-[40px] sm:w-[180px] md:w-[220px]">
                <CommandPalette />
              </div>
              <div className="hidden lg:flex items-center gap-2 rounded-full bg-white/10 border border-white/10 px-2.5 py-1">
                <span className={`h-2 w-2 rounded-full animate-pulse ${marketOpen ? 'bg-tv-green' : 'bg-white/30'}`} />
                <span className="text-[11px] font-medium text-white">{marketOpen ? t('common.live') : t('common.closed')}</span>
              </div>
              <div className="flex items-center gap-2 text-[11px] font-medium text-white/50">
                <span className="hidden sm:inline">{jakartaDate && jakartaTime ? `${jakartaDate} • ${jakartaTime}` : t('common.jakartaTime')}</span>
                <span className="sm:hidden">{jakartaTime || t('common.wibTime')}</span>
              </div>
            </div>
          </div>
          {/* mobile IHSG */}
          <div className="flex md:hidden items-center justify-between pb-3 -mt-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-widest text-white/50 font-semibold">IHSG</span>
              {ihsg ? (
                <>
                  <span className="text-[14px] font-bold font-number">{ihsg.price.toLocaleString(language === 'id' ? 'id-ID' : 'en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                  <span className={`text-[11px] font-semibold ${ihsg.change >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>{ihsg.change >= 0 ? '+' : ''}{ihsg.change.toFixed(2)}%</span>
                </>
              ) : ihsgFailed ? (
                <span className="text-[12px] text-white/50">{t('common.noData')}</span>
              ) : (
                <Skeleton variant="text" className="w-24 h-3.5" />
              )}
            </div>
            <span className={`text-[10px] flex items-center gap-1 ${marketOpen ? 'text-tv-green' : 'text-white/40'}`}><span className={`h-1.5 w-1.5 rounded-full animate-pulse ${marketOpen ? 'bg-tv-green' : 'bg-white/30'}`} />{marketOpen ? t('common.marketOpen') : t('common.marketClosed')}</span>
          </div>
        </div>
      </header>

      <TickerTape items={tickerItems} failed={tickerFailed} />

      {/* lens-main BUKAN sekadar penamaan. Seluruh aturan mobile/tablet di globals.css
          bergantung padanya: lantai tipografi 9-11px, line-height, touch-action,
          overscroll, min-width:0 anti-overflow, lantai target sentuh 44px. Halaman ini
          - halaman publik yang paling banyak dikunjungi - satu-satunya yang memakai
          <main> polos, jadi ia luput dari semuanya. Itulah sebabnya ia selalu jadi
          halaman terburuk di tiap pengukuran (45 teks di bawah 12px @768 setelah
          halaman lain sudah bersih). */}
      <main className="lens-main mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
        {/* Marketing Hero - tagline "Lihat Peluang Lebih Jelas." sudah dipakai di
            metadata (app/layout.tsx) tapi belum pernah dirender di halaman manapun.
            Section aditif, tidak mengubah struktur Title Block/ringkasan pasar di
            bawahnya.
            POLISH (2026-08-05, keluhan user "kelihatan kaku"): bg flat bg-tv-card/50
            diganti gradient-accent-soft (biru->ungu, sudah didefinisikan di
            tailwind.config.js) + glow blur dekoratif di belakang icon (glow-purple,
            juga sudah ada di config) - murni CSS, tidak ada konten/data baru. */}
        {/* HERO - dulu pita setipis ~150px berisi judul, satu paragraf, dan sebuah
            gambar, dengan ruang tengah menganga. Ini bagian pertama yang dilihat orang
            dan ia tidak melakukan apa-apa. Sekarang ia membawa angka pasar yang hidup
            dan jalan masuk yang jelas - tanpa satu pun permintaan jaringan baru,
            semuanya dari state yang sudah ada. */}
        {/* `initial={false}`, BUKAN "hidden" - blok ini berisi elemen LCP halaman
            (paragraf di bawah judul hero, dikonfirmasi Lighthouse). Dengan "hidden",
            server mengirimnya terlihat, lalu hidrasi menyetel opacity 0 dan
            menganimasikannya kembali muncul - jadi elemen terbesar halaman baru
            terlukis SETELAH JS diunduh dan dijalankan. Terukur: FCP 1,0 dtk tapi LCP
            4,3 dtk, dengan "element render delay" 1.250 md dan nol waktu unduh sumber
            daya - teks yang sudah ada di HTML, ditahan oleh animasinya sendiri.
            `initial={false}` membuat framer-motion langsung merender keadaan akhir dan
            melewati animasi masuk. Blok di bawah lipatan tetap dianimasika        {/* HERO */}
        <motion.div variants={fadeUp} initial={false} animate="show">
          <Card
            padding="none"
            className="relative overflow-hidden mb-6 bg-gradient-accent-soft border border-tv-border/60 px-6 py-8 sm:px-10 sm:py-10 shadow-none"
          >
            <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-glow-purple blur-3xl" />
            <div className="pointer-events-none absolute -left-24 -bottom-16 h-64 w-64 rounded-full bg-glow-blue blur-3xl" />

            <div className="relative grid gap-8 lg:grid-cols-[1.2fr_1fr] lg:items-stretch">
              <div className="min-w-0">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-tv-blue/30 bg-tv-blue/10 px-3 py-1 text-[11px] font-semibold text-tv-blue">
                  <Sparkles className="h-3 w-3" /> {t('hero.badge')}
                </span>
                <h2 className="mt-3.5 font-heading text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-tv-text leading-[1.15]">
                  {t('hero.titleLine1')}<br className="hidden sm:block" /> {t('hero.titleLine2')}
                </h2>
                <p className="mt-3 text-sm sm:text-base text-tv-muted max-w-lg leading-relaxed">
                  {t('hero.description')}
                </p>

                {/* Hero Quick Search Bar */}
                <form onSubmit={handleQuickSearch} className="mt-5 flex items-center gap-2 max-w-lg">
                  <div className="relative flex-1">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-tv-muted" />
                    <input
                      type="text"
                      value={quickSearch}
                      onChange={(e) => setQuickSearch(e.target.value.toUpperCase())}
                      placeholder={t('common.searchPlaceholder')}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-tv-card/90 border border-tv-border text-tv-text placeholder:text-tv-muted/70 text-sm font-semibold focus:outline-none focus:border-tv-blue focus:ring-2 focus:ring-tv-blue/20 transition-all shadow-sm"
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-4 py-2.5 rounded-xl bg-tv-blue hover:bg-tv-blueHover text-white text-sm font-bold transition-all shadow-sm shrink-0 flex items-center gap-1.5"
                  >
                    <span>{t('common.search')}</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </form>

                {/* Popular Quick Ticker Chips */}
                <div className="mt-2.5 flex items-center gap-1.5 flex-wrap text-xs text-tv-muted">
                  <span className="text-[11px] font-medium opacity-80">{t('common.popular')}:</span>
                  {['BBCA', 'BBRI', 'BMRI', 'TLKM', 'ASII', 'BREN'].map((s) => (
                    <Link
                      key={s}
                      href={`/technical/${s}.JK`}
                      className="px-2 py-0.5 rounded-lg bg-tv-hover border border-tv-border text-tv-text hover:border-tv-blue/50 text-[11px] font-bold font-number transition-colors"
                    >
                      {s}
                    </Link>
                  ))}
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <Link
                    href="/home"
                    className="rounded-lg bg-tv-blue px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-tv-blueHover shadow-sm"
                  >
                    {t('common.startAnalysis')}
                  </Link>
                  <Link
                    href="/breakout-radar"
                    className="rounded-lg border border-tv-border bg-tv-card px-5 py-2.5 text-sm font-semibold text-tv-text transition-colors hover:border-tv-borderLight shadow-sm"
                  >
                    {t('common.openRadar')}
                  </Link>
                  {guideVisible === false && (
                    <button
                      type="button"
                      onClick={() => setGuideOpenRequest((current) => current + 1)}
                      className="rounded-lg border border-tv-blue/40 bg-tv-blue/10 px-4 py-2.5 text-sm font-semibold text-tv-blue transition-colors hover:bg-tv-blue/20"
                    >
                      {t('common.startHere')}
                    </button>
                  )}
                </div>

                <div className="mt-5 rounded-lg border border-tv-border/70 bg-tv-bg/35 px-3 py-2 text-[11px] leading-relaxed text-tv-muted max-w-lg">
                  <span className="font-semibold text-tv-text">{t('common.disclaimerShort')}</span>{' '}
                  {t('hero.disclaimerBox')}
                  {' '}<Link href="/transparency" className="font-semibold text-tv-blue hover:underline">{t('common.transparencyLink')}</Link>
                  {' '}·{' '}<Link href="/disclaimer" className="hover:text-tv-text hover:underline">{t('common.disclaimerLink')}</Link>
                </div>
              </div>

              {/* Panel angka hidup - IHSG besar + jumlah emiten terpantau */}
              <div className="flex flex-col justify-between">
                <div className="rounded-xl border border-tv-border/60 bg-tv-bg/40 p-4 sm:p-5 backdrop-blur-sm h-full flex flex-col justify-between">
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[10px] font-semibold uppercase tracking-widest text-tv-muted flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-tv-green animate-pulse" />
                        {t('hero.ihsgTitle')}
                      </div>
                      <span className="text-[10px] text-tv-muted bg-tv-hover px-1.5 py-0.5 rounded border border-tv-border">
                        {t('hero.ihsgDelay')}
                      </span>
                    </div>
                    {ihsg ? (
                      <>
                        <div className="mt-2 font-number text-3xl sm:text-4xl font-bold tracking-tight text-tv-text">
                          {ihsg.price.toLocaleString(language === 'id' ? 'id-ID' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          ihsg.change >= 0 ? 'bg-tv-green/15 text-tv-green' : 'bg-tv-red/15 text-tv-red'
                        }`}>
                          {ihsg.change >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                          {ihsg.change >= 0 ? '+' : ''}{ihsg.change.toFixed(2)}% ({ihsg.change >= 0 ? '+' : ''}{ihsg.pointChange.toFixed(1)})
                        </div>
                        {ihsg.dataTimestamp && (
                          <div className="mt-1.5 text-[11px] text-tv-muted">
                            Per {new Date(ihsg.dataTimestamp).toLocaleTimeString(language === 'id' ? 'id-ID' : 'en-US', {
                              hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta',
                            })} WIB
                            {typeof ihsg.ageSeconds === 'number' && ihsg.ageSeconds >= 20 * 60
                              ? ` · ${Math.round(ihsg.ageSeconds / 60)} menit lalu`
                              : ''}
                          </div>
                        )}
                        {ihsgFailed && (
                          <div className="mt-1 text-[11px] font-medium text-tv-red">
                            {t('common.noData')}
                          </div>
                        )}
                      </>
                    ) : ihsgFailed ? (
                      <p className="mt-2 text-sm text-tv-muted">{t('common.noData')}</p>
                    ) : (
                      <div className="mt-2 space-y-2">
                        <Skeleton className="h-9 w-40" />
                        <Skeleton variant="text" className="h-5 w-28" />
                      </div>
                    )}
                  </div>

                  <div className="mt-5 pt-4 border-t border-tv-border">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="font-number text-lg font-bold text-tv-text">{ACTIVE_UNIVERSE_COUNT}</div>
                        <div className="text-[10px] text-tv-muted leading-tight">{t('hero.universeSubtitle')}</div>
                      </div>
                      <div>
                        <div className="font-number text-lg font-bold text-tv-text">
                          {aiPicks === null ? '—' : aiPicks.length}
                        </div>
                        <div className="text-[10px] text-tv-muted leading-tight">{t('hero.passedSubtitle')}</div>
                      </div>
                    </div>
                    <p className="mt-3 text-[10px] leading-relaxed text-tv-muted">
                      {t('hero.universeDescription', { count: ACTIVE_UNIVERSE_COUNT })}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* SIGNAL SAHAM - Langsung di Bawah Hero (Peluang Terkini di Atas Lipatan) */}
        <motion.section
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="mb-8"
        >
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-heading text-xl sm:text-2xl font-bold tracking-tight text-tv-text flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-tv-green opacity-60" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-tv-green" />
                </span>
                {t('radar.title')}
              </h2>
              <p className="mt-1 text-[13px] text-tv-muted max-w-2xl">
                {t('radar.subtitle')}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-tv-muted">
                {aiPicksUpdatedAt ? t('radar.updateTime', { time: aiPicksUpdatedAt }) : t('radar.waitingSnapshot')}
              </span>
              <Link
                href="/breakout-radar"
                className="rounded-lg border border-tv-border bg-tv-card px-3 py-1.5 text-[12px] font-semibold text-tv-text transition-colors hover:border-tv-borderLight shadow-sm"
              >
                {t('radar.viewAllRadar')}
              </Link>
            </div>
          </div>

          {aiPicksNote && (
            <p className={`mb-3 text-[11px] rounded-md border px-3 py-2 leading-relaxed ${
              aiPicksAdvisoryEnabled
                ? 'border-tv-border bg-tv-card/60 text-tv-muted'
                : 'border-tv-yellow/30 bg-tv-yellow/10 text-tv-yellow'
            }`}>
              {aiPicksNote}
            </p>
          )}

          {aiPicks === null ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
                {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28 w-full" />)}
              </div>
              <LoadingFact />
            </div>
          ) : aiPicks.length === 0 ? (
            <Card>
              <EmptyState
                illustration="search"
                title={t('radar.emptyTitle')}
                description={t('radar.emptyDesc')}
              />
            </Card>
          ) : (
            <StockSignalRunningText items={aiPicks} advisoryEnabled={aiPicksAdvisoryEnabled} />
          )}

          <p className="mt-2 text-[10px] leading-relaxed text-tv-muted">
            {t('radar.footerNote')}
          </p>
        </motion.section>

        {/* TRUST & TRANSPARANSI METRIC STRIP */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8"
        >
          {[
            {
              icon: Zap,
              title: t('metrics.liquidTitle', { count: ACTIVE_UNIVERSE_COUNT }),
              subtitle: t('metrics.liquidSub'),
              tone: 'text-tv-blue bg-tv-blue/10 border-tv-blue/20',
            },
            {
              icon: Cpu,
              title: t('metrics.rulesTitle'),
              subtitle: t('metrics.rulesSub'),
              tone: 'text-tv-green bg-tv-green/10 border-tv-green/20',
            },
            {
              icon: ShieldCheck,
              title: t('metrics.transparencyTitle'),
              subtitle: t('metrics.transparencySub'),
              tone: 'text-tv-yellow bg-tv-yellow/10 border-tv-yellow/20',
            },
            {
              icon: Clock,
              title: t('metrics.eodTitle'),
              subtitle: t('metrics.eodSub'),
              tone: 'text-tv-purple bg-tv-purple/10 border-tv-purple/20',
            },
          ].map((m, idx) => (
            <div
              key={idx}
              className="p-3.5 rounded-2xl bg-tv-card border border-tv-border flex items-center gap-3 shadow-1 transition-all hover:border-tv-borderLight"
            >
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${m.tone}`}>
                <m.icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="font-heading text-xs sm:text-sm font-bold text-tv-text truncate">{m.title}</div>
                <div className="text-[10px] text-tv-muted truncate">{m.subtitle}</div>
              </div>
            </div>
          ))}
        </motion.div>

        <GettingStartedGuide openRequest={guideOpenRequest} onVisibilityChange={setGuideVisible} />

        {/* BENTO GRID: EKOSISTEM ALAT ANALISIS SAHAMLENS */}
        <motion.section
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="mb-8"
        >
          <div className="mb-4 flex flex-col gap-1">
            <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-tv-blue">{t('bento.tag')}</span>
            <h2 className="font-heading text-xl sm:text-2xl font-bold tracking-tight text-tv-text">{t('bento.title')}</h2>
            <p className="max-w-3xl text-sm leading-relaxed text-tv-muted">
              {t('bento.subtitle')}
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {/* Tile 1 (Large - Featured): LensConsensus & Teknikal Pro */}
            <Link
              href="/dashboard"
              className="group lg:col-span-2 relative overflow-hidden rounded-2xl border border-tv-border bg-tv-card p-6 shadow-1 transition-all duration-200 hover:-translate-y-0.5 hover:border-tv-borderLight hover:bg-tv-cardAlt flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border text-tv-blue bg-tv-blue/10 border-tv-blue/20">
                      <LineChart className="h-5 w-5" />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-tv-blue">{t('bento.featuredBadge')}</span>
                      <h3 className="font-heading text-lg font-bold text-tv-text">{t('bento.technicalTitle')}</h3>
                    </div>
                  </div>
                  <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-tv-blue/15 text-tv-blue border border-tv-blue/30">
                    {t('bento.consensusBadge')}
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-tv-muted max-w-xl">
                  {t('bento.technicalDesc')}
                </p>
              </div>
              <div className="mt-5 pt-4 border-t border-tv-border/60 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold text-tv-muted">
                  <CheckCircle2 className="h-3.5 w-3.5 text-tv-green" />
                  <span>{t('bento.technicalRuleBadge')}</span>
                </div>
                <span className="inline-flex text-xs font-bold text-tv-blue transition-colors group-hover:text-tv-text flex items-center gap-1">
                  {t('bento.technicalAction')} <ArrowRight className="h-3 w-3" />
                </span>
              </div>
            </Link>

            {/* Tile 2: Moat Proxy & Fundamental Sehat */}
            <Link
              href="/fundamental"
              className="group relative overflow-hidden rounded-2xl border border-tv-border bg-tv-card p-6 shadow-1 transition-all duration-200 hover:-translate-y-0.5 hover:border-tv-borderLight hover:bg-tv-cardAlt flex flex-col justify-between"
            >
              <div>
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border text-tv-green bg-tv-green/10 border-tv-green/20">
                  <Target className="h-5 w-5" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-tv-green">{t('bento.qualityBadge')}</span>
                <h3 className="font-heading text-lg font-bold text-tv-text mt-0.5">{t('bento.fundamentalTitle')}</h3>
                <p className="mt-2 text-sm leading-relaxed text-tv-muted">
                  {t('bento.fundamentalDesc')}
                </p>
              </div>
              <div className="mt-5 pt-4 border-t border-tv-border/60 flex items-center justify-between">
                <span className="inline-flex text-xs font-bold text-tv-green transition-colors group-hover:text-tv-text flex items-center gap-1">
                  {t('bento.fundamentalAction')} <ArrowRight className="h-3 w-3" />
                </span>
              </div>
            </Link>

            {/* Tile 3: LensScanner & Breakout Radar */}
            <Link
              href="/screener"
              className="group relative overflow-hidden rounded-2xl border border-tv-border bg-tv-card p-5 shadow-1 transition-all duration-200 hover:-translate-y-0.5 hover:border-tv-borderLight hover:bg-tv-cardAlt flex flex-col justify-between"
            >
              <div>
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border text-tv-purple bg-tv-purple/10 border-tv-purple/20">
                  <Filter className="h-5 w-5" />
                </div>
                <h4 className="font-heading text-base font-bold text-tv-text">{t('bento.screenerTitle')}</h4>
                <p className="mt-1.5 text-sm leading-relaxed text-tv-muted sm:text-[13px]">
                  {t('bento.screenerDesc')}
                </p>
              </div>
              <span className="mt-4 inline-flex text-xs font-bold text-tv-purple transition-colors group-hover:text-tv-text flex items-center gap-1">
                {t('bento.screenerAction')} <ArrowRight className="h-3 w-3" />
              </span>
            </Link>

            {/* Tile 4: Backtest Transparan */}
            <Link
              href="/backtest"
              className="group relative overflow-hidden rounded-2xl border border-tv-border bg-tv-card p-5 shadow-1 transition-all duration-200 hover:-translate-y-0.5 hover:border-tv-borderLight hover:bg-tv-cardAlt flex flex-col justify-between"
            >
              <div>
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border text-tv-yellow bg-tv-yellow/10 border-tv-yellow/20">
                  <History className="h-5 w-5" />
                </div>
                <h4 className="font-heading text-base font-bold text-tv-text">{t('bento.backtestTitle')}</h4>
                <p className="mt-1.5 text-sm leading-relaxed text-tv-muted sm:text-[13px]">
                  {t('bento.backtestDesc')}
                </p>
              </div>
              <span className="mt-4 inline-flex text-xs font-bold text-tv-yellow transition-colors group-hover:text-tv-text flex items-center gap-1">
                {t('bento.backtestAction')} <ArrowRight className="h-3 w-3" />
              </span>
            </Link>

            {/* Tile 5: Earnings Monitor & Dividen */}
            <Link
              href="/dividend"
              className="group relative overflow-hidden rounded-2xl border border-tv-border bg-tv-card p-5 shadow-1 transition-all duration-200 hover:-translate-y-0.5 hover:border-tv-borderLight hover:bg-tv-cardAlt flex flex-col justify-between"
            >
              <div>
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border text-tv-green bg-tv-green/10 border-tv-green/20">
                  <BarChart3 className="h-5 w-5" />
                </div>
                <h4 className="font-heading text-base font-bold text-tv-text">{t('bento.dividendTitle')}</h4>
                <p className="mt-1.5 text-sm leading-relaxed text-tv-muted sm:text-[13px]">
                  {t('bento.dividendDesc')}
                </p>
              </div>
              <span className="mt-4 inline-flex text-xs font-bold text-tv-green transition-colors group-hover:text-tv-text flex items-center gap-1">
                {t('bento.dividendAction')} <ArrowRight className="h-3 w-3" />
              </span>
            </Link>

            {/* Tile 6 (Full Width on lg): Dashboard Makro & Sektor */}
            <Link
              href="/macro"
              className="group lg:col-span-3 relative overflow-hidden rounded-2xl border border-tv-border bg-tv-card p-5 sm:p-6 shadow-1 transition-all duration-200 hover:-translate-y-0.5 hover:border-tv-borderLight hover:bg-tv-cardAlt flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="flex items-start gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-tv-purple bg-tv-purple/10 border-tv-purple/20 mt-0.5">
                  <Waves className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-heading text-base font-bold text-tv-text">{t('bento.macroTitle')}</h4>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-tv-purple/15 text-tv-purple border border-tv-purple/30">
                      {t('bento.macroBadge')}
                    </span>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-tv-muted max-w-3xl">
                    {t('bento.macroDesc')}
                  </p>
                </div>
              </div>
              <span className="inline-flex shrink-0 text-xs font-bold text-tv-purple transition-colors group-hover:text-tv-text items-center gap-1">
                {t('bento.macroAction')} <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </Link>
          </div>
        </motion.section>

        {/* Berita & Jadwal - dikeluarkan dari dalam kartu chart. */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.15 }}
          className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6"
        >
          <motion.div variants={fadeUp}>
              <Card padding="md" className="h-full">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-heading text-[13px] font-bold text-tv-text">{t('news.title')}</h3>
                  <Link href="/news" className="inline-flex min-h-6 items-center text-[11px] font-bold text-tv-blue transition hover:text-tv-text">{t('news.viewAll')}</Link>
                </div>
                <div className="mt-3 divide-y divide-tv-border/60">
                  {loadingNews ? (
                    <div className="space-y-2.5">
                      {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
                    </div>
                  ) : newsItems.length === 0 ? (
                    <EmptyState
                      illustration="search"
                      title={t('news.emptyTitle')}
                      description={t('news.emptyDesc')}
                    />
                  ) : (
                    newsItems.map((n) => (
                      <a key={n.link || n.title} href={n.link} target="_blank" rel="noopener noreferrer" className="block py-2.5 first:pt-0 last:pb-0 hover:opacity-80 transition-opacity">
                        <p className="text-[12px] font-medium text-tv-text leading-snug line-clamp-2">{n.title}</p>
                        <p className="text-[10px] text-tv-muted mt-1 flex items-center gap-1.5">
                          {n.source}
                          {n.sentiment && (
                            <span className={`lens-chip rounded px-1.5 py-px font-bold ${
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
          </motion.div>

          {/* Jadwal Terdekat - dividen/earnings */}
          <motion.div variants={fadeUp}>
              <Card padding="md" className="h-full">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="font-heading text-[13px] font-bold text-tv-text">{t('calendar.title')}</h4>
                  <Link href="/calendar" className="inline-flex min-h-6 items-center text-[11px] font-bold text-tv-blue transition hover:text-tv-text">{t('calendar.viewAll')}</Link>
                </div>
                <div className="mt-3">
                  {calendarEvents === null ? (
                    <div className="space-y-2">
                      {[0, 1].map((i) => <Skeleton key={i} className="h-11 w-full" />)}
                    </div>
                  ) : calendarEvents.length === 0 ? (
                    <EmptyState
                      illustration="empty"
                      title={t('calendar.emptyTitle')}
                      description={t('calendar.emptyDesc')}
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
                                {e.type === 'DIVIDEND' ? t('calendar.dividendType') : t('calendar.earningsType')}
                              </span>
                            </div>
                            <div className="text-[10px] text-tv-muted truncate">{e.title}</div>
                          </div>
                          <span className="text-[11px] text-tv-muted font-number shrink-0">
                            {new Date(e.date).toLocaleDateString(language === 'id' ? 'id-ID' : 'en-US', { day: 'numeric', month: 'short' })}
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
          </motion.div>
        </motion.div>

        <SiteFooter />
      </main>
    </div>
  );
}
