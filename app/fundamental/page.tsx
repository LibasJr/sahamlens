'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Header from '@/components/Header';
const IntrinsicValue = dynamic(() => import('@/components/IntrinsicValue'), {
  ssr: false,
  loading: () => (
    <div className="min-h-[320px] animate-pulse rounded-lg bg-tv-card" aria-label="Memuat grafik nilai intrinsik" />
  ),
});
import PaywallModal from '@/components/PaywallModal';
import { FREE_LIMITS } from '@/shared/constants/limits';
import { MONTHLY_PRICE, formatRupiah } from '@/shared/config/pricing';
import { isMarketOpen } from '@/lib/utils/market';
import { ApiErrorHint, PageContainer, Skeleton, EmptyState, LoadingFact } from '@/components/ui';
import { shouldShowLoginPromptFor401 } from '@/lib/auth-gate';
import { useAuthUser } from '@/lib/hooks/useAuthUser';
import { trackProductFunnelEvent } from '@/shared/analytics/product-funnel';
import { useLanguage } from '@/lib/i18n';
import FundamentalHealthSuite from '@/components/fundamental/FundamentalHealthSuite';
import FundamentalHealthSummary from '@/components/fundamental/FundamentalHealthSummary';
import FundamentalOverview from '@/components/fundamental/FundamentalOverview';
import FundamentalAnalyzerGrid from '@/components/fundamental/FundamentalAnalyzerGrid';
import dynamic from 'next/dynamic';
import { apiRequest, isApiClientError } from '@/shared/http/api-client';
import MenuUsageGuide from '@/components/MenuUsageGuide';
import type {
  FundamentalAnalyzerResult,
  FundamentalApiResponse,
  StockApiResponseForFundamentalMerge,
} from '@/modules/fundamental/contracts';

// Normalisasi simbol: pastikan hanya 1x .JK
const displayTicker = (s: string) => s.replace('.JK', '').replace('.JK', '');

const FUNDAMENTAL_GUEST_VISIBLE_KEYWORDS = ['P/E', 'PBV', 'ROE'];

function isVisibleForFundamentalGuest(label: string): boolean {
  return FUNDAMENTAL_GUEST_VISIBLE_KEYWORDS.some((keyword) => label.includes(keyword));
}

type LocalDirectionObservation = {
  aligned: number;
  opposed: number;
  totalGapHours: number;
  gapSamples: number;
};

