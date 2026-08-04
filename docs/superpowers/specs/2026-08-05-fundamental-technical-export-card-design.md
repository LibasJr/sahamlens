# Export Kartu Fundamental & Teknikal (PNG) — Design Spec

**Tanggal:** 2026-08-05
**Konteks:** User minta output mirip infografis korporat (contoh: poster "Struktur Bisnis DGWG") — pilih emiten (mis. TLKM), export ringkasan jadi gambar. Infografis referensi berisi konten kualitatif/manual (pilar bisnis, diagram ekosistem, kekuatan perusahaan) yang tidak tersedia dari API manapun di codebase ini dan tidak scalable untuk semua emiten. Diputuskan (via AskUserQuestion): scope export = **kartu data fundamental/teknikal berbasis data real yang sudah ada di aplikasi**, bukan clone visual DGWG — layout menyesuaikan profil & angka laporan keuangan tiap emiten, bukan template kualitatif tetap.

## Keputusan

1. **Tidak ada data karangan.** Semua isi kartu diambil dari state yang sudah ter-fetch di halaman (`/fundamental`, `/technical/[symbol]`) — field kosong tampil `N/A`, konsisten dengan fix bug fabricated financial values sebelumnya (`app/fundamental/page.tsx` `fmtKali`/`fmtPersen`/`fmtTriliun`).
2. **Render client-side via `html-to-image`** (dynamic import), bukan server-side (satori/@vercel/og) dan bukan screenshot DOM asli (html2canvas). Alasan: data sudah ada di state client (no fetch tambahan/duplikasi di server), dan kartu perlu layout terpisah dari UI interaktif (biar gak kebawa tombol/scrollbar/hover state kalau di-capture apa adanya). Pattern dynamic import ini sudah dipakai `app/admin/ExportButton.tsx` untuk `xlsx`.
3. **Dua kartu terpisah**, satu per halaman, bukan satu kartu gabungan — karena sumber data beda tempat (fundamental: state client `/fundamental`; teknikal: data council yang di-fetch server-side di `CouncilDisplay`).
4. Ukuran kartu tetap **1080×1350px** (rasio portrait 4:5, ramah dibagi ke IG/WA story) di-render offscreen, di-screenshot dengan `pixelRatio: 2` biar tajam.
5. Tidak ada logo image — repo tidak punya asset logo (`Header.tsx`/`Sidebar.tsx` pakai text wordmark + ikon Lucide). Kartu pakai wordmark teks "SahamLens" konsisten sama brand yang ada, bukan logo palsu/generated.

## Komponen Baru

### 1. `components/export/ExportImageButton.tsx`
Reusable, dipakai kedua halaman.

```tsx
'use client';
type Props = { targetRef: React.RefObject<HTMLElement>; fileName: string; label: string; disabled?: boolean };
// dynamic import('html-to-image') saat diklik (sama pola ExportButton.tsx dynamic import xlsx)
// toPng(targetRef.current, { pixelRatio: 2, cacheBust: true }) -> dataURL -> trigger <a download>
// try/catch: alert('Gagal export gambar') + console.error, sama pola ExportButton.tsx
// state loading lokal, disable tombol saat proses render+download berlangsung
```

### 2. `components/export/FundamentalExportCard.tsx`
Presentational only, tidak fetch apapun. Props: `{ ticker, stock, fundamentals, profile, consensus }` — bentuk persis subset dari `data` yang sudah ada di `app/fundamental/page.tsx` (`stock = data?.stock`, dst).

Isi:
- Header: wordmark "SahamLens" + ticker (`displayTicker`) + nama emiten + harga + %chg (styling sama warna hijau/merah seperti card asli).
- Badge consensus (BULLISH/BEARISH/NEUTRAL) — styling identik `data?.consensus` di halaman asli.
- Grid metrik: Market Cap, P/E, PBV, ROE, lalu cabang sektor bank vs non-bank SAMA PERSIS logic yang sudah ada di `app/fundamental/page.tsx:387-410` (Gross Margin+Revenue non-bank, NIM+Revenue bank) — reuse formatter `fmtKali`/`fmtPersen`/`fmtTriliun` (export dari page atau pindah ke `shared/format/fundamental-format.ts` supaya tidak duplikasi, lihat "Refactor kecil" di bawah).
- Sektor/industri + potongan deskripsi profil (maks ~3 baris, `line-clamp-3`, karena kartu fixed height).
- Footer: watermark kecil `"Data via SahamLens • {timestamp export}"` — WIB, format sama `formatTime()` yang sudah ada di halaman.

Dirender **offscreen** (`style={{ position: 'absolute', left: -9999, top: 0 }}`) supaya selalu ada di DOM untuk di-screenshot tapi tidak mengganggu layout visual halaman.

