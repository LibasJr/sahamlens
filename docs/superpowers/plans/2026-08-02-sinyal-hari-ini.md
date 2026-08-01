# Sinyal Hari Ini Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Sinyal Hari Ini" tab to the existing Backtest page that shows which stocks (from the 94-ticker backtest universe) match the user's selected filter combination TODAY, combined with that combination's 12-month historical performance (win rate/return/alpha) from the existing backtest simulator.

**Architecture:** Pure logic addition on top of data that's already precomputed for the Backtest feature — no new cron, no new Redis keys, no new endpoint. A new pure function `computeLiveSignal()` reads the last day of the same `BacktestIndicatorCache` used by `simulateBacktest()`. The existing `/api/backtest` route gains an optional `mode: 'live-signal'` body field (default `'backtest'`, fully backward compatible) that calls both `computeLiveSignal()` (today's matches) and `simulateBacktest()` (historical stats) and returns both. The Backtest page gets a tab switcher sharing the existing filter-selection UI.

**Tech Stack:** Next.js 14 App Router, TypeScript, Vitest, existing `modules/backtest` module (Upstash Redis cache via `readBacktestCache`/`writeBacktestCache`).

## Global Constraints

- Vitest cannot resolve the `@/*` path alias in this repo — all new test files and any production file a test imports directly must use relative imports (see `modules/backtest/service/__tests__/simulate.service.test.ts` for the pattern).
- `modules/backtest/index.ts` is the only file outside `modules/backtest/` allowed to import from `modules/backtest/service/*` or `modules/backtest/types/*` — new exports go through it.
- The `IndicatorName` union has exactly 9 members (see `modules/backtest/types/backtest.types.ts`) — the live-signal score is always "X/9", not derived from the filter count.
- Data is "as of last precomputed close", never live/intraday — must be labeled honestly in the UI with a "Data per [tanggal]" string, same pattern as the existing Backtest tab.
- Do not push to GitHub or deploy until the user explicitly asks — this instruction stands independent of this plan.

---

### Task 1: `computeLiveSignal()` service function

**Files:**
- Create: `modules/backtest/service/live-signal.service.ts`
- Test: `modules/backtest/service/__tests__/live-signal.service.test.ts`
- Modify: `modules/backtest/index.ts`

**Interfaces:**
- Consumes: `BacktestIndicatorCache`, `IndicatorName`, `Decision`, `TickerIndicatorSeries` from `../types/backtest.types` (already defined, see Global Constraints).
- Produces: `computeLiveSignal(cache: BacktestIndicatorCache, filters: IndicatorName[]): LiveSignalResult`, `LiveSignalMatch { symbol: string; price: number; score: number }`, `LiveSignalResult { dataAsOf: string; matches: LiveSignalMatch[] }` — Task 2 imports both the function and both types from `modules/backtest`.

- [ ] **Step 1: Write the failing test**

Create `modules/backtest/service/__tests__/live-signal.service.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computeLiveSignal } from '../live-signal.service';
import type { BacktestIndicatorCache, IndicatorName, Decision, TickerIndicatorSeries } from '../../types/backtest.types';

const ALL_INDICATORS: IndicatorName[] = [
  'EMA 20/50 Cross', 'Volume vs Avg 20D', 'RSI 14', 'MACD', 'Volatility (ATR 14)',
  'MA Trend IDX (20,50,200)', 'Support & Resistance', 'Market Flow Index', 'SMA Score (5,10,20)',
];

function neutralDecisions(days: number): Record<IndicatorName, Decision[]> {
  const map = {} as Record<IndicatorName, Decision[]>;
  ALL_INDICATORS.forEach((name) => { map[name] = new Array(days).fill('NEUTRAL'); });
  return map;
}

// Bikin 1 ticker dengan 3 hari histori - cuma hari TERAKHIR yang dipakai
// computeLiveSignal, tapi butuh >1 hari supaya bentuk data realistis.
function makeTicker(
  ticker: string,
  price: number,
  lastDayOverrides: Partial<Record<IndicatorName, Decision>>
): TickerIndicatorSeries {
  const days = 3;
  const decisions = neutralDecisions(days);
  (Object.keys(lastDayOverrides) as IndicatorName[]).forEach((name) => {
    decisions[name][days - 1] = lastDayOverrides[name]!;
  });
  return {
    ticker,
    bars: [
      { date: '2026-07-30', close: price - 10 },
      { date: '2026-07-31', close: price - 5 },
      { date: '2026-08-01', close: price },
    ],
    decisions,
  };
}

function makeCache(tickers: TickerIndicatorSeries[]): BacktestIndicatorCache {
  return { computedAt: '2026-08-01T16:00:00.000Z', ihsg: [], tickers };
}

describe('computeLiveSignal', () => {
  it('saham cocok kalau SEMUA filter BULLISH di hari terakhir', () => {
    const cache = makeCache([
      makeTicker('BBCA.JK', 9000, { 'RSI 14': 'BULLISH', MACD: 'BULLISH' }),
    ]);
    const result = computeLiveSignal(cache, ['RSI 14', 'MACD']);

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].symbol).toBe('BBCA.JK');
    expect(result.matches[0].price).toBe(9000);
    expect(result.dataAsOf).toBe('2026-08-01T16:00:00.000Z');
  });

  it('saham TIDAK cocok kalau salah satu filter tidak BULLISH', () => {
    const cache = makeCache([
      makeTicker('BBCA.JK', 9000, { 'RSI 14': 'BULLISH', MACD: 'NEUTRAL' }),
    ]);
    const result = computeLiveSignal(cache, ['RSI 14', 'MACD']);

    expect(result.matches).toHaveLength(0);
  });

  it('skor dihitung dari SEMUA 9 indikator, bukan cuma yang dipakai sebagai filter', () => {
    const cache = makeCache([
      makeTicker('BBCA.JK', 9000, {
        'RSI 14': 'BULLISH', // filter
        MACD: 'BULLISH', // bukan filter, tapi ikut dihitung skor
        'EMA 20/50 Cross': 'BULLISH', // bukan filter, tapi ikut dihitung skor
      }),
    ]);
    const result = computeLiveSignal(cache, ['RSI 14']);

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].score).toBe(3);
  });

  it('urutan hasil dari skor tertinggi ke terendah', () => {
    const cache = makeCache([
      makeTicker('LOW.JK', 1000, { 'RSI 14': 'BULLISH' }),
      makeTicker('HIGH.JK', 2000, { 'RSI 14': 'BULLISH', MACD: 'BULLISH', 'EMA 20/50 Cross': 'BULLISH' }),
    ]);
    const result = computeLiveSignal(cache, ['RSI 14']);

    expect(result.matches.map((m) => m.symbol)).toEqual(['HIGH.JK', 'LOW.JK']);
  });

  it('tie-break alfabetis kalau skor sama', () => {
    const cache = makeCache([
      makeTicker('ZETA.JK', 1000, { 'RSI 14': 'BULLISH' }),
      makeTicker('ALPHA.JK', 1000, { 'RSI 14': 'BULLISH' }),
    ]);
    const result = computeLiveSignal(cache, ['RSI 14']);

    expect(result.matches.map((m) => m.symbol)).toEqual(['ALPHA.JK', 'ZETA.JK']);
  });

  it('hasil kosong kalau tidak ada saham yang cocok', () => {
    const cache = makeCache([
      makeTicker('BBCA.JK', 9000, { 'RSI 14': 'NEUTRAL' }),
    ]);
    const result = computeLiveSignal(cache, ['RSI 14']);

    expect(result.matches).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run modules/backtest/service/__tests__/live-signal.service.test.ts`
