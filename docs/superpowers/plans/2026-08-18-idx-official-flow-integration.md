# Integrasi 100% Data Resmi BEI (Real Foreign Flow + EOD Broker Summary) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mengganti proxy Chaikin Money Flow (Yahoo) pada `/api/flow/[ticker]` dengan Net Foreign Buy/Sell resmi BEI, dan menambah sinkronisasi EOD Broker Summary resmi BEI.

**Architecture:** Dua skrip Python `curl_cffi` (impersonate chrome124) menembus Cloudflare BEI dan menulis artefak on-disk (`data/foreign-flow/{TICKER}.json`, `data/broker-summary/broker_{YYYY-MM-DD}.csv`). Node/Next tidak pernah memanggil idx.co.id langsung (fetch biasa kena 403). Service TypeScript baru membaca artefak itu, route API memakainya sebagai PRIMARY dan proxy CMF Yahoo lama sebagai FALLBACK berlabel eksplisit, komponen UI menampilkan sumbernya apa adanya.

**Tech Stack:** Python 3 + curl_cffi + pandas; Next.js App Router; TypeScript; Vitest.

**Spec:** MASTER INSTRUCTION pengguna (2026-08-18) — dikutip inline pada setiap task.

## Global Constraints

- Zero Dummy Policy: dilarang `Math.random()`, `seedRandom`, mock, estimasi sintesis. Semua angka 100% dari API resmi BEI.
- Tanpa akun/scraping privat. Hanya endpoint publik `https://www.idx.co.id/primary/...`.
- Bypass Cloudflare BEI WAJIB via Python `curl_cffi` `requests.Session(impersonate="chrome124")`.
- Setiap respons API wajib menyebut `source` sejujurnya (`IDX_OFFICIAL_API` vs fallback).
- Tidak ada migrasi destruktif pada skema broker summary (lihat header `modules/broker-flow/index.ts`).
- Repo target: `c:/Users/cseon/Documents/GitHub/sahamlens` (bukan cwd IDX-Scrapper-master).

## Temuan Bentuk Data (mengikat desain)

1. `GetTradingInfoSS` mengembalikan array pada key **`replies`** (bukan `data`), field `ForeignBuy`/`ForeignSell` adalah **volume lembar**, `Value` adalah nilai transaksi total pasar hari itu.
2. `GetBrokerSummary` mengembalikan agregat **seluruh pasar per broker** — `IDFirm`, `FirmName`, `Volume`, `Value`, `Frequency`. TIDAK ada kolom ticker dan TIDAK ada pemisahan buy/sell.
   Tabel `broker_summary_daily` mensyaratkan `ticker NOT NULL` + `buy_value`/`sell_value`. Karena itu `importBrokerSummaryCsv()` **tidak bisa** diberi makan endpoint ini tanpa memalsukan ticker/pemecahan buy-sell (melanggar Zero Dummy). Spec memberi alternatif eksplisit ("**atau** menyimpan file CSV harian ke `data/broker-summary/broker_{YYYY-MM-DD}.csv`") — jalur CSV itulah yang diambil.

## File Structure

- Create `scripts/sync-idx-foreign-flow.py` — ingestion Aliran A.
- Create `scripts/sync-idx-broker-summary.py` — ingestion Aliran B.
- Create `modules/market/service/idx-foreign-flow.service.ts` — baca + analitik foreign flow.
- Create `modules/market/service/__tests__/idx-foreign-flow.service.test.ts` — test unit.
- Modify `modules/market/index.ts` — ekspor barrel.
- Modify `app/api/flow/[ticker]/route.ts` — IDX primary, Yahoo proxy fallback.
- Modify `components/BandarFlowPro.tsx` — UI badge resmi, kartu ringkasan, bar komposisi, streak, grafik 20 hari + garis harga.

---

### Task 1: Skrip ingestion foreign flow

**Files:**
- Create: `scripts/sync-idx-foreign-flow.py`
- Output: `data/foreign-flow/{TICKER}.json`

