# LensScanner Sortable Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tabel "Top 10 Saham" di `/screener` (16 dari 17 kolom) dan tabel LensRadar di `/breakout-radar` (4 kolom: Saham/Harga/Chg/Skor) bisa diurutkan klik header kolom. `/recommendations` SUDAH punya fitur ini (`handleSort`/`getSortIcon`/`sortConfig` sudah berfungsi) — tidak ada task untuk halaman itu.

**Architecture:** Config array `SORTABLE_COLUMNS` (key/label/align/getValue) jadi satu sumber untuk render `<th>` clickable dan comparator generik — pola yang sama diterapkan mandiri di 2 file (`app/screener/page.tsx`, `app/breakout-radar/page.tsx`), tidak diekstrak ke shared util (dipakai cuma 2 tempat, YAGNI). State `sortKey`/`sortDir` per komponen, `useMemo` untuk hasil sort, `tbody` yang sudah ada tetap sama cuma ganti sumber data map dari array asli ke array ter-sort.

**Tech Stack:** React (client component, sudah `'use client'`), TypeScript, tidak ada dependency baru.

## Global Constraints

- Tidak ada perubahan ke `/api/screener` atau `modules/market/service/screener.service.ts` — murni client-side.
- Nilai `null`/`undefined` selalu di-push ke bawah terlepas arah sort.
- Kolom "#" TIDAK clickable, tetap nomor urut 1..10 mengikuti posisi baru.
- Tidak ada dependency/library baru (no react-table dkk).

---

### Task 1: Sortable table di `app/screener/page.tsx`

**Files:**
- Modify: `app/screener/page.tsx` (seluruh perubahan di 1 file ini)

**Interfaces:** Tidak ada — komponen self-contained, tidak ada file lain yang bergantung ke sini.

- [ ] **Step 1: Tambah type + config `SORTABLE_COLUMNS` setelah import, sebelum komponen**

Tambahkan tepat setelah baris `import { Sliders, Award, Shield, Zap, RefreshCw, Filter, CheckCircle } from 'lucide-react';` (baris 8), sebelum `export default function ScreenerPage() {`:

```typescript
type ColumnKey = 'ticker' | 'name' | 'sector' | 'per' | 'rev_growth_ttm' | 'roe' | 'der'
  | 'div_yield' | 'bandarmology' | 'moat' | 'signal' | 'pattern_tag' | 'sentiment'
  | 'week52_high' | 'entry' | 'atr_pct';

interface SortableColumn {
  key: ColumnKey;
  label: string;
  align?: 'right';
  getValue: (item: any) => string | number | null | undefined;
}

const SORTABLE_COLUMNS: SortableColumn[] = [
  { key: 'ticker', label: 'Ticker', getValue: (i) => i.ticker },
  { key: 'name', label: 'Nama Emiten', getValue: (i) => i.name },
  { key: 'sector', label: 'Sektor', getValue: (i) => i.sector },
  { key: 'per', label: 'PER / Sektor', align: 'right', getValue: (i) => i.per },
  { key: 'rev_growth_ttm', label: 'Rev Growth (TTM)', align: 'right', getValue: (i) => i.rev_growth_ttm },
  { key: 'roe', label: 'ROE', align: 'right', getValue: (i) => i.roe },
  { key: 'der', label: 'DER', align: 'right', getValue: (i) => i.der },
  { key: 'div_yield', label: 'Div Yield', align: 'right', getValue: (i) => i.div_yield },
  { key: 'bandarmology', label: 'Bandarmology', getValue: (i) => i.bandarmology },
  { key: 'moat', label: 'Moat Rating', getValue: (i) => i.moat },
  { key: 'signal', label: 'Signal', getValue: (i) => i.signal },
  { key: 'pattern_tag', label: 'Pola Backtest', getValue: (i) => i.pattern_tag },
  { key: 'sentiment', label: 'Sentimen Berita', getValue: (i) => i.sentiment },
  { key: 'week52_high', label: '52W High/Low', align: 'right', getValue: (i) => i.week52_high },
  { key: 'entry', label: 'Harga', align: 'right', getValue: (i) => i.entry },
  { key: 'atr_pct', label: 'Volatilitas Harian', align: 'right', getValue: (i) => i.atr_pct },
];

function compareValues(a: string | number | null | undefined, b: string | number | null | undefined, dir: 'asc' | 'desc'): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  const result = typeof a === 'number' && typeof b === 'number'
    ? a - b
    : String(a).localeCompare(String(b), 'id');
  return dir === 'asc' ? result : -result;
}
```

