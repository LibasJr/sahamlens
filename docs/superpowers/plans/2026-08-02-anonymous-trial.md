# Trial 7 Hari untuk Pengunjung Anonim Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let visitors with no account use 7 "view/analysis" endpoints (Market Pulse, Corporate Calendar, Multi-agent AI Consensus, Council AI, Backtest, Breakout Radar, Recommendations) for 7 days from their first visit, without signing up — matching the "gratis 7 hari" promise that currently only starts after signup.

**Architecture:** A new HttpOnly signed cookie (`sahamlens_anon_trial`) records `firstSeenAt` for anonymous visitors, verified the same way session cookies already are (reusing `shared/auth/jwt.ts`, generalized to sign non-session payloads too). Each of the 7 routes checks, in the same place it already checks `getSession()`, whether an anonymous trial is active as a fallback — exactly mirroring how those routes already treat a logged-in account's `trial_ends_at`.

**Tech Stack:** Next.js 14 App Router (Node runtime route handlers, not Edge), TypeScript, Vitest, `jose` (already used for JWT signing).

## Global Constraints

- Watchlist/Alert (`/api/watchlist`, `/api/alert`, `/api/v1/watchlists`) and Portfolio/Akun Demo are **out of scope** — they stay account-only (personal data needs a permanent owner). Do not touch those routes.
- Anonymous trial identity is a signed HttpOnly cookie only — no IP-based backstop. Resetting via cleared cookies/incognito/different browser is an accepted risk (explicit product decision), not a defect to fix.
- Signing up after using some/all of the anonymous trial grants a **fresh** `TRIAL_DAYS` (7 days) account trial — no carry-over logic, no linkage between the two trials.
- Anonymous trial active = full access, including bypassing any `checkProAccess()` gate on that route — same tier as an account mid-trial, never treated as "logged-in free tier."
- Every route keeps checking its own authorization explicitly (no middleware-centralized gating) — consistent with how `getSession()`/`checkProAccess()` are already called individually in each route today.
- `middleware.ts`'s per-IP rate limit (`RATE_LIMIT_CONFIG.maxPerWindow`, currently `50`) is a separate, already-working mechanism — do not modify `middleware.ts` in this plan.
- Vitest resolves the `@/*` path alias as of this plan's Task 1 (new `vitest.config.ts`) — write new test files using the same `@/...` import style the production files already use, not relative paths (this supersedes any earlier note in this repo about `@/*` being unresolvable in tests).

---

### Task 1: Vitest `@/*` alias support + generalize `encrypt`/`decrypt`

**Files:**
- Create: `vitest.config.ts`
- Modify: `shared/auth/jwt.ts`

**Interfaces:**
- Produces: `encrypt<T extends object>(payload: T, expires?: string): Promise<string>` and `decrypt<T = SessionPayload>(input: string): Promise<T | null>` — Task 2 uses both with a custom payload type instead of `SessionPayload`.

- [ ] **Step 1: Create `vitest.config.ts` at the repo root**

```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

// tsconfig.json mendefinisikan alias "@/*" -> "./*" untuk Next.js (webpack resolve
// alias-nya otomatis, tapi Vitest tidak baca tsconfig paths sama sekali tanpa config
// eksplisit ini) - tanpa file ini, SETIAP file produksi yang mengimpor lewat "@/..."
// gagal di-resolve begitu diimpor (langsung/transitif) oleh test manapun.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
  test: {
    env: {
      // shared/auth/jwt.ts throw keras kalau kosong (guard produksi, tidak boleh
      // jalan dengan secret hardcoded) - nilai ini HANYA dipakai proses test,
      // tidak pernah menyentuh .env.local/produksi yang sesungguhnya.
      JWT_SECRET_KEY: 'test-only-secret-key-not-used-in-production',
    },
  },
});
```

- [ ] **Step 2: Run the full existing test suite to confirm the new config doesn't break anything**

Run: `npx vitest run`
Expected: `Test Files  13 passed (13)`, `Tests  76 passed (76)` (same counts as before this file existed — this step only proves the new config is inert for existing tests).

- [ ] **Step 3: Write a test proving `@/` imports now resolve, using the real generalization from Step 4**

Create `shared/auth/__tests__/jwt.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, type SessionPayload } from '@/shared/auth/jwt';

describe('encrypt/decrypt (generic payload support)', () => {
  it('round-trips a SessionPayload exactly like before (backward compatible)', async () => {
    const payload: SessionPayload = {
      id: 'u1', email: 'a@b.com', role: 'user', is_pro: false, trial_ends_at: null,
    };
    const token = await encrypt(payload);
    const decoded = await decrypt(token);
    expect(decoded?.id).toBe('u1');
    expect(decoded?.email).toBe('a@b.com');
  });

  it('round-trips an arbitrary custom payload shape via explicit generic', async () => {
    interface CustomPayload { firstSeenAt: string }
    const payload: CustomPayload = { firstSeenAt: '2026-08-02T00:00:00.000Z' };
    const token = await encrypt(payload, '7d');
    const decoded = await decrypt<CustomPayload>(token);
    expect(decoded?.firstSeenAt).toBe('2026-08-02T00:00:00.000Z');
  });

  it('mengembalikan null untuk token rusak/tidak valid, bukan throw', async () => {
    const decoded = await decrypt('not-a-real-jwt');
    expect(decoded).toBeNull();
  });
});
```

- [ ] **Step 4: Run test to verify it fails for the expected reason**

Run: `npx vitest run shared/auth/__tests__/jwt.test.ts`
Expected: FAIL — TypeScript/runtime error because `encrypt`/`decrypt` are not yet generic (the second test's explicit `decrypt<CustomPayload>(token)` call and passing a non-`SessionPayload` object to `encrypt` won't type-check against the current signature).

- [ ] **Step 5: Generalize `encrypt`/`decrypt` in `shared/auth/jwt.ts`**

Replace the full contents of `shared/auth/jwt.ts`:

```typescript
import { SignJWT, jwtVerify } from 'jose';

// Modul JWT murni - tanpa next/headers, tanpa I/O selain verifikasi tanda tangan.
// Edge-safe (dipakai langsung oleh middleware.ts) maupun Node-safe (dipakai oleh
// shared/auth/session.ts dan modules/user).

const secretKey = process.env.JWT_SECRET_KEY;
if (!secretKey) {
  throw new Error('JWT_SECRET_KEY env var wajib diset - lihat .env.local. Aplikasi tidak boleh berjalan dengan secret hardcoded.');
}
const key = new TextEncoder().encode(secretKey);

export interface SessionPayload {
  id: string;
  email: string;
  role: 'admin' | 'user' | 'free' | 'pro' | string;
  is_pro: boolean;
  trial_ends_at: string | null;
  [key: string]: any;
}

// Generic (bukan cuma SessionPayload) - dipakai juga oleh shared/auth/anonymous-trial.ts
// untuk menandatangani payload trial pengunjung anonim, bukan cuma sesi login. Default
// generic tetap SessionPayload supaya pemanggil lama (shared/auth/session.ts,
// middleware.ts) tidak perlu diubah sama sekali.
export async function encrypt<T extends object>(payload: T, expires = '24h'): Promise<string> {
  return await new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expires)
    .sign(key);
}

export async function decrypt<T = SessionPayload>(input: string): Promise<T | null> {
  try {
    const { payload } = await jwtVerify(input, key, { algorithms: ['HS256'] });
    return payload as unknown as T;
  } catch {
    return null;
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run shared/auth/__tests__/jwt.test.ts`
Expected: PASS, all 3 tests green.

- [ ] **Step 7: Run the full suite once more (regression check)**

Run: `npx vitest run`
Expected: `Tests  79 passed (79)` (76 original + 3 new), all green — this proves `shared/auth/session.ts` and `middleware.ts` (both call `decrypt`/`encrypt` without a generic argument) still work unchanged.

- [ ] **Step 8: Run typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add vitest.config.ts shared/auth/jwt.ts shared/auth/__tests__/jwt.test.ts
git commit -m "test: tambah vitest.config.ts (alias @/*) dan generalisasi encrypt/decrypt jwt"
```

---

### Task 2: `shared/auth/anonymous-trial.ts`

**Files:**
- Modify: `shared/constants/cookie-names.ts`
- Create: `shared/auth/anonymous-trial.ts`
- Test: `shared/auth/__tests__/anonymous-trial.test.ts`

**Interfaces:**
- Consumes: `encrypt<T>`, `decrypt<T>` from `./jwt` (Task 1's output).
- Produces: `AnonTrialState { firstSeenAt: string; expiresAt: string; active: boolean; isNew: boolean }`, `readOrIssueAnonymousTrial(): Promise<AnonTrialState>`, `applyAnonymousTrialCookie(res: NextResponse, trial: AnonTrialState): Promise<void>` — Tasks 3-9 import all three from `@/shared/auth/anonymous-trial`.

- [ ] **Step 1: Add the cookie name constant**

Modify `shared/constants/cookie-names.ts` — add after the existing `DEMO_SESSION_COOKIE` line:

```typescript
// Cookie trial 7 hari untuk pengunjung TANPA akun (HttpOnly, ditandatangani -
// lihat shared/auth/anonymous-trial.ts). Beda dari SESSION_COOKIE (itu untuk akun
// yang sudah login) - cookie ini murni penanda "kapan pertama kali dilihat".
export const ANON_TRIAL_COOKIE = 'sahamlens_anon_trial';
```

- [ ] **Step 2: Write the failing test**

Create `shared/auth/__tests__/anonymous-trial.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCookieStore = { get: vi.fn(), set: vi.fn() };
vi.mock('next/headers', () => ({
  cookies: () => mockCookieStore,
}));

