# AI Pick Satu Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Melebur 8 tab halaman AI Pick jadi satu daftar 10 saham teratas yang diperingkat dengan skor komposit 8 komponen plus bonus sinyal langka.

**Architecture:** Dua cron menyiapkan data di Redis (skor per saham tiap 5 menit, snapshot fundamental tiap 24 jam). Endpoint `/api/ai-pick` murni membaca cache, melebur dengan cache breakout yang sudah ada, memberi peringkat, lalu memotong di ambang skor 60. Halaman menampilkan satu tabel tanpa tab sama sekali.

**Tech Stack:** Next.js 14 App Router, TypeScript, Vitest, Upstash Redis, QStash, yahoo-finance2.

## Global Constraints

- Semua respons teks ke pengguna berbahasa Indonesia.
- `/api/ai-pick` **tidak boleh** memanggil `scanBreakouts()`, `scanCrossSignals()`, atau fetch jaringan apa pun. Hanya `cacheGet`.
- Backtest tidak disentuh: `modules/backtest/**` dan `app/backtest/**` tidak boleh berubah.
- Tidak membuat skor baru. Pakai `calculateScore()` yang sudah ada di `modules/technical/service/scoring.service.ts`.
- Ambang potong `total_score >= 60` mengikuti `getKategori()` yang sudah ada, bukan konstanta baru.
- Bonus sinyal: breakout +15, akumulasi terkonfirmasi +10, golden cross +10, RSI < 30 +5.
- Batas tampil 10 saham.
- Test ditulis lebih dulu dan harus dilihat gagal sebelum implementasi.
- Perintah test: `npx vitest run <path>`. Typecheck: `npx tsc --noEmit`.

---

## File Structure

| File | Tanggung jawab |
|---|---|
| `modules/market/constants/ai-pick-universe.ts` | **Create.** Daftar ticker universe bersama. |
| `modules/technical/service/scoring.service.ts` | **Modify.** Export tipe input yang sudah ada agar bisa dipakai lintas modul. |
| `modules/recommendation/service/ai-pick.service.ts` | **Create.** Logika peringkat murni tanpa I/O. |
| `modules/recommendation/service/__tests__/ai-pick.service.test.ts` | **Create.** Test logika peringkat. |
| `modules/recommendation/service/ai-pick-scan.service.ts` | **Create.** Hitung skor per saham dari data pasar (punya I/O). |
| `shared/cache/ai-pick-cache.ts` | **Create.** Baca/tulis dua cache baru. |
| `app/api/cron/fundamental-snapshot/route.ts` | **Create.** Cron harian data fundamental. |
| `app/api/cron/ai-pick-scan/route.ts` | **Create.** Cron 5 menit skor per saham. |
| `app/api/ai-pick/route.ts` | **Create.** Endpoint pembaca cache. |
| `app/api/breakout-radar/route.ts` | **Modify.** Hapus fallback live-scan. |
| `app/api/daily-picks/route.ts` | **Modify.** Hapus fallback live-scan. |
| `modules/recommendation/service/breakout.service.ts` | **Modify.** `WATCHLIST` 15 → `AI_PICK_UNIVERSE`. |
| `app/breakout-radar/page.tsx` | **Modify.** Buang 8 tab, ganti satu tabel. |

Urutan tugas mengikuti arah ketergantungan: tipe dan konstanta dulu, lalu logika murni, lalu I/O, lalu route, terakhir UI.

---

### Task 1: Universe bersama

**Files:**
- Create: `modules/market/constants/ai-pick-universe.ts`
- Modify: `modules/recommendation/service/breakout.service.ts:2-6`

**Interfaces:**
- Produces: `AI_PICK_UNIVERSE: string[]` — ticker format Yahoo (`'BBCA.JK'`).

- [ ] **Step 1: Buat file konstanta**

Jangan menyalin 109 ticker dengan tangan — jalankan perintah ini dari akar repo. Ia membaca daftar ticker dari `BACKTEST_UNIVERSE` yang sudah tersaring tiga floor kualitas, lalu menulis file baru berisi header penjelasan dan daftar yang sama:

```bash
node -e "
const fs=require('fs');
const src=fs.readFileSync('modules/backtest/constants/backtest-universe.ts','utf8');
const tickers=[...new Set(src.match(/'[A-Z0-9]+\.JK'/g))];
const lines=[];
for(let i=0;i<tickers.length;i+=9) lines.push('  '+tickers.slice(i,i+9).join(', ')+',');
const header=[
  '// Universe bersama AI Pick - dipakai breakout-scan DAN ai-pick-scan supaya setiap saham',
  '// dinilai dengan jaring yang sama. Sebelumnya breakout memindai 15 ticker hardcoded',
  '// sementara kategori lain memindai 250, sehingga angka antar tab tidak sebanding dan',
  '// hanya 15 saham itu yang pernah bisa mendapat bonus breakout.',
  '//',
  '// Isi sama dengan BACKTEST_UNIVERSE (dihasilkan scripts/backtest-universe-refresh.mjs):',
  '// harga rata-rata 3 bulan >= Rp 200, nilai transaksi >= Rp 1 M/hari, volatilitas 12 bulan',
  '// <= 120%/tahun. Sengaja DISALIN, bukan di-import dari modules/backtest, supaya perubahan',
  '// universe backtest tidak diam-diam mengubah perilaku AI Pick.',
  'export const AI_PICK_UNIVERSE: string[] = [',
].join('\n');
fs.mkdirSync('modules/market/constants',{recursive:true});
fs.writeFileSync('modules/market/constants/ai-pick-universe.ts', header+'\n'+lines.join('\n')+'\n];\n');
console.log('ditulis', tickers.length, 'ticker');
"
```

Expected: `ditulis 109 ticker`

- [ ] **Step 2: Ganti WATCHLIST di breakout.service.ts**

Ganti baris 2-6:

```typescript
import { AI_PICK_UNIVERSE } from '../../market/constants/ai-pick-universe';

// Dulu 15 ticker hardcoded di sini - lihat komentar di ai-pick-universe.ts kenapa diganti.
const WATCHLIST = AI_PICK_UNIVERSE;
```

- [ ] **Step 3: Verifikasi typecheck**

Run: `npx tsc --noEmit`
Expected: tanpa error.

- [ ] **Step 4: Verifikasi test lama masih hijau**

Run: `npx vitest run`
Expected: seluruh test PASS (153+ test).

- [ ] **Step 5: Commit**

```bash
git add modules/market/constants/ai-pick-universe.ts modules/recommendation/service/breakout.service.ts
git commit -m "feat(ai-pick): satukan universe breakout scan ke 109 emiten tersaring"
```

