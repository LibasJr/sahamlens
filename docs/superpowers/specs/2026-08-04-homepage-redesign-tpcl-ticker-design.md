# Homepage/Home Redesign + TP/CL Sinyal Ticker + Badge SEO Fix — Design Spec

**Tanggal:** 2026-08-04
**Konteks:** 3 permintaan revisi user digabung 1 spec (saling terkait, dikerjakan runtut):
1. Badge "Update tiap 5 menit • Yahoo Finance" di LensMarket (`/market-pulse`) — user bilang "tidak sesuai SEO".
2. Root `/` (`components/Dashboard.tsx`) dan `/home` (Beranda) tukar isi: 3 tabel Top Gainer/Loser/Volume di `/` dihapus diganti News; News di `/home` dihapus diganti 3 tabel Gainer/Loser/Volume (gaya sama dengan yang dihapus dari `/`).
3. Panel "Sinyal Cross Hari Ini" (Golden/Dead Cross) di `/` diganti running-text vertikal berisi level TP1/TP2 (Golden Cross) / CL1/CL2 (Dead Cross).

Audit kode (Explore agent, baca langsung file terkini) + audit feasibility ATR mengonfirmasi semua di bawah sebelum desain diputuskan.

## Keputusan (disetujui user via AskUserQuestion + konfirmasi akhir)

1. Badge Yahoo Finance **dihapus total** (bukan diganti teks lain) — info freshness data sudah cukup terwakili badge "Update: [jam]" di sebelahnya.
2. TP1/TP2/CL1/CL2 dihitung **berbasis ATR-14** (Average True Range, formula True-Range standar sama seperti `modules/technical/service/analyzers/volatility-analyzer.ts`): `TP1 = harga + 1×ATR`, `TP2 = harga + 2×ATR` (Golden Cross), `CL1 = harga - 1×ATR`, `CL2 = harga - 2×ATR` (Dead Cross). Dipilih karena `modules/recommendation/service/breakout.service.ts` SUDAH fetch OHLC 3 bulan (≥51 bar) per saham untuk deteksi crossover — ATR-14 bisa dihitung dari data yang sama tanpa fetch tambahan, dan formula ini sudah dipakai/dipercaya di tempat lain di codebase (bukan angka karangan, sesuai prinsip anti-klaim-palsu brand doc).
3. Running-text sinyal TP/CL menggantikan panel "Sinyal Cross Hari Ini" di **lokasi yang sama persis** (panel kanan Featured Chart Card, root `/`), isi gabungan Golden Cross (baris TP1/TP2) + Dead Cross (baris CL1/CL2), scroll **vertikal** (bukan horizontal — beda dari `TickerTape` yang sudah ada).
4. Widget News baru di `/` masuk **1 slot grid card biasa** (bukan section lebar terpisah), gaya visual disamakan card lain di grid tersebut.

## Bagian 1 — Fix Badge SEO

**File:** `app/market-pulse/page.tsx:212-214`

```tsx
// SEBELUM
            {isClient && (
              <Badge variant="neutral">Update tiap 5 menit • Yahoo Finance</Badge>
            )}
// SESUDAH
            {/* dihapus - "Yahoo Finance" tidak perlu terekspos ke publik/SEO, freshness
                data sudah terwakili badge "Update: [jam]" di sebelah kanan. */}
```

Tidak ada perubahan lain — badge "Update: {jam}" (baris 215-217) tetap ada.

## Bagian 2 — Swap Homepage `/` ↔ `/home`: Gainer/Loser/Volume ↔ News

### 2a. Komponen baru: `components/MarketMoverCard.tsx`

Ekstrak dari `components/Dashboard.tsx` (types `CardItem`/`CardDef`, `ACCENT_MAP`, fungsi `formatCardItems`, dan blok render card `components/Dashboard.tsx:606-663`) jadi 1 file reusable — dipakai identik oleh root `/` (3 card yang TERSISA: technical/technicalBearish/rsiOversold) dan `/home` (3 card BARU: gainer/loser/volume). Tanpa ekstraksi ini, ~130 baris JSX+logic ter-duplikasi 2 tempat.

