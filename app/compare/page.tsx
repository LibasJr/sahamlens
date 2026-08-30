'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense } from 'react';
import Link from 'next/link';
import { Check, Download, Share2, Target, Search, ArrowRightLeft, Lock } from 'lucide-react';
import { FREE_LIMITS } from '@/shared/constants/limits';
import { MONTHLY_PRICE, formatRupiah } from '@/shared/config/pricing';
import { useAuthUser } from '@/lib/hooks/useAuthUser';
import { trackProductFunnelEvent, trackSignupClick } from '@/shared/analytics/product-funnel';
import PaywallModal from '@/components/PaywallModal';
import SymbolAutocomplete from '@/components/SymbolAutocomplete';
import { ApiErrorHint, Button, Card, PageContainer, Skeleton, EmptyState, LoadingFact, TickerAvatar } from '@/components/ui';
import { useLanguage } from '@/lib/i18n';
import { apiRequest, isApiClientError } from '@/shared/http/api-client';
import MenuUsageGuide from '@/components/MenuUsageGuide';
import { buildCompareCsv } from '@/shared/format/compare-export';

const displayTicker = (s: string) => s.replace('.JK', '').replace('.JK', '');

// Pengunjung tetap dapat mencoba perbandingan dasar. Detail momentum/range dan
// narasi "siapa lebih unggul" adalah alasan utama untuk membuat akun, jadi tidak
// ditampilkan sampai sesi terverifikasi.
const GUEST_VISIBLE_COMPARE_KEYS = new Set(['score', 'ma', 'per', 'pbv']);
const SIMPLE_COMPARE_KEYS = new Set(['score', 'ma', 'per', 'pbv']);

type ShareStatus = 'idle' | 'copied' | 'shared' | 'error';

function CompareGuestTeaser({ nextPath, lockedCount }: { nextPath: string; lockedCount: number }) {
  return (
    <div className="flex flex-col gap-3 border-t border-tv-border bg-tv-bg/60 px-4 py-4 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div className="flex items-start gap-2 text-tv-yellow">
        <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p><strong>{lockedCount} analisis perbandingan lanjutan terkunci.</strong> Masuk untuk melihat indikator, alasan setiap metrik, dan kesimpulan lengkap.</p>
      </div>
      <Link
        href={`/login?next=${encodeURIComponent(nextPath)}`}
        onClick={() => trackSignupClick('compare_analysis')}
        className="shrink-0 self-start rounded-md border border-tv-blue/50 bg-tv-blue/10 px-3 py-2 text-xs font-semibold text-tv-blue transition-colors hover:bg-tv-blue/15 sm:self-auto"
      >
        Masuk untuk membuka
      </Link>
    </div>
  );
}