- [ ] **Step 2: Tambah `useMemo` ke import React**

```typescript
// SEBELUM (baris 4)
import React, { useState, useEffect } from 'react';
// SESUDAH
import React, { useState, useEffect, useMemo } from 'react';
```

- [ ] **Step 3: Tambah state sort + handler, setelah `const [data, setData] = useState<any>(null);` (baris 14)**

```typescript
  const [sortKey, setSortKey] = useState<ColumnKey | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const handleSort = (key: ColumnKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };
```

- [ ] **Step 4: Tambah `sortedRows` setelah `const top10 = data?.analysis?.top_10_stocks || [];` (baris 34)**

```typescript
  const sortedRows = useMemo(() => {
    if (!sortKey) return top10;
    const col = SORTABLE_COLUMNS.find((c) => c.key === sortKey)!;
    return [...top10].sort((a: any, b: any) => compareValues(col.getValue(a), col.getValue(b), sortDir));
  }, [top10, sortKey, sortDir]);
```

- [ ] **Step 5: Ganti `<thead>` jadi data-driven (baris 93-112)**

```tsx
// SEBELUM
              <thead>
                <tr className="border-b border-tv-border bg-tv-bg text-tv-muted uppercase text-[10px]">
                  <th className="p-3">#</th>
                  <th className="p-3">Ticker</th>
                  <th className="p-3">Nama Emiten</th>
                  <th className="p-3">Sektor</th>
                  <th className="p-3 text-right">PER / Sektor</th>
                  <th className="p-3 text-right">Rev Growth (TTM)</th>
                  <th className="p-3 text-right">ROE</th>
                  <th className="p-3 text-right">DER</th>
                  <th className="p-3 text-right">Div Yield</th>
                  <th className="p-3">Bandarmology</th>
                  <th className="p-3">Moat Rating</th>
                  <th className="p-3">Signal</th>
                  <th className="p-3">Pola Backtest</th>
                  <th className="p-3">Sentimen Berita</th>
                  <th className="p-3 text-right">52W High/Low</th>
                  <th className="p-3 text-right">Harga</th>
                  <th className="p-3 text-right">Volatilitas Harian</th>
                </tr>
              </thead>
// SESUDAH
              <thead>
                <tr className="border-b border-tv-border bg-tv-bg text-tv-muted uppercase text-[10px]">
                  <th className="p-3">#</th>
                  {SORTABLE_COLUMNS.map((col) => (
                    <th key={col.key} className={`p-3 ${col.align === 'right' ? 'text-right' : ''}`}>
                      <button
                        type="button"
                        onClick={() => handleSort(col.key)}
                        className={`inline-flex items-center gap-1 hover:text-tv-text transition-colors ${col.align === 'right' ? 'flex-row-reverse' : ''}`}
                      >
                        {col.label}
                        {sortKey === col.key && (
                          <span className="text-tv-blue">{sortDir === 'asc' ? '▲' : '▼'}</span>
                        )}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
```

- [ ] **Step 6: Ganti sumber data body tabel dari `top10` ke `sortedRows` (2 titik)**

```tsx
// SEBELUM (baris 115, kondisi kosong)
                {top10.length === 0 && (
// SESUDAH
                {sortedRows.length === 0 && (
```