```tsx
'use client';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { fadeUp } from '@/lib/motion';

export type CardItem = { code: string; change: string; value: string; dir: 'up' | 'down' | 'neutral'; href: string };
export type CardDef = { id: string; title: string; sub: string; accent: string; Icon: any; key: string; listPath: string };
export type MoverCard = CardDef & { items: CardItem[] };

export const ACCENT_MAP: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  green: { bg: 'bg-tv-green/10', text: 'text-tv-green', border: 'border-tv-green/25', dot: 'bg-tv-green' },
  red: { bg: 'bg-tv-red/10', text: 'text-tv-red', border: 'border-tv-red/25', dot: 'bg-tv-red' },
  blue: { bg: 'bg-tv-blue/10', text: 'text-tv-blue', border: 'border-tv-blue/25', dot: 'bg-tv-blue' },
  purple: { bg: 'bg-tv-purple/10', text: 'text-tv-purple', border: 'border-tv-purple/25', dot: 'bg-tv-purple' },
  warning: { bg: 'bg-tv-warning/10', text: 'text-tv-warning', border: 'border-tv-warning/25', dot: 'bg-tv-warning' },
  slate: { bg: 'bg-tv-hover', text: 'text-tv-muted', border: 'border-tv-border', dot: 'bg-tv-muted' },
};

export function formatCardItems(id: string, arr: any[]): CardItem[] {
  return (arr || []).slice(0, 4).map((s: any) => {
    const href = `/technical/${s.symbol}.JK`;
    const priceStr = `Rp ${Math.round(s.price || 0).toLocaleString('id-ID')}`;
    switch (id) {
      case 'gainer':
        return { code: s.symbol, change: `+${s.changePct.toFixed(2)}%`, value: priceStr, dir: 'up', href };
      case 'loser':
        return { code: s.symbol, change: `${s.changePct.toFixed(2)}%`, value: priceStr, dir: 'down', href };
      case 'volume':
        return { code: s.symbol, change: `${Math.round(s.volume / 100).toLocaleString('id-ID')} lot`, value: priceStr, dir: 'neutral', href };
      case 'technical':
        return { code: s.symbol, change: `Skor ${s.score}%`, value: `${s.changePct >= 0 ? '+' : ''}${s.changePct.toFixed(2)}%`, dir: 'up', href };
      case 'technicalBearish':
        return { code: s.symbol, change: `${s.changePct >= 0 ? '+' : ''}${s.changePct.toFixed(2)}%`, value: priceStr, dir: 'down', href };
      case 'rsiOversold':
        return { code: s.symbol, change: `RSI ${s.rsi.toFixed(1)}`, value: `${s.changePct >= 0 ? '+' : ''}${s.changePct.toFixed(2)}%`, dir: s.changePct >= 0 ? 'up' : 'down', href };
      default:
        return { code: s.symbol, change: '-', value: '-', dir: 'neutral', href };
    }
  });
}

export function MarketMoverCard({ card, lastUpdated, loaded }: { card: MoverCard; lastUpdated: string | null; loaded: boolean }) {
  const accent = ACCENT_MAP[card.accent] || ACCENT_MAP.slate;
  return (
    <motion.div variants={fadeUp} className="group relative rounded-lg border border-tv-border bg-tv-card p-5 shadow-1 hover:shadow-2 hover:-translate-y-0.5 transition-all">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`h-9 w-9 rounded-lg grid place-items-center border ${accent.bg} ${accent.border} ${accent.text}`}>
            <card.Icon className="h-4 w-4" />
          </div>
          <div>
            <h4 className="font-heading text-[13px] font-bold leading-tight tracking-tight text-tv-text max-w-[180px]">{card.title}</h4>
            <span className={`mt-0.5 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${accent.bg} ${accent.text}`}>{card.sub}</span>
          </div>
        </div>
        <span className={`h-2 w-2 rounded-full ${accent.dot}`} />
      </div>
      <div className="mt-4 divide-y divide-tv-border/60 rounded-lg border border-tv-border/60 overflow-hidden">
        {card.items.length === 0 && (
          <div className="bg-tv-card px-3 py-6 text-center text-[11px] text-tv-muted">
            {loaded ? 'Belum ada data untuk kategori ini' : 'Memuat data...'}
          </div>
        )}
        {card.items.map((it, idx) => (
          <Link key={it.code} href={it.href} className="flex items-center justify-between gap-2 bg-tv-card px-3 py-[11px] hover:bg-tv-hover transition">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-tv-surface text-[10px] font-bold text-white shrink-0">{idx + 1}</span>
              <span className="text-[12px] font-bold tracking-tight text-tv-text">{it.code}</span>
            </div>
            <div className="text-right shrink-0">
              <div className={`text-[12px] font-bold tracking-tight flex items-center justify-end gap-1 font-number ${it.dir === 'down' ? 'text-tv-red' : it.dir === 'up' ? 'text-tv-green' : 'text-tv-text'}`}>
                {it.dir !== 'neutral' && <span className={`h-1 w-1 rounded-full ${it.dir === 'down' ? 'bg-tv-red' : 'bg-tv-green'}`} />}
                {it.change}
              </div>
              <div className="text-[10px] font-medium text-tv-muted">{it.value}</div>
            </div>
          </Link>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-tv-muted">Update {lastUpdated || '--:--'} • IDX</span>
        <Link href={card.listPath} className="inline-flex items-center gap-1 text-[11px] font-bold text-tv-blue hover:text-tv-text transition">
          Lihat Seluruhnya <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
    </motion.div>
  );
}
```

