import type {
  BacktestIndicatorCache,
  SimulateInput,
  SimulateResult,
  TradeRecord,
  IndicatorName,
  Decision,
  TickerIndicatorSeries,
} from '../types/backtest.types';

const MAX_SLOTS = 5;
const TRADING_DAYS_PER_MONTH = 22; // aproksimasi - dipakai konsisten utk periode & sampling chart

interface OpenPosition {
  symbol: string;
  entryDate: string;
  entryPrice: number;
  shares: number;
  lastKnownPrice: number;
}

interface TickerDayData {
  close: number;
  decisions: Record<IndicatorName, Decision>;
}

// Index per-tanggal (bukan per-index-array) - tickers bisa punya hari kosong berbeda
// (halt/suspend spesifik saham), jadi tidak bisa asumsikan array position yang sama =
// tanggal yang sama antar ticker. IHSG dipakai sebagai kalender hari bursa acuan.
function buildTickerIndex(series: TickerIndicatorSeries): Map<string, TickerDayData> {
  const map = new Map<string, TickerDayData>();
  series.bars.forEach((bar, idx) => {
    const decisions = {} as Record<IndicatorName, Decision>;
    (Object.keys(series.decisions) as IndicatorName[]).forEach((name) => {
      decisions[name] = series.decisions[name][idx];
    });
    map.set(bar.date, { close: bar.close, decisions });
  });
  return map;
}

function allBullish(day: TickerDayData, filters: IndicatorName[]): boolean {
  return filters.every((f) => day.decisions[f] === 'BULLISH');
}

export function simulateBacktest(cache: BacktestIndicatorCache, input: SimulateInput): SimulateResult {
  const { filters, modal, periodMonths } = input;
  const tradingDays = periodMonths * TRADING_DAYS_PER_MONTH;

  const ihsgWindow = cache.ihsg.slice(-tradingDays);
  const tickerIndexes = cache.tickers
    .map((series) => ({ ticker: series.ticker, index: buildTickerIndex(series) }))
    .filter(({ index }) => index.size >= tradingDays);

  let cash = modal;
  const openPositions: OpenPosition[] = [];
  const trades: TradeRecord[] = [];
  const equityCurveDaily: number[] = [];

  function findIndex(symbol: string): Map<string, TickerDayData> {
    return tickerIndexes.find((t) => t.ticker === symbol)!.index;
  }

  function portfolioEquity(dateStr: string): number {
    let equity = cash;
    for (const pos of openPositions) {
      const day = findIndex(pos.symbol).get(dateStr);
      if (day) {
        // Bawa harga terakhir yang diketahui - dipakai kalau ticker ini halt/kosong
        // di hari-hari berikutnya (lihat cabang else di bawah), supaya mark-to-market
        // tidak diam-diam "reset" ke harga entry saat ada gap data.
        pos.lastKnownPrice = day.close;
      }
      equity += pos.shares * (day?.close ?? pos.lastKnownPrice);
    }
    return equity;
  }

  function closePosition(pos: OpenPosition, exitDate: string, exitPrice: number) {
    cash += pos.shares * exitPrice;
    trades.push({
      entryDate: pos.entryDate,
      date: exitDate,
      symbol: pos.symbol,
      buy: pos.entryPrice,
      sell: exitPrice,
      pnlPct: Number((((exitPrice - pos.entryPrice) / pos.entryPrice) * 100).toFixed(2)),
    });
  }

  for (const { date } of ihsgWindow) {
    // 1. Exit - cek posisi terbuka, mundur supaya splice aman
    for (let i = openPositions.length - 1; i >= 0; i--) {
      const pos = openPositions[i];
      const day = findIndex(pos.symbol).get(date);
      if (!day) continue; // ticker ini halt/kosong hari itu - tidak bisa dieksekusi
      if (!allBullish(day, filters)) {
        closePosition(pos, date, day.close);
        openPositions.splice(i, 1);
      }
    }

    // 2. Entry - isi slot kosong (equal-weight dari ekuitas SAAT INI, bukan modal awal
    // statis - supaya P/L trade sebelumnya ikut compounding di ukuran posisi berikutnya)
    if (openPositions.length < MAX_SLOTS) {
      const currentEquity = portfolioEquity(date);
      const slotSize = currentEquity / MAX_SLOTS;

      for (const { ticker, index } of tickerIndexes) {
        if (openPositions.length >= MAX_SLOTS) break;
        if (openPositions.some((p) => p.symbol === ticker)) continue;
        const day = index.get(date);
        if (!day || !allBullish(day, filters)) continue;

        const shares = Math.floor(slotSize / day.close / 100) * 100; // bulatkan ke kelipatan 1 lot
        if (shares <= 0 || shares * day.close > cash) continue;

        cash -= shares * day.close;
        openPositions.push({ symbol: ticker, entryDate: date, entryPrice: day.close, shares, lastKnownPrice: day.close });
      }
    }

    equityCurveDaily.push(portfolioEquity(date));
  }

  // 3. Force-close posisi yang masih terbuka saat periode berakhir
  const lastDate = ihsgWindow[ihsgWindow.length - 1]?.date;
  if (lastDate) {
    for (const pos of [...openPositions]) {
      const day = findIndex(pos.symbol).get(lastDate);
      closePosition(pos, lastDate, day?.close ?? pos.entryPrice);
    }
  }

  const finalEquity = equityCurveDaily[equityCurveDaily.length - 1] ?? modal;
  const returnPct = ((finalEquity - modal) / modal) * 100;

  const ihsgStart = ihsgWindow[0]?.close ?? 1;
  const ihsgEnd = ihsgWindow[ihsgWindow.length - 1]?.close ?? ihsgStart;
  const ihsgReturnPct = ((ihsgEnd - ihsgStart) / ihsgStart) * 100;
  const alphaPct = returnPct - ihsgReturnPct;

  const wins = trades.filter((t) => t.pnlPct > 0).length;
  const winRatePct = trades.length > 0 ? (wins / trades.length) * 100 : 0;

  let peak = modal;
  let maxDrawdownPct = 0;
  for (const eq of equityCurveDaily) {
    if (eq > peak) peak = eq;
    const dd = peak > 0 ? ((eq - peak) / peak) * 100 : 0;
    if (dd < maxDrawdownPct) maxDrawdownPct = dd;
  }

  // Sampling bulanan (kompatibel bentuk data chart existing: array panjang period+1)
  const equityCurve: number[] = [Math.round(modal)];
  const ihsgCurve: number[] = [Math.round(modal)];
  for (let m = 1; m <= periodMonths; m++) {
    const idx = Math.min(Math.round(m * TRADING_DAYS_PER_MONTH) - 1, Math.max(equityCurveDaily.length - 1, 0));
    equityCurve.push(Math.round(equityCurveDaily[idx] ?? finalEquity));
    const ihsgBar = ihsgWindow[Math.min(idx, ihsgWindow.length - 1)];
    const ihsgValueAtIdx = ihsgBar ? (ihsgBar.close / ihsgStart) * modal : modal;
    ihsgCurve.push(Math.round(ihsgValueAtIdx));
  }

  return {
    returnPct: Number(returnPct.toFixed(2)),
    ihsgReturnPct: Number(ihsgReturnPct.toFixed(2)),
    alphaPct: Number(alphaPct.toFixed(2)),
    winRatePct: Number(winRatePct.toFixed(0)),
    totalTrades: trades.length,
    maxDrawdownPct: Number(maxDrawdownPct.toFixed(2)),
    equityCurve,
    ihsgCurve,
    trades: trades.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    computedAt: cache.computedAt,
  };
}
