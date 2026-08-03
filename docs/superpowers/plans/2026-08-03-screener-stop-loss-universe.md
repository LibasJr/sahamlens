# Screener: Stop Loss & Universe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mengganti kolom stop loss Screener yang terbukti merugikan dengan informasi volatilitas ATR, dan menyaring universe sehingga saham tidak likuid tidak bisa direkomendasikan.

**Architecture:** `fetchScreenerUniverse()` mengambil gabungan dua universe (114 saham) dan menyimpannya di satu cache. `rankScreener()` menyaring ke 109 emiten tersaring sebelum memberi peringkat, sementara `/api/compare` memakai seluruh 114. ATR 14 dihitung dari OHLCV yang sudah diambil untuk Bandarmology, tanpa request tambahan.

**Tech Stack:** Next.js 14 App Router, TypeScript, Vitest, yahoo-finance2, Upstash Redis.

## Global Constraints

- Semua teks yang tampil ke pengguna berbahasa Indonesia.
- `SCREENER_UNIVERSE` **tidak boleh diubah isinya** — Corporate Calendar (`corporate-calendar.service.ts`) dan Dividend (`dividend-plan.service.ts`) memakainya dan berada di luar cakupan.
- Bobot profil risiko di `scoreStock()` **tidak boleh disentuh**.
- Konstanta `stopLossPct` (0,05 / 0,08 / 0,12) dihapus seluruhnya; tidak diganti angka stop lain.
- `modules/backtest/**`, `app/backtest/**`, dan seluruh jalur AI Pick tidak boleh berubah.
- Test ditulis lebih dulu dan harus dilihat gagal sebelum implementasi.
- Perintah test: `npx vitest run <path>`. Typecheck: `npx tsc --noEmit`. Keduanya dijalankan **terpisah, tidak paralel** — menjalankan bersamaan menyebabkan keduanya berebut cache Vite dan gagal palsu.

---

## File Structure

| File | Tanggung jawab |
|---|---|
| `modules/market/service/screener.service.ts` | **Modify.** Tambah `atr14Pct()` + `filterCurated()`, ubah `fetchScreenerUniverse()` jadi union, hapus `stopLossPct`. |
| `modules/market/service/__tests__/screener.service.test.ts` | **Create.** Test untuk kedua fungsi murni + kontrak `rankScreener()`. |
| `app/screener/page.tsx` | **Modify.** Kolom "Entry / StopLoss" → "Entry" + "Volatilitas Harian", tambah keterangan. |

Tiga task: fungsi murni dulu (bisa diuji tanpa jaringan), lalu penyambungannya ke alur data, lalu tampilan.

---

### Task 1: Fungsi murni ATR dan penyaringan

**Files:**
- Modify: `modules/market/service/screener.service.ts`
- Test: `modules/market/service/__tests__/screener.service.test.ts`

**Interfaces:**
- Consumes: `AI_PICK_UNIVERSE: string[]` dari `modules/market/constants/ai-pick-universe` (sudah ada, 109 ticker format `'BBCA.JK'`).
- Produces:
  - `atr14Pct(ohlcv: { high: number; low: number; close: number }[]): number | null`
  - `filterCurated<T extends { ticker: string }>(stocks: T[]): T[]`

- [ ] **Step 1: Tulis test yang gagal**

