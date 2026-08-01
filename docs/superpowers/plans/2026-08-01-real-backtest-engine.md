# Real Backtest Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `Math.random()`-based fake backtest at `app/api/backtest/route.ts` with a real historical backtest engine, driven by daily-precomputed technical-indicator decisions over a 100-ticker IDX universe.

**Architecture:** A daily QStash cron job (`app/api/cron/backtest-precompute`) fetches 5 years of OHLCV for 100 curated IDX tickers + IHSG, runs the 9 real technical analyzers day-by-day to build a decision time series, and writes it to Redis (per-ticker keys + one meta key). `POST /api/backtest` reads that cache and runs a fast in-memory day-by-day trade simulation (entry when all selected filters are BULLISH, exit when any drops, max 5 equal-weight compounding slots), falling back to synchronous precompute on cache-miss.

**Tech Stack:** Next.js 14 App Router (TypeScript), `@upstash/redis` (via `shared/cache/redis-cache.ts`), `@upstash/qstash` (via `shared/queue/qstash-signature.ts`), Yahoo Finance chart API (via `modules/technical`'s `fetchYahooHistory`), Vitest for unit tests.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-01-real-backtest-engine-design.md` — every requirement in it must map to a task below.
- Module folder convention (see `modules/watchlist`, `modules/notification`): `modules/backtest/index.ts` barrel is the ONLY thing other modules/routes import from; never import from `modules/backtest/service/*` etc. directly outside the module.
- All analyzers in `modules/technical` share the signature `analyze(history: any[], currentPrice: number) => { label: string; value: string; decision: string; confidence: number }` where `decision` is `'BULLISH' | 'BEARISH' | 'NEUTRAL'`.
- `fetchYahooHistory(ticker: string, range: string) => Promise<{ history: OhlcRow[]; currentPrice: number } | null>` (from `modules/technical`) returns `null` on any failure — never throws.
- Redis helpers (`shared/cache/redis-cache.ts`): `cacheGet<T>(key)`, `cacheSet<T>(key, value, ttlSec)`, `cacheMGet<T>(keys)` all degrade to no-op/null on Redis being unconfigured or down — never throw.
- Path alias `@/*` maps to repo root (`tsconfig.json`).
- Test command: `npx vitest run` (or a single file: `npx vitest run path/to/file.test.ts`). Typecheck: `npx tsc --noEmit -p tsconfig.json`.
- Test files live in `__tests__/` folders colocated with the code under test (see `modules/user/service/__tests__/auth.service.test.ts`).

---

## Task 1: Curate the 100-ticker backtest universe

**Files:**
- Create: `scripts/backtest-universe-refresh.mjs`
- Create: `modules/backtest/constants/backtest-universe.ts`
- Test: none (this is a data-curation script, not application logic — verified by running it, not by unit test)

**Interfaces:**
- Produces: `BACKTEST_UNIVERSE: string[]` (100 Yahoo-Finance-formatted tickers, e.g. `'BBCA.JK'`) — consumed by Task 3 (`precompute.service.ts`).

- [ ] **Step 1: Create the ranking script**

Create `scripts/backtest-universe-refresh.mjs`:

```js
// Cari kandidat ticker likuid tambahan dari idx_emiten_900.csv (papan Utama) untuk
// melengkapi 51 ticker seed (disalin dari SCREENER_UNIVERSE di
// modules/market/service/screener.service.ts) jadi 100 ticker universe backtest.
// Dijalankan sekali (atau ulang berkala) secara manual: `node scripts/backtest-universe-refresh.mjs`
// Output: scripts/.backtest-universe-candidates.json (49 ticker teratas berdasarkan
// rata-rata nilai transaksi harian 3 bulan terakhir) - salin manual ke
// modules/backtest/constants/backtest-universe.ts setelah dicek.

import fs from 'fs';

const SEED_TICKERS = [
  'BBCA.JK', 'BBRI.JK', 'BMRI.JK', 'BBNI.JK', 'TLKM.JK', 'ASII.JK', 'GOTO.JK', 'ADRO.JK', 'UNTR.JK',
  'ICBP.JK', 'KLBF.JK', 'PGAS.JK', 'PTBA.JK', 'ANTM.JK', 'BRPT.JK', 'INKP.JK', 'INDF.JK', 'ITMG.JK',
  'CPIN.JK', 'UNVR.JK', 'AKRA.JK', 'BRIS.JK', 'SMGR.JK', 'INTP.JK', 'CTRA.JK', 'BSDE.JK', 'SMRA.JK',
  'ISAT.JK', 'EXCL.JK', 'BUKA.JK', 'TOWR.JK', 'TBIG.JK', 'SIDO.JK', 'AMRT.JK', 'MYOR.JK', 'HMSP.JK',
  'GGRM.JK', 'JPFA.JK', 'ARTO.JK', 'BDMN.JK', 'BNGA.JK', 'BBTN.JK', 'MEGA.JK', 'INDY.JK', 'BYAN.JK',
  'HRUM.JK', 'INCO.JK', 'TINS.JK', 'MAPI.JK', 'SILO.JK', 'EMTK.JK',
];

function parseCsv(path) {
  const raw = fs.readFileSync(path, 'utf8').trim().split('\n');
  const header = raw[0].split(',');
  return raw.slice(1).map((line) => {
    const cols = line.split(',');
    const row = {};
    header.forEach((h, i) => { row[h.trim()] = (cols[i] || '').trim(); });
    return row;
  });
}

async function fetchAvgDailyValue(ticker) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=3mo&interval=1d`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
    if (!res.ok) return null;
    const data = await res.json();
    const result = data.chart?.result?.[0];
    if (!result) return null;
    const closes = result.indicators?.quote?.[0]?.close || [];
    const volumes = result.indicators?.quote?.[0]?.volume || [];
    let sum = 0;
    let n = 0;
    for (let i = 0; i < closes.length; i++) {
      if (closes[i] != null && volumes[i] != null) {
        sum += closes[i] * volumes[i];
        n++;
      }
    }
    if (n < 30) return null;
    return sum / n;
  } catch {
    return null;
  }
}

async function main() {
  const rows = parseCsv('idx_emiten_900.csv').filter((r) => r.Papan === 'Utama');
  const candidates = [...new Set(rows.map((r) => r.Kode_YFinance).filter((t) => t && !SEED_TICKERS.includes(t)))];

  console.log(`Cek ${candidates.length} kandidat (papan Utama, belum ada di seed 51)...`);
  const results = [];
  const BATCH = 15;
  for (let i = 0; i < candidates.length; i += BATCH) {
    const batch = candidates.slice(i, i + BATCH);
    const values = await Promise.all(
      batch.map(async (t) => ({ ticker: t, avgDailyValue: await fetchAvgDailyValue(t) }))
    );
    results.push(...values.filter((v) => v.avgDailyValue != null));
    console.log(`  ${Math.min(i + BATCH, candidates.length)}/${candidates.length} dicek, ${results.length} valid sejauh ini`);
    await new Promise((r) => setTimeout(r, 300));
  }

  results.sort((a, b) => b.avgDailyValue - a.avgDailyValue);
  const top49 = results.slice(0, 49);

  console.log('\n=== TOP 49 KANDIDAT (rata-rata nilai transaksi harian tertinggi, 3 bulan terakhir) ===');
  top49.forEach((r, i) => console.log(`${i + 1}. ${r.ticker} - avg daily value: ${Math.round(r.avgDailyValue).toLocaleString('id-ID')}`));

  fs.writeFileSync(
    'scripts/.backtest-universe-candidates.json',
    JSON.stringify(top49.map((r) => r.ticker), null, 2)
  );
  console.log('\nDitulis ke scripts/.backtest-universe-candidates.json - salin 49 ticker ini ke modules/backtest/constants/backtest-universe.ts');
}

