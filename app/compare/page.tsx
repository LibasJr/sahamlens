'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense } from 'react';
import { motion } from 'framer-motion';
import { Target, Search, ArrowRightLeft, Menu } from 'lucide-react';
import { getUsedSymbolsToday, FREE_LIMITS } from '@/lib/limits';
import PaywallModal from '@/components/PaywallModal';
import SymbolAutocomplete from '@/components/SymbolAutocomplete';
import { Button, PageContainer, Skeleton, EmptyState, LoadingFact, TickerAvatar } from '@/components/ui';

const displayTicker = (s: string) => s.replace('.JK', '').replace('.JK', '');

function CompareContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

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
  const [showPaywall, setShowPaywall] = useState(false);
  const [usedSymbolsToday, setUsedSymbolsToday] = useState<string[]>([]);
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

  useEffect(() => {
    if (!urlSym1) {
      const saved = typeof window !== 'undefined' ? localStorage.getItem('last_searched_ticker') : null;
      if (saved) {
        setSymbol1(saved);
        setInput1(saved);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchCompare();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol1, symbol2]);

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
        setGated('login');
        setShowLoginPrompt(true);
        return;
      }
      if (res.status === 402 || res.status === 403 || json.code === 'SUBSCRIPTION_REQUIRED') {
        setGated('pro');
        setUsedSymbolsToday(getUsedSymbolsToday());
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
        // symbol2 mungkin dipilihkan otomatis oleh server (peer 1 sektor) - sinkronkan
        // balik ke state/input supaya kotak kedua tidak kosong dan klik "Bandingkan"
        // berikutnya tidak diam-diam ganti peer lagi.
        if (!symbol2 && json.data2?.symbol) {
          setSymbol2(json.data2.symbol);
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
    setSymbol1(sym1);
    setSymbol2(sym2);
    if (typeof window !== 'undefined') localStorage.setItem('last_searched_ticker', sym1);
    router.push(`/compare?symbol1=${sym1}&symbol2=${sym2}`);
  };

  return (
    // `flex h-screen` + anak `overflow-y-auto` membuat kontainer gulir kedua di dalam
    // <main> AppShell yang sudah menggulir - dua scrollbar, dan header sticky di
    // dalamnya menempel ke kontainer dalam, bukan viewport. Disamakan dengan halaman lain.
    <div className="flex-1 flex flex-col bg-tv-bg min-h-screen">
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-tv-surface border-b border-tv-border px-6 py-4 sticky top-0 z-20 shadow-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => window.dispatchEvent(new Event('toggle-sidebar'))}
                className="md:hidden p-2 -ml-2 text-tv-muted hover:text-white rounded-lg hover:bg-white/5"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div className="p-2 rounded-md bg-tv-blue text-white">
                <ArrowRightLeft className="w-5 h-5" />
              </div>
              <div>
                <h1 className="font-heading font-bold text-xl text-tv-text tracking-tight">Stock Compare</h1>
                <p className="text-xs text-tv-muted">Head-to-head Fundamental & Technical Analysis</p>
              </div>
            </div>
          </div>
        </header>

        {/* max-w-[1600px] menyamakan lebar dengan Technical/Fundamental. */}
        <PageContainer className="p-6 space-y-6">

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
                description="Daftar gratis - dapat trial 7 hari akses penuh sebelum diminta upgrade."
                action={{ label: 'Daftar Gratis', onClick: () => { window.location.href = '/signup'; } }}
              />
            </div>
          ) : gated === 'pro' ? (
            <div className="bg-tv-card border border-tv-border rounded-lg shadow-2">
              <EmptyState
                illustration="locked"
                title="Kuota analisa hari ini sudah habis"
                description={`Kuota gratis ${FREE_LIMITS.analisaPerHari} analisa per hari sudah terpakai${usedSymbolsToday.length ? ` untuk ${usedSymbolsToday.slice(0, 3).map(displayTicker).join(', ')}` : ''}. Kuota disetel ulang besok.`}
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
              {(() => {
                const win1 = data.rows.filter((r: any) => r.winner === data.data1.symbol).length;
                const win2 = data.rows.filter((r: any) => r.winner === data.data2.symbol).length;
                const seri = data.rows.length - win1 - win2;
                const leader = win1 > win2 ? data.data1.symbol : win2 > win1 ? data.data2.symbol : null;
                return (
                  <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-b border-tv-border bg-tv-bg/60 px-6 py-3 text-xs">
                    <span className="text-tv-muted">Rekap metrik:</span>
                    <span className={win1 >= win2 ? 'text-tv-blue font-bold' : 'text-tv-text'}>
                      {displayTicker(data.data1.symbol)} <span className="font-number">{win1}</span>
                    </span>
                    <span className="text-tv-muted font-number">{seri} seri</span>
                    <span className={win2 >= win1 ? 'text-tv-blue font-bold' : 'text-tv-text'}>
                      {displayTicker(data.data2.symbol)} <span className="font-number">{win2}</span>
                    </span>
                    <span className="w-full text-center text-[11px] text-tv-muted leading-relaxed sm:w-auto sm:text-left">
                      {leader
                        ? `${displayTicker(leader)} unggul di lebih banyak metrik - tapi jumlah kemenangan memperlakukan semua metrik sama berat, padahal tidak.`
                        : 'Kedua emiten unggul di jumlah metrik yang sama - keputusannya bergantung metrik mana yang paling kamu utamakan.'}
                    </span>
                  </div>
                );
              })()}

              {/* Tabel 4 kolom dengan satu kolom penjelasan panjang tidak terbaca di
                  lebar ponsel; di bawah lg dipakai daftar kartu dengan isi yang sama. */}
              <div className="hidden lg:block overflow-x-auto">
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
                      <th className="py-4 px-6 text-tv-blue text-sm font-bold uppercase tracking-wide text-center border-l border-tv-border w-1/3">Penjelasan LensAI</th>
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
                      <td className="py-4 px-6 text-tv-muted border-l border-tv-border text-[11px] leading-relaxed">
                        Tidak dibandingkan - harga per lembar antar emiten tidak sebanding tanpa memperhitungkan jumlah saham beredar.
                      </td>
                    </tr>
                    {data.rows.map((row: any) => (
                      <tr key={row.key} className="hover:bg-tv-hover/30 transition-colors align-top">
                        <td className="py-4 px-6 text-tv-muted">{row.label}</td>
                        <td className={`py-4 px-6 text-center border-l border-tv-border ${row.winner === data.data1.symbol ? 'text-tv-blue font-bold' : 'text-tv-text'}`}>{row.a}</td>
                        <td className={`py-4 px-6 text-center border-l border-tv-border ${row.winner === data.data2.symbol ? 'text-tv-blue font-bold' : 'text-tv-text'}`}>{row.b}</td>
                        <td className="py-3 px-6 border-l border-tv-border text-left">
                          {row.winner !== '-' && (
                            <span className="inline-block mb-1 text-tv-blue font-bold bg-tv-blue/10 px-2 py-0.5 rounded text-[10px]">{row.winner} unggul</span>
                          )}
                          <p className="text-[11px] text-tv-muted leading-relaxed">{row.reason}</p>
                        </td>
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
                {data.rows.map((row: any) => (
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
                    <p className="mt-1.5 text-[11px] text-tv-muted leading-relaxed">{row.reason}</p>
                  </motion.div>
                ))}
              </div>

              {data.conclusion && (
                <div className="p-6 bg-tv-bg border-t border-tv-border">
                  <h3 className="font-heading text-sm font-bold text-tv-muted mb-2 uppercase tracking-wide">Kesimpulan LensAI</h3>
                  <p className="text-base text-tv-text leading-relaxed">
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
        title="Daftar Dulu untuk Lihat Hasil"
        body="Compare Tool butuh akun (gratis) - daftar sekarang, dapat trial 7 hari akses penuh sebelum diminta upgrade."
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
