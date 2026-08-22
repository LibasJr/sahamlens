'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Activity, BarChart3, RefreshCw, ArrowUpRight, ArrowDownRight, Layers, Zap,
} from 'lucide-react';
import { FREE_LIMITS } from '@/shared/constants/limits';
import { MONTHLY_PRICE, formatRupiah } from '@/shared/config/pricing';
import { shouldShowLoginPromptFor401 } from '@/lib/auth-gate';
import PaywallModal from '@/components/PaywallModal';
import { Button, Card, Badge, PageContainer, Skeleton, EmptyState, LoadingFact, TickerAvatar, AnimatedNumber } from '@/components/ui';
import { MarketRegimePanel } from '@/components/market/MarketRegimePanel';
import {
  BreadthBar,
  BreadthDetailModal,
  HeatmapTile,
  SectorDetailModal,
  SectorNarrative,
  Sparkline,
  type BreadthDirection,
} from '@/components/market-pulse/PulseVisuals';
import { apiRequest, isApiClientError } from '@/shared/http/api-client';
import { useAuthUser } from '@/lib/hooks/useAuthUser';
import Link from 'next/link';
import { Lock } from 'lucide-react';
import MenuUsageGuide from '@/components/MenuUsageGuide';

export default function MarketPulse() {
  const [data, setData] = useState<any>(null);
  const [breakoutData, setBreakoutData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [selectedSector, setSelectedSector] = useState<any>(null);
  const [selectedBreadthDirection, setSelectedBreadthDirection] = useState<BreadthDirection | null>(null);
  // BUG FIX (2026-08-06): sebelumnya kegagalan fetch dan penolakan akses tidak
  // pernah tercatat di state - `data` tetap null sementara `loading` sudah false,
  // sehingga KETIGA section (index cards, heatmap, breadth) menampilkan skeleton
  // atau spinner "Memuat data breadth..." selamanya, tanpa jalan keluar dan tanpa
  // memberi tahu user bahwa permintaannya gagal. Modal paywall menutupi gejalanya
  // hanya sampai user menutup modal itu.
  const [loadError, setLoadError] = useState(false);
  const { loading: authLoading, resolved: authResolved, user: authUser } = useAuthUser();
  const [gated, setGated] = useState<null | 'login' | 'pro'>(null);
  const fetchAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const fetchData = useCallback(async () => {
    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;
    setLoading(true);
    setLoadError(false);
    try {
      const json = await apiRequest<any>('/api/market-pulse', { cache: 'no-store', signal: controller.signal });
      try {
        const radar = await apiRequest<any>('/api/breakout-radar', { signal: controller.signal });
        setBreakoutData(radar?.data || []);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) console.warn('Breakout radar companion data unavailable', error);
      }
      setGated(null);
      setData(json);
      const snapshotTime = new Date(json.timestamp);
      setLastUpdate(Number.isNaN(snapshotTime.getTime()) ? null : snapshotTime);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (isApiClientError(error) && error.code === 'UNAUTHENTICATED') {
        if (await shouldShowLoginPromptFor401()) { setGated('login'); setShowLoginPrompt(true); }
        else setLoadError(true);
        return;
      }
      if (isApiClientError(error) && error.code === 'SUBSCRIPTION_REQUIRED') {
        setGated('pro');
        setShowPaywall(true);
        return;
      }
      console.error(error);
      setLoadError(true);
    } finally {
      if (fetchAbortRef.current === controller) {
        fetchAbortRef.current = null;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      if (!document.hidden) fetchData();
    }, 120000); // 2 min refresh; pause saat tab tidak terlihat
    return () => {
      clearInterval(interval);
      fetchAbortRef.current?.abort();
    };
  }, [fetchData]);

  // Satu tempat memutuskan apa yang dirender tiap section, supaya urutan cek
  // (gerbang akses sebelum error, error sebelum loading) tidak ditulis ulang -
  // dan berbeda-beda - di tiga tempat.
  const blocker: null | 'login' | 'pro' | 'error' | 'loading' =
    gated ?? (loadError ? 'error' : !data ? 'loading' : null);

  // GEMBOK TAMU (2026-08-23). SENGAJA terpisah dari `blocker` di atas: `blocker`
  // berlaku global untuk seluruh section, sedangkan arah pasar (indeks) harus TETAP
  // terbuka - itu yang membuat halaman ini berguna sekilas dan layak muncul di mesin
  // pencari. Yang dikunci hanya dua section yang butuh kerja analisis: Sector Heatmap
  // dan Market Breadth.
  const lockForGuest = !authResolved || authLoading || !authUser;

  const renderGuestLock = (what: string) => (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-10 text-center">
      <Lock className="h-6 w-6 text-tv-yellow" />
      <p className="text-sm font-bold text-tv-text">{what} terkunci</p>
      <p className="max-w-xs text-xs leading-relaxed text-tv-muted">
        Buat akun gratis untuk melihat kekuatan 11 sektor dan sebaran naik-turun pasar hari ini.
      </p>
      <Link
        href="/login?next=/market-pulse"
        className="inline-flex items-center gap-2 rounded-full bg-tv-blue px-5 py-2 text-sm font-bold text-white transition hover:bg-tv-blueHover"
      >
        Masuk atau daftar gratis
      </Link>
    </div>
  );

  const renderBlocker = (what: string) => {
    if (blocker === 'login') {
      return <EmptyState illustration="empty" title={`${what} belum bisa dimuat`} description="Data publik LensMarket belum tersedia dari server. Coba refresh; jika tetap muncul, cek status API." action={{ label: 'Coba lagi sekarang', onClick: fetchData }} />;
    }
    if (blocker === 'pro') {
      return <EmptyState illustration="locked" title="Fitur Pro" description={`${what} tersedia di paket Pro.`} action={{ label: 'Lihat Paket', onClick: () => setShowPaywall(true) }} />;
    }
    if (blocker === 'error') {
      return <EmptyState illustration="empty" title={`${what} gagal dimuat`} description="Sambungan ke sumber data terputus. Data akan dicoba lagi otomatis tiap 2 menit." action={{ label: 'Coba lagi sekarang', onClick: fetchData }} />;
    }
    return null;
  };

  const formatTime = (date: Date) => new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date) + ' WIB';
  const breadthGroups = useMemo(() => {
    const stocks = Array.isArray(data?.breadth?.stocks) ? data.breadth.stocks : [];
    return {
      ADVANCING: stocks.filter((stock: any) => stock.direction === 'ADVANCING'),
      UNCHANGED: stocks.filter((stock: any) => stock.direction === 'UNCHANGED'),
      DECLINING: stocks.filter((stock: any) => stock.direction === 'DECLINING'),
    } as Record<BreadthDirection, any[]>;
  }, [data?.breadth?.stocks]);

  return (
    <div className="flex-1 flex flex-col bg-tv-bg min-h-screen">
      {/* Top Header */}
      <header className="sticky top-0 z-20 border-b border-white/[0.055] bg-tv-bg/80 px-4 py-4 backdrop-blur-xl sm:px-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-md bg-tv-blue text-white shrink-0">
              <Activity className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              {/* h1, bukan h2: ini judul halaman, dan sebelumnya /market-pulse adalah
                  satu-satunya halaman yang sama sekali tidak punya h1 - headingnya
                  langsung mulai dari h2. Pembaca layar kehilangan judul halamannya
                  (WCAG 1.3.1 & 2.4.6). */}
              <h1 className="lens-page-title truncate">Kondisi Pasar</h1>
              <p className="text-xs text-tv-muted truncate">Quant regime, IHSG, sector, dan breadth</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 text-xs flex-wrap">
            {/* Data sama untuk semua tier (satu cache dari cron 5 menit, sumber Yahoo
                Finance) - dulu ada badge "Realtime" (Pro) vs "Delay 15m" (gratis) yang
                menyiratkan Pro dapat data lebih baru, padahal keduanya baca cache yang
                sama persis (lihat app/api/market-pulse/route.ts). */}
            {/* dihapus - "Yahoo Finance" tidak perlu terekspos ke publik/SEO, freshness
                data sudah terwakili badge "Update: [jam]" di sebelah kanan. */}
            <div className="bg-tv-hover border border-tv-border px-3 py-1.5 rounded-full text-tv-muted whitespace-nowrap">
              Data sesi: {isClient && lastUpdate ? formatTime(lastUpdate) : 'Loading...'}
            </div>
            <Button variant="bare" size="none"
              onClick={fetchData}
              disabled={loading}
              className="bg-tv-hover border border-tv-border hover:bg-tv-borderLight px-3 py-1.5 rounded-full text-tv-text flex items-center gap-2 transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      </header>

      <PageContainer className="p-4 md:p-6 lg:p-7 space-y-6">
        <MenuUsageGuide
          menuKey="market-pulse"
          whatItAnswers="Pasar hari ini sedang condong ke mana, dan sektor apa yang memimpin?"
          steps={[
            "Lihat baris indeks di atas untuk tahu arah IHSG hari ini.",
            "Sector Heatmap memperlihatkan sektor mana yang menguat dan mana yang tertinggal.",
            "Market Breadth memberi tahu apakah kenaikan merata atau cuma ditopang segelintir saham.",
          ]}
          freeAccess="arah IHSG dan indeks pasar hari ini"
          afterSignup="kekuatan 11 sektor dan sebaran naik-turun seluruh pasar"
          loginNext="/market-pulse"
        />
        {/* Skor regime dihitung server-side dari snapshot yang sama. */}
        {blocker && blocker !== 'loading' ? (
          <Card padding="none" radius="xl" elevation="sm" overflow="visible" highlight={false} className="border-tv-border">
            {renderBlocker('Market Regime')}
          </Card>
        ) : data?.marketRegime ? (
          <MarketRegimePanel data={data.marketRegime} />
        ) : (
          <Skeleton className="h-[460px] w-full rounded-xl" />
        )}

        {/* === SECTION 1: INDEX CARDS === */}
        {blocker && blocker !== 'loading' ? (
          <Card padding="none" radius="lg" elevation="sm" overflow="visible" highlight={false} className="border-tv-border">
            {renderBlocker('Indeks pasar')}
          </Card>
        ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-4">
          {data?.indices ? data.indices.map((idx: any) => {
            // price/changePct sekarang bisa null (data tidak tersedia dari Yahoo, BUKAN
            // di-fallback ke angka dummy - lihat market-pulse.service.ts) - render N/A
            // eksplisit, jangan anggap null sebagai 0/naik.
            const hasData = idx.price != null && idx.changePct != null;
            const isUp = hasData && idx.changePct >= 0;
            return (
              <motion.div
                key={idx.name}
                whileHover={{ scale: 1.01, y: -2 }}
                transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                // BARU (2026-08-14, temuan Cloudflare Web Analytics - CLS 0.2 di grid ini,
                // 6 kali dalam 3 hari): kartu skeleton loading di bawah punya tinggi konten
                // beda dari kartu asli (3 baris rata tinggi vs 2 baris rata renggang), jadi
                // grid melompat begitu data datang menggantikan skeleton. min-h-[132px] dikunci
                // sama di kartu asli & skeleton supaya penggantiannya tidak menggeser layout.
                className={`bg-tv-card border rounded-lg p-4 shadow-1 transition-colors hover:shadow-2 min-h-[132px] ${
                  !hasData ? 'border-tv-border' : isUp ? 'border-tv-green/30' : 'border-tv-red/30'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-[10px] text-tv-muted uppercase font-semibold tracking-wide">{idx.fullName}</div>
                    <div className="text-lg font-extrabold text-tv-text font-number">{idx.name}</div>
                  </div>
                  {hasData ? (
                    <div className={`flex items-center gap-1 text-sm font-bold font-number ${isUp ? 'text-tv-green' : 'text-tv-red'}`}>
                      {isUp ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                      {isUp ? '+' : ''}{idx.changePct}%
                    </div>
                  ) : (
                    <div className="text-sm font-bold font-number text-tv-muted">N/A</div>
                  )}
                </div>
                <div className="flex items-end justify-between gap-2">
                  {hasData ? (
                    <AnimatedNumber
                      value={idx.price}
                      format={(n) => n.toLocaleString('id-ID', { maximumFractionDigits: 0 })}
                      className="text-2xl font-extrabold text-tv-text font-number"
                    />
                  ) : (
                    // Teks sepanjang "Data tidak tersedia" di slot font 2xl dulu meluber
                    // keluar kartu di layar sempit. Ukurannya diturunkan karena ini kalimat,
                    // bukan angka - slot besar itu memang dirancang untuk angka.
                    <span className="text-sm text-tv-muted leading-snug">Data indeks tidak tersedia dari sumber harga</span>
                  )}
                  {hasData && <Sparkline data={idx.sparkline} color={isUp ? '#22C55E' : '#EF4444'} />}
                </div>
                {idx.name === 'IHSG' && idx.source === 'IDX_OFFICIAL_INDEX_SUMMARY' && (
                  <div className="mt-1 text-[10px] font-semibold text-tv-blue">Penutupan resmi BEI</div>
                )}
              </motion.div>
            );
          }) : (
            [1, 2, 3, 4].map(i => (
              <Card key={i} padding="none" radius="lg" elevation="sm" overflow="visible" highlight={false} className="border-tv-border p-4 space-y-2 min-h-[132px]">
                <Skeleton variant="text" className="w-20" />
                <Skeleton variant="text" className="w-16 h-5" />
                <Skeleton className="h-8 w-full" />
              </Card>
            ))
          )}
        </div>
        )}

        {/* === SECTION 1.5: BREAKOUT WIDGET === */}
        <Card padding="none" radius="lg" elevation="sm" overflow="hidden" highlight={false} className="border-tv-blue/30 p-5 relative">
          <div className="flex items-center justify-between border-b border-tv-border pb-3 mb-4">
            <div>
              {/* flex-wrap: lencana "Delayed" terpotong di 320px tanpa ini. */}
              <h3 className="font-heading text-base font-bold text-tv-text flex flex-wrap items-center gap-2">
                <Zap className="w-5 h-5 text-tv-blue" />
                Top 3 Breakout Hari Ini
                {/* BUG FIX (2026-08-14, masukan review eksternal - "label 'Delayed' perlu
                    menyesatkan, sumber datanya delay bukan realtime"): title (tooltip
                    hover) untuk desktop + caption di bawah (terlihat tanpa hover, untuk
                    HP) - keduanya jujur soal delay Yahoo Finance ~15 menit. Label dibuat eksplisit sebagai delayed karena sumber Yahoo dapat tertunda; refresh berkala tidak membuat data menjadi realtime. */}
                <Badge variant="danger" dot title="Data Yahoo Finance, delay ±15 menit dari kondisi pasar riil - bukan realtime">Delayed</Badge>
              </h3>
              <p className="mt-0.5 text-[10px] text-tv-muted">Sumber: Yahoo Finance, delay ±15 menit</p>
            </div>
            <a href="/breakout-radar" className="text-xs text-tv-blue hover:text-tv-text flex items-center gap-1 transition-colors">
              Lihat Semua Radar &rarr;
            </a>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {loading && breakoutData.length === 0 ? (
              <>
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)}
                <LoadingFact className="md:col-span-3" />
              </>
            ) : breakoutData.length > 0 ? (
              breakoutData.slice(0, 3).map((item, idx) => (
                <motion.a
                  key={item.symbol}
                  href={`/?symbol=${item.symbol}`}
                  whileHover={{ scale: 1.01, y: -2 }}
                  whileTap={{ scale: 0.99 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                  className="bg-tv-hover/50 border border-tv-border hover:border-tv-blue/50 transition-colors rounded-lg p-4 group block"
                >
                  <div className="flex justify-between items-start mb-2 gap-2">
                    <div className="font-bold text-tv-text font-number flex items-center gap-2 min-w-0">
                      <span className="text-xs text-tv-muted shrink-0">#{idx + 1}</span>
                      <TickerAvatar symbol={item.symbol} size="sm" />
                      <span className="truncate">{item.symbol.replace(/\.JK$/i, '')}</span>
                    </div>
                    <div className="text-xs font-bold text-tv-blue font-number shrink-0">{item.change}</div>
                  </div>
                  <div className="text-[10px] text-tv-muted line-clamp-1 mb-2">
                    {item.reason || 'Alasan breakout belum dirinci untuk saham ini'}
                  </div>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-tv-border gap-2">
                    {/* Skor 0-8 diberi bar: "5/8" dan "7/8" sulit dibedakan sekilas saat
                        tiga kartu bersebelahan. */}
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs text-tv-text font-number shrink-0">{item.score}/8</span>
                      <span className="h-1 w-12 rounded-full bg-tv-border overflow-hidden shrink-0">
                        <span className="block h-full rounded-full bg-tv-blue" style={{ width: `${Math.min(100, (Number(item.score) / 8) * 100)}%` }} />
                      </span>
                    </div>
                    <span className="text-[10px] text-tv-muted bg-tv-hover px-2 rounded font-number shrink-0">RR {item.rr}</span>
                  </div>
                </motion.a>
              ))
            ) : (
              <div className="md:col-span-3">
                <EmptyState
                  illustration="search"
                  title="Belum ada saham yang masuk radar breakout"
                  description="Radar hanya memuat saham yang lolos seluruh syarat breakout hari ini. Daftar kosong berarti tidak ada yang lolos - bukan berarti pemindaian gagal."
                  action={{ label: 'Buka LensRadar', onClick: () => { window.location.href = '/breakout-radar'; } }}
                />
              </div>
            )}
          </div>
        </Card>

        {/* Heatmap & Breadth bersebelahan di layar lebar (2026-08-03) - sebelumnya
            bertumpuk atas-bawah sehingga halaman jadi panjang padahal keduanya cuma
            butuh setengah lebar. Tetap bertumpuk di bawah lg supaya terbaca di HP
            (aplikasi dibuka lewat WebView). items-stretch bawaan grid membuat kedua
            kartu setinggi yang tertinggi, jadi tidak ada ruang kosong menganggur. */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* === SECTION 2: SECTOR HEATMAP === */}
        <Card padding="none" radius="lg" elevation="sm" overflow="visible" highlight={false} className="border-tv-border p-5 flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-tv-border pb-3 mb-4">
            <h3 className="font-heading text-base font-bold text-tv-text flex items-center gap-2">
              <Layers className="w-5 h-5 text-tv-green" />
              Sector Heatmap IDX
            </h3>
            <span className="text-[10px] text-tv-muted">
              11 Sektor • Warna ~ % Perubahan • Rata-rata beberapa saham wakil per sektor (bukan indeks sektor resmi IDX)
            </span>
          </div>

          {lockForGuest ? (
            renderGuestLock('Sector Heatmap')
          ) : blocker && blocker !== 'loading' ? (
            renderBlocker('Sector Heatmap')
          ) : data?.sectorHeatmap ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 flex-1 content-start">
                {data.sectorHeatmap.map((sector: any) => (
                  <HeatmapTile key={sector.sector} {...sector} onSelect={setSelectedSector} />
                ))}
              </div>
              <SectorNarrative sectors={data.sectorHeatmap} />
            </>
          ) : (
            <div className="flex-1">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 content-start">
                {[...Array(11)].map((_, i) => (
                  <Skeleton key={i} className="h-24 w-full" />
                ))}
              </div>
              <LoadingFact className="mt-3" />
            </div>
          )}
        </Card>

        {/* === SECTION 3: MARKET BREADTH === */}
        {/* Top Volume/Value dan Top Movers dihapus dari sini - sudah ada versi yang
            sama di halaman utama (components/Dashboard.tsx), duplikat murni. Market
            Breadth (naik/turun/stagnan) tidak ada di halaman lain, jadi tetap di sini. */}
        <Card padding="none" radius="lg" elevation="sm" overflow="visible" highlight={false} className="border-tv-border p-5 flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-tv-border pb-3 mb-4">
            <h3 className="font-heading text-base font-bold text-tv-text flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-tv-green" />
              Market Breadth (universe terpantau)
            </h3>
            <span className="text-[10px] text-tv-muted">
              {data?.breadth?.total ?? 0} / {data?.breadth?.expectedTotal ?? 'N/A'} saham terbaca
            </span>
          </div>

          {lockForGuest ? (
            renderGuestLock('Market Breadth')
          ) : blocker && blocker !== 'loading' ? (
            renderBlocker('Market Breadth')
          ) : data?.breadth ? (
            <div className="space-y-5 flex-1 flex flex-col">
              <BreadthBar {...data.breadth} />

              {/* 2 kolom saja - kartu ini sekarang setengah lebar layar, 4 kolom membuat
                  angkanya terlalu sempit dan terpotong di layar sedang. */}
              <div className="grid grid-cols-2 gap-2 sm:gap-3 flex-1 content-start">
                <Button variant="bare" size="none"
                  type="button"
                  onClick={() => setSelectedBreadthDirection('ADVANCING')}
                  disabled={!data.breadth.stocks}
                  title="Buka daftar emiten naik"
                  className="rounded-lg border border-tv-green/20 bg-tv-bg p-2 text-center transition-colors hover:bg-tv-green/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-tv-blue/60 disabled:cursor-not-allowed disabled:opacity-70 sm:p-4"
                >
                  <AnimatedNumber value={data.breadth.advancing} className="block text-xl sm:text-3xl font-extrabold text-tv-green font-number" />
                  <div className="text-[10px] sm:text-[10px] text-tv-muted uppercase font-semibold tracking-wide mt-1">Naik (Advance)</div>
                  <div className="mt-1 lens-meta text-tv-green/80">Ketuk untuk daftar</div>
                </Button>
                <Button variant="bare" size="none"
                  type="button"
                  onClick={() => setSelectedBreadthDirection('UNCHANGED')}
                  disabled={!data.breadth.stocks}
                  title="Buka daftar emiten stagnan"
                  className="rounded-lg border border-tv-border bg-tv-bg p-2 text-center transition-colors hover:bg-tv-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-tv-blue/60 disabled:cursor-not-allowed disabled:opacity-70 sm:p-4"
                >
                  <AnimatedNumber value={data.breadth.unchanged} className="block text-xl sm:text-3xl font-extrabold text-tv-muted font-number" />
                  <div className="text-[10px] sm:text-[10px] text-tv-muted uppercase font-semibold tracking-wide mt-1">Stagnan</div>
                  <div className="mt-1 lens-meta text-tv-muted">Ketuk untuk daftar</div>
                </Button>
                <Button variant="bare" size="none"
                  type="button"
                  onClick={() => setSelectedBreadthDirection('DECLINING')}
                  disabled={!data.breadth.stocks}
                  title="Buka daftar emiten turun"
                  className="rounded-lg border border-tv-red/20 bg-tv-bg p-2 text-center transition-colors hover:bg-tv-red/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-tv-blue/60 disabled:cursor-not-allowed disabled:opacity-70 sm:p-4"
                >
                  <AnimatedNumber value={data.breadth.declining} className="block text-xl sm:text-3xl font-extrabold text-tv-red font-number" />
                  <div className="text-[10px] sm:text-[10px] text-tv-muted uppercase font-semibold tracking-wide mt-1">Turun (Decline)</div>
                  <div className="mt-1 lens-meta text-tv-red/80">Ketuk untuk daftar</div>
                </Button>
                <div className="bg-tv-bg border border-tv-border rounded-lg p-2 sm:p-4 text-center flex flex-col items-center justify-center">
                  <AnimatedNumber
                    value={data.breadth.advanceDeclineRatio}
                    format={(n) => n.toFixed(2)}
                    className={`block text-xl sm:text-3xl font-extrabold font-number ${
                      data.breadth.advanceDeclineRatio >= 1 ? 'text-tv-green' : 'text-tv-red'
                    }`}
                  />
                  <div className="text-[10px] sm:text-[10px] text-tv-muted uppercase font-semibold tracking-wide mt-1">AD Ratio</div>
                </div>
              </div>

              {(() => {
                const r = data.breadth.advanceDeclineRatio;
                // Label sendirian tidak memberi tahu apa pun: "BULLISH" bisa berarti
                // rasio 1.01 atau 1.49. Kalimat di bawahnya menyebut angkanya dan
                // batas kesimpulannya - breadth ini sampel, bukan seluruh bursa.
                const verdict =
                  r > 1.5 ? { label: 'SANGAT BULLISH', tone: 'bg-tv-green/20 text-tv-green border-tv-green/30', story: `Untuk tiap 1 saham turun, ada ${r.toFixed(1)} saham naik. Penguatan berbasis luas.` }
                  : r >= 1 ? { label: 'BULLISH', tone: 'bg-tv-blue/20 text-tv-blue border-tv-blue/30', story: `Saham naik sedikit lebih banyak dari yang turun (rasio ${r.toFixed(2)}). Keunggulannya tipis.` }
                  : r >= 0.7 ? { label: 'NETRAL', tone: 'bg-tv-warning/20 text-tv-warning border-tv-warning/30', story: `Yang turun lebih banyak dari yang naik (rasio ${r.toFixed(2)}), tapi belum cukup lebar untuk disebut tekanan jual.` }
                  : { label: 'BEARISH', tone: 'bg-tv-red/20 text-tv-red border-tv-red/30', story: r > 0 ? `Untuk tiap 1 saham naik, ada ${(1 / r).toFixed(1)} saham turun. Pelemahan meluas.` : 'Tidak ada saham naik pada snapshot universe terpantau; rasio A/D tidak dapat dibalik menjadi angka yang bermakna.' };
                return (
                  <div>
                    <div className={`flex items-center justify-center gap-2 rounded-lg border py-2 text-sm font-bold ${verdict.tone}`}>
                      {verdict.label}
                    </div>
                    <p className="mt-2 text-[11px] leading-relaxed text-tv-muted text-center">
                      {verdict.story} Dihitung dari {data.breadth.total} saham terpantau, bukan seluruh emiten IDX.
                    </p>
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="flex-1 space-y-4">
              <Skeleton className="h-5 w-full rounded-full" />
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
              </div>
              <LoadingFact />
            </div>
          )}
        </Card>
        </div>
      </PageContainer>
      <PaywallModal
        open={showPaywall}
        onClose={() => setShowPaywall(false)}
        title="Limit Gratis Habis"
        body={`Kamu sudah pakai ${FREE_LIMITS.analisaPerHari}/${FREE_LIMITS.analisaPerHari} analisa hari ini. Upgrade Pro ${formatRupiah(MONTHLY_PRICE)}/bulan untuk unlimited 10 filters + LensRadar scan berkala.`}
        benefits={[
          'Unlimited LensTechnical (10 filter)',
          'LensRadar scan berkala, LensConsensus & Compare Tool',
          'Watchlist & Alert unlimited',
        ]}
        secondaryLabel="Tunggu Besok"
      />
      <PaywallModal
        open={showLoginPrompt}
        onClose={() => setShowLoginPrompt(false)}
        title="LensMarket belum bisa dimuat"
        body="Menu ini tersedia untuk guest. Jika pesan ini muncul, server mengembalikan status login-required yang tidak sesuai rule public menu."
        ctaHref="/market-pulse"
        ctaLabel="Coba Lagi"
        secondaryLabel="Tutup"
      />
      {selectedSector && (
        <SectorDetailModal sector={selectedSector} onClose={() => setSelectedSector(null)} />
      )}
      {selectedBreadthDirection && (
        <BreadthDetailModal
          direction={selectedBreadthDirection}
          stocks={breadthGroups[selectedBreadthDirection]}
          onClose={() => setSelectedBreadthDirection(null)}
        />
      )}
    </div>
  );
}