---

### Task 2: Export tipe scoring

**Files:**
- Modify: `modules/technical/service/scoring.service.ts:15-40`

**Interfaces:**
- Produces: `TechnicalInput`, `FundamentalInput`, `FlowInput`, `ScoringResult` — sekarang bisa di-import modul lain.

- [ ] **Step 1: Tambahkan kata kunci export**

Empat interface di `scoring.service.ts` saat ini tidak di-export. Tambahkan `export` pada masing-masing — jangan ubah isinya:

```typescript
export interface TechnicalInput {
  currentPrice: number;
  ma20: number;
  ma50: number;
  ma200: number;
  rsi: number;
  macdHist: number;
  macdLine: number;
  macdSignal: number;
  volToday: number;
  volAvg20: number;
}

export interface FundamentalInput {
  per: number | null;
  pbv: number | null;
  roe: number | null;
  der: number | null;
  currentRatio: number | null;
  revenueGrowth: number | null;
}

export interface FlowInput {
  foreignFlow: string;
  consecutiveBuyDays: number;
  consecutiveSellDays: number;
  volRatio: number;
}

export interface ScoringResult {
  simbol: string;
  harga: number;
  technical_score: number;
  fundamental_score: number;
  flow_score: number;
  total_score: number;
  kategori: 'STRONG BUY' | 'BUY' | 'HOLD' | 'SELL';
  detail: {
    ma_trend: number;
    rsi_macd: number;
    volume: number;
    valuasi: number;
    profitabilitas: number;
    kesehatan: number;
    asing: number;
    bandar: number;
  };
  alasan_3_poin: string[];
  risk: string;
}
```

- [ ] **Step 2: Tambahkan ke barrel modules/technical**

Buka `modules/technical/index.ts` dan tambahkan baris export tipe di samping export yang sudah ada:

```typescript
export { calculateScore, type TechnicalInput, type FundamentalInput, type FlowInput, type ScoringResult } from './service/scoring.service';
```

Kalau `calculateScore` sudah di-export di sana, cukup tambahkan bagian `type` saja tanpa menduplikasi nama.

- [ ] **Step 3: Verifikasi typecheck**

Run: `npx tsc --noEmit`
Expected: tanpa error.

- [ ] **Step 4: Commit**

```bash
git add modules/technical/service/scoring.service.ts modules/technical/index.ts
git commit -m "refactor(technical): export tipe input scoring agar bisa dipakai lintas modul"
```

---

### Task 3: Logika peringkat (murni, tanpa I/O)

**Files:**
- Create: `modules/recommendation/service/ai-pick.service.ts`
- Test: `modules/recommendation/service/__tests__/ai-pick.service.test.ts`

**Interfaces:**
- Consumes: `AI_PICK_UNIVERSE` (Task 1).
- Produces:
  - `type ScoredStock = { symbol: string; price: number; changePct: number; totalScore: number; rsi: number; accumulationConfirmed: boolean }`
  - `type BreakoutInfo = { breakoutSymbols: string[]; goldenCrossSymbols: string[]; deadCrossSymbols: string[] }`
  - `type PickBonus = { label: string; points: number }`
  - `type AiPickItem = { symbol: string; price: number; changePct: number; baseScore: number; bonuses: PickBonus[]; finalScore: number; flagged: boolean; flagReason: string | null }`
  - `rankAiPicks(scored: ScoredStock[], breakout: BreakoutInfo, bearishSymbols: string[]): AiPickItem[]`

- [ ] **Step 1: Tulis test yang gagal**

```typescript
// modules/recommendation/service/__tests__/ai-pick.service.test.ts
import { describe, it, expect } from 'vitest';
import { rankAiPicks, type ScoredStock, type BreakoutInfo } from '../ai-pick.service';

function stock(symbol: string, totalScore: number, extra: Partial<ScoredStock> = {}): ScoredStock {
  return { symbol, price: 1000, changePct: 0, totalScore, rsi: 50, accumulationConfirmed: false, ...extra };
}

const noSignals: BreakoutInfo = { breakoutSymbols: [], goldenCrossSymbols: [], deadCrossSymbols: [] };

describe('rankAiPicks', () => {
  it('bonus breakout mengangkat saham di atas skor dasar yang lebih tinggi', () => {
    const scored = [stock('AAAA.JK', 75), stock('BBBB.JK', 65)];
    const breakout: BreakoutInfo = { breakoutSymbols: ['BBBB.JK'], goldenCrossSymbols: [], deadCrossSymbols: [] };

    const result = rankAiPicks(scored, breakout, []);

    expect(result[0].symbol).toBe('BBBB.JK');
    expect(result[0].finalScore).toBe(80); // 65 + 15
    expect(result[1].finalScore).toBe(75);
  });

  it('skor dasar sama diurutkan menurut simbol, bukan urutan array masukan', () => {
    const scored = [stock('ZZZZ.JK', 70), stock('AAAA.JK', 70), stock('MMMM.JK', 70)];

    const result = rankAiPicks(scored, noSignals, []);

    expect(result.map((r) => r.symbol)).toEqual(['AAAA.JK', 'MMMM.JK', 'ZZZZ.JK']);
  });

  it('saham bertanda merah tetap muncul di daftar, tidak disaring keluar', () => {
    const scored = [stock('AAAA.JK', 80)];

    const result = rankAiPicks(scored, noSignals, ['AAAA.JK']);

    expect(result).toHaveLength(1);
    expect(result[0].flagged).toBe(true);
    expect(result[0].flagReason).toBe('teknikal bearish');
  });

  it('skor akhir di bawah 60 dibuang meski daftar jadi kurang dari 10', () => {
    const scored = [stock('AAAA.JK', 80), stock('BBBB.JK', 59), stock('CCCC.JK', 45)];

    const result = rankAiPicks(scored, noSignals, []);

    expect(result.map((r) => r.symbol)).toEqual(['AAAA.JK']);
  });

  it('semua di bawah ambang menghasilkan daftar kosong, bukan yang terbaik dari yang buruk', () => {
    const scored = [stock('AAAA.JK', 55), stock('BBBB.JK', 50)];

    const result = rankAiPicks(scored, noSignals, []);

    expect(result).toEqual([]);
  });

  it('daftar dipotong 10 teratas', () => {
    const scored = Array.from({ length: 15 }, (_, i) => stock(`S${String(i).padStart(2, '0')}.JK`, 100 - i));

    const result = rankAiPicks(scored, noSignals, []);

    expect(result).toHaveLength(10);
    expect(result[0].symbol).toBe('S00.JK');
  });

  it('bonus ditumpuk dan dirinci supaya asal skor bisa ditelusuri', () => {
    const scored = [stock('AAAA.JK', 60, { rsi: 25, accumulationConfirmed: true })];
    const breakout: BreakoutInfo = { breakoutSymbols: ['AAAA.JK'], goldenCrossSymbols: ['AAAA.JK'], deadCrossSymbols: [] };

    const result = rankAiPicks(scored, breakout, []);

    expect(result[0].finalScore).toBe(100); // 60 +15 +10 +10 +5
    expect(result[0].bonuses).toEqual([
      { label: 'breakout', points: 15 },
      { label: 'akumulasi', points: 10 },
      { label: 'golden cross', points: 10 },
      { label: 'oversold', points: 5 },
    ]);
  });

  it('dead cross menandai merah tanpa mengurangi skor', () => {
    const scored = [stock('AAAA.JK', 70)];
    const breakout: BreakoutInfo = { breakoutSymbols: [], goldenCrossSymbols: [], deadCrossSymbols: ['AAAA.JK'] };

    const result = rankAiPicks(scored, breakout, []);

    expect(result[0].finalScore).toBe(70);
    expect(result[0].flagged).toBe(true);
    expect(result[0].flagReason).toBe('dead cross');
  });

  it('cache breakout kosong menghasilkan peringkat tanpa bonus, bukan error', () => {
    const scored = [stock('AAAA.JK', 80), stock('BBBB.JK', 70)];

    const result = rankAiPicks(scored, { breakoutSymbols: [], goldenCrossSymbols: [], deadCrossSymbols: [] }, []);

    expect(result).toHaveLength(2);
    expect(result[0].bonuses).toEqual([]);
    expect(result[0].finalScore).toBe(80);
  });

  it('simbol yang hanya ada di cache breakout tidak membuat hasil gagal', () => {
    const scored = [stock('AAAA.JK', 80)];
    const breakout: BreakoutInfo = {
      breakoutSymbols: ['TIDAKADA.JK'],
      goldenCrossSymbols: ['JUGATIDAK.JK'],
      deadCrossSymbols: [],
    };

    const result = rankAiPicks(scored, breakout, []);

    expect(result.map((r) => r.symbol)).toEqual(['AAAA.JK']);
    expect(result[0].bonuses).toEqual([]);
  });
});
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run: `npx vitest run modules/recommendation/service/__tests__/ai-pick.service.test.ts`
Expected: FAIL — `Failed to resolve import "../ai-pick.service"`.

- [ ] **Step 3: Tulis implementasi minimal**

```typescript
// modules/recommendation/service/ai-pick.service.ts