import { readOrIssueAnonymousTrial, applyAnonymousTrialCookie } from '../anonymous-trial';
import { encrypt } from '../jwt';
import { ANON_TRIAL_COOKIE } from '../../constants/cookie-names';

describe('readOrIssueAnonymousTrial', () => {
  beforeEach(() => vi.clearAllMocks());

  it('tidak ada cookie sama sekali -> trial baru, aktif', async () => {
    mockCookieStore.get.mockReturnValue(undefined);

    const trial = await readOrIssueAnonymousTrial();

    expect(trial.isNew).toBe(true);
    expect(trial.active).toBe(true);
  });

  it('cookie ada, firstSeenAt 3 hari lalu -> masih aktif, bukan baru', async () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const token = await encrypt({ firstSeenAt: threeDaysAgo }, '7d');
    mockCookieStore.get.mockReturnValue({ value: token });

    const trial = await readOrIssueAnonymousTrial();

    expect(trial.isNew).toBe(false);
    expect(trial.active).toBe(true);
    expect(trial.firstSeenAt).toBe(threeDaysAgo);
  });

  it('cookie ada, firstSeenAt 8 hari lalu -> tidak aktif lagi', async () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const token = await encrypt({ firstSeenAt: eightDaysAgo }, '30d');
    mockCookieStore.get.mockReturnValue({ value: token });

    const trial = await readOrIssueAnonymousTrial();

    expect(trial.active).toBe(false);
  });

  it('cookie ada tapi gagal decrypt (rusak/token acak) -> diperlakukan sama seperti tidak ada cookie', async () => {
    mockCookieStore.get.mockReturnValue({ value: 'not-a-real-jwt' });

    const trial = await readOrIssueAnonymousTrial();

    expect(trial.isNew).toBe(true);
    expect(trial.active).toBe(true);
  });
});

