'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Award, ArrowUpDown, Lock } from 'lucide-react';
import { ApiErrorHint, Button, Card, EmptyState, LoadingFact, Skeleton, TickerAvatar } from '@/components/ui';
import { fmtMiliar, fmtTriliun } from '@/shared/format/fundamental-format';
import { trackSignupClick } from '@/shared/analytics/product-funnel';
import { getKategoriPresentationLabel } from '@/shared/presentation/signal-labels';
import {
  describeUserEligibilityFallback,
  describeUserRecommendationStatus,
  describeUserSignalLabel,
} from '@/shared/presentation/user-status-labels';
import { parseFormattedNumber, SORTABLE_COLUMNS, type ColumnKey, type ScreenerApiResponse } from './screener-model';
import type { ScreenerStock } from '@/modules/market/service/screener.service';

type RiskProfile = 'Konservatif' | 'Moderat' | 'Agresif';

interface ScreenerResultsProps {
  data: ScreenerApiResponse | null;
  riskProfile: RiskProfile;
  loading: boolean;
  loadError: boolean;
  loadErrorMessage: string | null;
  loadErrorRequestId: string | null;
  sortedRows: ScreenerStock[];
  visibleRows: ScreenerStock[];
  hasLockedGuestRows: boolean;
  lockedCount: number;
  sortKey: ColumnKey | null;
  sortDir: 'asc' | 'desc';
  onSort: (key: ColumnKey) => void;
  onRetry: () => void;
  viewMode: 'compact' | 'full';
}

