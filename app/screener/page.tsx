'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import Header from '@/components/Header';
import { Sliders, Award, ArrowUpDown } from 'lucide-react';
import { PageContainer, Skeleton, EmptyState, LoadingFact, TickerAvatar } from '@/components/ui';

type ColumnKey = 'ticker' | 'name' | 'sector' | 'per' | 'rev_growth_ttm' | 'roe' | 'der'
  | 'div_yield' | 'bandarmology' | 'moat' | 'signal' | 'pattern_tag' | 'sentiment'
  | 'week52_high' | 'entry' | 'atr_pct';

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

export default function ScreenerPage() {
  const router = useRouter();
  const [riskProfile, setRiskProfile] = useState<'Konservatif' | 'Moderat' | 'Agresif'>('Moderat');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [sortKey, setSortKey] = useState<ColumnKey | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  // Kegagalan fetch sebelumnya hanya menghasilkan setData(null), yang membuat tabel
  // menampilkan "Tidak ada saham yang memenuhi kriteria saat ini" - klaim bahwa
  // pemindaian sudah berjalan dan hasilnya nihil. Dua keadaan berbeda, satu pesan.
  const [loadError, setLoadError] = useState(false);

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

  const runScreener = useCallback(async (profile: string) => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await fetch('/api/screener?profile=' + encodeURIComponent(profile));
      const json = await res.json();
      if (!res.ok || json?.error) {
        setLoadError(true);
        setData(null);
        return;
      }
      setData(json);
    } catch (e) {
      console.error(e);
      setLoadError(true);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    runScreener(riskProfile);
  }, [riskProfile, runScreener]);

  const top10 = data?.analysis?.top_10_stocks || [];

  const sortedRows = useMemo(() => {
    if (!sortKey) return top10;
    const col = SORTABLE_COLUMNS.find((c) => c.key === sortKey)!;
    return [...top10].sort((a: any, b: any) => compareValues(col.getValue(a), col.getValue(b), sortDir));
  }, [top10, sortKey, sortDir]);

  return (
    <div className="flex-1 flex flex-col bg-tv-bg min-h-screen">
      <Header
        currentTicker=""
        onTickerChange={(t) => router.push(`/technical/${t.replace('.JK', '')}.JK`)}
        moduleTitle="LensScanner — Filter Saham Multi-Faktor"
        moduleBank="LENSSCANNER"
      />

      <PageContainer className="p-6 space-y-6">
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
              <h1 className="font-heading text-xl font-bold text-white tracking-tight">Seleksi Profil Risiko Investor</h1>
              {/* font-mono dilepas: aturan tipografi di app/globals.css menyebut
                  font-mono HANYA untuk data tabular/kode, bukan kalimat. */}
              <p className="text-xs text-tv-muted">
                Pilih toleransi risiko untuk memfilter 10 Saham IDX terbaik berdasarkan penilaian kuantitatif LensAI.
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
              description="Permintaan ke server tidak sampai, jadi belum diketahui saham mana yang lolos untuk profil ini. Ini bukan berarti tidak ada yang memenuhi kriteria."
              action={{ label: 'Coba lagi', onClick: () => runScreener(riskProfile) }}
            />
          )}

          {!loading && !loadError && sortedRows.length === 0 && (
            <EmptyState
              illustration="search"
              title={`Tidak ada saham yang lolos profil ${riskProfile}`}
              description="Pemindaian berjalan normal dan hasilnya nihil untuk bobot profil ini. Coba profil risiko lain - bobot yang berbeda memunculkan kandidat yang berbeda."
            />
          )}

          {sortedRows.length > 0 && (
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-left text-xs font-mono border-collapse">
              <thead>
                <tr className="border-b border-tv-border bg-tv-bg text-tv-muted uppercase text-[10px]">
                  <th className="p-3">#</th>
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
                {sortedRows.map((item: any, idx: number) => (
                  <tr key={item.ticker} className="hover:bg-tv-hover/50 transition-colors">
                    <td className="p-3 text-tv-muted font-bold">{idx + 1}</td>
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
                          <span className="text-[9px] font-semibold uppercase tracking-wide text-tv-yellow">
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}

          {/* Di bawah lg, 16 kolom hanya bisa dicapai lewat gulir horizontal panjang -
              tampilan data utama tidak boleh menuntut itu. Kartu berikut memuat field
              yang sama, dikelompokkan menurut cara membacanya (valuasi, kualitas,
              risiko) alih-alih dijejer dalam satu baris. */}
          {sortedRows.length > 0 && (
            <div className="lg:hidden space-y-2">
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

              {sortedRows.map((item: any, idx: number) => {
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

                    <div className="mt-3 grid grid-cols-4 gap-2 border-t border-tv-border pt-2.5">
                      {([
                        ['PER', item.per != null ? `${item.per}x` : 'N/A', 'text-white'],
                        ['ROE', item.roe, 'text-tv-accent'],
                        ['DER', item.der, 'text-tv-text'],
                        ['Div', item.div_yield, 'text-tv-yellow'],
                      ] as const).map(([label, value, tone]) => (
                        <div key={label}>
                          <div className="text-[9px] uppercase tracking-wide text-tv-muted">{label}</div>
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
