'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import Header from '@/components/Header';
import { Sliders, Award, ArrowUpDown, Download, Bookmark, X, Lock } from 'lucide-react';
import { PageContainer, Skeleton, EmptyState, LoadingFact, TickerAvatar } from '@/components/ui';
import { fmtTriliun, fmtMiliar } from '@/shared/format/fundamental-format';
import { useAuthUser } from '@/lib/hooks/useAuthUser';
import { trackProductFunnelEvent, trackSignupClick } from '@/shared/analytics/product-funnel';

type ColumnKey = 'ticker' | 'name' | 'sector' | 'per' | 'rev_growth_ttm' | 'roe' | 'der'
  | 'div_yield' | 'bandarmology' | 'moat' | 'signal' | 'pattern_tag' | 'sentiment'
  | 'week52_high' | 'entry' | 'atr_pct' | 'market_cap' | 'adv20_idr';

interface SortableColumn {
  key: ColumnKey;
  label: string;
  align?: 'right';
  getValue: (item: any) => string | number | null | undefined;
}

/**
 * BUG FIX (2026-08-06): backend mengirim rev_growth_ttm / roe / der / div_yield
 * sebagai string yang SUDAH diformat ("+12.3%", "0.35x", "N/A" - lihat
 * screener.service.ts baris 518-521), sementara keempat kolom itu terdaftar
 * sebagai kolom numerik rata-kanan yang bisa diurutkan.
 *
 * Akibatnya compareValues() jatuh ke localeCompare dan mengurutkan angka secara
 * alfabetis: "8.1%" ditempatkan SESUDAH "12.3%" karena karakter "8" > "1", dan
 * "-5.0%" bisa mendarat di tengah-tengah. Urutannya tampak masuk akal sekilas
 * tapi salah - jenis kesalahan yang paling lama tidak ketahuan.
 *
 * Nilainya ditarik kembali ke angka di sini, di lapisan sort saja; sel tetap
 * menampilkan string terformat dari server apa adanya.
 */
function parseFormattedNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[+%x\s]/g, '').replace(',', '.');
  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null; // "N/A" -> null -> selalu diurutkan terakhir
}

const SORTABLE_COLUMNS: SortableColumn[] = [
  { key: 'ticker', label: 'Ticker', getValue: (i) => i.ticker },
  { key: 'name', label: 'Nama Emiten', getValue: (i) => i.name },
  { key: 'sector', label: 'Sektor', getValue: (i) => i.sector },
  { key: 'per', label: 'PER / Sektor', align: 'right', getValue: (i) => i.per },
  { key: 'rev_growth_ttm', label: 'Rev Growth (TTM)', align: 'right', getValue: (i) => parseFormattedNumber(i.rev_growth_ttm) },
  { key: 'roe', label: 'ROE', align: 'right', getValue: (i) => parseFormattedNumber(i.roe) },
  { key: 'der', label: 'DER', align: 'right', getValue: (i) => parseFormattedNumber(i.der) },
  { key: 'div_yield', label: 'Div Yield', align: 'right', getValue: (i) => parseFormattedNumber(i.div_yield) },
  { key: 'bandarmology', label: 'Bandarmology', getValue: (i) => i.bandarmology },
  { key: 'moat', label: 'Kualitas Profit', getValue: (i) => i.moat },
  { key: 'signal', label: 'Sinyal / Status', getValue: (i) => i.decision?.action ?? i.signal },
  { key: 'pattern_tag', label: 'Pola Backtest', getValue: (i) => i.pattern_tag },
  { key: 'sentiment', label: 'Sentimen Berita', getValue: (i) => i.sentiment },
  { key: 'week52_high', label: '52W High/Low', align: 'right', getValue: (i) => i.week52_high },
  { key: 'entry', label: 'Harga', align: 'right', getValue: (i) => i.entry },
  { key: 'atr_pct', label: 'Volatilitas Harian', align: 'right', getValue: (i) => i.atr_pct },
  // BARU (2026-08-14) - market_cap/adv20_idr dari backend SUDAH mentah (Rupiah, bukan
  // string terformat), beda dari per/roe/der di atas - tidak butuh parseFormattedNumber.
  { key: 'market_cap', label: 'Market Cap', align: 'right', getValue: (i) => i.market_cap },
  { key: 'adv20_idr', label: 'Likuiditas (ADV20)', align: 'right', getValue: (i) => i.adv20_idr },
];

function compareValues(a: string | number | null | undefined, b: string | number | null | undefined, dir: 'asc' | 'desc'): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  const result = typeof a === 'number' && typeof b === 'number'
    ? a - b
    : String(a).localeCompare(String(b), 'id');
  return dir === 'asc' ? result : -result;
}