main();
```

- [ ] **Step 2: Run the script**

Run: `node scripts/backtest-universe-refresh.mjs`

Expected: prints progress lines, ends with a "TOP 49 KANDIDAT" list and writes `scripts/.backtest-universe-candidates.json`. Takes a few minutes (hundreds of live Yahoo Finance calls, rate-limited via 300ms pauses between batches of 15). If the script errors out on network access, note the error and retry — this step requires outbound internet access to `query1.finance.yahoo.com`.

- [ ] **Step 3: Create the final universe constant**

Read `scripts/.backtest-universe-candidates.json`, take its 49 tickers, and create `modules/backtest/constants/backtest-universe.ts`:

```ts
// 100 ticker IDX likuid khusus universe backtest - TERPISAH dari SCREENER_UNIVERSE
// (modules/market/service/screener.service.ts, 51 ticker) yang sengaja dibatasi kecil
// karena dipakai fetch LIVE per-request (Screener, Compare). Daftar ini aman lebih
// besar karena hanya dipakai cron harian (async, lihat app/api/cron/backtest-precompute).
// 51 ticker pertama = SCREENER_UNIVERSE apa adanya. 49 ticker berikutnya dipilih dari
// idx_emiten_900.csv (papan Utama) berdasarkan rata-rata nilai transaksi harian 3 bulan
// terakhir (lihat scripts/backtest-universe-refresh.mjs, dijalankan {TANGGAL RUN}).
export const BACKTEST_UNIVERSE: string[] = [
  // --- 51 seed (SCREENER_UNIVERSE) ---
  'BBCA.JK', 'BBRI.JK', 'BMRI.JK', 'BBNI.JK', 'TLKM.JK', 'ASII.JK', 'GOTO.JK', 'ADRO.JK', 'UNTR.JK',
  'ICBP.JK', 'KLBF.JK', 'PGAS.JK', 'PTBA.JK', 'ANTM.JK', 'BRPT.JK', 'INKP.JK', 'INDF.JK', 'ITMG.JK',
  'CPIN.JK', 'UNVR.JK', 'AKRA.JK', 'BRIS.JK', 'SMGR.JK', 'INTP.JK', 'CTRA.JK', 'BSDE.JK', 'SMRA.JK',
  'ISAT.JK', 'EXCL.JK', 'BUKA.JK', 'TOWR.JK', 'TBIG.JK', 'SIDO.JK', 'AMRT.JK', 'MYOR.JK', 'HMSP.JK',
  'GGRM.JK', 'JPFA.JK', 'ARTO.JK', 'BDMN.JK', 'BNGA.JK', 'BBTN.JK', 'MEGA.JK', 'INDY.JK', 'BYAN.JK',
  'HRUM.JK', 'INCO.JK', 'TINS.JK', 'MAPI.JK', 'SILO.JK', 'EMTK.JK',
  // --- 49 tambahan dari scripts/.backtest-universe-candidates.json ---
  // PASTE 49 TICKER DARI OUTPUT STEP 2 DI SINI, format sama: 'KODE.JK',
];
```

Paste the 49 tickers from `scripts/.backtest-universe-candidates.json` into the array (replacing the placeholder comment line), keeping the `'KODE.JK',` format. Verify the final array has exactly 100 entries.

Run: `node -e "const {BACKTEST_UNIVERSE} = require('./modules/backtest/constants/backtest-universe.ts')" 2>&1 | head -5`

This will fail (can't `require` a `.ts` file directly) — instead verify count with:

Run: `node -e "const fs=require('fs'); const src=fs.readFileSync('modules/backtest/constants/backtest-universe.ts','utf8'); const matches=src.match(/'[A-Z0-9]+\.JK'/g); console.log('Jumlah ticker:', matches.length);"`

Expected: `Jumlah ticker: 100`

- [ ] **Step 4: Commit**

```bash
git add scripts/backtest-universe-refresh.mjs modules/backtest/constants/backtest-universe.ts
git commit -m "feat(backtest): curate 100-ticker universe for backtest engine"
```

---

## Task 2: Shared backtest types and cache TTL constant

**Files:**
- Create: `modules/backtest/types/backtest.types.ts`
- Modify: `shared/cache/ttl-policy.ts`
- Test: none (pure type definitions + a constant)

**Interfaces:**
- Produces: `IndicatorName`, `Decision`, `DailyBar`, `TickerIndicatorSeries`, `BacktestIndicatorCache`, `SimulateInput`, `TradeRecord`, `SimulateResult` types — consumed by Tasks 3, 4, 5.
- Produces: `CACHE_TTL_SEC.BACKTEST_INDICATORS: number` — consumed by Task 4.

- [ ] **Step 1: Create the types file**

Create `modules/backtest/types/backtest.types.ts`:

```ts
// 9 filter yang bisa dipilih user di app/backtest/page.tsx, dipetakan 1:1 ke 9 dari
// 10 analyzer di modules/technical (analyzeMomentum sengaja tidak dipakai filter
// manapun - lihat tabel pemetaan di docs/superpowers/specs/2026-08-01-real-backtest-engine-design.md).
// 'Volatility (ATR 14)' dan 'SMA Score (5,10,20)' adalah rename dari nama filter lama
// 'Bollinger Bands'/'Trend Price vs MA200' yang tidak punya analyzer asli yang cocok.
export type IndicatorName =
  | 'EMA 20/50 Cross'
  | 'Volume vs Avg 20D'
  | 'RSI 14'
  | 'MACD'
  | 'Volatility (ATR 14)'
  | 'MA Trend IDX (20,50,200)'
  | 'Support & Resistance'
  | 'Market Flow Index'
  | 'SMA Score (5,10,20)';

export type Decision = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export interface DailyBar {
  date: string; // YYYY-MM-DD
  close: number;
}

// Deret keputusan harian 1 saham, sudah dipangkas ke window backtest (tanpa bagian
// yang cuma dipakai sebagai buffer lookback indikator). `decisions[name][i]` sejajar
// index dengan `bars[i]` (tanggal yang sama).
export interface TickerIndicatorSeries {
  ticker: string; // format Yahoo, e.g. 'BBCA.JK'
  bars: DailyBar[];
  decisions: Record<IndicatorName, Decision[]>;
}

export interface BacktestIndicatorCache {
  computedAt: string; // ISO timestamp precompute selesai
  ihsg: DailyBar[]; // dipakai sebagai kalender hari bursa acuan + benchmark alpha
  tickers: TickerIndicatorSeries[];
}

export interface SimulateInput {
  filters: IndicatorName[];
  modal: number;
  periodMonths: number; // 3 | 6 | 12 | 24
}

export interface TradeRecord {
  entryDate: string; // YYYY-MM-DD
  date: string; // tanggal exit, YYYY-MM-DD
  symbol: string; // dengan .JK
  buy: number;
  sell: number;
  pnlPct: number; // mis. -23.91 (bukan string)
}