// Logika peringkat AI Pick - SENGAJA tanpa I/O apa pun (tidak menyentuh Redis maupun
// jaringan) supaya bisa diuji langsung tanpa mock. Pemanggilnya yang menyediakan data:
// app/api/ai-pick/route.ts membacanya dari cache.

/** Ambang kategori BUY di getKategori() (modules/technical/service/scoring.service.ts:273).
 * Dipakai ulang, bukan angka baru: daftar "hari ini beli apa" tidak boleh memuat saham
 * yang sistem sendiri tidak kategorikan layak beli. */
const MIN_SCORE = 60;
const MAX_ITEMS = 10;

/** Bobot mencerminkan kelangkaan sinyal: makin jarang muncul, makin besar artinya.
 * Breakout ~6-7 saham/hari dari ratusan; RSI < 30 kondisi umum yang bisa bertahan
 * berminggu-minggu. */
const BONUS_BREAKOUT = 15;
const BONUS_ACCUMULATION = 10;
const BONUS_GOLDEN_CROSS = 10;
const BONUS_OVERSOLD = 5;
const RSI_OVERSOLD = 30;

export type ScoredStock = {
  symbol: string;
  price: number;
  changePct: number;
  totalScore: number;
  rsi: number;
  accumulationConfirmed: boolean;
};

export type BreakoutInfo = {
  breakoutSymbols: string[];
  goldenCrossSymbols: string[];
  deadCrossSymbols: string[];
};

export type PickBonus = { label: string; points: number };

export type AiPickItem = {
  symbol: string;
  price: number;
  changePct: number;
  baseScore: number;
  bonuses: PickBonus[];
  finalScore: number;
  flagged: boolean;
  flagReason: string | null;
};

export function rankAiPicks(
  scored: ScoredStock[],
  breakout: BreakoutInfo,
  bearishSymbols: string[]
): AiPickItem[] {
  const items: AiPickItem[] = scored.map((s) => {
    const bonuses: PickBonus[] = [];
    if (breakout.breakoutSymbols.includes(s.symbol)) bonuses.push({ label: 'breakout', points: BONUS_BREAKOUT });
    if (s.accumulationConfirmed) bonuses.push({ label: 'akumulasi', points: BONUS_ACCUMULATION });
    if (breakout.goldenCrossSymbols.includes(s.symbol)) bonuses.push({ label: 'golden cross', points: BONUS_GOLDEN_CROSS });
    if (s.rsi < RSI_OVERSOLD) bonuses.push({ label: 'oversold', points: BONUS_OVERSOLD });

    // Penanda merah TIDAK mengurangi skor - tujuannya membuat kontradiksi terlihat
    // (saham bisa oversold sekaligus bearish), bukan menghukumnya dua kali.
    const deadCross = breakout.deadCrossSymbols.includes(s.symbol);
    const bearish = bearishSymbols.includes(s.symbol);
    const flagReason = deadCross ? 'dead cross' : bearish ? 'teknikal bearish' : null;

    return {
      symbol: s.symbol,
      price: s.price,
      changePct: s.changePct,
      baseScore: s.totalScore,
      bonuses,
      finalScore: s.totalScore + bonuses.reduce((sum, b) => sum + b.points, 0),
      flagged: flagReason !== null,
      flagReason,
    };
  });

  return items
    .filter((i) => i.finalScore >= MIN_SCORE)
    // Tie-break simbol, BUKAN urutan array masukan - pelajaran dari bug seleksi
    // alfabetis di simulate.service.ts: hasil tidak boleh bergantung urutan konstanta.
    .sort((a, b) => (b.finalScore !== a.finalScore ? b.finalScore - a.finalScore : a.symbol.localeCompare(b.symbol)))
    .slice(0, MAX_ITEMS);
}
```

- [ ] **Step 4: Jalankan test untuk memastikan lulus**

Run: `npx vitest run modules/recommendation/service/__tests__/ai-pick.service.test.ts`
Expected: 10 test PASS.

- [ ] **Step 5: Verifikasi typecheck**

Run: `npx tsc --noEmit`
Expected: tanpa error.

- [ ] **Step 6: Commit**

```bash
git add modules/recommendation/service/ai-pick.service.ts modules/recommendation/service/__tests__/ai-pick.service.test.ts
git commit -m "feat(ai-pick): logika peringkat skor dasar + bonus sinyal langka"
```

---

### Task 4: Helper cache

**Files:**
- Create: `shared/cache/ai-pick-cache.ts`

**Interfaces:**
- Consumes: `cacheGet`, `cacheSet` dari `shared/cache/redis-cache`; `ScoredStock` (Task 3).
- Produces:
  - `type FundamentalSnapshot = Record<string, FundamentalInput>`
  - `type AiPickScores = { computedAt: string; scores: ScoredStock[]; bearishSymbols: string[] }`
  - `readFundamentalSnapshot(): Promise<FundamentalSnapshot | null>`
  - `writeFundamentalSnapshot(snap: FundamentalSnapshot): Promise<void>`
  - `readAiPickScores(): Promise<AiPickScores | null>`
  - `writeAiPickScores(data: AiPickScores): Promise<void>`

- [ ] **Step 1: Tulis implementasi**

```typescript
// shared/cache/ai-pick-cache.ts
import { cacheGet, cacheSet } from './redis-cache';
import type { FundamentalInput } from '../../modules/technical';
import type { ScoredStock } from '../../modules/recommendation/service/ai-pick.service';