// BARU (2026-08-14, masukan review eksternal - "simpan template screener favorit").
// localStorage murni client-side - tidak ada tabel Postgres baru untuk fitur yang
// sifatnya preferensi tampilan personal, konsisten dengan pola lain di app ini
// (mis. tema terang/gelap) yang juga tidak disimpan server-side per akun.
const TEMPLATES_STORAGE_KEY = 'sahamlens:screener-templates';
interface ScreenerTemplate {
  name: string;
  riskProfile: 'Konservatif' | 'Moderat' | 'Agresif';
  sector: string;
  maxPrice: string;
  // BARU (2026-08-14) - disimpan dalam unit yang sama dengan input-nya (Triliun/
  // Miliar), BUKAN Rupiah mentah yang dikirim ke API - konversi terjadi di runScreener.
  minMarketCapTriliun: string;
  minLiquidityMiliar: string;
}
function loadTemplates(): ScreenerTemplate[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(TEMPLATES_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const GUEST_VISIBLE_RESULT_COUNT = 2;

function GuestScannerLock({ lockedCount = 8 }: { lockedCount?: number }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-tv-blue/35 bg-tv-blue/5 px-4 py-3 text-xs">
      <div className="flex items-start gap-2 text-tv-muted">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-tv-blue" />
        <span><strong className="text-tv-text">{lockedCount > 0 ? `${lockedCount} kandidat lainnya terkunci.` : 'Kandidat lainnya terkunci.'}</strong> Masuk atau daftar gratis untuk melihat seluruh ranking sektor ini, menyimpan template, dan mengekspor CSV.</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Link onClick={() => trackSignupClick('screener_results')} href="/login?next=%2Fscreener" className="rounded-md border border-tv-blue/50 px-2.5 py-1.5 font-semibold text-tv-blue hover:bg-tv-blue/10">Masuk</Link>
        <Link onClick={() => trackSignupClick('screener_results')} href="/signup?next=%2Fscreener" className="rounded-md bg-tv-blue px-2.5 py-1.5 font-semibold text-white hover:bg-tv-blueHover">Daftar Gratis</Link>
      </div>
    </div>
  );
}

export default function ScreenerPage() {
  const router = useRouter();
  const { loading: authLoading, resolved: authResolved, user } = useAuthUser();
  const [riskProfile, setRiskProfile] = useState<'Konservatif' | 'Moderat' | 'Agresif'>('Moderat');
  const [sectorFilter, setSectorFilter] = useState('');
  const [maxPriceInput, setMaxPriceInput] = useState('');
  const [minMarketCapInput, setMinMarketCapInput] = useState(''); // unit: Triliun
  const [minLiquidityInput, setMinLiquidityInput] = useState(''); // unit: Miliar
  const [sortKey, setSortKey] = useState<ColumnKey | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  // Kegagalan fetch sebelumnya hanya menghasilkan setData(null), yang membuat tabel
  // menampilkan "Tidak ada saham yang memenuhi kriteria saat ini" - klaim bahwa
  // pemindaian sudah berjalan dan hasilnya nihil. Dua keadaan berbeda, satu pesan.
  const [templates, setTemplates] = useState<ScreenerTemplate[]>([]);
  const [templateNameDraft, setTemplateNameDraft] = useState('');
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const hasTrackedGuestLock = useRef(false);

  useEffect(() => setTemplates(loadTemplates()), []);

  const handleSort = (key: ColumnKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      // Kolom rata-kanan itu kolom angka: klik pertama menampilkan nilai TERTINGGI
      // dulu. Urutan menaik pada ROE atau Div Yield bukan yang dicari siapa pun.
      const col = SORTABLE_COLUMNS.find((c) => c.key === key);
      setSortDir(col?.align === 'right' ? 'desc' : 'asc');
    }
  };

  // Debounce 500 ms DIPERTAHANKAN, tapi lewat state kunci alih-alih setTimeout yang
  // memanggil fetch. Dua alasan, keduanya nyata:
  //
  //   1. Versi lama TIDAK punya penjaga urutan sama sekali - satu-satunya halaman
  //      tersisa yang begitu. Debounce mengurangi peluangnya, tapi tidak menghapusnya:
  //      dua pemindaian yang sempat berangkat (mis. filter diubah lagi setelah 500 ms
  //      berlalu) bisa mendarat terbalik, dan hasil filter LAMA tampil sebagai hasil
  //      filter yang sedang aktif. SWR mengunci hasil ke kuncinya.
  //   2. Kombinasi filter yang sama kini kunci yang sama, jadi kembali ke filter
  //      sebelumnya dijawab dari cache alih-alih memicu pemindaian ulang - dan endpoint
  //      ini punya compute budget server-side yang ikut terhemat.
  const buildScreenerQuery = useCallback(
    (
      profile: string,
      sector: string,
      maxPrice: string,
      minMarketCapTriliun: string,
      minLiquidityMiliar: string,
    ) => {
      const params = new URLSearchParams({ profile });
      if (sector) params.set('sector', sector);
      // Cuma dikirim kalau benar-benar angka positif - backend sudah fail-open untuk
      // nilai tidak valid, tapi tidak perlu mengirim parameter kosong/rusak sama sekali.
      const parsedPrice = Number(maxPrice);
      if (maxPrice && Number.isFinite(parsedPrice) && parsedPrice > 0) {
        params.set('maxPrice', String(parsedPrice));
      }
      // Input pengguna dalam Triliun/Miliar (angka yang wajar diketik), dikonversi ke
      // Rupiah mentah di sini - API selalu menerima/mengembalikan Rupiah penuh, tidak
      // pernah unit yang disingkat, supaya tidak ada dua konvensi unit berbeda.
      const parsedMarketCap = Number(minMarketCapTriliun);
      if (minMarketCapTriliun && Number.isFinite(parsedMarketCap) && parsedMarketCap > 0) {
        params.set('minMarketCap', String(parsedMarketCap * 1e12));
      }
      const parsedLiquidity = Number(minLiquidityMiliar);
      if (minLiquidityMiliar && Number.isFinite(parsedLiquidity) && parsedLiquidity > 0) {
        params.set('minLiquidity', String(parsedLiquidity * 1e9));
      }
      return params.toString();
    },
    [],
  );

  const [screenerQuery, setScreenerQuery] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setScreenerQuery(
        buildScreenerQuery(
          riskProfile,
          sectorFilter,
          maxPriceInput,
          minMarketCapInput,
          minLiquidityInput,
        ),
      );
    }, 500);
    return () => clearTimeout(t);
  }, [
    riskProfile,
    sectorFilter,
    maxPriceInput,
    minMarketCapInput,
    minLiquidityInput,
    buildScreenerQuery,
  ]);

  const {
    data,
    error: screenerError,
    isLoading: loading,
    mutate: retryScreener,
  } = useSWR<any>(screenerQuery ? `/api/screener?${screenerQuery}` : null);

  // Payload 200 yang membawa `error` tetap diperlakukan sebagai kegagalan, sama seperti
  // sebelumnya - endpoint bisa menjawab sukses dengan penjelasan kenapa hasilnya kosong.
  const loadError = Boolean(screenerError) || Boolean(data?.error);
  const loadErrorMessage = screenerError
    ? (screenerError as Error).message || null
    : typeof data?.error === 'string'
      ? data.error
      : null;


  // useMemo: `|| []` menghasilkan array baru setiap render dan membatalkan useMemo di
  // bawahnya. Ditangkap react-hooks/exhaustive-deps.
  const top10 = useMemo(() => data?.analysis?.top_10_stocks ?? [], [data]);
  const isConfirmedGuest = authResolved && !authLoading && !user;
  const isGuestLimited = Boolean(data?.analysis?.is_guest_limited ?? isConfirmedGuest);
  const lockedCount = isGuestLimited ? (data?.analysis?.locked_count ?? 8) : 0;
  const hasLockedGuestRows = isGuestLimited && lockedCount > 0;

  const sortedRows = useMemo(() => {
    if (!sortKey) return top10;
    const col = SORTABLE_COLUMNS.find((c) => c.key === sortKey)!;
    return [...top10].sort((a: any, b: any) => compareValues(col.getValue(a), col.getValue(b), sortDir));
  }, [top10, sortKey, sortDir]);
  const visibleRows = isGuestLimited ? sortedRows.slice(0, GUEST_VISIBLE_RESULT_COUNT) : sortedRows;

  useEffect(() => {
    if (!hasLockedGuestRows || hasTrackedGuestLock.current) return;
    trackProductFunnelEvent('locked_view', 'screener_results');
    hasTrackedGuestLock.current = true;
  }, [hasLockedGuestRows]);

  // BARU (2026-08-14, masukan review eksternal - "tombol Export ke Excel/CSV").
  // Murni client-side dari data yang SUDAH dimuat (bukan panggilan API baru) - kolom
  // & urutannya SAMA PERSIS dengan SORTABLE_COLUMNS, jadi CSV yang diunduh cocok satu
  // per satu dengan yang terlihat di layar, termasuk urutan sortir yang sedang aktif.
  const exportCsv = useCallback(() => {
    if (sortedRows.length === 0) return;
    const escapeCsv = (value: unknown): string => {
      const s = value == null ? '' : String(value);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = SORTABLE_COLUMNS.map((c) => c.label).join(',');
    const rows = sortedRows.map((item: any) =>
      SORTABLE_COLUMNS.map((c) => escapeCsv(c.getValue(item))).join(',')
    );
    // ﻿ (UTF-8 BOM) - tanpa ini Excel di Windows salah menebak encoding dan
    // merender karakter non-ASCII (mis. tanda panah/persen dari data terformat) rusak.
    const csv = '﻿' + [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sahamlens-screener-${riskProfile.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [sortedRows, riskProfile]);

  const saveCurrentAsTemplate = useCallback(() => {
    const name = templateNameDraft.trim();
    if (!name) return;
    const next: ScreenerTemplate = {
      name, riskProfile, sector: sectorFilter, maxPrice: maxPriceInput,
      minMarketCapTriliun: minMarketCapInput, minLiquidityMiliar: minLiquidityInput,
    };
    setTemplates((prev) => {
      // Nama yang sama menimpa template lama - "simpan ulang" alih-alih menumpuk
      // duplikat tak berujung tiap kali pengguna klik "Simpan" dengan nama yang sama.
      const updated = [...prev.filter((t) => t.name !== name), next];
      window.localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
    setTemplateNameDraft('');
    setShowSaveTemplate(false);
  }, [templateNameDraft, riskProfile, sectorFilter, maxPriceInput, minMarketCapInput, minLiquidityInput]);

  const applyTemplate = useCallback((t: ScreenerTemplate) => {
    setRiskProfile(t.riskProfile);
    setSectorFilter(t.sector);
    setMaxPriceInput(t.maxPrice);
    // ?? '' - template yang disimpan SEBELUM filter Market Cap/Likuiditas ada
    // (localStorage lama) tidak punya field ini sama sekali; undefined harus jadi
    // string kosong, bukan merender "undefined" literal di input terkontrol.
    setMinMarketCapInput(t.minMarketCapTriliun ?? '');
    setMinLiquidityInput(t.minLiquidityMiliar ?? '');
  }, []);

  const deleteTemplate = useCallback((name: string) => {
    setTemplates((prev) => {
      const updated = prev.filter((t) => t.name !== name);
      window.localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  return (
    <div className="flex-1 flex flex-col bg-tv-bg min-h-screen">
      <Header
        currentTicker=""
        onTickerChange={(t) => router.push(`/technical/${t.replace('.JK', '')}.JK`)}
        moduleTitle="LensScanner — Filter Saham Multi-Faktor"
        moduleBank="LENSSCANNER"
      />

      <PageContainer className="p-4 md:p-6 lg:p-7 space-y-6">
        {/* Risk Profile Selection Bar */}
        <div className="bg-tv-card border border-tv-border rounded-xl p-5 shadow-1 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* amber-400 diganti tv-gold: satu-satunya aksen di app yang memakai
                warna Tailwind mentah di luar palet, jadi kuningnya tidak sama
                dengan kuning mana pun di halaman lain. */}
            <div className="p-3 rounded-xl bg-tv-gold/10 border border-tv-gold/30 text-tv-gold">
              <Sliders className="w-6 h-6" />
            </div>
            <div>
              <h1 className="lens-page-title">Seleksi Profil Risiko Investor</h1>
              {/* font-mono dilepas: aturan tipografi di app/globals.css menyebut
                  font-mono HANYA untuk data tabular/kode, bukan kalimat. */}
              <p className="text-xs text-tv-muted">
                Pilih toleransi risiko untuk memfilter 10 Saham IDX terbaik berdasarkan penilaian kuantitatif LensScore.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-tv-bg p-1.5 rounded-lg border border-tv-border">
            {(['Konservatif', 'Moderat', 'Agresif'] as const).map((profile) => (
              <motion.button
                key={profile}
                onClick={() => setRiskProfile(profile)}
                whileTap={{ scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                className={`px-4 py-2 rounded-md text-xs font-bold transition-colors ${
                  riskProfile === profile
                    ? 'bg-tv-gold text-black shadow-md'
                    : 'text-tv-text hover:bg-tv-hover hover:text-white'
                }`}
              >
                {profile}
              </motion.button>
            ))}
          </div>
        </div>

        {/* Profil risiko mengubah BOBOT skor, bukan cuma menyaring - itu tidak
            terbaca dari nama profilnya saja. */}
        <p className="-mt-3 text-[11px] leading-relaxed text-tv-muted">
          {riskProfile === 'Konservatif' && 'Konservatif: DER 35%, dividen 30%, ROE 20%, PER 15%. Pertumbuhan dan momentum tidak dihitung sama sekali - saham bertumbuh cepat tapi berutang besar akan tenggelam di profil ini.'}
          {riskProfile === 'Moderat' && 'Moderat: ROE 25%, PER 25%, pertumbuhan 20%, DER 15%, dividen 15%. Momentum tidak dihitung - peringkat di sini murni soal kualitas dan harga, bukan pergerakan harga terkini.'}
          {riskProfile === 'Agresif' && 'Agresif: pertumbuhan 35%, momentum 30%, ROE 20%, PER 15%. Utang dan dividen berbobot NOL - emiten berutang besar tidak dihukum sedikit pun di profil ini.'}
        </p>

        {/* Master Strategy Presets */}
        <div className="bg-tv-card border border-tv-border rounded-xl p-4 shadow-1 space-y-3">
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-tv-muted block mb-2">
              Preset Parameter (1-Klik):
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setRiskProfile('Konservatif');
                  setMinMarketCapInput('10');
                  setMinLiquidityInput('10');
                  setMaxPriceInput('');
                  setSectorFilter('');
                }}
                className="px-3 py-1.5 rounded-lg border border-tv-green/30 bg-tv-green/[0.08] hover:bg-tv-green/[0.15] text-xs font-semibold text-tv-green flex items-center gap-1.5 transition-colors"
              >
                🛡️ Quality + Large/Liquid
              </button>
              <button
                type="button"
                onClick={() => {
                  setRiskProfile('Moderat');
                  setMinMarketCapInput('2');
                  setMinLiquidityInput('5');
                  setMaxPriceInput('');
                  setSectorFilter('');
                }}
                className="px-3 py-1.5 rounded-lg border border-tv-blue/30 bg-tv-blue/[0.08] hover:bg-tv-blue/[0.15] text-xs font-semibold text-tv-blue flex items-center gap-1.5 transition-colors"
              >
                📈 Kualitas + Valuasi + Growth
              </button>
              <button
                type="button"
                onClick={() => {
                  setRiskProfile('Konservatif');
                  setMinMarketCapInput('5');
                  setMinLiquidityInput('5');
                  setMaxPriceInput('');
                  setSectorFilter('');
                }}
                className="px-3 py-1.5 rounded-lg border border-tv-gold/30 bg-tv-gold/[0.08] hover:bg-tv-gold/[0.15] text-xs font-semibold text-tv-gold flex items-center gap-1.5 transition-colors"
              >
                💰 Defensif: Dividen + DER
              </button>
              <button
                type="button"
                onClick={() => {
                  setRiskProfile('Agresif');
                  setMaxPriceInput('5000');
                  setMinMarketCapInput('1');
                  setMinLiquidityInput('2');
                  setSectorFilter('');
                }}
                className="px-3 py-1.5 rounded-lg border border-tv-purple/30 bg-tv-purple/[0.08] hover:bg-tv-purple/[0.15] text-xs font-semibold text-tv-purple flex items-center gap-1.5 transition-colors"
              >
                ⚡ Growth + Momentum &lt; Rp5.000
              </button>
            </div>
            <p className="text-[10px] leading-relaxed text-tv-muted">
              Preset hanya mengisi parameter SahamLens yang terlihat; bukan strategi resmi investor tertentu, bukan indeks resmi, dan bukan jaminan hasil.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-3 pt-2 border-t border-tv-border">
            <div>
              <label htmlFor="screener-sector" className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-tv-muted">Sektor</label>
              <select
                id="screener-sector"
                value={sectorFilter}
                onChange={(e) => setSectorFilter(e.target.value)}
                className="h-9 rounded-lg border border-tv-border bg-tv-bg px-2.5 text-xs text-tv-text focus:border-tv-blue focus:outline-none"
              >
                <option value="">Semua Sektor</option>
                {(data?.availableSectors || []).map((s: string) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="screener-max-price" className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-tv-muted">Harga Maks (Rp)</label>
              <input
                id="screener-max-price"
                type="number"
                min={1}
                inputMode="numeric"
                placeholder="mis. 5000"
                value={maxPriceInput}
                onChange={(e) => setMaxPriceInput(e.target.value)}
                className="h-9 w-32 rounded-lg border border-tv-border bg-tv-bg px-2.5 text-xs text-tv-text placeholder:text-tv-muted/60 focus:border-tv-blue focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="screener-min-mcap" className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-tv-muted">Market Cap Min (Rp T)</label>
              <input
                id="screener-min-mcap"
                type="number"
                min={0}
                step="any"
                inputMode="decimal"
                placeholder="mis. 10"
                value={minMarketCapInput}
                onChange={(e) => setMinMarketCapInput(e.target.value)}
                className="h-9 w-28 rounded-lg border border-tv-border bg-tv-bg px-2.5 text-xs text-tv-text placeholder:text-tv-muted/60 focus:border-tv-blue focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="screener-min-liquidity" className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-tv-muted">Likuiditas Min (Rp M/hari)</label>
              <input
                id="screener-min-liquidity"
                type="number"
                min={0}
                step="any"
                inputMode="decimal"
                placeholder="mis. 1"
                value={minLiquidityInput}
                onChange={(e) => setMinLiquidityInput(e.target.value)}
                className="h-9 w-28 rounded-lg border border-tv-border bg-tv-bg px-2.5 text-xs text-tv-text placeholder:text-tv-muted/60 focus:border-tv-blue focus:outline-none"
              />
            </div>
            {(sectorFilter || maxPriceInput || minMarketCapInput || minLiquidityInput) && (
              <button
                type="button"
                onClick={() => { setSectorFilter(''); setMaxPriceInput(''); setMinMarketCapInput(''); setMinLiquidityInput(''); }}
                className="h-9 rounded-lg border border-tv-border px-3 text-xs font-semibold text-tv-muted transition-colors hover:text-tv-text"
              >
                Reset filter
              </button>
            )}

            <div className="ml-auto flex flex-wrap items-end gap-2">
              {isConfirmedGuest ? (
                <Link
                  onClick={() => trackSignupClick('screener_results')}
                  href="/login?next=%2Fscreener"
                  className="flex h-9 items-center gap-1.5 rounded-lg border border-tv-blue/40 bg-tv-blue/10 px-3 text-xs font-semibold text-tv-blue transition-colors hover:bg-tv-blue/15"
                >
                  <Lock className="h-3.5 w-3.5" /> Masuk untuk simpan & ekspor
                </Link>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setShowSaveTemplate((v) => !v)}
                    title="Simpan kombinasi profil + filter saat ini sebagai template"
                    className="flex h-9 items-center gap-1.5 rounded-lg border border-tv-border px-3 text-xs font-semibold text-tv-muted transition-colors hover:text-tv-text"
                  >
                    <Bookmark className="h-3.5 w-3.5" /> Simpan Template
                  </button>
                  <button
                    type="button"
                    onClick={exportCsv}
                    disabled={sortedRows.length === 0}
                    title="Unduh hasil yang sedang tampil sebagai CSV"
                    className="flex h-9 items-center gap-1.5 rounded-lg border border-tv-blue/30 bg-tv-blue/10 px-3 text-xs font-semibold text-tv-blue transition-colors hover:bg-tv-blue/15 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Download className="h-3.5 w-3.5" /> Export CSV
                  </button>
                </>
              )}
            </div>
          </div>

          {showSaveTemplate && (
            <div className="flex flex-wrap items-center gap-2 border-t border-tv-border pt-3">
              <input
                type="text"
                autoFocus
                placeholder="Nama template, mis. LQ45 Murah"
                value={templateNameDraft}
                onChange={(e) => setTemplateNameDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveCurrentAsTemplate()}
                className="h-9 flex-1 min-w-[180px] rounded-lg border border-tv-border bg-tv-bg px-2.5 text-xs text-tv-text placeholder:text-tv-muted/60 focus:border-tv-blue focus:outline-none"
              />
              <button
                type="button"
                onClick={saveCurrentAsTemplate}
                disabled={!templateNameDraft.trim()}
                className="h-9 rounded-lg bg-tv-blue px-3 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                Simpan
              </button>
            </div>
          )}

          {templates.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 border-t border-tv-border pt-3">
              <span className="text-[10px] uppercase tracking-wide text-tv-muted shrink-0 mr-1">Template</span>
              {templates.map((t) => (
                <span
                  key={t.name}
                  className="flex items-center gap-1 rounded-full border border-tv-border bg-tv-bg px-2.5 py-1 text-[11px] text-tv-text"
                >
                  <button type="button" onClick={() => applyTemplate(t)} className="hover:text-tv-blue transition-colors">
                    {t.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteTemplate(t.name)}
                    aria-label={`Hapus template ${t.name}`}
                    className="text-tv-muted hover:text-tv-red transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Screener Results Table */}
        <div className="bg-tv-card border border-tv-border rounded-xl p-5 shadow-1 space-y-4">
          <div className="flex items-center justify-between border-b border-tv-border pb-3">
            <div className="flex items-center gap-2">
              <Award className="w-5 h-5 text-amber-400" />
              <h3 className="font-heading font-bold text-base text-white">
                Top 10 Saham IDX - Profil {riskProfile}
              </h3>
            </div>
            <div className="text-right">
              <span className="text-xs text-tv-muted block">
                Ranking skor komposit (bobot beda per profil): PER vs Sektor, ROE, DER, Div Yield, Revenue Growth, Bandarmology (Chaikin Money Flow)
              </span>
              {/* BUG FIX (audit 2026-08-05, temuan M-13): backend SUDAH mengirim `_meta`
                  (umur cache universe screener, TTL 30 menit) sejak audit sebelumnya, tapi
                  halaman ini tidak pernah merendernya - hasil 29 menit tampil identik
                  dengan yang baru dihitung. */}
              {data?._meta && (
                <span className="text-[10px] font-mono text-tv-muted/80 block mt-1">
                  {data._meta.cachedAgeSec < 60
                    ? 'Baru saja dihitung'
                    : `Dihitung ${Math.round(data._meta.cachedAgeSec / 60)} menit lalu (disegarkan tiap ${Math.round(data._meta.cacheTtlSec / 60)} menit)`}
                </span>
              )}
            </div>
          </div>

          {/* Amber Lock Banner matching AlgoFilters screenshot */}
          {hasLockedGuestRows && (
            <div className="mb-4 px-3.5 py-2.5 rounded-lg bg-tv-yellow/10 border border-tv-yellow/30 text-tv-yellow text-xs font-sans flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Lock className="w-3.5 h-3.5 flex-shrink-0" />
                <span>
                  <strong>{lockedCount} emiten lanjutan terkunci</strong> (LensScanner). Masuk untuk membuka seluruh hasil 10 LensScore.
                </span>
              </div>
              <Link
                onClick={() => trackSignupClick('screener_results')}
                href="/login?next=%2Fscreener"
                className="shrink-0 font-bold underline underline-offset-2 hover:text-white"
              >
                Masuk untuk membuka
              </Link>
            </div>
          )}

          {/* Keadaan kosong dikeluarkan dari dalam <tbody>: sebuah sel colSpan=17
              memaksa ilustrasi & tombol aksi hidup di dalam tata letak tabel, dan
              di layar sempit ia ikut tergulir horizontal bersama 16 kolom kosong. */}
          {loading && sortedRows.length === 0 && (
            <div className="space-y-2 py-2">
              {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-11 w-full" />)}
              <LoadingFact className="mt-3" />
            </div>
          )}

          {!loading && loadError && (
            <EmptyState
              illustration="empty"
              title="Hasil pemindaian gagal dimuat"
              description={loadErrorMessage || 'Permintaan ke server tidak sampai, jadi belum diketahui saham mana yang lolos untuk profil ini. Ini bukan berarti tidak ada yang memenuhi kriteria.'}
              action={{ label: 'Coba lagi', onClick: () => void retryScreener() }}
            />
          )}

          {!loading && !loadError && sortedRows.length === 0 && (
            <EmptyState
              illustration="search"
              title={`Tidak ada saham yang lolos profil ${riskProfile}`}
              description="Pemindaian berjalan normal dan hasilnya nihil untuk bobot profil ini. Coba profil risiko lain - bobot yang berbeda memunculkan kandidat yang berbeda."
            />
          )}

          {/* Dua kolom dibekukan, bukan satu: kolom pertama di sini adalah nomor urut,
              jadi membekukan first-child saja akan mengunci angka peringkat sementara
              KODE SAHAM - satu-satunya yang membuat 15 kolom sisanya berarti - tetap
              ikut tergulir. --lens-sticky-head-bg menyamakan latar sel beku di header
              dengan bg-tv-bg milik baris headernya. */}
          {/* md:, bukan lg: (FIX-11). Di 768-1023px tablet dulu mendapat daftar kartu
              ponsel dan kehilangan 12 kolom sekaligus. Tabelnya sendiri sudah punya gulir
              horizontal DAN kolom kode yang dibekukan (lens-table-sticky-col, FIX-3),
              jadi lebar 768px cukup: pengguna menggulir angka sambil kode sahamnya tetap
              terlihat - jauh lebih bisa dipindai daripada 12 kartu bertumpuk. */}
          {sortedRows.length > 0 && (
          <div className="lens-table-sticky-col lens-table-sticky-col-2 [--lens-sticky-head-bg:rgb(var(--lens-bg))] hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs font-mono border-collapse">
              <thead>
                <tr className="border-b border-tv-border bg-tv-bg text-tv-muted uppercase text-[10px]">
                  <th className="w-12 p-3">#</th>
                  {SORTABLE_COLUMNS.map((col) => (
                    <th key={col.key} className={`p-3 ${col.align === 'right' ? 'text-right' : ''}`}>
                      {/* Ikon dua-arah redup menandai kolom yang bisa diurutkan.
                          Sebelumnya penanda hanya muncul di kolom yang sedang aktif,
                          jadi sebelum klik pertama tidak ada isyarat apa pun bahwa
                          16 kolom ini sortable. */}
                      <button
                        type="button"
                        onClick={() => handleSort(col.key)}
                        title={`Urutkan menurut ${col.label}`}
                        className={`group inline-flex items-center gap-1 hover:text-tv-text transition-colors ${col.align === 'right' ? 'flex-row-reverse' : ''} ${sortKey === col.key ? 'text-tv-text' : ''}`}
                      >
                        {col.label}
                        {sortKey === col.key ? (
                          <span className="text-tv-blue">{sortDir === 'asc' ? '▲' : '▼'}</span>
                        ) : (
                          <ArrowUpDown className="w-3 h-3 opacity-30 group-hover:opacity-70 transition-opacity" />
                        )}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-tv-border/50">
                {visibleRows.map((item: any, idx: number) => (
                  <tr key={item.ticker} className="hover:bg-tv-hover/50 transition-colors">
                    <td className="w-12 p-3 text-tv-muted font-bold">{idx + 1}</td>
                    <td className="p-3">
                      <Link
                        href={`/technical/${item.ticker}.JK`}
                        className="inline-flex items-center gap-2 font-bold text-white hover:text-tv-blue transition-colors"
                      >
                        <TickerAvatar symbol={item.ticker} size="sm" />
                        {item.ticker}
                      </Link>
                    </td>
                    <td className="p-3 text-tv-text font-sans font-medium">
                      <Link href={`/technical/${item.ticker}.JK`} className="hover:text-tv-blue transition-colors">
                        {item.name}
                      </Link>
                    </td>
                    <td className="p-3 text-tv-muted">{item.sector}</td>
                    <td className="p-3 text-right font-bold text-white font-number">
                      {/* null = data tidak ada (emiten rugi tidak punya PER; sektor tanpa
                          emiten ber-PER valid tidak punya rata-rata) - tampilkan "N/A"
                          apa adanya, jangan angka pengganti (temuan H-8). */}
                      {item.per != null ? `${item.per}x` : 'N/A'}{' '}
                      <span className="text-[10px] text-tv-muted font-normal">
                        ({item.per_sector != null ? `${item.per_sector}x` : 'sektor N/A'})
                      </span>
                    </td>
                    {/* BUG FIX (2026-08-06): kelas warnanya dulu text-tv-green tanpa
                        syarat, jadi pertumbuhan pendapatan NEGATIF ("-12.3%") tampil
                        hijau - persis kebalikan artinya. Warna sekarang mengikuti
                        tanda nilainya; "N/A" tetap netral. */}
                    <td className={`p-3 text-right font-bold font-number ${
                      (parseFormattedNumber(item.rev_growth_ttm) ?? 0) > 0 ? 'text-tv-green'
                        : (parseFormattedNumber(item.rev_growth_ttm) ?? 0) < 0 ? 'text-tv-red'
                        : 'text-tv-muted'
                    }`}>
                      {item.rev_growth_ttm}
                    </td>
                    <td className="p-3 text-right text-tv-accent font-bold font-number">{item.roe}</td>
                    <td className="p-3 text-right text-tv-text font-number">{item.der}</td>
                    <td className="p-3 text-right text-tv-yellow font-bold font-number">{item.div_yield}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        item.bandarmology === 'Akumulasi'
                          ? 'bg-tv-green/20 text-tv-green border border-tv-green/30'
                          : item.bandarmology === 'Distribusi'
                          ? 'bg-tv-red/20 text-tv-red border border-tv-red/30'
                          : 'bg-tv-hover text-tv-text'
                      }`}>
                        {item.bandarmology}
                      </span>
                    </td>
                    <td className="p-3 text-tv-text">{item.moat}</td>
                    <td className="p-3">
                      {item.decision?.advisory === true && item.decision?.action ? (
                        <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded font-bold font-sans text-[10px] ${
                          item.decision.action.includes('BUY')
                            ? 'bg-tv-green/20 text-tv-green border border-tv-green/50'
                            : item.decision.action === 'SELL'
                            ? 'bg-tv-red/20 text-tv-red border border-tv-red/50'
                            : 'bg-tv-yellow/10 text-tv-yellow border border-tv-yellow/40'
                        }`}>
                          REKOMENDASI: {item.decision.action}
                        </span>
                      ) : item.signal ? (
                        <div className="flex flex-col items-start gap-1">
                          <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded font-bold font-sans text-[10px] ${
                            item.signal.includes('BUY')
                              ? 'bg-tv-green/10 text-tv-green border border-tv-green/30'
                              : item.signal === 'SELL'
                                ? 'bg-tv-red/10 text-tv-red border border-tv-red/30'
                                : 'bg-tv-yellow/10 text-tv-yellow border border-tv-yellow/30'
                          }`}>
                            {item.signal === 'DATA TIDAK CUKUP' ? 'STATUS MODEL: DATA TIDAK CUKUP' : `SINYAL MODEL: ${item.signal}`}
                          </span>
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-tv-yellow">
                            {item.decision?.reasonCodes?.includes('MODEL_UNVALIDATED')
                              ? 'Model belum tervalidasi'
                              : item.eligibility_status && item.eligibility_status !== 'ELIGIBLE'
                                ? 'Tidak layak direkomendasikan'
                                : 'Rekomendasi tidak tersedia'}
                          </span>
                        </div>
                      ) : (
                        <span
                          className="text-tv-muted text-[10px] cursor-help border-b border-dotted border-tv-borderLight"
                          title={
                            item.eligibility_reasons?.length
                              ? item.eligibility_reasons.join(' · ')
                              : 'Histori harga kurang dari 200 hari bursa, jadi gerbang kelayakan belum bisa dievaluasi'
                          }
                        >
                          {item.eligibility_status && item.eligibility_status !== 'ELIGIBLE'
                            ? 'Tidak lolos gerbang'
                            : 'Histori kurang'}
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-tv-text text-[11px]">
                      {item.pattern_tag || <span className="text-tv-muted">Tidak ada pola cocok</span>}
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        item.sentiment === 'POSITIF'
                          ? 'bg-tv-green/20 text-tv-green border border-tv-green/30'
                          : item.sentiment === 'NEGATIF'
                          ? 'bg-tv-red/20 text-tv-red border border-tv-red/30'
                          : 'bg-tv-hover text-tv-text'
                      }`}>
                        {item.sentiment ? item.sentiment.charAt(0) + item.sentiment.slice(1).toLowerCase() : 'N/A'}
                      </span>
                    </td>
                    {/* `Rp {undefined?.toLocaleString()}` sebelumnya merender teks
                        "Rp " menggantung tanpa angka saat 52W high/low tidak ada -
                        terbaca seperti label yang belum selesai dimuat. */}
                    <td className="p-3 text-right text-white">
                      {item.week52_high != null && item.week52_low != null ? (
                        <>
                          <span className="text-tv-green font-bold font-number">Rp {item.week52_high.toLocaleString('id-ID')}</span> /{' '}
                          <span className="text-tv-red font-bold font-number">Rp {item.week52_low.toLocaleString('id-ID')}</span>
                        </>
                      ) : (
                        <span className="text-tv-muted text-[10px]">N/A</span>
                      )}
                    </td>
                    <td className="p-3 text-right text-white">
                      {item.entry != null
                        ? <span className="text-tv-yellow font-bold font-number">Rp {item.entry.toLocaleString('id-ID')}</span>
                        : <span className="text-tv-muted text-[10px]">N/A</span>}
                    </td>
                    <td className="p-3 text-right text-tv-text font-number">
                      {item.atr_pct != null ? `±${item.atr_pct.toFixed(1)}%/hari` : 'N/A'}
                    </td>
                    <td className="p-3 text-right text-tv-text font-number">{fmtTriliun(item.market_cap)}</td>
                    <td className="p-3 text-right text-tv-text font-number">{fmtMiliar(item.adv20_idr)}</td>
                  </tr>
                ))}

                {/* Baris Emiten Terkunci (3 - 10) untuk Tamu */}
                {hasLockedGuestRows && Array.from({ length: lockedCount }).map((_, i) => {
                  const rowIdx = visibleRows.length + i + 1;
                  return (
                    <tr key={`locked-row-${rowIdx}`} className="hover:bg-tv-hover/20 transition-colors">
                      <td className="p-3 text-tv-muted font-bold whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          <Lock className="h-3 w-3 text-tv-yellow shrink-0" />
                          <span>{rowIdx}</span>
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="inline-flex items-center gap-2 font-bold text-white">
                          <span className="w-5 h-5 rounded-full bg-tv-yellow/10 border border-tv-yellow/30 inline-flex items-center justify-center text-tv-yellow">
                            <Lock className="h-2.5 w-2.5" />
                          </span>
                          <span className="blur-sm select-none opacity-40 font-mono">••••</span>
                        </span>
                      </td>
                      <td className="p-3 font-sans font-medium whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="text-tv-text blur-sm select-none opacity-40">
                            PT •••••••••••••••• Tbk
                          </span>
                          <Link
                            onClick={() => trackSignupClick('screener_results')}
                            href="/login?next=%2Fscreener"
                            className="inline-flex items-center gap-1 text-[10px] font-bold text-tv-yellow bg-tv-yellow/10 border border-tv-yellow/40 px-2 py-0.5 rounded-full hover:bg-tv-yellow/20 hover:text-white transition-all shadow-sm shrink-0 whitespace-nowrap"
                          >
                            <Lock className="h-3 w-3" /> Masuk
                          </Link>
                        </div>
                      </td>
                      <td className="p-3 text-tv-muted blur-sm select-none opacity-40">••••••••</td>
                      <td className="p-3 text-right font-bold text-white font-number blur-sm select-none opacity-40">••.x</td>
                      <td className="p-3 text-right font-bold font-number blur-sm select-none opacity-40">••%</td>
                      <td className="p-3 text-right text-tv-accent font-bold font-number blur-sm select-none opacity-40">••%</td>
                      <td className="p-3 text-right text-tv-text font-number blur-sm select-none opacity-40">••</td>
                      <td className="p-3 text-right text-tv-yellow font-bold font-number blur-sm select-none opacity-40">••%</td>
                      <td className="p-3 blur-sm select-none opacity-40">
                        <span className="px-2 py-0.5 rounded text-[10px] bg-tv-hover text-tv-text font-bold">••••••••</span>
                      </td>
                      <td className="p-3 text-tv-text blur-sm select-none opacity-40">••••••</td>
                      <td className="p-3 blur-sm select-none opacity-40">
                        <span className="px-2 py-0.5 rounded text-[10px] bg-tv-green/20 text-tv-green font-bold">REKOMENDASI: BUY</span>
                      </td>
                      <td className="p-3 text-tv-text text-[11px] blur-sm select-none opacity-40">••••••••</td>
                      <td className="p-3 blur-sm select-none opacity-40">
                        <span className="px-2 py-0.5 rounded text-[10px] bg-tv-hover text-tv-text font-bold">Positif</span>
                      </td>
                      <td className="p-3 text-right text-white blur-sm select-none opacity-40">Rp •••• / Rp ••••</td>
                      <td className="p-3 text-right text-white blur-sm select-none opacity-40">Rp ••••</td>
                      <td className="p-3 text-right text-tv-text font-number blur-sm select-none opacity-40">±••%/hari</td>
                      <td className="p-3 text-right text-tv-text font-number blur-sm select-none opacity-40">Rp •• T</td>
                      <td className="p-3 text-right text-tv-text font-number">
                        <div className="flex justify-end">
                          <Link
                            onClick={() => trackSignupClick('screener_results')}
                            href="/login?next=%2Fscreener"
                            className="inline-flex items-center gap-1 text-[10px] font-bold text-tv-yellow bg-tv-yellow/10 border border-tv-yellow/40 px-2.5 py-1 rounded-full hover:bg-tv-yellow/20 hover:text-white transition-all shadow-sm whitespace-nowrap"
                          >
                            <Lock className="h-3 w-3" /> Masuk
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}

          {/* Di bawah lg, 16 kolom hanya bisa dicapai lewat gulir horizontal panjang -
              tampilan data utama tidak boleh menuntut itu. Kartu berikut memuat field
              yang sama, dikelompokkan menurut cara membacanya (valuasi, kualitas,
              risiko) alih-alih dijejer dalam satu baris. */}
          {sortedRows.length > 0 && (
            <div className="md:hidden space-y-2">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                <span className="text-[10px] uppercase tracking-wide text-tv-muted shrink-0 mr-1">Urutkan</span>
                {SORTABLE_COLUMNS.filter((c) => c.align === 'right' || c.key === 'ticker').map((col) => (
                  <button
                    key={col.key}
                    type="button"
                    onClick={() => handleSort(col.key)}
                    className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                      sortKey === col.key
                        ? 'border-tv-blue/40 bg-tv-blue/10 text-tv-blue'
                        : 'border-tv-border text-tv-muted hover:text-tv-text'
                    }`}
                  >
                    {col.label}
                    {sortKey === col.key && <span className="ml-1">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                  </button>
                ))}
              </div>

              {visibleRows.map((item: any, idx: number) => {
                const growth = parseFormattedNumber(item.rev_growth_ttm);
                return (
                  <motion.div
                    key={item.ticker}
                    whileTap={{ scale: 0.995 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    className="rounded-lg border border-tv-border bg-tv-bg/40 p-3"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-number text-tv-muted w-4 shrink-0">{idx + 1}</span>
                      <TickerAvatar symbol={item.ticker} size="md" />
                      <div className="min-w-0 flex-1">
                        <Link href={`/technical/${item.ticker}.JK`} className="font-number font-bold text-white hover:text-tv-blue transition-colors">
                          {item.ticker}
                        </Link>
                        <div className="text-[11px] text-tv-muted truncate">{item.name}</div>
                        <div className="text-[10px] text-tv-muted/80 truncate">{item.sector}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-number font-bold text-tv-yellow">
                          {item.entry != null ? `Rp ${item.entry.toLocaleString('id-ID')}` : 'N/A'}
                        </div>
                        <div className="text-[10px] text-tv-muted font-number">
                          {item.atr_pct != null ? `±${item.atr_pct.toFixed(1)}%/hari` : 'volatilitas N/A'}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 border-t sm:grid-cols-4 border-tv-border pt-2.5">
                      {([
                        ['PER', item.per != null ? `${item.per}x` : 'N/A', 'text-white'],
                        ['ROE', item.roe, 'text-tv-accent'],
                        ['DER', item.der, 'text-tv-text'],
                        ['Div', item.div_yield, 'text-tv-yellow'],
                      ] as const).map(([label, value, tone]) => (
                        <div key={label}>
                          <div className="text-[10px] uppercase tracking-wide text-tv-muted">{label}</div>
                          <div className={`font-number text-xs font-bold ${tone}`}>{value ?? 'N/A'}</div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      {item.decision?.advisory === true && item.decision?.action ? (
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          item.decision.action.includes('BUY') ? 'bg-tv-green/20 text-tv-green border border-tv-green/50'
                            : item.decision.action === 'SELL' ? 'bg-tv-red/20 text-tv-red border border-tv-red/50'
                            : 'bg-tv-yellow/10 text-tv-yellow border border-tv-yellow/40'
                        }`}>REKOMENDASI: {item.decision.action}</span>
                      ) : item.signal ? (
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          item.signal.includes('BUY') ? 'bg-tv-green/10 text-tv-green border border-tv-green/30'
                            : item.signal === 'SELL' ? 'bg-tv-red/10 text-tv-red border border-tv-red/30'
                            : 'bg-tv-yellow/10 text-tv-yellow border border-tv-yellow/30'
                        }`} title={item.decision?.explanation || undefined}>
                          {item.signal === 'DATA TIDAK CUKUP' ? 'STATUS MODEL: DATA TIDAK CUKUP' : `SINYAL MODEL: ${item.signal}`} · {item.decision?.reasonCodes?.includes('MODEL_UNVALIDATED') ? 'BELUM VALID' : 'NON-ACTIONABLE'}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] bg-tv-hover text-tv-muted">
                          {item.eligibility_status && item.eligibility_status !== 'ELIGIBLE' ? 'Tidak lolos gerbang' : 'Histori kurang'}
                        </span>
                      )}
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        item.bandarmology === 'Akumulasi' ? 'bg-tv-green/20 text-tv-green border border-tv-green/30'
                          : item.bandarmology === 'Distribusi' ? 'bg-tv-red/20 text-tv-red border border-tv-red/30'
                          : 'bg-tv-hover text-tv-text'
                      }`}>{item.bandarmology}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-number font-bold ${
                        (growth ?? 0) > 0 ? 'bg-tv-green/10 text-tv-green' : (growth ?? 0) < 0 ? 'bg-tv-red/10 text-tv-red' : 'bg-tv-hover text-tv-muted'
                      }`}>Rev {item.rev_growth_ttm}</span>
                    </div>

                    <div className="mt-2 text-[10px] text-tv-muted leading-relaxed">
                      {item.moat}
                      {item.pattern_tag ? ` · ${item.pattern_tag}` : ' · tidak ada pola backtest yang cocok'}
                    </div>
                  </motion.div>
                );
              })}

              {/* Kartu Emiten Terkunci (4 - 10) untuk Tamu di Mobile */}
              {hasLockedGuestRows && Array.from({ length: lockedCount }).map((_, i) => {
                const cardIdx = visibleRows.length + i + 1;
                return (
                  <div
                    key={`locked-card-${cardIdx}`}
                    className="relative rounded-lg border border-tv-border bg-tv-bg/40 p-3 overflow-hidden"
                  >
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-tv-bg/70 backdrop-blur-[3px]">
                      <Link
                        onClick={() => trackSignupClick('screener_results')}
                        href="/login?next=%2Fscreener"
                        className="flex items-center gap-1 text-[11px] font-bold text-tv-yellow bg-tv-yellow/10 border border-tv-yellow/40 px-3 py-1.5 rounded-full hover:bg-tv-yellow/20 hover:text-white transition-all shadow-sm"
                      >
                        <Lock className="h-3.5 w-3.5" /> Masuk
                      </Link>
                    </div>
                    <div className="flex items-center justify-between gap-2 blur-sm select-none opacity-40">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-tv-border flex items-center justify-center text-[10px] leading-none">?</div>
                        <span className="font-bold text-white">••••</span>
                        <span className="text-xs text-tv-muted">PT •••••••••••• Tbk</span>
                      </div>
                      <span className="text-xs font-bold text-tv-muted">#{cardIdx}</span>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 blur-sm select-none opacity-40 text-[11px]">
                      <div>PER: ••.x</div>
                      <div>ROE: ••%</div>
                      <div>Div: ••%</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <p className="text-[10px] text-tv-muted">
            Bandarmology = Chaikin Money Flow (posisi close di range High-Low + rasio volume 20 hari), estimasi tekanan beli/jual - BUKAN data broker/asing resmi (IDX tidak menyediakan feed itu gratis).
          </p>
          <p className="text-[10px] text-tv-muted">
            Signal = skor komposit Teknikal+Fundamental+Flow yang sama dengan Detail Saham/LensRadar (bukan angka terpisah). Pola Backtest = preset filter di menu Backtest yang SAAT INI cocok untuk saham ini (semua indikatornya BULLISH bersamaan) - &ldquo;Tidak ada pola cocok&rdquo; berarti jujur tidak ada, bukan kosong karena error. Sentimen Berita = hasil klasifikasi AI/kata kunci atas judul berita RSS riil yang menyebut saham ini - &ldquo;N/A&rdquo; berarti saham ini tidak disebut media dalam siklus data terakhir, bukan sentimen netral yang terukur.
          </p>
          <p className="text-[10px] text-tv-muted mt-2">
            Volatilitas Harian = rata-rata pergerakan 14 hari terakhir (ATR). Stop loss di bawah
            angka ini akan sering tersentuh oleh fluktuasi biasa - pengujian atas 4.705 sampel
            menunjukkan stop 5% tersentuh di 77% transaksi dan memangkas hampir seluruh
            keuntungan. Tentukan batas risikomu sendiri dengan mempertimbangkan angka ini.
          </p>
        </div>
      </PageContainer>
    </div>
  );
}