export interface SimulateResult {
  returnPct: number;
  ihsgReturnPct: number;
  alphaPct: number;
  winRatePct: number;
  totalTrades: number;
  maxDrawdownPct: number;
  equityCurve: number[]; // panjang periodMonths+1, mulai dari modal
  ihsgCurve: number[]; // sama panjang, direbase ke skala modal
  trades: TradeRecord[]; // terurut terbaru dulu
  computedAt: string;
}
```

- [ ] **Step 2: Add the TTL constant**

In `shared/cache/ttl-policy.ts`, add a new field to the `CACHE_TTL_SEC` object (after the existing `SCREENER_UNIVERSE: 30 * 60,` line):

```ts
  // Deret keputusan indikator harian utk 100 saham universe backtest (diisi cron
  // app/api/cron/backtest-precompute sekali sehari) - BARU. TTL lebih panjang dari
  // interval cron (24 jam) sebagai toleransi kalau satu run cron sempat gagal/telat.
  BACKTEST_INDICATORS: 36 * 60 * 60,
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors (this task only adds new types/a constant, nothing consumes them yet).

- [ ] **Step 4: Commit**

```bash
git add modules/backtest/types/backtest.types.ts shared/cache/ttl-policy.ts
git commit -m "feat(backtest): add shared types and cache TTL for backtest engine"
```

---

## Task 3: Precompute service (fetch + day-by-day indicator computation)

**Files:**
- Create: `modules/backtest/service/precompute.service.ts`
- Test: `modules/backtest/service/__tests__/precompute.service.test.ts`

**Interfaces:**
- Consumes: `BACKTEST_UNIVERSE: string[]` (Task 1), `IndicatorName`/`Decision`/`DailyBar`/`TickerIndicatorSeries`/`BacktestIndicatorCache` (Task 2), `fetchYahooHistory` and the 9 analyzer functions from `modules/technical` (existing).
- Produces: `precomputeBacktestData(): Promise<BacktestIndicatorCache>` — consumed by Task 6 (cron route) and Task 8 (sync fallback in the rewritten `/api/backtest` route).
- Produces (internal, exported for testing): `computeTickerSeries(ticker: string, history: OhlcRow[]): TickerIndicatorSeries | null`.

- [ ] **Step 1: Write the failing test for `computeTickerSeries`**

Create `modules/backtest/service/__tests__/precompute.service.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/modules/technical', async () => {
  const actual = await vi.importActual<typeof import('@/modules/technical')>('@/modules/technical');
  return {
    ...actual,
    fetchYahooHistory: vi.fn(),
  };
});

import { computeTickerSeries, precomputeBacktestData } from '../precompute.service';
import { fetchYahooHistory } from '@/modules/technical';
import type { OhlcRow } from '@/modules/technical';

function makeHistory(days: number, startPrice = 1000): OhlcRow[] {
  const rows: OhlcRow[] = [];
  let price = startPrice;
  for (let i = 0; i < days; i++) {
    price += (i % 7 === 0 ? 5 : -2); // pola naik-turun sederhana, bukan random
    const date = new Date(2020, 0, 1 + i).toISOString();
    rows.push({ Date: date, Open: price, High: price + 5, Low: price - 5, Close: price, Volume: 1_000_000 });
  }
  return rows;
}

describe('computeTickerSeries', () => {
  it('mengembalikan null kalau data historis kurang dari buffer lookback 200 hari', () => {
    const history = makeHistory(150);
    expect(computeTickerSeries('TEST.JK', history)).toBeNull();
  });

  it('menghasilkan bars dan decisions sejajar untuk data yang cukup', () => {
    const history = makeHistory(400);
    const result = computeTickerSeries('TEST.JK', history);
    expect(result).not.toBeNull();
    expect(result!.ticker).toBe('TEST.JK');
    // 400 hari - 200 buffer = 200 hari keputusan
    expect(result!.bars.length).toBe(200);
    expect(result!.decisions['RSI 14'].length).toBe(200);
    expect(result!.decisions['EMA 20/50 Cross'].length).toBe(200);
    // Setiap keputusan harus salah satu dari 3 nilai yang valid
    const validDecisions = new Set(['BULLISH', 'BEARISH', 'NEUTRAL']);
    result!.decisions['RSI 14'].forEach((d) => expect(validDecisions.has(d)).toBe(true));
  });

  it('memangkas hasil ke RETAIN_DAYS terakhir untuk data yang jauh lebih panjang dari itu', () => {
    const history = makeHistory(1300); // ~5 tahun
    const result = computeTickerSeries('TEST.JK', history);
    expect(result).not.toBeNull();
    expect(result!.bars.length).toBe(560); // RETAIN_DAYS
    expect(result!.decisions['MACD'].length).toBe(560);
  });
});

describe('precomputeBacktestData', () => {
  it('melewati saham yang gagal fetch tanpa menggagalkan yang lain', async () => {
    const goodHistory = makeHistory(400);
    vi.mocked(fetchYahooHistory).mockImplementation(async (ticker: string) => {
      if (ticker === 'BBCA.JK') return null; // simulasikan satu saham gagal fetch
      return { history: goodHistory, currentPrice: goodHistory[goodHistory.length - 1].Close };
    });

    const result = await precomputeBacktestData();

    expect(result.tickers.find((t) => t.ticker === 'BBCA.JK')).toBeUndefined();
    expect(result.tickers.length).toBeGreaterThan(0);
    expect(result.ihsg.length).toBeGreaterThan(0);
    expect(result.computedAt).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run modules/backtest/service/__tests__/precompute.service.test.ts`
