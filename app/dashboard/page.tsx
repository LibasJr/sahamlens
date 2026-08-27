'use client';

import React, { Suspense } from 'react';
import Header from '@/components/Header';
import RiskRewardCalculator from '@/components/RiskRewardCalculator';
import { PositionSizingCalculator } from '@/components/PositionSizingCalculator';
import AlgoFilters from '@/components/AlgoFilters';
import AnalysisGlossary from '@/components/AnalysisGlossary';
import { useDashboardAnalysis } from '@/components/dashboard/useDashboardAnalysis';
import { DashboardEmptyState, DashboardLoadingState } from '@/components/dashboard/DashboardLoadStates';
import { DashboardIndexSection } from '@/components/dashboard/DashboardIndexSection';
import { DashboardStockOverview } from '@/components/dashboard/DashboardStockOverview';
import { DashboardInsightSummary } from '@/components/dashboard/DashboardInsightSummary';
import { DashboardFooterActions } from '@/components/dashboard/DashboardFooterActions';
import { downloadTechnicalReport } from '@/components/dashboard/downloadTechnicalReport';
import {
  buildChartTechnical,
  buildDataFreshness,
  buildIndexTechnicalSummary,
  computeBacktestAccuracy,
  displayDashboardTicker as displayTicker,
  getMAStatus,
  isIndexTicker,
  signalBadgeTone,
} from '@/components/dashboard/dashboard-analysis';
import { AnimatedNumber, Button, Card, PageContainer } from '@/components/ui';
import { FREE_LIMITS } from '@/shared/constants/limits';
import { momentumScore, riskScore } from '@/lib/utils/lens-score-breakdown';
import { getDecisionPresentation, getSimpleDecisionLabel } from '@/modules/eligibility';
import { Activity, CheckCircle2, Download, FileText, Radar, RefreshCw, Sparkles } from 'lucide-react';
import MenuUsageGuide from '@/components/MenuUsageGuide';
import type { DashboardData } from '@/components/dashboard/dashboard-analysis';
import { percentageWidthClass } from '@/shared/presentation/percentage-width';

function stockCurrentPrice(data: DashboardData | null): number | null {
  const price = data?.stock?.current_price;
  return typeof price === 'number' && Number.isFinite(price) && price > 0 ? price : null;
}