describe('applyAnonymousTrialCookie', () => {
  beforeEach(() => vi.clearAllMocks());

  it('trial.isNew === false -> TIDAK menulis cookie (hanya ditulis sekali)', async () => {
    const res = { cookies: { set: vi.fn() } } as any;
    const trial = { firstSeenAt: '2026-08-01T00:00:00.000Z', expiresAt: '2026-08-08T00:00:00.000Z', active: true, isNew: false };

    await applyAnonymousTrialCookie(res, trial);

    expect(res.cookies.set).not.toHaveBeenCalled();
  });

  it('trial.isNew === true -> menulis cookie HttpOnly', async () => {
    const res = { cookies: { set: vi.fn() } } as any;
    const trial = { firstSeenAt: '2026-08-01T00:00:00.000Z', expiresAt: '2026-08-08T00:00:00.000Z', active: true, isNew: true };

    await applyAnonymousTrialCookie(res, trial);

    expect(res.cookies.set).toHaveBeenCalledTimes(1);
    const [name, , options] = res.cookies.set.mock.calls[0];
    expect(name).toBe(ANON_TRIAL_COOKIE);
    expect(options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run shared/auth/__tests__/anonymous-trial.test.ts`
Expected: FAIL — `Cannot find module '../anonymous-trial'` (file doesn't exist yet).

- [ ] **Step 4: Write the implementation**

Create `shared/auth/anonymous-trial.ts`:

```typescript
import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';
import { encrypt, decrypt } from './jwt';
import { ANON_TRIAL_COOKIE } from '../constants/cookie-names';

// Trial 7 hari untuk pengunjung TANPA akun - dipakai 7 endpoint "lihat-analisa" yang
// sebelumnya wajib login (Market Pulse, Calendar, Multi-agent, Council AI, Backtest,
// Breakout Radar, Recommendations). TIDAK dipakai endpoint yang menyimpan data pribadi
// (Watchlist/Alert tetap wajib akun - lihat docs/superpowers/specs/2026-08-02-
// anonymous-trial-design.md).
//
// Mekanisme: cookie HttpOnly ditandatangani (bukan bisa diedit klien) berisi kapan
// pertama kali dilihat. Reset via hapus cookie/incognito/browser lain diterima sebagai
// risiko yang wajar (keputusan produk 2026-08-02) - fokusnya UX jujur, bukan anti-abuse
// ketat. Kalau visitor akhirnya daftar akun, trial akun mulai FRESH TRIAL_DAYS lagi -
// TIDAK terhubung dengan sisa hari trial anonim ini (keputusan produk yang sama).
const ANON_TRIAL_DAYS = 7;
const ANON_TRIAL_MAX_AGE_SEC = ANON_TRIAL_DAYS * 24 * 60 * 60;

interface AnonTrialPayload {
  firstSeenAt: string; // ISO timestamp
}

export interface AnonTrialState {
  firstSeenAt: string;
  expiresAt: string;
  active: boolean;
  isNew: boolean; // true kalau baru dibuat request ini - caller WAJIB tempelkan cookie ke response
}

function computeState(firstSeenAt: string, isNew: boolean): AnonTrialState {
  const expiresAt = new Date(new Date(firstSeenAt).getTime() + ANON_TRIAL_MAX_AGE_SEC * 1000).toISOString();
  return { firstSeenAt, expiresAt, active: new Date(expiresAt).getTime() > Date.now(), isNew };
}

// Baca cookie trial yang ada, atau buat state baru (belum ditulis ke cookie - lihat
// applyAnonymousTrialCookie) kalau belum ada/rusak. Panggil HANYA saat !session (kalau
// user sudah login, trial akun/checkProAccess yang berlaku, bukan ini).
export async function readOrIssueAnonymousTrial(): Promise<AnonTrialState> {
  const existing = cookies().get(ANON_TRIAL_COOKIE)?.value;
  if (existing) {
    const payload = await decrypt<AnonTrialPayload>(existing);
    if (payload?.firstSeenAt) {
      return computeState(payload.firstSeenAt, false);
    }
  }
  // Tidak ada cookie, atau rusak/gagal decrypt - diperlakukan sebagai "belum pernah
  // lihat", BUKAN sebagai trial kadaluarsa. Trial baru mulai dari sekarang.
  return computeState(new Date().toISOString(), true);
}

// Tempelkan cookie ke response HANYA kalau trial.isNew (request-request berikutnya
// yang membaca cookie yang sudah ada TIDAK menulis ulang setiap kali).
export async function applyAnonymousTrialCookie(res: NextResponse, trial: AnonTrialState): Promise<void> {
  if (!trial.isNew) return;
  const token = await encrypt<AnonTrialPayload>({ firstSeenAt: trial.firstSeenAt }, `${ANON_TRIAL_DAYS}d`);
  res.cookies.set(ANON_TRIAL_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: ANON_TRIAL_MAX_AGE_SEC,
    path: '/',
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run shared/auth/__tests__/anonymous-trial.test.ts`
Expected: PASS, all 6 tests green.

- [ ] **Step 6: Run typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add shared/constants/cookie-names.ts shared/auth/anonymous-trial.ts shared/auth/__tests__/anonymous-trial.test.ts
git commit -m "feat: tambah shared/auth/anonymous-trial untuk trial 7 hari pengunjung anonim"
```

---

### Task 3: Apply to `/api/calendar` (login-only gate)

**Files:**
- Modify: `app/api/calendar/route.ts`
- Test: `app/api/calendar/__tests__/route.test.ts` (new)

**Interfaces:**
- Consumes: `readOrIssueAnonymousTrial`, `applyAnonymousTrialCookie`, `AnonTrialState` from `@/shared/auth/anonymous-trial` (Task 2's output).

- [ ] **Step 1: Write the failing tests**

Create `app/api/calendar/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/modules/user', () => ({
  getSession: vi.fn(),
}));
vi.mock('@/modules/market/service/corporate-calendar.service', () => ({
  fetchCorporateCalendar: vi.fn(),
}));
vi.mock('@/shared/cache/redis-cache', () => ({
  getOrCompute: vi.fn(),
}));
vi.mock('@/shared/auth/anonymous-trial', () => ({
  readOrIssueAnonymousTrial: vi.fn(),
  applyAnonymousTrialCookie: vi.fn(),
}));

import { GET } from '../route';
import { getSession } from '@/modules/user';
import { getOrCompute } from '@/shared/cache/redis-cache';
import { readOrIssueAnonymousTrial, applyAnonymousTrialCookie } from '@/shared/auth/anonymous-trial';

describe('GET /api/calendar', () => {
  beforeEach(() => vi.clearAllMocks());

  it('menolak dengan 401 kalau tidak ada session DAN trial anonim sudah kadaluarsa', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    vi.mocked(readOrIssueAnonymousTrial).mockResolvedValue({
      firstSeenAt: '2026-01-01T00:00:00.000Z', expiresAt: '2026-01-08T00:00:00.000Z', active: false, isNew: false,
    });

    const res = await GET();

    expect(res.status).toBe(401);
    expect(getOrCompute).not.toHaveBeenCalled();
  });

  it('mengizinkan akses tanpa session kalau trial anonim masih aktif, dan menempelkan cookie trial baru', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const trial = { firstSeenAt: '2026-08-02T00:00:00.000Z', expiresAt: '2026-08-09T00:00:00.000Z', active: true, isNew: true };
    vi.mocked(readOrIssueAnonymousTrial).mockResolvedValue(trial);
    vi.mocked(getOrCompute).mockResolvedValue({ '2026-08-05': [] } as any);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.events).toEqual({ '2026-08-05': [] });
    expect(applyAnonymousTrialCookie).toHaveBeenCalledWith(expect.anything(), trial);
  });

  it('cookie trial yang SUDAH ADA (bukan baru) tidak ditempel ulang', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const trial = { firstSeenAt: '2026-07-28T00:00:00.000Z', expiresAt: '2026-08-04T00:00:00.000Z', active: true, isNew: false };
    vi.mocked(readOrIssueAnonymousTrial).mockResolvedValue(trial);
    vi.mocked(getOrCompute).mockResolvedValue({} as any);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(applyAnonymousTrialCookie).toHaveBeenCalledWith(expect.anything(), trial);
  });

  it('user dengan session valid tidak menyentuh logic trial anonim sama sekali', async () => {
    vi.mocked(getSession).mockResolvedValue({ id: 'u1' } as any);
    vi.mocked(getOrCompute).mockResolvedValue({} as any);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(readOrIssueAnonymousTrial).not.toHaveBeenCalled();
    expect(applyAnonymousTrialCookie).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/api/calendar/__tests__/route.test.ts`
Expected: FAIL — currently `GET()` returns 401 unconditionally when `!session`, with no anonymous-trial fallback.

- [ ] **Step 3: Write the implementation**

Replace the full contents of `app/api/calendar/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { getSession } from '@/modules/user';
import { fetchCorporateCalendar } from '@/modules/market/service/corporate-calendar.service';
import { getOrCompute } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC } from '@/shared/cache/ttl-policy';
import { readOrIssueAnonymousTrial, applyAnonymousTrialCookie, type AnonTrialState } from '@/shared/auth/anonymous-trial';

// Menggantikan data/calendar.json (dummy statis, "hari ini" ter-mock permanen ke
// 2026-07-28) - lihat corporate-calendar.service.ts untuk alasan cakupan dibatasi ke
// Dividen+Earnings saja (RUPS/Stock Split tidak ada sumber data gratis yang bisa
// diandalkan). Pengunjung tanpa akun bisa akses selama trial 7 hari (lihat
// shared/auth/anonymous-trial.ts) - setelah itu wajib akun, pola sama seperti
// /api/backtest.
const CACHE_KEY = 'sahamlens:cache:computed:corporate-calendar';

export async function GET() {
  const session = await getSession();
  let anonTrial: AnonTrialState | null = null;
  if (!session) {
    anonTrial = await readOrIssueAnonymousTrial();
    if (!anonTrial.active) {
      return NextResponse.json({ error: 'Belum login' }, { status: 401 });
    }
  }

  try {
    const events = await getOrCompute(CACHE_KEY, CACHE_TTL_SEC.CORPORATE_CALENDAR, fetchCorporateCalendar);
    const response = NextResponse.json({ events });
    if (anonTrial) await applyAnonymousTrialCookie(response, anonTrial);
    return response;
  } catch (error) {
    console.error('Calendar API error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/api/calendar/__tests__/route.test.ts`
Expected: PASS, all 4 tests green.

- [ ] **Step 5: Run typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/api/calendar/route.ts app/api/calendar/__tests__/route.test.ts
git commit -m "feat: izinkan trial anonim 7 hari di /api/calendar"
```

---

### Task 4: Apply to `/api/backtest` (login-only gate, existing test file)

**Files:**
- Modify: `app/api/backtest/route.ts`
- Modify: `app/api/backtest/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `readOrIssueAnonymousTrial`, `applyAnonymousTrialCookie`, `AnonTrialState` from `../../../shared/auth/anonymous-trial` (relative import — this file already uses relative imports throughout, keep that style, do not switch to `@/`).

- [ ] **Step 1: Write the failing tests**

Modify `app/api/backtest/__tests__/route.test.ts` — add the import and mock, then two new tests. Change the top of the file from:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../modules/user', () => ({
  getSession: vi.fn(),
}));
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

to:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../modules/user', () => ({
  getSession: vi.fn(),
}));
vi.mock('../../../../modules/backtest', () => ({
  readBacktestCache: vi.fn(),
  precomputeBacktestData: vi.fn(),
  writeBacktestCache: vi.fn(),
  simulateBacktest: vi.fn(),
  computeLiveSignal: vi.fn(),
}));
vi.mock('../../../../shared/auth/anonymous-trial', () => ({
  readOrIssueAnonymousTrial: vi.fn(),
  applyAnonymousTrialCookie: vi.fn(),
}));

import { POST } from '../route';
import { getSession } from '../../../../modules/user';
import { readBacktestCache, precomputeBacktestData, writeBacktestCache, simulateBacktest, computeLiveSignal } from '../../../../modules/backtest';
import { readOrIssueAnonymousTrial, applyAnonymousTrialCookie } from '../../../../shared/auth/anonymous-trial';
```

Then add this new `describe` block at the end of the file (after the closing `});` of `describe('POST /api/backtest (mode: live-signal)', ...)`):

```typescript
describe('POST /api/backtest (trial anonim)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('tanpa session, trial anonim kadaluarsa -> 401', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    vi.mocked(readOrIssueAnonymousTrial).mockResolvedValue({
      firstSeenAt: '2026-01-01T00:00:00.000Z', expiresAt: '2026-01-08T00:00:00.000Z', active: false, isNew: false,
    });

    const res = await POST(makeRequest({ filters: ['RSI 14'], modal: 100_000_000, period: 3 }));

    expect(res.status).toBe(401);
  });

  it('tanpa session, trial anonim aktif -> 200 (mode backtest) dan cookie ditempel', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const trial = { firstSeenAt: '2026-08-02T00:00:00.000Z', expiresAt: '2026-08-09T00:00:00.000Z', active: true, isNew: true };
    vi.mocked(readOrIssueAnonymousTrial).mockResolvedValue(trial);
    vi.mocked(readBacktestCache).mockResolvedValue({ computedAt: 'x', ihsg: [], tickers: [] } as any);
    vi.mocked(simulateBacktest).mockReturnValue(sampleResult as any);

    const res = await POST(makeRequest({ filters: ['RSI 14'], modal: 100_000_000, period: 3 }));

    expect(res.status).toBe(200);
    expect(applyAnonymousTrialCookie).toHaveBeenCalledWith(expect.anything(), trial);
  });

  it('tanpa session, trial anonim aktif -> 200 (mode live-signal) dan cookie ditempel', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const trial = { firstSeenAt: '2026-08-02T00:00:00.000Z', expiresAt: '2026-08-09T00:00:00.000Z', active: true, isNew: true };
    vi.mocked(readOrIssueAnonymousTrial).mockResolvedValue(trial);
    vi.mocked(readBacktestCache).mockResolvedValue({ computedAt: 'x', ihsg: [], tickers: [] } as any);
    vi.mocked(computeLiveSignal).mockReturnValue({ dataAsOf: 'x', matches: [] } as any);
    vi.mocked(simulateBacktest).mockReturnValue({ winRatePct: 0, returnPct: 0, alphaPct: 0, totalTrades: 0 } as any);

    const res = await POST(makeRequest({ filters: ['RSI 14'], mode: 'live-signal' }));

    expect(res.status).toBe(200);
    expect(applyAnonymousTrialCookie).toHaveBeenCalledWith(expect.anything(), trial);
  });

  it('user dengan session valid tidak menyentuh logic trial anonim sama sekali', async () => {
    vi.mocked(getSession).mockResolvedValue({ id: 'u1' } as any);
    vi.mocked(readBacktestCache).mockResolvedValue({ computedAt: 'x', ihsg: [], tickers: [] } as any);
    vi.mocked(simulateBacktest).mockReturnValue(sampleResult as any);

    const res = await POST(makeRequest({ filters: ['RSI 14'], modal: 100_000_000, period: 3 }));

    expect(res.status).toBe(200);
    expect(readOrIssueAnonymousTrial).not.toHaveBeenCalled();
    expect(applyAnonymousTrialCookie).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run app/api/backtest/__tests__/route.test.ts`
Expected: the 4 new tests in `describe('POST /api/backtest (trial anonim)', ...)` FAIL (route still returns 401 unconditionally when `!session`); all pre-existing tests in the file still PASS unchanged.

- [ ] **Step 3: Write the implementation**

Replace the full contents of `app/api/backtest/route.ts`:

```typescript
import { guard } from '../../../lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { getSession } from '../../../modules/user';
import { logger } from '../../../shared/logger/logger';
import { readOrIssueAnonymousTrial, applyAnonymousTrialCookie, type AnonTrialState } from '../../../shared/auth/anonymous-trial';
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
    let anonTrial: AnonTrialState | null = null;
    if (!session) {
      anonTrial = await readOrIssueAnonymousTrial();
      if (!anonTrial.active) {
        return NextResponse.json({ error: 'Belum login' }, { status: 401 });
      }
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

      const response = NextResponse.json({
        dataAsOf: liveResult.dataAsOf,
        matches: liveResult.matches,
        historicalStats: {
          winRatePct: historical.winRatePct,
          returnPct: historical.returnPct,
          alphaPct: historical.alphaPct,
          totalTrades: historical.totalTrades,
        },
      });
      if (anonTrial) await applyAnonymousTrialCookie(response, anonTrial);
      return response;
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

    const response = NextResponse.json(responseBody);
    if (anonTrial) await applyAnonymousTrialCookie(response, anonTrial);
    return response;
  } catch (error) {
    logger.error('Backtest gagal', { error });
    return NextResponse.json({ error: 'Server Error' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/api/backtest/__tests__/route.test.ts`
Expected: PASS, all tests in all 3 `describe` blocks green (7 + 7 + 4 = 18 tests).

- [ ] **Step 5: Run typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/api/backtest/route.ts app/api/backtest/__tests__/route.test.ts
git commit -m "feat: izinkan trial anonim 7 hari di /api/backtest"
```

---

### Task 5: Apply to `/api/market-pulse` (login + Pro gate, `isInternal` bypass)

**Files:**
- Modify: `app/api/market-pulse/route.ts`
- Test: `app/api/market-pulse/__tests__/route.test.ts` (new)

**Interfaces:**
- Consumes: `readOrIssueAnonymousTrial`, `applyAnonymousTrialCookie`, `AnonTrialState` from `@/shared/auth/anonymous-trial`.

- [ ] **Step 1: Write the failing tests**

Create `app/api/market-pulse/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/modules/user', () => ({
  getSession: vi.fn(),
  checkProAccess: vi.fn(),
}));
vi.mock('@/shared/auth/internal-service', () => ({
  isInternalServiceRequest: vi.fn(),
}));
vi.mock('@/modules/market', () => ({
  getMarketPulse: vi.fn(),
}));
vi.mock('@/shared/cache/redis-cache', () => ({
  cacheGet: vi.fn(),
}));
vi.mock('@/shared/auth/anonymous-trial', () => ({
  readOrIssueAnonymousTrial: vi.fn(),
  applyAnonymousTrialCookie: vi.fn(),
}));

import { GET } from '../route';
import { getSession, checkProAccess } from '@/modules/user';
import { isInternalServiceRequest } from '@/shared/auth/internal-service';
import { cacheGet } from '@/shared/cache/redis-cache';
import { readOrIssueAnonymousTrial, applyAnonymousTrialCookie } from '@/shared/auth/anonymous-trial';

function makeRequest(): Request {
  return new Request('http://localhost/api/market-pulse');
}

describe('GET /api/market-pulse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isInternalServiceRequest).mockReturnValue(false);
  });

  it('menolak dengan 401 kalau tidak ada session DAN trial anonim kadaluarsa', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    vi.mocked(readOrIssueAnonymousTrial).mockResolvedValue({
      firstSeenAt: '2026-01-01T00:00:00.000Z', expiresAt: '2026-01-08T00:00:00.000Z', active: false, isNew: false,
    });

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
  });

  it('trial anonim aktif melewati gerbang Pro juga (bukan didudukkan sebagai user gratis biasa)', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const trial = { firstSeenAt: '2026-08-02T00:00:00.000Z', expiresAt: '2026-08-09T00:00:00.000Z', active: true, isNew: true };
    vi.mocked(readOrIssueAnonymousTrial).mockResolvedValue(trial);
    vi.mocked(cacheGet).mockResolvedValue({ indices: [] } as any);

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(checkProAccess).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(json).toEqual({ indices: [] });
    expect(applyAnonymousTrialCookie).toHaveBeenCalledWith(expect.anything(), trial);
  });

  it('session valid tapi bukan Pro/trial -> 402, tidak menyentuh logic trial anonim', async () => {
    vi.mocked(getSession).mockResolvedValue({ id: 'u1' } as any);
    vi.mocked(checkProAccess).mockReturnValue(false);

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(402);
    expect(json.code).toBe('SUBSCRIPTION_REQUIRED');
    expect(readOrIssueAnonymousTrial).not.toHaveBeenCalled();
  });

  it('session valid dengan Pro -> 200, tidak menyentuh logic trial anonim', async () => {
    vi.mocked(getSession).mockResolvedValue({ id: 'u1' } as any);
    vi.mocked(checkProAccess).mockReturnValue(true);
    vi.mocked(cacheGet).mockResolvedValue({ indices: [] } as any);

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    expect(readOrIssueAnonymousTrial).not.toHaveBeenCalled();
    expect(applyAnonymousTrialCookie).not.toHaveBeenCalled();
  });

  it('panggilan internal (cron) tetap lolos tanpa menyentuh logic trial anonim sama sekali', async () => {
    vi.mocked(isInternalServiceRequest).mockReturnValue(true);
    vi.mocked(cacheGet).mockResolvedValue({ indices: [] } as any);

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    expect(getSession).not.toHaveBeenCalled();
    expect(readOrIssueAnonymousTrial).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/api/market-pulse/__tests__/route.test.ts`
Expected: FAIL — route currently returns 401 unconditionally for `!isInternal && !session`, with no anonymous-trial fallback, and `checkProAccess` is always called for non-internal requests.

- [ ] **Step 3: Write the implementation**

Replace the full contents of `app/api/market-pulse/route.ts`:

```typescript
import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { getSession, checkProAccess } from '@/modules/user';
import { isInternalServiceRequest } from '@/shared/auth/internal-service';
import { getMarketPulse } from '@/modules/market';
import { cacheGet } from '@/shared/cache/redis-cache';
import { readOrIssueAnonymousTrial, applyAnonymousTrialCookie, type AnonTrialState } from '@/shared/auth/anonymous-trial';

// BUILD 006/007 - baca cache-first (diisi app/api/cron/market-pulse setiap 5 menit).
// Cache-miss (schedule belum sempat jalan, atau Redis belum dikonfigurasi) tetap
// fallback ke komputasi live supaya endpoint tidak pernah gagal keras. Pengunjung
// tanpa akun bisa akses selama trial 7 hari (lihat shared/auth/anonymous-trial.ts) -
// trial aktif melewati gerbang Pro juga, setara akun yang sedang trial.
const CACHE_KEY = 'sahamlens:cache:computed:market-pulse';

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

    const hasPro = isInternal || !!anonTrial || checkProAccess(session);
    if (!hasPro) {
      // 402 (bukan 429) - lihat catatan yang sama di app/api/breakout-radar/route.ts.
      return NextResponse.json({ error: 'Fitur ini butuh akun Pro', code: 'SUBSCRIPTION_REQUIRED' }, { status: 402 });
    }

    const cached = await cacheGet<any>(CACHE_KEY);
    if (cached) {
      const response = NextResponse.json(cached);
      if (anonTrial) await applyAnonymousTrialCookie(response, anonTrial);
      return response;
    }

    const data = await getMarketPulse();
    const response = NextResponse.json(data);
    if (anonTrial) await applyAnonymousTrialCookie(response, anonTrial);
    return response;
  } catch (error: any) {
    console.error('Market pulse API error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/api/market-pulse/__tests__/route.test.ts`
Expected: PASS, all 5 tests green.

- [ ] **Step 5: Run typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/api/market-pulse/route.ts app/api/market-pulse/__tests__/route.test.ts
git commit -m "feat: izinkan trial anonim 7 hari di /api/market-pulse"
```

---

### Task 6: Apply to `/api/breakout-radar` (login + Pro gate, `isInternal` bypass)

**Files:**
- Modify: `app/api/breakout-radar/route.ts`
- Test: `app/api/breakout-radar/__tests__/route.test.ts` (new)

**Interfaces:**
- Consumes: same three from `@/shared/auth/anonymous-trial` as Task 5.

- [ ] **Step 1: Write the failing tests**

Create `app/api/breakout-radar/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/modules/user', () => ({
  getSession: vi.fn(),
  checkProAccess: vi.fn(),
}));
vi.mock('@/shared/auth/internal-service', () => ({
  isInternalServiceRequest: vi.fn(),
}));
vi.mock('@/modules/recommendation', () => ({
  scanBreakouts: vi.fn(),
  scanCrossSignals: vi.fn(),
}));
vi.mock('@/shared/cache/redis-cache', () => ({
  cacheGet: vi.fn(),
}));
vi.mock('@/shared/auth/anonymous-trial', () => ({
  readOrIssueAnonymousTrial: vi.fn(),
  applyAnonymousTrialCookie: vi.fn(),
}));

import { GET } from '../route';
import { getSession, checkProAccess } from '@/modules/user';
import { isInternalServiceRequest } from '@/shared/auth/internal-service';
import { cacheGet } from '@/shared/cache/redis-cache';
import { readOrIssueAnonymousTrial, applyAnonymousTrialCookie } from '@/shared/auth/anonymous-trial';

function makeRequest(): Request {
  return new Request('http://localhost/api/breakout-radar');
}

describe('GET /api/breakout-radar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isInternalServiceRequest).mockReturnValue(false);
  });

  it('menolak dengan 401 kalau tidak ada session DAN trial anonim kadaluarsa', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    vi.mocked(readOrIssueAnonymousTrial).mockResolvedValue({
      firstSeenAt: '2026-01-01T00:00:00.000Z', expiresAt: '2026-01-08T00:00:00.000Z', active: false, isNew: false,
    });

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
  });

  it('trial anonim aktif melewati gerbang Pro juga', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const trial = { firstSeenAt: '2026-08-02T00:00:00.000Z', expiresAt: '2026-08-09T00:00:00.000Z', active: true, isNew: true };
    vi.mocked(readOrIssueAnonymousTrial).mockResolvedValue(trial);
    vi.mocked(cacheGet).mockResolvedValue({ data: [] } as any);

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(checkProAccess).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(json).toEqual({ data: [] });
    expect(applyAnonymousTrialCookie).toHaveBeenCalledWith(expect.anything(), trial);
  });

  it('session valid tapi bukan Pro/trial -> 402, tidak menyentuh logic trial anonim', async () => {
    vi.mocked(getSession).mockResolvedValue({ id: 'u1' } as any);
    vi.mocked(checkProAccess).mockReturnValue(false);

    const res = await GET(makeRequest());

    expect(res.status).toBe(402);
    expect(readOrIssueAnonymousTrial).not.toHaveBeenCalled();
  });

  it('session valid dengan Pro -> 200, tidak menyentuh logic trial anonim', async () => {
    vi.mocked(getSession).mockResolvedValue({ id: 'u1' } as any);
    vi.mocked(checkProAccess).mockReturnValue(true);
    vi.mocked(cacheGet).mockResolvedValue({ data: [] } as any);

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    expect(readOrIssueAnonymousTrial).not.toHaveBeenCalled();
  });

  it('panggilan internal (cron) tetap lolos tanpa menyentuh logic trial anonim', async () => {
    vi.mocked(isInternalServiceRequest).mockReturnValue(true);
    vi.mocked(cacheGet).mockResolvedValue({ data: [] } as any);

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    expect(getSession).not.toHaveBeenCalled();
    expect(readOrIssueAnonymousTrial).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/api/breakout-radar/__tests__/route.test.ts`
Expected: FAIL — same reason as Task 5 (no anonymous-trial fallback exists yet in this route).

- [ ] **Step 3: Write the implementation**

Replace the full contents of `app/api/breakout-radar/route.ts`:

```typescript
import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { getSession, checkProAccess } from '@/modules/user';
import { isInternalServiceRequest } from '@/shared/auth/internal-service';
import { scanBreakouts, scanCrossSignals } from '@/modules/recommendation';
import { cacheGet } from '@/shared/cache/redis-cache';
import { readOrIssueAnonymousTrial, applyAnonymousTrialCookie, type AnonTrialState } from '@/shared/auth/anonymous-trial';

// BUILD 006/007 - baca cache-first (diisi app/api/cron/breakout-scan setiap 5 menit).
// Pengunjung tanpa akun bisa akses selama trial 7 hari (lihat
// shared/auth/anonymous-trial.ts) - trial aktif melewati gerbang Pro juga.
const CACHE_KEY = 'sahamlens:cache:computed:breakout-radar';

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

    const hasPro = isInternal || !!anonTrial || checkProAccess(session);
    if (!hasPro) {
      // 402 (bukan 429) - ini soal akses langganan, bukan rate limit. Pesan lama
      // "Limit analisa harian habis" menyesatkan karena tidak ada penghitung kuota
      // sungguhan untuk fitur ini (temuan H9, API Guideline poin 2 prioritas adopsi).
      return NextResponse.json({ error: 'Fitur ini butuh akun Pro', code: 'SUBSCRIPTION_REQUIRED' }, { status: 402 });
    }

    const cached = await cacheGet<any>(CACHE_KEY);
    if (cached) {
      const response = NextResponse.json(cached);
      if (anonTrial) await applyAnonymousTrialCookie(response, anonTrial);
      return response;
    }

    const [data, crossSignals] = await Promise.all([scanBreakouts(), scanCrossSignals()]);

    const response = NextResponse.json({
      data,
      crossSignals,
      lastUpdate: new Date().toISOString()
    });
    if (anonTrial) await applyAnonymousTrialCookie(response, anonTrial);
    return response;
  } catch (error) {
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/api/breakout-radar/__tests__/route.test.ts`
Expected: PASS, all 5 tests green.

- [ ] **Step 5: Run typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/api/breakout-radar/route.ts app/api/breakout-radar/__tests__/route.test.ts
git commit -m "feat: izinkan trial anonim 7 hari di /api/breakout-radar"
```

---

### Task 7: Apply to `/api/recommendations` (login + Pro gate, no `isInternal`)

**Files:**
- Modify: `app/api/recommendations/route.ts`
- Test: `app/api/recommendations/__tests__/route.test.ts` (new)

**Interfaces:**
- Consumes: same three from `@/shared/auth/anonymous-trial`.

- [ ] **Step 1: Write the failing tests**

Create `app/api/recommendations/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/modules/user', () => ({
  getSession: vi.fn(),
  checkProAccess: vi.fn(),
}));
vi.mock('@/modules/recommendation', () => ({
  analyzeStock: vi.fn(),
}));
vi.mock('@/shared/cache/redis-cache', () => ({
  cacheGet: vi.fn(),
}));
vi.mock('@/shared/auth/anonymous-trial', () => ({
  readOrIssueAnonymousTrial: vi.fn(),
  applyAnonymousTrialCookie: vi.fn(),
}));

import { GET } from '../route';
import { getSession, checkProAccess } from '@/modules/user';
import { analyzeStock } from '@/modules/recommendation';
import { cacheGet } from '@/shared/cache/redis-cache';
import { readOrIssueAnonymousTrial, applyAnonymousTrialCookie } from '@/shared/auth/anonymous-trial';

function makeRequest(): Request {
  return new Request('http://localhost/api/recommendations?symbols=BBCA.JK');
}

describe('GET /api/recommendations', () => {
  beforeEach(() => vi.clearAllMocks());

  it('menolak dengan 401 kalau tidak ada session DAN trial anonim kadaluarsa', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    vi.mocked(readOrIssueAnonymousTrial).mockResolvedValue({
      firstSeenAt: '2026-01-01T00:00:00.000Z', expiresAt: '2026-01-08T00:00:00.000Z', active: false, isNew: false,
    });

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
    expect(analyzeStock).not.toHaveBeenCalled();
  });

  it('trial anonim aktif melewati gerbang Pro juga', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const trial = { firstSeenAt: '2026-08-02T00:00:00.000Z', expiresAt: '2026-08-09T00:00:00.000Z', active: true, isNew: true };
    vi.mocked(readOrIssueAnonymousTrial).mockResolvedValue(trial);
    vi.mocked(cacheGet).mockResolvedValue({ ticker: 'BBCA.JK', consensus: 'HOLD' } as any);

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(checkProAccess).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(json.recommendations).toEqual([{ ticker: 'BBCA.JK', consensus: 'HOLD' }]);
    expect(applyAnonymousTrialCookie).toHaveBeenCalledWith(expect.anything(), trial);
  });

  it('session valid tapi bukan Pro/trial -> 402, tidak menyentuh logic trial anonim', async () => {
    vi.mocked(getSession).mockResolvedValue({ id: 'u1' } as any);
    vi.mocked(checkProAccess).mockReturnValue(false);

    const res = await GET(makeRequest());

    expect(res.status).toBe(402);
    expect(readOrIssueAnonymousTrial).not.toHaveBeenCalled();
  });

  it('session valid dengan Pro -> 200, tidak menyentuh logic trial anonim', async () => {
    vi.mocked(getSession).mockResolvedValue({ id: 'u1' } as any);
    vi.mocked(checkProAccess).mockReturnValue(true);
    vi.mocked(cacheGet).mockResolvedValue({ ticker: 'BBCA.JK' } as any);

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    expect(readOrIssueAnonymousTrial).not.toHaveBeenCalled();
    expect(applyAnonymousTrialCookie).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/api/recommendations/__tests__/route.test.ts`
Expected: FAIL — route currently returns 401 unconditionally when `!session`.

- [ ] **Step 3: Write the implementation**

Replace the full contents of `app/api/recommendations/route.ts`:

```typescript
import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { getSession, checkProAccess } from '@/modules/user';
import { analyzeStock } from '@/modules/recommendation';
import { cacheGet } from '@/shared/cache/redis-cache';
import { readOrIssueAnonymousTrial, applyAnonymousTrialCookie, type AnonTrialState } from '@/shared/auth/anonymous-trial';

// BUILD 006/007 - simbol yang rutin di-scan app/api/cron/recommendation-scan dibaca
// cache-first (per simbol); simbol lain di luar daftar itu tetap dihitung live
// seperti sebelumnya - tidak ada regresi untuk simbol yang belum pernah di-cache.
// Pengunjung tanpa akun bisa akses selama trial 7 hari (lihat
// shared/auth/anonymous-trial.ts) - trial aktif melewati gerbang Pro juga.
function cacheKeyFor(symbol: string): string {
  return `sahamlens:cache:computed:recommendation:${symbol}`;
}

export async function GET(request: Request) {
  try {
    const session = await getSession();

    let anonTrial: AnonTrialState | null = null;
    if (!session) {
      anonTrial = await readOrIssueAnonymousTrial();
      if (!anonTrial.active) {
        return NextResponse.json({ error: 'Belum login' }, { status: 401 });
      }
    }

    const hasPro = !!anonTrial || checkProAccess(session);
    if (!hasPro) {
      // 402 (bukan 429) - lihat catatan yang sama di app/api/breakout-radar/route.ts.
      return NextResponse.json({ error: 'Fitur ini butuh akun Pro', code: 'SUBSCRIPTION_REQUIRED' }, { status: 402 });
    }

    const url = new URL(request.url);
    const symbolsParam = url.searchParams.get('symbols');
    const symbols = symbolsParam ? symbolsParam.split(',') : ['BBCA.JK'];

    const results = [];
    const chunkSize = 5;
    for (let i = 0; i < symbols.length; i += chunkSize) {
      const chunk = symbols.slice(i, i + chunkSize);
      const chunkResults = await Promise.all(
        chunk.map(async (t) => {
          const cached = await cacheGet<any>(cacheKeyFor(t));
          if (cached) return cached;
          return analyzeStock(t);
        })
      );
      results.push(...chunkResults.filter(Boolean));
    }

    const response = NextResponse.json({ recommendations: results });
    if (anonTrial) await applyAnonymousTrialCookie(response, anonTrial);
    return response;
  } catch (error: any) {
    console.error('Recommendations API error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/api/recommendations/__tests__/route.test.ts`
Expected: PASS, all 4 tests green.

- [ ] **Step 5: Run typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/api/recommendations/route.ts app/api/recommendations/__tests__/route.test.ts
git commit -m "feat: izinkan trial anonim 7 hari di /api/recommendations"
```

---

### Task 8: Apply to `/api/agents/orchestrator` (login + Pro gate, no `isInternal`)

**Files:**
- Modify: `app/api/agents/orchestrator/route.ts`
- Test: `app/api/agents/orchestrator/__tests__/route.test.ts` (new)

**Interfaces:**
- Consumes: same three from `@/shared/auth/anonymous-trial`.

- [ ] **Step 1: Write the failing tests**

Create `app/api/agents/orchestrator/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/modules/user', () => ({
  getSession: vi.fn(),
  checkProAccess: vi.fn(),
}));
vi.mock('@/modules/ai', () => ({
  runMultiAgentOrchestrator: vi.fn(),
}));
vi.mock('@/shared/cache/redis-cache', () => ({
  getOrCompute: vi.fn(),
}));
vi.mock('@/shared/auth/anonymous-trial', () => ({
  readOrIssueAnonymousTrial: vi.fn(),
  applyAnonymousTrialCookie: vi.fn(),
}));

