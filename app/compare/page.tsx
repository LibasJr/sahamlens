'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Target, Search, ArrowRightLeft, Lock } from 'lucide-react';
import { FREE_LIMITS } from '@/shared/constants/limits';
import { MONTHLY_PRICE, formatRupiah } from '@/shared/config/pricing';
import { shouldShowLoginPromptFor401 } from '@/lib/auth-gate';
import { useAuthUser } from '@/lib/hooks/useAuthUser';
import { trackProductFunnelEvent, trackSignupClick } from '@/shared/analytics/product-funnel';
import PaywallModal from '@/components/PaywallModal';
import SymbolAutocomplete from '@/components/SymbolAutocomplete';
import { Button, PageContainer, Skeleton, EmptyState, LoadingFact, TickerAvatar, Badge } from '@/components/ui';
import { useLanguage } from '@/lib/i18n';

const displayTicker = (s: string) => s.replace('.JK', '').replace('.JK', '');

// Pengunjung tetap dapat mencoba perbandingan dasar. Detail momentum/range dan
// narasi "siapa lebih unggul" adalah alasan utama untuk membuat akun, jadi tidak
// ditampilkan sampai sesi terverifikasi.
const GUEST_VISIBLE_COMPARE_KEYS = new Set(['score', 'ma', 'per', 'pbv']);

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
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  // Sebelumnya tidak ada state apa pun untuk kegagalan. Cabang render berakhir dengan
  // `) : null}`, jadi saat fetch gagal atau akses ditolak, seluruh area hasil menjadi
  // kekosongan mutlak di bawah form - tanpa pesan, tanpa tombol, tanpa petunjuk bahwa
  // ada yang salah.
  const [fetchError, setFetchError] = useState(false);
  const [gated, setGated] = useState<null | 'login' | 'pro'>(null);
  // Effect restore-dari-localStorage (di bawah) dan effect fetch (setelahnya) sama-sama
  // jalan saat mount - fetch pertama berangkat dengan symbol1 default 'BBCA.JK' SEBELUM
  // state ke-update dari localStorage, jadi dua request keluar. Sequence number ini
  // memastikan hanya response dari request TERAKHIR yang dipakai, walau response duluan
  // (BBCA) resolve belakangan karena jitter jaringan.
  const fetchSeqRef = useRef(0);
  const trackedGuestLock = useRef(false);

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

  const fetchCompare = async () => {
    const seq = ++fetchSeqRef.current;
    setLoading(true);
    setFetchError(false);
    try {
      const qs = `symbol1=${encodeURIComponent(symbol1)}${symbol2 ? `&symbol2=${encodeURIComponent(symbol2)}` : ''}`;
      const res = await fetch(`/api/compare?${qs}`);
      const json = await res.json();

      if (seq !== fetchSeqRef.current) return; // response basi, sudah ada request lebih baru

      if (res.status === 401) {
        if (await shouldShowLoginPromptFor401()) {
          setGated('login');
          setShowLoginPrompt(true);
        } else {
          setFetchError(true);
        }
        return;
      }
      if (res.status === 402 || res.status === 403 || json.code === 'SUBSCRIPTION_REQUIRED') {
        setGated('pro');
        setShowPaywall(true);
        return;
      }

      // Bentuk respons ikut divalidasi, bukan cuma status: seluruh tabel di bawah
      // membaca data1/data2/rows tanpa pengaman, jadi respons 200 yang tidak lengkap
      // akan melempar TypeError saat render dan mengosongkan halaman.
      if (!res.ok || !json?.data1 || !json?.data2 || !Array.isArray(json?.rows)) {
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
      if (seq === fetchSeqRef.current) { console.error(e); setFetchError(true); }
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
  const visibleRows = lockForGuest ? publicRows : (data?.rows ?? []);
  const compareNextPath = `/compare?symbol1=${encodeURIComponent(symbol1)}&symbol2=${encodeURIComponent(symbol2)}`;

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

          <form onSubmit={handleCompare} className="bg-tv-card border border-tv-border rounded-lg p-6 shadow-2 flex flex-col sm:flex-row items-center gap-4 justify-center">
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
          </form>

          {loading ? (
            <div className="bg-tv-card border border-tv-border rounded-lg shadow-2 p-4 space-y-2">
              <Skeleton className="h-14 w-full" />
              {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
              <LoadingFact className="mt-3" />
            </div>
          ) : gated === 'login' ? (
            <div className="bg-tv-card border border-tv-border rounded-lg shadow-2">
              <EmptyState
                illustration="locked"
                title="Compare Tool butuh akun"
                description="Daftar gratis untuk memakai seluruh fitur selama masa pengujian."
                action={{ label: 'Daftar Gratis', onClick: () => { window.location.href = '/signup'; } }}
              />
            </div>
          ) : gated === 'pro' ? (
            <div className="bg-tv-card border border-tv-border rounded-lg shadow-2">
              <EmptyState
                illustration="locked"
                title="Kuota analisa hari ini sudah habis"
                description={`Kuota gratis ${FREE_LIMITS.analisaPerHari} analisa per hari sudah terpakai. Kuota disetel ulang besok.`}
                action={{ label: 'Lihat Paket Pro', onClick: () => setShowPaywall(true) }}
              />
            </div>
          ) : fetchError ? (
            <div className="bg-tv-card border border-tv-border rounded-lg shadow-2">
              <EmptyState
                illustration="empty"
                title="Perbandingan gagal dimuat"
                description={`Data untuk ${displayTicker(symbol1)}${symbol2 ? ` atau ${displayTicker(symbol2)}` : ''} tidak bisa diambil. Pastikan kode emitennya benar - emiten yang baru tercatat kadang belum punya data pembanding yang cukup.`}
                action={{ label: 'Coba lagi', onClick: fetchCompare }}
              />
            </div>
          ) : data ? (
            <div className="bg-tv-card border border-tv-border rounded-lg shadow-2 overflow-hidden">
              {/* Storytelling: tabel di bawah menandai pemenang per baris, tapi tidak
                  pernah menjumlahkannya. Rekapitulasi ini murni menghitung ulang
                  `row.winner` yang sudah ada - tidak menambah penilaian baru. */}
              {!lockForGuest && (() => {
                const win1 = data.rows.filter((r: any) => r.winner === data.data1.symbol).length;
                const win2 = data.rows.filter((r: any) => r.winner === data.data2.symbol).length;
                const seri = data.rows.length - win1 - win2;
                const leader = win1 > win2 ? data.data1.symbol : win2 > win1 ? data.data2.symbol : null;
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
                  <motion.div key={row.key} whileTap={{ scale: 0.995 }} transition={{ type: 'spring', stiffness: 400, damping: 30 }} className="px-4 py-3">
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
                  </motion.div>
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
            </div>
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
      <PaywallModal
        open={showLoginPrompt}
        onClose={() => setShowLoginPrompt(false)}
        title="Daftar Dulu untuk Lihat Hasil"
        body="Compare Tool butuh akun gratis. Daftar untuk memakai fitur selama masa pengujian."
        ctaHref="/signup"
        ctaLabel="Daftar Gratis"
        secondaryLabel="Nanti"
      />
    </div>
  );
}

export default function ComparePage() {
  return (
    // Fallback sebelumnya `<div>Loading...</div>` polos tanpa kelas apa pun - teks
    // telanjang di atas latar body, tanpa struktur halaman sama sekali.
    <Suspense fallback={<div className="flex-1 bg-tv-bg min-h-screen" />}>
      <CompareContent />
    </Suspense>
  );
}