// TTL fundamental 24 jam, terpisah dari skor yang 5 menit: PER/PBV/ROE/DER berubah per
// kuartal mengikuti laporan keuangan. Menyegarkannya tiap 5 menit hanya membakar ~109
// request quoteSummary tanpa mengubah angka apa pun.
const FUNDAMENTAL_KEY = 'sahamlens:cache:computed:fundamental-snapshot';
const FUNDAMENTAL_TTL_SEC = 24 * 60 * 60;

const SCORES_KEY = 'sahamlens:cache:computed:ai-pick-scores';
const SCORES_TTL_SEC = 15 * 60; // 3x interval cron - masih terpakai kalau satu siklus gagal

export type FundamentalSnapshot = Record<string, FundamentalInput>;

export type AiPickScores = {
  computedAt: string;
  scores: ScoredStock[];
  /** Saham dengan technicalSignal BEARISH - dipakai menandai baris merah, bukan menyaring. */
  bearishSymbols: string[];
};

export async function readFundamentalSnapshot(): Promise<FundamentalSnapshot | null> {
  return cacheGet<FundamentalSnapshot>(FUNDAMENTAL_KEY);
}

export async function writeFundamentalSnapshot(snap: FundamentalSnapshot): Promise<void> {
  await cacheSet(FUNDAMENTAL_KEY, snap, FUNDAMENTAL_TTL_SEC);
}

export async function readAiPickScores(): Promise<AiPickScores | null> {
  return cacheGet<AiPickScores>(SCORES_KEY);
}

export async function writeAiPickScores(data: AiPickScores): Promise<void> {
  await cacheSet(SCORES_KEY, data, SCORES_TTL_SEC);
}
```

- [ ] **Step 2: Verifikasi typecheck**

Run: `npx tsc --noEmit`
Expected: tanpa error.

- [ ] **Step 3: Commit**

```bash
git add shared/cache/ai-pick-cache.ts
git commit -m "feat(ai-pick): helper cache skor dan snapshot fundamental"
```

---

### Task 5: Cron snapshot fundamental

**Files:**
- Create: `app/api/cron/fundamental-snapshot/route.ts`

**Interfaces:**
- Consumes: `AI_PICK_UNIVERSE` (Task 1), `writeFundamentalSnapshot` (Task 4).
- Produces: isi cache `fundamental-snapshot`.

- [ ] **Step 1: Tulis route**

Ikuti pola `app/api/cron/breakout-scan/route.ts` — verifikasi signature QStash, bungkus `withJobRunLog`.

```typescript
// app/api/cron/fundamental-snapshot/route.ts
import { NextRequest, NextResponse } from 'next/server';
import yahooFinance from 'yahoo-finance2';
import { verifyQStashSignature } from '@/shared/queue/qstash-signature';
import { withJobRunLog } from '@/shared/scheduler/job-run-log.repository';
import { logger } from '@/shared/logger/logger';
import { AI_PICK_UNIVERSE } from '@/modules/market/constants/ai-pick-universe';
import { writeFundamentalSnapshot, type FundamentalSnapshot } from '@/shared/cache/ai-pick-cache';

export const maxDuration = 300;

// Dijalankan HARIAN, bukan tiap 5 menit - lihat alasan TTL di shared/cache/ai-pick-cache.ts.
// Satu saham gagal tidak menggagalkan seluruh job (pola sama dengan precompute backtest):
// saham itu masuk snapshot dengan nilai null, dan calculateScore() sudah menangani null
// dengan memberi skor 0 + alasan "DATA TIDAK LENGKAP".
const BATCH_SIZE = 15;

async function fetchOne(ticker: string) {
  try {
    const qs = await yahooFinance.quoteSummary(ticker, {
      modules: ['summaryDetail', 'defaultKeyStatistics', 'financialData'],
    });
    return {
      per: qs?.summaryDetail?.trailingPE || qs?.summaryDetail?.forwardPE || null,
      pbv: qs?.defaultKeyStatistics?.priceToBook || null,
      roe: qs?.financialData?.returnOnEquity != null ? qs.financialData.returnOnEquity * 100 : null,
      der: qs?.financialData?.debtToEquity != null ? qs.financialData.debtToEquity / 100 : null,
      currentRatio: qs?.financialData?.currentRatio || null,
      revenueGrowth: qs?.financialData?.revenueGrowth != null ? qs.financialData.revenueGrowth * 100 : null,
    };
  } catch {
    logger.warn('Snapshot fundamental: gagal fetch', { ticker });
    return { per: null, pbv: null, roe: null, der: null, currentRatio: null, revenueGrowth: null };
  }
}