import { POST } from '../route';
import { getSession, checkProAccess } from '@/modules/user';
import { getOrCompute } from '@/shared/cache/redis-cache';
import { readOrIssueAnonymousTrial, applyAnonymousTrialCookie } from '@/shared/auth/anonymous-trial';

function makeRequest(body: unknown = { ticker: 'BBCA' }): Request {
  return new Request('http://localhost/api/agents/orchestrator', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /api/agents/orchestrator', () => {
  beforeEach(() => vi.clearAllMocks());

  it('menolak dengan 401 kalau tidak ada session DAN trial anonim kadaluarsa', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    vi.mocked(readOrIssueAnonymousTrial).mockResolvedValue({
      firstSeenAt: '2026-01-01T00:00:00.000Z', expiresAt: '2026-01-08T00:00:00.000Z', active: false, isNew: false,
    });

    const res = await POST(makeRequest());

    expect(res.status).toBe(401);
    expect(getOrCompute).not.toHaveBeenCalled();
  });

  it('trial anonim aktif melewati gerbang Pro juga', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const trial = { firstSeenAt: '2026-08-02T00:00:00.000Z', expiresAt: '2026-08-09T00:00:00.000Z', active: true, isNew: true };
    vi.mocked(readOrIssueAnonymousTrial).mockResolvedValue(trial);
    vi.mocked(getOrCompute).mockResolvedValue({ quant: { decision: 'BUY' } } as any);

    const res = await POST(makeRequest());
    const json = await res.json();

    expect(checkProAccess).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(json).toEqual({ quant: { decision: 'BUY' } });
    expect(applyAnonymousTrialCookie).toHaveBeenCalledWith(expect.anything(), trial);
  });

  it('session valid tapi bukan Pro/trial -> 402, tidak menyentuh logic trial anonim', async () => {
    vi.mocked(getSession).mockResolvedValue({ id: 'u1' } as any);
    vi.mocked(checkProAccess).mockReturnValue(false);

    const res = await POST(makeRequest());

    expect(res.status).toBe(402);
    expect(readOrIssueAnonymousTrial).not.toHaveBeenCalled();
  });

  it('session valid dengan Pro -> 200, tidak menyentuh logic trial anonim', async () => {
    vi.mocked(getSession).mockResolvedValue({ id: 'u1' } as any);
    vi.mocked(checkProAccess).mockReturnValue(true);
    vi.mocked(getOrCompute).mockResolvedValue({ quant: {} } as any);

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(readOrIssueAnonymousTrial).not.toHaveBeenCalled();
  });

  it('tanpa ticker -> 400, bahkan dengan trial anonim aktif', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    vi.mocked(readOrIssueAnonymousTrial).mockResolvedValue({
      firstSeenAt: '2026-08-02T00:00:00.000Z', expiresAt: '2026-08-09T00:00:00.000Z', active: true, isNew: true,
    });

    const res = await POST(makeRequest({}));

    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/api/agents/orchestrator/__tests__/route.test.ts`
Expected: FAIL — route currently returns 401 unconditionally when `!session`.

- [ ] **Step 3: Write the implementation**

Replace the full contents of `app/api/agents/orchestrator/route.ts`:

```typescript
import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { getSession, checkProAccess } from '@/modules/user';
import { runMultiAgentOrchestrator } from '@/modules/ai';
import { getOrCompute } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC } from '@/shared/cache/ttl-policy';
import { readOrIssueAnonymousTrial, applyAnonymousTrialCookie, type AnonTrialState } from '@/shared/auth/anonymous-trial';

