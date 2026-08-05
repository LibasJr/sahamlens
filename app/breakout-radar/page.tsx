'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Target, Clock, Menu, TrendingUp, ChevronDown, ChevronUp, ArrowUpDown } from 'lucide-react';

import PaywallModal from '@/components/PaywallModal';
import { Badge, PageContainer, Skeleton, EmptyState, LoadingFact, TickerAvatar, AnimatedNumber } from '@/components/ui';

const displayTicker = (s: string) => s.replace('.JK', '');

type ScoreBreakdown = { technical: number; fundamental: number; flow: number };

type AiPickItem = {
  symbol: string;
  price: number;
  changePct: number;
  baseScore: number;
  /** Sinyal/event hari ini sebagai LABEL (breakout/golden cross/akumulasi) - sejak audit
   * skor 2026-08-05 TIDAK lagi menambah poin, menggantikan `bonuses` yang lama. */
  signals?: string[];
  finalScore: number;
  /** Kelengkapan data di balik skor (persen) - null/undefined untuk entri cache lama. */
  coverage?: number | null;
  flagged: boolean;
  flagReason: string | null;
  // Audit BUILD 003 (Explainable AI) - opsional (bukan required) supaya frontend
  // tidak error kalau response API sempat berasal dari cache lama sebelum field ini
  // ada (lihat guard `?? fallback` di ai-pick.service.ts rankAiPicks()).
  breakdown?: ScoreBreakdown;
  topReasons?: string[];
};

type HorizonKey = 't1' | 't5' | 't20';
type BucketBacktest = {
  ready: boolean;
  coverageDays: number;
  /** Ambang hari kalender sebelum tabel validasi ditampilkan (LENS_SCORE_MIN_HISTORY_DAYS). */
  minRequiredDays?: number;
  tradingDays: number;
  minDate: string | null;
  maxDate: string | null;
  roundTripCostPct: number;
  entryRule: string;
  buckets: {
    bucket: string;
    horizons: Record<HorizonKey, { avgReturnPct: number | null; winRatePct: number | null; samples: number }>;
  }[];
  tTests: Record<HorizonKey, {
    meanDiffPct: number | null;
    tStatistic: number | null;
    degreesOfFreedom: number | null;
    pValueApprox: number | null;
    significantAt5Pct: boolean;
    bucket80Better: boolean | null;
    samples80: number;
    samples60: number;
    note: string;
  }>;
  note: string | null;
};

type RadarColumnKey = 'symbol' | 'price' | 'changePct' | 'finalScore' | 'technicalScore' | 'fundamentalScore' | 'flowScore' | 'coverage';

interface RadarSortableColumn {
  key: RadarColumnKey;
  label: string;
  align?: 'right';
  getValue: (item: AiPickItem) => string | number | null | undefined;
}

const RADAR_SORTABLE_COLUMNS: RadarSortableColumn[] = [
  { key: 'symbol', label: 'Saham', getValue: (i) => i.symbol },
  { key: 'price', label: 'Harga', align: 'right', getValue: (i) => i.price },
  { key: 'changePct', label: 'Chg', align: 'right', getValue: (i) => i.changePct },
  // Audit skor 2026-08-05: label "Skor (0-140)" dulu jujur menggambarkan implementasi
  // (skor 0-100 + bonus 0-40), tapi skala 0-140 itu sendiri yang salah - lihat catatan
  // lengkap di ai-pick.service.ts. Bonus sudah dihapus; skor sekarang benar-benar 0-100.
  { key: 'finalScore', label: 'Total', align: 'right', getValue: (i) => i.finalScore },
  // Breakdown dari calculateScore(): Technical maks 40, Fundamental maks 30, Flow maks
  // 30. Ditampilkan sebagai kolom terpisah agar skor tinggi tidak disalahbaca sebagai
  // "semua aspek kuat"; bisa saja dominan teknikal sementara fundamental minim data.
  { key: 'technicalScore', label: 'Teknikal', align: 'right', getValue: (i) => i.breakdown?.technical },
  { key: 'fundamentalScore', label: 'Fundamental', align: 'right', getValue: (i) => i.breakdown?.fundamental },
  { key: 'flowScore', label: 'Flow', align: 'right', getValue: (i) => i.breakdown?.flow },
  { key: 'coverage', label: 'Coverage', align: 'right', getValue: (i) => i.coverage },
];