Buat file baru `modules/market/service/__tests__/screener.service.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { atr14Pct, filterCurated } from '../screener.service';

/** Bar dengan range harian tetap `range` dan close tetap `close`.
 * True Range tiap hari = max(high-low, |high-prevClose|, |low-prevClose|) = range,
 * karena prevClose selalu sama dengan close hari ini. Jadi ATR = range. */
function flatBars(count: number, close: number, range: number) {
  return Array.from({ length: count }, () => ({
    high: close + range / 2,
    low: close - range / 2,
    close,
  }));
}

describe('atr14Pct', () => {
  it('menghitung ATR sebagai persen dari harga terakhir', () => {
    // range 40 pada harga 1000 -> ATR 40 -> 4% dari harga
    const bars = flatBars(20, 1000, 40);

    expect(atr14Pct(bars)).toBeCloseTo(4, 1);
  });

  it('mengembalikan null kalau bar kurang dari 15', () => {
    expect(atr14Pct(flatBars(14, 1000, 40))).toBeNull();
  });

  it('mengembalikan null untuk array kosong, bukan melempar error', () => {
    expect(atr14Pct([])).toBeNull();
  });

  it('mengembalikan null kalau harga terakhir nol - tidak membagi nol', () => {
    expect(atr14Pct(flatBars(20, 0, 10))).toBeNull();
  });
});

describe('filterCurated', () => {
  it('membuang saham yang tidak lolos standar kualitas', () => {
    const stocks = [
      { ticker: 'BBCA' }, { ticker: 'GOTO' }, { ticker: 'BUKA' },
      { ticker: 'MEGA' }, { ticker: 'BYAN' }, { ticker: 'SILO' },
    ];

    expect(filterCurated(stocks).map((s) => s.ticker)).toEqual(['BBCA']);
  });

  it('mempertahankan saham yang ada di daftar tersaring', () => {
    const stocks = [{ ticker: 'BBCA' }, { ticker: 'TLKM' }, { ticker: 'ANTM' }];

    expect(filterCurated(stocks)).toHaveLength(3);
  });

  it('mencocokkan ticker tanpa akhiran .JK - RawStock menyimpannya sudah dibuang', () => {
    expect(filterCurated([{ ticker: 'BBCA' }])).toHaveLength(1);
    expect(filterCurated([{ ticker: 'BBCA.JK' }])).toHaveLength(1);
  });

  it('array kosong menghasilkan array kosong, bukan error', () => {
    expect(filterCurated([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run: `npx vitest run modules/market/service/__tests__/screener.service.test.ts`
Expected: FAIL — `atr14Pct` dan `filterCurated` belum diekspor dari `screener.service.ts`.

- [ ] **Step 3: Tulis implementasi**

Tambahkan di `modules/market/service/screener.service.ts`, tepat **setelah** definisi `type RawStock` (sekitar baris 52) dan **sebelum** `fetchDailyOhlcv`:

```typescript
import { AI_PICK_UNIVERSE } from '../constants/ai-pick-universe';

// Daftar ticker yang boleh DIREKOMENDASIKAN - sama dengan universe AI Pick karena
// keduanya menjawab pertanyaan yang sama: saham ini layak disarankan atau tidak.
// Syaratnya: harga rata-rata 3 bulan >= Rp 200, nilai transaksi >= Rp 1 M/hari,
// volatilitas 12 bulan <= 120%/tahun.
//
// SCREENER_UNIVERSE sengaja TIDAK disaring - daftar itu juga dipakai Compare Tool,
// Dividend, dan Corporate Calendar yang semuanya alat PENCARIAN, bukan pemberi saran.
// Pengguna berhak membandingkan atau melihat jadwal dividen GOTO meski GOTO tidak
// layak direkomendasikan.
const CURATED_TICKERS = new Set(AI_PICK_UNIVERSE.map((t) => t.replace('.JK', '')));

/** ATR 14 sebagai persen dari harga terakhir. null kalau data kurang dari 15 bar
 * (butuh 14 True Range, masing-masing perlu close hari sebelumnya) atau harga nol.
 *
 * Menggantikan kolom stop loss yang dulu memberi angka tetap 5%/8%/12%: pengujian
 * 4.705 sampel menunjukkan stop 5% tersentuh di 77% transaksi dan memangkas hampir
 * seluruh keuntungan (+0,02% vs +1,34% tanpa stop). Angka ATR memberi tahu ruang gerak
 * wajar saham supaya pengguna menetapkan batasnya sendiri, bukan menuruti angka yang
 * terdengar otoritatif tapi tidak berdasar. */