// BUILD 004 (AI Architecture) - endpoint ini SEBELUMNYA TIDAK PERNAH ADA.
// app/multi-agent/page.tsx sudah lama memanggil POST /api/agents/orchestrator
// dan selalu dapat 404 diam-diam (agentRes.ok === false, halaman stuck di
// "WAITING..."/skor 0) - baru terlihat setelah audit BUILD 001. Gerbang login+Pro
// disamakan dengan fitur AI/analisa premium lain (app/api/council, app/api/stock).
// Pengunjung tanpa akun bisa akses selama trial 7 hari (lihat
// shared/auth/anonymous-trial.ts) - trial aktif melewati gerbang Pro juga.
//
// BUILD 007 (Cache Layer) - getOrCompute (single-flight), bukan cacheGet/cacheSet
// manual: orkestrator ini menjalankan Yahoo Finance x2 + DCF + (opsional) Gemini
// sekaligus untuk satu simbol - kalau beberapa request cache-miss datang bersamaan
// untuk simbol yang sama, tanpa lock ini semuanya akan menjalankan komputasi mahal
// itu secara paralel alih-alih satu saja.

export async function POST(request: Request) {
  try {
    const session = await getSession();

    let anonTrial: AnonTrialState | null = null;
    if (!session) {
      anonTrial = await readOrIssueAnonymousTrial();
      if (!anonTrial.active) {
        return NextResponse.json({ error: 'Belum login' }, { status: 401 });
      }
    }

    const hasPro = !!anonTrial || checkProAccess(session);
    if (!hasPro) {
      return NextResponse.json({ error: 'Fitur ini butuh akun Pro', code: 'SUBSCRIPTION_REQUIRED' }, { status: 402 });
    }

    const body = await request.json().catch(() => ({}));
    const ticker = typeof body.ticker === 'string' && body.ticker.trim() ? body.ticker.trim() : null;
    if (!ticker) {
      return NextResponse.json({ error: 'ticker wajib diisi' }, { status: 400 });
    }

    const cacheKey = `sahamlens:cache:computed:orchestrator:${ticker.toUpperCase()}`;
    const result = await getOrCompute(cacheKey, CACHE_TTL_SEC.TECHNICAL, () => runMultiAgentOrchestrator(ticker));
    const response = NextResponse.json(result);
    if (anonTrial) await applyAnonymousTrialCookie(response, anonTrial);
    return response;
  } catch (error: any) {
    console.error('Orchestrator error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/api/agents/orchestrator/__tests__/route.test.ts`
Expected: PASS, all 5 tests green.

- [ ] **Step 5: Run typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/api/agents/orchestrator/route.ts app/api/agents/orchestrator/__tests__/route.test.ts
git commit -m "feat: izinkan trial anonim 7 hari di /api/agents/orchestrator"
```

---

### Task 9: Apply to `/api/council` (login + Pro gate, 4 response sites, no `isInternal`)

**Files:**
- Modify: `app/api/council/route.ts`
- Test: `app/api/council/__tests__/route.test.ts` (new)

**Interfaces:**
- Consumes: same three from `@/shared/auth/anonymous-trial`.

This route has 4 separate `NextResponse.json(...)` return points on the success path (cache hit, no-technical-data fallback, Gemini success, Gemini-failure fallback) — every one of them must get the trial cookie attached when `anonTrial` is set. To keep the test fast and independent of Yahoo Finance/Gemini, tests exercise the **cache-hit** path (`getCouncilCache` returns truthy) so the route returns early before touching any of the heavier calls.

- [ ] **Step 1: Write the failing tests**

Create `app/api/council/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/modules/user', () => ({
  getSession: vi.fn(),
  checkProAccess: vi.fn(),
}));
vi.mock('@/modules/ai', () => ({
  getCouncil: vi.fn(),
  runLocalCouncil: vi.fn(),
  getCouncilCache: vi.fn(),
}));
vi.mock('@/modules/technical', () => ({
  analyzeEma: vi.fn(),
  analyzeRsi: vi.fn(),
  analyzeMacd: vi.fn(),
  analyzeVolatility: vi.fn(),
  fetchYahooHistory: vi.fn(),
  calculateScore: vi.fn(),
}));
vi.mock('@/modules/market', () => ({
  computeDailyNetFlow: vi.fn(),
  computeAccumulationStreak: vi.fn(),
}));
vi.mock('yahoo-finance2', () => ({
  default: vi.fn().mockImplementation(() => ({
    quoteSummary: vi.fn().mockResolvedValue({}),
  })),
}));
vi.mock('@/shared/auth/anonymous-trial', () => ({
  readOrIssueAnonymousTrial: vi.fn(),
  applyAnonymousTrialCookie: vi.fn(),
}));