export default function ScreenerResults({
  data,
  riskProfile,
  loading,
  loadError,
  loadErrorMessage,
  loadErrorRequestId,
  sortedRows,
  visibleRows,
  hasLockedGuestRows,
  lockedCount,
  sortKey,
  sortDir,
  onSort: handleSort,
  onRetry,
  viewMode,
}: ScreenerResultsProps) {
  const isFull = viewMode === 'full';
  const visibleColumns = isFull
    ? SORTABLE_COLUMNS
    : SORTABLE_COLUMNS.filter((c) => !['bandarmology', 'moat', 'pattern_tag', 'sentiment', 'week52_high', 'atr_pct', 'market_cap', 'adv20_idr'].includes(c.key));
  return (
    <>
{/* Screener Results Table */}
<Card padding="none" radius="xl" elevation="sm" overflow="visible" highlight={false} className="border-tv-border p-5 space-y-4">
  <div className="flex items-center justify-between border-b border-tv-border pb-3">
    <div className="flex items-center gap-2">
      <Award className="w-5 h-5 text-amber-400" />
      <h3 className="font-heading font-bold text-base text-white">
        Top 10 Saham IDX - Profil {riskProfile}
      </h3>
    </div>
    <div className="text-right">
      <span className="text-xs text-tv-muted block">
        Peringkat gabungan untuk tiap profil risiko: nilai murah, laba, utang, dividen, pertumbuhan, dan aliran dana.
      </span>
      {/* BUG FIX (audit 2026-08-05, temuan M-13): backend SUDAH mengirim `_meta`
          (umur cache universe screener, TTL 30 menit) sejak audit sebelumnya, tapi
          halaman ini tidak pernah merendernya - hasil 29 menit tampil identik
          dengan yang baru dihitung. */}
      {/* Saat memindai ulang dengan hasil lama masih di layar, chip umur cache
          menggambarkan data yang sedang diganti - jadi diganti penanda proses.
          Sebelumnya tidak ada isyarat APA PUN pada refetch (skeleton hanya muncul
          kalau tabel kosong), sehingga mengganti profil membiarkan baris profil
          lama duduk di bawah judul profil baru tanpa tanda. */}
      {loading && sortedRows.length > 0 ? (
        <span className="lens-chip font-mono text-tv-muted/80 block mt-1">Memindai ulang…</span>
      ) : data?._meta && (
        <span className="lens-chip font-mono text-tv-muted/80 block mt-1">
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
          <strong>{lockedCount} emiten lanjutan terkunci</strong> (LensScanner). Masuk untuk membuka seluruh hasil 10 saham.
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
    <>
      <EmptyState
        illustration="empty"
        title="Hasil pemindaian gagal dimuat"
        description={loadErrorMessage || 'Permintaan ke server tidak sampai, jadi belum diketahui saham mana yang lolos untuk profil ini. Ini bukan berarti tidak ada yang memenuhi kriteria.'}
        action={{ label: 'Coba lagi', onClick: onRetry }}
      />
      <ApiErrorHint requestId={loadErrorRequestId} className="justify-center" />
    </>
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
  {sortedRows.length > 0 && (
  <div aria-busy={loading}
       className={`lens-table-sticky-col lens-table-sticky-col-2 [--lens-sticky-head-bg:rgb(var(--lens-bg))] hidden md:block overflow-x-auto${loading ? ' opacity-50 pointer-events-none' : ''}`}>
    <table className="w-full text-left text-xs font-mono border-collapse">
      <thead>
        {/* JANGAN pasang `lens-chip` di sini. Kelas itu untuk pil/badge dan menyetel
            `display: inline-flex`; pada <tr> ia mengubah baris header jadi wadah flex,
            <th>-nya menjadi `display: block`, dan thead BERHENTI ikut menentukan lebar
            kolom. Akibatnya tbody menghitung kolomnya sendiri: sel pertama membengkak
            jadi ~1654px (terukur di produksi 2026-08-21) sehingga seluruh kolom lain
            terdorong ke luar viewport. Tabelnya terlihat "kosong" padahal datanya ada -
            hanya nomor baris yang tersisa di layar.
            Tipografinya sudah dipenuhi `text-xs` di <table>, jadi kelas itu memang tidak
            memberi apa pun di sini selain kerusakan. */}
        <tr className="border-b border-tv-border bg-tv-bg text-tv-muted uppercase leading-none">
          <th className="w-12 p-3">#</th>
          {visibleColumns.map((col) => (
            <th key={col.key} className={`p-3 ${col.align === 'right' ? 'text-right' : ''}`}>
              {/* Ikon dua-arah redup menandai kolom yang bisa diurutkan.
                  Sebelumnya penanda hanya muncul di kolom yang sedang aktif,
                  jadi sebelum klik pertama tidak ada isyarat apa pun bahwa
                  16 kolom ini sortable. */}
              <Button variant="bare" size="none"
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
              </Button>
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-tv-border/50">
        {visibleRows.map((item, idx: number) => (
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
              <span className="lens-chip text-tv-muted font-normal">
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
            {isFull && (
            <td className="p-3">
              <span className={`px-2 py-0.5 rounded lens-chip font-bold ${
                item.bandarmology === 'Akumulasi'
                  ? 'bg-tv-green/20 text-tv-green border border-tv-green/30'
                  : item.bandarmology === 'Distribusi'
                  ? 'bg-tv-red/20 text-tv-red border border-tv-red/30'
                  : 'bg-tv-hover text-tv-text'
              }`}>
                {item.bandarmology}
              </span>
            </td>
            )}
            {isFull && <td className="p-3 text-tv-text">{item.moat}</td>}
            <td className="p-3">
              {item.decision?.advisory === true && item.decision?.action ? (
                <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded font-bold font-sans lens-chip ${
                  item.decision.action.includes('BUY')
                    ? 'bg-tv-green/20 text-tv-green border border-tv-green/50'
                    : item.decision.action === 'SELL'
                    ? 'bg-tv-red/20 text-tv-red border border-tv-red/50'
                    : 'bg-tv-yellow/10 text-tv-yellow border border-tv-yellow/40'
                }`}>
                  REKOMENDASI: {getKategoriPresentationLabel(item.decision.action)}
                </span>
              ) : item.signal ? (
                <div className="flex flex-col items-start gap-1">
                  <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded font-bold font-sans lens-chip ${
                    item.signal.includes('BUY')
                      ? 'bg-tv-green/10 text-tv-green border border-tv-green/30'
                      : item.signal === 'SELL'
                        ? 'bg-tv-red/10 text-tv-red border border-tv-red/30'
                        : 'bg-tv-yellow/10 text-tv-yellow border border-tv-yellow/30'
                  }`}>
                    {describeUserSignalLabel(item.signal)}
                  </span>
                  <span className="lens-chip font-semibold uppercase tracking-wide text-tv-yellow">
                    {describeUserRecommendationStatus(item.decision?.reasonCodes, item.eligibility_status)}
                  </span>
                </div>
              ) : (
                <span
                  className="text-tv-muted lens-chip cursor-help border-b border-dotted border-tv-borderLight"
                  title={
                    item.eligibility_reasons?.length
                      ? item.eligibility_reasons.join(' · ')
                      : 'Histori harga kurang dari 200 hari bursa, jadi gerbang kelayakan belum bisa dievaluasi'
                  }
                >
                  {describeUserEligibilityFallback(item.eligibility_status)}
                </span>
              )}
            </td>
            {isFull && (
            <td className="p-3 text-tv-text lens-meta">
              {item.pattern_tag || <span className="text-tv-muted">Tidak ada pola cocok</span>}
            </td>
            )}
            {isFull && (
            <td className="p-3">
              <span className={`px-2 py-0.5 rounded lens-chip font-bold ${
                item.sentiment === 'POSITIF'
                  ? 'bg-tv-green/20 text-tv-green border border-tv-green/30'
                  : item.sentiment === 'NEGATIF'
                  ? 'bg-tv-red/20 text-tv-red border border-tv-red/30'
                  : 'bg-tv-hover text-tv-text'
              }`}>
                {item.sentiment ? item.sentiment.charAt(0) + item.sentiment.slice(1).toLowerCase() : 'N/A'}
              </span>
            </td>
            )}
            {/* `Rp {undefined?.toLocaleString()}` sebelumnya merender teks
                "Rp " menggantung tanpa angka saat 52W high/low tidak ada -
                terbaca seperti label yang belum selesai dimuat. */}
            {isFull && (
            <td className="p-3 text-right text-white">
              {item.week52_high != null && item.week52_low != null ? (
                <>
                  <span className="text-tv-green font-bold font-number">Rp {item.week52_high.toLocaleString('id-ID')}</span> /{' '}
                  <span className="text-tv-red font-bold font-number">Rp {item.week52_low.toLocaleString('id-ID')}</span>
                </>
              ) : (
                <span className="text-tv-muted lens-chip">N/A</span>
              )}
            </td>
            )}
            <td className="p-3 text-right text-white">
              {item.entry != null
                ? <span className="text-tv-yellow font-bold font-number">Rp {item.entry.toLocaleString('id-ID')}</span>
                : <span className="text-tv-muted lens-chip">N/A</span>}
            </td>
            {isFull && (
            <td className="p-3 text-right text-tv-text font-number">
              {item.atr_pct != null ? `±${item.atr_pct.toFixed(1)}%/hari` : 'N/A'}
            </td>
            )}
            {isFull && <td className="p-3 text-right text-tv-text font-number">{fmtTriliun(item.market_cap)}</td>}
            {isFull && <td className="p-3 text-right text-tv-text font-number">{fmtMiliar(item.adv20_idr)}</td>}
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
                    className="inline-flex items-center gap-1 lens-chip font-bold text-tv-yellow bg-tv-yellow/10 border border-tv-yellow/40 px-2 py-0.5 rounded-full hover:bg-tv-yellow/20 hover:text-white transition-all shadow-sm shrink-0 whitespace-nowrap"
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
              {isFull && (
              <td className="p-3 blur-sm select-none opacity-40">
                <span className="px-2 py-0.5 rounded lens-chip bg-tv-hover text-tv-text font-bold">••••••••</span>
              </td>
              )}
              {isFull && <td className="p-3 text-tv-text blur-sm select-none opacity-40">••••••</td>}
              <td className="p-3 blur-sm select-none opacity-40">
                <span className="px-2 py-0.5 rounded lens-chip bg-tv-green/20 text-tv-green font-bold">REKOMENDASI: BUY</span>
              </td>
              {isFull && <td className="p-3 text-tv-text lens-meta blur-sm select-none opacity-40">••••••••</td>}
              {isFull && (
              <td className="p-3 blur-sm select-none opacity-40">
                <span className="px-2 py-0.5 rounded lens-chip bg-tv-hover text-tv-text font-bold">Positif</span>
              </td>
              )}
              {isFull && <td className="p-3 text-right text-white blur-sm select-none opacity-40">Rp •••• / Rp ••••</td>}
              <td className="p-3 text-right text-white blur-sm select-none opacity-40">Rp ••••</td>
              {isFull && <td className="p-3 text-right text-tv-text font-number blur-sm select-none opacity-40">±••%/hari</td>}
              {isFull && <td className="p-3 text-right text-tv-text font-number blur-sm select-none opacity-40">Rp •• T</td>}
              <td className="p-3 text-right text-tv-text font-number">
                <div className="flex justify-end">
                  <Link
                    onClick={() => trackSignupClick('screener_results')}
                    href="/login?next=%2Fscreener"
                    className="inline-flex items-center gap-1 lens-chip font-bold text-tv-yellow bg-tv-yellow/10 border border-tv-yellow/40 px-2.5 py-1 rounded-full hover:bg-tv-yellow/20 hover:text-white transition-all shadow-sm whitespace-nowrap"
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
    <div aria-busy={loading} className={`md:hidden space-y-2${loading ? ' opacity-50 pointer-events-none' : ''}`}>
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        <span className="lens-chip uppercase tracking-wide text-tv-muted shrink-0 mr-1">Urutkan</span>
        {SORTABLE_COLUMNS.filter((c) => c.align === 'right' || c.key === 'ticker').map((col) => (
          <Button variant="bare" size="none"
            key={col.key}
            type="button"
            onClick={() => handleSort(col.key)}
            className={`shrink-0 rounded-full border px-2.5 py-1 lens-meta transition-colors ${
              sortKey === col.key
                ? 'border-tv-blue/40 bg-tv-blue/10 text-tv-blue'
                : 'border-tv-border text-tv-muted hover:text-tv-text'
            }`}
          >
            {col.label}
            {sortKey === col.key && <span className="ml-1">{sortDir === 'asc' ? '▲' : '▼'}</span>}
          </Button>
        ))}
      </div>

      {visibleRows.map((item, idx: number) => {
        const growth = parseFormattedNumber(item.rev_growth_ttm);
        return (
          <motion.div
            key={item.ticker}
            whileTap={{ scale: 0.995 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="rounded-lg border border-tv-border bg-tv-bg/40 p-3"
          >
            <div className="flex items-center gap-3">
              <span className="lens-meta font-number text-tv-muted w-4 shrink-0">{idx + 1}</span>
              <TickerAvatar symbol={item.ticker} size="md" />
              <div className="min-w-0 flex-1">
                <Link href={`/technical/${item.ticker}.JK`} className="font-number font-bold text-white hover:text-tv-blue transition-colors">
                  {item.ticker}
                </Link>
                <div className="lens-meta text-tv-muted truncate">{item.name}</div>
                <div className="lens-chip text-tv-muted/80 truncate">{item.sector}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-number font-bold text-tv-yellow">
                  {item.entry != null ? `Rp ${item.entry.toLocaleString('id-ID')}` : 'N/A'}
                </div>
                <div className="lens-chip text-tv-muted font-number">
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
                  <div className="lens-chip uppercase tracking-wide text-tv-muted">{label}</div>
                  <div className={`font-number text-xs font-bold ${tone}`}>{value ?? 'N/A'}</div>
                </div>
              ))}
            </div>

            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {item.decision?.advisory === true && item.decision?.action ? (
                <span className={`px-2 py-0.5 rounded lens-chip font-bold ${
                  item.decision.action.includes('BUY') ? 'bg-tv-green/20 text-tv-green border border-tv-green/50'
                    : item.decision.action === 'SELL' ? 'bg-tv-red/20 text-tv-red border border-tv-red/50'
                    : 'bg-tv-yellow/10 text-tv-yellow border border-tv-yellow/40'
                }`}>REKOMENDASI: {getKategoriPresentationLabel(item.decision.action)}</span>
              ) : item.signal ? (
                <span className={`px-2 py-0.5 rounded lens-chip font-bold ${
                  item.signal.includes('BUY') ? 'bg-tv-green/10 text-tv-green border border-tv-green/30'
                    : item.signal === 'SELL' ? 'bg-tv-red/10 text-tv-red border border-tv-red/30'
                    : 'bg-tv-yellow/10 text-tv-yellow border border-tv-yellow/30'
                }`} title={item.decision?.explanation || undefined}>
                  {describeUserSignalLabel(item.signal)} · {describeUserRecommendationStatus(item.decision?.reasonCodes, item.eligibility_status)}
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded lens-chip bg-tv-hover text-tv-muted">
                  {describeUserEligibilityFallback(item.eligibility_status)}
                </span>
              )}
              <span className={`px-2 py-0.5 rounded lens-chip font-bold ${
                item.bandarmology === 'Akumulasi' ? 'bg-tv-green/20 text-tv-green border border-tv-green/30'
                  : item.bandarmology === 'Distribusi' ? 'bg-tv-red/20 text-tv-red border border-tv-red/30'
                  : 'bg-tv-hover text-tv-text'
              }`}>{item.bandarmology}</span>
              <span className={`px-2 py-0.5 rounded lens-chip font-number font-bold ${
                (growth ?? 0) > 0 ? 'bg-tv-green/10 text-tv-green' : (growth ?? 0) < 0 ? 'bg-tv-red/10 text-tv-red' : 'bg-tv-hover text-tv-muted'
              }`}>Rev {item.rev_growth_ttm}</span>
            </div>

            <div className="mt-2 lens-chip text-tv-muted leading-relaxed">
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
                className="flex items-center gap-1 lens-meta font-bold text-tv-yellow bg-tv-yellow/10 border border-tv-yellow/40 px-3 py-1.5 rounded-full hover:bg-tv-yellow/20 hover:text-white transition-all shadow-sm"
              >
                <Lock className="h-3.5 w-3.5" /> Masuk
              </Link>
            </div>
            <div className="flex items-center justify-between gap-2 blur-sm select-none opacity-40">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-tv-border flex items-center justify-center lens-chip leading-none">?</div>
                <span className="font-bold text-white">••••</span>
                <span className="text-xs text-tv-muted">PT •••••••••••• Tbk</span>
              </div>
              <span className="text-xs font-bold text-tv-muted">#{cardIdx}</span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 blur-sm select-none opacity-40 lens-meta">
              <div>PER: ••.x</div>
              <div>ROE: ••%</div>
              <div>Div: ••%</div>
            </div>
          </div>
        );
      })}
    </div>
  )}

  <p className="lens-chip text-tv-muted">
    Bandarmology = Chaikin Money Flow (posisi close di range High-Low + rasio volume 20 hari), estimasi tekanan beli/jual - BUKAN data broker/asing resmi (IDX tidak menyediakan feed itu gratis).
  </p>
  <p className="lens-chip text-tv-muted">
    Signal = skor komposit Teknikal+Fundamental+Flow yang sama dengan Detail Saham/LensRadar (bukan angka terpisah). Pola Backtest = preset filter di menu Backtest yang SAAT INI cocok untuk saham ini (semua indikatornya BULLISH bersamaan) - &ldquo;Tidak ada pola cocok&rdquo; berarti jujur tidak ada, bukan kosong karena error. Sentimen Berita = hasil klasifikasi AI/kata kunci atas judul berita RSS riil yang menyebut saham ini - &ldquo;N/A&rdquo; berarti saham ini tidak disebut media dalam siklus data terakhir, bukan sentimen netral yang terukur.
  </p>
  <p className="lens-chip text-tv-muted mt-2">
    Volatilitas Harian = rata-rata pergerakan 14 hari terakhir (ATR). Stop loss di bawah
    angka ini akan sering tersentuh oleh fluktuasi biasa - pengujian atas 4.705 sampel
    menunjukkan stop 5% tersentuh di 77% transaksi dan memangkas hampir seluruh
    keuntungan. Tentukan batas risikomu sendiri dengan mempertimbangkan angka ini.
  </p>
</Card>
    </>
  );
}