```tsx
// SEBELUM (baris 124, map baris)
                {top10.map((item: any, idx: number) => (
// SESUDAH
                {sortedRows.map((item: any, idx: number) => (
```

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 error baru.

- [ ] **Step 8: Manual verification**

Run: `npm run dev`, buka `http://localhost:3001/screener`.

- Klik header "ROE" → baris terurut ROE naik, panah ▲ muncul di header ROE.
- Klik "ROE" lagi → urutan kebalik turun, panah jadi ▼.
- Klik "Ticker" → urutan sebelumnya (ROE) hilang panahnya, Ticker sekarang A-Z dengan panah ▲.
- Klik "Pola Backtest" (kolom yang sering kosong/"Tidak ada pola cocok") → baris kosong tetap di bawah baik ascending maupun descending.
- Kolom "#" tidak bisa diklik (tidak ada cursor-pointer/hover effect di situ), tetap nomor 1-10 sesuai posisi baru.
- Ganti Profil Risiko (Konservatif/Moderat/Agresif) sambil ada sort aktif → data baru masuk, sort tetap diterapkan ke data baru (karena `sortedRows` di-derive dari `top10` yang baru).

- [ ] **Step 9: Build**

Run: `npm run build`
Expected: build sukses.

- [ ] **Step 10: Commit**

```bash
git add app/screener/page.tsx
git commit -m "feat(screener): tabel Top 10 bisa di-sort klik header tiap kolom"
```

---

### Task 2: Sortable table di `app/breakout-radar/page.tsx` (LensRadar)

**Files:**
- Modify: `app/breakout-radar/page.tsx` (seluruh perubahan di 1 file ini)

**Interfaces:** Tidak ada — independen dari Task 1, komponen self-contained. `AiPickItem` type (baris 15-29, sudah ada) dipakai sebagai tipe parameter `getValue`.

- [ ] **Step 1: Tambah `useMemo` ke import React**

```typescript
// SEBELUM (baris 3)
import React, { useState, useEffect } from 'react';
// SESUDAH
import React, { useState, useEffect, useMemo } from 'react';
```

- [ ] **Step 2: Tambah type + config `SORTABLE_COLUMNS` + comparator, setelah type `AiPickItem` (setelah baris 29, sebelum komentar "// Halaman ini dulu..." baris 31)**

```typescript
type RadarColumnKey = 'symbol' | 'price' | 'changePct' | 'finalScore';

interface RadarSortableColumn {
  key: RadarColumnKey;
  label: string;
  align?: 'right';
  getValue: (item: AiPickItem) => string | number | null | undefined;
}

const RADAR_SORTABLE_COLUMNS: RadarSortableColumn[] = [
  { key: 'symbol', label: 'Saham', getValue: (i) => i.symbol },
  { key: 'price', label: 'Harga', align: 'right', getValue: (i) => i.price },
  { key: 'changePct', label: 'Chg', align: 'right', getValue: (i) => i.changePct },
  { key: 'finalScore', label: 'Skor', align: 'right', getValue: (i) => i.finalScore },
];

function compareRadarValues(a: string | number | null | undefined, b: string | number | null | undefined, dir: 'asc' | 'desc'): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  const result = typeof a === 'number' && typeof b === 'number'
    ? a - b
    : String(a).localeCompare(String(b), 'id');
  return dir === 'asc' ? result : -result;
}
```

- [ ] **Step 3: Tambah state sort + handler, setelah `const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);` (baris 49)**

```typescript
  const [radarSortKey, setRadarSortKey] = useState<RadarColumnKey | null>(null);
  const [radarSortDir, setRadarSortDir] = useState<'asc' | 'desc'>('asc');

  const handleRadarSort = (key: RadarColumnKey) => {
    if (radarSortKey === key) {
      setRadarSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setRadarSortKey(key);
      setRadarSortDir('asc');
    }
  };
```