function DashboardContent() {
  const {
    ticker, setTicker, loading, fetchError, fetchErrorRequestId, data, lastUpdate, marketClosed,
    sortByConfidence, setSortByConfidence, viewMode, changeViewMode,
    openFullAnalysis, collapseAnalysis, timeframe, setTimeframe, chartCandles,
    radarRank, stockNews, loadingStockNews, newsModalOpen, setNewsModalOpen,
    analisaRemaining, showPaywall, setShowPaywall, showLoginPrompt,
    setShowLoginPrompt, usedSymbolsToday, isAdminUser, isTrialExpired, lockForGuest, handleRefresh,
  } = useDashboardAnalysis();

  const downloadTechnicalPDF = () => downloadTechnicalReport({ data, ticker });
  const stock = data?.stock ?? null;
  const currentPrice = stockCurrentPrice(data);
  const currentIsIndex = isIndexTicker(ticker);
  const candles = chartCandles.length > 0 ? chartCandles : (data?.stock?.history ?? []);
  let analyzers = data?.analyzers ?? [];

  if (sortByConfidence) {
    analyzers = [...analyzers].sort((a, b) => b.confidence - a.confidence);
  }

  const chartTechnical = buildChartTechnical(analyzers, candles);
  const indexTechnicalSummary = React.useMemo(
    () => currentIsIndex ? buildIndexTechnicalSummary(candles) : null,
    [currentIsIndex, candles],
  );
  const dataFreshness = React.useMemo(() => buildDataFreshness(data), [data]);

  // LensScore 5-category breakdown (BUILD 002) - turunan dari analyzer Momentum 1D/5D
  // & Volatility (ATR 14) yang sudah dihitung di atas (bagian dari `analyzers`), bukan
  // komputasi baru. Tidak ikut total_score/kategori BUY-SELL.
  const momentum = data?.scoring ? momentumScore(analyzers) : null;
  const riskInputPrice = currentPrice ?? data?.price ?? null;
  const risk = data?.scoring && riskInputPrice != null ? riskScore(analyzers, riskInputPrice) : null;
  const decisionPresentation = data?.scoring
    ? getDecisionPresentation(data.scoring.kategori, data.decision)
    : null;
  const simpleDecisionLabel = decisionPresentation
    ? getSimpleDecisionLabel(decisionPresentation)
    : null;

  const backtestAccuracy = React.useMemo(() => computeBacktestAccuracy(data), [data]);
  const getAccuracyPct = (label: string): string | null => {
    const result = backtestAccuracy[label];
    return result ? `${result.pct}% (n=${result.samples})` : null;
  };

  if (loading && !data) {
    return (
      <DashboardLoadingState
        ticker={ticker}
        setTicker={setTicker}
        analisaRemaining={analisaRemaining}
        isAdminUser={isAdminUser}
      />
    );
  }

  if (!data) {
    return (
      <DashboardEmptyState
        ticker={ticker}
        setTicker={setTicker}
        analisaRemaining={analisaRemaining}
        isAdminUser={isAdminUser}
        currentIsIndex={currentIsIndex}
        showLoginPrompt={showLoginPrompt}
        showPaywall={showPaywall}
        isTrialExpired={isTrialExpired}
        usedSymbolsToday={usedSymbolsToday}
        requestId={fetchErrorRequestId}
        onRetry={handleRefresh}
        setShowLoginPrompt={setShowLoginPrompt}
        setShowPaywall={setShowPaywall}
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-tv-bg min-h-screen">
      <Header
        currentTicker={displayTicker(ticker)}
        onTickerChange={setTicker}
        moduleTitle="LensTechnical — Pure Algorithmic Trading"
        moduleBank="LENSTECHNICAL"
        stockNav
        analisaRemaining={analisaRemaining}
        analisaTotal={FREE_LIMITS.analisaPerHari}
        isAdmin={isAdminUser}
      />

      <PageContainer className="p-4 md:p-6 lg:p-7 space-y-6">
        <MenuUsageGuide
          menuKey="dashboard"
          whatItAnswers="Apa gambaran teknikal satu saham secara menyeluruh?"
          steps={[
            "Ketik kode saham di kotak pencarian, misalnya BBCA.",
            "Perhatikan tren, momentum, dan aliran dananya sebagai satu kesatuan - bukan satu indikator saja.",
            "Turun ke bukti teknikal untuk melihat dasar tiap kesimpulan.",
          ]}
        />
        {/* Status Badge */}
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-2 text-xs font-sans">
          <div className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-black/10 px-3 py-2 text-tv-muted">
            <span className={`w-2 h-2 rounded-full ${marketClosed ? 'bg-tv-red' : 'bg-tv-green animate-pulse'}`}></span>
            {marketClosed ? 'Market Closed' : 'Market Open'}
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-black/10 px-3 py-2 text-tv-muted">
            {marketClosed ? 'No polling' : 'Refresh otomatis 1m'}
          </div>
          <Button
            variant="bare"
            size="none"
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.035] px-3 py-2 font-semibold text-white transition-colors hover:bg-white/[0.07] disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            Refresh Data
          </Button>
        </div>

        <AnalysisGlossary />

        {currentIsIndex && (
          <DashboardIndexSection
            stock={stock}
            candles={candles}
            chartTechnical={chartTechnical}
            timeframe={timeframe}
            setTimeframe={setTimeframe}
            summary={indexTechnicalSummary}
          />
        )}

        {!currentIsIndex && (
          <>

        <DashboardStockOverview
          fetchError={fetchError}
          onRetry={handleRefresh}
          loading={loading}
          dataFreshness={dataFreshness}
          stock={stock}
          ticker={ticker}
          data={data}
          candles={candles}
          lastUpdate={lastUpdate}
          simpleDecisionLabel={simpleDecisionLabel}
          viewMode={viewMode}
          onExplain={openFullAnalysis}
          onCollapse={collapseAnalysis}
        />

        <DashboardInsightSummary
          data={data}
          dataFreshness={dataFreshness}
          decisionPresentation={decisionPresentation}
        />

        {/* AI Summary - breakdown skor + top alasan setelah chart agar konsensus
            dibaca dalam konteks struktur harga yang baru saja dilihat pengguna. */}
        {viewMode === 'full' && data?.scoring && (
          <Card id="analysis-detail" tabIndex={-1} padding="none" radius="2xl" elevation="sm" overflow="visible" highlight={false} className="w-full scroll-mt-4 border-white/[0.075] p-5 outline-none md:p-6">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-4 h-4 text-tv-blue" />
              <h2 className="font-heading text-sm font-semibold text-white">Technical Summary</h2>
            </div>
            <div className="flex flex-col md:flex-row gap-6 relative">
              {/* Action Buttons - tombol menuju rapat 10 agen sengaja dihapus dari sini
                  (2026-08-01) karena duplikasi tautan di dalam panel ringkasan cuma bikin
                  bingung. Jalur menuju LensConsensus sekarang lewat kartu di Beranda dan
                  MobileNav; entri Sidebar-nya sudah dihapus 2026-08-12. */}
              <div className="absolute top-0 right-0 flex gap-2 z-10">
                <Button
                  variant="bare"
                  size="none"
                  onClick={downloadTechnicalPDF}
                  className="hidden items-center justify-center gap-2 rounded-lg border border-tv-borderLight bg-tv-card px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-tv-hover md:flex"
                >
                  <FileText className="w-3.5 h-3.5" /> Report
                </Button>
              </div>

              {/* Score Circle */}
              <div className="flex flex-col items-center justify-center gap-2 min-w-[140px]">
                <div className="text-[10px] font-sans font-semibold text-tv-muted uppercase tracking-wider text-center flex flex-col gap-1 items-center justify-center">
                  LensScore
                </div>
                <div className={`w-24 h-24 rounded-full border-4 flex items-center justify-center text-3xl font-extrabold font-number ${
                  data.scoring.total_score > 75 ? 'border-tv-green text-tv-green bg-tv-green/10' :
                  data.scoring.total_score >= 60 ? 'border-tv-blue text-tv-blue bg-tv-blue/10' :
                  data.scoring.total_score >= 45 ? 'border-tv-yellow text-tv-yellow bg-tv-yellow/10' :
                  'border-tv-red text-tv-red bg-tv-red/10'
                }`}>
                  <AnimatedNumber value={data.scoring.total_score} />
                </div>
                {/* Di kartu detail ini cukup tampilkan angka LensScore. Arah keputusan
                    BUY/SELL/HOLD/WATCH sengaja tidak diulang di bawah agar tidak
                    bentrok dengan Ringkasan SahamLens/Konsensus AI di atas. */}
                {!decisionPresentation?.actionable && decisionPresentation?.explanation && (
                  <p className="text-[11px] leading-snug text-tv-muted text-center max-w-[240px]">
                    LensScore {data.scoring.total_score}/100 adalah skor informasi. Belum otomatis menjadi rekomendasi transaksi. {decisionPresentation.explanation}
                  </p>
                )}
              </div>

              {/* Score Breakdown */}
              <div className="flex-1 space-y-3">
                <div className="text-[10px] font-sans font-semibold text-tv-muted uppercase tracking-wider mb-2">BREAKDOWN SKOR</div>
                {/* Technical */}
                <div className="flex items-center gap-3">
                  <span className="text-xs text-tv-muted font-sans w-28">Technical (0-40)</span>
                  <div className="flex-1 bg-tv-hover rounded-full h-3 overflow-hidden">
                    <div className={`h-full bg-gradient-to-r from-tv-green/80 to-tv-green rounded-full transition-[width] duration-700 ease-settle ${percentageWidthClass((data.scoring.technical_score / 40) * 100)}`}></div>
                  </div>
                  <span className="text-sm font-bold text-white font-number w-8 text-right">{data.scoring.technical_score}</span>
                </div>
                {/* Momentum - baru (BUILD 002), turunan dari analyzer Momentum 1D/5D yang
                    sudah dihitung tapi belum ditampilkan di sini. Tidak ikut total_score. */}
                {momentum !== null && (
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-tv-muted font-sans w-28">Momentum (0-100)</span>
                    <div className="flex-1 bg-tv-hover rounded-full h-3 overflow-hidden">
                      <div className={`h-full bg-gradient-to-r from-tv-purple/80 to-tv-purple rounded-full transition-[width] duration-700 ease-settle ${percentageWidthClass(momentum)}`}></div>
                    </div>
                    <span className="text-sm font-bold text-white font-number w-8 text-right">{momentum}</span>
                  </div>
                )}
                {/* Fundamental */}
                <div className="flex items-center gap-3">
                  <span className="text-xs text-tv-muted font-sans w-28">Fundamental (0-30)</span>
                  <div className="flex-1 bg-tv-hover rounded-full h-3 overflow-hidden">
                    <div className={`h-full bg-gradient-to-r from-tv-blue/80 to-tv-blue rounded-full transition-[width] duration-700 ease-settle ${percentageWidthClass((data.scoring.fundamental_score / 30) * 100)}`}></div>
                  </div>
                  <span className="text-sm font-bold text-white font-number w-8 text-right">{data.scoring.fundamental_score}</span>
                </div>
                {/* Flow */}
                <div className="flex items-center gap-3">
                  <span className="text-xs text-tv-muted font-sans w-28">Money Flow (0-30)</span>
                  <div className="flex-1 bg-tv-hover rounded-full h-3 overflow-hidden">
                    <div className={`h-full bg-gradient-to-r from-tv-yellow/80 to-tv-yellow rounded-full transition-[width] duration-700 ease-settle ${percentageWidthClass((data.scoring.flow_score / 30) * 100)}`}></div>
                  </div>
                  <span className="text-sm font-bold text-white font-number w-8 text-right">{data.scoring.flow_score}</span>
                </div>
                {/* Risk - baru (BUILD 002), turunan dari analyzer Volatility (ATR 14).
                    Makin tinggi = makin aman (konsisten "tinggi = baik" seperti kategori
                    lain) - BUKAN raw volatility percentage. Tidak ikut total_score. */}
                {risk !== null && (
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-tv-muted font-sans w-28">Risk (0-100)</span>
                    <div className="flex-1 bg-tv-hover rounded-full h-3 overflow-hidden">
                      <div className={`h-full bg-gradient-to-r from-tv-red/80 to-tv-red rounded-full transition-[width] duration-700 ease-settle ${percentageWidthClass(risk)}`}></div>
                    </div>
                    <span className="text-sm font-bold text-white font-number w-8 text-right">{risk}</span>
                  </div>
                )}

                {/* Storytelling: lima bar di atas menunjukkan komponen mana yang kuat,
                    tapi tidak pernah menyebut komponen mana yang MENAHAN skornya.
                    Dihitung dari porsi tiap komponen terhadap pagunya sendiri, bukan
                    dari nilai mentah - technical 20/40 dan fundamental 20/30 bukan
                    prestasi yang sama. */}
                {(() => {
                  const parts = [
                    { name: 'Technical', pct: data.scoring.technical_score / 40 },
                    { name: 'Fundamental', pct: data.scoring.fundamental_score / 30 },
                    { name: 'Money Flow', pct: data.scoring.flow_score / 30 },
                  ].filter((p) => Number.isFinite(p.pct));
                  if (parts.length < 3) return null;
                  const sorted = [...parts].sort((a, b) => b.pct - a.pct);
                  const best = sorted[0];
                  const worst = sorted[sorted.length - 1];
                  return (
                    <p className="mt-3 pt-3 border-t border-tv-border text-[11px] leading-relaxed text-tv-muted">
                      Skor ini paling ditopang <span className="text-tv-text font-medium">{best.name}</span> ({Math.round(best.pct * 100)}% dari pagunya)
                      dan paling ditahan <span className="text-tv-text font-medium">{worst.name}</span> ({Math.round(worst.pct * 100)}%).
                      {worst.pct < 0.4 && ` Perbaikan terbesar untuk saham ini akan datang dari sisi ${worst.name.toLowerCase()}.`}
                    </p>
                  );
                })()}
              </div>

              {/* Reasons & Risk */}
              <div className="flex-1 space-y-3">
                <div className="text-[10px] font-sans font-semibold text-tv-muted uppercase tracking-wider mb-2">TOP 3 ALASAN</div>
                {data.scoring.alasan_3_poin?.map((reason: string, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-tv-green" aria-hidden="true" />
                    <span className="text-tv-text font-sans">{reason}</span>
                  </div>
                ))}
                {data.scoring.risk && (
                  <div className="mt-3 pt-3 border-t border-tv-border">
                    <div className="text-[10px] font-sans font-semibold text-tv-muted uppercase tracking-wider mb-1">RISK</div>
                    <div className="flex items-start gap-2 text-xs">
                      <span className="text-tv-red font-bold">⚠</span>
                      <span className="text-tv-muted font-sans">{data.scoring.risk}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>
        )}

        {/* LensRadar rank badge - muncul HANYA kalau ticker ini ada di /api/ai-pick
            hari ini, tidak ada status EARLY/WATCH/dst yang dipaksakan (spec section C). */}
        {radarRank && (
          <div className="w-full flex items-center gap-3 bg-tv-purple/10 border border-tv-purple/25 rounded-lg px-4 py-3">
            <Radar className="w-4 h-4 text-tv-purple shrink-0" />
            <div className="min-w-0">
              <span className="text-[10px] font-sans font-semibold text-tv-muted uppercase">LensRadar</span>
              <div className="text-sm text-white">
                Skor <strong className="font-number">{radarRank.finalScore}</strong>
                {radarRank.topReasons?.[0] && <span className="text-tv-muted"> — {radarRank.topReasons[0]}</span>}
              </div>
            </div>
          </div>
        )}

        {/* Main Layout */}
        <div className="flex flex-col gap-6">
          {/* BUG 3 FIX: MA Status Badge */}
          {data?.scoring && (() => {
            // BUG FIX (audit 2026-08-05, temuan M-8): MA50/MA200 dulu di-parse dari
            // string tampilan analyzer; kalau analyzer mengembalikan 'N/A' (histori < 200
            // bar) hasilnya 0, dan getMAStatus(price, 0, 0) menyimpulkan UPTREND karena
            // harga selalu > 0. Sekarang pakai `raw` dan tampilkan "data belum cukup".
            const price = data.price;
            const maResult = analyzers.find((a) => a.label?.includes('MA Trend'));
            const ma50 = typeof maResult?.raw?.ma50 === 'number' ? maResult.raw.ma50 : null;
            const ma200 = typeof maResult?.raw?.ma200 === 'number' ? maResult.raw.ma200 : null;
            const maDataReady = ma50 != null && ma200 != null && typeof price === 'number';
            const status = maDataReady
              ? getMAStatus(price, ma50 as number, ma200 as number)
              : { label: 'Data historis belum cukup (butuh 200 hari bursa)', color: 'text-tv-muted', bg: 'bg-tv-hover border-tv-border' };
            return (
              <>
              <div className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border ${status.bg}`}>
                <Activity className={`w-5 h-5 ${status.color}`} />
                <div>
                  <div className="text-[10px] font-sans font-semibold text-tv-muted uppercase">MA STATUS</div>
                  <div className={`text-sm font-bold font-sans ${status.color}`}>{status.label}</div>
                </div>
                <div className="ml-auto text-right text-xs font-number text-tv-muted">
                  <span>MA50: <strong className="text-white">{ma50 != null ? Math.round(ma50) : 'N/A'}</strong></span>
                  <span className="mx-2">|</span>
                  <span>MA200: <strong className="text-white">{ma200 != null ? Math.round(ma200) : 'N/A'}</strong></span>
                  <span className="mx-2">|</span>
                  <span>Harga: <strong className="text-white">{price?.toLocaleString('id-ID')}</strong></span>
                </div>
              </div>
              {maDataReady && (
                <Card padding="none" radius="lg" elevation="none" highlight={false} overflow="visible" surface="60" className="mt-2 border-tv-border px-3 py-2 text-[11px] leading-relaxed text-tv-muted">
                  <span className="font-semibold text-tv-text">Konteks tren:</span>{' '}
                  {price < (ma200 as number)
                    ? 'Momentum jangka pendek bisa membaik, tetapi tren besar belum pulih karena harga masih di bawah MA200. Sinyal bullish pendek tidak otomatis berarti uptrend jangka panjang.'
                    : price < (ma50 as number)
                      ? 'Harga masih di atas MA200, tetapi berada di bawah MA50. Ini lebih cocok dibaca sebagai koreksi jangka pendek di dalam struktur tren yang lebih kuat.'
                      : 'Harga berada di atas MA50 dan MA200. Momentum pendek dan struktur tren utama saat ini lebih selaras, tetapi tetap perlu melihat volume dan risiko.'}
                </Card>
              )}
              </>
            );
          })()}

          {viewMode === 'full' ? (
            <>
              <div className="w-full space-y-4">
                <RiskRewardCalculator currentPrice={currentPrice} analyzers={analyzers} />
                {(() => {
                  const currentPrice = typeof data?.stock?.current_price === 'number' && Number.isFinite(data.stock.current_price) && data.stock.current_price > 0 ? data.stock.current_price : null;
                  const support = analyzers.find((a) => a.label?.includes('Support'))?.raw?.support;
                  const resistance = analyzers.find((a) => a.label?.includes('Resistance'))?.raw?.resistance;
                  const stopLossPrice = data?.tradeSetup?.stop ?? (typeof support === 'number' && Number.isFinite(support) && support > 0 ? support : null);
                  const takeProfit1Price = data?.tradeSetup?.tp1 ?? (typeof resistance === 'number' && Number.isFinite(resistance) && resistance > 0 ? resistance : null);
                  const takeProfit2Price = data?.tradeSetup?.tp2 ?? null;
                  const entryPrice = data?.tradeSetup?.entry ?? currentPrice;
                  if (currentPrice == null || typeof entryPrice !== 'number' || !Number.isFinite(entryPrice) || entryPrice <= 0 || stopLossPrice == null || stopLossPrice >= entryPrice) {
                    return (
                      <Card padding="none" radius="xl" elevation="none" highlight={false} overflow="visible" surface="50" className="border-tv-border px-4 py-3 text-xs text-tv-muted">
                        Position sizing belum ditampilkan karena level stop-loss terverifikasi belum tersedia. SahamLens tidak membuat stop-loss/TP persentase default.
                      </Card>
                    );
                  }
                  return (
                    <PositionSizingCalculator
                      ticker={ticker}
                      entryPrice={entryPrice}
                      cutLossPrice={stopLossPrice}
                      takeProfit1Price={takeProfit1Price ?? undefined}
                      takeProfit2Price={takeProfit2Price ?? undefined}
                    />
                  );
                })()}
                <AlgoFilters
                  analyzers={analyzers}
                  sortByConfidence={sortByConfidence}
                  setSortByConfidence={setSortByConfidence}
                  getAccuracyPct={getAccuracyPct}
                  // Jangan membuka detail sebelum status sesi selesai diperiksa. Ini
                  // mencegah kilatan data lengkap untuk pengunjung saat halaman baru dimuat.
                  lockForGuest={lockForGuest}
                />
              </div>
            </>
          ) : (
            <div className="w-full space-y-4">
              <RiskRewardCalculator currentPrice={currentPrice} analyzers={analyzers} />
              {(() => {
                const currentPrice = typeof data?.stock?.current_price === 'number' && Number.isFinite(data.stock.current_price) && data.stock.current_price > 0 ? data.stock.current_price : null;
                const support = analyzers.find((a) => a.label?.includes('Support'))?.raw?.support;
                const resistance = analyzers.find((a) => a.label?.includes('Resistance'))?.raw?.resistance;
                const stopLossPrice = data?.tradeSetup?.stop ?? (typeof support === 'number' && Number.isFinite(support) && support > 0 ? support : null);
                const takeProfit1Price = data?.tradeSetup?.tp1 ?? (typeof resistance === 'number' && Number.isFinite(resistance) && resistance > 0 ? resistance : null);
                const takeProfit2Price = data?.tradeSetup?.tp2 ?? null;
                const entryPrice = data?.tradeSetup?.entry ?? currentPrice;
                if (currentPrice == null || typeof entryPrice !== 'number' || !Number.isFinite(entryPrice) || entryPrice <= 0 || stopLossPrice == null || stopLossPrice >= entryPrice) {
                  return (
                    <Card padding="none" radius="xl" elevation="none" highlight={false} overflow="visible" surface="50" className="border-tv-border px-4 py-3 text-xs text-tv-muted">
                      Position sizing belum ditampilkan karena level stop-loss terverifikasi belum tersedia. Tidak ada stop-loss/TP persentase default.
                    </Card>
                  );
                }
                return (
                  <PositionSizingCalculator
                    ticker={ticker}
                    entryPrice={entryPrice}
                    cutLossPrice={stopLossPrice}
                    takeProfit1Price={takeProfit1Price ?? undefined}
                    takeProfit2Price={takeProfit2Price ?? undefined}
                  />
                );
              })()}
              <Button
                type="button"
                variant="bare"
                size="none"
                onClick={() => changeViewMode('full')}
                className="w-full rounded-xl border border-tv-blue/30 bg-tv-blue/10 px-4 py-3 text-sm font-semibold text-tv-blue transition-colors hover:bg-tv-blue/15"
              >
                Lihat semua indikator teknikal & LensFlow
              </Button>
            </div>
          )}
        </div>
        </>
        )}

        <DashboardFooterActions
          stock={stock}
          ticker={ticker}
          stockNews={stockNews}
          loadingStockNews={loadingStockNews}
          newsModalOpen={newsModalOpen}
          setNewsModalOpen={setNewsModalOpen}
          showPaywall={showPaywall}
          setShowPaywall={setShowPaywall}
          showLoginPrompt={showLoginPrompt}
          setShowLoginPrompt={setShowLoginPrompt}
          usedSymbolsToday={usedSymbolsToday}
        />
      </PageContainer>

      {/* Blok <style> .custom-scrollbar dihapus: kelas itu tidak dipakai satu kali pun
          di file ini (CSS mati), dan warnanya - #131722/#2A2E39 - berasal dari palet
          yang bahkan lebih tua dari tv-* sebelum penggantian hari ini. Scrollbar
          global sudah diatur di app/globals.css. */}
    </div>
  );
}

export default function Dashboard() {
  return (
    // BUG FIX (2026-08-22): fallback sebelumnya `null` - satu-satunya titik blank yang
    // tersisa di halaman ini, berlawanan dengan disiplin skeleton ketat yang dipegang
    // DashboardLoadingState/DashboardEmptyState di atas untuk state loading berikutnya.
    // Ticker/setTicker/dst belum ada di scope ini (state-nya baru lahir di dalam
    // DashboardContent) - nilai kosong/no-op di sini murni visual, boundary-nya sendiri
    // biasanya sangat singkat (hanya untuk useSearchParams()).
    <Suspense fallback={<DashboardLoadingState ticker="" setTicker={() => {}} analisaRemaining={0} isAdminUser={false} />}>
      <DashboardContent />
    </Suspense>
  );
}
