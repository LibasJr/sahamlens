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

// REWRITE (2026-08-03) - dulu simulasi ini beli/jual di CLOSE hari yang sama dengan
// sinyalnya sendiri (look-ahead bias: jam 9 pagi kamu belum tahu close hari itu), dan
// tidak menghitung fee transaksi sama sekali (return kelihatan 15-20% lebih besar dari
// aslinya). Diperbaiki: sinyal dari keputusan hari D baru dieksekusi di OPEN hari D+1,
// plus slippage & fee broker. Persentase di bawah perkiraan retail IDX umum (bisa beda
// tipis per broker), didokumentasikan eksplisit supaya bisa di-tuning, bukan disembunyikan
// sebagai konstanta ajaib.
const SLIPPAGE_PCT = 0.002; // 0.2% - order pasar biasanya meleset dari harga acuan
const FEE_BUY_PCT = 0.0015; // 0.15% - fee broker beli
const FEE_SELL_PCT = 0.0025; // 0.25% - fee broker jual (lebih tinggi: ada levy bursa 0.1%)

function buyExecutionPrice(openPrice: number): number {
  return openPrice * (1 + SLIPPAGE_PCT) * (1 + FEE_BUY_PCT);
}

function sellExecutionPrice(openPrice: number): number {
  return openPrice * (1 - SLIPPAGE_PCT) * (1 - FEE_SELL_PCT);
}

interface OpenPosition {
  symbol: string;
  entryDate: string;
  entryPrice: number; // sudah net slippage+fee (lihat buyExecutionPrice)
  shares: number;
  lastKnownPrice: number;
}

interface TickerDayData {
  close: number;
  open: number;
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
    map.set(bar.date, { close: bar.close, open: bar.open, decisions });
  });
  return map;
}

function allBullish(day: TickerDayData, filters: IndicatorName[]): boolean {
  return filters.every((f) => day.decisions[f] === 'BULLISH');
}

// Syarat JUAL sengaja tidak simetris dengan syarat BELI. Beli tetap butuh SEMUA filter
// BULLISH, tapi jual baru dipicu kalau LEBIH DARI SEPARUH filter benar-benar BEARISH.
// Dulu aturannya "jual begitu satu filter berhenti BULLISH" - dengan filter yang
// berfluktuasi harian (Volume vs Avg 20D, dsb) posisi rata-rata cuma bertahan ~3 hari,
// dan hasil backtest 12 bulan hampir seluruhnya habis oleh fee+slippage bolak-balik
// (360 trade x 0.8% biaya round-trip atas 1/5 modal ~= -57%), bukan oleh arah harga.
// NEUTRAL TIDAK dihitung sebagai alasan jual: sinyal yang meluruh pelan tidak sama
// dengan sinyal yang berbalik arah.
function majorityBearish(day: TickerDayData, filters: IndicatorName[]): boolean {
  const bearish = filters.filter((f) => day.decisions[f] === 'BEARISH').length;
  return bearish > filters.length / 2;
}

