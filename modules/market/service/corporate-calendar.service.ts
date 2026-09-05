import fs from 'node:fs';
import path from 'node:path';
import YahooFinanceClass from 'yahoo-finance2';
import { SCREENER_UNIVERSE } from './screener.service';

const yahooFinance = new (YahooFinanceClass as any)({ suppressNotices: ['yahooSurvey'] });
export type CalendarEventType = 'DIVIDEND' | 'EARNINGS' | 'RUPS' | 'RUPSLB';
export type CalendarVerification = 'VERIFIED_PRIMARY_SOURCE' | 'THIRD_PARTY_RECORDED' | 'THIRD_PARTY_ESTIMATE';

export interface CalendarEvent {
  id?: string;
  symbol: string;
  type: CalendarEventType;
  title: string;
  description: string;
  timeWib?: string | null;
  source: 'KSEI_OFFICIAL' | 'YAHOO_FINANCE';
  sourceUrl?: string;
  publishedAt?: string;
  verification: CalendarVerification;
}

export type CalendarEventMap = Record<string, CalendarEvent[]>;
export interface CalendarCoverage {
  ksei: { status: 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE' | 'STALE'; generatedAt: string | null; years: number[]; documentsDiscovered: number; eventsVerified: number; documentsRejected: number };
  yahoo: { status: 'PARTIAL_UNIVERSE'; symbolsRequested: number; symbolsFailed: number };
}
export interface CorporateCalendarResult { events: CalendarEventMap; coverage: CalendarCoverage }

interface KseiArtifact {
  schemaVersion: 1;
  source: 'KSEI_OFFICIAL';
  generatedAt: string;
  status: 'COMPLETE' | 'PARTIAL';
  coverage: { years: number[]; documentsDiscovered: number; eventsVerified: number; documentsRejected: number };
  events: Array<CalendarEvent & { date: string }>;
}

const PAST_WINDOW_DAYS = 45;
const FUTURE_WINDOW_DAYS = 180;
const KSEI_MAX_AGE_MS = 36 * 60 * 60 * 1000;
const KSEI_ARTIFACT = path.join(process.cwd(), 'data', 'corporate-calendar', 'ksei-rups.json');

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function withinWindow(d: Date, now: Date): boolean {
  const diffDays = (d.getTime() - now.getTime()) / 86_400_000;
  return diffDays >= -PAST_WINDOW_DAYS && diffDays <= FUTURE_WINDOW_DAYS;
}
function add(map: CalendarEventMap, date: string, event: CalendarEvent): void {
  (map[date] ||= []).push(event);
}

export function readKseiCalendarArtifact(now = new Date(), artifactPath = KSEI_ARTIFACT): { events: Array<CalendarEvent & { date: string }>; coverage: CalendarCoverage['ksei'] } {
  try {
    const parsed = JSON.parse(fs.readFileSync(artifactPath, 'utf8')) as KseiArtifact;
    if (parsed.schemaVersion !== 1 || parsed.source !== 'KSEI_OFFICIAL' || !Array.isArray(parsed.events)) throw new Error('invalid schema');
    const age = now.getTime() - new Date(parsed.generatedAt).getTime();
    const stale = !Number.isFinite(age) || age > KSEI_MAX_AGE_MS;
    return {
      events: parsed.events,
      coverage: {
        status: stale ? 'STALE' : parsed.status,
        generatedAt: parsed.generatedAt,
        years: parsed.coverage.years,
        documentsDiscovered: parsed.coverage.documentsDiscovered,
        eventsVerified: parsed.coverage.eventsVerified,
        documentsRejected: parsed.coverage.documentsRejected,
      },
    };
  } catch {
    return { events: [], coverage: { status: 'UNAVAILABLE', generatedAt: null, years: [], documentsDiscovered: 0, eventsVerified: 0, documentsRejected: 0 } };
  }
}

async function fetchOneCalendar(ticker: string, now: Date): Promise<{ rows: Array<{ dateKey: string; event: CalendarEvent }>; failed: boolean }> {
  const rows: Array<{ dateKey: string; event: CalendarEvent }> = [];
  try {
    const q = await yahooFinance.quoteSummary(ticker, { modules: ['calendarEvents'] });
    const symbol = ticker.replace('.JK', '');
    const exDiv = q?.calendarEvents?.exDividendDate;
    if (exDiv) {
      const d = new Date(exDiv);
      if (withinWindow(d, now)) rows.push({ dateKey: toDateKey(d), event: { symbol, type: 'DIVIDEND', title: 'Ex-Dividen Terakhir Tercatat', description: 'Tanggal ex-dividend terakhir yang tercatat di Yahoo Finance; bukan jadwal resmi KSEI.', source: 'YAHOO_FINANCE', verification: 'THIRD_PARTY_RECORDED' } });
    }
    const earningsDates: string[] = q?.calendarEvents?.earnings?.earningsDate || [];
    const estimate = q?.calendarEvents?.earnings?.isEarningsDateEstimate;
    for (const raw of earningsDates) {
      const d = new Date(raw);
      if (withinWindow(d, now)) rows.push({ dateKey: toDateKey(d), event: { symbol, type: 'EARNINGS', title: estimate ? 'Perkiraan Rilis Laporan Keuangan' : 'Rilis Laporan Keuangan', description: estimate ? 'Estimasi Yahoo Finance; tanggal aktual dapat berbeda.' : 'Tanggal yang tercatat di Yahoo Finance.', source: 'YAHOO_FINANCE', verification: estimate ? 'THIRD_PARTY_ESTIMATE' : 'THIRD_PARTY_RECORDED' } });
    }
    return { rows, failed: false };
  } catch { return { rows, failed: true }; }
}

export async function fetchCorporateCalendar(): Promise<CorporateCalendarResult> {
  const now = new Date();
  const events: CalendarEventMap = {};
  const ksei = readKseiCalendarArtifact(now);
  for (const event of ksei.events) {
    const date = new Date(`${event.date}T00:00:00+07:00`);
    if (withinWindow(date, now)) { const { date: _, ...clean } = event; add(events, event.date, clean); }
  }
  let symbolsFailed = 0;
  for (let i = 0; i < SCREENER_UNIVERSE.length; i += 15) {
    const results = await Promise.all(SCREENER_UNIVERSE.slice(i, i + 15).map((ticker) => fetchOneCalendar(ticker, now)));
    for (const result of results) { if (result.failed) symbolsFailed++; for (const row of result.rows) add(events, row.dateKey, row.event); }
  }
  for (const rows of Object.values(events)) rows.sort((a, b) => a.symbol.localeCompare(b.symbol) || a.type.localeCompare(b.type));
  return { events, coverage: { ksei: ksei.coverage, yahoo: { status: 'PARTIAL_UNIVERSE', symbolsRequested: SCREENER_UNIVERSE.length, symbolsFailed } } };
}