Expected: FAIL — `Cannot find module '../live-signal.service'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `modules/backtest/service/live-signal.service.ts`:

```typescript
import type {
  BacktestIndicatorCache,
  IndicatorName,
  Decision,
  TickerIndicatorSeries,
} from '../types/backtest.types';

const ALL_INDICATORS: IndicatorName[] = [
  'EMA 20/50 Cross', 'Volume vs Avg 20D', 'RSI 14', 'MACD', 'Volatility (ATR 14)',
  'MA Trend IDX (20,50,200)', 'Support & Resistance', 'Market Flow Index', 'SMA Score (5,10,20)',
];

export interface LiveSignalMatch {
  symbol: string;
  price: number;
  score: number; // jumlah SEMUA 9 indikator yang BULLISH hari itu, 0-9
}

export interface LiveSignalResult {
  dataAsOf: string;
  matches: LiveSignalMatch[];
}

function lastDayDecisions(series: TickerIndicatorSeries, lastIdx: number): Record<IndicatorName, Decision> {
  const decisions = {} as Record<IndicatorName, Decision>;
  ALL_INDICATORS.forEach((name) => {
    decisions[name] = series.decisions[name][lastIdx];
  });
  return decisions;
}

export function computeLiveSignal(cache: BacktestIndicatorCache, filters: IndicatorName[]): LiveSignalResult {
  const matches: LiveSignalMatch[] = [];

  for (const series of cache.tickers) {
    const lastIdx = series.bars.length - 1;
    if (lastIdx < 0) continue;

    const decisions = lastDayDecisions(series, lastIdx);
    const isMatch = filters.every((f) => decisions[f] === 'BULLISH');
    if (!isMatch) continue;

    const score = ALL_INDICATORS.filter((name) => decisions[name] === 'BULLISH').length;
    matches.push({ symbol: series.ticker, price: series.bars[lastIdx].close, score });
  }

  matches.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.symbol.localeCompare(b.symbol)));

  return { dataAsOf: cache.computedAt, matches };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run modules/backtest/service/__tests__/live-signal.service.test.ts`
Expected: PASS, all 6 tests green.

- [ ] **Step 5: Export from the module's public API**

Modify `modules/backtest/index.ts` — add `computeLiveSignal` to the service export line and the new types to the type export block:

```typescript
// Public API module backtest/ - satu-satunya yang boleh diimpor route/module lain.
// Jangan pernah import langsung dari modules/backtest/service/*, .../constants/* dst
// dari luar module ini (pola sama seperti modules/user, modules/watchlist).
export { precomputeBacktestData, computeTickerSeries } from './service/precompute.service';
export { writeBacktestCache, readBacktestCache } from './service/cache.service';
export { simulateBacktest } from './service/simulate.service';
export { computeLiveSignal } from './service/live-signal.service';
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
export type { LiveSignalMatch, LiveSignalResult } from './service/live-signal.service';
```

- [ ] **Step 6: Run typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add modules/backtest/service/live-signal.service.ts modules/backtest/service/__tests__/live-signal.service.test.ts modules/backtest/index.ts
git commit -m "feat: tambah computeLiveSignal untuk cek saham cocok filter hari ini"
```

