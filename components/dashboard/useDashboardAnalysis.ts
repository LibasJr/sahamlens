'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { FREE_LIMITS } from '@/shared/constants/limits';
import { shouldShowLoginPromptFor401 } from '@/lib/auth-gate';
import { computeRole, useAuthUser } from '@/lib/hooks/useAuthUser';
import { isMarketOpen } from '@/lib/utils/market';
import { apiRequest, isApiClientError } from '@/shared/http/api-client';
import {
  buildIndexPayload,
  displayDashboardTicker,
  isIndexTicker,
  normalizeDashboardTicker,
} from '@/components/dashboard/dashboard-analysis';
import {
  OPEN_TECHNICAL_SUMMARY_EVENT,
  TECHNICAL_SUMMARY_ANCHOR_ID,
} from '@/components/StockPerspectiveNav';

export function useDashboardAnalysis() {
  const searchParams = useSearchParams();
  const { loading: authLoading, resolved: authResolved, user: authUser } = useAuthUser();
  const [ticker, setTickerState] = useState('DGWG.JK');
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [fetchErrorRequestId, setFetchErrorRequestId] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [marketClosed, setMarketClosed] = useState(false);
  const [sortByConfidence, setSortByConfidence] = useState(true);
  const [viewMode, setViewMode] = useState<'compact' | 'full'>('compact');
  const [timeframe, setTimeframe] = useState('1Y');
  const [chartCandles, setChartCandles] = useState<any[]>([]);
  const [chartRefreshKey, setChartRefreshKey] = useState(0);
  const [radarRank, setRadarRank] = useState<{ finalScore: number; topReasons?: string[] } | null>(null);
  const [stockNews, setStockNews] = useState<any[]>([]);
  const [loadingStockNews, setLoadingStockNews] = useState(true);
  const [newsModalOpen, setNewsModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [analisaRemaining, setAnalisaRemaining] = useState<number>(FREE_LIMITS.analisaPerHari);
  const [showPaywall, setShowPaywall] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [usedSymbolsToday, setUsedSymbolsToday] = useState<string[]>([]);
  const [adminReady, setAdminReady] = useState(false);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [isTrialExpired, setIsTrialExpired] = useState(false);
  const analyzerAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem('sahamlens.analysis-view.dashboard.v2');
    if (saved === 'compact' || saved === 'full') {
      setViewMode(saved);
      return;
    }
    if (window.matchMedia('(max-width: 767px)').matches) setViewMode('compact');
  }, []);

  const changeViewMode = (mode: 'compact' | 'full') => {
    setViewMode(mode);
    window.localStorage.setItem('sahamlens.analysis-view.dashboard.v2', mode);
  };

  const openFullAnalysis = () => {
    changeViewMode('full');
    window.requestAnimationFrame(() => {
      const detail = document.getElementById('analysis-detail');
      detail?.focus({ preventScroll: true });
      detail?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  /**
   * Tab "Summary" di bar sudut pandang menunjuk ke #analysis-detail, tetapi kartunya cuma
   * ada di DOM saat mode penuh. Dua jalur masuk yang harus sama-sama bekerja:
   *
   * - dari halaman LAIN, Link membawa hash-nya ke sini dan yang membaca adalah pemeriksaan
   *   saat pasang di bawah;
   * - dari `/dashboard` sendiri, App Router mengganti URL lewat `pushState` yang TIDAK
   *   memicu `hashchange`, jadi yang dipakai adalah event yang disiarkan navigasinya.
   */
  useEffect(() => {
    const bukaRingkasan = () => openFullAnalysis();
    const bukaKalauDijangkar = () => {
      if (window.location.hash === `#${TECHNICAL_SUMMARY_ANCHOR_ID}`) openFullAnalysis();
    };

    bukaKalauDijangkar();
    window.addEventListener(OPEN_TECHNICAL_SUMMARY_EVENT, bukaRingkasan);
    window.addEventListener('hashchange', bukaKalauDijangkar);
    return () => {
      window.removeEventListener(OPEN_TECHNICAL_SUMMARY_EVENT, bukaRingkasan);
      window.removeEventListener('hashchange', bukaKalauDijangkar);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const collapseAnalysis = () => {
    changeViewMode('compact');
    window.requestAnimationFrame(() => {
      document.getElementById('score-summary')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const setTicker = (newTicker: string) => {
    const nextTicker = normalizeDashboardTicker(newTicker);
    setTickerState(nextTicker);
    if (!isIndexTicker(nextTicker)) {
      localStorage.setItem('last_searched_ticker', nextTicker);
    }
  };

  const fetchAnalyzerData = async (symbol: string) => {
    if (isIndexTicker(symbol)) {
      setLoading(false);
      setFetchError(false);
      return;
    }
    analyzerAbortRef.current?.abort();
    const controller = new AbortController();
    analyzerAbortRef.current = controller;
    setLoading(true);
    setFetchError(false);
    setFetchErrorRequestId(null);
    setData(null);
    setLastUpdate(null);
    setRadarRank(null);

    try {
      const payload = await apiRequest<any>(`/api/stock/${symbol}`, { cache: 'no-store', signal: controller.signal });

      if (!payload?.stock) {
        setFetchError(true);
        return;
      }

      setData(payload);
      const sourceTime = new Date(payload?._meta?.dataTimestamp);
      setLastUpdate(Number.isNaN(sourceTime.getTime()) ? null : sourceTime);
      apiRequest<any>('/api/ai-pick', { cache: 'no-store', signal: controller.signal })
        .then((result) => {
          const match = (result?.items || []).find((item: any) => item.symbol.replace('.JK', '') === symbol.replace('.JK', ''));
          setRadarRank(match ? { finalScore: match.finalScore, topReasons: match.topReasons } : null);
        })
        .catch(() => setRadarRank(null));

      if (payload._quota) {
        setAnalisaRemaining(payload._quota.remaining);
        setUsedSymbolsToday(payload._quota.usedSymbols || []);
      } else {
        setAnalisaRemaining(Infinity);
      }

      window.dispatchEvent(new CustomEvent('update-ai-context', {
        detail: {
          symbol,
          price: payload.stock?.current_price,
          analyzers: payload.analyzers,
          council: payload.council,
          technical: payload.technical,
          consensus: payload.consensus,
          score: payload.score,
          modelSignal: payload.scoring?.kategori,
          decision: payload.decision,
          eligibility: payload.eligibility,
        },
      }));
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (isApiClientError(error) && error.code === 'UNAUTHENTICATED') {
        if (await shouldShowLoginPromptFor401()) setShowLoginPrompt(true);
        else { setFetchError(true); setFetchErrorRequestId(error.requestId); }
        return;
      }
      if (isApiClientError(error) && error.code === 'SUBSCRIPTION_REQUIRED') {
        const body = error.body && typeof error.body === 'object' ? error.body as any : null;
        setAnalisaRemaining(0);
        setUsedSymbolsToday(body?.usedSymbols || []);
        setShowPaywall(true);
        return;
      }
      console.error('Failed to fetch data', error);
      setFetchError(true);
      if (isApiClientError(error)) setFetchErrorRequestId(error.requestId);
    } finally {
      if (analyzerAbortRef.current === controller) {
        analyzerAbortRef.current = null;
        setLoading(false);
      }
    }
  };

  const handleRefresh = () => {
    if (isIndexTicker(ticker)) {
      setChartRefreshKey((value) => value + 1);
      return;
    }
    void fetchAnalyzerData(ticker);
  };

  useEffect(() => {
    setMounted(true);
    const urlSymbol = searchParams.get('symbol');
    if (urlSymbol) {
      setTicker(urlSymbol.toUpperCase());
    } else {
      const savedTicker = localStorage.getItem('last_searched_ticker');
      if (savedTicker) setTickerState(normalizeDashboardTicker(savedTicker));
    }
  }, [searchParams]);

  useEffect(() => {
    if (authLoading) return;
    if (!authResolved) {
      setAdminReady(true);
      return;
    }
    const role = computeRole(authUser);
    setIsAdminUser(authUser?.role === 'admin');
    setIsTrialExpired(role.isTrialExpired);
    setShowPaywall(role.isTrialExpired);
    setAdminReady(true);
  }, [authLoading, authResolved, authUser]);

  useEffect(() => {
    if (!mounted || !adminReady) return;
    if (isIndexTicker(ticker)) {
      setMarketClosed(!isMarketOpen(new Date()));
      setLoading(false);
      setShowLoginPrompt(false);
      setShowPaywall(false);
      return;
    }

    setMarketClosed(!isMarketOpen(new Date()));
    void fetchAnalyzerData(ticker);
    const interval = window.setInterval(() => {
      const closed = !isMarketOpen(new Date());
      setMarketClosed(closed);
      if (!document.hidden && !closed) void fetchAnalyzerData(ticker);
    }, 60000);

    return () => {
      window.clearInterval(interval);
      analyzerAbortRef.current?.abort();
    };
  }, [ticker, mounted, adminReady]);

  useEffect(() => {
    if (!mounted) return;
    const controller = new AbortController();
    const code = ticker.replace('.JK', '');
    setChartCandles([]);
    if (isIndexTicker(ticker)) {
      setData(null);
      setLoading(true);
      setFetchError(false);
    }
    apiRequest<any>(`/api/public-chart/${encodeURIComponent(isIndexTicker(ticker) ? 'IHSG' : code)}?tf=${timeframe}`, { signal: controller.signal })
      .then((payload) => {
        if (payload?.history?.length > 0) {
          setChartCandles(payload.history);
          if (isIndexTicker(ticker)) {
            const indexPayload = buildIndexPayload('^JKSE', payload.history);
            setData(indexPayload);
            const sourceTime = new Date(indexPayload._meta?.dataTimestamp);
            setLastUpdate(Number.isNaN(sourceTime.getTime()) ? null : sourceTime);
          }
        } else if (isIndexTicker(ticker)) {
          setFetchError(true);
        }
      })
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          console.error('Chart fetch failed', error);
          if (isIndexTicker(ticker)) {
            setFetchError(true);
            if (isApiClientError(error)) setFetchErrorRequestId(error.requestId);
          }
        }
      })
      .finally(() => {
        if (isIndexTicker(ticker) && !controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [ticker, timeframe, mounted, chartRefreshKey]);

  useEffect(() => {
    if (!mounted || !data?.stock?.symbol) return;
    const controller = new AbortController();
    setLoadingStockNews(true);
    const code = ticker.replace('.JK', '');
    const name = data.stock.name || '';
    apiRequest<any>(`/api/news/stock/${code}?name=${encodeURIComponent(name)}`, { signal: controller.signal })
      .then((payload) => setStockNews(payload?.items || []))
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) console.error('Stock news fetch failed', error);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingStockNews(false);
      });
    return () => controller.abort();
  }, [ticker, mounted, data?.stock?.symbol]);

  return {
    ticker,
    setTicker,
    loading,
    fetchError,
    fetchErrorRequestId,
    data,
    lastUpdate,
    marketClosed,
    sortByConfidence,
    setSortByConfidence,
    viewMode,
    changeViewMode,
    openFullAnalysis,
    collapseAnalysis,
    timeframe,
    setTimeframe,
    chartCandles,
    radarRank,
    stockNews,
    loadingStockNews,
    newsModalOpen,
    setNewsModalOpen,
    analisaRemaining,
    showPaywall,
    setShowPaywall,
    showLoginPrompt,
    setShowLoginPrompt,
    usedSymbolsToday,
    isAdminUser,
    isTrialExpired,
    lockForGuest: !authResolved || authLoading || !authUser,
    handleRefresh,
    displayTicker: displayDashboardTicker,
  };
}
