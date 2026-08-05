# Export Kartu Fundamental & Teknikal (PNG) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tombol export PNG di `/fundamental` dan `/technical/[symbol]`, tiap tombol men-download kartu ringkasan berisi data real yang sudah ter-fetch di halaman itu (tidak ada angka/klaim karangan).

**Architecture:** Dua kartu presentational (`FundamentalExportCard`, `TechnicalExportCard`) di-render offscreen (fixed 1080×1350px) dari data yang sudah ada di state halaman masing-masing, di-screenshot client-side via `html-to-image` (dynamic import) lewat 1 tombol reusable (`ExportImageButton`). Data teknikal (`council`) di-fetch server-side di `CouncilDisplay`, jadi diteruskan sebagai prop ke wrapper client baru (`TechnicalExportSection`).

**Tech Stack:** Next.js 16 App Router, React 18, TypeScript, Tailwind (tv-* design tokens sudah ada), Vitest (unit test), `html-to-image` (dependency baru).

## Global Constraints

- Tidak ada field yang boleh menampilkan angka default (`0`, `''`) untuk data yang sebenarnya tidak tersedia — selalu `N/A`, sama seperti aturan yang sudah berlaku di `app/fundamental/page.tsx` dan `app/technical/[symbol]/page.tsx` (anti fabricated-value, lihat komentar existing di kedua file).
- Field "Confidence"/skor yang bukan hasil hitungan (karangan LLM) tidak boleh ditampilkan di kartu teknikal — hanya persentase BUY/SELL/HOLD/WAIT (vote riil 10 agent) dan `score` numerik kalau memang ada di response `council`.
- Import library berat (`html-to-image`) HARUS dynamic import di dalam handler klik, bukan top-level — pola sama seperti `xlsx` di `app/admin/ExportButton.tsx`.
- Semua string UI baru berbahasa Indonesia, konsisten dengan copy yang sudah ada di kedua halaman.

---

## Task 1: Pindahkan formatter fundamental ke `shared/format/`

**Files:**
- Create: `shared/format/fundamental-format.ts`
- Create: `shared/format/__tests__/fundamental-format.test.ts`
- Modify: `app/fundamental/page.tsx` (hapus definisi lokal, import dari file baru)

**Interfaces:**
- Produces: `fmtKali(v: number | null | undefined): string`, `fmtPersen(fraksi: number | null | undefined): string`, `fmtTriliun(v: number | null | undefined): string` — dipakai Task 1 (page asli) dan Task 5 (`FundamentalExportCard`).

- [ ] **Step 1: Write the failing test**

Buat `shared/format/__tests__/fundamental-format.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { fmtKali, fmtPersen, fmtTriliun } from '../fundamental-format';

describe('fmtKali', () => {
  it('formats a number with 2 decimals and x suffix', () => {
    expect(fmtKali(12.345)).toBe('12.35x');
  });
  it('returns N/A for null', () => {
    expect(fmtKali(null)).toBe('N/A');
  });
  it('returns N/A for undefined', () => {
    expect(fmtKali(undefined)).toBe('N/A');
  });
});

describe('fmtPersen', () => {
  it('converts fraction to percentage with 2 decimals', () => {
    expect(fmtPersen(0.1523)).toBe('15.23%');
  });
  it('returns N/A for null (not 0.00%)', () => {
    expect(fmtPersen(null)).toBe('N/A');
  });
});

describe('fmtTriliun', () => {
  it('converts raw value to triliun rupiah with 2 decimals', () => {
    expect(fmtTriliun(1.5e12)).toBe('Rp 1.50 T');
  });
  it('returns N/A for undefined (not Rp 0.00 T)', () => {
    expect(fmtTriliun(undefined)).toBe('N/A');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run shared/format/__tests__/fundamental-format.test.ts`
Expected: FAIL — `Cannot find module '../fundamental-format'`

- [ ] **Step 3: Write minimal implementation**

Buat `shared/format/fundamental-format.ts` (dipindah verbatim dari `app/fundamental/page.tsx:20-28`, komentar bug-fix dipertahankan karena menjelaskan KENAPA `N/A` dan bukan `0`):