### 3. `components/export/TechnicalExportCard.tsx`
Presentational only. Props: `{ symbol, finalSuggestion, summaryId, buyPct, sellPct, holdPct, waitPct, agents }` — subset dari `council` yang sudah dihitung di `CouncilDisplay` (`app/technical/[symbol]/page.tsx:94-107`).

Isi:
- Header: wordmark + symbol.
- Final suggestion + ringkasan `summary_id` (potong ~2-3 baris).
- Bar breakdown BUY/SELL/HOLD/WAIT % (vote riil 10 agent — **bukan** field "Confidence" yang sudah dihapus karena karangan, lihat komentar `app/technical/[symbol]/page.tsx:132-135`).
- List agent + signal (nama + badge signal saja, tanpa `reason` panjang — kartu punya tinggi tetap, reason bisa berbeda-beda panjang per agent dan bikin overflow).
- Footer watermark sama pola kartu fundamental.

### 4. `components/export/TechnicalExportSection.tsx`
`'use client'`, wrapper kecil yang menerima `council` (JSON serializable) sebagai prop dari `CouncilDisplay` (server component) lalu me-render `TechnicalExportCard` (offscreen, pakai `useRef`) + `ExportImageButton`. Diperlukan karena `toPng()`/`html-to-image` cuma bisa jalan di browser, sedangkan `CouncilDisplay` yang punya data `council` adalah async server component.

## Data Flow

**Fundamental:**
`app/fundamental/page.tsx` (sudah py state `data`) → passing subset props ke `FundamentalExportCard` (ref) + `ExportImageButton` — ditaruh di baris badge status, sebelah tombol "Refresh Data" (`app/fundamental/page.tsx:267-283`). Disabled kalau `!data` (sama syarat dengan render kartu fundamental yang sudah ada).

**Teknikal:**
`CouncilDisplay` (server, sudah fetch `council` di `getCouncilData`) → render `<TechnicalExportSection council={council} symbol={symbol} />` di dalam blok sukses (`app/technical/[symbol]/page.tsx:109` area, sebelum/sejajar heading "Final Suggestion"). Tidak butuh fetch tambahan — data council sudah lengkap di situ. Field `score` dari council dipakai kalau ada (optional, `council.score ?? null` → tampil `N/A` kalau tidak ada, TIDAK di-generate baru).

## Refactor Kecil (scope masuk, bukan tambahan terpisah)

Formatter `fmtKali`, `fmtPersen`, `fmtTriliun` saat ini didefinisikan lokal di `app/fundamental/page.tsx:26-28`. Dipindah ke `shared/format/fundamental-format.ts` dan diimport dari 2 tempat (page asli + `FundamentalExportCard`) — supaya kartu export TIDAK bisa punya rule format beda dari tampilan asli (mis. lupa update salah satu kalau formatnya berubah nanti).

## Error Handling

- `ExportImageButton`: try/catch di sekitar `toPng()` — gagal → `alert('Gagal export gambar')` + `console.error`, pola identik `ExportButton.tsx:51-54`.
- Tombol disabled selama proses (cegah klik ganda / render tumpang tindih).
- Kartu tidak pernah render dengan data kosong/undefined → tombol disabled duluan di level parent kalau `!data` (fundamental) atau council gagal/belum ada (teknikal, `TechnicalExportSection` cuma dipasang di branch sukses `CouncilDisplay`).

## File Naming

- `SahamLens_Fundamental_{TICKER}_{YYYY-MM-DD}.png`
- `SahamLens_Technical_{TICKER}_{YYYY-MM-DD}.png`

## Dependency Baru

`html-to-image` (npm) — perlu ditambah ke `package.json`. Dynamic import saat tombol diklik (bukan top-level import) supaya tidak masuk bundle awal halaman, sama alasan `xlsx` di `ExportButton.tsx`.

## Testing / Verifikasi

Manual (tidak ada test otomatis untuk output visual PNG):
1. Export TLKM di `/fundamental` — cek PNG kebuka, grid metrik non-bank (Gross Margin+Revenue) tampil benar.
2. Export BBCA (atau emiten sektor Financial/Bank lain) di `/fundamental` — cek cabang metrik bank (NIM+Revenue) yang muncul, bukan Gross Margin.
3. Export emiten dengan field fundamental kosong (mis. `trailingPE` null karena rugi) — pastikan kartu tampil `N/A`, bukan `0.00x`.
4. Export TLKM di `/technical/TLKM` — cek breakdown %BUY/SELL/HOLD/WAIT match badge di halaman asli, list agent lengkap.
5. Cek tombol disabled saat data belum load / council gagal (401/402/503).
6. Cek nama file hasil download sesuai pola `{TICKER}_{tanggal-hari-ini}`.
