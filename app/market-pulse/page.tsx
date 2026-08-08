'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Activity, TrendingUp, TrendingDown, BarChart3,
  RefreshCw, ArrowUpRight, ArrowDownRight, Layers, Zap, X
} from 'lucide-react';
import { getUsedSymbolsToday, FREE_LIMITS } from '@/lib/limits';
import PaywallModal from '@/components/PaywallModal';
import { Badge, PageContainer, Skeleton, EmptyState, LoadingFact, TickerAvatar, AnimatedNumber } from '@/components/ui';

// Normalisasi simbol: pastikan hanya 1x .JK
const displayTicker = (s: string) => s.replace('.JK', '').replace('.JK', '');

// Mini Sparkline SVG
function Sparkline({ data, color, width = 120, height = 32 }: { data: number[]; color: string; width?: number; height?: number }) {
  if (!data || data.length < 2) return <div className="w-[120px] h-8 bg-tv-hover rounded animate-pulse" />;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((val - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');

  const fillPoints = `0,${height} ${points} ${width},${height}`;

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={fillPoints} fill={`url(#grad-${color.replace('#', '')})`} />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Sector Heatmap Tile
// BUG FIX (audit logika & algoritma 2026-08-05, temuan M-3): ukuran tile dulu dihitung
// dari `marketCap` yang SELALU 0 (field itu tidak ada di Yahoo chart API), jadi rumus
// akar kuadratnya tidak pernah berpengaruh apa pun - semua tile berukuran sama sambil
// tampak seolah diskalakan menurut kapitalisasi. Ukuran seragam sekarang, dan besaran
// pergerakan disampaikan lewat intensitas warna yang memang dihitung dari data nyata.
// BUG FIX (2026-08-05, permintaan user): tile bisa diklik buat buka modal detail - TAPI
// datanya (`stocks`) SAMA PERSIS dengan yang sudah kelihatan di tile (3-4 saham wakil
// hardcoded per sektor, lihat IDX_SECTORS di market-pulse.service.ts). Diverifikasi:
// /api/screener publik cuma balikin top-10 hasil ranking (bukan universe penuh), dan
// /api/emiten (700+ saham) tidak punya field sektor sama sekali - TIDAK ADA sumber data
// "semua emiten per sektor" di aplikasi ini sekarang. Modal ini jujur menyatakan cuma
// nampilin saham wakil yang sudah dihitung, bukan daftar lengkap - bukan fitur baru yang
// mengklaim cakupan yang tidak ada datanya.
function HeatmapTile({ sector, changePct, stocks, sampleSize, onSelect }: any) {
  const isUp = (changePct ?? 0) >= 0;
  const intensity = Math.min(Math.abs(changePct ?? 0) * 40, 100);

  // rgb disesuaikan ke palet "Lens" (green #22C55E, red #EF4444) - sebelumnya
  // hijaunya masih #10B981 dari palet lama, jadi tile ini satu-satunya hijau yang
  // berbeda hue dari seluruh sisa aplikasi.
  const bg = isUp
    ? `rgba(34, 197, 94, ${0.1 + intensity / 200})`
    : `rgba(239, 68, 68, ${0.1 + intensity / 200})`;
  const border = isUp
    ? `rgba(34, 197, 94, ${0.2 + intensity / 250})`
    : `rgba(239, 68, 68, ${0.2 + intensity / 250})`;

  return (
    <motion.button
      type="button"
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.985 }}
      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
      onClick={() => onSelect({ sector, changePct, stocks, sampleSize })}
      title={`${sector}: ${changePct == null ? 'data tidak tersedia' : `${isUp ? '+' : ''}${changePct.toFixed(2)}%`} - klik untuk rincian`}
      className="text-left rounded-lg p-3 flex flex-col justify-between cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-tv-blue/60"
      style={{
        backgroundColor: bg,
        borderWidth: 1,
        borderColor: border,
        minHeight: '90px'
      }}
    >
      <div>
        <div className="text-xs font-bold text-white truncate">{sector}</div>
        {/* Dinyatakan apa adanya: ini rata-rata beberapa saham wakil, bukan indeks sektor
            resmi IDX (temuan M-3). */}
        {sampleSize ? <div className="text-[9px] text-white/60">rata-rata {sampleSize} saham wakil</div> : null}
        {/* Angka % dulu pakai text-tv-green/text-tv-red di atas background yang juga
            hijau/merah (hue sama) - kontras rendah, apalagi saat perubahan besar bikin
            background makin pekat. Ganti jadi putih (kontras tinggi di kedua background)
            + ikon arah kecil yang tetap pakai warna hijau/merah untuk isyarat visual. */}
        <div className="text-lg font-extrabold font-number text-white flex items-center gap-1">
          {isUp ? (
            <TrendingUp className="w-3.5 h-3.5 text-tv-green shrink-0" />
          ) : (
            <TrendingDown className="w-3.5 h-3.5 text-tv-red shrink-0" />
          )}
          {changePct == null ? 'N/A' : `${isUp ? '+' : ''}${changePct.toFixed(2)}%`}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1 mt-1 opacity-70 group-hover:opacity-100 transition-opacity">
        {stocks?.slice(0, 4).map((s: any) => (
          <span
            key={s.symbol}
            className={`text-[9px] font-number font-semibold px-1 py-0.5 rounded text-white ${
              s.changePct >= 0 ? 'bg-tv-green/60' : 'bg-tv-red/60'
            }`}
          >
            {s.symbol} {s.changePct >= 0 ? '+' : ''}{s.changePct.toFixed(1)}%
          </span>
        ))}
        {stocks?.length > 4 && (
          <span className="text-[9px] text-white/60 font-medium">+{stocks.length - 4} lainnya</span>
        )}
      </div>
    </motion.button>
  );
}

// Modal detail sektor - klik tile Heatmap. Isi SAMA PERSIS dengan data yang sudah
// dihitung server-side (tidak ada fetch tambahan) - cuma tampilan lebih penuh + link ke
// halaman teknikal tiap saham. Disclaimer eksplisit: representatif, bukan daftar lengkap
// (lihat komentar HeatmapTile soal keterbatasan data sektor di aplikasi ini).
function SectorDetailModal({ sector, onClose }: { sector: any; onClose: () => void }) {
  const isUp = (sector.changePct ?? 0) >= 0;
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl bg-tv-card border border-tv-border shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-tv-border">
          <div>
            <h4 className="font-heading text-sm font-bold text-tv-text">{sector.sector}</h4>
            <span className={`text-xs font-number font-semibold ${isUp ? 'text-tv-green' : 'text-tv-red'}`}>
              rata-rata {isUp ? '+' : ''}{sector.changePct?.toFixed(2) ?? 'N/A'}%
            </span>
          </div>
          <button onClick={onClose} className="text-tv-muted hover:text-tv-text transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="px-4 pt-3 text-[10px] text-tv-muted leading-relaxed">
          {sector.sampleSize} saham wakil (kurasi manual, bukan seluruh emiten sektor ini - lihat catatan "bukan indeks sektor resmi IDX" di atas Heatmap).
        </p>
        <div className="p-4 pt-2 space-y-1.5 max-h-[50vh] overflow-y-auto">
          {sector.stocks.map((s: any) => (
            <motion.div key={s.symbol} whileHover={{ scale: 1.015 }} whileTap={{ scale: 0.99 }} transition={{ type: 'spring', stiffness: 400, damping: 30 }}>
              <Link
                href={`/technical/${s.symbol}.JK`}
                onClick={onClose}
                className="flex items-center gap-3 rounded-lg bg-tv-hover hover:bg-tv-border px-3 py-2 transition-colors"
              >
                <TickerAvatar symbol={s.symbol} size="sm" />
                <span className="text-sm font-bold text-tv-text flex-1">{s.symbol}</span>
                <span className={`text-xs font-number font-semibold ${s.changePct >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
                  {s.changePct >= 0 ? '+' : ''}{s.changePct.toFixed(2)}%
                </span>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Menerjemahkan 11 angka sektor jadi satu kalimat kondisi. Yang penting bagi user
 * bukan angka per sektor (itu sudah ada di tile), tapi apakah pasar bergerak
 * serempak atau sedang terjadi rotasi antar sektor.
 */
function SectorNarrative({ sectors }: { sectors: { sector: string; changePct: number | null }[] }) {
  const valid = sectors.filter((s) => typeof s.changePct === 'number') as { sector: string; changePct: number }[];
  if (valid.length < 2) return null;

  const sorted = [...valid].sort((a, b) => b.changePct - a.changePct);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const up = valid.filter((s) => s.changePct > 0).length;
  const spread = best.changePct - worst.changePct;

  // Ambang 3 poin persen memisahkan "pasar bergerak serempak" dari "rotasi": di
  // bawah itu, selisih antar sektor masih dalam rentang derau harian biasa.
  const ROTATION_SPREAD_PCT = 3;
  const mood =
    spread >= ROTATION_SPREAD_PCT
      ? `Rotasi sektor sedang terjadi - selisih ${spread.toFixed(1)} poin persen antara ${best.sector} dan ${worst.sector}. Uang berpindah antar sektor, bukan keluar dari pasar.`
      : up >= valid.length - 1
        ? 'Hampir semua sektor menguat serempak - kenaikan hari ini berbasis luas, bukan cerita satu sektor.'
        : up <= 1
          ? 'Hampir semua sektor melemah serempak - tekanan hari ini menyeluruh, bukan masalah satu sektor.'
          : `Gerak antar sektor relatif rapat (selisih ${spread.toFixed(1)} poin persen). Belum ada rotasi yang jelas.`;

  return (
    <div className="mt-3 pt-3 border-t border-tv-border">
      <p className="text-[11px] leading-relaxed text-tv-muted">
        <span className="font-number font-semibold text-tv-green">{up}</span> dari{' '}
        <span className="font-number font-semibold text-tv-text">{valid.length}</span> sektor menguat. {mood}
      </p>
    </div>
  );
}

// Breadth Bar
function BreadthBar({ advancing, declining, unchanged, total }: any) {
  // Pembagi dijaga: total 0 (respons kosong / sesi belum jalan) sebelumnya
  // menghasilkan NaN yang masuk ke `width: NaN%` - segmen batangnya hilang tanpa
  // pesan apa pun, terbaca sebagai batang kosong yang tampak sah.
  const denom = total > 0 ? total : 1;
  const advPct = (advancing / denom) * 100;
  const decPct = (declining / denom) * 100;
  const uncPct = (unchanged / denom) * 100;

  return (
    <div className="space-y-2">
      <div
        className="flex h-5 rounded-full overflow-hidden bg-tv-hover"
        role="img"
        aria-label={`${advancing} saham naik, ${unchanged} stagnan, ${declining} turun, dari ${total} saham terpantau`}
      >
        <div className="bg-tv-green transition-[width] duration-700 ease-settle flex items-center justify-center" style={{ width: `${advPct}%` }}>
          {advPct > 10 && <span className="text-[9px] font-number font-bold text-white">{advancing}</span>}
        </div>
        <div className="bg-tv-muted transition-[width] duration-700 ease-settle flex items-center justify-center" style={{ width: `${uncPct}%` }}>
          {uncPct > 10 && <span className="text-[9px] font-number font-bold text-white">{unchanged}</span>}
        </div>
        <div className="bg-tv-red transition-[width] duration-700 ease-settle flex items-center justify-center" style={{ width: `${decPct}%` }}>
          {decPct > 10 && <span className="text-[9px] font-number font-bold text-white">{declining}</span>}
        </div>
      </div>
      <div className="flex justify-between text-[10px] font-number">
        <span className="text-tv-green">▲ Naik: {advancing} ({advPct.toFixed(0)}%)</span>
        <span className="text-tv-muted">— Stagnan: {unchanged}</span>
        <span className="text-tv-red">▼ Turun: {declining} ({decPct.toFixed(0)}%)</span>
      </div>
    </div>
  );
}

export default function MarketPulse() {
  const [data, setData] = useState<any>(null);
  const [breakoutData, setBreakoutData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [usedSymbolsToday, setUsedSymbolsToday] = useState<string[]>([]);
  const [selectedSector, setSelectedSector] = useState<any>(null);
  // BUG FIX (2026-08-06): sebelumnya kegagalan fetch dan penolakan akses tidak
  // pernah tercatat di state - `data` tetap null sementara `loading` sudah false,
  // sehingga KETIGA section (index cards, heatmap, breadth) menampilkan skeleton
  // atau spinner "Memuat data breadth..." selamanya, tanpa jalan keluar dan tanpa
  // memberi tahu user bahwa permintaannya gagal. Modal paywall menutupi gejalanya
  // hanya sampai user menutup modal itu.
  const [loadError, setLoadError] = useState(false);
  const [gated, setGated] = useState<null | 'login' | 'pro'>(null);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await fetch('/api/market-pulse', { cache: 'no-store' });
      if (res.status === 401) {
        setGated('login');
        setShowLoginPrompt(true);
        return;
      }
      const json = await res.json();

      if (res.status === 402 || json.code === 'SUBSCRIPTION_REQUIRED') {
        setGated('pro');
        setUsedSymbolsToday(getUsedSymbolsToday());
        setShowPaywall(true);
        return;
      }

      if (!res.ok || !json) {
        setLoadError(true);
        return;
      }

      const res2 = await fetch('/api/breakout-radar');
      if (res2.ok) {
        const json2 = await res2.json();
        setBreakoutData(json2.data || []);
      }

      setGated(null);
      setData(json);
      setLastUpdate(new Date());
    } catch (e) {
      console.error(e);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 120000); // 2 min refresh
    return () => clearInterval(interval);
  }, [fetchData]);

  // Satu tempat memutuskan apa yang dirender tiap section, supaya urutan cek
  // (gerbang akses sebelum error, error sebelum loading) tidak ditulis ulang -
  // dan berbeda-beda - di tiga tempat.
  const blocker: null | 'login' | 'pro' | 'error' | 'loading' =
    gated ?? (loadError ? 'error' : !data ? 'loading' : null);

  const renderBlocker = (what: string) => {
    if (blocker === 'login') {
      return <EmptyState illustration="locked" title={`Login untuk melihat ${what}`} description="LensMarket butuh akun gratis - trial 7 hari akses penuh." action={{ label: 'Daftar Gratis', onClick: () => { window.location.href = '/signup'; } }} />;
    }
    if (blocker === 'pro') {
      return <EmptyState illustration="locked" title="Fitur Pro" description={`${what} tersedia di paket Pro.`} action={{ label: 'Lihat Paket', onClick: () => setShowPaywall(true) }} />;
    }
    if (blocker === 'error') {
      return <EmptyState illustration="empty" title={`${what} gagal dimuat`} description="Sambungan ke sumber data terputus. Data akan dicoba lagi otomatis tiap 2 menit." action={{ label: 'Coba lagi sekarang', onClick: fetchData }} />;
    }
    return null;
  };

  const formatTime = (date: Date) => date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';

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
              <h2 className="font-heading font-bold text-lg text-tv-text tracking-tight truncate">LensMarket</h2>
              <p className="text-xs text-tv-muted truncate">IDX Algorithmic Suite — diperbarui tiap 5 menit</p>
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
              Update: {isClient && lastUpdate ? formatTime(lastUpdate) : 'Loading...'}
            </div>
            <button
              onClick={fetchData}
              disabled={loading}
              className="bg-tv-hover border border-tv-border hover:bg-tv-borderLight px-3 py-1.5 rounded-full text-tv-text flex items-center gap-2 transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </header>

      <PageContainer className="p-4 md:p-6 lg:p-7 space-y-6">
        {/* === SECTION 1: INDEX CARDS === */}
        {blocker && blocker !== 'loading' ? (
          <div className="bg-tv-card border border-tv-border rounded-lg shadow-1">
            {renderBlocker('Indeks pasar')}
          </div>
        ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
                className={`bg-tv-card border rounded-lg p-4 shadow-1 transition-colors hover:shadow-2 ${
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
              </motion.div>
            );
          }) : (
            [1, 2, 3, 4].map(i => (
              <div key={i} className="bg-tv-card border border-tv-border rounded-lg p-4 shadow-1 space-y-2">
                <Skeleton variant="text" className="w-20" />
                <Skeleton variant="text" className="w-16 h-5" />
                <Skeleton className="h-8 w-full" />
              </div>
            ))
          )}
        </div>
        )}

        {/* === SECTION 1.5: BREAKOUT WIDGET === */}
        <div className="bg-tv-card border border-tv-blue/30 rounded-lg p-5 shadow-1 relative overflow-hidden">
          <div className="flex items-center justify-between border-b border-tv-border pb-3 mb-4">
            <div>
              <h3 className="font-heading text-base font-bold text-tv-text flex items-center gap-2">
                <Zap className="w-5 h-5 text-tv-blue" />
                Top 3 Breakout Hari Ini
                <Badge variant="danger" dot>Live</Badge>
              </h3>
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
                      <span className="truncate">{item.symbol}</span>
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
                    <span className="text-[9px] text-tv-muted bg-tv-hover px-2 rounded font-number shrink-0">RR {item.rr}</span>
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
        </div>

        {/* Heatmap & Breadth bersebelahan di layar lebar (2026-08-03) - sebelumnya
            bertumpuk atas-bawah sehingga halaman jadi panjang padahal keduanya cuma
            butuh setengah lebar. Tetap bertumpuk di bawah lg supaya terbaca di HP
            (aplikasi dibuka lewat WebView). items-stretch bawaan grid membuat kedua
            kartu setinggi yang tertinggi, jadi tidak ada ruang kosong menganggur. */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* === SECTION 2: SECTOR HEATMAP === */}
        <div className="bg-tv-card border border-tv-border rounded-lg p-5 shadow-1 flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-tv-border pb-3 mb-4">
            <h3 className="font-heading text-base font-bold text-tv-text flex items-center gap-2">
              <Layers className="w-5 h-5 text-tv-green" />
              Sector Heatmap IDX
            </h3>
            <span className="text-[10px] text-tv-muted">
              11 Sektor • Warna ~ % Perubahan • Rata-rata beberapa saham wakil per sektor (bukan indeks sektor resmi IDX)
            </span>
          </div>

          {blocker && blocker !== 'loading' ? (
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
        </div>

        {/* === SECTION 3: MARKET BREADTH === */}
        {/* Top Volume/Value dan Top Movers dihapus dari sini - sudah ada versi yang
            sama di halaman utama (components/Dashboard.tsx), duplikat murni. Market
            Breadth (naik/turun/stagnan) tidak ada di halaman lain, jadi tetap di sini. */}
        <div className="bg-tv-card border border-tv-border rounded-lg p-5 shadow-1 flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-tv-border pb-3 mb-4">
            <h3 className="font-heading text-base font-bold text-tv-text flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-tv-green" />
              Market Breadth (sampel)
            </h3>
            <span className="text-[10px] text-tv-muted">
              {data?.breadth?.total || 0} Saham Terpantau
            </span>
          </div>

          {blocker && blocker !== 'loading' ? (
            renderBlocker('Market Breadth')
          ) : data?.breadth ? (
            <div className="space-y-5 flex-1 flex flex-col">
              <BreadthBar {...data.breadth} />

              {/* 2 kolom saja - kartu ini sekarang setengah lebar layar, 4 kolom membuat
                  angkanya terlalu sempit dan terpotong di layar sedang. */}
              <div className="grid grid-cols-2 gap-2 sm:gap-3 flex-1 content-start">
                <div className="bg-tv-bg border border-tv-green/20 rounded-lg p-2 sm:p-4 text-center">
                  <AnimatedNumber value={data.breadth.advancing} className="block text-xl sm:text-3xl font-extrabold text-tv-green font-number" />
                  <div className="text-[9px] sm:text-[10px] text-tv-muted uppercase font-semibold tracking-wide mt-1">Naik (Advance)</div>
                </div>
                <div className="bg-tv-bg border border-tv-border rounded-lg p-2 sm:p-4 text-center">
                  <AnimatedNumber value={data.breadth.unchanged} className="block text-xl sm:text-3xl font-extrabold text-tv-muted font-number" />
                  <div className="text-[9px] sm:text-[10px] text-tv-muted uppercase font-semibold tracking-wide mt-1">Stagnan</div>
                </div>
                <div className="bg-tv-bg border border-tv-red/20 rounded-lg p-2 sm:p-4 text-center">
                  <AnimatedNumber value={data.breadth.declining} className="block text-xl sm:text-3xl font-extrabold text-tv-red font-number" />
                  <div className="text-[9px] sm:text-[10px] text-tv-muted uppercase font-semibold tracking-wide mt-1">Turun (Decline)</div>
                </div>
                <div className="bg-tv-bg border border-tv-border rounded-lg p-2 sm:p-4 text-center flex flex-col items-center justify-center">
                  <AnimatedNumber
                    value={data.breadth.advanceDeclineRatio}
                    format={(n) => n.toFixed(2)}
                    className={`block text-xl sm:text-3xl font-extrabold font-number ${
                      data.breadth.advanceDeclineRatio >= 1 ? 'text-tv-green' : 'text-tv-red'
                    }`}
                  />
                  <div className="text-[9px] sm:text-[10px] text-tv-muted uppercase font-semibold tracking-wide mt-1">AD Ratio</div>
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
                  : { label: 'BEARISH', tone: 'bg-tv-red/20 text-tv-red border-tv-red/30', story: `Untuk tiap 1 saham naik, ada ${(1 / (r || 0.01)).toFixed(1)} saham turun. Pelemahan merata.` };
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
        title="Daftar Dulu untuk Lihat LensMarket"
        body="LensMarket butuh akun (gratis) - daftar sekarang, dapat trial 7 hari akses penuh sebelum diminta upgrade."
        ctaHref="/signup"
        ctaLabel="Daftar Gratis"
        secondaryLabel="Nanti"
      />
      {selectedSector && (
        <SectorDetailModal sector={selectedSector} onClose={() => setSelectedSector(null)} />
      )}
    </div>
  );
}
