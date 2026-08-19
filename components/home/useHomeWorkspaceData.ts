'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Language } from '@/lib/i18n';
import { apiRequest, isApiClientError } from '@/shared/http/api-client';

export interface MarketMover {
  symbol: string;
  changePct: number;
  price: number;
  volume?: number;
  score?: number;
}

export interface DailyPickCounts {
  attractive: { count: number };
  breakout: { count: number };
  undervalue: { count: number };
  foreignAccumulation: { count: number };
  goldenCross: { count: number; stale: boolean; items?: string[] };
  deadCross: { count: number; stale: boolean; items?: string[] };
}

export interface NewsInsight {
  title: string;
  sentiment: 'POSITIF' | 'NEGATIF' | 'NETRAL';
}

export interface CalendarEventPreview {
  date: string;
  symbol: string;
  type: 'DIVIDEND' | 'EARNINGS';
  title: string;
}

export interface RadarItem {
  symbol: string;
  price: number;
  changePct: number;
  finalScore: number;
  coverage?: number | null;
  signals?: string[];
  topReasons?: string[];
  flagged: boolean;
  flagReason: string | null;
}

export interface MarketPulse {
  sectorHeatmap: { sector: string; color: string; changePct: number }[];
  breadth: { advancing: number; declining: number; total: number };
}

function todayJakarta(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
}

async function jsonOrNull(url: string, init?: RequestInit, onError?: (error: unknown) => void): Promise<any | null> {
  try {
    return await apiRequest<any>(url, init);
  } catch (error) {
    onError?.(error);
    return null;
  }
}