export function atr14Pct(ohlcv: { high: number; low: number; close: number }[]): number | null {
  if (ohlcv.length < 15) return null;
  const last = ohlcv[ohlcv.length - 1].close;
  if (!last) return null;

  let sum = 0;
  for (let i = ohlcv.length - 14; i < ohlcv.length; i++) {
    const { high, low } = ohlcv[i];
    const prevClose = ohlcv[i - 1].close;
    sum += Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
  }
  return (sum / 14 / last) * 100;
}

/** Sisakan hanya saham yang boleh direkomendasikan. Menerima ticker dengan maupun
 * tanpa akhiran .JK karena RawStock menyimpannya sudah dibuang. */
export function filterCurated<T extends { ticker: string }>(stocks: T[]): T[] {
  return stocks.filter((s) => CURATED_TICKERS.has(s.ticker.replace('.JK', '')));
}
```

- [ ] **Step 4: Jalankan test untuk memastikan lulus**

Run: `npx vitest run modules/market/service/__tests__/screener.service.test.ts`
Expected: 9 test PASS.

- [ ] **Step 5: Verifikasi typecheck**

Run: `npx tsc --noEmit`
Expected: tanpa error.

- [ ] **Step 6: Commit**

```bash
git add modules/market/service/screener.service.ts modules/market/service/__tests__/screener.service.test.ts
git commit -m "feat(screener): tambah atr14Pct dan filterCurated"
```

---

### Task 2: Sambungkan ke alur data

**Files:**
- Modify: `modules/market/service/screener.service.ts`
- Test: `modules/market/service/__tests__/screener.service.test.ts`

**Interfaces:**
- Consumes: `atr14Pct()`, `filterCurated()` (Task 1).
- Produces: hasil `rankScreener()` memuat `atr_pct: number | null` dan **tidak** lagi memuat `stop_loss`.

- [ ] **Step 1: Tulis test yang gagal**

Pertama, tambahkan `rankScreener` ke baris import yang sudah ada di **atas** file
`modules/market/service/__tests__/screener.service.test.ts` — jangan menulis import kedua
di tengah file:

```typescript
import { atr14Pct, filterCurated, rankScreener } from '../screener.service';
```

Lalu tambahkan di akhir file, setelah blok `describe('filterCurated', ...)`:

```typescript
function rawStock(ticker: string, over: Record<string, unknown> = {}) {
  return {
    ticker,
    name: `PT ${ticker}`,
    sector: 'Keuangan',
    price: 1000,
    per: 15,
    roe: 18,
    der: 0.4,
    div_yield: 3,
    rev_growth: 10,
    gross_margin: 45,
    vol_ratio: 1.2,
    bandarmology_status: 'NEUTRAL' as const,
    fifty_two_week_low: 800,
    fifty_two_week_high: 1200,
    atr_pct: 3.5,
    ...over,
  };
}

describe('rankScreener', () => {
  it('tidak pernah mengembalikan saham di luar daftar tersaring', () => {
    const universe = [rawStock('BBCA'), rawStock('GOTO'), rawStock('BUKA'), rawStock('TLKM')];

    const result = rankScreener(universe as any, 'Moderat');

    expect(result.map((r) => r.ticker).sort()).toEqual(['BBCA', 'TLKM']);
  });

  it('mengembalikan array kosong kalau seluruh universe tersaring habis', () => {
    const universe = [rawStock('GOTO'), rawStock('BUKA'), rawStock('MEGA')];

    expect(rankScreener(universe as any, 'Moderat')).toEqual([]);
  });

  it('meneruskan atr_pct ke hasil dan tidak lagi memuat stop_loss', () => {
    const result = rankScreener([rawStock('BBCA', { atr_pct: 4.2 })] as any, 'Moderat');

    expect(result[0].atr_pct).toBe(4.2);
    expect(result[0]).not.toHaveProperty('stop_loss');
  });

  it('atr_pct null diteruskan apa adanya, tidak diganti angka lain', () => {
    const result = rankScreener([rawStock('BBCA', { atr_pct: null })] as any, 'Moderat');

    expect(result[0].atr_pct).toBeNull();
  });
});
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run: `npx vitest run modules/market/service/__tests__/screener.service.test.ts`
Expected: FAIL — `rankScreener` masih mengembalikan `stop_loss` dan belum menyaring GOTO/BUKA.

