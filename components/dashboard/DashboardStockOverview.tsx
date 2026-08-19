'use client';

import dynamic from 'next/dynamic';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, RefreshCw, ShieldCheck, TrendingUp } from 'lucide-react';
import { QuickWatchlistStar } from '@/components/QuickWatchlistStar';
import { PriceRangeSlider } from '@/components/ui/PriceRangeSlider';
import DecisionScoreCard from '@/components/analysis/DecisionScoreCard';
import { AnimatedNumber, Badge, Card, EmptyState, Skeleton, TickerAvatar } from '@/components/ui';
import { classifyCapTier, CURRENT_LARGE_LIQUID_MIN_ADV20_IDR, CURRENT_LARGE_LIQUID_MIN_MARKET_CAP_IDR } from '@/lib/utils/cap-tier';
import { isBlueChipConstituent, LQ45_BADGE_TITLE } from '@/lib/utils/blue-chip-index';
import { classifyTradingBoard } from '@/lib/utils/idx-trading-board';
import { getKategoriPresentationLabel, getKategoriTone } from '@/shared/presentation/signal-labels';
import { displayDashboardTicker as displayTicker, formatDashboardTime, splitStatusText } from '@/components/dashboard/dashboard-analysis';

const ProTradingViewChart = dynamic(() => import('@/components/ProTradingViewChart').then((module) => module.ProTradingViewChart), {
  ssr: false,
  loading: () => <div className="h-[420px] w-full animate-pulse rounded-2xl bg-tv-surface" aria-label="Memuat Pro Chart" />,
});

const SeasonalityMatrix = dynamic(() => import('@/components/SeasonalityMatrix').then((module) => module.SeasonalityMatrix), {
  ssr: false,
});