export function useHomeWorkspaceData(language: Language) {
  const [ihsg, setIhsg] = useState<{ price: number; changePct: number } | null>(null);
  const [topGainers, setTopGainers] = useState<MarketMover[]>([]);
  const [topLosers, setTopLosers] = useState<MarketMover[]>([]);
  const [topVolume, setTopVolume] = useState<MarketMover[]>([]);
  const [topTechnical, setTopTechnical] = useState<MarketMover[]>([]);
  const [topTechnicalBearish, setTopTechnicalBearish] = useState<MarketMover[]>([]);
  const [topRsiOversold, setTopRsiOversold] = useState<MarketMover[]>([]);
  const [dailyPicks, setDailyPicks] = useState<DailyPickCounts | null>(null);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEventPreview[] | null>(null);
  const [radarItems, setRadarItems] = useState<RadarItem[]>([]);
  const [loadingRadar, setLoadingRadar] = useState(true);
  const [radarError, setRadarError] = useState(false);
  const [radarPreparing, setRadarPreparing] = useState(false);
  const [radarStale, setRadarStale] = useState(false);
  const [watchlistCount, setWatchlistCount] = useState<number | null>(null);
  const [watchlistPreview, setWatchlistPreview] = useState<{ symbol: string }[]>([]);
  const [moversFreshness, setMoversFreshness] = useState<string | null>(null);
  const [moversTimeLabel, setMoversTimeLabel] = useState<string | null>(null);
  const [marketError, setMarketError] = useState(false);
  const [loadingMarket, setLoadingMarket] = useState(true);
  const [loadingDailyPicks, setLoadingDailyPicks] = useState(true);
  const [picksNeedPro, setPicksNeedPro] = useState(false);
  const [picksLoginRequired, setPicksLoginRequired] = useState(false);
  const [aiBriefing, setAiBriefing] = useState<string | null>(null);
  const [newsInsights, setNewsInsights] = useState<NewsInsight[]>([]);
  const [marketPulse, setMarketPulse] = useState<MarketPulse | null>(null);
  const [marketPulseNeedPro, setMarketPulseNeedPro] = useState(false);
  const [marketPulseLoginRequired, setMarketPulseLoginRequired] = useState(false);
  const [marketPulseError, setMarketPulseError] = useState(false);
  const [loadingMarketPulse, setLoadingMarketPulse] = useState(true);
  const [supportRequestId, setSupportRequestId] = useState<string | null>(null);

  const rememberApiError = useCallback((error: unknown) => {
    if (isApiClientError(error) && error.requestId) setSupportRequestId(error.requestId);
  }, []);

  const fetchMarket = useCallback(() => {
    setLoadingMarket(true);
    setMarketError(false);

    Promise.all([
      jsonOrNull('/api/live/^JKSE', { cache: 'no-store' }, rememberApiError),
      jsonOrNull('/api/market-summary', { cache: 'no-store' }, rememberApiError),
    ])
      .then(([liveJkse, summary]) => {
        if (!liveJkse || !summary) {
          setMarketError(true);
          return;
        }

        if (
          typeof liveJkse.price === 'number' &&
          Number.isFinite(liveJkse.price) &&
          liveJkse.price > 0 &&
          typeof liveJkse.changePercent === 'number' &&
          Number.isFinite(liveJkse.changePercent)
        ) {
          setIhsg({ price: liveJkse.price, changePct: liveJkse.changePercent });
        }

        setTopGainers((summary.topGainers || []).slice(0, 10));
        setTopLosers((summary.topLosers || []).slice(0, 10));
        setTopVolume((summary.topVolume || []).slice(0, 10));
        setTopTechnical((summary.topTechnical || []).slice(0, 10));
        setTopTechnicalBearish((summary.topTechnicalBearish || []).slice(0, 10));
        setTopRsiOversold((summary.topRsiOversold || []).slice(0, 10));
        setMoversFreshness(summary._meta?.freshness ?? null);

        const snapshotTime = new Date(summary.timestamp);
        setMoversTimeLabel(
          Number.isNaN(snapshotTime.getTime())
            ? null
            : `${new Intl.DateTimeFormat('id-ID', {
                timeZone: 'Asia/Jakarta',
                weekday: 'short',
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              }).format(snapshotTime)} WIB`,
        );
      })
      .finally(() => setLoadingMarket(false));
  }, [rememberApiError]);

  const fetchMarketPulse = useCallback(() => {
    setLoadingMarketPulse(true);
    setMarketPulseError(false);
    setMarketPulseLoginRequired(false);
    setMarketPulseNeedPro(false);

    apiRequest<any>('/api/market-pulse', { cache: 'no-store' })
      .then((data) => {
        if (data?.breadth && data?.sectorHeatmap) {
          setMarketPulse({ sectorHeatmap: data.sectorHeatmap, breadth: data.breadth });
        }
      })
      .catch((error) => {
        if (isApiClientError(error) && error.code === 'UNAUTHENTICATED') setMarketPulseLoginRequired(true);
        else if (isApiClientError(error) && error.code === 'SUBSCRIPTION_REQUIRED') setMarketPulseNeedPro(true);
        else setMarketPulseError(true);
        rememberApiError(error);
      })
      .finally(() => setLoadingMarketPulse(false));
  }, [rememberApiError]);

  const fetchRadar = useCallback(() => {
    setLoadingRadar(true);
    setRadarError(false);
    setRadarPreparing(false);
    setPicksLoginRequired(false);
    setPicksNeedPro(false);

    apiRequest<any>('/api/ai-pick', { cache: 'no-store' })
      .then((data) => {
        if (!data || data.error) {
          setRadarError(true);
          return;
        }
        if (data.ready === false) {
          setRadarItems([]);
          setRadarStale(false);
          setRadarPreparing(true);
          return;
        }
        setRadarItems(data.items || []);
        setRadarStale(Boolean(data.stale));
      })
      .catch((error) => {
        if (isApiClientError(error) && error.code === 'UNAUTHENTICATED') setPicksLoginRequired(true);
        else if (isApiClientError(error) && error.code === 'SUBSCRIPTION_REQUIRED') setPicksNeedPro(true);
        else setRadarError(true);
        rememberApiError(error);
      })
      .finally(() => setLoadingRadar(false));
  }, [rememberApiError]);

  useEffect(() => {
    fetchMarket();
    fetchMarketPulse();
    fetchRadar();

    jsonOrNull('/api/daily-picks', { cache: 'no-store' }, rememberApiError)
      .then((data) => {
        if (data && !data.error) setDailyPicks(data);
      })
      .finally(() => setLoadingDailyPicks(false));

    jsonOrNull('/api/calendar', { cache: 'no-store' }, rememberApiError).then((data) => {
      const map = data?.events as Record<string, Omit<CalendarEventPreview, 'date'>[]> | undefined;
      if (!map) {
        setCalendarEvents([]);
        return;
      }
      const today = todayJakarta();
      const flat = Object.entries(map)
        .filter(([date]) => date >= today)
        .flatMap(([date, events]) => events.map((event) => ({ date, ...event })))
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 5);
      setCalendarEvents(flat);
    });

    apiRequest<any>('/api/watchlist', { cache: 'no-store' })
      .then((data) => {
        const list = data?.data || [];
        setWatchlistCount(list.length);
        setWatchlistPreview(list.slice(0, 3));
      })
      .catch((error) => {
        if (isApiClientError(error) && error.code === 'UNAUTHENTICATED') setWatchlistCount(-1);
        else setWatchlistCount(null);
        rememberApiError(error);
      });

    jsonOrNull('/api/news', undefined, rememberApiError).then((data) => {
      const items = Array.isArray(data?.items) ? data.items.slice(0, 4) : [];
      setNewsInsights(items.map((item: any) => ({ title: item.title, sentiment: item.sentiment })));
    });
  }, [fetchMarket, fetchMarketPulse, fetchRadar, rememberApiError]);

  const topPick = radarItems[0];

  useEffect(() => {
    if (loadingMarket || loadingRadar || loadingDailyPicks) return;
    setAiBriefing(null);

    apiRequest<any>('/api/ai-briefing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topPick: topPick
          ? {
              ticker: topPick.symbol.replace('.JK', ''),
              consensus: topPick.flagged ? topPick.flagReason : language === 'en' ? 'Strong Signal' : 'Sinyal Kuat',
              confidence: topPick.finalScore,
            }
          : null,
        indices: ihsg ? [{ name: 'IHSG', changePct: ihsg.changePct }] : [],
        pickCounts: dailyPicks
          ? {
              attractive: dailyPicks.attractive.count,
              breakout: dailyPicks.breakout.count,
              undervalue: dailyPicks.undervalue.count,
            }
          : undefined,
        lang: language,
      }),
    })
      .then((data) => {
        if (data?.briefing) setAiBriefing(data.briefing);
      })
      .catch((error) => rememberApiError(error));
  }, [dailyPicks, ihsg, language, loadingDailyPicks, loadingMarket, loadingRadar, rememberApiError, topPick]);

  return {
    ihsg,
    topGainers,
    topLosers,
    topVolume,
    topTechnical,
    topTechnicalBearish,
    topRsiOversold,
    dailyPicks,
    calendarEvents,
    radarItems,
    loadingRadar,
    radarError,
    radarPreparing,
    radarStale,
    watchlistCount,
    watchlistPreview,
    moversFreshness,
    moversTimeLabel,
    marketError,
    loadingMarket,
    loadingDailyPicks,
    picksNeedPro,
    picksLoginRequired,
    aiBriefing,
    newsInsights,
    marketPulse,
    marketPulseNeedPro,
    marketPulseLoginRequired,
    marketPulseError,
    loadingMarketPulse,
    supportRequestId,
    fetchMarket,
    fetchMarketPulse,
    fetchRadar,
    topPick,
  };
}