```ts
// BUG FIX (audit logika & algoritma 2026-08-05, temuan H-13): formatter di bawah
// SEBELUMNYA memakai `|| 0` sehingga data yang TIDAK TERSEDIA dirender sebagai angka
// nol yang terlihat seperti fakta ("P/E Ratio 0.00x", "Market Cap Rp 0.00 T",
// "ROE 0.00%"). Untuk data finansial, 0 bukan sinonim "tidak ada" - bank memang tidak
// mengirim debtToEquity ke Yahoo dan emiten rugi memang tidak punya trailingPE.
// Formatter di bawah menampilkan "N/A" apa adanya.
//
// Dipindah dari app/fundamental/page.tsx (2026-08-05) supaya bisa dipakai ulang oleh
// FundamentalExportCard (components/export/) tanpa duplikasi rule format.
export const fmtKali = (v: number | null | undefined): string =>
  typeof v === 'number' ? `${v.toFixed(2)}x` : 'N/A';

export const fmtPersen = (fraksi: number | null | undefined): string =>
  typeof fraksi === 'number' ? `${(fraksi * 100).toFixed(2)}%` : 'N/A';

export const fmtTriliun = (v: number | null | undefined): string =>
  typeof v === 'number' ? `Rp ${(v / 1e12).toFixed(2)} T` : 'N/A';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run shared/format/__tests__/fundamental-format.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Update `app/fundamental/page.tsx` to import instead of define**

Hapus blok berikut (baris 20-28 saat ini):

```ts
// BUG FIX (audit logika & algoritma 2026-08-05, temuan H-13): kartu-kartu fundamental di
// bawah SEBELUMNYA memakai `|| 0` sehingga data yang TIDAK TERSEDIA dirender sebagai
// angka nol yang terlihat seperti fakta ("P/E Ratio 0.00x", "Market Cap Rp 0.00 T",
// "ROE 0.00%"). Untuk data finansial, 0 bukan sinonim "tidak ada" - bank memang tidak
// mengirim debtToEquity ke Yahoo dan emiten rugi memang tidak punya trailingPE. Formatter
// di bawah menampilkan "N/A" apa adanya.
const fmtKali = (v: number | null | undefined) => (typeof v === 'number' ? `${v.toFixed(2)}x` : 'N/A');
const fmtPersen = (fraksi: number | null | undefined) => (typeof fraksi === 'number' ? `${(fraksi * 100).toFixed(2)}%` : 'N/A');
const fmtTriliun = (v: number | null | undefined) => (typeof v === 'number' ? `Rp ${(v / 1e12).toFixed(2)} T` : 'N/A');
```

Ganti dengan:

```ts
import { fmtKali, fmtPersen, fmtTriliun } from '@/shared/format/fundamental-format';
```

(Taruh baris import ini di antara import lain di bagian atas file, mis. setelah `import { PageContainer } from '@/components/ui';`.)

- [ ] **Step 6: Verify nothing else broke**

Run: `npx vitest run`
Expected: semua test yang sudah ada tetap PASS (formatter lama tidak dipakai file lain — cek dengan `grep -rn "fmtKali\|fmtPersen\|fmtTriliun" app/ components/` hanya menunjukkan `app/fundamental/page.tsx` memakai versi import).

- [ ] **Step 7: Commit**

```bash
git add shared/format/fundamental-format.ts shared/format/__tests__/fundamental-format.test.ts app/fundamental/page.tsx
git commit -m "refactor(fundamental): extract formatter ke shared/format untuk dipakai export card"
```

---

## Task 2: Helper nama file export

**Files:**
- Create: `shared/format/export-filename.ts`
- Create: `shared/format/__tests__/export-filename.test.ts`

**Interfaces:**
- Produces: `buildExportFileName(prefix: 'Fundamental' | 'Technical', ticker: string, date?: Date): string` — dipakai Task 5 dan Task 6 saat memanggil `ExportImageButton`.

- [ ] **Step 1: Write the failing test**

Buat `shared/format/__tests__/export-filename.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildExportFileName } from '../export-filename';