Note: `card.sub` untuk `volume` sebelumnya `'Top Volume • Lot'` — dipertahankan verbatim di `CARD_DEFS` masing-masing halaman (tidak diubah di komponen ini, cuma dipindah).

### 2b. `components/Dashboard.tsx` — buang 3 card, tambah News

- **`CARD_DEFS`** (baris 17-24): hapus entri `gainer`, `loser`, `volume` (baris 18-20), sisa `technical`, `technicalBearish`, `rsiOversold`.
- **Import**: ganti `formatCardItems`/`ACCENT_MAP`/type lokal dengan `import { MarketMoverCard, formatCardItems, type MoverCard } from '@/components/MarketMoverCard';`, hapus definisi `CardItem`/`CardDef`/`Card`/`ACCENT_MAP`/`formatCardItems` lokal (baris 13-15, 28-55, 134-140-an — persis yang dipindah ke file baru).
- **Grid render** (baris 606-663): ganti body `.map()` jadi `<MarketMoverCard key={card.id} card={card} lastUpdated={lastUpdated} loaded={cardsLoaded} />`, plus tambah 1 elemen News sejajar (card ke-4) di grid yang sama.
- **State + fetch News baru** (setelah state `crossSignals` yang sudah ada):

```typescript
const [newsItems, setNewsItems] = useState<{ title: string; link: string; source: string; sentiment: string; pubDate: string }[]>([]);
const [loadingNews, setLoadingNews] = useState(true);

React.useEffect(() => {
  fetch('/api/news', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => setNewsItems((d?.items || []).slice(0, 6)))
    .catch(() => {})
    .finally(() => setLoadingNews(false));
}, []);
```

- **JSX News card** (di dalam grid `motion.div`, setelah `{marketCards.map(...)}`):

```tsx
<motion.div variants={fadeUp} className="rounded-lg border border-tv-border bg-tv-card p-5 shadow-1">
  <div className="flex items-center justify-between gap-3">
    <h4 className="font-heading text-[13px] font-bold text-tv-text">Berita Terkini</h4>
    <Link href="/news" className="text-[11px] font-bold text-tv-blue hover:text-tv-text transition">Lihat Semua</Link>
  </div>
  <div className="mt-4 divide-y divide-tv-border/60">
    {newsItems.length === 0 ? (
      <div className="px-1 py-6 text-center text-[11px] text-tv-muted">{loadingNews ? 'Memuat berita...' : 'Belum ada berita'}</div>
    ) : (
      newsItems.map((n) => (
        <a key={n.link || n.title} href={n.link} target="_blank" rel="noopener noreferrer" className="block py-2.5 first:pt-0 last:pb-0 hover:opacity-80 transition-opacity">
          <p className="text-[12px] font-medium text-tv-text leading-snug line-clamp-2">{n.title}</p>
          <p className="text-[10px] text-tv-muted mt-1">{n.source}</p>
        </a>
      ))
    )}
  </div>
</motion.div>
```