export async function POST(req: NextRequest) {
  const signature = req.headers.get('Upstash-Signature');
  const rawBody = await req.text();

  if (!(await verifyQStashSignature(signature, rawBody))) {
    logger.warn('Menolak request /api/cron/fundamental-snapshot - signature QStash tidak valid');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await withJobRunLog('fundamental-snapshot', async () => {
      const snapshot: FundamentalSnapshot = {};
      for (let i = 0; i < AI_PICK_UNIVERSE.length; i += BATCH_SIZE) {
        const batch = AI_PICK_UNIVERSE.slice(i, i + BATCH_SIZE);
        const values = await Promise.all(batch.map(fetchOne));
        batch.forEach((ticker, idx) => { snapshot[ticker] = values[idx]; });
      }
      await writeFundamentalSnapshot(snapshot);
      return { tickers: Object.keys(snapshot).length };
    });
    return NextResponse.json({ success: true, result });
  } catch (err) {
    logger.error('Job fundamental-snapshot gagal', { err });
    return NextResponse.json({ error: 'Job gagal' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verifikasi typecheck**

Run: `npx tsc --noEmit`
Expected: tanpa error.

- [ ] **Step 3: Commit**

```bash
git add app/api/cron/fundamental-snapshot/route.ts
git commit -m "feat(ai-pick): cron harian snapshot data fundamental"
```

---

### Task 6: Service hitung skor per saham

**Files:**
- Create: `modules/recommendation/service/ai-pick-scan.service.ts`

**Interfaces:**
- Consumes: `AI_PICK_UNIVERSE` (Task 1), `calculateScore` + tipe (Task 2), `ScoredStock` (Task 3), `readFundamentalSnapshot` (Task 4), `computeDailyNetFlow`/`computeAccumulationStreak`/`analyzeAccumulationSignal` dari `modules/market`, `fetchYahooHistory` dari `modules/technical`.
- Produces:
  - `resolveFundamental(snapshot: FundamentalSnapshot | null, ticker: string): FundamentalInput`
  - `scanAiPickScores(): Promise<{ scores: ScoredStock[]; bearishSymbols: string[] }>`

- [ ] **Step 1: Tulis test yang gagal untuk resolveFundamental**

Bagian pemilihan data fundamental dipisah jadi fungsi murni supaya bisa diuji tanpa jaringan. Ini menutup kasus "snapshot fundamental kosong" di spec.

```typescript
// modules/recommendation/service/__tests__/ai-pick-scan.service.test.ts
import { describe, it, expect } from 'vitest';
import { resolveFundamental } from '../ai-pick-scan.service';

describe('resolveFundamental', () => {
  it('memakai data snapshot kalau tickernya ada', () => {
    const snapshot = {
      'BBCA.JK': { per: 20, pbv: 4, roe: 18, der: 0.3, currentRatio: 1.5, revenueGrowth: 12 },
    };

    expect(resolveFundamental(snapshot, 'BBCA.JK').per).toBe(20);
  });

  it('snapshot null menghasilkan semua field null, bukan error', () => {
    const result = resolveFundamental(null, 'BBCA.JK');

    expect(result).toEqual({
      per: null, pbv: null, roe: null, der: null, currentRatio: null, revenueGrowth: null,
    });
  });

  it('ticker yang tidak ada di snapshot menghasilkan semua field null', () => {
    const snapshot = {
      'BBCA.JK': { per: 20, pbv: 4, roe: 18, der: 0.3, currentRatio: 1.5, revenueGrowth: 12 },
    };

    expect(resolveFundamental(snapshot, 'ANTM.JK').per).toBeNull();
  });
});
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run: `npx vitest run modules/recommendation/service/__tests__/ai-pick-scan.service.test.ts`
Expected: FAIL — `Failed to resolve import "../ai-pick-scan.service"`.

- [ ] **Step 3: Tulis implementasi**

Indikator dihitung dengan pola yang sama seperti `recommendation.service.ts` supaya tidak ada definisi kedua yang bisa berbeda hasil.

```typescript
// modules/recommendation/service/ai-pick-scan.service.ts
import { fetchYahooHistory } from '../../technical';
import { calculateScore, type FundamentalInput } from '../../technical';
import { computeDailyNetFlow, computeAccumulationStreak, analyzeAccumulationSignal } from '../../market';
import { AI_PICK_UNIVERSE } from '../../market/constants/ai-pick-universe';
import { readFundamentalSnapshot, type FundamentalSnapshot } from '../../../shared/cache/ai-pick-cache';
import { logger } from '../../../shared/logger/logger';
import type { ScoredStock } from './ai-pick.service';

const BATCH_SIZE = 15;
const EMPTY_FUNDAMENTAL: FundamentalInput = {
  per: null, pbv: null, roe: null, der: null, currentRatio: null, revenueGrowth: null,
};

/** Dipisah jadi fungsi murni supaya kasus "snapshot belum terisi" bisa diuji tanpa
 * jaringan. Mengembalikan field null alih-alih melempar: calculateScore() sudah
 * menangani null dengan skor 0 + alasan "DATA TIDAK LENGKAP" (scoring.service.ts:69),
 * jadi peringkat tetap jalan dari teknikal + flow saja. */
export function resolveFundamental(
  snapshot: FundamentalSnapshot | null,
  ticker: string
): FundamentalInput {
  return snapshot?.[ticker] ?? EMPTY_FUNDAMENTAL;
}

function sma(values: number[], period: number): number {
  if (values.length < period) return 0;
  return values.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function rsi14(closes: number[]): number {
  if (closes.length < 15) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - 14; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  if (losses === 0) return 100;
  return 100 - 100 / (1 + gains / losses);
}

function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out = [values[0]];
  for (let i = 1; i < values.length; i++) out.push(values[i] * k + out[i - 1] * (1 - k));
  return out;
}

function macd(closes: number[]): { line: number; signal: number; hist: number } {
  if (closes.length < 35) return { line: 0, signal: 0, hist: 0 };
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdSeries = closes.map((_, i) => ema12[i] - ema26[i]);
  const signalSeries = ema(macdSeries, 9);
  const line = macdSeries[macdSeries.length - 1];
  const signal = signalSeries[signalSeries.length - 1];
  return { line, signal, hist: line - signal };
}

async function scoreOne(
  ticker: string,
  fundamental: FundamentalInput
): Promise<{ scored: ScoredStock; bearish: boolean } | null> {
  const res = await fetchYahooHistory(ticker, '2y');
  if (!res || res.history.length < 60) {
    logger.warn('AI Pick scan: histori tidak cukup', { ticker });
    return null;
  }

  const history = res.history;
  const closes = history.map((h) => h.Close);
  const volumes = history.map((h) => h.Volume);
  const currentPrice = closes[closes.length - 1];
  const prevClose = closes[closes.length - 2] || currentPrice;
  const changePct = prevClose ? ((currentPrice - prevClose) / prevClose) * 100 : 0;

  const ma20 = sma(closes, 20);
  const ma50 = sma(closes, 50);
  const ma200 = sma(closes, 200);
  const rsi = rsi14(closes);
  const m = macd(closes);
  const volToday = volumes[volumes.length - 1] || 0;
  const volAvg20 = sma(volumes, 20);
  const volRatio = volAvg20 > 0 ? volToday / volAvg20 : 1;

  const ohlcv = history.map((h) => ({
    date: h.Date, high: h.High, low: h.Low, close: h.Close, volume: h.Volume,
  }));
  const dailyFlow = computeDailyNetFlow(ohlcv).slice(-20);
  const streak = computeAccumulationStreak(dailyFlow);
  const accumulationConfirmed = analyzeAccumulationSignal(ohlcv.slice(-20)).status === 'AKUMULASI';

  // Label arus dana memakai ambang yang sama dengan recommendation.service.ts:126-130
  // supaya scoreAsing() menerima masukan yang konsisten dengan fitur lain.
  let foreignFlow = 'NEUTRAL';
  if (changePct > 0.5 && volRatio > 1.2) foreignFlow = 'STRONG NET BUY';
  else if (changePct > 0) foreignFlow = 'NET BUY';
  else if (changePct < -0.5 && volRatio > 1.2) foreignFlow = 'STRONG NET SELL';
  else if (changePct < 0) foreignFlow = 'NET SELL';

  const scoring = calculateScore(
    ticker.replace('.JK', ''),
    {
      currentPrice, ma20, ma50, ma200, rsi,
      macdHist: m.hist, macdLine: m.line, macdSignal: m.signal,
      volToday, volAvg20,
    },
    fundamental,
    {
      foreignFlow,
      consecutiveBuyDays: foreignFlow.includes('BUY') ? streak : 0,
      consecutiveSellDays: 0,
      volRatio,
    }
  );

  // Definisi bearish sama dengan market-summary.service.ts:141-142.
  const bearish = currentPrice < ma20 && ma20 < ma50;

  return {
    scored: {
      symbol: ticker,
      price: currentPrice,
      changePct: parseFloat(changePct.toFixed(2)),
      totalScore: scoring.total_score,
      rsi: parseFloat(rsi.toFixed(1)),
      accumulationConfirmed,
    },
    bearish,
  };
}

export async function scanAiPickScores(): Promise<{ scores: ScoredStock[]; bearishSymbols: string[] }> {
  // Snapshot fundamental boleh kosong - calculateScore() menangani null dengan skor 0
  // dan alasan "DATA TIDAK LENGKAP" (scoring.service.ts:69), jadi peringkat tetap jalan
  // dari teknikal + flow saja alih-alih menggagalkan seluruh halaman.
  const snapshot = await readFundamentalSnapshot();

  const scores: ScoredStock[] = [];
  const bearishSymbols: string[] = [];

  for (let i = 0; i < AI_PICK_UNIVERSE.length; i += BATCH_SIZE) {
    const batch = AI_PICK_UNIVERSE.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map((t) => scoreOne(t, resolveFundamental(snapshot, t)))
    );
    for (const r of results) {
      if (!r) continue;
      scores.push(r.scored);
      if (r.bearish) bearishSymbols.push(r.scored.symbol);
    }
  }

  return { scores, bearishSymbols };
}
```

- [ ] **Step 4: Jalankan test untuk memastikan lulus**

Run: `npx vitest run modules/recommendation/service/__tests__/ai-pick-scan.service.test.ts`
Expected: 3 test PASS.

- [ ] **Step 5: Verifikasi typecheck**

Run: `npx tsc --noEmit`
Expected: tanpa error.

- [ ] **Step 6: Commit**

```bash
git add modules/recommendation/service/ai-pick-scan.service.ts modules/recommendation/service/__tests__/ai-pick-scan.service.test.ts
git commit -m "feat(ai-pick): hitung skor komposit per saham untuk seluruh universe"
```

---

### Task 7: Cron skor AI Pick

**Files:**
- Create: `app/api/cron/ai-pick-scan/route.ts`

**Interfaces:**
- Consumes: `scanAiPickScores` (Task 6), `writeAiPickScores` (Task 4).

- [ ] **Step 1: Tulis route**

```typescript
// app/api/cron/ai-pick-scan/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyQStashSignature } from '@/shared/queue/qstash-signature';
import { withJobRunLog } from '@/shared/scheduler/job-run-log.repository';
import { logger } from '@/shared/logger/logger';
import { scanAiPickScores } from '@/modules/recommendation/service/ai-pick-scan.service';
import { writeAiPickScores } from '@/shared/cache/ai-pick-cache';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const signature = req.headers.get('Upstash-Signature');
  const rawBody = await req.text();

  if (!(await verifyQStashSignature(signature, rawBody))) {
    logger.warn('Menolak request /api/cron/ai-pick-scan - signature QStash tidak valid');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await withJobRunLog('ai-pick-scan', async () => {
      const { scores, bearishSymbols } = await scanAiPickScores();
      await writeAiPickScores({ computedAt: new Date().toISOString(), scores, bearishSymbols });
      return { scored: scores.length, bearish: bearishSymbols.length };
    });
    return NextResponse.json({ success: true, result });
  } catch (err) {
    logger.error('Job ai-pick-scan gagal', { err });
    return NextResponse.json({ error: 'Job gagal' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verifikasi typecheck**

Run: `npx tsc --noEmit`
Expected: tanpa error.

- [ ] **Step 3: Commit**

```bash
git add app/api/cron/ai-pick-scan/route.ts
git commit -m "feat(ai-pick): cron 5 menit hitung skor universe ke Redis"
```

---

### Task 8: Endpoint /api/ai-pick

**Files:**
- Create: `app/api/ai-pick/route.ts`

**Interfaces:**
- Consumes: `readAiPickScores` (Task 4), `rankAiPicks` (Task 3), `cacheGet`.
- Produces: JSON `{ ready: boolean; items: AiPickItem[]; computedAt: string | null; note: string | null }`

- [ ] **Step 1: Tulis route**

Gerbang akses menyalin pola `app/api/breakout-radar/route.ts:16-35` (trial anonim + Pro).

```typescript
// app/api/ai-pick/route.ts
import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { getSession, checkProAccessLive } from '@/modules/user';
import { isInternalServiceRequest } from '@/shared/auth/internal-service';
import { cacheGet } from '@/shared/cache/redis-cache';
import { readAiPickScores } from '@/shared/cache/ai-pick-cache';
import { rankAiPicks, type BreakoutInfo } from '@/modules/recommendation/service/ai-pick.service';
import { readOrIssueAnonymousTrial, applyAnonymousTrialCookie, type AnonTrialState } from '@/shared/auth/anonymous-trial';

const BREAKOUT_CACHE_KEY = 'sahamlens:cache:computed:breakout-radar';

// TIDAK ADA fallback scan di sini - itu inti perubahannya. Kalau cache belum terisi,
// jawab apa adanya supaya UI bisa bilang "data sedang disiapkan", bukan diam-diam
// menembak Yahoo ratusan kali di request seorang pengguna.
export async function GET(request: Request) {
  try {
    const isInternal = isInternalServiceRequest(request);
    const session = isInternal ? null : await getSession();

    let anonTrial: AnonTrialState | null = null;
    if (!isInternal && !session) {
      anonTrial = await readOrIssueAnonymousTrial();
      if (!anonTrial.active) {
        return NextResponse.json({ error: 'Belum login' }, { status: 401 });
      }
    }

    const hasPro = isInternal || anonTrial?.active === true || (await checkProAccessLive(session));
    if (!hasPro) {
      return NextResponse.json({ error: 'Fitur ini butuh akun Pro', code: 'SUBSCRIPTION_REQUIRED' }, { status: 402 });
    }

    const scoreData = await readAiPickScores();
    if (!scoreData) {
      const notReady = NextResponse.json({ ready: false, items: [], computedAt: null, note: null });
      if (anonTrial) await applyAnonymousTrialCookie(notReady, anonTrial);
      return notReady;
    }

    const cachedBreakout = await cacheGet<any>(BREAKOUT_CACHE_KEY);
    const breakout: BreakoutInfo = {
      breakoutSymbols: (cachedBreakout?.data || []).map((b: any) => b.symbol),
      goldenCrossSymbols: (cachedBreakout?.crossSignals?.golden || []).map((s: any) => s.symbol),
      deadCrossSymbols: (cachedBreakout?.crossSignals?.dead || []).map((s: any) => s.symbol),
    };

    const items = rankAiPicks(scoreData.scores, breakout, scoreData.bearishSymbols);

    const response = NextResponse.json({
      ready: true,
      items,
      computedAt: scoreData.computedAt,
      note: cachedBreakout ? null : 'Data breakout belum siap - peringkat sementara tanpa bonus breakout & golden cross.',
    });
    if (anonTrial) await applyAnonymousTrialCookie(response, anonTrial);
    return response;
  } catch (error) {
    return NextResponse.json({ error: 'Server Error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verifikasi typecheck**

Run: `npx tsc --noEmit`
Expected: tanpa error.

- [ ] **Step 3: Commit**

```bash
git add app/api/ai-pick/route.ts
git commit -m "feat(ai-pick): endpoint pembaca cache tanpa scan sendiri"
```

---

### Task 9: Hapus fallback live-scan

**Files:**
- Modify: `app/api/breakout-radar/route.ts:44-52`
- Modify: `app/api/daily-picks/route.ts:29-30`

**Interfaces:** tidak menghasilkan interface baru.

- [ ] **Step 1: Hapus fallback di breakout-radar/route.ts**

Ganti baris 44-52 (blok setelah `if (cached) {...}`) dengan:

```typescript
    // Cache belum terisi - jawab kosong, JANGAN memindai. Pemindaian adalah tugas
    // /api/cron/breakout-scan; menjalankannya di request pengguna berarti satu orang
    // menanggung ~109 fetch Yahoo dan halaman menggantung puluhan detik.
    const empty = NextResponse.json({ data: [], crossSignals: { golden: [], dead: [] }, lastUpdate: null });
    if (anonTrial) await applyAnonymousTrialCookie(empty, anonTrial);
    return empty;
```

Hapus juga import `scanBreakouts, scanCrossSignals` di baris 7 karena tidak lagi terpakai.

- [ ] **Step 2: Hapus fallback di daily-picks/route.ts**

Ganti baris 29-30:

```typescript
    const breakoutList: any[] = cachedBreakout?.data || (Array.isArray(cachedBreakout) ? cachedBreakout : null) || [];
    const crossSignals = cachedBreakout?.crossSignals || { golden: [], dead: [] };
```

Hapus import `scanBreakouts`/`scanCrossSignals` dari file itu kalau sudah tidak dipakai.

- [ ] **Step 3: Verifikasi typecheck**

Run: `npx tsc --noEmit`
Expected: tanpa error (kalau ada error "declared but never used", berarti masih ada import tersisa — hapus).

- [ ] **Step 4: Jalankan seluruh test**

Run: `npx vitest run`
Expected: seluruh test PASS. Perhatikan `app/api/breakout-radar/__tests__` — kalau ada test yang mengasumsikan fallback scan, perbarui agar mengharapkan respons kosong.

- [ ] **Step 5: Commit**

```bash
git add app/api/breakout-radar/route.ts app/api/daily-picks/route.ts
git commit -m "fix(ai-pick): hapus fallback live-scan, endpoint murni baca cache"
```

---

### Task 10: Halaman satu tabel

**Files:**
- Modify: `app/breakout-radar/page.tsx`

**Interfaces:**
- Consumes: `GET /api/ai-pick` (Task 8).

- [ ] **Step 1: Hapus mesin tab**

Hapus dari file: `CATEGORY_TABS`, `TabKey`, `DailyPicks`, `DailyPickCategory`, `CategoryDetail`, `REC_LIQUID_STOCKS`, `fetchRecommendations`, seluruh state `rec*` dan `dailyPicks`, serta `activeTab`. Semua blok JSX per-tab ikut dihapus.

- [ ] **Step 2: Ganti dengan satu pengambilan data**

```typescript
type PickBonus = { label: string; points: number };
type AiPickItem = {
  symbol: string;
  price: number;
  changePct: number;
  baseScore: number;
  bonuses: PickBonus[];
  finalScore: number;
  flagged: boolean;
  flagReason: string | null;
};

const [items, setItems] = useState<AiPickItem[]>([]);
const [ready, setReady] = useState(true);
const [note, setNote] = useState<string | null>(null);
const [computedAt, setComputedAt] = useState<string | null>(null);
const [loading, setLoading] = useState(true);

useEffect(() => {
  fetch('/api/ai-pick')
    .then((r) => r.json())
    .then((d) => {
      if (d?.error) return;
      setItems(d.items || []);
      setReady(d.ready !== false);
      setNote(d.note || null);
      setComputedAt(d.computedAt || null);
    })
    .catch(console.error)
    .finally(() => setLoading(false));
}, []);
```

- [ ] **Step 3: Render tabel**

```tsx
{loading && <p className="text-sm text-tv-muted">Memuat...</p>}

{!loading && !ready && (
  <p className="text-sm text-tv-muted">Data sedang disiapkan. Coba lagi beberapa menit lagi.</p>
)}

{!loading && ready && items.length === 0 && (
  <p className="text-sm text-tv-muted">Belum ada sinyal kuat hari ini.</p>
)}

{!loading && ready && items.length > 0 && (
  <>
    {note && <p className="text-xs text-tv-yellow mb-3">{note}</p>}
    <table className="w-full text-left border-collapse">
      <thead>
        <tr className="border-b border-tv-border text-xs text-tv-muted uppercase">
          <th className="py-3 px-4">#</th>
          <th className="py-3 px-4">Saham</th>
          <th className="py-3 px-4 text-right">Harga</th>
          <th className="py-3 px-4 text-right">Chg</th>
          <th className="py-3 px-4 text-right">Skor</th>
          <th className="py-3 px-4">Rincian</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-tv-border text-sm">
        {items.map((it, idx) => (
          <tr key={it.symbol} className="hover:bg-tv-hover/30">
            <td className="py-3 px-4 text-tv-muted">{idx + 1}</td>
            <td className="py-3 px-4 font-bold font-number text-tv-text">
              {it.symbol.replace('.JK', '')}
              {it.flagged && <span className="ml-2 text-tv-red text-xs">! {it.flagReason}</span>}
            </td>
            <td className="py-3 px-4 text-right font-number">{Math.round(it.price).toLocaleString('id-ID')}</td>
            <td className={`py-3 px-4 text-right font-number ${it.changePct >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
              {it.changePct >= 0 ? '+' : ''}{it.changePct.toFixed(1)}%
            </td>
            <td className="py-3 px-4 text-right font-bold font-number text-tv-text">{it.finalScore}</td>
            <td className="py-3 px-4 text-xs text-tv-muted font-number">
              {it.baseScore}
              {it.bonuses.map((b) => ` +${b.points} ${b.label}`).join('')}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    <p className="text-[11px] text-tv-muted mt-4">
      Skor = komposit teknikal, fundamental, dan arus dana, ditambah bonus sinyal langka.
      Bonus akumulasi memakai estimasi Chaikin Money Flow dari posisi close di range
      High-Low, BUKAN data broker/asing resmi. Hanya saham berskor 60 ke atas yang tampil.
    </p>
    {computedAt && (
      <p className="text-[11px] text-tv-muted">
        Data per {new Date(computedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
      </p>
    )}
  </>
)}
```

Timestamp dibaca dari `computedAt` milik cache — memperbaiki `setRecLastUpdate(new Date())` lama yang menampilkan jam klik seolah waktu data dihitung.

- [ ] **Step 4: Verifikasi typecheck**

Run: `npx tsc --noEmit`
Expected: tanpa error.

- [ ] **Step 5: Jalankan aplikasi dan periksa halaman**

Run: `npm run dev`
Buka `http://localhost:3001/breakout-radar`.
Expected: satu tabel, tanpa tab. Kalau cron belum pernah jalan, muncul "Data sedang disiapkan".

- [ ] **Step 6: Commit**

```bash
git add app/breakout-radar/page.tsx
git commit -m "feat(ai-pick): ganti 8 tab jadi satu tabel berperingkat"
```

---

### Task 11: Daftarkan jadwal QStash

**Files:**
- Modify: `DEPLOYMENT.md`

**Interfaces:** tidak ada.

Catatan: `DEPLOYMENT.md` saat ini **tidak** memuat bagian jadwal QStash sama sekali,
meskipun plan lama merujuk ke sana. Task ini sekaligus mengisi kekosongan itu.

- [ ] **Step 1: Daftarkan dua jadwal lewat QStash API**

Ganti `<DOMAIN>` dengan domain produksi dan pastikan `QSTASH_TOKEN` ada di environment.
Jam UTC dipakai karena QStash menjadwalkan dalam UTC; WIB = UTC+7.

```bash
# Skor AI Pick - tiap 5 menit, Senin-Jumat, 09:00-16:00 WIB (02:00-09:00 UTC)
curl -XPOST "https://qstash.upstash.io/v2/schedules/https://<DOMAIN>/api/cron/ai-pick-scan" \
  -H "Authorization: Bearer $QSTASH_TOKEN" \
  -H "Upstash-Cron: */5 2-9 * * 1-5"

# Snapshot fundamental - harian 05:00 WIB (22:00 UTC hari sebelumnya), Senin-Jumat
curl -XPOST "https://qstash.upstash.io/v2/schedules/https://<DOMAIN>/api/cron/fundamental-snapshot" \
  -H "Authorization: Bearer $QSTASH_TOKEN" \
  -H "Upstash-Cron: 0 22 * * 0-4"
```

- [ ] **Step 2: Verifikasi jadwal terdaftar**

```bash
curl -s "https://qstash.upstash.io/v2/schedules" -H "Authorization: Bearer $QSTASH_TOKEN"
```

Expected: kedua endpoint muncul di daftar dengan cron yang sesuai.

- [ ] **Step 3: Catat di DEPLOYMENT.md**

Tambahkan bagian baru berjudul `## Jadwal QStash` yang memuat tabel berikut, sertakan
nama job persis seperti yang dipakai `withJobRunLog` supaya bisa ditelusuri lewat log job:

```markdown
## Jadwal QStash

| Endpoint | Nama job | Cron (UTC) | Setara WIB |
|---|---|---|---|
| `/api/cron/ai-pick-scan` | `ai-pick-scan` | `*/5 2-9 * * 1-5` | tiap 5 menit, 09:00-16:00 hari bursa |
| `/api/cron/fundamental-snapshot` | `fundamental-snapshot` | `0 22 * * 0-4` | 05:00 hari bursa |
```

- [ ] **Step 3: Commit**

```bash
git add DEPLOYMENT.md
git commit -m "docs: catat jadwal QStash ai-pick-scan dan fundamental-snapshot"
```

---

## Verifikasi akhir

- [ ] `npx vitest run` — seluruh test PASS
- [ ] `npx tsc --noEmit` — bersih
- [ ] `curl -s localhost:3001/api/ai-pick` mengembalikan JSON, bukan HTML error
- [ ] Halaman `/breakout-radar` menampilkan satu tabel tanpa tab
- [ ] Log server tanpa error saat halaman dibuka
- [ ] `grep -rn "scanBreakouts\|scanCrossSignals" app/api/` hanya menyisakan `app/api/cron/breakout-scan/route.ts`
- [ ] `modules/backtest/**` dan `app/backtest/**` tidak berubah: `git diff --stat main -- modules/backtest app/backtest` kosong
