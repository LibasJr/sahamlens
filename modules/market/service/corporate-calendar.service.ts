import YahooFinanceClass from 'yahoo-finance2';
import { SCREENER_UNIVERSE } from './screener.service';

// Kalender corporate action REAL (2026-08-01) - menggantikan data/calendar.json yang
// selama ini 100% hardcoded/dummy (cuma 4 tanggal, "hari ini" di-mock ke 2026-07-28
// permanen). Yahoo Finance TIDAK punya data RUPS atau Stock Split untuk emiten IDX,
// jadi kalender ini SENGAJA hanya mencakup Dividen & Earnings - dua satu-satunya
// jenis event yang datanya bisa dijamin asli dari sumber yang sama dipakai fitur lain
// di app ini (lihat modules/fundamental, screener.service.ts).
const yahooFinance = new (YahooFinanceClass as any)({ suppressNotices: ['yahooSurvey'] });

export type CalendarEventType = 'DIVIDEND' | 'EARNINGS';

export interface CalendarEvent {
  symbol: string;
  type: CalendarEventType;
  title: string;
  description: string;
}

export type CalendarEventMap = Record<string, CalendarEvent[]>;

// Jendela relevansi - event di luar rentang ini tidak ditampilkan (ex-dividend date
// dari Yahoo adalah tanggal TERAKHIR TERCATAT, bisa saja sudah lama berlalu; earnings
// date adalah estimasi ke depan, bisa meleset jauh untuk emiten yang jarang di-cover).
const PAST_WINDOW_DAYS = 45;
const FUTURE_WINDOW_DAYS = 180;

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function withinWindow(d: Date, now: Date): boolean {
  const diffDays = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays >= -PAST_WINDOW_DAYS && diffDays <= FUTURE_WINDOW_DAYS;
}

async function fetchOneCalendar(ticker: string, now: Date): Promise<{ dateKey: string; event: CalendarEvent }[]> {
  const out: { dateKey: string; event: CalendarEvent }[] = [];
  try {
    const q = await yahooFinance.quoteSummary(ticker, { modules: ['calendarEvents'] });
    const symbol = ticker.replace('.JK', '');

    const exDiv = q?.calendarEvents?.exDividendDate;
    if (exDiv) {
      const d = new Date(exDiv);
      if (withinWindow(d, now)) {
        out.push({
          dateKey: toDateKey(d),
          event: {
            symbol,
            type: 'DIVIDEND',
            title: 'Cum/Ex-Dividen Terakhir Tercatat',
            description: 'Tanggal ex-dividend terakhir yang tercatat di Yahoo Finance - bukan jaminan jadwal dividen berikutnya.',
          },
        });
      }
    }

    const earningsDates: string[] = q?.calendarEvents?.earnings?.earningsDate || [];
    const isEstimate = q?.calendarEvents?.earnings?.isEarningsDateEstimate;
    earningsDates.forEach((raw) => {
      const d = new Date(raw);
      if (withinWindow(d, now)) {
        out.push({
          dateKey: toDateKey(d),
          event: {
            symbol,
            type: 'EARNINGS',
            title: isEstimate ? 'Perkiraan Rilis Laporan Keuangan' : 'Rilis Laporan Keuangan',
            description: isEstimate
              ? 'Estimasi tanggal rilis dari Yahoo Finance - tanggal pasti bisa berbeda, cek pengumuman resmi emiten.'
              : 'Tanggal rilis laporan keuangan.',
          },
        });
      }
    });
  } catch {
    // Ticker gagal fetch - dilewati, tidak menggagalkan kalender emiten lain.
  }
  return out;
}

// Entry point dipanggil app/api/calendar (session-gated) - batch fetch calendarEvents
// utk seluruh SCREENER_UNIVERSE (~50 saham likuid), dikelompokkan per tanggal YYYY-MM-DD.
export async function fetchCorporateCalendar(): Promise<CalendarEventMap> {
  const now = new Date();
  const BATCH_SIZE = 15;
  const map: CalendarEventMap = {};

  for (let i = 0; i < SCREENER_UNIVERSE.length; i += BATCH_SIZE) {
    const batch = SCREENER_UNIVERSE.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map((t) => fetchOneCalendar(t, now)));
    results.flat().forEach(({ dateKey, event }) => {
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(event);
    });
  }

  return map;
}