### 2c. `app/home/page.tsx` — buang News, tambah Gainer/Loser/Volume

- **Hapus** card "Berita & Sentimen Pasar" (baris 373-424) — beserta state `newsItems`/`loadingNews` dan fetch `/api/news` (baris 86-87, 130-134) dan helper `formatNewsDate` (baris 61-65, tidak dipakai lagi di file ini).
- **Sederhanakan** card "LensMarket" (baris 270-324): hapus grid 2-kolom Top Gainer/Top Loser (baris 297-320), sisakan cuma bagian IHSG (baris 283-296). `topGainers`/`topLosers` state TETAP ada (dipakai ulang di card baru).
- **Tambah fetch `topVolume`**: di `Promise.all` yang sudah fetch `/api/market-summary` (baris 95-106), tambah `setTopVolume((summary.topVolume || []).slice(0, 10));` (state baru `topVolume`, tipe `MarketMover & { volume: number }`).
- **Tambah 3 card baru** (`MarketMoverCard`, di grid baru setelah card "LensMarket"+"Jadwal Terdekat" yang sudah ada, menggantikan slot bekas card News yang dihapus):

```tsx
const HOME_CARD_DEFS: CardDef[] = [
  { id: 'gainer', title: 'Saham dengan Kenaikan Tertinggi', sub: 'Top Gainer', accent: 'green', Icon: TrendingUp, key: 'gainer', listPath: '/market/top-gainer' },
  { id: 'loser', title: 'Saham dengan Penurunan Terdalam', sub: 'Top Loser', accent: 'red', Icon: TrendingDown, key: 'loser', listPath: '/market/top-loser' },
  { id: 'volume', title: 'Berdasarkan Volume Lembar Saham', sub: 'Top Volume • Lot', accent: 'slate', Icon: BarChart3, key: 'volume', listPath: '/market/top-volume' },
];
const homeCards = HOME_CARD_DEFS.map((def) => ({
  ...def,
  items: formatCardItems(def.id, def.id === 'gainer' ? topGainers : def.id === 'loser' ? topLosers : topVolume),
}));
```

```tsx
<motion.div initial="hidden" animate="show" variants={staggerContainer} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-5">
  {homeCards.map((card) => (
    <MarketMoverCard key={card.id} card={card} lastUpdated={null} loaded={!loadingMarket} />
  ))}
</motion.div>
```

Import tambahan: `TrendingUp`, `TrendingDown`, `BarChart3` dari `lucide-react` (belum diimport di file ini — cek dulu, kalau sudah ada jangan dobel), `MarketMoverCard`, `formatCardItems`, `type CardDef` dari `@/components/MarketMoverCard`.

## Bagian 3 — TP1/TP2/CL1/CL2 + Running Text Vertikal

### 3a. Backend — `modules/recommendation/service/breakout.service.ts`

- **`RawSymbolSignal`** (baris 28-37): tambah field `atr: number | null`.
- **`CrossEntry`** (baris 22-26): tambah field `atr: number | null`.
- **Di dalam `analyzeSymbolForBreakout`**, setelah blok `low20`/`risk`/`reward`/`rr` (baris 133-136), sebelum `return`, tambah hitung ATR-14 dari `history` yang sudah ada (lowercase `high`/`low`/`close`, sudah dijamin ≥51 bar dari guard baris 82):