describe('buildExportFileName', () => {
  it('builds fundamental filename with cleaned ticker and ISO date', () => {
    const date = new Date('2026-08-05T10:00:00Z');
    expect(buildExportFileName('Fundamental', 'TLKM.JK', date)).toBe('SahamLens_Fundamental_TLKM_2026-08-05.png');
  });

  it('builds technical filename', () => {
    const date = new Date('2026-08-05T10:00:00Z');
    expect(buildExportFileName('Technical', 'bbca', date)).toBe('SahamLens_Technical_BBCA_2026-08-05.png');
  });

  it('strips .JK suffix and uppercases ticker regardless of input casing', () => {
    const date = new Date('2026-01-01T00:00:00Z');
    expect(buildExportFileName('Fundamental', 'gotO.jk'.toUpperCase().replace('.JK', '') + '.JK', date)).toBe('SahamLens_Fundamental_GOTO_2026-01-01.png');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run shared/format/__tests__/export-filename.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

Buat `shared/format/export-filename.ts`:

```ts
// Nama file konsisten untuk semua tombol export gambar (fundamental & teknikal) -
// format: SahamLens_{Prefix}_{TICKER-tanpa-.JK}_{YYYY-MM-DD}.png
export function buildExportFileName(
  prefix: 'Fundamental' | 'Technical',
  ticker: string,
  date: Date = new Date()
): string {
  const cleanTicker = ticker.replace('.JK', '').toUpperCase();
  const isoDate = date.toISOString().split('T')[0];
  return `SahamLens_${prefix}_${cleanTicker}_${isoDate}.png`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run shared/format/__tests__/export-filename.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add shared/format/export-filename.ts shared/format/__tests__/export-filename.test.ts
git commit -m "feat(export): tambah helper buildExportFileName"
```

---

## Task 3: Tambah dependency `html-to-image`

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json` (otomatis oleh `npm install`)

- [ ] **Step 1: Install dependency**

Run: `npm install html-to-image`

- [ ] **Step 2: Verify**

Run: `grep "html-to-image" package.json`
Expected: muncul baris `"html-to-image": "^..."` di `dependencies`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): tambah html-to-image untuk export kartu PNG"
```

---

## Task 4: Komponen `ExportImageButton`

**Files:**
- Create: `components/export/ExportImageButton.tsx`

**Interfaces:**
- Consumes: `buildExportFileName` (Task 2, sudah tersedia sebagai util — pemanggil di Task 5/6 yang membangun `fileName` lalu mengirim sebagai prop string, bukan `ExportImageButton` sendiri yang memanggil `buildExportFileName`, supaya komponen ini tetap generic/tidak tahu prefix apa).
- Produces: `<ExportImageButton targetRef={React.RefObject<HTMLElement>} fileName={string} label?={string} disabled?={boolean} />` — dipakai Task 5 (`FundamentalExportCard` wiring) dan Task 6 (`TechnicalExportSection`).

- [ ] **Step 1: Buat komponen**

```tsx
'use client';

import React, { useState } from 'react';
import { Download } from 'lucide-react';

interface ExportImageButtonProps {
  targetRef: React.RefObject<HTMLElement>;
  fileName: string;
  label?: string;
  disabled?: boolean;
}

// html-to-image di-import dinamis (bukan top-level) - sama pola dengan xlsx di
// app/admin/ExportButton.tsx - supaya library screenshot tidak masuk bundle awal
// halaman /fundamental atau /technical, cuma dimuat saat tombol ini benar-benar diklik.
export default function ExportImageButton({ targetRef, fileName, label = 'Export Gambar', disabled }: ExportImageButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    if (!targetRef.current) return;
    setLoading(true);
    try {
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(targetRef.current, { pixelRatio: 2, cacheBust: true });
      const link = document.createElement('a');
      link.download = fileName;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error('Export image error:', error);
      alert('Gagal export gambar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={disabled || loading}
      className="bg-tv-hover border border-tv-borderLight hover:bg-tv-borderLight px-3 py-1.5 rounded-full text-white text-xs font-bold flex items-center gap-2 transition-colors disabled:opacity-50"
    >
      <Download className="w-3 h-3" />
      {loading ? 'Mengekspor...' : label}
    </button>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: tidak ada error baru terkait `components/export/ExportImageButton.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/export/ExportImageButton.tsx
git commit -m "feat(export): tambah ExportImageButton reusable (html-to-image)"
```

---

## Task 5: Kartu fundamental + wiring ke `/fundamental`

**Files:**
- Create: `components/export/FundamentalExportCard.tsx`
- Modify: `app/fundamental/page.tsx`

**Interfaces:**
- Consumes: `fmtKali`, `fmtPersen`, `fmtTriliun` (Task 1), `ExportImageButton` (Task 4), `buildExportFileName` (Task 2).
- Produces: `<FundamentalExportCard ticker stock fundamentals profile consensus exportedAt />` — presentational only, dipakai satu tempat (`app/fundamental/page.tsx`).

- [ ] **Step 1: Buat `components/export/FundamentalExportCard.tsx`**

```tsx
import React from 'react';
import { fmtKali, fmtPersen, fmtTriliun } from '@/shared/format/fundamental-format';

interface FundamentalExportCardProps {
  ticker: string;
  stock: { symbol?: string; name?: string; current_price?: number; change_pct?: number };
  fundamentals: {
    marketCap?: number | null;
    trailingPE?: number | null;
    priceToBook?: number | null;
    returnOnEquity?: number | null;
    grossMargins?: number | null;
    totalRevenue?: number | null;
    nim?: number | null;
  };
  profile: { sector?: string; industry?: string; description?: string };
  consensus?: string;
  exportedAt: Date;
}

function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-tv-card border border-tv-border rounded-xl p-4">
      <div className="text-xs text-tv-muted uppercase font-mono">{label}</div>
      <div className="text-2xl font-number font-bold mt-1 text-white">{value}</div>
    </div>
  );
}

// Kartu export offscreen untuk /fundamental (lihat wiring di app/fundamental/page.tsx).
// Deteksi sektor bank SENGAJA disamakan persis dengan app/fundamental/page.tsx (cabang
// NIM vs Gross Margin) - kartu export tidak boleh menampilkan rasio yang beda logic
// dari tampilan asli untuk emiten yang sama.
export default function FundamentalExportCard({ ticker, stock, fundamentals, profile, consensus, exportedAt }: FundamentalExportCardProps) {
  const isBank = Boolean(profile.sector?.includes('Financial') || profile.industry?.includes('Bank'));
  const displaySymbol = ticker.replace('.JK', '');
  const timeLabel = exportedAt.toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }) + ' WIB';

  return (
    <div className="w-[1080px] h-[1350px] bg-tv-bg text-white p-16 flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-10">
          <div className="text-3xl font-heading font-extrabold text-tv-accent">SahamLens</div>
          <div className={`text-xl font-mono font-bold px-5 py-2 rounded-full border ${
            consensus?.includes('BULLISH') ? 'bg-tv-green/20 text-tv-green border-tv-green'
              : consensus?.includes('BEARISH') ? 'bg-tv-red/20 text-tv-red border-tv-red'
              : 'bg-tv-yellow/20 text-tv-yellow border-tv-yellow'
          }`}>{consensus || 'AWAITING'}</div>
        </div>

        <div className="mb-8">
          <div className="text-6xl font-heading font-extrabold">{displaySymbol}.JK</div>
          <div className="text-2xl text-tv-muted mt-2">{stock.name || displaySymbol}</div>
          <div className="flex items-center gap-4 mt-4">
            <span className="text-5xl font-mono font-bold">
              Rp {stock.current_price?.toLocaleString('id-ID') || '-'}
            </span>
            {typeof stock.change_pct === 'number' && (
              <span className={`text-2xl font-mono font-bold ${stock.change_pct >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
                {stock.change_pct > 0 ? '+' : ''}{stock.change_pct}%
              </span>
            )}
          </div>
        </div>

        <div className="text-sm font-mono text-tv-muted uppercase mb-2">Sektor &amp; Industri</div>
        <div className="text-xl font-bold mb-6">{profile.sector || '-'} / {profile.industry || '-'}</div>

        <div className="grid grid-cols-3 gap-5 mb-8">
          <MetricBox label="Market Cap" value={fmtTriliun(fundamentals.marketCap)} />
          <MetricBox label="P/E Ratio (TTM)" value={fmtKali(fundamentals.trailingPE)} />
          <MetricBox label="Price to Book" value={fmtKali(fundamentals.priceToBook)} />
          <MetricBox label="ROE" value={fmtPersen(fundamentals.returnOnEquity)} />
          {isBank ? (
            <>
              <MetricBox label="NIM" value={fmtPersen(fundamentals.nim)} />
              <MetricBox label="Revenue" value={fmtTriliun(fundamentals.totalRevenue)} />
            </>
          ) : (
            <>
              <MetricBox label="Gross Margin" value={fmtPersen(fundamentals.grossMargins)} />
              <MetricBox label="Revenue" value={fmtTriliun(fundamentals.totalRevenue)} />
            </>
          )}
        </div>

        {profile.description && (
          <div className="text-base text-tv-muted leading-relaxed line-clamp-3">{profile.description}</div>
        )}
      </div>

      <div className="text-xs font-mono text-tv-muted border-t border-tv-border pt-4">
        Data via SahamLens • {timeLabel}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wiring di `app/fundamental/page.tsx` — tambah import & ref**

Ganti baris import (saat ini, setelah Task 1, ada `import { fmtKali, fmtPersen, fmtTriliun } from '@/shared/format/fundamental-format';`) — tambahkan di bawahnya:

```tsx
import FundamentalExportCard from '@/components/export/FundamentalExportCard';
import ExportImageButton from '@/components/export/ExportImageButton';
import { buildExportFileName } from '@/shared/format/export-filename';
```

Ubah baris import React di paling atas dari:

```tsx
import React, { useState, useEffect, Suspense } from 'react';
```

menjadi:

```tsx
import React, { useState, useEffect, useRef, Suspense } from 'react';
```

Di dalam `FundamentalContent()`, setelah deklarasi state `showLoginPrompt` (sebelum `setTicker`), tambahkan:

```tsx
const fundamentalExportRef = useRef<HTMLDivElement>(null);
```

- [ ] **Step 3: Tambah tombol di badge status row**

Cari blok berikut (baris status badge, sebelum "Top Summary Banner"):

```tsx
          <button 
            onClick={handleRefresh}
            disabled={loading}
            className="bg-tv-hover border border-tv-borderLight hover:bg-tv-borderLight px-3 py-1.5 rounded-full text-white flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            Refresh Data
          </button>
        </div>
```

Ganti dengan (menambah tombol export setelah Refresh Data, disabled kalau `!data`):

```tsx
          <button 
            onClick={handleRefresh}
            disabled={loading}
            className="bg-tv-hover border border-tv-borderLight hover:bg-tv-borderLight px-3 py-1.5 rounded-full text-white flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            Refresh Data
          </button>
          <ExportImageButton
            targetRef={fundamentalExportRef}
            fileName={buildExportFileName('Fundamental', ticker)}
            label="Export Kartu Fundamental"
            disabled={!data}
          />
        </div>
```

- [ ] **Step 4: Render kartu offscreen**

Tepat setelah `</div>` penutup blok status badge di atas (sebelum komentar `{/* Top Summary Banner */}`), tambahkan:

```tsx
        {/* Kartu export offscreen - selalu di DOM (kalau data ada) supaya ExportImageButton
            punya node valid untuk di-screenshot, tapi tidak terlihat/tidak mengubah layout
            halaman (position absolute + geser jauh ke luar viewport). */}
        {data && (
          <div ref={fundamentalExportRef} style={{ position: 'absolute', left: -9999, top: 0 }}>
            <FundamentalExportCard
              ticker={ticker}
              stock={stock}
              fundamentals={data?.fundamentals || {}}
              profile={data?.profile || {}}
              consensus={data?.consensus}
              exportedAt={new Date()}
            />
          </div>
        )}
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: tidak ada error baru di `app/fundamental/page.tsx` atau `components/export/FundamentalExportCard.tsx`.

- [ ] **Step 6: Manual smoke test**

Run: `npm run dev`, buka `http://localhost:3000/fundamental?symbol=TLKM`, tunggu data termuat, klik "Export Kartu Fundamental". Verifikasi: file `SahamLens_Fundamental_TLKM_<tanggal-hari-ini>.png` ke-download, dibuka menampilkan ticker/harga/metrik yang cocok dengan angka di halaman.

- [ ] **Step 7: Commit**

```bash
git add components/export/FundamentalExportCard.tsx app/fundamental/page.tsx
git commit -m "feat(fundamental): tombol export kartu fundamental PNG"
```

---

## Task 6: Kartu teknikal + wiring ke `/technical/[symbol]`

**Files:**
- Create: `components/export/TechnicalExportCard.tsx`
- Create: `components/export/TechnicalExportSection.tsx`
- Modify: `app/technical/[symbol]/page.tsx`

**Interfaces:**
- Consumes: `ExportImageButton` (Task 4), `buildExportFileName` (Task 2).
- Produces: `<TechnicalExportSection symbol={string} council={any} buyPct={number} sellPct={number} holdPct={number} waitPct={number} />` — dipakai satu tempat di `CouncilDisplay` (`app/technical/[symbol]/page.tsx`).

- [ ] **Step 1: Buat `components/export/TechnicalExportCard.tsx`**

```tsx
import React from 'react';

interface Agent {
  name: string;
  signal: 'BUY' | 'SELL' | 'HOLD' | 'WAIT' | string;
}

interface TechnicalExportCardProps {
  symbol: string;
  finalSuggestion: string;
  summaryId?: string;
  buyPct: number;
  sellPct: number;
  holdPct: number;
  waitPct: number;
  agents: Agent[];
  score?: number | null;
  exportedAt: Date;
}

function signalColorClass(signal: string): string {
  if (signal === 'BUY') return 'bg-tv-green/20 text-tv-green border-tv-green/30';
  if (signal === 'SELL') return 'bg-tv-red/20 text-tv-red border-tv-red/30';
  if (signal === 'WAIT') return 'bg-tv-yellow/20 text-tv-yellow border-tv-yellow/30';
  return 'bg-tv-border text-tv-muted border-tv-border';
}

// Kartu export offscreen untuk /technical/[symbol] (lihat TechnicalExportSection untuk
// wiring). %BUY/SELL/HOLD/WAIT = vote riil 10 agent (dihitung di CouncilDisplay,
// app/technical/[symbol]/page.tsx) - BUKAN field "Confidence" yang sudah dihapus dari
// UI (2026-08-03) karena dulu angka karangan LLM tanpa formula.
export default function TechnicalExportCard({
  symbol, finalSuggestion, summaryId, buyPct, sellPct, holdPct, waitPct, agents, score, exportedAt,
}: TechnicalExportCardProps) {
  const displaySymbol = symbol.replace('.JK', '');
  const timeLabel = exportedAt.toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }) + ' WIB';

  return (
    <div className="w-[1080px] h-[1350px] bg-tv-bg text-white p-16 flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-10">
          <div className="text-3xl font-heading font-extrabold text-tv-accent">SahamLens</div>
          <div className="text-xl font-mono font-bold px-5 py-2 rounded-full border bg-tv-hover border-tv-borderLight text-white">
            LensAI
          </div>
        </div>

        <div className="mb-6">
          <div className="text-6xl font-heading font-extrabold">{displaySymbol}.JK</div>
          <div className="text-2xl text-tv-green mt-2 font-mono font-bold">{finalSuggestion}</div>
          {typeof score === 'number' && (
            <div className="text-lg text-tv-muted mt-1 font-mono">Skor Komposit: {score}/100</div>
          )}
        </div>

        {summaryId && (
          <div className="text-lg text-tv-muted leading-relaxed mb-8 line-clamp-3">{summaryId}</div>
        )}

        <div className="mb-2 text-sm font-mono text-tv-muted uppercase">Vote 10 Agent LensAI</div>
        <div className="flex w-full h-4 rounded-full overflow-hidden mb-3 bg-tv-border">
          {buyPct > 0 && <div style={{ width: `${buyPct}%` }} className="bg-tv-green" />}
          {holdPct > 0 && <div style={{ width: `${holdPct}%` }} className="bg-blue-500" />}
          {waitPct > 0 && <div style={{ width: `${waitPct}%` }} className="bg-tv-yellow" />}
          {sellPct > 0 && <div style={{ width: `${sellPct}%` }} className="bg-tv-red" />}
        </div>
        <div className="flex gap-4 text-base font-mono font-bold mb-8">
          {buyPct > 0 && <span className="text-tv-green">{buyPct}% BUY</span>}
          {holdPct > 0 && <span className="text-blue-500">{holdPct}% HOLD</span>}
          {waitPct > 0 && <span className="text-tv-yellow">{waitPct}% WAIT</span>}
          {sellPct > 0 && <span className="text-tv-red">{sellPct}% SELL</span>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {agents.slice(0, 10).map((agent, idx) => (
            <div key={idx} className="flex items-center justify-between bg-tv-card border border-tv-border rounded-lg px-4 py-2">
              <span className="text-sm font-bold truncate pr-2">{agent.name}</span>
              <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border shrink-0 ${signalColorClass(agent.signal)}`}>
                {agent.signal}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="text-xs font-mono text-tv-muted border-t border-tv-border pt-4">
        Data via SahamLens • {timeLabel}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Buat `components/export/TechnicalExportSection.tsx`**

```tsx
'use client';

import React, { useRef } from 'react';
import TechnicalExportCard from './TechnicalExportCard';
import ExportImageButton from './ExportImageButton';
import { buildExportFileName } from '@/shared/format/export-filename';

interface Agent {
  name: string;
  signal: string;
}

interface TechnicalExportSectionProps {
  symbol: string;
  finalSuggestion: string;
  summaryId?: string;
  buyPct: number;
  sellPct: number;
  holdPct: number;
  waitPct: number;
  agents: Agent[];
  score?: number | null;
}

// Wrapper client - CouncilDisplay (app/technical/[symbol]/page.tsx) adalah async server
// component yang fetch data council, tapi html-to-image (dipakai ExportImageButton) cuma
// bisa jalan di browser. Komponen ini menerima data council sebagai prop biasa (sudah
// serializable JSON) dari server lalu me-render tombol + kartu offscreen di client.
export default function TechnicalExportSection({
  symbol, finalSuggestion, summaryId, buyPct, sellPct, holdPct, waitPct, agents, score,
}: TechnicalExportSectionProps) {
  const exportRef = useRef<HTMLDivElement>(null);

  return (
    <>
      <ExportImageButton
        targetRef={exportRef}
        fileName={buildExportFileName('Technical', symbol)}
        label="Export Kartu Teknikal"
      />
      <div ref={exportRef} style={{ position: 'absolute', left: -9999, top: 0 }}>
        <TechnicalExportCard
          symbol={symbol}
          finalSuggestion={finalSuggestion}
          summaryId={summaryId}
          buyPct={buyPct}
          sellPct={sellPct}
          holdPct={holdPct}
          waitPct={waitPct}
          agents={agents}
          score={score}
          exportedAt={new Date()}
        />
      </div>
    </>
  );
}
```

- [ ] **Step 3: Wiring di `app/technical/[symbol]/page.tsx`**

Tambah import di bagian atas file (setelah import `PageContainer`):

```tsx
import TechnicalExportSection from '@/components/export/TechnicalExportSection';
```

Cari baris ini di dalam `CouncilDisplay` (return sukses, sebelum `<div className="space-y-6">`):

```tsx
  return (
    <div className="space-y-6">
      <div className="bg-tv-card border border-tv-border rounded-xl p-6">
        <h2 className="font-heading text-white font-bold mb-4">Final Suggestion</h2>
```

Ganti heading jadi flex row dengan tombol export di sebelah kanan:

```tsx
  return (
    <div className="space-y-6">
      <div className="bg-tv-card border border-tv-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading text-white font-bold">Final Suggestion</h2>
          <TechnicalExportSection
            symbol={symbol}
            finalSuggestion={council.final_suggestion}
            summaryId={council.summary_id}
            buyPct={buyPct}
            sellPct={sellPct}
            holdPct={holdPct}
            waitPct={waitPct}
            agents={agents}
            score={typeof council.score === 'number' ? council.score : null}
          />
        </div>
```

(Baris `{total > 0 && (...)}` dan seterusnya di bawahnya TIDAK berubah — cuma bungkus `<h2>` yang diganti jadi flex row berisi `<h2>` + `<TechnicalExportSection>`, sisanya tetap sama persis.)

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: tidak ada error baru di `app/technical/[symbol]/page.tsx`, `components/export/TechnicalExportCard.tsx`, `components/export/TechnicalExportSection.tsx`.

- [ ] **Step 5: Manual smoke test**

Run: `npm run dev`, buka `http://localhost:3000/technical/TLKM` (login/trial aktif supaya Council tidak 401/402), tunggu Council selesai, klik "Export Kartu Teknikal". Verifikasi: file `SahamLens_Technical_TLKM_<tanggal-hari-ini>.png` ke-download, %BUY/SELL/HOLD/WAIT di gambar sama dengan yang tampil di halaman, list agent lengkap.

- [ ] **Step 6: Commit**

```bash
git add components/export/TechnicalExportCard.tsx components/export/TechnicalExportSection.tsx app/technical/[symbol]/page.tsx
git commit -m "feat(technical): tombol export kartu teknikal PNG"
```

---

## Task 7: Verifikasi manual lintas skenario (checklist final)

Tidak ada infra test komponen React di repo ini (vitest jalan tanpa jsdom/testing-library, dipakai untuk logic/service/route saja — lihat `vitest.config.ts`), jadi verifikasi output visual PNG dilakukan manual sesuai spec (`docs/superpowers/specs/2026-08-05-fundamental-technical-export-card-design.md`, bagian "Testing / Verifikasi").

- [ ] **Step 1: Emiten non-bank** — `npm run dev`, buka `/fundamental?symbol=TLKM`, export. Cek grid metrik menampilkan Gross Margin + Revenue (bukan NIM).

- [ ] **Step 2: Emiten bank** — buka `/fundamental?symbol=BBCA`, export. Cek grid metrik menampilkan NIM + Revenue (bukan Gross Margin) — samakan dengan cabang yang tampil di kartu asli halaman itu.

- [ ] **Step 3: Field kosong** — cari 1 emiten dengan `trailingPE` null (emiten rugi berjalan, cek dulu di `/fundamental` mana yang menampilkan "N/A" di P/E card asli), export, pastikan kartu PNG juga menampilkan "N/A" pada field itu (bukan "0.00x").

- [ ] **Step 4: Teknikal** — buka `/technical/TLKM`, export, cek breakdown %BUY/SELL/HOLD/WAIT di PNG sama persis dengan angka di halaman (bandingkan langsung).

- [ ] **Step 5: Disabled state** — reload `/fundamental` dan langsung screenshot tombol sebelum data termuat (`loading && !data`) — tombol export harus disabled/tidak bisa diklik.

- [ ] **Step 6: Council gagal** — akses `/technical/TLKM` dalam kondisi logout (401) — pastikan `TechnicalExportSection` TIDAK dirender sama sekali (karena hanya dipasang di branch sukses `CouncilDisplay`), tidak ada tombol export yang error saat diklik dalam kondisi ini.

- [ ] **Step 7: Full regression cepat**

Run: `npx vitest run && npx tsc --noEmit`
Expected: semua PASS, tidak ada type error.

- [ ] **Step 8: Commit checklist (kalau ada catatan)**

Kalau semua langkah di atas lolos tanpa perubahan kode, tidak ada commit tambahan (checklist manual saja). Kalau ada bug ditemukan, fix dulu, tambah/perbaiki test kalau logic pure-function terdampak (Task 1/2), commit terpisah dengan pesan `fix(export): <deskripsi bug>`.