---

### Task 2: Extend `/api/backtest` with `mode: 'live-signal'`

**Files:**
- Modify: `app/api/backtest/route.ts`
- Test: `app/api/backtest/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `computeLiveSignal(cache, filters): LiveSignalResult` and `simulateBacktest(cache, input): SimulateResult` from `../../../modules/backtest` (Task 1's output; `simulateBacktest` already exists and is unchanged).
- Produces: `POST /api/backtest` with `{ filters, mode: 'live-signal' }` body now returns `{ dataAsOf: string, matches: LiveSignalMatch[], historicalStats: { winRatePct: number, returnPct: number, alphaPct: number, totalTrades: number } }`. Task 3 (frontend) consumes this exact shape.

- [ ] **Step 1: Write the failing tests**

Modify `app/api/backtest/__tests__/route.test.ts` — add `computeLiveSignal` to the existing `vi.mock('../../../../modules/backtest', ...)` block and its import, then append new test cases at the end of the `describe` block (before the final closing `});`):

Change the mock block (near the top of the file) from:

```typescript
vi.mock('../../../../modules/backtest', () => ({
  readBacktestCache: vi.fn(),
  precomputeBacktestData: vi.fn(),
  writeBacktestCache: vi.fn(),
  simulateBacktest: vi.fn(),
}));

import { POST } from '../route';
import { getSession } from '../../../../modules/user';
import { readBacktestCache, precomputeBacktestData, writeBacktestCache, simulateBacktest } from '../../../../modules/backtest';
```

to:

```typescript
vi.mock('../../../../modules/backtest', () => ({
  readBacktestCache: vi.fn(),
  precomputeBacktestData: vi.fn(),
  writeBacktestCache: vi.fn(),
  simulateBacktest: vi.fn(),
  computeLiveSignal: vi.fn(),
}));