```typescript
    let trSum = 0;
    for (let i = history.length - 14; i < history.length; i++) {
      const high = history[i].high;
      const low = history[i].low;
      const prevClose = history[i - 1].close;
      const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
      trSum += tr;
    }
    const atr = trSum / 14;
```

  `return` (baris 138-147) tambah `atr,` di object literal.

- **`scanCrossSignals()`** (baris 189): `const entry = { symbol: r.symbol, price: r.currentPrice, change: r.changeStr, atr: r.atr };`

### 3b. Backend — `app/api/daily-picks/route.ts`

Baris 74-75, tambah `tp1`/`tp2` (golden) dan `cl1`/`cl2` (dead), null-safe (cache lama sebelum deploy ini belum punya field `atr` — TTL breakout-radar 3 hari, lihat `shared/cache/ttl-policy.ts`, jadi transisi sampai 3 hari cache lama tidak punya `atr` sampai cron berikutnya menimpa):

```typescript
      goldenCross: { ...category(crossSignals.golden, (s: any) => ({
        symbol: s.symbol.replace('.JK', ''),
        price: s.price,
        changePct: parseFloat(s.change),
        metric: 'Golden Cross',
        tp1: typeof s.atr === 'number' ? Math.round(s.price + s.atr) : null,
        tp2: typeof s.atr === 'number' ? Math.round(s.price + 2 * s.atr) : null,
      })), stale: breakoutStale, asOf: breakoutAsOf },
      deadCross: { ...category(crossSignals.dead, (s: any) => ({
        symbol: s.symbol.replace('.JK', ''),
        price: s.price,
        changePct: parseFloat(s.change),
        metric: 'Dead Cross',
        cl1: typeof s.atr === 'number' ? Math.round(s.price - s.atr) : null,
        cl2: typeof s.atr === 'number' ? Math.round(s.price - 2 * s.atr) : null,
      })), stale: breakoutStale, asOf: breakoutAsOf },
```

### 3c. Frontend — `components/Dashboard.tsx`

- **State `crossSignals`** (baris 280-299): perluas tipe + mapping untuk bawa `tp1`/`tp2`/`cl1`/`cl2`, DAN filter null di sisi client (cache transisi):

```typescript
const [crossSignals, setCrossSignals] = useState<{
  golden: { symbol: string; price: number; tp1: number; tp2: number }[];
  dead: { symbol: string; price: number; cl1: number; cl2: number }[];
} | null>(null);

React.useEffect(() => {
  fetch('/api/daily-picks')
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (!data || data.error) {
        setCrossSignals({ golden: [], dead: [] });
        return;
      }
      setCrossSignals({
        golden: (data.goldenCross?.detail || [])
          .filter((d: any) => d.tp1 != null && d.tp2 != null)
          .map((d: any) => ({ symbol: d.symbol, price: d.price, tp1: d.tp1, tp2: d.tp2 })),
        dead: (data.deadCross?.detail || [])
          .filter((d: any) => d.cl1 != null && d.cl2 != null)
          .map((d: any) => ({ symbol: d.symbol, price: d.price, cl1: d.cl1, cl2: d.cl2 })),
      });
    })
    .catch(() => setCrossSignals({ golden: [], dead: [] }));
}, []);
```

- **Komponen baru `VerticalSignalTicker`** (didefinisikan di `components/Dashboard.tsx`, dekat `TickerTape` yang sudah ada — pola sama, sumbu beda):

