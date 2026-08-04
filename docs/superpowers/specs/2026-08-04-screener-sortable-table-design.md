# LensScanner — Tabel Top 10 Bisa Di-sort per Kolom — Design Spec

**Tanggal:** 2026-08-04
**Konteks:** Tabel "Top 10 Saham" di `/screener` (`app/screener/page.tsx:91-203`) statis — tidak bisa diurutkan, cuma nampilin urutan ranking dari backend (`data.analysis.top_10_stocks`). User minta semua kolom bisa diklik buat sort naik/turun.

## Keputusan (disetujui user)

1. Klik header kolom → sort ascending. Klik kolom yang sama lagi → toggle descending. Klik kolom lain → reset ascending di kolom baru.
2. Kolom numerik (PER, Rev Growth, ROE, DER, Div Yield, 52W High, Harga, Volatilitas) sort numerik. Kolom teks (Ticker, Nama Emiten, Sektor, Bandarmology, Moat Rating, Signal, Pola Backtest, Sentimen Berita) sort alfabetis (`localeCompare`).
3. Kolom "#" TIDAK bisa diklik — tetap nomor urut 1..10 mengikuti posisi baru setelah sort (bukan rank asli dari backend).
4. Nilai `null`/`undefined` selalu di-push ke bawah terlepas arah sort (supaya data kosong tidak melompat-lompat).
5. Indikator visual: panah ▲ (ascending) / ▼ (descending) kecil di header kolom yang aktif di-sort; kolom lain tanpa panah, cuma cursor-pointer + hover style buat kasih tahu bisa diklik.
6. Murni client-side, `useMemo` di atas array `top10` (10 baris, murah dihitung ulang tiap render) — TIDAK ada perubahan ke `/api/screener` atau `screener.service.ts`.

## Arsitektur

Tambah 1 config array `SORTABLE_COLUMNS` di `app/screener/page.tsx` — satu sumber untuk key/label/align/accessor tiap kolom sortable, dipakai buat render `<th>` dan buat comparator, supaya nambah/ubah kolom sortable di masa depan cukup 1 tempat:

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
```

Kolom "#" tetap ditulis manual di `<thead>` (bukan bagian `SORTABLE_COLUMNS`, tidak clickable).

**State baru:** `sortKey: ColumnKey | null` (null = urutan asli dari backend), `sortDir: 'asc' | 'desc'`.

**Comparator generik** (satu fungsi, dipakai untuk semua kolom lewat `getValue`):

```typescript
function compareValues(a: string | number | null | undefined, b: string | number | null | undefined, dir: 'asc' | 'desc'): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;  // null selalu di bawah, terlepas arah
  if (b == null) return -1;
  const result = typeof a === 'number' && typeof b === 'number'
    ? a - b
    : String(a).localeCompare(String(b), 'id');
  return dir === 'asc' ? result : -result;
}
```

**Baris tabel:**

```typescript
const sortedRows = useMemo(() => {
  if (!sortKey) return top10;
  const col = SORTABLE_COLUMNS.find((c) => c.key === sortKey)!;
  return [...top10].sort((a, b) => compareValues(col.getValue(a), col.getValue(b), sortDir));
}, [top10, sortKey, sortDir]);
```

`tbody` yang sudah ada tetap sama persis, cuma `top10.map(...)` diganti `sortedRows.map(...)`.

**Handler klik header:**

```typescript
const handleSort = (key: ColumnKey) => {
  if (sortKey === key) {
    setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
  } else {
    setSortKey(key);
    setSortDir('asc');
  }
};
```

**Render `<th>`:** `<thead>` di-generate dari `SORTABLE_COLUMNS.map(...)` (ganti 16 `<th>` statis, kolom "#" tetap manual di depan) — tiap `<th>` jadi `<button onClick={() => handleSort(col.key)}>` isi label + panah kondisional kalau `sortKey === col.key`.

## Testing

Tidak ada test otomatis baru — codebase ini tidak punya preseden test untuk logic di dalam page component (`__tests__` yang ada semua untuk `modules/*/service`), dan menambah infra test React Testing Library baru untuk 1 fitur kecil bukan proporsional (YAGNI). Verifikasi manual: `npm run dev`, buka `/screener`, klik tiap header, cek urutan berubah benar (angka naik/turun, teks A-Z/Z-A), cek kolom dengan nilai N/A (mis. `pattern_tag` kosong) tetap di bawah di kedua arah, cek panah muncul di kolom aktif.

`npx tsc --noEmit` dan `npm run build` tetap wajib jalan sebelum commit (kode TypeScript baru harus typecheck bersih).