function CompareContent() {
  const { t, language } = useLanguage();
  const isEn = language === 'en';
  const searchParams = useSearchParams();
  const router = useRouter();
  const { loading: authLoading, resolved: authResolved, user: authUser } = useAuthUser();

  const urlSym1 = searchParams.get('symbol1');
  const urlSym2 = searchParams.get('symbol2');

  // BUG FIX (2026-08-01): symbol1 sebelumnya hardcode 'BBCA.JK' dan symbol2 hardcode
  // 'BBRI.JK' apa pun ticker yang sedang dilihat user di Teknikal/Fundamental/DCF -
  // buka /compare tanpa ?symbol1= selalu jatuh ke BBCA, bukan ticker terakhir dicari.
  // Sekarang ikut pola yang sama dengan /dcf & /fundamental: ?symbol1= dulu, lalu
  // localStorage 'last_searched_ticker' (dipakai bersama lintas halaman analisa),
  // baru default BBCA kalau memang belum pernah cari apa-apa.
  const [symbol1, setSymbol1] = useState(urlSym1 || 'BBCA.JK');
  // symbol2 SENGAJA tidak di-hardcode BBRI - kalau user belum pilih simbol kedua,
  // dikosongkan supaya /api/compare yang pilihkan peer 1 sektor dengan symbol1
  // (lihat pickSameSectorPeer di app/api/compare/route.ts), bukan default bank
  // yang bisa saja beda sektor total dari symbol1.
  const [symbol2, setSymbol2] = useState(urlSym2 || '');

  const [input1, setInput1] = useState(urlSym1 || 'BBCA.JK');
  const [input2, setInput2] = useState(urlSym2 || '');

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [initialRequestReady, setInitialRequestReady] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  // Sebelumnya tidak ada state apa pun untuk kegagalan. Cabang render berakhir dengan
  // `) : null}`, jadi saat fetch gagal atau akses ditolak, seluruh area hasil menjadi
  // kekosongan mutlak di bawah form - tanpa pesan, tanpa tombol, tanpa petunjuk bahwa
  // ada yang salah.
  const [fetchError, setFetchError] = useState(false);
  const [fetchErrorRequestId, setFetchErrorRequestId] = useState<string | null>(null);
  const [gated, setGated] = useState<null | 'login' | 'pro'>(null);
  const [compareMode, setCompareMode] = useState<'simple' | 'advanced'>('simple');
  const [shareStatus, setShareStatus] = useState<ShareStatus>('idle');
  // Effect restore-dari-localStorage (di bawah) dan effect fetch (setelahnya) sama-sama
  // jalan saat mount - fetch pertama berangkat dengan symbol1 default 'BBCA.JK' SEBELUM
  // state ke-update dari localStorage, jadi dua request keluar. Sequence number ini
  // memastikan hanya response dari request TERAKHIR yang dipakai, walau response duluan
  // (BBCA) resolve belakangan karena jitter jaringan.
  const fetchSeqRef = useRef(0);
  const trackedGuestLock = useRef(false);
  const shareStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!urlSym1) {
      const saved = typeof window !== 'undefined' ? localStorage.getItem('last_searched_ticker') : null;
      if (saved) {
        setSymbol1(saved);
        setInput1(saved);
      }
    }
    // Pulihkan ticker terakhir sebelum request pertama. Sebelumnya BBCA dikirim dulu,
    // lalu ticker dari localStorage langsung memicu request kedua.
    setInitialRequestReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!initialRequestReady) return;
    fetchCompare();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol1, symbol2, initialRequestReady]);

  useEffect(() => () => {
    if (shareStatusTimerRef.current) clearTimeout(shareStatusTimerRef.current);
  }, []);

  const fetchCompare = async () => {
    const seq = ++fetchSeqRef.current;
    setLoading(true);
    setFetchError(false);
    setFetchErrorRequestId(null);
    try {
      const qs = `symbol1=${encodeURIComponent(symbol1)}${symbol2 ? `&symbol2=${encodeURIComponent(symbol2)}` : ''}`;
      const json = await apiRequest<any>(`/api/compare?${qs}`);
      if (seq !== fetchSeqRef.current) return; // response basi, sudah ada request lebih baru
      if (!json?.data1 || !json?.data2 || !Array.isArray(json?.rows)) {
        // Server menjawab 200 tapi bentuk payload-nya bukan yang dijanjikan. Di sini ID
        // request justru paling berguna: tidak ada status galat yang bisa dicari di log,
        // hanya satu request tertentu yang perlu ditelusuri.
        setFetchErrorRequestId(typeof json?.meta?.requestId === 'string' ? json.meta.requestId : null);
        setFetchError(true);
        return;
      }

      {
        setGated(null);
        setData(json);
        // Peer sektor otomatis hanya diisi ke kotak input. Menulisnya ke state `symbol2`
        // akan menyalakan effect fetch lagi, sehingga satu halaman menghitung dua kali.
        // Saat user menekan Bandingkan, nilai di input tetap dikirim secara eksplisit.
        if (!symbol2 && json.data2?.symbol) {
          setInput2(json.data2.symbol);
        }
      }
    } catch (e) {
      if (seq === fetchSeqRef.current) {
        console.error(e);
        setFetchErrorRequestId(isApiClientError(e) ? e.requestId : null);
        setFetchError(true);
      }
    } finally {
      if (seq === fetchSeqRef.current) setLoading(false);
    }
  };

  const handleCompare = (e: React.FormEvent) => {
    e.preventDefault();
    const sym1 = input1.trim().toUpperCase();
    const sym2 = input2.trim().toUpperCase();
    // Kotak pertama kosong sebelumnya tetap dikirim sebagai `symbol1=` - permintaan
    // yang pasti gagal, dan (sebelum perbaikan di atas) gagal tanpa jejak di layar.
    if (!sym1) return;
    // setState dengan nilai identik tidak memicu effect. Tombol Bandingkan harus
    // tetap dapat dipakai sebagai retry setelah request sebelumnya gagal.
    const unchanged = sym1 === symbol1 && sym2 === symbol2;
    setSymbol1(sym1);
    setSymbol2(sym2);
    if (unchanged) void fetchCompare();
    if (typeof window !== 'undefined') localStorage.setItem('last_searched_ticker', sym1);
    router.push(`/compare?symbol1=${sym1}&symbol2=${sym2}`);
  };

  // Sampai sesi selesai diperiksa, tampilkan teaser. Ini mencegah detail sempat
  // terlihat saat halaman baru dimuat sebelum /api/auth/me menjawab.
  const lockForGuest = !authResolved || authLoading || !authUser;
  const publicRows = data?.rows?.filter((row: any) => GUEST_VISIBLE_COMPARE_KEYS.has(row.key)) ?? [];
  const lockedRows = data?.rows?.filter((row: any) => !GUEST_VISIBLE_COMPARE_KEYS.has(row.key)) ?? [];
  const simpleRows = data?.rows?.filter((row: any) => SIMPLE_COMPARE_KEYS.has(row.key)) ?? [];
  const visibleRows = lockForGuest ? publicRows : compareMode === 'simple' ? simpleRows : (data?.rows ?? []);
  const compareNextPath = `/compare?symbol1=${encodeURIComponent(symbol1)}&symbol2=${encodeURIComponent(symbol2)}`;

  const showShareStatus = (status: ShareStatus) => {
    setShareStatus(status);
    if (shareStatusTimerRef.current) clearTimeout(shareStatusTimerRef.current);
    shareStatusTimerRef.current = setTimeout(() => setShareStatus('idle'), 2600);
  };

  const copyWithFallback = (text: string): boolean => {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    return copied;
  };

  const shareCompare = async () => {
    if (!data || typeof window === 'undefined') return;
    const shareUrl = new URL('/compare', window.location.origin);
    shareUrl.searchParams.set('symbol1', data.data1.symbol);
    shareUrl.searchParams.set('symbol2', data.data2.symbol);
    const title = `SahamLens Compare: ${displayTicker(data.data1.symbol)} vs ${displayTicker(data.data2.symbol)}`;
    const text = `Lihat perbandingan ${displayTicker(data.data1.symbol)} vs ${displayTicker(data.data2.symbol)} di SahamLens.`;

    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title, text, url: shareUrl.toString() });
        showShareStatus('shared');
        return;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl.toString());
        showShareStatus('copied');
        return;
      }
      showShareStatus(copyWithFallback(shareUrl.toString()) ? 'copied' : 'error');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      try {
        showShareStatus(copyWithFallback(shareUrl.toString()) ? 'copied' : 'error');
      } catch {
        showShareStatus('error');
      }
    }
  };

  const downloadSummary = () => {
    if (!data || typeof window === 'undefined') return;
    const csv = buildCompareCsv({
      symbol1: data.data1.symbol,
      symbol2: data.data2.symbol,
      price1: data.data1.price,
      price2: data.data2.price,
      rows: visibleRows,
      conclusion: data.conclusion ?? null,
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sahamlens-compare-${displayTicker(data.data1.symbol)}-${displayTicker(data.data2.symbol)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (!data || !lockForGuest || !authResolved || authLoading || authUser || trackedGuestLock.current) return;
    trackedGuestLock.current = true;
    trackProductFunnelEvent('locked_view', 'compare_analysis');
  }, [authLoading, authResolved, authUser, data, lockForGuest]);

  return (
    // `flex h-screen` + anak `overflow-y-auto` membuat kontainer gulir kedua di dalam
    // <main> AppShell yang sudah menggulir - dua scrollbar, dan header sticky di
    // dalamnya menempel ke kontainer dalam, bukan viewport. Disamakan dengan halaman lain.
    <div className="flex-1 flex flex-col bg-tv-bg min-h-screen">
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="sticky top-0 z-20 border-b border-white/[0.055] bg-tv-bg/80 px-4 py-4 backdrop-blur-xl md:px-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-md bg-tv-blue text-white">
                <ArrowRightLeft className="w-5 h-5" />
              </div>
              <div>
                <h1 className="lens-page-title">Stock Compare</h1>
                <p className="text-xs text-tv-muted">Head-to-head Fundamental & Technical Analysis</p>
              </div>
            </div>
          </div>
        </header>

        {/* max-w-[1600px] menyamakan lebar dengan Technical/Fundamental. */}
        <PageContainer className="p-4 md:p-6 lg:p-7 space-y-6">
        <MenuUsageGuide
          menuKey="compare"
          whatItAnswers="Dari beberapa saham ini, mana yang paling menarik?"
          steps={[
            "Tambahkan dua saham atau lebih untuk dibandingkan berdampingan.",
            "Tiap baris adalah satu metrik; nilai terbaik disorot otomatis.",
            "Kolom penjelasan memberi tahu kenapa metrik itu penting.",
          ]}
        />

          <Card as="form" onSubmit={handleCompare} padding="none" radius="lg" elevation="none" highlight={false} overflow="visible" className="border-tv-border p-6 shadow-2 flex flex-col sm:flex-row items-center gap-4 justify-center">
            <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto">
              <div className="relative flex-1 min-w-0 sm:flex-initial">
                <Search className="w-5 h-5 text-tv-muted absolute left-3 top-1/2 -translate-y-1/2 z-10" />
                <SymbolAutocomplete
                  value={input1}
                  onChange={(val) => setInput1(val)}
                  className="bg-tv-bg/60 border border-tv-border text-tv-text pl-10 pr-4 py-3 rounded-md focus:outline-none focus:border-tv-blue font-number text-center w-full sm:w-64 font-bold transition-colors"
                  placeholder="Symbol 1 (e.g. BBCA)"
                />
              </div>

              <div className="bg-tv-hover text-tv-muted font-bold px-3 sm:px-4 py-2 rounded-md italic shrink-0">VS</div>

              <div className="relative flex-1 min-w-0 sm:flex-initial">
                <Search className="w-5 h-5 text-tv-muted absolute left-3 top-1/2 -translate-y-1/2 z-10" />
                <SymbolAutocomplete
                  value={input2}
                  onChange={(val) => setInput2(val)}
                  className="bg-tv-bg/60 border border-tv-border text-tv-text pl-10 pr-4 py-3 rounded-md focus:outline-none focus:border-tv-blue font-number text-center w-full sm:w-64 font-bold transition-colors"
                  placeholder="Symbol 2 (e.g. BBRI)"
                />
              </div>
            </div>

            <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full sm:w-auto">
              {!loading && <Target className="w-5 h-5" />}
              Bandingkan
            </Button>
          </Card>

          {loading ? (
            <Card padding="none" radius="lg" elevation="none" overflow="visible" highlight={false} className="border-tv-border shadow-2 p-4 space-y-2">
              <Skeleton className="h-14 w-full" />
              {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
              <LoadingFact className="mt-3" />
            </Card>
          ) : gated === 'login' ? (
            <Card padding="none" radius="lg" elevation="none" overflow="visible" highlight={false} className="border-tv-border shadow-2">
              <EmptyState
                illustration="locked"
                title="Compare Tool butuh akun"
                description="Daftar gratis untuk memakai seluruh fitur selama masa pengujian."
                action={{ label: 'Daftar Gratis', onClick: () => { window.location.href = '/signup'; } }}
              />
            </Card>
          ) : gated === 'pro' ? (
            <Card padding="none" radius="lg" elevation="none" overflow="visible" highlight={false} className="border-tv-border shadow-2">
              <EmptyState
                illustration="locked"
                title="Kuota analisa hari ini sudah habis"
                description={`Kuota gratis ${FREE_LIMITS.analisaPerHari} analisa per hari sudah terpakai. Kuota disetel ulang besok.`}
                action={{ label: 'Lihat Paket Pro', onClick: () => setShowPaywall(true) }}
              />
            </Card>
          ) : fetchError ? (
            <Card padding="none" radius="lg" elevation="none" overflow="visible" highlight={false} className="border-tv-border shadow-2">
              <EmptyState
                illustration="empty"
                title="Perbandingan gagal dimuat"
                description={`Data untuk ${displayTicker(symbol1)}${symbol2 ? ` atau ${displayTicker(symbol2)}` : ''} tidak bisa diambil. Pastikan kode emitennya benar - emiten yang baru tercatat kadang belum punya data pembanding yang cukup.`}
                action={{ label: 'Coba lagi', onClick: fetchCompare }}
              />
              <ApiErrorHint requestId={fetchErrorRequestId} className="justify-center pb-4" />
            </Card>
          ) : data ? (
            <Card padding="none" radius="lg" elevation="none" overflow="hidden" highlight={false} className="border-tv-border shadow-2 overflow-hidden">
              {/* Storytelling: tabel di bawah menandai pemenang per baris, tapi tidak
                  pernah menjumlahkannya. Rekapitulasi ini murni menghitung ulang
                  `row.winner` yang sudah ada - tidak menambah penilaian baru. */}
              {!lockForGuest && (() => {
                const win1 = data.rows.filter((r: any) => r.winner === data.data1.symbol).length;
                const win2 = data.rows.filter((r: any) => r.winner === data.data2.symbol).length;
                const seri = data.rows.length - win1 - win2;
                const leader = win1 > win2 ? data.data1.symbol : win2 > win1 ? data.data2.symbol : null;
                const shareLabel = shareStatus === 'copied'
                  ? 'Link disalin'
                  : shareStatus === 'shared'
                    ? 'Dibagikan'
                    : shareStatus === 'error'
                      ? 'Share gagal'
                      : 'Share';
                return (
                  <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-tv-border bg-tv-bg/60 px-6 py-3.5 text-xs">
                    <div className="flex items-center gap-3">
                      <span className="text-tv-muted">{isEn ? 'Metric Recap:' : 'Rekap metrik:'}</span>
                      <span className={`px-2.5 py-1 rounded-md border text-xs font-bold ${win1 >= win2 ? 'bg-tv-blue/15 border-tv-blue text-tv-blue' : 'bg-tv-card border-tv-border text-tv-text'}`}>
                        {displayTicker(data.data1.symbol)}: <span className="font-number">{win1}</span>
                      </span>
                      <span className="text-tv-muted font-number text-xs">{seri} {isEn ? 'draw' : 'seri'}</span>
                      <span className={`px-2.5 py-1 rounded-md border text-xs font-bold ${win2 >= win1 ? 'bg-tv-blue/15 border-tv-blue text-tv-blue' : 'bg-tv-card border-tv-border text-tv-text'}`}>
                        {displayTicker(data.data2.symbol)}: <span className="font-number">{win2}</span>
                      </span>
                    </div>
                    <span className="text-right text-[11px] text-tv-muted leading-relaxed">
                      {leader
                        ? (isEn ? `${displayTicker(leader)} leads across more metrics overall.` : `${displayTicker(leader)} unggul di lebih banyak metrik perbandingan.`)
                        : (isEn ? 'Both stocks are evenly matched across metrics.' : 'Kedua emiten berimbang di jumlah metrik yang sama.')}
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="inline-flex rounded-md border border-tv-border bg-tv-bg p-0.5">
                        <Button
                          variant="bare"
                          size="none"
                          type="button"
                          onClick={() => setCompareMode('simple')}
                          className={`rounded px-2.5 py-1 text-[11px] font-semibold transition-colors ${compareMode === 'simple' ? 'bg-tv-blue text-white' : 'text-tv-muted hover:text-tv-text'}`}
                        >
                          Ringkas
                        </Button>
                        <Button
                          variant="bare"
                          size="none"
                          type="button"
                          onClick={() => setCompareMode('advanced')}
                          className={`rounded px-2.5 py-1 text-[11px] font-semibold transition-colors ${compareMode === 'advanced' ? 'bg-tv-blue text-white' : 'text-tv-muted hover:text-tv-text'}`}
                        >
                          Lengkap
                        </Button>
                      </div>
                      <Button
                        variant="bare"
                        size="none"
                        type="button"
                        onClick={shareCompare}
                        aria-live="polite"
                        className={`inline-flex min-h-8 items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] transition-colors ${shareStatus === 'error' ? 'border-tv-red/40 text-tv-red' : shareStatus === 'copied' || shareStatus === 'shared' ? 'border-tv-green/40 text-tv-green' : 'border-tv-border text-tv-muted hover:text-tv-text'}`}
                      >
                        {shareStatus === 'copied' || shareStatus === 'shared' ? <Check className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />}
                        {shareLabel}
                      </Button>
                      <Button variant="bare" size="none" type="button" onClick={downloadSummary} className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-tv-border px-2.5 py-1 text-[11px] text-tv-muted hover:text-tv-text">
                        <Download className="h-3.5 w-3.5" />
                        Export CSV
                      </Button>
                    </div>
                  </div>
                );
              })()}

              {/* Tabel 4 kolom dengan satu kolom penjelasan panjang tidak terbaca di
                  lebar ponsel; di bawah lg dipakai daftar kartu dengan isi yang sama. */}
              <div className="lens-table-sticky-col [--lens-sticky-head-bg:rgb(var(--lens-bg))] hidden lg:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-tv-bg border-b border-tv-border">
                      <th className="py-4 px-6 text-tv-muted text-sm font-normal uppercase tracking-wide w-1/5">Metric</th>
                      <th className="py-4 px-6 text-xl text-center border-l border-tv-border text-tv-text font-bold font-number">
                        <span className="inline-flex items-center gap-2">
                          <TickerAvatar symbol={data.data1.symbol} size="sm" />
                          {data.data1.symbol}
                        </span>
                      </th>
                      <th className="py-4 px-6 text-xl text-center border-l border-tv-border text-tv-text font-bold font-number">
                        <span className="inline-flex items-center gap-2">
                          <TickerAvatar symbol={data.data2.symbol} size="sm" />
                          {data.data2.symbol}
                        </span>
                      </th>
                      {!lockForGuest && <th className="py-4 px-6 text-tv-blue text-sm font-bold uppercase tracking-wide text-center border-l border-tv-border w-1/3">Penjelasan Metrik</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-tv-border">
                    <tr className="hover:bg-tv-hover/30 transition-colors">
                      <td className="py-4 px-6 text-tv-muted">Harga Terakhir</td>
                      {/* `data.priceX.toLocaleString()` tanpa penjaga akan melempar
                          TypeError kalau harganya null - dan galat saat render
                          mengosongkan SELURUH halaman, bukan cuma sel ini. */}
                      <td className="py-4 px-6 text-center text-tv-text font-bold border-l border-tv-border font-number">
                        {typeof data.data1.price === 'number' ? `Rp ${data.data1.price.toLocaleString('id-ID')}` : 'N/A'}
                      </td>
                      <td className="py-4 px-6 text-center text-tv-text font-bold border-l border-tv-border font-number">
                        {typeof data.data2.price === 'number' ? `Rp ${data.data2.price.toLocaleString('id-ID')}` : 'N/A'}
                      </td>
                      {/* Sel ini dulu berisi "-" polos. Harga tidak dibandingkan karena
                          memang tidak bisa: harga saham antar emiten tidak sebanding
                          tanpa jumlah lembar saham. Itu yang perlu dikatakan. */}
                      {!lockForGuest && (
                        <td className="py-4 px-6 text-tv-muted border-l border-tv-border text-[11px] leading-relaxed">
                          Tidak dibandingkan - harga per lembar antar emiten tidak sebanding tanpa memperhitungkan jumlah saham beredar.
                        </td>
                      )}
                    </tr>
                    {visibleRows.map((row: any) => (
                      <tr key={row.key} className="hover:bg-tv-hover/30 transition-colors align-top">
                        <td className="py-4 px-6 text-tv-muted">{row.label}</td>
                        <td className={`py-4 px-6 text-center border-l border-tv-border ${row.winner === data.data1.symbol ? 'text-tv-blue font-bold' : 'text-tv-text'}`}>{row.a}</td>
                        <td className={`py-4 px-6 text-center border-l border-tv-border ${row.winner === data.data2.symbol ? 'text-tv-blue font-bold' : 'text-tv-text'}`}>{row.b}</td>
                        {!lockForGuest && (
                          <td className="py-3 px-6 border-l border-tv-border text-left">
                            {row.winner !== '-' && (
                              <span className="inline-block mb-1 text-tv-blue font-bold bg-tv-blue/10 px-2 py-0.5 rounded text-[10px]">{row.winner} unggul</span>
                            )}
                            <p className="font-sans text-[11px] text-tv-muted leading-relaxed">{row.reason}</p>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="lg:hidden divide-y divide-tv-border">
                <div className="flex items-center justify-around gap-2 bg-tv-bg px-4 py-3">
                  {[data.data1, data.data2].map((d: any) => (
                    <div key={d.symbol} className="flex flex-col items-center gap-1">
                      <TickerAvatar symbol={d.symbol} size="md" />
                      <span className="font-number font-bold text-tv-text">{displayTicker(d.symbol)}</span>
                      <span className="font-number text-[11px] text-tv-muted">
                        {typeof d.price === 'number' ? `Rp ${d.price.toLocaleString('id-ID')}` : 'N/A'}
                      </span>
                    </div>
                  ))}
                </div>
                {visibleRows.map((row: any) => (
                  <div key={row.key} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] uppercase tracking-wide text-tv-muted">{row.label}</span>
                      {row.winner !== '-' && (
                        <span className="text-tv-blue font-bold bg-tv-blue/10 px-2 py-0.5 rounded text-[10px] shrink-0">{displayTicker(row.winner)} unggul</span>
                      )}
                    </div>
                    <div className="mt-1.5 grid grid-cols-2 gap-2">
                      <div className={`rounded-md px-2.5 py-1.5 text-center text-sm ${row.winner === data.data1.symbol ? 'bg-tv-blue/10 text-tv-blue font-bold' : 'bg-tv-bg/60 text-tv-text'}`}>{row.a}</div>
                      <div className={`rounded-md px-2.5 py-1.5 text-center text-sm ${row.winner === data.data2.symbol ? 'bg-tv-blue/10 text-tv-blue font-bold' : 'bg-tv-bg/60 text-tv-text'}`}>{row.b}</div>
                    </div>
                    {!lockForGuest && <p className="mt-1.5 font-sans text-[11px] text-tv-muted leading-relaxed">{row.reason}</p>}
                  </div>
                ))}
              </div>

              {lockForGuest && <CompareGuestTeaser nextPath={compareNextPath} lockedCount={lockedRows.length} />}

              {!lockForGuest && data.conclusion && (
                <div className="p-6 bg-tv-bg border-t border-tv-border font-sans">
                  <h3 className="font-heading text-sm font-bold text-tv-muted mb-2 uppercase tracking-wide">Kesimpulan Perbandingan</h3>
                  <p className="font-sans text-sm font-normal text-tv-text leading-relaxed sm:text-base">
                    {data.conclusion}
                  </p>
                </div>
              )}
            </Card>
          ) : null}

        </PageContainer>
      </div>
      {/* Blok <style> .custom-scrollbar dihapus bersama kontainer gulirnya - warnanya
          hex palet lama, dan scrollbar global sudah ditata di app/globals.css. */}
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
    </div>
  );
}

// BUG FIX (2026-08-22): fallback sebelumnya sudah diperbaiki dari `<div>Loading...</div>`
// telanjang ke `<div>` polos ber-kelas latar - tapi itu masih blank tanpa indikator
// visual apa pun. CompareContent sendiri sudah punya skeleton ketat (lihat blok
// `loading ?` di atas); fallback ini memakai bentuk skeleton yang sama supaya transisi
// blank->skeleton->konten tidak pernah terjadi, konsisten dengan prinsip "jangan pernah
// blank" yang dipegang di tempat lain pada halaman ini.
function CompareSuspenseFallback() {
  return (
    <div className="flex-1 bg-tv-bg min-h-screen p-4 md:p-6">
      <Card padding="none" radius="lg" elevation="none" overflow="visible" highlight={false} className="border-tv-border shadow-2 p-4 space-y-2">
        <Skeleton className="h-14 w-full" />
        {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
      </Card>
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={<CompareSuspenseFallback />}>
      <CompareContent />
    </Suspense>
  );
}