function compareRadarValues(a: string | number | null | undefined, b: string | number | null | undefined, dir: 'asc' | 'desc'): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  const result = typeof a === 'number' && typeof b === 'number'
    ? a - b
    : String(a).localeCompare(String(b), 'id');
  return dir === 'asc' ? result : -result;
}

function fmtBacktestPct(value: number | null): string {
  if (value == null) return 'N/A';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function scoreBarWidth(value: number | null | undefined, max: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || max <= 0) return '0%';
  return `${Math.min(100, Math.max(0, (value / max) * 100))}%`;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Kartu pengganti tabel validasi selama histori belum cukup panjang.
 *
 * Sebelumnya kondisi ini cuma menghasilkan satu baris teks kuning, atau - kalau
 * `note` kebetulan null - tidak menghasilkan apa pun sehingga bagian validasi
 * hilang tanpa jejak. Angka 0 sampel bukan kegagalan: backtest ini memang perlu
 * lebih dari 90 hari kalender arsip harian sebelum bisa menghitung apa pun.
 * Yang perlu diberi tahu ke user adalah sudah sampai mana dan kapan siapnya.
 */
function BucketBacktestPending({ data }: { data: BucketBacktest }) {
  const required = data.minRequiredDays ?? 90;
  const collected = Math.max(0, data.coverageDays);

  // Tanggal siap dihitung dari hari pertama arsip, bukan dari hari ini - kalau
  // dihitung dari hari ini, targetnya mundur terus tiap kali halaman dibuka.
  const readyDate = data.minDate
    ? new Date(new Date(data.minDate).getTime() + (required + 1) * MS_PER_DAY)
    : null;

  return (
    <div className="border-t border-tv-border bg-tv-bg/30 px-4 py-2">
      <EmptyState
        illustration="collecting"
        title="Validasi bucket belum bisa dihitung"
        description={`Tabel ini membandingkan hasil nyata tiap rentang LensScore. Perbandingannya baru bermakna setelah arsip harian melewati ${required} hari kalender - menampilkannya lebih awal berarti menyajikan kesimpulan dari sampel yang terlalu kecil.`}
        progress={{ current: collected, total: required, unit: 'hari', label: 'Pengumpulan data' }}
        countdown={readyDate ? { targetDate: readyDate, label: 'Perkiraan tabel muncul' } : undefined}
      />
      {data.minDate && (
        <p className="pb-3 text-center text-[10px] text-tv-muted">
          Arsip dimulai {new Date(data.minDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
          {data.tradingDays > 0 && ` · ${data.tradingDays} hari bursa terekam`}
        </p>
      )}
    </div>
  );
}

function BucketBacktestCard({ data }: { data: BucketBacktest }) {
  const horizons: { key: HorizonKey; label: string }[] = [
    { key: 't1', label: 'T+1' },
    { key: 't5', label: 'T+5' },
    { key: 't20', label: 'T+20' },
  ];
  const primaryTest = data.tTests.t20;

  return (
    <div className="border-t border-tv-border bg-tv-bg/30 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="font-heading text-sm font-bold text-tv-text">Validasi Bucket LensScore</h3>
          <p className="text-[11px] text-tv-muted mt-1">
            Histori {data.coverageDays} hari kalender ({data.tradingDays} hari bursa), {data.minDate} sampai {data.maxDate}.
            Return sudah dikurangi fee+slippage {data.roundTripCostPct.toFixed(1)}% round-trip.
          </p>
          <p className="text-[10px] text-tv-muted mt-1">{data.entryRule}</p>
        </div>
        <div className={`rounded-md border px-3 py-2 text-[11px] ${
          primaryTest.bucket80Better && primaryTest.significantAt5Pct
            ? 'border-tv-green/30 bg-tv-green/10 text-tv-green'
            : 'border-tv-yellow/30 bg-tv-yellow/10 text-tv-yellow'
        }`}>
          80-100 vs 60-69 T+20:{' '}
          {primaryTest.tStatistic == null
            ? 'sampel belum cukup'
            : `${primaryTest.bucket80Better ? 'lebih baik' : 'belum lebih baik'}; t=${primaryTest.tStatistic}, p≈${primaryTest.pValueApprox ?? 'N/A'}`}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-tv-border text-tv-muted uppercase font-semibold tracking-wide">
              <th className="py-2 pr-3">Bucket</th>
              {horizons.map((h) => (
                <th key={h.key} className="py-2 px-3 text-right">{h.label} Avg</th>
              ))}
              {horizons.map((h) => (
                <th key={`${h.key}-win`} className="py-2 px-3 text-right">{h.label} Win</th>
              ))}
              {horizons.map((h) => (
                <th key={`${h.key}-n`} className="py-2 pl-3 text-right">{h.label} N</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-tv-border/70">
            {data.buckets.map((bucket) => (
              <tr key={bucket.bucket}>
                <td className="py-2 pr-3 font-bold text-tv-text">{bucket.bucket}</td>
                {horizons.map((h) => (
                  <td key={h.key} className="py-2 px-3 text-right font-number text-tv-text">
                    {fmtBacktestPct(bucket.horizons[h.key]?.avgReturnPct ?? null)}
                  </td>
                ))}
                {horizons.map((h) => {
                  const winRate = bucket.horizons[h.key]?.winRatePct ?? null;
                  // Heatmap win rate: titik netralnya 50%, bukan 0 - win rate 45% itu
                  // buruk, dan skala yang berpangkal di 0 akan mewarnainya sebagai
                  // "cukup baik". Intensitas dipotong di 20 poin dari netral.
                  const deviation = winRate == null ? 0 : (winRate - 50) / 20;
                  const magnitude = Math.min(Math.abs(deviation), 1);
                  const rgb = deviation >= 0 ? '34,197,94' : '239,68,68';
                  return (
                    <td
                      key={`${h.key}-win`}
                      className="py-2 px-3 text-right font-number text-tv-text"
                      style={winRate == null ? undefined : { backgroundColor: `rgba(${rgb},${0.06 + magnitude * 0.28})` }}
                    >
                      {winRate == null ? <span className="text-tv-muted">N/A</span> : `${winRate.toFixed(0)}%`}
                    </td>
                  );
                })}
                {horizons.map((h) => {
                  const samples = bucket.horizons[h.key]?.samples ?? 0;
                  // Sampel di bawah 30 ditandai: rata-rata dari sampel sekecil itu
                  // masih didominasi kebetulan, dan angkanya di kolom kiri terbaca
                  // sama meyakinkannya dengan yang bersampel besar.
                  const thin = samples > 0 && samples < 30;
                  return (
                    <td
                      key={`${h.key}-n`}
                      className={`py-2 pl-3 text-right font-number ${thin ? 'text-tv-warning' : 'text-tv-muted'}`}
                      title={thin ? `${samples} sampel - terlalu sedikit untuk disimpulkan` : undefined}
                    >
                      {samples}{thin ? '*' : ''}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Storytelling: tabel di atas menyimpan temuan utamanya di dalam angka yang
          harus dibandingkan sendiri oleh pembaca. Kalimat ini menyebutkannya. */}
      {(() => {
        const high = data.buckets.find((b) => b.bucket.startsWith('80'));
        const low = data.buckets.find((b) => b.bucket.startsWith('60'));
        const hiWin = high?.horizons.t20?.winRatePct ?? null;
        const loWin = low?.horizons.t20?.winRatePct ?? null;
        if (hiWin == null || loWin == null) return null;
        const gap = hiWin - loWin;
        const significant = primaryTest.significantAt5Pct && primaryTest.bucket80Better;
        return (
          <div className={`mt-3 rounded-md border px-3 py-2.5 ${significant ? 'border-tv-green/25 bg-tv-green/5' : 'border-tv-border bg-tv-bg/40'}`}>
            <p className="text-[11px] leading-relaxed text-tv-text">
              Bucket <span className="font-number font-semibold">{high!.bucket}</span> punya win rate T+20{' '}
              <span className={`font-number font-semibold ${gap >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
                {gap >= 0 ? '+' : ''}{gap.toFixed(0)} poin persen
              </span>{' '}
              dibanding bucket <span className="font-number font-semibold">{low!.bucket}</span> ({hiWin.toFixed(0)}% vs {loWin.toFixed(0)}%).{' '}
              {significant
                ? 'Selisih ini lolos uji signifikansi 5%, jadi kecil kemungkinannya murni kebetulan - tapi tetap dari data masa lalu.'
                : 'Selisih ini BELUM lolos uji signifikansi 5%, artinya masih bisa muncul dari kebetulan semata. Jangan dijadikan dasar keputusan.'}
            </p>
          </div>
        );
      })()}

      <p className="text-[10px] text-tv-muted mt-3">
        T-test memakai Welch sederhana untuk membandingkan bucket 80-100 dengan 60-69. Ini bukti awal kalibrasi scanner,
        bukan jaminan performa masa depan. Tanda <span className="text-tv-warning">*</span> pada kolom N menandai sampel di bawah 30 -
        terlalu sedikit untuk disimpulkan. &quot;N/A&quot; berarti belum ada sampel sama sekali di rentang itu, bukan hasil nol.
      </p>
    </div>
  );
}

// Halaman ini dulu punya 8 tab (Breakout, Rekomendasi, Menarik, Undervalue, Berisiko,
// Golden Cross, Dead Cross, Akumulasi Asing). Audit 2026-08-03 menemukan tab-tab itu
// memindai universe berbeda (15 vs 250 vs 220) sehingga angkanya tidak sebanding, isinya
// tumpang tindih (80 baris hanya berisi 69 saham unik), dan tab Rekomendasi memindai 220
// saham lewat ~22 request setiap dibuka. Semuanya dilebur jadi satu daftar berperingkat -
// lihat docs/superpowers/specs/2026-08-03-ai-pick-satu-tab-design.md.
export default function AiPickPage() {
  const [items, setItems] = useState<AiPickItem[]>([]);
  const [ready, setReady] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const [computedAt, setComputedAt] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [bucketBacktest, setBucketBacktest] = useState<BucketBacktest | null>(null);
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
    fetch('/api/ai-pick')
      .then(async (res) => {
        if (res.status === 401) {
          setGated('login');
          setShowLoginPrompt(true);
          return null;
        }
        if (res.status === 402) {
          setGated('pro');
          setShowPaywall(true);
          return null;
        }
        if (!res.ok) {
          setLoadError(true);
          return null;
        }
        return res.json();
      })
      .then((d) => {
        if (!d) return;
        if (d.error) { setLoadError(true); return; }
        setGated(null);
        setItems(d.items || []);
        setReady(d.ready !== false);
        setNote(d.note || null);
        setComputedAt(d.computedAt || null);
        setStale(d.stale === true);
      })
      .catch((e) => { console.error(e); setLoadError(true); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchPicks();
  }, [fetchPicks]);

  useEffect(() => {
    fetch('/api/lens-score-bucket-backtest')
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => {
        if (d && !d.error) setBucketBacktest(d);
      })
      .catch(console.error);
  }, []);

  // Jam diambil dari computedAt milik cache, BUKAN jam client saat halaman dibuka -
  // label lama memakai new Date() sehingga selalu menampilkan waktu klik seolah-olah
  // itu waktu data dihitung.
  const updateLabel = computedAt
    ? new Date(computedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB'
    : null;

  return (
    // Sebelumnya: `flex h-screen` + anak `overflow-y-auto custom-scrollbar`. AppShell
    // sudah menyediakan satu-satunya kontainer gulir (<main className="overflow-y-auto">),
    // jadi ini membuat gulir bersarang - dua scrollbar, dan header sticky di dalamnya
    // menempel pada kontainer dalam alih-alih viewport. h-screen (100vh) juga tidak
    // memperhitungkan bilah alamat browser mobile. Disamakan dengan halaman lain.
    <div className="flex-1 flex flex-col bg-tv-bg min-h-screen">
      <div className="flex-1 flex flex-col">
        <header className="bg-tv-surface border-b border-tv-border px-6 py-4 sticky top-0 z-20 shadow-2">
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.dispatchEvent(new Event('toggle-sidebar'))}
              className="md:hidden p-2 -ml-2 text-tv-muted hover:text-white rounded-lg hover:bg-white/5"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="p-2 rounded-md bg-tv-blue text-white">
              <Target className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-heading font-bold text-xl text-tv-text tracking-tight flex items-center gap-2">
                LensRadar Live
                {/* BUG FIX (audit integritas data 2026-08-03): badge "Live" dulu TETAP
                    tampil walau data sebenarnya dari sesi bursa sebelumnya (bisa 2+ hari
                    basi di akhir pekan, setelah TTL cache diperpanjang supaya tidak
                    kosong total di luar jam bursa - lihat shared/cache/ai-pick-cache.ts).
                    Sekarang badge jujur: "Live" cuma kalau data benar-benar segar. */}
                {stale ? <Badge variant="neutral" dot>Data Sesi Terakhir</Badge> : <Badge variant="danger" dot>Live</Badge>}
              </h1>
              <p className="text-xs text-tv-muted mt-0.5">Breakout & Opportunity Scanner</p>
              <p className="text-xs text-tv-muted flex items-center gap-1 mt-1">
                <Clock className="w-3 h-3" /> {updateLabel ? `${stale ? 'Data sesi terakhir' : 'Data'} per ${updateLabel}` : 'Memuat...'}
              </p>
            </div>
          </div>
        </header>

        {/* max-w-[1600px] menyamakan lebar dengan Technical/Fundamental - sebelumnya
            1200px membuat sisi kiri-kanan penuh ruang kosong menganggur di layar lebar. */}
        <PageContainer className="p-6">
          <div className="bg-tv-card border border-tv-border rounded-lg shadow-1 overflow-hidden">
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
                description="Butuh akun gratis - trial 7 hari akses penuh."
                action={{ label: 'Daftar Gratis', onClick: () => { window.location.href = '/signup'; } }}
              />
            )}

            {!loading && gated === 'pro' && (
              <EmptyState
                illustration="locked"
                title="LensRadar Live butuh akun Pro"
                description="Masa trial 7 hari sudah berakhir."
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

            {!loading && !gated && !loadError && ready && bucketBacktest?.ready ? (
              <BucketBacktestCard data={bucketBacktest} />
            ) : !loading && !gated && !loadError && ready && bucketBacktest ? (
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
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-tv-border text-xs text-tv-muted uppercase font-semibold tracking-wide">
                        <th className="py-3 px-4">#</th>
                        {RADAR_SORTABLE_COLUMNS.map((col) => (
                          <th key={col.key} className={`py-3 px-4 ${col.align === 'right' ? 'text-right' : ''}`}>
                            {/* Ikon dua-arah selalu tampil (redup) supaya terlihat kolom
                                mana yang bisa diurutkan - sebelumnya penanda hanya muncul
                                di kolom yang SEDANG aktif, jadi sebelum klik pertama tidak
                                ada isyarat sama sekali bahwa tabel ini sortable. */}
                            <button
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
                            </button>
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
                          <td className="py-3 px-4 text-tv-muted">{idx + 1}</td>
                          <td className="py-3 px-4 font-bold font-number whitespace-nowrap">
                            <div className="flex items-center gap-2.5">
                              <TickerAvatar symbol={it.symbol} size="sm" />
                              <div className="min-w-0">
                                <Link
                                  href={`/technical/${it.symbol}`}
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
                            <button
                              type="button"
                              onClick={() => setExpandedSymbol(isExpanded ? null : it.symbol)}
                              className="inline-flex items-center gap-1 text-[11px] text-tv-blue hover:text-tv-text transition-colors"
                            >
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </button>
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
                      <button
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
                      </button>
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
                                <Link href={`/technical/${it.symbol}`} className="font-number font-bold text-tv-text hover:text-tv-blue transition-colors">
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
                            <button
                              type="button"
                              onClick={() => setExpandedSymbol(isExpanded ? null : it.symbol)}
                              aria-label={isExpanded ? 'Tutup rincian' : 'Buka rincian'}
                              className="shrink-0 p-1.5 text-tv-blue"
                            >
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
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
                                    <div className="text-tv-muted uppercase text-[9px] tracking-wide">{label}</div>
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
                                <div className="text-tv-muted uppercase text-[9px] tracking-wide mb-1">Alasan Utama</div>
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
          </div>

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
        title="Masa Trial Habis"
        body="LensRadar Live butuh akun Pro setelah trial 7 hari berakhir."
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
        body="LensRadar butuh akun (gratis) - daftar sekarang, dapat trial 7 hari akses penuh sebelum diminta upgrade."
        ctaHref="/signup"
        ctaLabel="Daftar Gratis"
        secondaryLabel="Nanti"
      />
    </div>
  );
}
