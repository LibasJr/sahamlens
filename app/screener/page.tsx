'use client';

import { apiRequest, isApiClientError } from '@/shared/http/api-client';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import { PageContainer } from '@/components/ui';
import { useAuthUser } from '@/lib/hooks/useAuthUser';
import { trackProductFunnelEvent } from '@/shared/analytics/product-funnel';

import ScreenerControls from '@/components/screener/ScreenerControls';
import ScreenerResults from '@/components/screener/ScreenerResults';
import {
  GUEST_VISIBLE_RESULT_COUNT,
  SORTABLE_COLUMNS,
  TEMPLATES_STORAGE_KEY,
  compareValues,
  loadTemplates,
  type ColumnKey,
  type ScreenerTemplate,
} from '@/components/screener/screener-model';

// Konstanta modul, bukan `|| []` inline: literal baru tiap render mengubah identitas
// dependensi useMemo di bawah, jadi memo-nya tidak pernah benar-benar memo (dan eslint
// react-hooks/exhaustive-deps memperingatkannya).
const EMPTY_ROWS: any[] = [];

export default function ScreenerPage() {
  const router = useRouter();
  const { loading: authLoading, resolved: authResolved, user } = useAuthUser();
  const [riskProfile, setRiskProfile] = useState<'Konservatif' | 'Moderat' | 'Agresif'>('Moderat');
  const [sectorFilter, setSectorFilter] = useState('');
  const [maxPriceInput, setMaxPriceInput] = useState('');
  const [minMarketCapInput, setMinMarketCapInput] = useState(''); // unit: Triliun
  const [minLiquidityInput, setMinLiquidityInput] = useState(''); // unit: Miliar
  // true sejak awal, BUKAN false. Pemindaian pertama ada di balik debounce 500ms, jadi
  // dengan nilai awal false halaman sempat menyatakan "Pemindaian berjalan normal dan
  // hasilnya nihil" selama setengah detik sebelum satu request pun dikirim - klaim
  // tentang pemindaian yang belum terjadi, persis keadaan yang dijaga komentar di bawah.
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  // Daftar sektor dipisah dari `data` supaya kegagalan fetch (yang men-set data=null)
  // tidak ikut mengosongkan dropdown. Kalau ikut kosong, <select> terkontrol yang
  // value-nya masih "Keuangan" tampil sebagai "Semua Sektor" sementara tombol Coba Lagi
  // tetap mengirim filter yang sudah tidak terlihat itu - UI berhenti mencerminkan state.
  const [availableSectors, setAvailableSectors] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<ColumnKey | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  // Kegagalan fetch sebelumnya hanya menghasilkan setData(null), yang membuat tabel
  // menampilkan "Tidak ada saham yang memenuhi kriteria saat ini" - klaim bahwa
  // pemindaian sudah berjalan dan hasilnya nihil. Dua keadaan berbeda, satu pesan.
  const [loadError, setLoadError] = useState(false);
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
  // Pesannya menjelaskan APA yang gagal; ID ini yang membuat kegagalan itu bisa
  // dicari di log server. Tanpa ID, laporan pengguna berhenti di "screener error".
  const [loadErrorRequestId, setLoadErrorRequestId] = useState<string | null>(null);
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

  const runScreener = useCallback(async (
    profile: string, sector: string, maxPrice: string, minMarketCapTriliun: string, minLiquidityMiliar: string,
    signal?: AbortSignal,
  ) => {
    setLoading(true);
    setLoadError(false);
    setLoadErrorMessage(null);
    setLoadErrorRequestId(null);
    try {
      const params = new URLSearchParams({ profile });
      if (sector) params.set('sector', sector);
      // Cuma dikirim kalau benar-benar angka positif - backend sudah fail-open untuk
      // nilai tidak valid, tapi tidak perlu mengirim parameter kosong/rusak sama sekali.
      const parsedPrice = Number(maxPrice);
      if (maxPrice && Number.isFinite(parsedPrice) && parsedPrice > 0) params.set('maxPrice', String(parsedPrice));
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

      const json = await apiRequest<any>('/api/screener?' + params.toString(), { signal });
      setData(json);
      // Hanya ditimpa saat sukses. Sektor yang tersedia tidak berubah karena satu
      // request gagal, jadi daftar terakhir yang benar tetap dipertahankan.
      if (Array.isArray(json?.availableSectors)) setAvailableSectors(json.availableSectors);
    } catch (e) {
      // Request yang sengaja dibatalkan (filter/profil diganti sebelum yang lama selesai)
      // BUKAN kegagalan - menampilkannya sebagai error akan membuat pengalih filter
      // yang cepat terlihat seperti server bermasalah.
      if (signal?.aborted || (e instanceof DOMException && e.name === 'AbortError')) return;
      console.error(e);
      setLoadError(true);
      setLoadErrorMessage(isApiClientError(e) ? e.message : null);
      setLoadErrorRequestId(isApiClientError(e) ? e.requestId : null);
      setData(null);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  // BARU (2026-08-14) - filter sektor & harga MAKS ikut memicu pemindaian ulang,
  // di-debounce 500ms supaya mengetik angka harga tidak mengirim satu request per
  // digit (endpoint ini punya compute budget server-side, lihat app/api/screener/
  // route.ts - debounce ini murni mengurangi request percuma, bukan pengaman utama).
  //
  // clearTimeout saja TIDAK cukup: ia membatalkan debounce yang belum berangkat, bukan
  // request yang sudah terbang. Saat cache dingin satu request bisa berjalan puluhan
  // detik, jadi request lama bisa selesai SESUDAH request baru dan menimpa hasilnya -
  // baris profil Agresif tampil di bawah judul "Profil Moderat". AbortController
  // menutup celah itu.
  useEffect(() => {
    const controller = new AbortController();
    const t = setTimeout(() => {
      runScreener(riskProfile, sectorFilter, maxPriceInput, minMarketCapInput, minLiquidityInput, controller.signal);
    }, 500);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [riskProfile, sectorFilter, maxPriceInput, minMarketCapInput, minLiquidityInput, runScreener]);

  const top10: any[] = data?.analysis?.top_10_stocks ?? EMPTY_ROWS;
  const isConfirmedGuest = authResolved && !authLoading && !user;
  const isGuestLimited = Boolean(data?.analysis?.is_guest_limited ?? isConfirmedGuest);
  // ?? 0, BUKAN ?? 8. Angka 8 adalah nilai karangan: saat data masih null (debounce awal)
  // atau saat request gagal, spanduk tetap menyatakan "8 emiten lanjutan terkunci" -
  // jumlah yang tidak pernah dihitung siapa pun - tepat di atas panel "gagal dimuat",
  // dan ikut memicu event funnel locked_view untuk tampilan tanpa satu baris terkunci pun.
  const lockedCount = isGuestLimited ? (data?.analysis?.locked_count ?? 0) : 0;
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
        <ScreenerControls
          availableSectors={availableSectors}
          momentumScored={data?.momentumScored !== false}
          riskProfile={riskProfile}
          setRiskProfile={setRiskProfile}
          sectorFilter={sectorFilter}
          setSectorFilter={setSectorFilter}
          maxPriceInput={maxPriceInput}
          setMaxPriceInput={setMaxPriceInput}
          minMarketCapInput={minMarketCapInput}
          setMinMarketCapInput={setMinMarketCapInput}
          minLiquidityInput={minLiquidityInput}
          setMinLiquidityInput={setMinLiquidityInput}
          isConfirmedGuest={isConfirmedGuest}
          sortedRowCount={sortedRows.length}
          exportCsv={exportCsv}
          templates={templates}
          templateNameDraft={templateNameDraft}
          setTemplateNameDraft={setTemplateNameDraft}
          showSaveTemplate={showSaveTemplate}
          setShowSaveTemplate={setShowSaveTemplate}
          saveCurrentAsTemplate={saveCurrentAsTemplate}
          applyTemplate={applyTemplate}
          deleteTemplate={deleteTemplate}
        />

        <ScreenerResults
          data={data}
          riskProfile={riskProfile}
          loading={loading}
          loadError={loadError}
          loadErrorMessage={loadErrorMessage}
          loadErrorRequestId={loadErrorRequestId}
          sortedRows={sortedRows}
          visibleRows={visibleRows}
          hasLockedGuestRows={hasLockedGuestRows}
          lockedCount={lockedCount}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
          onRetry={() => runScreener(riskProfile, sectorFilter, maxPriceInput, minMarketCapInput, minLiquidityInput)}
        />
      </PageContainer>
    </div>
  );
}