- [ ] **Step 3: Tambahkan `atr_pct` ke tipe dan pengambilan data**

Di `modules/market/service/screener.service.ts`, tambahkan field pada `type RawStock` (setelah `fifty_two_week_high`):

```typescript
  fifty_two_week_high: number | null;
  atr_pct: number | null;
```

Lalu di `fetchOne()`, tambahkan pada objek yang dikembalikan, tepat setelah baris `fifty_two_week_high:`:

```typescript
      fifty_two_week_high: q.summaryDetail?.fiftyTwoWeekHigh || null,
      // Dihitung dari OHLCV yang SUDAH diambil untuk Bandarmology - tidak ada request
      // tambahan. range=1mo memberi ~21 bar, cukup untuk ATR 14.
      atr_pct: atr14Pct(ohlcv),
```

- [ ] **Step 4: Ubah `fetchScreenerUniverse()` jadi gabungan dua universe**

Ganti seluruh fungsi `fetchScreenerUniverse()`:

```typescript
// Mengambil GABUNGAN dua universe (114 saham) dalam satu kali jalan, bukan dua kali:
// SCREENER_UNIVERSE (51, dipakai Compare Tool sebagai alat pencarian) dan universe
// tersaring (109, satu-satunya yang boleh direkomendasikan). Keduanya beririsan 46
// saham - mengambilnya terpisah berarti 46 saham di-fetch dua kali tiap 30 menit.
//
// Penyaringan TIDAK dilakukan di sini, melainkan di rankScreener(), supaya /api/compare
// tetap bisa melihat seluruh 114.
export async function fetchScreenerUniverse(): Promise<RawStock[]> {
  const tickers = [...new Set([...SCREENER_UNIVERSE, ...AI_PICK_UNIVERSE])];
  const results = await Promise.all(tickers.map(fetchOne));
  return results.filter((r): r is RawStock => r !== null);
}
```

- [ ] **Step 5: Saring di `rankScreener()` dan ganti stop loss dengan ATR**

Di dalam `rankScreener()`, ganti baris pembuka perhitungan sektor sehingga penyaringan
terjadi lebih dulu. Ganti:

```typescript
export function rankScreener(universe: RawStock[], profile: RiskProfile) {
  const bySector = new Map<string, number[]>();
  universe.forEach((s) => {
```

menjadi:

```typescript
export function rankScreener(universe: RawStock[], profile: RiskProfile) {
  // Disaring SEBELUM skor dihitung - rata-rata PER sektor pun hanya boleh dihitung dari
  // saham yang layak direkomendasikan, supaya pembandingnya konsisten.
  const curated = filterCurated(universe);

  const bySector = new Map<string, number[]>();
  curated.forEach((s) => {
```

Lalu ganti `universe` menjadi `curated` pada baris `const ranked = universe`:

```typescript
  const ranked = curated
```

Terakhir, di dalam `.map(({ s }) => {`, hapus baris `stopLossPct` dan ganti field `stop_loss`:

```typescript
    .map(({ s }) => {
      return {
        ticker: s.ticker,
        name: s.name,
        sector: s.sector,
        per: s.per != null ? parseFloat(s.per.toFixed(1)) : null,
        per_sector: parseFloat(sectorAvgPer(s.sector).toFixed(1)),
        rev_growth_ttm: s.rev_growth != null ? `${s.rev_growth >= 0 ? '+' : ''}${s.rev_growth.toFixed(1)}%` : 'N/A',
        roe: s.roe != null ? `${s.roe.toFixed(1)}%` : 'N/A',
        der: s.der != null ? `${s.der.toFixed(2)}x` : 'N/A',
        div_yield: s.div_yield != null ? `${s.div_yield.toFixed(1)}%` : 'N/A',
        bandarmology: bandarmologyLabel(s.bandarmology_status),
        moat: moatRating(s.roe, s.gross_margin),
        week52_high: s.fifty_two_week_high,
        week52_low: s.fifty_two_week_low,
        entry: s.price,
        // Menggantikan stop_loss - lihat alasannya di komentar atr14Pct().
        atr_pct: s.atr_pct != null ? parseFloat(s.atr_pct.toFixed(1)) : null,
      };
    });
```