**Interfaces:**
- Produces: file JSON `{ ticker, updatedAt, source: "IDX_OFFICIAL_API", count, history: [{date, close, high, low, open, volume, value, frequency, foreignBuy, foreignSell, netForeignVolume, netForeignValueBillion}] }` urut tanggal menaik.

- [ ] Step 1: Tulis skrip (argumen: daftar ticker, `--universe lq45|all`, `--length N`, `--out DIR`).
- [ ] Step 2: Jalankan `python scripts/sync-idx-foreign-flow.py BBCA --length 5` dan verifikasi angka cocok dengan respons mentah endpoint.
- [ ] Step 3: Jalankan untuk universe LQ45.

### Task 2: Skrip ingestion broker summary

**Files:**
- Create: `scripts/sync-idx-broker-summary.py`
- Output: `data/broker-summary/broker_{YYYY-MM-DD}.csv`

**Interfaces:**
- Produces: CSV header `date,broker_code,broker_name,volume,value,frequency` (angka polos, tanpa "Rp"/koma ribuan) diurutkan `value` desc.

- [ ] Step 1: Tulis skrip (argumen `--date YYYY-MM-DD`, default mundur cari hari bursa terakhir maksimal 7 hari).
- [ ] Step 2: Jalankan untuk tanggal bursa terakhir, verifikasi jumlah broker dan total nilai.

### Task 3: Service `idx-foreign-flow.service.ts` (TDD)

**Files:**
- Create: `modules/market/service/idx-foreign-flow.service.ts`
- Test: `modules/market/service/__tests__/idx-foreign-flow.service.test.ts`
- Modify: `modules/market/index.ts`

**Interfaces:**
- Produces:
  - `type IdxForeignFlowPoint = { date: string; close: number; volume: number; foreignBuy: number; foreignSell: number; netForeignVolume: number; netForeignValueBillion: number }`
  - `getRealForeignFlow(ticker: string, days?: number): IdxForeignFlowSeries | null`
  - `calculateAccumulationStreak(history: IdxForeignFlowPoint[]): number`
  - `getForeignParticipationRatio(buy: number, sell: number, totalVol: number): number | null`
  - `summarizeForeignFlow(history: IdxForeignFlowPoint[]): IdxForeignFlowSummary`

- [ ] Step 1: Tulis test gagal untuk streak, participation ratio, dan summary.
- [ ] Step 2: `npx vitest run modules/market/service/__tests__/idx-foreign-flow.service.test.ts` — harus FAIL.
- [ ] Step 3: Implementasi minimal.
- [ ] Step 4: Test PASS.

### Task 4: API route `/api/flow/[ticker]`

**Files:**
- Modify: `app/api/flow/[ticker]/route.ts`

**Interfaces:**
- Consumes: Task 3.
- Produces: JSON `{ ticker, source, summary{status, netTodayBillion, netTodayLot, net5DBillion, accumulationStreak, foreignBuyVolume, foreignSellVolume, foreignParticipationPct, ...}, foreignFlow20D[] }`.

- [ ] Step 1: Pakai IDX jika file ada; jika tidak, fallback proxy Yahoo lama dengan `source: "YAHOO_CMF_PROXY"`.
- [ ] Step 2: Verifikasi respons lokal.

### Task 5: UI `BandarFlowPro.tsx`

**Files:**
- Modify: `components/BandarFlowPro.tsx`

- [ ] Step 1: Badge `🌐 Real Foreign Flow (Resmi BEI)` hanya saat `source === 'IDX_OFFICIAL_API'`.
- [ ] Step 2: Kartu Net hari ini (Miliar Rp + lot), Net 5 hari, bar komposisi buy/sell, streak akumulasi.
- [ ] Step 3: Grafik batang 20 hari + garis harga penutupan.
- [ ] Step 4: Pertahankan tampilan lama saat mode fallback.

### Task 6: Verifikasi

- [ ] `npx tsc --noEmit`
- [ ] `npx vitest run` untuk test terkait
- [ ] Cek `/admin/broker-summary` tidak error