function FundamentalContent() {
  const { language } = useLanguage();
  const isEn = language === 'en';
  const searchParams = useSearchParams();
  const { loading: authLoading, resolved: authResolved, user } = useAuthUser();
  const [ticker, setTickerState] = useState('BBCA');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<FundamentalApiResponse | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [marketClosed, setMarketClosed] = useState(false);
  const [localObservations, setLocalObservations] = useState<Record<string, LocalDirectionObservation>>({});
  const [sortByConfidence, setSortByConfidence] = useState(false);
  const [viewMode, setViewMode] = useState<'compact' | 'full'>('full');
  const [mounted, setMounted] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [, setFetchError] = useState(false);
  const [fetchErrorRequestId, setFetchErrorRequestId] = useState<string | null>(null);
  const fundamentalExportRef = useRef<HTMLDivElement>(null);
  const lockedViewTrackedForTicker = useRef<string | null>(null);
  const analyzerAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem('sahamlens.analysis-view.fundamental');
    if (saved === 'compact' || saved === 'full') {
      setViewMode(saved);
      return;
    }
    if (window.matchMedia('(max-width: 767px)').matches) setViewMode('compact');
  }, []);

  const changeViewMode = (mode: 'compact' | 'full') => {
    setViewMode(mode);
    window.localStorage.setItem('sahamlens.analysis-view.fundamental', mode);
  };

  const setTicker = (newTicker: string) => {
    setTickerState(newTicker);
    if (typeof window !== 'undefined') {
      localStorage.setItem('last_searched_ticker', newTicker);
    }
  };

  const fetchAnalyzerData = async (symbol: string) => {
    analyzerAbortRef.current?.abort();
    const controller = new AbortController();
    analyzerAbortRef.current = controller;
    setLoading(true);
    setFetchError(false);
    setFetchErrorRequestId(null);
    setShowLoginPrompt(false);
    setShowPaywall(false);
    try {
      const [stockResult, fundamentalResult] = await Promise.allSettled([
        apiRequest<StockApiResponseForFundamentalMerge>(`/api/stock/${symbol}`, { signal: controller.signal }),
        apiRequest<FundamentalApiResponse>(`/api/fundamental/${symbol}`, { signal: controller.signal }),
      ]);
      if (controller.signal.aborted) return;
      const jsonStock = stockResult.status === 'fulfilled' ? stockResult.value : null;
      if (fundamentalResult.status === 'rejected') {
        const err = fundamentalResult.reason;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setFetchErrorRequestId(isApiClientError(err) ? err.requestId : null);
        if (isApiClientError(err) && err.code === 'UNAUTHENTICATED') {
          if (await shouldShowLoginPromptFor401()) setShowLoginPrompt(true);
          else setFetchError(true);
          return;
        }
        if (isApiClientError(err) && (err.code === 'SUBSCRIPTION_REQUIRED' || err.status === 402)) {
          setShowPaywall(true);
          return;
        }
        setFetchError(true);
        return;
      }
      const jsonAlgo = fundamentalResult.value;
      if (!jsonAlgo?.stock) { setFetchError(true); return; }

      jsonAlgo.stock.history = jsonStock?.stock?.history || [];
      jsonAlgo.stock.listing_board = jsonStock?.stock?.listing_board ?? null;
      jsonAlgo._meta = jsonStock?._meta ?? null;
      setData(jsonAlgo);
      const sourceTime = jsonAlgo._meta?.dataTimestamp ? new Date(jsonAlgo._meta.dataTimestamp) : null;
      setLastUpdate(sourceTime && !Number.isNaN(sourceTime.getTime()) ? sourceTime : null);

      window.dispatchEvent(new CustomEvent('update-ai-context', {
        detail: {
          symbol,
          price: jsonAlgo.stock?.current_price,
          analyzers: jsonAlgo.analyzers,
          consensus: jsonAlgo.consensus,
          modelSignal: jsonStock?.scoring?.kategori,
          decision: jsonStock?.decision,
          eligibility: jsonStock?.eligibility,
        },
      }));

      if (jsonAlgo.price != null) {
        trackLocalDirectionObservation(symbol, jsonAlgo.price, jsonAlgo.analyzers);
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      console.error('Failed to fetch data', e);
      setFetchErrorRequestId(isApiClientError(e) ? e.requestId : null);
      setFetchError(true);
    } finally {
      if (analyzerAbortRef.current === controller) {
        analyzerAbortRef.current = null;
        setLoading(false);
      }
    }
  };

  const trackLocalDirectionObservation = (sym: string, price: number, analyzers: FundamentalAnalyzerResult[]) => {
    if (!Number.isFinite(price) || price <= 0 || !Array.isArray(analyzers)) return;
    try {
      const historyKey = 'fundamental_local_observations_v2';
      const history = JSON.parse(localStorage.getItem(historyKey) || '{}');
      if (!history[sym]) history[sym] = {};

      const storageKey = `fundamental_local_tracker_v2_${sym}`;
      const lastTracker = JSON.parse(localStorage.getItem(storageKey) || 'null');
      const nowMs = Date.now();
      const lastObservedMs = lastTracker?.observedAt ? Date.parse(lastTracker.observedAt) : NaN;
      const gapHours = Number.isFinite(lastObservedMs) && nowMs > lastObservedMs
        ? (nowMs - lastObservedMs) / 3_600_000
        : null;

      if (lastTracker && Number.isFinite(lastTracker.price) && lastTracker.price !== price) {
        const priceMovedUp = price > lastTracker.price;
        const priceMovedDown = price < lastTracker.price;

        if (priceMovedUp || priceMovedDown) {
          for (const pastAlgo of Array.isArray(lastTracker.analyzers) ? lastTracker.analyzers : []) {
            if (!pastAlgo?.label || !['BULLISH', 'BEARISH', 'NEUTRAL'].includes(pastAlgo.decision)) continue;
            if (pastAlgo.decision === 'NEUTRAL') continue;
            if (!history[sym][pastAlgo.label]) {
              history[sym][pastAlgo.label] = { aligned: 0, opposed: 0, totalGapHours: 0, gapSamples: 0 };
            }

            const stat = history[sym][pastAlgo.label] as LocalDirectionObservation;
            if ((priceMovedUp && pastAlgo.decision === 'BULLISH') ||
                (priceMovedDown && pastAlgo.decision === 'BEARISH')) {
              stat.aligned++;
            } else {
              stat.opposed++;
            }
            if (gapHours != null && Number.isFinite(gapHours) && gapHours > 0) {
              stat.totalGapHours += gapHours;
              stat.gapSamples++;
            }
          }
          localStorage.setItem(historyKey, JSON.stringify(history));
        }
      }

      localStorage.setItem(storageKey, JSON.stringify({
        price,
        observedAt: new Date(nowMs).toISOString(),
        analyzers: analyzers.map((algo) => ({ label: algo?.label, decision: algo?.decision })),
      }));
      setLocalObservations(history[sym] || {});
    } catch {
      // Statistik lokal bersifat opsional; kegagalan localStorage tidak boleh mengubah
      // hasil fundamental, score, ataupun membuat fallback angka.
    }
  };

  const handleRefresh = () => {
    fetchAnalyzerData(ticker);
  };

  useEffect(() => {
    setMounted(true);
    const urlSymbol = searchParams.get('symbol');
    if (urlSymbol) {
      setTicker(urlSymbol.toUpperCase());
      return;
    }
    const savedTicker = localStorage.getItem('last_searched_ticker');
    if (savedTicker && savedTicker !== ticker) {
      setTickerState(savedTicker);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mounted) return;
    setMarketClosed(!isMarketOpen(new Date()));
    fetchAnalyzerData(ticker);

    const interval = setInterval(() => {
      const closed = !isMarketOpen(new Date());
      setMarketClosed(closed);
      if (!document.hidden && !closed) {
        fetchAnalyzerData(ticker);
      }
    }, 60000);

    return () => {
      clearInterval(interval);
      analyzerAbortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker, mounted]);

  useEffect(() => {
    const hasLockedCards = Array.isArray(data?.analyzers) && data.analyzers.some(
      (analyzer: { label?: string }) => !isVisibleForFundamentalGuest(analyzer.label || ''),
    );
    if (!authResolved || authLoading || user || !hasLockedCards || lockedViewTrackedForTicker.current === ticker) return;
    lockedViewTrackedForTicker.current = ticker;
    trackProductFunnelEvent('locked_view', 'fundamental_indicators');
  }, [authLoading, authResolved, data?.analyzers, ticker, user]);

  const formatTime = (date: Date | null) => {
    if (!date) return '-';
    return new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date) + ' WIB';
  };

  const stock = data?.stock || {};
  const marketSnapshotAt = data?._meta?.dataTimestamp ? new Date(data._meta.dataTimestamp) : null;
  let analyzers = data?.analyzers || [];

  if (loading && !data) {
    return (
      <div className="flex-1 flex flex-col bg-tv-bg min-h-screen">
        <Header currentTicker={ticker} onTickerChange={setTicker} moduleTitle="LensFundamental" moduleBank="LENSFUNDAMENTAL" />
        <PageContainer className="p-4 md:p-6 lg:p-7 space-y-10">
        <MenuUsageGuide
          menuKey="fundamental"
          whatItAnswers="Bisnis di balik saham ini sehat atau tidak?"
          steps={[
            "Ketik kode saham untuk memuat laporan keuangannya.",
            "Lihat rasio profitabilitas dan neraca - itu inti kualitas bisnisnya.",
            "Bandingkan dengan pertumbuhannya: laba naik tapi utang ikut naik bukan hal yang sama.",
          ]}
        />
          <Skeleton className="h-24 w-full" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Skeleton className="h-48 w-full" />
            <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-3 gap-4">
              {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
            </div>
          </div>
          <LoadingFact />
        </PageContainer>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex-1 flex flex-col bg-tv-bg min-h-screen">
        <Header
          currentTicker={ticker}
          onTickerChange={setTicker}
          moduleTitle="LensFundamental"
          moduleBank="LENSFUNDAMENTAL"
        />
        <PageContainer className="p-4 md:p-6 lg:p-7">
          {showLoginPrompt ? (
            <EmptyState
              illustration="locked"
              title="Analisa fundamental butuh akun"
              description="Daftar gratis untuk memakai seluruh fitur selama masa pengujian."
              action={{ label: 'Daftar Gratis', onClick: () => { window.location.href = '/signup'; } }}
            />
          ) : showPaywall ? (
            <EmptyState
              illustration="locked"
              title="Kuota analisa hari ini sudah habis"
              description={`Kuota gratis ${FREE_LIMITS.analisaPerHari} analisa per hari sudah terpakai. Kuota disetel ulang besok.`}
              action={{ label: 'Lihat Paket Pro', onClick: () => setShowPaywall(true) }}
            />
          ) : (
            <>
              <EmptyState
                illustration="empty"
                title={`Data fundamental ${displayTicker(ticker)} belum tersedia`}
                description="Sumber data sedang tidak membalas atau emiten ini belum punya data fundamental lengkap. Coba ulangi sebentar lagi, atau buka Teknikal untuk melihat harga, tren, dan level penting terlebih dulu."
                action={{ label: 'Coba lagi', onClick: () => fetchAnalyzerData(ticker) }}
              />
              <ApiErrorHint requestId={fetchErrorRequestId} className="justify-center mt-2" />
            </>
          )}
        </PageContainer>
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
        />
        <PaywallModal
          open={showLoginPrompt}
          onClose={() => setShowLoginPrompt(false)}
          title="Daftar Dulu untuk Lihat Hasil"
          body="Analisa fundamental butuh akun gratis. Daftar untuk memakai fitur selama masa pengujian."
          ctaHref="/signup"
          ctaLabel="Daftar Gratis"
          secondaryLabel="Nanti"
        />
      </div>
    );
  }

  if (sortByConfidence) {
    analyzers = [...analyzers].sort((a, b) => b.confidence - a.confidence);
  }

  const getLocalObservation = (algoName: string) => {
    const stat = localObservations[algoName];
    if (!stat) return null;
    const total = stat.aligned + stat.opposed;
    if (total <= 0) return null;
    const avgGapHours = stat.gapSamples > 0 ? stat.totalGapHours / stat.gapSamples : null;
    return { ...stat, total, avgGapHours };
  };

  const filteredAnalyzers = analyzers.filter((algo) => {
    if (algo.value === 'N/A' && algo.confidence === 0) return false;
    if (data?.profile?.sector?.includes('Financial') || data?.profile?.industry?.includes('Bank')) {
      if (algo.label?.includes('Debt') || algo.label?.includes('Current Ratio') || algo.label?.includes('Quick Ratio')) return false;
    }
    return true;
  });

  const compactAnalyzers = (() => {
    const groups = [
      ['P/E', 'PBV', 'Valuation'],
      ['ROE', 'ROA', 'Profitability'],
      ['Operating Margin', 'Net Profit Margin', 'Revenue Growth', 'EPS Growth', 'Dividend Yield'],
    ];
    const picked: FundamentalAnalyzerResult[] = [];
    for (const keywords of groups) {
      const candidates = filteredAnalyzers.filter((algo) => keywords.some((k) => algo.label?.includes(k)) && !picked.includes(algo));
      candidates.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
      if (candidates[0]) picked.push(candidates[0]);
    }
    for (const algo of filteredAnalyzers) {
      if (picked.length >= 3) break;
      if (!picked.includes(algo)) picked.push(algo);
    }
    return picked.slice(0, 3);
  })();
  const displayedAnalyzers = viewMode === 'compact' ? compactAnalyzers : filteredAnalyzers;
  const noLocalObservationCount = displayedAnalyzers.filter((algo) => getLocalObservation(algo.label) == null).length;
  const isConfirmedGuest = authResolved && !authLoading && !user;
  const lockedAnalyzerCount = isConfirmedGuest
    ? filteredAnalyzers.filter((algo) => !isVisibleForFundamentalGuest(algo.label)).length
    : 0;

  const isBankProfile = Boolean(
    data?.profile?.sector?.includes('Financial') || data?.profile?.industry?.includes('Bank'),
  );

  return (
    <div className="flex-1 flex flex-col bg-tv-bg min-h-screen">
      <Header
        currentTicker={ticker}
        onTickerChange={setTicker}
        moduleTitle="LensFundamental"
        moduleBank="LENSFUNDAMENTAL"
        stockNav
      />

      <PageContainer className="p-4 md:p-6 lg:p-7 space-y-10">
        <FundamentalOverview
          data={data}
          ticker={ticker}
          stock={stock}
          loading={loading}
          marketClosed={marketClosed}
          marketSnapshotAt={marketSnapshotAt}
          lastUpdate={lastUpdate}
          exportRef={fundamentalExportRef}
          viewMode={viewMode}
          onViewModeChange={changeViewMode}
          onRefresh={handleRefresh}
          formatTime={formatTime}
        />

          <FundamentalHealthSummary
            fundamentals={data?.fundamentals}
            consensus={data?.consensus}
            isBank={isBankProfile}
            loading={loading}
            ticker={ticker}
          />

          <FundamentalAnalyzerGrid
            displayedAnalyzers={displayedAnalyzers}
            filteredAnalyzers={filteredAnalyzers}
            metricProvenance={data?.provenance?.fundamentals}
            loading={loading}
            sortByConfidence={sortByConfidence}
            onToggleSort={() => setSortByConfidence((value) => !value)}
            lockedAnalyzerCount={lockedAnalyzerCount}
            noLocalObservationCount={noLocalObservationCount}
            viewMode={viewMode}
            onShowAll={() => changeViewMode('full')}
            isConfirmedGuest={isConfirmedGuest}
            isEn={isEn}
            isVisibleForGuest={isVisibleForFundamentalGuest}
            getLocalObservation={getLocalObservation}
          />

          <div className="w-full">
            <FundamentalHealthSuite
              fundamentals={data?.fundamentals}
              profile={data?.profile}
              analyzers={data?.analyzers}
            />
          </div>

          <div className="w-full">
            <IntrinsicValue
              symbol={ticker}
              isAuthenticated={Boolean(user)}
              authResolved={authResolved && !authLoading}
            />
          </div>
      </PageContainer>

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
        body="Analisa fundamental butuh akun gratis. Daftar untuk memakai fitur selama masa pengujian."
        ctaHref="/signup"
        ctaLabel="Daftar Gratis"
        secondaryLabel="Nanti"
      />
    </div>
  );
}

function FundamentalSuspenseFallback() {
  return (
    <div className="flex-1 flex flex-col bg-tv-bg min-h-screen">
      <PageContainer className="p-4 md:p-6 lg:p-7 space-y-10">
        <Skeleton className="h-24 w-full" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-48 w-full" />
          <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-3 gap-4">
            {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
          </div>
        </div>
      </PageContainer>
    </div>
  );
}

export default function FundamentalPage() {
  return (
    <Suspense fallback={<FundamentalSuspenseFallback />}>
      <FundamentalContent />
    </Suspense>
  );
}