Expected: FAIL — `Cannot find module '../precompute.service'` (file doesn't exist yet).

- [ ] **Step 3: Implement the precompute service**

Create `modules/backtest/service/precompute.service.ts`:

```ts
import {
  fetchYahooHistory,
  analyzeEma,
  analyzeRsi,
  analyzeMacd,
  analyzeVolume,
  analyzeTrend,
  analyzeVolatility,
  analyzeSupport,
  analyzeMarketFlow,
  analyzeSma,
  type OhlcRow,
} from '@/modules/technical';
import { BACKTEST_UNIVERSE } from '../constants/backtest-universe';
import type {
  IndicatorName,
  Decision,
  DailyBar,
  TickerIndicatorSeries,
  BacktestIndicatorCache,
} from '../types/backtest.types';

// Buffer minimum hari perdagangan SEBELUM window keputusan mulai - MA Trend butuh
// 200 hari histori untuk MA200-nya sendiri (lihat modules/technical/service/analyzers/trend-analyzer.ts).
const LOOKBACK_DAYS = 200;
// Jendela histori yang diberikan ke tiap analyzer per hari (sejajar pola
// ANALYZER_HISTORY_DAYS di app/api/stock/[ticker]/route.ts - indikator standar tidak
// butuh ratusan tahun histori, cukup ~250 hari terakhir per titik waktu).
const ANALYZER_WINDOW = 250;
// Disimpan HANYA RETAIN_DAYS hari terakhir dari hasil precompute (bukan seluruh sisa
// setelah buffer) - cukup untuk periode backtest maksimal 24 bulan (~528 hari bursa)
// + margin, sekaligus membatasi ukuran payload Redis.
const RETAIN_DAYS = 560;

const INDICATOR_ANALYZERS: Record<IndicatorName, (history: any[], price: number) => { decision: string }> = {
  'EMA 20/50 Cross': analyzeEma,
  'Volume vs Avg 20D': analyzeVolume,
  'RSI 14': analyzeRsi,
  'MACD': analyzeMacd,
  'Volatility (ATR 14)': analyzeVolatility,
  'MA Trend IDX (20,50,200)': analyzeTrend,
  'Support & Resistance': analyzeSupport,
  'Market Flow Index': analyzeMarketFlow,
  'SMA Score (5,10,20)': analyzeSma,
};

const INDICATOR_NAMES = Object.keys(INDICATOR_ANALYZERS) as IndicatorName[];

function isValidDecision(d: string): d is Decision {
  return d === 'BULLISH' || d === 'BEARISH' || d === 'NEUTRAL';
}

function emptyDecisionMap(): Record<IndicatorName, Decision[]> {
  const map = {} as Record<IndicatorName, Decision[]>;
  INDICATOR_NAMES.forEach((name) => { map[name] = []; });
  return map;
}

// Diekspor untuk unit test - hitung deret keputusan harian 1 saham dari OHLCV mentah.
// null kalau data historis lebih pendek dari buffer lookback (saham baru IPO dsb).
export function computeTickerSeries(ticker: string, history: OhlcRow[]): TickerIndicatorSeries | null {
  if (history.length <= LOOKBACK_DAYS) return null;

  const bars: DailyBar[] = [];
  const decisions = emptyDecisionMap();

  for (let i = LOOKBACK_DAYS; i < history.length; i++) {
    const windowStart = Math.max(0, i - ANALYZER_WINDOW + 1);
    const windowHistory = history.slice(windowStart, i + 1);
    const currentPrice = history[i].Close;

    bars.push({ date: history[i].Date.split('T')[0], close: currentPrice });

    INDICATOR_NAMES.forEach((name) => {
      const result = INDICATOR_ANALYZERS[name](windowHistory, currentPrice);
      decisions[name].push(isValidDecision(result.decision) ? (result.decision as Decision) : 'NEUTRAL');
    });
  }

  const trimmedBars = bars.slice(-RETAIN_DAYS);
  const trimmedDecisions = emptyDecisionMap();
  INDICATOR_NAMES.forEach((name) => {
    trimmedDecisions[name] = decisions[name].slice(-RETAIN_DAYS);
  });

  return { ticker, bars: trimmedBars, decisions: trimmedDecisions };
}

async function fetchTickerSeries(ticker: string): Promise<TickerIndicatorSeries | null> {
  const result = await fetchYahooHistory(ticker, '5y');
  if (!result) return null; // fetch gagal - saham ini di-skip, tidak melempar error
  return computeTickerSeries(ticker, result.history);
}

// Entry point dipanggil cron (app/api/cron/backtest-precompute) dan fallback sinkron
// di /api/backtest saat cache-miss. Proses per-batch (bukan 100 fetch sekaligus)
// supaya tidak membebani Yahoo Finance terlalu berat dalam satu ledakan request.
export async function precomputeBacktestData(): Promise<BacktestIndicatorCache> {
  const BATCH_SIZE = 15;
  const tickers: TickerIndicatorSeries[] = [];

  for (let i = 0; i < BACKTEST_UNIVERSE.length; i += BATCH_SIZE) {
    const batch = BACKTEST_UNIVERSE.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(batch.map(fetchTickerSeries));
    for (const r of batchResults) {
      if (r) tickers.push(r);
    }
  }

  const ihsgResult = await fetchYahooHistory('^JKSE', '5y');
  const ihsg: DailyBar[] = ihsgResult
    ? ihsgResult.history.slice(LOOKBACK_DAYS).slice(-RETAIN_DAYS).map((h) => ({ date: h.Date.split('T')[0], close: h.Close }))
    : [];

  return { computedAt: new Date().toISOString(), ihsg, tickers };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run modules/backtest/service/__tests__/precompute.service.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add modules/backtest/service/precompute.service.ts modules/backtest/service/__tests__/precompute.service.test.ts
git commit -m "feat(backtest): implement precompute service (real day-by-day indicator computation)"
```

---

## Task 4: Redis cache read/write helpers

**Files:**
- Create: `modules/backtest/service/cache.service.ts`
- Test: `modules/backtest/service/__tests__/cache.service.test.ts`

**Interfaces:**
- Consumes: `BacktestIndicatorCache`, `TickerIndicatorSeries`, `DailyBar` (Task 2), `cacheGet`/`cacheSet`/`cacheMGet` from `shared/cache/redis-cache.ts` (existing), `CACHE_TTL_SEC.BACKTEST_INDICATORS` (Task 2).
- Produces: `writeBacktestCache(data: BacktestIndicatorCache): Promise<void>` — consumed by Task 6 (cron route).
- Produces: `readBacktestCache(): Promise<BacktestIndicatorCache | null>` — consumed by Task 8 (rewritten `/api/backtest` route).

Rationale for per-ticker keys instead of one giant blob: 100 tickers × 560 days × 9 indicators is a large payload (hundreds of thousands of values) if stored as a single JSON blob — risks hitting Redis/Upstash per-value size limits. Splitting into one key per ticker (plus a small meta key listing which tickers have data) keeps each individual value small and lets us use the existing `cacheMGet` helper (already built for exactly this "read many keys" pattern).

- [ ] **Step 1: Write the failing test**

Create `modules/backtest/service/__tests__/cache.service.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/shared/cache/redis-cache', () => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  cacheMGet: vi.fn(),
}));

import { writeBacktestCache, readBacktestCache } from '../cache.service';
import { cacheGet, cacheSet, cacheMGet } from '@/shared/cache/redis-cache';
import type { BacktestIndicatorCache } from '../../types/backtest.types';

const sampleCache: BacktestIndicatorCache = {
  computedAt: '2026-08-01T00:00:00.000Z',
  ihsg: [{ date: '2026-07-31', close: 7000 }],
  tickers: [
    {
      ticker: 'BBCA.JK',
      bars: [{ date: '2026-07-31', close: 9000 }],
      decisions: {
        'EMA 20/50 Cross': ['BULLISH'], 'Volume vs Avg 20D': ['BULLISH'], 'RSI 14': ['NEUTRAL'],
        'MACD': ['BULLISH'], 'Volatility (ATR 14)': ['NEUTRAL'], 'MA Trend IDX (20,50,200)': ['BULLISH'],
        'Support & Resistance': ['NEUTRAL'], 'Market Flow Index': ['BULLISH'], 'SMA Score (5,10,20)': ['BULLISH'],
      },
    },
  ],
};

describe('cache.service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writeBacktestCache menulis satu meta key dan satu key per ticker', async () => {
    await writeBacktestCache(sampleCache);

    expect(vi.mocked(cacheSet)).toHaveBeenCalledTimes(2); // 1 meta + 1 ticker
    const metaCall = vi.mocked(cacheSet).mock.calls.find(([key]) => key.endsWith(':meta'));
    expect(metaCall).toBeTruthy();
    const [, metaValue] = metaCall!;
    expect((metaValue as any).tickers).toEqual(['BBCA.JK']);

    const tickerCall = vi.mocked(cacheSet).mock.calls.find(([key]) => key.includes('BBCA.JK'));
    expect(tickerCall).toBeTruthy();
  });

  it('readBacktestCache mengembalikan null kalau meta key belum ada (cache-miss)', async () => {
    vi.mocked(cacheGet).mockResolvedValue(null);
    const result = await readBacktestCache();
    expect(result).toBeNull();
  });

  it('readBacktestCache menyusun ulang data dari meta + cacheMGet', async () => {
    vi.mocked(cacheGet).mockResolvedValue({
      computedAt: sampleCache.computedAt,
      ihsg: sampleCache.ihsg,
      tickers: ['BBCA.JK'],
    } as any);
    vi.mocked(cacheMGet).mockResolvedValue([sampleCache.tickers[0]] as any);

    const result = await readBacktestCache();

    expect(result).not.toBeNull();
    expect(result!.tickers.length).toBe(1);
    expect(result!.tickers[0].ticker).toBe('BBCA.JK');
    expect(result!.ihsg).toEqual(sampleCache.ihsg);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run modules/backtest/service/__tests__/cache.service.test.ts`
Expected: FAIL — `Cannot find module '../cache.service'`.

- [ ] **Step 3: Implement the cache service**

Create `modules/backtest/service/cache.service.ts`:

```ts
import { cacheGet, cacheSet, cacheMGet } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC } from '@/shared/cache/ttl-policy';
import type { BacktestIndicatorCache, TickerIndicatorSeries, DailyBar } from '../types/backtest.types';

const META_KEY = 'sahamlens:cache:computed:backtest-indicators:v1:meta';
const tickerKey = (ticker: string) => `sahamlens:cache:computed:backtest-indicators:v1:ticker:${ticker}`;

interface CacheMeta {
  computedAt: string;
  ihsg: DailyBar[];
  tickers: string[];
}

export async function writeBacktestCache(data: BacktestIndicatorCache): Promise<void> {
  const meta: CacheMeta = {
    computedAt: data.computedAt,
    ihsg: data.ihsg,
    tickers: data.tickers.map((t) => t.ticker),
  };
  await cacheSet(META_KEY, meta, CACHE_TTL_SEC.BACKTEST_INDICATORS);
  for (const series of data.tickers) {
    await cacheSet(tickerKey(series.ticker), series, CACHE_TTL_SEC.BACKTEST_INDICATORS);
  }
}

export async function readBacktestCache(): Promise<BacktestIndicatorCache | null> {
  const meta = await cacheGet<CacheMeta>(META_KEY);
  if (!meta) return null;

  const keys = meta.tickers.map(tickerKey);
  const seriesList = await cacheMGet<TickerIndicatorSeries>(keys);
  const tickers = seriesList.filter((s): s is TickerIndicatorSeries => s !== null);

  return { computedAt: meta.computedAt, ihsg: meta.ihsg, tickers };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run modules/backtest/service/__tests__/cache.service.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add modules/backtest/service/cache.service.ts modules/backtest/service/__tests__/cache.service.test.ts
git commit -m "feat(backtest): implement per-ticker Redis cache read/write helpers"
```

---

## Task 5: Simulation engine

**Files:**
- Create: `modules/backtest/service/simulate.service.ts`
- Test: `modules/backtest/service/__tests__/simulate.service.test.ts`

**Interfaces:**
- Consumes: `BacktestIndicatorCache`, `SimulateInput`, `SimulateResult`, `IndicatorName`, `Decision`, `TickerIndicatorSeries` (Task 2).
- Produces: `simulateBacktest(cache: BacktestIndicatorCache, input: SimulateInput): SimulateResult` — consumed by Task 8 (rewritten `/api/backtest` route).

- [ ] **Step 1: Write the failing tests**

Create `modules/backtest/service/__tests__/simulate.service.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { simulateBacktest } from '../simulate.service';
import type { BacktestIndicatorCache, IndicatorName, Decision } from '../../types/backtest.types';

const ALL_INDICATORS: IndicatorName[] = [
  'EMA 20/50 Cross', 'Volume vs Avg 20D', 'RSI 14', 'MACD', 'Volatility (ATR 14)',
  'MA Trend IDX (20,50,200)', 'Support & Resistance', 'Market Flow Index', 'SMA Score (5,10,20)',
];

function neutralDecisions(days: number): Record<IndicatorName, Decision[]> {
  const map = {} as Record<IndicatorName, Decision[]>;
  ALL_INDICATORS.forEach((name) => { map[name] = new Array(days).fill('NEUTRAL'); });
  return map;
}

function dateAt(i: number): string {
  const d = new Date(2024, 0, 1 + i);
  return d.toISOString().split('T')[0];
}

function makeCache(days: number): BacktestIndicatorCache {
  const bars = Array.from({ length: days }, (_, i) => ({ date: dateAt(i), close: 1000 }));
  return {
    computedAt: '2026-08-01T00:00:00.000Z',
    ihsg: bars.map((b) => ({ ...b })),
    tickers: [{ ticker: 'TEST.JK', bars: bars.map((b) => ({ ...b })), decisions: neutralDecisions(days) }],
  };
}

describe('simulateBacktest', () => {
  it('tidak ada trade kalau filter tidak pernah semua BULLISH - metrik nol, bukan NaN/Infinity', () => {
    const cache = makeCache(66); // 3 bulan ~= 66 hari bursa
    const result = simulateBacktest(cache, { filters: ['RSI 14'], modal: 100_000_000, periodMonths: 3 });

    expect(result.totalTrades).toBe(0);
    expect(result.winRatePct).toBe(0);
    expect(Number.isFinite(result.winRatePct)).toBe(true);
    expect(Number.isFinite(result.returnPct)).toBe(true);
    expect(result.equityCurve[0]).toBe(100_000_000);
  });

  it('entry saat semua filter BULLISH, exit begitu salah satu tidak lagi BULLISH', () => {
    const days = 66;
    const cache = makeCache(days);
    const decisions = cache.tickers[0].decisions;
    const bars = cache.tickers[0].bars;

    // BULLISH terus dari hari 0 sampai hari 20, lalu balik NEUTRAL - harga naik terus
    // supaya trade ini profit (memverifikasi arah pnl juga benar).
    for (let i = 0; i < days; i++) {
      decisions['RSI 14'][i] = i <= 20 ? 'BULLISH' : 'NEUTRAL';
      bars[i].close = 1000 + i * 10;
    }

    const result = simulateBacktest(cache, { filters: ['RSI 14'], modal: 100_000_000, periodMonths: 3 });

    expect(result.totalTrades).toBe(1);
    expect(result.trades[0].entryDate).toBe(dateAt(0));
    expect(result.trades[0].date).toBe(dateAt(21)); // exit di hari sinyal berbalik
    expect(result.trades[0].pnlPct).toBeGreaterThan(0);
    expect(result.winRatePct).toBe(100);
  });

  it('maksimal 5 posisi terbuka bersamaan, equal-weight dari ekuitas saat itu', () => {
    const days = 66;
    const cache: BacktestIndicatorCache = {
      computedAt: '2026-08-01T00:00:00.000Z',
      ihsg: Array.from({ length: days }, (_, i) => ({ date: dateAt(i), close: 1000 })),
      tickers: Array.from({ length: 8 }, (_, tIdx) => ({
        ticker: `T${tIdx}.JK`,
        bars: Array.from({ length: days }, (_, i) => ({ date: dateAt(i), close: 1000 })),
        // Semua 8 saham sinyal BULLISH terus sepanjang periode - cuma 5 yang boleh terisi.
        decisions: (() => {
          const m = {} as Record<IndicatorName, Decision[]>;
          ALL_INDICATORS.forEach((name) => { m[name] = new Array(days).fill(name === 'RSI 14' ? 'BULLISH' : 'NEUTRAL'); });
          return m;
        })(),
      })),
    };

    const result = simulateBacktest(cache, { filters: ['RSI 14'], modal: 100_000_000, periodMonths: 3 });

    // Tidak ada exit (sinyal BULLISH terus), jadi posisi terbuka di-force-close di
    // akhir periode - totalTrades harus PERSIS 5 (bukan 8), membuktikan cap slot.
    expect(result.totalTrades).toBe(5);
  });

  it('posisi yang masih terbuka di akhir periode di-force-close, bukan diabaikan', () => {
    const days = 66;
    const cache = makeCache(days);
    // BULLISH dari awal sampai akhir, tidak pernah exit sebelum periode habis.
    cache.tickers[0].decisions['RSI 14'] = new Array(days).fill('BULLISH');
    cache.tickers[0].bars.forEach((b, i) => { b.close = 1000 + i; });

    const result = simulateBacktest(cache, { filters: ['RSI 14'], modal: 100_000_000, periodMonths: 3 });

    expect(result.totalTrades).toBe(1);
    expect(result.trades[0].date).toBe(dateAt(days - 1)); // exit dipaksa di hari terakhir
  });

  it('alpha vs IHSG dihitung dari perbandingan return strategi vs return IHSG di window yang sama', () => {
    const days = 66;
    const cache = makeCache(days);
    cache.ihsg.forEach((b, i) => { b.close = 7000 + i * 5; }); // IHSG naik terus

    const result = simulateBacktest(cache, { filters: ['RSI 14'], modal: 100_000_000, periodMonths: 3 });

    const expectedIhsgReturn = ((cache.ihsg[days - 1].close - cache.ihsg[0].close) / cache.ihsg[0].close) * 100;
    expect(result.ihsgReturnPct).toBeCloseTo(expectedIhsgReturn, 1);
    expect(result.alphaPct).toBeCloseTo(result.returnPct - result.ihsgReturnPct, 1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run modules/backtest/service/__tests__/simulate.service.test.ts`
Expected: FAIL — `Cannot find module '../simulate.service'`.

- [ ] **Step 3: Implement the simulation engine**

Create `modules/backtest/service/simulate.service.ts`:

```ts
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
      equity += pos.shares * (day?.close ?? pos.entryPrice);
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
        openPositions.push({ symbol: ticker, entryDate: date, entryPrice: day.close, shares });
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run modules/backtest/service/__tests__/simulate.service.test.ts`
Expected: PASS (5 tests). If the "max 5 slots" test fails with a different trade count, check that all 8 synthetic tickers in that test really do have `decisions['RSI 14']` filled with `'BULLISH'` for every day and every other indicator `'NEUTRAL'` (only `filters: ['RSI 14']` is checked, so other indicators being NEUTRAL doesn't matter — but double check the array lengths match `days`).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add modules/backtest/service/simulate.service.ts modules/backtest/service/__tests__/simulate.service.test.ts
git commit -m "feat(backtest): implement day-by-day trade simulation engine"
```

---

## Task 6: `modules/backtest` barrel

**Files:**
- Create: `modules/backtest/index.ts`
- Test: none (re-export only)

**Interfaces:**
- Consumes: everything produced by Tasks 2-5.
- Produces: the only import surface for `app/api/cron/backtest-precompute/route.ts` (Task 7) and the rewritten `app/api/backtest/route.ts` (Task 8).

- [ ] **Step 1: Create the barrel**

Create `modules/backtest/index.ts`:

```ts
// Public API module backtest/ - satu-satunya yang boleh diimpor route/module lain.
// Jangan pernah import langsung dari modules/backtest/service/*, .../constants/* dst
// dari luar module ini (pola sama seperti modules/user, modules/watchlist).
export { precomputeBacktestData, computeTickerSeries } from './service/precompute.service';
export { writeBacktestCache, readBacktestCache } from './service/cache.service';
export { simulateBacktest } from './service/simulate.service';
export type {
  IndicatorName,
  Decision,
  DailyBar,
  TickerIndicatorSeries,
  BacktestIndicatorCache,
  SimulateInput,
  TradeRecord,
  SimulateResult,
} from './types/backtest.types';
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add modules/backtest/index.ts
git commit -m "feat(backtest): add modules/backtest public barrel"
```

---

## Task 7: Cron endpoint

**Files:**
- Create: `app/api/cron/backtest-precompute/route.ts`
- Test: none (thin route wiring — logic is already tested in Tasks 3-4; verified manually per Step 3 below)

**Interfaces:**
- Consumes: `precomputeBacktestData`, `writeBacktestCache` from `modules/backtest` barrel (Task 6); `verifyQStashSignature` from `shared/queue/qstash-signature.ts` (existing); `withJobRunLog` from `shared/scheduler/job-run-log.repository.ts` (existing).

- [ ] **Step 1: Create the cron route**

Create `app/api/cron/backtest-precompute/route.ts`, following the exact pattern of the existing `app/api/cron/watchlist-alert/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyQStashSignature } from '@/shared/queue/qstash-signature';
import { withJobRunLog } from '@/shared/scheduler/job-run-log.repository';
import { logger } from '@/shared/logger/logger';
import { precomputeBacktestData, writeBacktestCache } from '@/modules/backtest';

// Cron harian (didaftarkan sebagai QStash schedule terpisah, lihat DEPLOYMENT.md) -
// mengisi ulang cache indikator harian utk 100 saham universe backtest + IHSG.
// Tanpa ini jalan (atau kalau baru pertama kali deploy), /api/backtest fallback ke
// precompute sinkron langsung di request (lambat, lihat app/api/backtest/route.ts).
export async function POST(req: NextRequest) {
  const signature = req.headers.get('Upstash-Signature');
  const rawBody = await req.text();

  const isValid = await verifyQStashSignature(signature, rawBody);
  if (!isValid) {
    logger.warn('Menolak request /api/cron/backtest-precompute - signature QStash tidak valid');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await withJobRunLog('backtest-precompute', async () => {
      const data = await precomputeBacktestData();
      await writeBacktestCache(data);
      return { tickers: data.tickers.length, computedAt: data.computedAt };
    });
    return NextResponse.json({ success: true, result });
  } catch (err) {
    logger.error('Job backtest-precompute gagal', { err });
    return NextResponse.json({ error: 'Job gagal' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Note for manual verification (cannot be automated in this plan)**

This route can't be exercised end-to-end without a live QStash signature and a live Redis instance. Document in the PR/commit message that manual verification requires:
1. Registering `/api/cron/backtest-precompute` as a new QStash schedule (same process as the existing `watchlist-alert`/`market-pulse` schedules — see `DEPLOYMENT.md`).
2. After first successful run, confirming via `getLastRun('backtest-precompute')` (or the admin scheduler dashboard, if one exists) that `status: 'SUCCESS'`.
3. Confirming `/api/backtest` (Task 8) returns real, non-random data afterward.

- [ ] **Step 4: Commit**

```bash
git add "app/api/cron/backtest-precompute/route.ts"
git commit -m "feat(backtest): add daily precompute cron endpoint"
```

---

## Task 8: Rewrite `/api/backtest` route

**Files:**
- Modify: `app/api/backtest/route.ts` (full rewrite, replacing the `Math.random()` implementation)
- Test: `app/api/backtest/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `readBacktestCache`, `precomputeBacktestData`, `simulateBacktest`, `IndicatorName` (Task 6 barrel); `getSession` from `modules/user` (existing).
- Produces: JSON response shape backward-compatible with the existing frontend contract (`app/backtest/page.tsx` reads `return`, `ihsgReturn`, `alpha`, `winRate`, `totalTrades`, `maxDD`, `equityCurve`, `ihsgCurve`, `trades[].{date,symbol,buy,pnl}`) plus two new fields: `dataAsOf` (ISO string) and `message` (present only when `totalTrades === 0`).

- [ ] **Step 1: Write the failing test**

Create `app/api/backtest/__tests__/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/modules/user', () => ({
  getSession: vi.fn(),
}));
vi.mock('@/modules/backtest', () => ({
  readBacktestCache: vi.fn(),
  precomputeBacktestData: vi.fn(),
  simulateBacktest: vi.fn(),
}));

import { POST } from '../route';
import { getSession } from '@/modules/user';
import { readBacktestCache, precomputeBacktestData, simulateBacktest } from '@/modules/backtest';

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/backtest', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

const sampleResult = {
  returnPct: 12.34, ihsgReturnPct: -0.89, alphaPct: 13.23, winRatePct: 60,
  totalTrades: 5, maxDrawdownPct: -8.2,
  equityCurve: [100_000_000, 105_000_000], ihsgCurve: [100_000_000, 99_100_000],
  trades: [{ entryDate: '2026-01-01', date: '2026-01-15', symbol: 'BBCA.JK', buy: 9000, sell: 9500, pnlPct: 5.56 }],
  computedAt: '2026-08-01T00:00:00.000Z',
};

describe('POST /api/backtest', () => {
  beforeEach(() => vi.clearAllMocks());

  it('menolak request tanpa session dengan 401', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const res = await POST(makeRequest({ filters: ['RSI 14'], modal: 100_000_000, period: 3 }));
    expect(res.status).toBe(401);
  });

  it('pakai cache kalau ada, dan format response sesuai kontrak lama (string bertanda +/-)', async () => {
    vi.mocked(getSession).mockResolvedValue({ id: 'u1' } as any);
    vi.mocked(readBacktestCache).mockResolvedValue({ computedAt: 'x', ihsg: [], tickers: [] } as any);
    vi.mocked(simulateBacktest).mockReturnValue(sampleResult as any);

    const res = await POST(makeRequest({ filters: ['RSI 14'], modal: 100_000_000, period: 3 }));
    const json = await res.json();

    expect(precomputeBacktestData).not.toHaveBeenCalled();
    expect(json.return).toBe('+12.34%');
    expect(json.ihsgReturn).toBe('-0.89%');
    expect(json.alpha).toBe('+13.23%');
    expect(json.winRate).toBe('60%');
    expect(json.maxDD).toBe('-8.2%');
    expect(json.totalTrades).toBe(5);
    expect(json.trades[0]).toEqual({ date: '2026-01-15', symbol: 'BBCA.JK', buy: 9000, pnl: '+5.56%' });
    expect(json.dataAsOf).toBe('2026-08-01T00:00:00.000Z');
  });

  it('fallback ke precompute sinkron kalau cache kosong', async () => {
    vi.mocked(getSession).mockResolvedValue({ id: 'u1' } as any);
    vi.mocked(readBacktestCache).mockResolvedValue(null);
    vi.mocked(precomputeBacktestData).mockResolvedValue({ computedAt: 'y', ihsg: [], tickers: [] } as any);
    vi.mocked(simulateBacktest).mockReturnValue(sampleResult as any);

    const res = await POST(makeRequest({ filters: ['RSI 14'], modal: 100_000_000, period: 3 }));

    expect(precomputeBacktestData).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
  });

  it('0 trade balas pesan eksplisit, bukan NaN/Infinity di response', async () => {
    vi.mocked(getSession).mockResolvedValue({ id: 'u1' } as any);
    vi.mocked(readBacktestCache).mockResolvedValue({ computedAt: 'x', ihsg: [], tickers: [] } as any);
    vi.mocked(simulateBacktest).mockReturnValue({ ...sampleResult, totalTrades: 0, winRatePct: 0, trades: [] } as any);

    const res = await POST(makeRequest({ filters: ['RSI 14'], modal: 100_000_000, period: 3 }));
    const json = await res.json();

    expect(json.totalTrades).toBe(0);
    expect(json.message).toBe('Tidak ada saham yang memenuhi kriteria filter ini dalam periode terpilih.');
  });

  it('menolak modal <= 0 dengan 400', async () => {
    vi.mocked(getSession).mockResolvedValue({ id: 'u1' } as any);
    const res = await POST(makeRequest({ filters: ['RSI 14'], modal: 0, period: 3 }));
    expect(res.status).toBe(400);
  });

  it('menolak filters kosong dengan 400', async () => {
    vi.mocked(getSession).mockResolvedValue({ id: 'u1' } as any);
    const res = await POST(makeRequest({ filters: [], modal: 100_000_000, period: 3 }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run app/api/backtest/__tests__/route.test.ts`
Expected: FAIL (route still has the old `Math.random()` implementation, response shape and 400-validation don't exist yet).

- [ ] **Step 3: Rewrite the route**

Replace the full contents of `app/api/backtest/route.ts`:

```ts
import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { getSession } from '@/modules/user';
import {
  readBacktestCache,
  precomputeBacktestData,
  simulateBacktest,
  type IndicatorName,
} from '@/modules/backtest';

const VALID_FILTERS: IndicatorName[] = [
  'EMA 20/50 Cross', 'Volume vs Avg 20D', 'RSI 14', 'MACD', 'Volatility (ATR 14)',
  'MA Trend IDX (20,50,200)', 'Support & Resistance', 'Market Flow Index', 'SMA Score (5,10,20)',
];
const VALID_PERIODS = [3, 6, 12, 24];
const MAX_TRADES_IN_RESPONSE = 30;

function fmtPct(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Belum login' }, { status: 401 });
    }

    const body = await request.json();
    const filters: IndicatorName[] = Array.isArray(body?.filters)
      ? body.filters.filter((f: unknown): f is IndicatorName => VALID_FILTERS.includes(f as IndicatorName))
      : [];
    const modal = Number(body?.modal);
    const period = Number(body?.period);

    if (filters.length === 0) {
      return NextResponse.json({ error: 'Pilih minimal 1 filter' }, { status: 400 });
    }
    if (!Number.isFinite(modal) || modal <= 0) {
      return NextResponse.json({ error: 'Modal awal harus lebih dari 0' }, { status: 400 });
    }
    if (!VALID_PERIODS.includes(period)) {
      return NextResponse.json({ error: 'Periode tidak valid' }, { status: 400 });
    }

    let cache = await readBacktestCache();
    if (!cache) {
      // Cron belum pernah jalan / cache kadaluarsa - hitung langsung (lambat, tapi
      // tetap data asli, bukan gagal). Pola sama seperti market-pulse/breakout-radar.
      cache = await precomputeBacktestData();
    }

    const result = simulateBacktest(cache, { filters, modal, periodMonths: period });

    const responseBody: Record<string, unknown> = {
      return: fmtPct(result.returnPct),
      ihsgReturn: fmtPct(result.ihsgReturnPct),
      alpha: fmtPct(result.alphaPct),
      winRate: `${result.winRatePct.toFixed(0)}%`,
      totalTrades: result.totalTrades,
      maxDD: fmtPct(result.maxDrawdownPct),
      equityCurve: result.equityCurve,
      ihsgCurve: result.ihsgCurve,
      trades: result.trades.slice(0, MAX_TRADES_IN_RESPONSE).map((t) => ({
        date: t.date,
        symbol: t.symbol,
        buy: Math.round(t.buy),
        pnl: fmtPct(t.pnlPct),
      })),
      dataAsOf: result.computedAt,
    };

    if (result.totalTrades === 0) {
      responseBody.message = 'Tidak ada saham yang memenuhi kriteria filter ini dalam periode terpilih.';
    }

    return NextResponse.json(responseBody);
  } catch (error) {
    return NextResponse.json({ error: 'Server Error' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run app/api/backtest/__tests__/route.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/api/backtest/route.ts app/api/backtest/__tests__/route.test.ts
git commit -m "feat(backtest): rewrite /api/backtest to use real simulation engine, drop Math.random()"
```

---

## Task 9: Frontend updates

**Files:**
- Modify: `app/backtest/page.tsx`

**Interfaces:**
- Consumes: the response shape produced by Task 8 (`return`, `ihsgReturn`, `alpha`, `winRate`, `totalTrades`, `maxDD`, `equityCurve`, `ihsgCurve`, `trades[]`, `dataAsOf`, optional `message`).

- [ ] **Step 1: Update `availableFilters` and presets**

In `app/backtest/page.tsx`, replace:

```ts
  const availableFilters = [
    'EMA 20/50 Cross',
    'Volume vs Avg 20D',
    'Foreign Flow',
    'RSI 14',
    'MACD',
    'Bollinger Bands',
    'MA Trend IDX (20,50,200)',
    'Support & Resistance',
    'Market Flow Index',
    'Trend Price vs MA200'
  ];
```

with:

```ts
  const availableFilters = [
    'EMA 20/50 Cross',
    'Volume vs Avg 20D',
    'RSI 14',
    'MACD',
    'Volatility (ATR 14)',
    'MA Trend IDX (20,50,200)',
    'Support & Resistance',
    'Market Flow Index',
    'SMA Score (5,10,20)'
  ];
```

Replace:

```ts
  const applyPreset = (preset: string) => {
    if (preset === 'Momentum') {
      setSelectedFilters(['EMA 20/50 Cross', 'Volume vs Avg 20D', 'RSI 14']);
    } else if (preset === 'Accumulation') {
      setSelectedFilters(['Foreign Flow', 'Market Flow Index', 'MACD']);
    } else if (preset === 'Oversold') {
      setSelectedFilters(['RSI 14', 'Bollinger Bands', 'Support & Resistance']);
    }
  };
```

with:

```ts
  const applyPreset = (preset: string) => {
    if (preset === 'Momentum') {
      setSelectedFilters(['EMA 20/50 Cross', 'Volume vs Avg 20D', 'RSI 14']);
    } else if (preset === 'Accumulation') {
      setSelectedFilters(['Market Flow Index', 'MACD', 'Volume vs Avg 20D']);
    } else if (preset === 'Oversold') {
      setSelectedFilters(['RSI 14', 'Volatility (ATR 14)', 'Support & Resistance']);
    }
  };
```

And update the default `selectedFilters` initial state (currently `['EMA 20/50 Cross', 'Volume vs Avg 20D', 'RSI 14']`) — no change needed, it doesn't reference any removed/renamed filter.

- [ ] **Step 2: Add `dataAsOf`/`message` handling and rename the trades table heading**

Replace the results-destructuring/rendering section. First, near where `results` state is read for the chart data (`const chartData = ...`), add right after it:

```tsx
  const chartData = results?.equityCurve?.map((eq: number, idx: number) => ({
    month: `M${idx}`,
    Strategy: eq,
    IHSG: results.ihsgCurve[idx]
  })) || [];

  const dataAsOfLabel = results?.dataAsOf
    ? new Date(results.dataAsOf).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;
```

In the results panel, right after the opening of the `{results && !loading && (` block (before the `{/* Metrics */}` comment), add a message block for the zero-trade case and the data-freshness note:

```tsx
            {results && !loading && (
              <>
                {dataAsOfLabel && (
                  <p className="text-[11px] text-tv-muted">Data per {dataAsOfLabel} (diperbarui otomatis tiap hari, bukan real-time).</p>
                )}
                {results.message && (
                  <div className="bg-tv-card border border-tv-yellow/30 rounded-lg p-4 text-sm text-tv-yellow">
                    {results.message}
                  </div>
                )}
                {/* Metrics */}
```

Rename the trades table heading and note the display cap. Replace:

```tsx
                <div className="bg-tv-card border border-tv-border rounded-lg shadow-1 overflow-hidden">
                  <div className="p-4 border-b border-tv-border bg-tv-bg/40">
                    <h3 className="font-heading text-sm font-bold text-tv-text">Simulated Trades (Sample)</h3>
                  </div>
```

with:

```tsx
                <div className="bg-tv-card border border-tv-border rounded-lg shadow-1 overflow-hidden">
                  <div className="p-4 border-b border-tv-border bg-tv-bg/40">
                    <h3 className="font-heading text-sm font-bold text-tv-text">
                      Riwayat Trade {results.totalTrades > 30 ? `(30 terbaru dari ${results.totalTrades})` : ''}
                    </h3>
                  </div>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/backtest/page.tsx
git commit -m "feat(backtest): update filter names/presets and results UI for real backtest engine"
```

---

## Task 10: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: all test files pass, including the 4 new ones added in this plan (`precompute.service.test.ts`, `cache.service.test.ts`, `simulate.service.test.ts`, `route.test.ts` under `app/api/backtest/__tests__/`) plus the pre-existing suite unaffected.

- [ ] **Step 2: Full project typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: build succeeds (catches any Next.js-specific issues, e.g. the new route files, that `tsc --noEmit` alone might miss).

- [ ] **Step 4: Manual smoke test of `/api/backtest` (no cache yet — exercises the sync-fallback path)**

With the dev server running (`npm run dev`, port 3001) and logged in with a valid session cookie, run:

```bash
curl -s -X POST http://localhost:3001/api/backtest \
  -H "Content-Type: application/json" \
  -H "Cookie: <paste a valid sahamlens session cookie here>" \
  -d '{"filters":["RSI 14","Volume vs Avg 20D"],"modal":100000000,"period":3}'
```

Expected: a JSON response with `return`, `alpha`, `winRate`, `totalTrades`, `maxDD`, `equityCurve` (array of 4 numbers for a 3-month period), `trades`, and `dataAsOf` — took noticeably longer than a normal request (cache-miss triggers synchronous precompute across the 100-ticker universe). Running the exact same request again should be fast (well under a second) if `writeBacktestCache` was reachable (requires `UPSTASH_REDIS_REST_URL`/`TOKEN` configured in `.env.local` — if not configured, every call falls through to the slow synchronous path, which is expected/documented degrade-safe behavior, not a bug).

- [ ] **Step 5: Visual check of `app/backtest/page.tsx`**

Open `http://localhost:3001/backtest` in a browser, select the "Oversold Bounce" preset, click "Backtest Sekarang", and confirm: the filter chips shown match `['RSI 14', 'Volatility (ATR 14)', 'Support & Resistance']` (not the old `Bollinger Bands`), the trades table is titled "Riwayat Trade", and a "Data per ..." line appears above the metrics once results load.

- [ ] **Step 6: Final commit (if any fixes were needed during verification)**

```bash
git add -A
git commit -m "chore(backtest): fix issues found during full verification pass"
```

(Skip this step if Steps 1-5 all passed cleanly with no changes needed.)