- [ ] **Step 4: Tambah `sortedItems` — cari baris `setItems(d.items || []);` (baris 66) ada di dalam `useEffect`/fetch function; tambahkan `sortedItems` sebagai turunan state, DI LUAR fungsi fetch, sejajar dengan deklarasi state lain (setelah Step 3 di atas)**

```typescript
  const sortedItems = useMemo(() => {
    if (!radarSortKey) return items;
    const col = RADAR_SORTABLE_COLUMNS.find((c) => c.key === radarSortKey)!;
    return [...items].sort((a, b) => compareRadarValues(col.getValue(a), col.getValue(b), radarSortDir));
  }, [items, radarSortKey, radarSortDir]);
```

- [ ] **Step 5: Ganti `<thead>` jadi data-driven (baris 145-154)**

```tsx
// SEBELUM
                    <thead>
                      <tr className="border-b border-tv-border text-xs text-tv-muted uppercase font-semibold tracking-wide">
                        <th className="py-3 px-4">#</th>
                        <th className="py-3 px-4">Saham</th>
                        <th className="py-3 px-4 text-right">Harga</th>
                        <th className="py-3 px-4 text-right">Chg</th>
                        <th className="py-3 px-4 text-right">Skor</th>
                        <th className="py-3 px-4">Rincian</th>
                        <th className="py-3 px-4 text-center">Kenapa</th>
                      </tr>
                    </thead>
// SESUDAH
                    <thead>
                      <tr className="border-b border-tv-border text-xs text-tv-muted uppercase font-semibold tracking-wide">
                        <th className="py-3 px-4">#</th>
                        {RADAR_SORTABLE_COLUMNS.map((col) => (
                          <th key={col.key} className={`py-3 px-4 ${col.align === 'right' ? 'text-right' : ''}`}>
                            <button
                              type="button"
                              onClick={() => handleRadarSort(col.key)}
                              className={`inline-flex items-center gap-1 hover:text-tv-text transition-colors ${col.align === 'right' ? 'flex-row-reverse' : ''}`}
                            >
                              {col.label}
                              {radarSortKey === col.key && (
                                <span className="text-tv-blue">{radarSortDir === 'asc' ? '▲' : '▼'}</span>
                              )}
                            </button>
                          </th>
                        ))}
                        <th className="py-3 px-4">Rincian</th>
                        <th className="py-3 px-4 text-center">Kenapa</th>
                      </tr>
                    </thead>
```

- [ ] **Step 6: Ganti sumber data body tabel dari `items` ke `sortedItems` (baris 157)**

```tsx
// SEBELUM
                      {items.map((it, idx) => {
// SESUDAH
                      {sortedItems.map((it, idx) => {
```

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 error baru.

- [ ] **Step 8: Manual verification**

Run: `npm run dev`, buka `http://localhost:3001/breakout-radar`.

- Klik header "Skor" → baris terurut skor naik, panah ▲ di header Skor.
- Klik "Skor" lagi → urutan kebalik, panah ▼.
- Klik "Saham" → urutan sebelumnya hilang panahnya, Saham sekarang A-Z.
- Klik tombol expand ("Kenapa") pada salah satu baris, lalu sort ulang → baris yang ter-expand tetap terkunci ke symbol yang benar (bukan ikut lompat ke posisi index lama).
- Kolom "Rincian" dan "Kenapa" tidak bisa diklik buat sort (tidak ada hover/cursor-pointer di situ).
- Kolom "#" tetap nomor urut 1..N sesuai posisi baru.

- [ ] **Step 9: Build**

Run: `npm run build`
Expected: build sukses.

- [ ] **Step 10: Commit**

```bash
git add app/breakout-radar/page.tsx
git commit -m "feat(breakout-radar): tabel LensRadar bisa di-sort klik header (Saham/Harga/Chg/Skor)"
```