export function simulateBacktest(cache: BacktestIndicatorCache, input: SimulateInput): SimulateResult {
  const { filters, modal, periodMonths, endDate } = input;
  const tradingDays = periodMonths * TRADING_DAYS_PER_MONTH;

  // Tanggal string YYYY-MM-DD aman dibandingkan leksikografis (zero-padded, urutan
  // besar-ke-kecil), jadi tidak perlu parsing Date sama sekali.
  const ihsgAll = endDate ? cache.ihsg.filter((b) => b.date <= endDate) : cache.ihsg;
  const ihsgWindow = ihsgAll.slice(-tradingDays);
  const tickerIndexes = cache.tickers
    .map((series) => ({ ticker: series.ticker, index: buildTickerIndex(series) }))
    // Yang dihitung adalah bar DI DALAM jendela, bukan total bar yang dipunya ticker:
    // saham dengan 5 tahun histori tetap harus punya data cukup di jendela masa lalu
    // yang sedang diuji, bukan lolos hanya karena datanya panjang di masa kini.
    .filter(({ index }) => {
      if (!endDate) return index.size >= tradingDays;
      let inWindow = 0;
      index.forEach((_day, date) => {
        if (date <= endDate) inWindow++;
      });
      return inWindow >= tradingDays;
    });

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

  // Antrean order dari sinyal hari D, baru dieksekusi di OPEN hari D+1 (giliran
  // berikutnya loop ini) - inti dari fix look-ahead bias. pendingExits simpan referensi
  // OpenPosition langsung (masih dianggap "dipegang" & di-mark-to-market sampai
  // benar-benar terjual), pendingEntries cukup simpan simbolnya.
  const pendingExits: OpenPosition[] = [];
  const pendingEntries: string[] = [];

  for (const { date } of ihsgWindow) {
    // 1. Eksekusi order dari sinyal KEMARIN, di OPEN hari ini - exit dulu baru entry
    // supaya kas & slot dari hasil jual ikut tersedia untuk beli di hari yang sama.
    for (let i = pendingExits.length - 1; i >= 0; i--) {
      const pos = pendingExits[i];
      const day = findIndex(pos.symbol).get(date);
      if (!day) continue; // masih halt/kosong - coba lagi hari berikutnya, tetap di antrean
      const exitPrice = sellExecutionPrice(day.open);
      closePosition(pos, date, exitPrice);
      openPositions.splice(openPositions.indexOf(pos), 1);
      pendingExits.splice(i, 1);
    }

    for (let i = pendingEntries.length - 1; i >= 0; i--) {
      const symbol = pendingEntries[i];
      const day = findIndex(symbol).get(date);
      if (!day) continue; // masih halt/kosong - coba lagi hari berikutnya
      pendingEntries.splice(i, 1);

      // Equal-weight dari ekuitas SAAT INI (bukan modal awal statis) - supaya P/L
      // trade sebelumnya ikut compounding di ukuran posisi berikutnya.
      const currentEquity = portfolioEquity(date);
      const slotSize = currentEquity / MAX_SLOTS;
      const buyPrice = buyExecutionPrice(day.open);
      const shares = Math.floor(slotSize / buyPrice / 100) * 100; // bulatkan ke kelipatan 1 lot
      if (shares <= 0 || shares * buyPrice > cash) continue;

      cash -= shares * buyPrice;
      openPositions.push({ symbol, entryDate: date, entryPrice: buyPrice, shares, lastKnownPrice: buyPrice });
    }

    // 2. Evaluasi sinyal HARI INI (dari keputusan yang dihitung sampai close hari ini)
    // - bukan dieksekusi sekarang, cuma diantre untuk OPEN besok.
    for (const pos of openPositions) {
      if (pendingExits.includes(pos)) continue; // sudah diantre, jangan dobel
      const day = findIndex(pos.symbol).get(date);
      if (!day) continue;
      if (majorityBearish(day, filters)) pendingExits.push(pos);
    }

    const occupiedOrQueued = openPositions.length + pendingEntries.length;
    const freeSlots = MAX_SLOTS - occupiedOrQueued;
    if (freeSlots > 0) {
      // Kandidat yang lolos filter biasanya lebih banyak dari slot yang tersisa. Dulu
      // pemenangnya ditentukan urutan BACKTEST_UNIVERSE (ambil sampai slot penuh lalu
      // break) - artinya hasil backtest ikut berubah kalau urutan array konstanta itu
      // diubah, dan saham di awal daftar selalu menang. Sekarang diurutkan dulu dari
      // sinyal terkuat: jumlah SEMUA indikator yang BULLISH hari itu, tie-break simbol
      // (definisi skor sama dengan computeLiveSignal di live-signal.service.ts).
      const candidates: { ticker: string; score: number }[] = [];
      for (const { ticker, index } of tickerIndexes) {
        if (openPositions.some((p) => p.symbol === ticker) || pendingEntries.includes(ticker)) continue;
        const day = index.get(date);
        if (!day || !allBullish(day, filters)) continue;
        const score = Object.values(day.decisions).filter((d) => d === 'BULLISH').length;
        candidates.push({ ticker, score });
      }
      candidates.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.ticker.localeCompare(b.ticker)));
      for (const { ticker } of candidates.slice(0, freeSlots)) {
        pendingEntries.push(ticker);
      }
    }

    equityCurveDaily.push(portfolioEquity(date));
  }

  // 3. Force-close posisi yang masih terbuka saat periode berakhir - tidak ada "besok"
  // lagi untuk dieksekusi di open, jadi dilikuidasi di close hari terakhir (tetap kena
  // fee/slippage jual, ini transaksi nyata bukan cuma angka mark-to-market).
  const lastDate = ihsgWindow[ihsgWindow.length - 1]?.date;
  if (lastDate) {
    for (const pos of [...openPositions]) {
      const day = findIndex(pos.symbol).get(lastDate);
      const exitPrice = sellExecutionPrice(day?.close ?? pos.entryPrice);
      closePosition(pos, lastDate, exitPrice);
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