```tsx
function VerticalSignalTicker({ golden, dead }: {
  golden: { symbol: string; price: number; tp1: number; tp2: number }[];
  dead: { symbol: string; price: number; cl1: number; cl2: number }[];
}) {
  const items = [
    ...golden.map((s) => ({ ...s, type: 'golden' as const })),
    ...dead.map((s) => ({ ...s, type: 'dead' as const })),
  ];
  if (!items.length) {
    return <p className="text-[11px] text-tv-muted py-4 text-center">Belum ada sinyal TP/CL hari ini.</p>;
  }
  const loopItems = [...items, ...items];
  const durationSec = Math.max(20, Math.round(items.length * 2.5));
  return (
    <div className="relative flex-1 overflow-hidden min-h-[120px]">
      <div className="sahamlens-vticker-track flex flex-col" style={{ animationDuration: `${durationSec}s` }}>
        {loopItems.map((s, i) => (
          <Link
            key={`${s.type}-${s.symbol}-${i}`}
            href={`/technical/${s.symbol}.JK`}
            className="flex items-center justify-between gap-2 px-3 py-2 border-b border-tv-border/40 hover:bg-tv-hover/40 transition-colors shrink-0"
          >
            <span className="text-[12px] font-bold font-number text-tv-text">{s.symbol}</span>
            <span className="text-[11px] font-number text-tv-muted">Rp {Math.round(s.price).toLocaleString('id-ID')}</span>
            {s.type === 'golden' ? (
              <span className="text-[10px] font-bold font-number text-tv-green">TP1 {s.tp1.toLocaleString('id-ID')} • TP2 {s.tp2.toLocaleString('id-ID')}</span>
            ) : (
              <span className="text-[10px] font-bold font-number text-tv-red">CL1 {s.cl1.toLocaleString('id-ID')} • CL2 {s.cl2.toLocaleString('id-ID')}</span>
            )}
          </Link>
        ))}
      </div>
      <style dangerouslySetInnerHTML={{ __html: `
        .sahamlens-vticker-track { animation-name: sahamlens-vticker-scroll; animation-timing-function: linear; animation-iteration-count: infinite; }
        .sahamlens-vticker-track:hover { animation-play-state: paused; }
        @keyframes sahamlens-vticker-scroll { from { transform: translateY(0); } to { transform: translateY(-50%); } }
      `}} />
    </div>
  );
}
```

- **Ganti blok "Sinyal Cross Hari Ini"** (baris 537-594) — header + disclaimer + panggil komponen baru, TETAP di dalam wrapper `<div className="mt-5 pt-4 border-t border-tv-border flex-1 flex flex-col">` yang sama (posisi tidak berubah):

```tsx
<div className="mt-5 pt-4 border-t border-tv-border flex-1 flex flex-col">
  <h4 className="font-heading text-[12px] font-bold text-tv-text flex items-center gap-1.5">
    <TrendingUp className="w-3.5 h-3.5 text-tv-green" />
    Sinyal TP/CL Hari Ini
  </h4>
  <p className="text-[10px] text-tv-muted mt-1">
    Proyeksi ATR-14 dari sinyal Golden/Dead Cross - bukan jaminan harga akan tercapai.
  </p>
  {crossSignals === null ? (
    <p className="text-[11px] text-tv-muted py-4 text-center flex-1">Memuat sinyal...</p>
  ) : (
    <VerticalSignalTicker golden={crossSignals.golden} dead={crossSignals.dead} />
  )}
</div>
```

## Testing

- Grep sapu bersih: `"Yahoo Finance"` (harus hilang dari market-pulse), `"Sinyal Cross Hari Ini"` (harus hilang, ganti "Sinyal TP/CL Hari Ini"), `"Berita & Sentimen Pasar"` (harus hilang dari home/page.tsx).
- `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build` — standar tiap task, sama seperti fase-fase sebelumnya.
- Manual: buka `/` — cek grid cuma 4 card (technical/technicalBearish/rsiOversold/News), panel kanan Featured Chart nampilin running text vertikal jalan terus, pause pas di-hover, klik salah satu baris masuk ke `/technical/{symbol}.JK`. Buka `/home` — cek card Berita hilang, 3 card baru (Gainer/Loser/Volume) muncul gaya sama kayak yang di `/` dulu, card LensMarket cuma nampilin IHSG (gainer/loser lama hilang dari situ). Buka `/market-pulse` — badge Yahoo Finance hilang, badge "Update: [jam]" tetap ada.
- Verifikasi ATR: pilih 1 saham Golden Cross dari running text, bandingkan TP1/TP2 yang tampil dengan hitungan manual `harga + 1×ATR14`/`harga + 2×ATR14` (ATR bisa dicek lewat halaman LensTechnical saham yang sama, filter "Volatility (ATR 14)").
