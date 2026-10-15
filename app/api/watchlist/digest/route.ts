import { guard } from '@/lib/sahamLensGuard';
guard();

import type { NextRequest } from 'next/server';
import { runController } from '@/shared/http/next-response.adapter';
import { requireUser } from '@/shared/middleware/require-auth';
import { listWatchlist } from '@/modules/watchlist/repository/watchlist.repository';
import { listAlerts } from '@/modules/watchlist/repository/alert.repository';
import type { WatchlistItem, Alert } from '@/modules/watchlist/types/watchlist.types';
import { cacheGet } from '@/shared/cache/redis-cache';
import { COMPUTED_CACHE_KEY } from '@/shared/cache/computed-keys';
import { readKseiCalendarArtifact, type CalendarEvent } from '@/modules/market/service/corporate-calendar.service';
import { getAiPickScanWindow } from '@/shared/calendar/idx-trading-calendar';

export const dynamic = 'force-dynamic';

interface WatchlistDigestEvent {
  date: string;
  symbol: string;
  type: string;
  title: string;
  source: string;
  verification: string;
}

export async function GET(request: NextRequest) {
  return runController(async () => {
    const session = await requireUser();
    const [watchlist, alerts, cachedCalendar] = await Promise.all([
      listWatchlist(session.id),
      listAlerts(session.id),
      cacheGet<{ events?: Record<string, CalendarEvent[]> }>(COMPUTED_CACHE_KEY.CORPORATE_CALENDAR),
    ]);

    const watchedCodes = new Set(
      watchlist.map((item: WatchlistItem) => item.symbol.replace(/\.JK$/i, '').toUpperCase()),
    );

    const now = new Date();
    const todayIso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(now);
    const maxFutureDate = new Date(now.getTime() + 45 * 86_400_000);
    const maxFutureIso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(maxFutureDate);

    const upcomingEvents: WatchlistDigestEvent[] = [];
    const seenEventKeys = new Set<string>();

    if (cachedCalendar?.events && typeof cachedCalendar.events === 'object') {
      for (const [dateKey, dayEvents] of Object.entries(cachedCalendar.events)) {
        if (dateKey < todayIso || dateKey > maxFutureIso || !Array.isArray(dayEvents)) continue;
        for (const ev of dayEvents) {
          const code = String(ev.symbol ?? '').replace(/\.JK$/i, '').toUpperCase();
          if (!watchedCodes.has(code)) continue;
          const dedupKey = `${dateKey}:${code}:${ev.type}:${ev.title}`;
          if (seenEventKeys.has(dedupKey)) continue;
          seenEventKeys.add(dedupKey);
          upcomingEvents.push({
            date: dateKey,
            symbol: code,
            type: ev.type,
            title: ev.title,
            source: ev.source,
            verification: ev.verification,
          });
        }
      }
    } else {
      const ksei = readKseiCalendarArtifact(now);
      for (const ev of ksei.events) {
        const code = String(ev.symbol ?? '').replace(/\.JK$/i, '').toUpperCase();
        if (!watchedCodes.has(code) || ev.date < todayIso || ev.date > maxFutureIso) continue;
        const dedupKey = `${ev.date}:${code}:${ev.type}:${ev.title}`;
        if (seenEventKeys.has(dedupKey)) continue;
        seenEventKeys.add(dedupKey);
        upcomingEvents.push({
          date: ev.date,
          symbol: code,
          type: ev.type,
          title: ev.title,
          source: ev.source,
          verification: ev.verification,
        });
      }
    }

    upcomingEvents.sort((a, b) => a.date.localeCompare(b.date) || a.symbol.localeCompare(b.symbol));

    const sessionWindow = getAiPickScanWindow(now);
    const sessionLabel =
      sessionWindow === 'REGULAR_SESSION'
        ? 'Sesi Bursa Berjalan'
        : sessionWindow === 'FINAL_CLOSE'
          ? 'Rekap Penutupan Sesi'
          : 'Briefing Pra-Pembukaan / Di Luar Sesi';

    const journaledCount = watchlist.filter((w: WatchlistItem) => Boolean(w.journal_note && w.journal_note.trim())).length;
    const positionedCount = watchlist.filter((w: WatchlistItem) => Number(w.buy_price) > 0).length;
    const activeAlertsCount = alerts.filter((a: Alert) => !a.triggered).length;
    const triggeredAlertsCount = alerts.filter((a: Alert) => Boolean(a.triggered)).length;

    return {
      status: 200,
      body: {
        sessionLabel,
        watchlistCount: watchlist.length,
        positionedCount,
        journaledCount,
        activeAlertsCount,
        triggeredAlertsCount,
        upcomingEvents: upcomingEvents.slice(0, 10),
        asOf: now.toISOString(),
      },
    };
  }, request);
}