export function DashboardStockOverview(props: {
  fetchError: boolean;
  onRetry: () => void;
  loading: boolean;
  dataFreshness: any;
  stock: any;
  ticker: string;
  data: any;
  candles: any[];
  lastUpdate: Date | null;
  simpleDecisionLabel: string | null;
  viewMode: 'compact' | 'full';
  onExplain: () => void;
  onCollapse: () => void;
}) {
  const { fetchError, onRetry, loading, dataFreshness, stock, ticker, data, candles, lastUpdate, simpleDecisionLabel, viewMode, onExplain, onCollapse } = props;
  const formatTime = formatDashboardTime;
  return (
    <>
{/* Hero */}
{fetchError ? (
  <Card padding="none" radius="2xl" elevation="md" overflow="visible" highlight={false} className="border-white/[0.075] p-5">
    <EmptyState
      title="Data pasar sementara tidak tersedia."
      action={{ label: 'Coba lagi', onClick: onRetry }}
    />
  </Card>
) : loading && !data ? (
  <Card padding="none" radius="2xl" elevation="md" overflow="visible" highlight={false} className="border-white/[0.075] p-5 flex items-center gap-4">
    <Skeleton variant="circle" className="w-12 h-12" />
    <div className="space-y-2">
      <Skeleton variant="text" className="w-40 h-6" />
      <Skeleton variant="text" className="w-28" />
    </div>
  </Card>
) : (
  <>
  {/* Peringatan kesegaran data (temuan C-8) - tampil HANYA kalau data yang sedang
      dirender memang bukan data pasar terkini. Seluruh angka di halaman ini
      (harga, skor, kategori BUY/SELL) diturunkan dari payload yang sama. */}
  {dataFreshness?.warn && (
    <div className="mb-4 rounded-lg border border-tv-yellow/40 bg-tv-yellow/10 p-3 flex items-start gap-2">
      <AlertTriangle className="w-4 h-4 text-tv-yellow shrink-0 mt-0.5" />
      <div className="text-[11px] leading-relaxed text-tv-yellow">
        <b>{dataFreshness.label}</b>
        {dataFreshness.detail && <span className="block text-tv-text/80 mt-0.5">{dataFreshness.detail}</span>}
      </div>
    </div>
  )}
  <Card padding="none" radius="2xl" elevation="md" overflow="visible" highlight={false} className="border-white/[0.075] p-4 sm:p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-5">
    <div className="flex min-w-0 items-center gap-3 sm:gap-4">
      {/* Ikon petir kuning yang sama dipakai untuk SEMUA saham - tidak
          membedakan apa pun. Diganti avatar berwarna deterministik per emiten. */}
      <TickerAvatar symbol={stock.symbol || ticker} size="lg" />
      <div>
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <h1 className="shrink-0 font-heading text-xl font-bold tracking-tight text-white sm:text-2xl md:text-[28px]">{displayTicker(stock.symbol || ticker)}.JK</h1>
          <QuickWatchlistStar ticker={stock.symbol || ticker} />
          <span className="min-w-0 truncate text-xs font-normal text-tv-muted font-sans sm:text-sm">{stock.name || ticker.replace('.JK', '')}</span>
        </div>
        {/* BUG FIX (2026-08-14, brainstorm lanjutan review eksternal - false
            signal di saham kecil/tidak likuid): badge INFORMASIONAL, tidak
            mengubah cara skor/sinyal dihitung - lihat classifyCapTier(). Tidak
            tampil kalau market cap ATAU likuiditas tidak diketahui (mis. IHSG,
            yang bukan saham individual) - diam lebih baik daripada menebak. */}
        {(() => {
          const isLq45 = isBlueChipConstituent(ticker);
          const tier = classifyCapTier(data?.market_cap, data?.eligibility?.details?.adv20Idr);
          // Papan dari `listing_board` IDX (all.csv) lewat /api/stock, bukan dari
          // daftar ticker ketikan tangan (temuan C-01). `null` = papan tidak
          // diketahui -> lencana tidak dirender sama sekali.
          const boardInfo = classifyTradingBoard(data?.stock?.listing_board);
          return (
            <>
              <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                {isLq45 && (
                  <Badge
                    variant="info"
                    title={LQ45_BADGE_TITLE}
                  >
                    Indeks LQ45
                  </Badge>
                )}
                {boardInfo && (
                  <Badge
                    variant={boardInfo.badgeVariant}
                    title={boardInfo.description}
                  >
                    {boardInfo.shortLabel}
                  </Badge>
                )}
                {tier && (
                  <Badge
                    variant={tier === 'LARGE_LIQUID_CURRENT' ? 'neutral' : 'warning'}
                    title={tier === 'LARGE_LIQUID_CURRENT'
                      ? `Kondisi saat ini: market cap & likuiditas di atas ambang konteks (>= Rp ${(CURRENT_LARGE_LIQUID_MIN_MARKET_CAP_IDR / 1e12).toFixed(0)} T, ADV20 >= Rp ${(CURRENT_LARGE_LIQUID_MIN_ADV20_IDR / 1e9).toFixed(0)} M/hari)`
                      : 'Kondisi saat ini: market cap lebih kecil dan/atau likuiditas lebih tipis. Ini konteks kondisi pasar, bukan penilaian kualitas atau identitas emiten.'}
                  >
                    {tier === 'LARGE_LIQUID_CURRENT' ? 'Large & Liquid · saat ini' : 'Small / Thin · saat ini'}
                  </Badge>
                )}
              </div>
              {boardInfo?.isFca && (
                <div className="mt-2.5 flex items-start gap-2.5 rounded-xl border border-tv-gold/30 bg-tv-gold/10 p-2.5 text-xs text-tv-gold">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <strong>Peringatan Papan Pemantauan Khusus (FCA):</strong> Emiten ini diperdagangkan dengan mekanisme <em>Periodic Call Auction</em> (5 sesi lelang per hari) dengan fraksi harga tetap Rp 1. Formasi pergerakan harga berbeda dari lelang kontinu biasa.
                  </div>
                </div>
              )}
            </>
          );
        })()}
        <div className="flex items-center gap-3 mt-1">
          {/* `|| '-'` sebelumnya merender "Rp -" saat harga tidak ada: sebuah
              tanda hubung yang tidak memberi tahu apakah datanya hilang, nol,
              atau belum sempat dimuat. */}
          {typeof stock.current_price === 'number' ? (
            <AnimatedNumber
              value={stock.current_price}
              format={(n) => `Rp ${Math.round(n).toLocaleString('id-ID')}`}
              className="font-number text-xl font-bold tracking-tight text-white tabular-nums sm:text-2xl md:text-[28px]"
            />
          ) : (
            <span className="text-sm text-tv-muted">Harga tidak tersedia dari sumber data</span>
          )}
          {/* Temuan M-7: null (tidak terukur) dibedakan dari 0 (benar-benar flat). */}
          {stock.change_pct == null ? (
            <span className="font-number text-sm font-bold text-tv-muted">Perubahan N/A</span>
          ) : (
            <span className={`font-number text-sm font-bold flex items-center gap-0.5 ${
              stock.change_pct >= 0 ? 'text-tv-green' : 'text-tv-red'
            }`}>
              {stock.change_pct >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
              {stock.change_pct > 0 ? `+${stock.change_pct}` : stock.change_pct}%
            </span>
          )}
        </div>
        <p className="text-[11px] text-tv-muted mt-1">
          Data sesi: {formatTime(lastUpdate)}
          {dataFreshness && <span className="ml-2">• Data pasar: {dataFreshness.label}</span>}
        </p>
      </div>
    </div>

    {/* Price Range Slider (Day's Range) - hanya bar provider valid; tidak ada +/-2% fallback. */}
    {(() => {
      const lastCandle = candles?.[candles.length - 1];
      const lowPrice = Number(lastCandle?.low);
      const highPrice = Number(lastCandle?.high);
      if (typeof stock.current_price !== 'number' || !Number.isFinite(stock.current_price) || stock.current_price <= 0 ||
          !Number.isFinite(lowPrice) || lowPrice <= 0 || !Number.isFinite(highPrice) || highPrice <= 0 || highPrice < lowPrice) {
        return null;
      }
      return (
        <div className="w-full md:w-72 shrink-0">
          <PriceRangeSlider
            currentPrice={stock.current_price}
            lowPrice={lowPrice}
            highPrice={highPrice}
            label="Rentang Harga Hari Ini"
          />
        </div>
      );
    })()}

    <div className="flex w-full min-w-0 items-stretch gap-4 md:w-auto md:items-center md:gap-6">
       {data?.bestPerformer && (
          <div className="text-right border-r border-tv-border pr-6 hidden md:block">
            <div className="text-[10px] font-sans font-semibold text-tv-muted uppercase">TOP METHOD TODAY</div>
            <div className="text-lg font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-tv-green" />
              {data.bestPerformer.label} (rule {data.bestPerformer.confidence}/100)
            </div>
          </div>
       )}
      <div className="w-full min-w-0 md:w-auto md:min-w-[250px]">
        <div className="mb-1.5 text-[10px] font-sans font-semibold uppercase tracking-wide text-tv-muted md:text-right">Konsensus Analyzer</div>
        {(() => {
          const consensus = splitStatusText(data?.consensus);
          const consensusLabel = getKategoriPresentationLabel(consensus.primary);
          const consensusTone = getKategoriTone(consensus.primary);
          return (
            // Bobot visualnya diturunkan, UKURAN HURUFNYA TIDAK. Kotak ini dulu
            // paling menonjol di layar (62px, 18px tebal, latar /15, tepi /60)
            // padahal isinya sinyal PALING SEMPIT di halaman: vote teknikal
            // murni, buta fundamental, dan menurut decision-presentation.service
            // tidak boleh dibaca sebagai arah transaksi. Pembaca sekilas ambil
            // yang paling mencolok, jadi "STRONG BUY" mengalahkan putusan
            // sebenarnya (WATCH) hanya karena lebih besar.
            //
            // Yang dikurangi: tinggi, kepekatan latar, ketegasan tepi, lompatan
            // ke 18px. Yang DIPERTAHANKAN: 16px tebal - masih nyaman dibaca
            // mata yang sudah tidak muda.
            <div className={`flex min-h-[52px] w-full items-center gap-2.5 rounded-xl border px-3.5 py-2 md:min-w-[200px] ${
              consensusTone === 'positive'
                ? 'bg-tv-green/10 text-tv-green border-tv-green/30'
                : consensusTone === 'negative'
                  ? 'bg-tv-red/10 text-tv-red border-tv-red/30'
                  : 'bg-tv-yellow/10 text-tv-yellow border-tv-yellow/30'
            }`}>
              {loading ? <RefreshCw className="h-4 w-4 shrink-0 animate-spin" /> : <TrendingUp className="h-4 w-4 shrink-0" />}
              <div className="min-w-0 font-sans">
                {/* 14px, bukan 16px. Hirarki di kotak ini bersandar pada TEBAL
                    dan WARNA, bukan ukuran - selisihnya dengan baris detail di
                    bawah tinggal 1px karena lantai keterbacaan menahan yang
                    kecil di 13px. Itu memang disengaja: kotak ini sinyal
                    sekunder, tidak boleh mengalahkan putusan utama halaman. */}
                <div className="text-sm font-bold leading-tight">{loading ? 'Calculating...' : consensusLabel}</div>
                {!loading && consensus.detail && <div className="mt-0.5 truncate text-[11px] font-medium opacity-80 sm:text-xs">Keselarasan analyzer: {consensus.detail}</div>}
              </div>
            </div>
          );
        })()}
        {data?.consensusData && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-number text-tv-muted md:justify-end">
            <span>Vote <strong className="text-white">{data.consensusData.vote}</strong></span>
            <span className="text-tv-borderLight">•</span>
            <span>Median <strong className="text-white">{data.consensusData.median_skor}</strong></span>
          </div>
        )}
      </div>
    </div>
  </Card>

  {/* Chart ditempatkan langsung setelah konteks emiten: pengguna bisa membaca
      harga dan struktur candle sebelum menafsirkan skor, voting, atau kartu
      indikator. Detail indikator di bawah menjadi penjelas untuk chart ini. */}
  <div className="mt-4 w-full space-y-4">
    <ProTradingViewChart
      candles={candles}
      ticker={stock.symbol || ticker}
    />

    <SeasonalityMatrix
      candles={candles}
      ticker={stock.symbol || ticker}
    />
  </div>

  {/* BUG FIX (2026-08-14, masukan review eksternal - "jangan hanya tampilkan
      skor akhir 8/10, tampilkan breakdown voting: Tren Bullish, Momentum
      Bearish, dst"): data per-indikator (data.analyzers) ini SEBELUMNYA cuma
      dipakai untuk export PDF (downloadTechnicalPDF di bawah) - tidak pernah
      dirender di layar sama sekali. "Konsensus Analyzer" di atas cuma
      menampilkan HASIL AKHIR voting; tabel ini menampilkan APA yang divoting -
      9 analyzer yang SAMA PERSIS memberi suara ke konsensus di atas (lihat
      calculateConsensus di app/api/stock/[ticker]/route.ts). Default tertutup
      (<details>) - info tambahan, bukan yang paling dicari saat halaman
      pertama dibuka. */}
  {!loading && data?.analyzers && data.analyzers.length > 0 && (
    <details className="group mt-3 rounded-lg border border-tv-border bg-tv-bg/60">
      <summary className="cursor-pointer list-none px-3 py-2 text-[11px] font-semibold text-tv-muted transition-colors hover:text-tv-text">
        Rincian voting {data.analyzers.length} analyzer <span className="font-normal text-tv-muted/80">— lihat alasan di balik konsensus di atas</span>
      </summary>
      <div className="border-t border-tv-border">
        {data.analyzers.map((a: any, i: number) => (
          <div
            key={`${a.label}-${i}`}
            className={`flex items-center justify-between gap-3 px-3 py-2 text-[11px] ${i > 0 ? 'border-t border-tv-border/60' : ''}`}
          >
            <span className="min-w-0 truncate font-medium text-tv-text">{a.label}</span>
            <div className="flex shrink-0 items-center gap-2">
              <span className="font-number text-tv-muted">{a.value}</span>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                a.decision === 'BULLISH'
                  ? 'bg-tv-green/10 text-tv-green'
                  : a.decision === 'BEARISH'
                  ? 'bg-tv-red/10 text-tv-red'
                  : 'bg-tv-yellow/10 text-tv-yellow'
              }`}>
                {a.decision === 'BULLISH' ? 'Bullish' : a.decision === 'BEARISH' ? 'Bearish' : 'Netral'}
              </span>
              <span className="w-9 text-right font-number text-tv-muted/70">{a.confidence}/100</span>
            </div>
          </div>
        ))}
      </div>
    </details>
  )}
  </>
)}

{data?.scoring && simpleDecisionLabel && (
  <DecisionScoreCard
    verdict={simpleDecisionLabel}
    totalScore={data.scoring.total_score}
    technicalScore={data.scoring.technical_score}
    fundamentalScore={data.scoring.fundamental_score}
    flowScore={data.scoring.flow_score}
    coveragePct={data.scoring.coverage_pct}
    expanded={viewMode === 'full'}
    onExplain={onExplain}
    onCollapse={onCollapse}
  />
)}

    </>
  );
}