import { GET } from '../route';
import { getSession, checkProAccess } from '@/modules/user';
import { getCouncilCache } from '@/modules/ai';
import { readOrIssueAnonymousTrial, applyAnonymousTrialCookie } from '@/shared/auth/anonymous-trial';

function makeRequest(): Request {
  return new Request('http://localhost/api/council?symbol=BBCA.JK');
}

describe('GET /api/council', () => {
  beforeEach(() => vi.clearAllMocks());

  it('menolak dengan 401 kalau tidak ada session DAN trial anonim kadaluarsa', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    vi.mocked(readOrIssueAnonymousTrial).mockResolvedValue({
      firstSeenAt: '2026-01-01T00:00:00.000Z', expiresAt: '2026-01-08T00:00:00.000Z', active: false, isNew: false,
    });

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
  });

  it('trial anonim aktif melewati gerbang Pro juga (dapat cached council), dan menempelkan cookie baru', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const trial = { firstSeenAt: '2026-08-02T00:00:00.000Z', expiresAt: '2026-08-09T00:00:00.000Z', active: true, isNew: true };
    vi.mocked(readOrIssueAnonymousTrial).mockResolvedValue(trial);
    vi.mocked(getCouncilCache).mockResolvedValue({ summary: 'stub cached council' } as any);

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(checkProAccess).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(json).toEqual({ summary: 'stub cached council' });
    expect(applyAnonymousTrialCookie).toHaveBeenCalledWith(expect.anything(), trial);
  });

  it('session valid tapi bukan Pro/trial -> 402, tidak menyentuh logic trial anonim', async () => {
    vi.mocked(getSession).mockResolvedValue({ id: 'u1' } as any);
    vi.mocked(checkProAccess).mockReturnValue(false);

    const res = await GET(makeRequest());

    expect(res.status).toBe(402);
    expect(readOrIssueAnonymousTrial).not.toHaveBeenCalled();
  });

  it('session valid dengan Pro -> 200 (cached), tidak menyentuh logic trial anonim', async () => {
    vi.mocked(getSession).mockResolvedValue({ id: 'u1' } as any);
    vi.mocked(checkProAccess).mockReturnValue(true);
    vi.mocked(getCouncilCache).mockResolvedValue({ summary: 'stub' } as any);

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    expect(readOrIssueAnonymousTrial).not.toHaveBeenCalled();
    expect(applyAnonymousTrialCookie).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/api/council/__tests__/route.test.ts`
Expected: FAIL — route currently returns 401 unconditionally when `!session`.

- [ ] **Step 3: Write the implementation**

Replace the full contents of `app/api/council/route.ts`:

```typescript
import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import YahooFinanceClass from 'yahoo-finance2';
import { getCouncil, runLocalCouncil, getCouncilCache } from '@/modules/ai';
import { getSession, checkProAccess } from '@/modules/user';
import { readOrIssueAnonymousTrial, applyAnonymousTrialCookie, type AnonTrialState } from '@/shared/auth/anonymous-trial';

const yahooFinance = new (YahooFinanceClass as any)({ suppressNotices: ['yahooSurvey'] });

// Minimal technical analyzer functions from existing codebase
import {
  analyzeEma,
  analyzeRsi,
  analyzeMacd,
  analyzeVolatility,
  fetchYahooHistory,
  calculateScore,
} from '@/modules/technical';
import { computeDailyNetFlow, computeAccumulationStreak } from '@/modules/market';

// AUDIT 2026-08-01: RSI/EMA sebelumnya diisi langsung dari analyzer.value ("RSI: 65.23",
// bukan angka) - typeof check di council.service.ts (butuh number) gagal diam-diam dan
// RSI selalu terkirim sebagai "0" ke Council AI, dan rsiSignal di local-council.service.ts
// (perbandingan numerik terhadap string) selalu jatuh ke "HOLD". Sekarang di-parse jadi
// angka mentah, sama seperti pola yang sudah dipakai app/api/stock/[ticker]/route.ts.
function parseNumberAfter(value: string | undefined, label: string): number {
  if (!value) return 0;
  const match = value.match(new RegExp(`${label}:\\s*([\\-\\d.]+)`));
  return match ? parseFloat(match[1]) : 0;
}

// BUILD 009 (Performance) - fetch+parse OHLC dipindah ke modules/technical/service/
// yahoo-history.service.ts (sebelumnya diduplikasi persis di sini dan di
// modules/ai/service/orchestrator.service.ts). Logika analyzer/MA khusus kebutuhan
// council DIPERLUAS 2026-08-01 (audit dummy-data) - lihat parseNumberAfter di atas
// dan catatan "Skor Komposit" di GET handler untuk apa yang berubah.
async function getTechnicalData(ticker: string) {
  try {
    const chartData = await fetchYahooHistory(ticker, '1y');
    if (!chartData) return null;
    const { history, currentPrice } = chartData;

    const closes = history.map(h => h.Close);
    const emaData = analyzeEma(history, currentPrice);
    const rsiData = analyzeRsi(history, currentPrice);
    const macdData = analyzeMacd(history, currentPrice);
    const volatilityData = analyzeVolatility(history, currentPrice);

    const ma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, closes.length);
    const ma50 = closes.slice(-50).reduce((a, b) => a + b, 0) / Math.min(50, closes.length);
    const ma200 = closes.slice(-200).reduce((a, b) => a + b, 0) / Math.min(200, closes.length);

    let support = Infinity;
    let resistance = 0;
    history.slice(-20).forEach(h => {
      if (h.Low < support) support = h.Low;
      if (h.High > resistance) resistance = h.High;
    });
    if (support === Infinity) support = 0;

    const volToday = history[history.length - 1]?.Volume || 0;
    const volAvg20 = history.slice(-20).reduce((s, h) => s + h.Volume, 0) / Math.min(20, history.length);

    // Foreign Flow (proxy dari harga+volume real, bukan data broker resmi) - logika
    // sama dengan app/api/stock/[ticker] dan modules/ai orchestrator, satu sumber
    // kebenaran (modules/market/service/foreign-flow-proxy.ts).
    const flowHistory = history.map((h) => ({ date: h.Date.split('T')[0], close: h.Close, volume: h.Volume }));
    const dailyFlow = computeDailyNetFlow(flowHistory).slice(-20);
    const buyStreak = computeAccumulationStreak(dailyFlow);
    let sellStreak = 0;
    for (let i = dailyFlow.length - 1; i >= 0; i--) {
      if (dailyFlow[i].netValueBillion < 0) sellStreak++;
      else break;
    }
    const last3 = dailyFlow.slice(-3);
    const isAccumulation3D = last3.length === 3 && last3.every((d) => d.netValueBillion > 0);
    const isDistribution3D = last3.length === 3 && last3.every((d) => d.netValueBillion < 0);
    let foreignFlowStatus: 'STRONG NET BUY' | 'NET BUY' | 'NEUTRAL' | 'NET SELL' | 'STRONG NET SELL' = 'NEUTRAL';
    if (isAccumulation3D) foreignFlowStatus = buyStreak >= 4 ? 'STRONG NET BUY' : 'NET BUY';
    else if (isDistribution3D) foreignFlowStatus = sellStreak >= 4 ? 'STRONG NET SELL' : 'NET SELL';

    return {
      price: currentPrice,
      ma20,
      ma50,
      ma200,
      ema: parseNumberAfter(emaData?.value, 'EMA20'),
      rsi: parseNumberAfter(rsiData?.value, 'RSI'),
      macdLine: parseNumberAfter(macdData?.value, 'MACD'),
      macdSignal: parseNumberAfter(macdData?.value, 'Sig'),
      macdHist: parseNumberAfter(macdData?.value, 'Hist'),
      atr: parseNumberAfter(volatilityData?.value, 'ATR'),
      support,
      resistance,
      volToday,
      volAvg20,
      volRatio: volAvg20 > 0 ? volToday / volAvg20 : 1,
      foreignFlow: foreignFlowStatus,
      consecutiveBuyDays: buyStreak,
      consecutiveSellDays: sellStreak,
    };
  } catch (e) {
    return null;
  }
}

// Proxy freshness (2026-08-01) - Council sebelumnya cache per KALENDER HARI penuh (24 jam),
// jadi kalau ada laporan keuangan baru dirilis emiten hari yang sama, Council tetap
// menyajikan analisa basi sampai lewat tengah malam. Tidak ada feed/webhook resmi BEI
// gratis untuk trigger instan, jadi solusinya proxy jujur: ambil snapshot ringan
// "kuartal terakhir yang dilaporkan" dari Yahoo Finance (mostRecentQuarter) - begitu
// Yahoo mendeteksi kuartal baru (yang biasanya update dalam 1-2 hari setelah rilis resmi
// emiten), fingerprint ini berubah dan cache lama otomatis dianggap basi & dihitung ulang,
// TANPA menunggu hari kalender berikutnya.
interface FundamentalSnapshot {
  mostRecentQuarter: string | null;
  trailingEps: number | null;
  per: number | null;
  pbv: number | null;
  roe: number | null;
  der: number | null;
  currentRatio: number | null;
  revenueGrowth: number | null;
}

async function getFundamentalSnapshot(ticker: string): Promise<FundamentalSnapshot | null> {
  try {
    const quoteSummary = await yahooFinance.quoteSummary(ticker, {
      modules: ['defaultKeyStatistics', 'financialData', 'summaryDetail'],
    });
    const mrq = quoteSummary?.defaultKeyStatistics?.mostRecentQuarter;
    return {
      mostRecentQuarter: mrq ? new Date(mrq).toISOString().split('T')[0] : null,
      trailingEps: quoteSummary?.defaultKeyStatistics?.trailingEps ?? null,
      per: quoteSummary?.summaryDetail?.trailingPE ?? null,
      pbv: quoteSummary?.defaultKeyStatistics?.priceToBook ?? null,
      roe: quoteSummary?.financialData?.returnOnEquity != null ? quoteSummary.financialData.returnOnEquity * 100 : null,
      der: quoteSummary?.financialData?.debtToEquity != null ? quoteSummary.financialData.debtToEquity / 100 : null,
      currentRatio: quoteSummary?.financialData?.currentRatio ?? null,
      revenueGrowth: quoteSummary?.financialData?.revenueGrowth != null ? quoteSummary.financialData.revenueGrowth * 100 : null,
    };
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const symbol = url.searchParams.get('symbol') || 'DGWG.JK';

    // Check limits - pengunjung tanpa akun bisa akses selama trial 7 hari (lihat
    // shared/auth/anonymous-trial.ts) - trial aktif melewati gerbang Pro juga.
    const session = await getSession();
    let anonTrial: AnonTrialState | null = null;
    if (!session) {
      anonTrial = await readOrIssueAnonymousTrial();
      if (!anonTrial.active) {
        return NextResponse.json({ error: 'Belum login' }, { status: 401 });
      }
    }

    const hasPro = !!anonTrial || checkProAccess(session);
    if (!hasPro) {
      // 402 (bukan 429) - lihat catatan yang sama di app/api/breakout-radar/route.ts.
      return NextResponse.json({ error: 'Fitur ini butuh akun Pro', code: 'SUBSCRIPTION_REQUIRED' }, { status: 402 });
    }

    const today = new Date().toISOString().split('T')[0];

    // Snapshot fundamental ringan (lihat getFundamentalSnapshot) - dipakai membangun
    // cache key, BUKAN cuma tanggal kalender, supaya laporan keuangan baru langsung
    // membuat cache lama basi tanpa menunggu hari berikutnya.
    const fundamentalSnapshot = await getFundamentalSnapshot(symbol);
    const cacheKey = `${today}:${fundamentalSnapshot?.mostRecentQuarter || 'na'}`;

    // Check Cache First
    const cached = await getCouncilCache(symbol, cacheKey);
    if (cached) {
      const response = NextResponse.json(cached);
      if (anonTrial) await applyAnonymousTrialCookie(response, anonTrial);
      return response;
    }

    // Ambil data teknikal dari yfinance
    const technicalData = await getTechnicalData(symbol);
    if (!technicalData) {
      const response = NextResponse.json(runLocalCouncil(symbol, { price: 0, fundamentalSnapshot }), { status: 200 });
      if (anonTrial) await applyAnonymousTrialCookie(response, anonTrial);
      return response;
    }
    (technicalData as any).fundamentalSnapshot = fundamentalSnapshot;

    // Skor komposit REAL (bukan mock) - reuse scoring engine yang sama dipakai
    // Technical Analyzer (modules/technical/service/scoring.service.ts), dari data
    // teknikal+fundamental+flow yang barusan dihitung di atas.
    const scoringResult = calculateScore(
      symbol,
      {
        currentPrice: technicalData.price,
        ma20: technicalData.ma20,
        ma50: technicalData.ma50,
        ma200: technicalData.ma200,
        rsi: technicalData.rsi,
        macdHist: technicalData.macdHist,
        macdLine: technicalData.macdLine,
        macdSignal: technicalData.macdSignal,
        volToday: technicalData.volToday,
        volAvg20: technicalData.volAvg20,
      },
      {
        per: fundamentalSnapshot?.per ?? null,
        pbv: fundamentalSnapshot?.pbv ?? null,
        roe: fundamentalSnapshot?.roe ?? null,
        der: fundamentalSnapshot?.der ?? null,
        currentRatio: fundamentalSnapshot?.currentRatio ?? null,
        revenueGrowth: fundamentalSnapshot?.revenueGrowth ?? null,
      },
      {
        foreignFlow: technicalData.foreignFlow,
        consecutiveBuyDays: technicalData.consecutiveBuyDays,
        consecutiveSellDays: technicalData.consecutiveSellDays,
        volRatio: technicalData.volRatio,
      }
    );
    (technicalData as any).score = scoringResult.total_score;

    try {
      // Run Gemini API via getCouncil (handles caching and fallback internally)
      const council = await getCouncil(symbol, technicalData, cacheKey);
      const response = NextResponse.json(council);
      if (anonTrial) await applyAnonymousTrialCookie(response, anonTrial);
      return response;
    } catch (e) {
      console.warn("Gemini API failed, using local fallback", e);
      const response = NextResponse.json(runLocalCouncil(symbol, technicalData));
      if (anonTrial) await applyAnonymousTrialCookie(response, anonTrial);
      return response;
    }
  } catch (e: any) {
    console.error('Council API error:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/api/council/__tests__/route.test.ts`
Expected: PASS, all 4 tests green.

- [ ] **Step 5: Run typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 6: Run the full suite once (final regression check for this plan)**

Run: `npx vitest run`
Expected: all test files pass. Running total: 79 (Task 1) + 6 (Task 2) + 4 (Task 3) + 4 new in Task 4 + 5 (Task 5) + 5 (Task 6) + 4 (Task 7) + 5 (Task 8) + 4 (Task 9) = 116 tests, all green.

- [ ] **Step 7: Run production build**

Run: `npm run build`
Expected: build succeeds, all routes compile (the `DYNAMIC_SERVER_USAGE` messages printed for API routes using `cookies()`/`headers()` during static-generation attempts are expected framework noise, not failures — same as observed for every dynamic route in this app already).

- [ ] **Step 8: Commit**

```bash
git add app/api/council/route.ts app/api/council/__tests__/route.test.ts
git commit -m "feat: izinkan trial anonim 7 hari di /api/council"
```
