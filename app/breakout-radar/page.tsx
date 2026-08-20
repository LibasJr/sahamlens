'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Target, Clock, TrendingUp, ChevronDown, ChevronUp, ArrowUpDown } from 'lucide-react';

import PaywallModal from '@/components/PaywallModal';
import { BucketBacktestCard, BucketBacktestPending } from '@/components/radar/BucketBacktestPanel';
import { shouldShowLoginPromptFor401 } from '@/lib/auth-gate';
import { trackJourneyEvent } from '@/shared/analytics/product-journey';
import { Badge, Button, Card, PageContainer, Skeleton, LoadingFact, TickerAvatar, AnimatedNumber, EmptyState } from '@/components/ui';
import { useAuthUser } from '@/lib/hooks/useAuthUser';
import {
  RADAR_SORTABLE_COLUMNS,
  compareRadarValues,
  displayTicker,
  scoreBarWidth,
  type AiPickItem,
  type BucketBacktest,
  type RadarColumnKey,
} from './radar-model';
import { apiRequest, isApiClientError } from '@/shared/http/api-client';

// Halaman ini dulu punya 8 tab (Breakout, Rekomendasi, Menarik, Undervalue, Berisiko,
// Golden Cross, Dead Cross, Akumulasi Asing). Audit 2026-08-03 menemukan tab-tab itu
// memindai universe berbeda (15 vs 250 vs 220) sehingga angkanya tidak sebanding, isinya
// tumpang tindih (80 baris hanya berisi 69 saham unik), dan tab Rekomendasi memindai 220
// saham lewat ~22 request setiap dibuka. Semuanya dilebur jadi satu daftar berperingkat.
export default function AiPickPage() {
  const [items, setItems] = useState<AiPickItem[]>([]);
  const [ready, setReady] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const [computedAt, setComputedAt] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [bucketBacktest, setBucketBacktest] = useState<BucketBacktest | null>(null);
  // Validasi bucket LensScore adalah alat kalibrasi internal - isinya statistik
  // backtest per rentang skor, bukan informasi yang berguna buat user biasa dan
  // gampang salah dibaca sebagai janji hasil. Ditampilkan khusus admin.
  //
  // Dua sumber status admin digabung persis seperti di components/Sidebar.tsx:
  // cookie admin HttpOnly (dibaca lewat /api/admin-status karena client tidak bisa
  // membacanya sendiri) ATAU role pada sesi login.
  const { effectiveRole, resolved: authResolved } = useAuthUser();
  const [hasAdminCookie, setHasAdminCookie] = useState(false);
  const canSeeBucketBacktest = hasAdminCookie || (authResolved && effectiveRole === 'admin');

  useEffect(() => {
    apiRequest<any>('/api/admin-status')
      .then((d) => setHasAdminCookie(Boolean(d.isAdmin)))
      .catch(() => setHasAdminCookie(false));
  }, []);
  const [loading, setLoading] = useState(true);
  const [showPaywall, setShowPaywall] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  // Audit BUILD 003 (Explainable AI) - baris diklik untuk buka rincian
  // Technical/Fundamental/Arus Dana + 3 alasan teratas, bukan halaman/modal terpisah
  // (perubahan UI minimal, bukan redesign).
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);
  const [radarSortKey, setRadarSortKey] = useState<RadarColumnKey | null>(null);
  const [radarSortDir, setRadarSortDir] = useState<'asc' | 'desc'>('asc');
  // BUG FIX (2026-08-06): kegagalan fetch sebelumnya cuma masuk console.error.
  // `items` tetap [] dan `ready` tetap true, sehingga halaman menampilkan
  // "Tidak ada saham yang lolos ambang kualitas + kelengkapan data hari ini" -
  // sebuah klaim bahwa pemindaian sudah berjalan dan hasilnya memang nihil.
  // Padahal pemindaiannya tidak pernah sampai. Dua keadaan itu wajib dibedakan.
  const [loadError, setLoadError] = useState(false);
  const [gated, setGated] = useState<null | 'login' | 'pro'>(null);

  const handleRadarSort = (key: RadarColumnKey) => {
    if (radarSortKey === key) {
      setRadarSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setRadarSortKey(key);
      // Kolom angka (harga, perubahan, skor) dibuka menurun: klik pertama pada
      // "Skor" yang menampilkan skor TERENDAH di atas bukan yang dicari siapa pun.
      setRadarSortDir(key === 'symbol' ? 'asc' : 'desc');
    }
  };

  const sortedItems = useMemo(() => {
    if (!radarSortKey) return items;
    const col = RADAR_SORTABLE_COLUMNS.find((c) => c.key === radarSortKey)!;
    return [...items].sort((a, b) => compareRadarValues(col.getValue(a), col.getValue(b), radarSortDir));
  }, [items, radarSortKey, radarSortDir]);

  const fetchPicks = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    apiRequest<any>('/api/ai-pick')
      .then((data) => {
        setGated(null);
        setItems(data?.items || []);
        setReady(data?.ready !== false);
        setNote(data?.note || null);
        setComputedAt(data?.computedAt || null);
        setStale(data?.stale === true);
      })
      .catch(async (error) => {
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
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchPicks();
  }, [fetchPicks]);

  useEffect(() => {
    // Non-admin tidak perlu request ini sama sekali - menyembunyikan di render saja
    // menyisakan payload backtest di tab network setiap kali halaman dibuka.
    if (!canSeeBucketBacktest) {
      setBucketBacktest(null);
      return;
    }
    apiRequest<any>('/api/lens-score-bucket-backtest')
      .then((d) => {
        if (d && !d.error) setBucketBacktest(d);
      })
      .catch(console.error);
  }, [canSeeBucketBacktest]);

  // Jam diambil dari computedAt milik cache, BUKAN jam client saat halaman dibuka -
  // label lama memakai new Date() sehingga selalu menampilkan waktu klik seolah-olah
  // itu waktu data dihitung.
  const updateLabel = computedAt
    ? new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(computedAt)) + ' WIB'
    : null;

  return (
    // Sebelumnya: `flex h-screen` + anak `overflow-y-auto custom-scrollbar`. AppShell
    // sudah menyediakan satu-satunya kontainer gulir (<main className="overflow-y-auto">),
    // jadi ini membuat gulir bersarang - dua scrollbar, dan header sticky di dalamnya
    // menempel pada kontainer dalam alih-alih viewport. h-screen (100vh) juga tidak
    // memperhitungkan bilah alamat browser mobile. Disamakan dengan halaman lain.
    <div className="flex-1 flex flex-col bg-tv-bg min-h-screen">
      <div className="flex-1 flex flex-col">
        <header className="sticky top-0 z-20 border-b border-white/[0.055] bg-tv-bg/80 px-4 py-4 backdrop-blur-xl md:px-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-tv-blue text-white">
              <Target className="w-6 h-6" />
            </div>
            <div>
              <h1 className="lens-page-title flex items-center gap-2">
                LensRadar Live
                {/* BUG FIX (audit integritas data 2026-08-03): badge "Live" dulu TETAP
                    tampil walau data sebenarnya dari sesi bursa sebelumnya (bisa 2+ hari
                    basi di akhir pekan, setelah TTL cache diperpanjang supaya tidak
                    kosong total di luar jam bursa - lihat shared/cache/ai-pick-cache.ts).
                    Sekarang badge jujur: "Live" cuma kalau data benar-benar segar. */}
                {stale ? <Badge variant="neutral" dot>Data Sesi Terakhir</Badge> : <Badge variant="danger" dot title="Data Yahoo Finance, delay ±15 menit dari kondisi pasar riil - bukan realtime">Live</Badge>}
              </h1>
              <p className="text-xs text-tv-muted mt-0.5">Breakout & Opportunity Scanner</p>
              <p className="text-xs text-tv-muted flex items-center gap-1 mt-1">
                <Clock className="w-3 h-3" /> {updateLabel ? `${stale ? 'Data sesi terakhir' : 'Data'} per ${updateLabel} • Yahoo Finance, delay ±15 menit` : 'Memuat...'}
              </p>
            </div>
          </div>
        </header>

        {/* max-w-[1600px] menyamakan lebar dengan Technical/Fundamental - sebelumnya
            1200px membuat sisi kiri-kanan penuh ruang kosong menganggur di layar lebar. */}
        <PageContainer className="p-4 md:p-6 lg:p-7">
          <Card padding="none" radius="lg" elevation="sm" highlight={false} className="border-tv-border">
            <div className="p-4 border-b border-tv-border bg-tv-bg/40">
              <h2 className="font-heading text-sm font-bold text-tv-text flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-tv-blue" />
                Pantauan Terkuat Hari Ini
              </h2>
              <p className="text-[11px] text-tv-muted mt-1">
                Diurutkan dari skor komposit tertinggi. Hanya saham berskor 60 ke atas yang tampil; ini scanner, bukan rekomendasi beli/jual.
              </p>
            </div>

            {loading && (
              <div className="p-4 space-y-2">
                {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
                <LoadingFact className="mt-3" />
              </div>
            )}

            {!loading && gated === 'login' && (
              <EmptyState
                illustration="locked"
                title="Login untuk melihat hasil LensRadar"
                description="Butuh akun gratis untuk memakai fitur selama masa pengujian."
                action={{ label: 'Daftar Gratis', onClick: () => { window.location.href = '/signup'; } }}
              />
            )}

            {!loading && gated === 'pro' && (
              <EmptyState
                illustration="locked"
                title="LensRadar Live butuh akun Pro"
                description="Silakan masuk kembali untuk melanjutkan penggunaan."
                action={{ label: 'Lihat Paket', onClick: () => setShowPaywall(true) }}
              />
            )}

            {/* Dibedakan tegas dari "tidak ada saham yang lolos": yang ini artinya
                pemindaian tidak pernah sampai, bukan pemindaian selesai tanpa hasil. */}
            {!loading && !gated && loadError && (
              <EmptyState
                illustration="empty"
                title="Hasil pemindaian gagal dimuat"
                description="Permintaan ke server tidak sampai, jadi belum diketahui ada berapa saham yang lolos hari ini. Ini bukan berarti hasilnya nihil."
                action={{ label: 'Coba lagi', onClick: fetchPicks }}
              />
            )}

            {!loading && !gated && !loadError && !ready && (
              <EmptyState
                illustration="collecting"
                title="Pemindaian hari ini sedang disiapkan"
                description="Scanner sedang menghitung ulang seluruh universe saham. Proses ini berjalan di latar belakang setiap sesi bursa."
                action={{ label: 'Muat ulang', onClick: fetchPicks }}
              />
            )}

            {!loading && !gated && !loadError && ready && canSeeBucketBacktest && bucketBacktest?.ready ? (
              <BucketBacktestCard data={bucketBacktest} />
            ) : !loading && !gated && !loadError && ready && canSeeBucketBacktest && bucketBacktest ? (
              /* Histori belum cukup panjang - dulu kondisi ini cuma menghasilkan satu
                 baris teks kuning, dan kalau `note` kebetulan null tidak menghasilkan
                 apa pun sama sekali. */
              <BucketBacktestPending data={bucketBacktest} />
            ) : !loading && !gated && !loadError && ready && note ? (
              <p className="px-4 pt-3 text-xs text-tv-yellow">{note}</p>
            ) : null}

            {/* Daftar kosong sekarang punya SEBAB yang jelas (Phase 0 / P0-1 + P0-3):
                saham berstatus 'DATA TIDAK CUKUP' dan saham yang tidak lolos gerbang
                kelayakan (tidak likuid / kemungkinan tidak diperdagangkan / data basi /
                histori kurang) DIKELUARKAN dari daftar, bukan diberi peringkat rendah.
                Karena itu daftar bisa mengecil sampai kosong pada hari tertentu - itu
                jawaban yang benar, dan pengguna berhak tahu alasannya alih-alih melihat
                halaman kosong tanpa penjelasan. */}
            {!loading && !gated && !loadError && ready && items.length === 0 && (
              <EmptyState
                illustration="search"
                title="Tidak ada saham yang lolos hari ini"
                description="Pemindaian berjalan normal dan hasilnya nihil. Saham dengan data tidak lengkap, likuiditas sangat rendah, atau yang kemungkinan tidak diperdagangkan sengaja dikeluarkan - bukan diberi peringkat rendah. Daftar kosong adalah jawaban yang benar untuk hari seperti ini."
              />
            )}

            {!loading && !gated && !loadError && ready && items.length > 0 && (
              <>
                {/* Tabel 7 kolom + baris yang bisa dibentangkan tidak terbaca di lebar
                    375px - `overflow-x-auto` sendirian cuma memindahkan masalahnya jadi
                    gulir horizontal pada tampilan data utama. Di bawah md dipakai daftar
                    kartu dengan data yang sama persis. */}
                <div className="lens-table-sticky-col lens-table-sticky-col-2 hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-tv-border text-xs text-tv-muted uppercase font-semibold tracking-wide">
                        <th className="w-12 py-3 px-4">#</th>
                        {RADAR_SORTABLE_COLUMNS.map((col) => (
                          <th key={col.key} className={`py-3 px-4 ${col.align === 'right' ? 'text-right' : ''}`}>
                            {/* Ikon dua-arah selalu tampil (redup) supaya terlihat kolom
                                mana yang bisa diurutkan - sebelumnya penanda hanya muncul
                                di kolom yang SEDANG aktif, jadi sebelum klik pertama tidak
                                ada isyarat sama sekali bahwa tabel ini sortable. */}
                            <Button variant="bare" size="none"
                              type="button"
                              onClick={() => handleRadarSort(col.key)}
                              title={`Urutkan menurut ${col.label}`}
                              className={`group inline-flex items-center gap-1 hover:text-tv-text transition-colors ${col.align === 'right' ? 'flex-row-reverse' : ''} ${radarSortKey === col.key ? 'text-tv-text' : ''}`}
                            >
                              {col.label}
                              {radarSortKey === col.key ? (
                                <span className="text-tv-blue">{radarSortDir === 'asc' ? '▲' : '▼'}</span>
                              ) : (
                                <ArrowUpDown className="w-3 h-3 opacity-30 group-hover:opacity-70 transition-opacity" />
                              )}
                            </Button>
                          </th>
                        ))}
                        <th className="py-3 px-4">Sinyal</th>
                        <th className="py-3 px-4 text-center">Kenapa</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-tv-border text-sm">
                      {sortedItems.map((it, idx) => {
                        const isExpanded = expandedSymbol === it.symbol;
                        return (
                        <React.Fragment key={it.symbol}>
                        <tr className={`hover:bg-tv-hover/30 border-l-4 ${it.flagged ? 'border-l-tv-warning' : 'border-l-tv-green'}`}>
                          <td className="w-12 py-3 px-4 text-tv-muted">{idx + 1}</td>
                          <td className="py-3 px-4 font-bold font-number whitespace-nowrap">
                            <div className="flex items-center gap-2.5">
                              <TickerAvatar symbol={it.symbol} size="sm" />
                              <div className="min-w-0">
                                <Link
                                  href={`/technical/${it.symbol}`}
                                  // Penyebut "LensRadar -> analisis emiten" (PRD, Beta
                                  // evaluation): yang dihitung adalah kandidat yang
                                  // benar-benar dibuka, bukan tabel yang dilihat.
                                  onClick={() => trackJourneyEvent('radar_candidate_open', 'breakout_radar')}
                                  className="text-tv-text hover:text-tv-blue transition-colors"
                                >
                                  {displayTicker(it.symbol)}
                                </Link>
                                {it.flagged && (
                                  <span className="ml-2 text-tv-red text-xs font-normal">! {it.flagReason}</span>
                                )}
                                {it.topReasons?.[0] && (
                                  <div className="text-[10px] font-normal text-tv-muted truncate max-w-[220px]">{it.topReasons[0]}</div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right font-number text-tv-muted">
                            {Math.round(it.price).toLocaleString('id-ID')}
                          </td>
                          <td className={`py-3 px-4 text-right font-number ${it.changePct >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
                            {it.changePct >= 0 ? '+' : ''}{it.changePct.toFixed(1)}%
                          </td>
                          {/* Skor + bar: peringkat relatif antar baris terbaca sekilas.
                              Membandingkan 74 dan 81 lewat angka saja menuntut pembacaan
                              baris per baris. */}
                          <td className="py-3 px-4 text-right font-bold font-number text-tv-text">
                            <div className="flex flex-col items-end gap-1">
                              <span>{it.finalScore}</span>
                              <span className="h-1 w-14 rounded-full bg-tv-hover overflow-hidden">
                                <span
                                  className={`block h-full rounded-full ${it.flagged ? 'bg-tv-warning' : 'bg-tv-green'}`}
                                  style={{ width: `${Math.min(100, Math.max(0, it.finalScore))}%` }}
                                />
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right font-number text-tv-text">
                            <div className="flex flex-col items-end gap-1">
                              <span>{it.breakdown?.technical ?? 'N/A'}<span className="text-[10px] text-tv-muted">/40</span></span>
                              <span className="h-1 w-12 rounded-full bg-tv-hover overflow-hidden">
                                <span className="block h-full rounded-full bg-tv-blue" style={{ width: scoreBarWidth(it.breakdown?.technical, 40) }} />
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right font-number text-tv-text">
                            <div className="flex flex-col items-end gap-1">
                              <span>{it.breakdown?.fundamental ?? 'N/A'}<span className="text-[10px] text-tv-muted">/30</span></span>
                              <span className="h-1 w-12 rounded-full bg-tv-hover overflow-hidden">
                                <span className="block h-full rounded-full bg-tv-purple" style={{ width: scoreBarWidth(it.breakdown?.fundamental, 30) }} />
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right font-number text-tv-text">
                            <div className="flex flex-col items-end gap-1">
                              <span>{it.breakdown?.flow ?? 'N/A'}<span className="text-[10px] text-tv-muted">/30</span></span>
                              <span className="h-1 w-12 rounded-full bg-tv-hover overflow-hidden">
                                <span className="block h-full rounded-full bg-tv-green" style={{ width: scoreBarWidth(it.breakdown?.flow, 30) }} />
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right font-number text-tv-text">
                            {typeof it.coverage === 'number' ? `${it.coverage}%` : <span className="text-tv-muted">N/A</span>}
                          </td>
                          {/* Kolom rincian: dulu "skor dasar + bonus". Bonus sudah dihapus
                              (audit skor 2026-08-05) - sekarang menyatakan kelengkapan data
                              di balik skor + sinyal hari ini sebagai label. */}
                          <td className="py-3 px-4 text-xs text-tv-muted font-number whitespace-nowrap">
                            {it.signals?.length ? it.signals.join(', ') : <span className="text-tv-muted">-</span>}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <Button variant="bare" size="none"
                              type="button"
                              onClick={() => setExpandedSymbol(isExpanded ? null : it.symbol)}
                              aria-label={isExpanded ? `Tutup rincian ${it.symbol}` : `Buka rincian ${it.symbol}`}
                              className="inline-flex items-center gap-1 text-[11px] text-tv-blue hover:text-tv-text transition-colors"
                            >
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </Button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-tv-bg/60">
                            <td colSpan={11} className="py-3 px-4">
                              <div className="flex flex-col md:flex-row gap-4 text-xs">
                                <div className="flex gap-4 shrink-0">
                                  <div>
                                    <div className="text-tv-muted uppercase text-[10px] tracking-wide">Technical</div>
                                    <div className="font-bold font-number text-tv-text">{it.breakdown?.technical ?? 'N/A'}/40</div>
                                  </div>
                                  <div>
                                    <div className="text-tv-muted uppercase text-[10px] tracking-wide">Fundamental</div>
                                    <div className="font-bold font-number text-tv-text">{it.breakdown?.fundamental ?? 'N/A'}/30</div>
                                  </div>
                                  <div>
                                    <div className="text-tv-muted uppercase text-[10px] tracking-wide">Arus Dana</div>
                                    <div className="font-bold font-number text-tv-text">{it.breakdown?.flow ?? 'N/A'}/30</div>
                                  </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-tv-muted uppercase text-[10px] tracking-wide mb-1">Alasan Utama</div>
                                  {it.topReasons && it.topReasons.length > 0 ? (
                                    <ul className="space-y-0.5">
                                      {it.topReasons.map((r, i) => (
                                        <li key={i} className="text-tv-text">✓ {r}</li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <span className="text-tv-muted">Rincian belum tersedia untuk saham ini.</span>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                        </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Versi mobile - urutan mengikuti sortedItems yang sama, jadi kontrol
                    urut di bawah tetap berlaku untuk kedua tampilan. */}
                <div className="md:hidden">
                  <div className="flex items-center gap-1.5 overflow-x-auto px-3 py-2.5 border-b border-tv-border">
                    <span className="text-[10px] uppercase tracking-wide text-tv-muted shrink-0 mr-1">Urutkan</span>
                    {RADAR_SORTABLE_COLUMNS.map((col) => (
                      <Button variant="bare" size="none"
                        key={col.key}
                        type="button"
                        onClick={() => handleRadarSort(col.key)}
                        className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                          radarSortKey === col.key
                            ? 'border-tv-blue/40 bg-tv-blue/10 text-tv-blue'
                            : 'border-tv-border text-tv-muted hover:text-tv-text'
                        }`}
                      >
                        {col.label}
                        {radarSortKey === col.key && <span className="ml-1">{radarSortDir === 'asc' ? '▲' : '▼'}</span>}
                      </Button>
                    ))}
                  </div>

                  <div className="divide-y divide-tv-border">
                    {sortedItems.map((it, idx) => {
                      const isExpanded = expandedSymbol === it.symbol;
                      return (
                        <div key={it.symbol} className={`border-l-4 ${it.flagged ? 'border-l-tv-warning' : 'border-l-tv-green'}`}>
                          <div className="flex items-center gap-3 px-3 py-3">
                            <span className="text-[11px] text-tv-muted font-number w-4 shrink-0">{idx + 1}</span>
                            <TickerAvatar symbol={it.symbol} size="md" />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <Link href={`/technical/${it.symbol}`} onClick={() => trackJourneyEvent('radar_candidate_open', 'breakout_radar')} className="font-number font-bold text-tv-text hover:text-tv-blue transition-colors">
                                  {displayTicker(it.symbol)}
                                </Link>
                                <span className={`text-xs font-number ${it.changePct >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
                                  {it.changePct >= 0 ? '+' : ''}{it.changePct.toFixed(1)}%
                                </span>
                              </div>
                              <div className="text-[11px] text-tv-muted font-number">
                                Rp {Math.round(it.price).toLocaleString('id-ID')}
                              </div>
                              <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] font-number text-tv-muted">
                                <span>T {it.finalScore}</span>
                                <span>Tek {it.breakdown?.technical ?? 'N/A'}/40</span>
                                <span>Fund {it.breakdown?.fundamental ?? 'N/A'}/30</span>
                                <span>Flow {it.breakdown?.flow ?? 'N/A'}/30</span>
                                <span>Cov {typeof it.coverage === 'number' ? `${it.coverage}%` : 'N/A'}</span>
                              </div>
                              {it.flagged && <div className="text-[10px] text-tv-red mt-0.5">! {it.flagReason}</div>}
                            </div>
                            <div className="text-right shrink-0">
                              <div className="font-number font-bold text-tv-text">{it.finalScore}</div>
                              <div className="mt-1 h-1 w-12 rounded-full bg-tv-hover overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${it.flagged ? 'bg-tv-warning' : 'bg-tv-green'}`}
                                  style={{ width: `${Math.min(100, Math.max(0, it.finalScore))}%` }}
                                />
                              </div>
                            </div>
                            <Button variant="bare" size="none"
                              type="button"
                              onClick={() => setExpandedSymbol(isExpanded ? null : it.symbol)}
                              aria-label={isExpanded ? 'Tutup rincian' : 'Buka rincian'}
                              className="shrink-0 p-1.5 text-tv-blue"
                            >
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </Button>
                          </div>

                          {isExpanded && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                              className="overflow-hidden bg-tv-bg/60 px-3 pb-3"
                            >
                              <div className="grid grid-cols-3 gap-2 pt-3">
                                {([
                                  ['Technical', it.breakdown?.technical, 40],
                                  ['Fundamental', it.breakdown?.fundamental, 30],
                                  ['Arus Dana', it.breakdown?.flow, 30],
                                ] as const).map(([label, value, max]) => (
                                  <div key={label}>
                                    <div className="text-tv-muted uppercase text-[10px] tracking-wide">{label}</div>
                                    <div className="font-bold font-number text-tv-text text-sm">
                                      {value ?? 'N/A'}<span className="text-tv-muted text-[10px] font-normal">/{max}</span>
                                    </div>
                                    <div className="mt-1 h-1 rounded-full bg-tv-hover overflow-hidden">
                                      <div className="h-full rounded-full bg-tv-blue" style={{ width: `${value == null ? 0 : (value / max) * 100}%` }} />
                                    </div>
                                  </div>
                                ))}
                              </div>
                              <div className="mt-3">
                                <div className="text-tv-muted uppercase text-[10px] tracking-wide mb-1">Alasan Utama</div>
                                {it.topReasons && it.topReasons.length > 0 ? (
                                  <ul className="space-y-0.5">
                                    {it.topReasons.map((r, i) => <li key={i} className="text-[11px] text-tv-text">✓ {r}</li>)}
                                  </ul>
                                ) : (
                                  <span className="text-[11px] text-tv-muted">Rincian belum tersedia untuk saham ini.</span>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </Card>

          <p className="text-[11px] text-tv-muted mt-4 leading-relaxed">
            Skor 0-100 = komposit teknikal (maks 40), fundamental (maks 30), dan arus dana (maks 30).
            Sinyal hari ini (breakout, golden cross, akumulasi) ditampilkan sebagai label dan dipakai
            mengurutkan saat skor seri - TIDAK menambah poin, karena bahan bakunya sudah dinilai di
            dalam skor komposit itu sendiri. &quot;data X%&quot; = porsi bobot yang benar-benar punya data;
            komponen yang tidak tersedia (mis. bank tidak melaporkan DER ke sumber data) dikeluarkan
            dari perhitungan, bukan dihitung nol. Akumulasi memakai estimasi Chaikin Money Flow dari
            posisi close di range High-Low, BUKAN data broker/asing resmi. Tanda merah menandai sinyal
            yang bertentangan - saham tetap ditampilkan supaya kontradiksinya terlihat, bukan
            disembunyikan.
          </p>
        </PageContainer>
      </div>

      {/* Blok <style> custom-scrollbar dihapus: aturannya menduplikasi scrollbar global
          di app/globals.css, dan warnanya masih hex palet lama (#0F141D/#2C3A5A/#3A4B75)
          sehingga scrollbar halaman ini satu-satunya yang tidak ikut palet baru. */}

      <PaywallModal
        open={showPaywall}
        onClose={() => setShowPaywall(false)}
        title="Akses Akun Belum Tersedia"
        body="Silakan masuk kembali untuk melanjutkan penggunaan LensRadar Live."
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
        title="Daftar Dulu untuk Lihat Hasil"
        body="LensRadar butuh akun gratis. Daftar untuk memakai fitur selama masa pengujian."
        ctaHref="/signup"
        ctaLabel="Daftar Gratis"
        secondaryLabel="Nanti"
      />
    </div>
  );
}
