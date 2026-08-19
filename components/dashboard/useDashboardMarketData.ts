'use client';

import React, { useState } from 'react';
import { isMarketOpen } from '@/lib/utils/market';
import { apiRequest } from '@/shared/http/api-client';

export interface DashboardMarketDataOptions {
  initialIhsg?: {
    price: number;
    change: number;
    pointChange: number;
    dataTimestamp?: string | null;
    ageSeconds?: number | null;
  } | null;
  initialRenderedAt?: string;
  initialLensRadar?: {
    items: { symbol: string; price: number; finalScore: number; flagged?: boolean; tp1: number | null; tp2: number | null; cl1: number | null; signals?: string[]; coverage?: number | null; cl2?: number | null; changePct?: number | null; brokerCode?: string | null; brokerNetValue?: number | null; brokerTradeDate?: string | null }[];
    computedAt: string | null;
    advisoryEnabled: boolean;
    note: string | null;
  } | null;
}

export function useDashboardMarketData({ initialIhsg = null, initialRenderedAt, initialLensRadar = null }: DashboardMarketDataOptions) {
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
    apiRequest<any>('/api/live/^JKSE', { signal: controller.signal })
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
      symbol: string; price: number; changePct: number | null; finalScore: number;
      // `signals` menggantikan `bonuses` (audit skor 2026-08-05) - sinyal hari ini jadi
      // label, bukan poin. Opsional: response bisa berasal dari cache lama.
      signals?: string[];
      coverage?: number | null;
      tp1: number | null; tp2: number | null; cl1: number | null; cl2: number | null;
      flagged?: boolean;
      brokerCode?: string | null; brokerNetValue?: number | null; brokerTradeDate?: string | null;
    }[] | null
  >(initialLensRadar?.items ? initialLensRadar.items.map((item) => ({
    ...item,
    changePct: typeof item.changePct === 'number' && Number.isFinite(item.changePct) ? item.changePct : null,
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
    apiRequest<any>('/api/ai-pick', { signal: controller.signal })
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
    apiRequest<any>('/api/news', { cache: 'no-store', signal: controller.signal })
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
    apiRequest<any>('/api/calendar', { cache: 'no-store', signal: controller.signal })
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
    apiRequest<any>('/api/market-summary', { signal: controller.signal }).then(data => {
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

  return {
    ihsg,
    ihsgFailed,
    tickerFailed,
    tickerItems,
    aiPicks,
    aiPicksUpdatedAt,
    aiPicksNote,
    aiPicksAdvisoryEnabled,
    newsItems,
    loadingNews,
    calendarEvents,
    jakartaDate,
    jakartaTime,
    marketOpen,
  };
}