import { POST } from '../route';
import { getSession } from '../../../../modules/user';
import { readBacktestCache, precomputeBacktestData, writeBacktestCache, simulateBacktest, computeLiveSignal } from '../../../../modules/backtest';
```

Then add this new `describe` block after the existing `describe('POST /api/backtest', ...)` block (i.e. at the end of the file, as a sibling top-level block):

```typescript
describe('POST /api/backtest (mode: live-signal)', () => {
  beforeEach(() => vi.clearAllMocks());

  const sampleLiveSignal = {
    dataAsOf: '2026-08-01T16:00:00.000Z',
    matches: [{ symbol: 'BBCA.JK', price: 9500, score: 6 }],
  };
  const sampleHistorical = {
    returnPct: 15.5, ihsgReturnPct: 2.1, alphaPct: 13.4, winRatePct: 62,
    totalTrades: 8, maxDrawdownPct: -5.5,
    equityCurve: [], ihsgCurve: [], trades: [],
    computedAt: '2026-08-01T16:00:00.000Z',
  };

  it('menolak request tanpa session dengan 401', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const res = await POST(makeRequest({ filters: ['RSI 14'], mode: 'live-signal' }));
    expect(res.status).toBe(401);
  });

  it('menolak filters kosong dengan 400', async () => {
    vi.mocked(getSession).mockResolvedValue({ id: 'u1' } as any);
    const res = await POST(makeRequest({ filters: [], mode: 'live-signal' }));
    expect(res.status).toBe(400);
  });

  it('menolak filter tidak dikenal dengan 400', async () => {
    vi.mocked(getSession).mockResolvedValue({ id: 'u1' } as any);
    const res = await POST(makeRequest({ filters: ['Bollinger Bands'], mode: 'live-signal' }));
    expect(res.status).toBe(400);
  });

  it('mengembalikan matches + historicalStats dari cache yang ada, tidak butuh modal/period', async () => {
    vi.mocked(getSession).mockResolvedValue({ id: 'u1' } as any);
    vi.mocked(readBacktestCache).mockResolvedValue({ computedAt: 'x', ihsg: [], tickers: [] } as any);
    vi.mocked(computeLiveSignal).mockReturnValue(sampleLiveSignal as any);
    vi.mocked(simulateBacktest).mockReturnValue(sampleHistorical as any);

    const res = await POST(makeRequest({ filters: ['RSI 14'], mode: 'live-signal' }));
    const json = await res.json();

    expect(precomputeBacktestData).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(json.dataAsOf).toBe('2026-08-01T16:00:00.000Z');
    expect(json.matches).toEqual([{ symbol: 'BBCA.JK', price: 9500, score: 6 }]);
    expect(json.historicalStats).toEqual({ winRatePct: 62, returnPct: 15.5, alphaPct: 13.4, totalTrades: 8 });
  });

  it('fallback ke precompute sinkron kalau cache kosong', async () => {
    vi.mocked(getSession).mockResolvedValue({ id: 'u1' } as any);
    vi.mocked(readBacktestCache).mockResolvedValue(null);
    vi.mocked(precomputeBacktestData).mockResolvedValue({ computedAt: 'y', ihsg: [], tickers: [] } as any);
    vi.mocked(computeLiveSignal).mockReturnValue(sampleLiveSignal as any);
    vi.mocked(simulateBacktest).mockReturnValue(sampleHistorical as any);

    const res = await POST(makeRequest({ filters: ['RSI 14'], mode: 'live-signal' }));

    expect(precomputeBacktestData).toHaveBeenCalledTimes(1);
    expect(writeBacktestCache).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
  });

  it('default mode (tanpa field mode) tetap jalan seperti kontrak lama', async () => {
    vi.mocked(getSession).mockResolvedValue({ id: 'u1' } as any);
    vi.mocked(readBacktestCache).mockResolvedValue({ computedAt: 'x', ihsg: [], tickers: [] } as any);
    vi.mocked(simulateBacktest).mockReturnValue(sampleHistorical as any);

    const res = await POST(makeRequest({ filters: ['RSI 14'], modal: 100_000_000, period: 3 }));
    const json = await res.json();

    expect(computeLiveSignal).not.toHaveBeenCalled();
    expect(json.matches).toBeUndefined();
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/api/backtest/__tests__/route.test.ts`
Expected: FAIL — `mode: 'live-signal'` requests currently go through the old `modal`/`period` validation path and return 400 (no `mode` handling exists yet), and `computeLiveSignal` is never called.

- [ ] **Step 3: Write the implementation**

Replace the full contents of `app/api/backtest/route.ts`:

```typescript
import { guard } from '../../../lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { getSession } from '../../../modules/user';
import { logger } from '../../../shared/logger/logger';
import {
  readBacktestCache,
  precomputeBacktestData,
  writeBacktestCache,
  simulateBacktest,
  computeLiveSignal,
  type IndicatorName,
  type BacktestIndicatorCache,
} from '../../../modules/backtest';

export const maxDuration = 60;

const VALID_FILTERS: IndicatorName[] = [
  'EMA 20/50 Cross', 'Volume vs Avg 20D', 'RSI 14', 'MACD', 'Volatility (ATR 14)',
  'MA Trend IDX (20,50,200)', 'Support & Resistance', 'Market Flow Index', 'SMA Score (5,10,20)',
];
const VALID_PERIODS = [3, 6, 12, 24];
const MAX_TRADES_IN_RESPONSE = 30;
// Modal/periode historicalStats tab "Sinyal Hari Ini" - HANYA dipakai untuk menghitung
// win rate/return %/alpha % (tidak bergantung skala modal), tidak pernah ditampilkan
// sebagai modal ke user (lihat spec docs/superpowers/specs/2026-08-02-sinyal-hari-ini-design.md).
const LIVE_SIGNAL_MODAL = 100_000_000;
const LIVE_SIGNAL_PERIOD_MONTHS = 12;

function fmtPct(n: number): string {
  const formatted = n.toFixed(2).replace(/\.?0+$/, '');
  return `${n >= 0 ? '+' : ''}${formatted}%`;
}

async function getCache(): Promise<BacktestIndicatorCache> {
  let cache = await readBacktestCache();
  if (!cache) {
    // Cron belum pernah jalan / cache kadaluarsa - hitung langsung (lambat, tapi
    // tetap data asli, bukan gagal). Pola sama seperti market-pulse/breakout-radar.
    cache = await precomputeBacktestData();
    // Simpan hasilnya supaya request cache-miss berikutnya tidak ikut menghitung ulang
    // seluruh universe dari nol (tanpa distributed lock/stampede protection - di luar
    // scope fix ini, lihat catatan review).
    await writeBacktestCache(cache);
  }
  return cache;
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Belum login' }, { status: 401 });
    }

    const body = await request.json();
    const mode = body?.mode === 'live-signal' ? 'live-signal' : 'backtest';

    const rawFilters: unknown[] = Array.isArray(body?.filters) ? body.filters : [];
    const hasUnknownFilter = rawFilters.some(
      (f): boolean => !(typeof f === 'string' && VALID_FILTERS.includes(f as IndicatorName))
    );
    if (hasUnknownFilter) {
      return NextResponse.json({ error: 'Filter tidak dikenal' }, { status: 400 });
    }
    const filters = rawFilters as IndicatorName[];
    if (filters.length === 0) {
      return NextResponse.json({ error: 'Pilih minimal 1 filter' }, { status: 400 });
    }

    if (mode === 'live-signal') {
      const cache = await getCache();
      const liveResult = computeLiveSignal(cache, filters);
      const historical = simulateBacktest(cache, {
        filters,
        modal: LIVE_SIGNAL_MODAL,
        periodMonths: LIVE_SIGNAL_PERIOD_MONTHS,
      });

      return NextResponse.json({
        dataAsOf: liveResult.dataAsOf,
        matches: liveResult.matches,
        historicalStats: {
          winRatePct: historical.winRatePct,
          returnPct: historical.returnPct,
          alphaPct: historical.alphaPct,
          totalTrades: historical.totalTrades,
        },
      });
    }

    const modal = Number(body?.modal);
    const period = Number(body?.period);
    if (!Number.isFinite(modal) || modal <= 0) {
      return NextResponse.json({ error: 'Modal awal harus lebih dari 0' }, { status: 400 });
    }
    if (!VALID_PERIODS.includes(period)) {
      return NextResponse.json({ error: 'Periode tidak valid' }, { status: 400 });
    }

    const cache = await getCache();
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
    logger.error('Backtest gagal', { error });
    return NextResponse.json({ error: 'Server Error' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/api/backtest/__tests__/route.test.ts`
Expected: PASS, all tests in both `describe` blocks green (original 7 + new 6).

- [ ] **Step 5: Run typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/api/backtest/route.ts app/api/backtest/__tests__/route.test.ts
git commit -m "feat: tambah mode live-signal di /api/backtest (saham cocok hari ini + histori)"
```

---

### Task 3: "Sinyal Hari Ini" tab in the Backtest page

**Files:**
- Modify: `app/backtest/page.tsx` (full rewrite — the tab switcher, shared filter state, and conditional result panels touch most of the file)

**Interfaces:**
- Consumes: `POST /api/backtest` with `{ filters, mode: 'live-signal' }` → `{ dataAsOf, matches: { symbol: string; price: number; score: number }[], historicalStats: { winRatePct, returnPct, alphaPct, totalTrades } }` (Task 2's output). `PaywallModal` component props from `@/components/PaywallModal` (`open`, `onClose`, `title`, `body`, `ctaHref`, `ctaLabel`, `secondaryLabel` — already exists, used identically in `app/compare/page.tsx` and other pages for the "please sign up" login-prompt pattern).
- Produces: nothing consumed by later tasks — this is the last task.

This task also closes out `app/backtest/page.tsx` from the still-pending "open access" rollout list (it currently has no 401/login-prompt handling at all) by adding a `showLoginPrompt` + `PaywallModal` pattern to the existing `runBacktest`, consistent with `app/compare/page.tsx`, `app/dashboard/page.tsx`, etc.

- [ ] **Step 1: Replace the full contents of `app/backtest/page.tsx`**

```tsx
'use client';

import React, { useState } from 'react';
import { Target, Activity, Play, Settings2, BarChart2, CheckSquare, Square, Menu } from 'lucide-react';

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Input, Select, Button } from '@/components/ui';
import PaywallModal from '@/components/PaywallModal';

export default function BacktestPage() {
  const [activeTab, setActiveTab] = useState<'backtest' | 'live-signal'>('backtest');
  const [modal, setModal] = useState(100000000);
  const [period, setPeriod] = useState(12);

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

  const [selectedFilters, setSelectedFilters] = useState<string[]>(['EMA 20/50 Cross', 'Volume vs Avg 20D', 'RSI 14']);

  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const [liveSignalLoading, setLiveSignalLoading] = useState(false);
  const [liveSignalResults, setLiveSignalResults] = useState<any>(null);
  const [liveSignalError, setLiveSignalError] = useState<string | null>(null);

  const [showLoginPrompt, setShowLoginPrompt] = useState(false);

  const toggleFilter = (f: string) => {
    if (selectedFilters.includes(f)) {
      setSelectedFilters(selectedFilters.filter(item => item !== f));
    } else {
      setSelectedFilters([...selectedFilters, f]);
    }
  };

  const applyPreset = (preset: string) => {
    if (preset === 'Momentum') {
      setSelectedFilters(['EMA 20/50 Cross', 'Volume vs Avg 20D', 'RSI 14']);
    } else if (preset === 'Accumulation') {
      setSelectedFilters(['Market Flow Index', 'MACD', 'Volume vs Avg 20D']);
    } else if (preset === 'Oversold') {
      setSelectedFilters(['RSI 14', 'Volatility (ATR 14)', 'Support & Resistance']);
    }
  };

  const runBacktest = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters: selectedFilters, modal, period })
      });
      if (res.status === 401) {
        setShowLoginPrompt(true);
        setLoading(false);
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Gagal menjalankan backtest');
        setResults(null);
        setLoading(false);
        return;
      }
      setResults(data);
    } catch (e) {
      console.error(e);
      setError('Gagal menjalankan backtest');
    }
    setLoading(false);
  };

  const runLiveSignal = async () => {
    setLiveSignalLoading(true);
    setLiveSignalError(null);
    try {
      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters: selectedFilters, mode: 'live-signal' })
      });
      if (res.status === 401) {
        setShowLoginPrompt(true);
        setLiveSignalLoading(false);
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setLiveSignalError(data?.error || 'Gagal mengambil sinyal hari ini');
        setLiveSignalResults(null);
        setLiveSignalLoading(false);
        return;
      }
      setLiveSignalResults(data);
    } catch (e) {
      console.error(e);
      setLiveSignalError('Gagal mengambil sinyal hari ini');
    }
    setLiveSignalLoading(false);
  };

  const chartData = results?.equityCurve?.map((eq: number, idx: number) => ({
    month: `M${idx}`,
    Strategy: eq,
    IHSG: results.ihsgCurve[idx]
  })) || [];

  const dataAsOfLabel = results?.dataAsOf
    ? new Date(results.dataAsOf).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  const liveSignalDataAsOfLabel = liveSignalResults?.dataAsOf
    ? new Date(liveSignalResults.dataAsOf).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  return (
    <div className="flex h-screen bg-tv-bg">
      {/* Sidebar removed, handled by layout */}
      <div className="flex-1 flex flex-col min-h-screen overflow-y-auto custom-scrollbar">
        <header className="bg-tv-surface border-b border-tv-border px-6 py-4 sticky top-0 z-20 shadow-2">
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.dispatchEvent(new Event('toggle-sidebar'))}
              className="md:hidden p-2 -ml-2 text-tv-muted hover:text-white rounded-lg hover:bg-white/5"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="p-2 rounded-md bg-tv-blue text-white">
              <Settings2 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-heading font-bold text-xl text-tv-text tracking-tight">Strategy Builder + AI Backtester</h1>
              <p className="text-xs text-tv-muted">Build custom rules and backtest on historical data</p>
            </div>
          </div>
        </header>

        <div className="px-6 pt-6 max-w-[1400px] mx-auto w-full">
          <div className="inline-flex bg-tv-card border border-tv-border rounded-lg p-1 gap-1">
            <button
              onClick={() => setActiveTab('backtest')}
              className={`px-4 py-2 rounded-md text-sm font-bold transition-colors ${activeTab === 'backtest' ? 'bg-tv-purple text-white' : 'text-tv-muted hover:text-tv-text'}`}
            >
              Backtest
            </button>
            <button
              onClick={() => setActiveTab('live-signal')}
              className={`px-4 py-2 rounded-md text-sm font-bold transition-colors ${activeTab === 'live-signal' ? 'bg-tv-purple text-white' : 'text-tv-muted hover:text-tv-text'}`}
            >
              Sinyal Hari Ini
            </button>
          </div>
        </div>

        <div className="p-6 max-w-[1400px] mx-auto w-full grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Builder Panel */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-tv-card border border-tv-border rounded-lg p-5 shadow-1">
              <h3 className="font-heading font-bold text-tv-text flex items-center gap-2 mb-4 border-b border-tv-border pb-3">
                <Target className="w-5 h-5 text-tv-purple" /> Presets
              </h3>
              <div className="flex flex-col gap-2">
                <button onClick={() => applyPreset('Momentum')} className="text-left px-4 py-2 bg-tv-hover hover:bg-tv-borderLight rounded-md text-sm text-tv-text transition-colors">Momentum Breakout</button>
                <button onClick={() => applyPreset('Accumulation')} className="text-left px-4 py-2 bg-tv-hover hover:bg-tv-borderLight rounded-md text-sm text-tv-text transition-colors">Bandar Accumulation</button>
                <button onClick={() => applyPreset('Oversold')} className="text-left px-4 py-2 bg-tv-hover hover:bg-tv-borderLight rounded-md text-sm text-tv-text transition-colors">Oversold Bounce</button>
              </div>
            </div>

            <div className="bg-tv-card border border-tv-border rounded-lg p-5 shadow-1">
              <h3 className="font-heading font-bold text-tv-text flex items-center gap-2 mb-4 border-b border-tv-border pb-3">
                <Settings2 className="w-5 h-5 text-tv-purple" /> Algo Filters
              </h3>
              <div className="space-y-2 mb-6 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                {availableFilters.map(f => {
                  const isSelected = selectedFilters.includes(f);
                  return (
                    <div
                      key={f}
                      onClick={() => toggleFilter(f)}
                      className={`flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors border ${isSelected ? 'bg-tv-purple/10 border-tv-purple/30' : 'bg-tv-bg border-tv-border hover:border-tv-borderLight'}`}
                    >
                      {isSelected ? <CheckSquare className="w-4 h-4 text-tv-purple" /> : <Square className="w-4 h-4 text-tv-muted" />}
                      <span className={`text-sm ${isSelected ? 'text-tv-purple font-bold' : 'text-tv-muted'}`}>{f}</span>
                    </div>
                  )
                })}
              </div>

              <div className="space-y-4 pt-4 border-t border-tv-border">
                {activeTab === 'backtest' && (
                  <>
                    <Input label="Modal Awal (Rp)" type="number" value={modal} onChange={e => setModal(Number(e.target.value))} className="font-number" />
                    <Select label="Periode (Bulan)" value={period} onChange={e => setPeriod(Number(e.target.value))}>
                      <option value={3}>3 Bulan</option>
                      <option value={6}>6 Bulan</option>
                      <option value={12}>12 Bulan</option>
                      <option value={24}>24 Bulan</option>
                    </Select>
                  </>
                )}

                <Button
                  onClick={activeTab === 'backtest' ? runBacktest : runLiveSignal}
                  disabled={(activeTab === 'backtest' ? loading : liveSignalLoading) || selectedFilters.length === 0}
                  loading={activeTab === 'backtest' ? loading : liveSignalLoading}
                  variant="secondary"
                  className="w-full !bg-tv-purple !text-white hover:!bg-tv-purple/90 mt-4"
                >
                  {!(activeTab === 'backtest' ? loading : liveSignalLoading) && <Play className="w-5 h-5" />}
                  {activeTab === 'backtest' ? 'Backtest Sekarang' : 'Cek Saham Cocok Hari Ini'}
                </Button>
              </div>
            </div>
          </div>

          {/* Results Panel */}
          <div className="lg:col-span-2 space-y-6">
            {activeTab === 'backtest' && (
              <>
                {error && (
                  <div className="bg-tv-card border border-tv-red/30 rounded-lg p-4 text-sm text-tv-red">
                    {error}
                  </div>
                )}

                {!results && !loading && !error && (
                  <div className="bg-tv-card border border-tv-border rounded-lg h-full min-h-[500px] flex flex-col items-center justify-center text-tv-muted">
                    <BarChart2 className="w-16 h-16 mb-4 opacity-20" />
                    <p className="text-sm">Pilih filter dan klik Backtest untuk melihat hasil simulasi.</p>
                  </div>
                )}

                {loading && (
                  <div className="bg-tv-card border border-tv-border rounded-lg h-full min-h-[500px] flex flex-col items-center justify-center text-tv-purple">
                    <Activity className="w-16 h-16 mb-4 animate-spin" />
                    <p className="text-sm">Memproses data historis & menjalankan algoritma...</p>
                  </div>
                )}

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
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-tv-card border border-tv-border rounded-lg p-4">
                        <div className="text-xs text-tv-muted mb-1">Return Strategi</div>
                        <div className={`text-xl font-bold font-number ${results.return.includes('+') ? 'text-tv-green' : 'text-tv-red'}`}>{results.return}</div>
                      </div>
                      <div className="bg-tv-card border border-tv-border rounded-lg p-4">
                        <div className="text-xs text-tv-muted mb-1">Alpha vs IHSG ({results.ihsgReturn})</div>
                        <div className={`text-xl font-bold font-number ${results.alpha.includes('+') ? 'text-tv-green' : 'text-tv-red'}`}>{results.alpha}</div>
                      </div>
                      <div className="bg-tv-card border border-tv-border rounded-lg p-4">
                        <div className="text-xs text-tv-muted mb-1">Win Rate ({results.totalTrades} trades)</div>
                        <div className="text-xl font-bold font-number text-tv-text">{results.winRate}</div>
                      </div>
                      <div className="bg-tv-card border border-tv-border rounded-lg p-4">
                        <div className="text-xs text-tv-muted mb-1">Max Drawdown</div>
                        <div className="text-xl font-bold font-number text-tv-red">{results.maxDD}</div>
                      </div>
                    </div>

                    {/* Chart */}
                    <div className="bg-tv-card border border-tv-border rounded-lg p-5 shadow-1">
                      <h3 className="font-heading text-sm font-bold text-tv-text mb-4">Equity Curve</h3>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                            <defs>
                              <linearGradient id="colorStrategy" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                              </linearGradient>
                              <linearGradient id="colorIHSG" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#8B94B6" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#8B94B6" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <XAxis dataKey="month" stroke="#2C3A5A" fontSize={10} tickLine={false} />
                            <YAxis stroke="#2C3A5A" fontSize={10} tickLine={false} domain={['auto', 'auto']} tickFormatter={(val) => `Rp${(val/1000000).toFixed(0)}M`} />
                            <CartesianGrid strokeDasharray="3 3" stroke="#2C3A5A" vertical={false} />
                            <Tooltip
                              contentStyle={{ backgroundColor: '#152238', borderColor: '#2C3A5A', fontSize: '12px' }}
                              itemStyle={{ color: '#F3F4F6' }}
                            />
                            <Area type="monotone" dataKey="Strategy" stroke="#10B981" strokeWidth={2} fillOpacity={1} fill="url(#colorStrategy)" />
                            <Area type="monotone" dataKey="IHSG" stroke="#8B94B6" strokeWidth={2} fillOpacity={1} fill="url(#colorIHSG)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex items-center justify-center gap-4 mt-4 text-xs">
                        <div className="flex items-center gap-2"><div className="w-3 h-3 bg-tv-green rounded-sm"></div> Strategy</div>
                        <div className="flex items-center gap-2"><div className="w-3 h-3 bg-tv-muted rounded-sm"></div> IHSG</div>
                      </div>
                    </div>

                    {/* Trades */}
                    <div className="bg-tv-card border border-tv-border rounded-lg shadow-1 overflow-hidden">
                      <div className="p-4 border-b border-tv-border bg-tv-bg/40">
                        <h3 className="font-heading text-sm font-bold text-tv-text">
                          Riwayat Trade {results.totalTrades > 30 ? `(30 terbaru dari ${results.totalTrades})` : ''}
                        </h3>
                      </div>
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-tv-card border-b border-tv-border text-xs text-tv-muted uppercase font-semibold tracking-wide">
                            <th className="py-3 px-4">Date</th>
                            <th className="py-3 px-4">Symbol</th>
                            <th className="py-3 px-4">Buy Px</th>
                            <th className="py-3 px-4 text-right">PnL</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-tv-border text-sm">
                          {results.trades.map((t: any, idx: number) => (
                            <tr key={idx} className="hover:bg-tv-hover/30">
                              <td className="py-3 px-4 text-tv-muted">{t.date}</td>
                              <td className="py-3 px-4 text-tv-text font-bold font-number">{t.symbol}</td>
                              <td className="py-3 px-4 text-tv-muted font-number">Rp {t.buy}</td>
                              <td className={`py-3 px-4 text-right font-bold font-number ${t.pnl.includes('+') ? 'text-tv-green' : 'text-tv-red'}`}>
                                {t.pnl}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </>
            )}

            {activeTab === 'live-signal' && (
              <>
                {liveSignalError && (
                  <div className="bg-tv-card border border-tv-red/30 rounded-lg p-4 text-sm text-tv-red">
                    {liveSignalError}
                  </div>
                )}

                {!liveSignalResults && !liveSignalLoading && !liveSignalError && (
                  <div className="bg-tv-card border border-tv-border rounded-lg h-full min-h-[500px] flex flex-col items-center justify-center text-tv-muted">
                    <BarChart2 className="w-16 h-16 mb-4 opacity-20" />
                    <p className="text-sm">Pilih filter dan klik Cek Saham Cocok Hari Ini untuk melihat saham yang cocok sekarang.</p>
                  </div>
                )}

                {liveSignalLoading && (
                  <div className="bg-tv-card border border-tv-border rounded-lg h-full min-h-[500px] flex flex-col items-center justify-center text-tv-purple">
                    <Activity className="w-16 h-16 mb-4 animate-spin" />
                    <p className="text-sm">Mencocokkan filter ke data harga hari ini...</p>
                  </div>
                )}

                {liveSignalResults && !liveSignalLoading && (
                  <>
                    {liveSignalDataAsOfLabel && (
                      <p className="text-[11px] text-tv-muted">Data per {liveSignalDataAsOfLabel} (diperbarui otomatis tiap hari, bukan real-time).</p>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-tv-card border border-tv-border rounded-lg p-4">
                        <div className="text-xs text-tv-muted mb-1">Win Rate Historis (12 Bulan)</div>
                        <div className="text-xl font-bold font-number text-tv-text">{liveSignalResults.historicalStats.winRatePct.toFixed(0)}%</div>
                      </div>
                      <div className="bg-tv-card border border-tv-border rounded-lg p-4">
                        <div className="text-xs text-tv-muted mb-1">Return Historis (12 Bulan)</div>
                        <div className={`text-xl font-bold font-number ${liveSignalResults.historicalStats.returnPct >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
                          {liveSignalResults.historicalStats.returnPct >= 0 ? '+' : ''}{liveSignalResults.historicalStats.returnPct.toFixed(2)}%
                        </div>
                      </div>
                      <div className="bg-tv-card border border-tv-border rounded-lg p-4">
                        <div className="text-xs text-tv-muted mb-1">Alpha vs IHSG ({liveSignalResults.historicalStats.totalTrades} trades historis)</div>
                        <div className={`text-xl font-bold font-number ${liveSignalResults.historicalStats.alphaPct >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
                          {liveSignalResults.historicalStats.alphaPct >= 0 ? '+' : ''}{liveSignalResults.historicalStats.alphaPct.toFixed(2)}%
                        </div>
                      </div>
                    </div>

                    <div className="bg-tv-card border border-tv-border rounded-lg shadow-1 overflow-hidden">
                      <div className="p-4 border-b border-tv-border bg-tv-bg/40">
                        <h3 className="font-heading text-sm font-bold text-tv-text">
                          Saham Cocok Filter Ini Hari Ini ({liveSignalResults.matches.length})
                        </h3>
                      </div>
                      {liveSignalResults.matches.length === 0 ? (
                        <div className="p-6 text-sm text-tv-muted text-center">
                          Tidak ada saham yang cocok kombinasi filter ini hari ini.
                        </div>
                      ) : (
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-tv-card border-b border-tv-border text-xs text-tv-muted uppercase font-semibold tracking-wide">
                              <th className="py-3 px-4">Symbol</th>
                              <th className="py-3 px-4">Harga</th>
                              <th className="py-3 px-4 text-right">Skor Indikator</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-tv-border text-sm">
                            {liveSignalResults.matches.map((m: any) => (
                              <tr key={m.symbol} className="hover:bg-tv-hover/30">
                                <td className="py-3 px-4 text-tv-text font-bold font-number">{m.symbol}</td>
                                <td className="py-3 px-4 text-tv-muted font-number">Rp {m.price}</td>
                                <td className="py-3 px-4 text-right font-bold font-number text-tv-text">{m.score}/9</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      <PaywallModal
        open={showLoginPrompt}
        onClose={() => setShowLoginPrompt(false)}
        title="Daftar Dulu untuk Lihat Hasil"
        body="Backtest & Sinyal Hari Ini butuh akun (gratis) - daftar sekarang, dapat trial 7 hari akses penuh sebelum diminta upgrade."
        ctaHref="/signup"
        ctaLabel="Daftar Gratis"
        secondaryLabel="Nanti"
      />
      <style dangerouslySetInnerHTML={{__html:`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #0F141D; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #2C3A5A; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #3A4B75; }
      `}} />
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Run the full test suite (regression check)**

Run: `npx vitest run`
Expected: all tests pass, count is >= the pre-existing baseline plus the 6 new `live-signal.service.test.ts` tests and 6 new `route.test.ts` tests.

- [ ] **Step 4: Manual browser verification**

Start the dev server if not already running (`npm run dev`), then in a browser:
1. Go to `/backtest` while logged out — page loads (open-access), click "Sinyal Hari Ini" tab, select at least one filter, click "Cek Saham Cocok Hari Ini" — confirm the `PaywallModal` "Daftar Dulu untuk Lihat Hasil" appears instead of a broken/blank result.
2. Log in, go to `/backtest`, "Backtest" tab still works exactly as before (existing behavior unchanged).
3. Switch to "Sinyal Hari Ini" tab — Modal/Periode fields disappear, button label changes to "Cek Saham Cocok Hari Ini".
4. Click it — confirm: a "Data per [tanggal]" label appears, 3 historical stat cards render (Win Rate/Return/Alpha, 12 Bulan), and a table of matching stocks with "X/9" scores renders sorted highest-first (or the explicit empty-state message if the current default filter combination matches nothing).
5. Switch back to "Backtest" tab — confirm previous backtest results are still shown (state preserved, not cleared by switching tabs).

- [ ] **Step 5: Commit**

```bash
git add app/backtest/page.tsx
git commit -m "feat: tambah tab Sinyal Hari Ini di halaman Backtest"
```