- [ ] **Step 6: Jalankan test untuk memastikan lulus**

Run: `npx vitest run modules/market/service/__tests__/screener.service.test.ts`
Expected: 13 test PASS.

- [ ] **Step 7: Pastikan tidak ada sisa `stopLossPct`**

Run: `grep -n "stopLossPct\|stop_loss" modules/market/service/screener.service.ts`
Expected: tanpa hasil.

- [ ] **Step 8: Jalankan seluruh test lalu typecheck**

Run: `npx vitest run`
Expected: seluruh test PASS.

Run: `npx tsc --noEmit`
Expected: tanpa error. Kalau muncul error di `app/screener/page.tsx` soal `stop_loss`, itu wajar — diperbaiki di Task 3.

- [ ] **Step 9: Commit**

```bash
git add modules/market/service/screener.service.ts modules/market/service/__tests__/screener.service.test.ts
git commit -m "feat(screener): saring universe di ranking, ganti stop loss dengan ATR"
```

---

### Task 3: Tampilan

**Files:**
- Modify: `app/screener/page.tsx:106` (header kolom), `app/screener/page.tsx:152-156` (isi baris), `app/screener/page.tsx:161-163` (keterangan)

**Interfaces:**
- Consumes: `atr_pct: number | null` dari respons `/api/screener` (Task 2).

- [ ] **Step 1: Ganti header kolom**

Di `app/screener/page.tsx`, ganti baris 106:

```tsx
                  <th className="p-3 text-right">Entry / StopLoss</th>
```

menjadi dua kolom terpisah:

```tsx
                  <th className="p-3 text-right">Harga</th>
                  <th className="p-3 text-right">Volatilitas Harian</th>
```

- [ ] **Step 2: Ganti isi baris**

Ganti blok berikut (sekitar baris 152-156):

```tsx
                    <td className="p-3 text-right text-white">
                      <span className="text-tv-yellow font-bold font-number">Rp {item.entry?.toLocaleString('id-ID')}</span> /{' '}
                      <span className="text-tv-red font-bold font-number">Rp {item.stop_loss?.toLocaleString('id-ID')}</span>
                    </td>
```

menjadi:

```tsx
                    <td className="p-3 text-right text-white">
                      <span className="text-tv-yellow font-bold font-number">Rp {item.entry?.toLocaleString('id-ID')}</span>
                    </td>
                    <td className="p-3 text-right text-tv-text font-number">
                      {item.atr_pct != null ? `±${item.atr_pct.toFixed(1)}%/hari` : 'N/A'}
                    </td>
```

- [ ] **Step 3: Perbaiki baris kondisi kosong**

Kolom bertambah dari 13 jadi 14, dan pesannya sekarang keliru dalam dua hal: daftar bisa
kosong karena penyaringan (bukan gagal memuat), dan universe bukan lagi ~50 saham.

Ganti blok berikut (sekitar baris 110-118):

```tsx
                {top10.length === 0 && (
                  <tr>
                    <td colSpan={13} className="p-8 text-center text-tv-muted text-sm">
                      {loading ? (
                        <span className="inline-flex items-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" /> Memindai ~50 saham likuid IDX...</span>
                      ) : 'Gagal memuat data screener. Coba refresh.'}
                    </td>
                  </tr>
                )}
```

menjadi:

```tsx
                {top10.length === 0 && (
                  <tr>
                    <td colSpan={14} className="p-8 text-center text-tv-muted text-sm">
                      {loading ? (
                        <span className="inline-flex items-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" /> Memindai 114 saham likuid IDX...</span>
                      ) : 'Tidak ada saham yang memenuhi kriteria saat ini. Coba profil risiko lain atau muat ulang.'}
                    </td>
                  </tr>
                )}
```

- [ ] **Step 4: Tambahkan keterangan di bawah tabel**

Ganti blok keterangan yang sudah ada (sekitar baris 161-163):

```tsx
          <p className="text-[10px] text-tv-muted">
            Bandarmology = Chaikin Money Flow (posisi close di range High-Low + rasio volume 20 hari), estimasi tekanan beli/jual - BUKAN data broker/asing resmi (IDX tidak menyediakan feed itu gratis).
          </p>
```

menjadi:

```tsx
          <p className="text-[10px] text-tv-muted">
            Bandarmology = Chaikin Money Flow (posisi close di range High-Low + rasio volume 20 hari), estimasi tekanan beli/jual - BUKAN data broker/asing resmi (IDX tidak menyediakan feed itu gratis).
          </p>
          <p className="text-[10px] text-tv-muted mt-2">
            Volatilitas Harian = rata-rata pergerakan 14 hari terakhir (ATR). Stop loss di bawah
            angka ini akan sering tersentuh oleh fluktuasi biasa - pengujian atas 4.705 sampel
            menunjukkan stop 5% tersentuh di 77% transaksi dan memangkas hampir seluruh
            keuntungan. Tentukan batas risikomu sendiri dengan mempertimbangkan angka ini.
          </p>
```

- [ ] **Step 5: Verifikasi typecheck**

Run: `npx tsc --noEmit`
Expected: tanpa error, termasuk error `stop_loss` dari Task 2 sudah hilang.

- [ ] **Step 6: Pastikan tidak ada sisa referensi**

Run: `grep -rn "stop_loss\|StopLoss" app/screener/ modules/market/`
Expected: tanpa hasil.

- [ ] **Step 7: Periksa di aplikasi berjalan**

Run: `npm run dev`

Buka `http://localhost:3001/screener`, lalu:

```bash
curl -s "http://localhost:3001/api/screener?profile=Moderat" -m 180 | head -c 400
```

Expected: JSON memuat `atr_pct`, tidak memuat `stop_loss`, dan tidak ada satu pun ticker
`GOTO`/`BUKA`/`MEGA`/`BYAN`/`SILO` di `top_10_stocks`.

Periksa juga ketiga profil menghasilkan daftar berbeda:

```bash
for p in Konservatif Moderat Agresif; do
  echo -n "$p: "
  curl -s "http://localhost:3001/api/screener?profile=$p" -m 180 \
    | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(j.analysis.top_10_stocks.map(s=>s.ticker).join(', '))})"
done
```

Expected: tiga daftar yang tidak identik — membuktikan bobot profil masih berfungsi.

- [ ] **Step 8: Commit**

```bash
git add app/screener/page.tsx
git commit -m "feat(screener): kolom stop loss jadi volatilitas harian"
```

---

## Verifikasi akhir

- [ ] `npx vitest run` — seluruh test PASS
- [ ] `npx tsc --noEmit` — bersih
- [ ] `npm run build` — Compiled successfully
- [ ] `grep -rn "stop_loss\|stopLossPct" app/ modules/` — tanpa hasil
- [ ] `/api/screener` tidak pernah mengembalikan GOTO, BUKA, MEGA, BYAN, atau SILO
- [ ] `/api/compare` masih bisa mengambil GOTO: `curl -s "http://localhost:3001/api/compare?symbols=GOTO.JK,BBCA.JK" -m 180 | head -c 200`
- [ ] `SCREENER_UNIVERSE` tidak berubah: `git diff HEAD~3 -- modules/market/service/screener.service.ts | grep -c "^[-+].*\.JK'" ` mengembalikan `0`
- [ ] Backtest & AI Pick tidak tersentuh: `git diff --stat HEAD~3 -- modules/backtest app/backtest app/api/ai-pick` kosong
