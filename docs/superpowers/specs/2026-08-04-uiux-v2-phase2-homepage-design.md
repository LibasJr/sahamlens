# UI/UX V2 Total Redesign — Phase 2: Homepage (`/home`) — Design Spec

**Tanggal:** 2026-08-04
**Konteks:** Lanjutan [[sahamlens-uiux-v2-phase1-2026-08-04]] (App Shell, `TopMarketBar` global + Sidebar regroup, merged `42425c6`). Acuan `SahamLens_UI_UX_V2_Total_Redesign.txt` — HOMEPAGE V2: A. Market Pulse → B. Today's Opportunities (HERO) → C. LensRadar → D. Market Movers (tabs Gainers/Losers/Top Volume) → E. Market/Technical Insights → F. Watchlist Snapshot. "Dalam 5-10 detik user harus memahami kondisi pasar dan saham menarik."

Audit (Explore agent + direct file reads, kode terkini 2026-08-04 pasca Phase 1) menemukan realita berikut sebelum keputusan diambil:

- **Urutan sekarang** `app/home/page.tsx:264-638`: Header → AI briefing hero (teks naratif) → "Today's Opportunities" (list datar, bukan hero visual) → "LensMarket" (cuma IHSG) → [Jadwal Terdekat + LensRadar sejajar 1 baris] → Market Movers (tabs) → LensScanner teaser → LensWatch.
- **Today's Opportunities** (`:143-154`, render `:323-367`) pakai `/api/recommendations` — field: `ticker, price, changePct, consensus, confidence`. **Tidak ada nama perusahaan, tidak ada array alasan/reasons, tidak ada freshness per-item** di response ini — mission minta Hero punya "1-3 alasan" + freshness, data itu tidak ada di endpoint ini.
- **LensRadar section** (`:474-519`) pakai `/api/ai-pick` (`modules/recommendation/service/ai-pick.service.ts:56-76`, tipe `AiPickItem`) — field lengkap: `symbol, price, changePct, finalScore, flagged, flagReason, topReasons: string[], breakdown, tp1/tp2/cl1/cl2`. **Ini sumber data yang punya reasons**, cocok buat Hero. Response top-level (`app/api/ai-pick/route.ts:59-65`) juga punya `stale: boolean` + `computedAt: string` — pola freshness sudah dipakai identik di `app/breakout-radar/page.tsx:148` (`stale ? Badge "Data Sesi Terakhir" : Badge "Live"`).
- **Tidak ada field "signal" BUY/SELL** di `AiPickItem` — cuma `flagged`+`flagReason` (boolean + alasan kontradiksi, mis. "dead cross"/"teknikal bearish"). Item yang masuk list sudah difilter `finalScore >= 60` (`ai-pick.service.ts:8,121`, ambang sama dengan `getKategori()` BUY di `scoring.service.ts` — dikonfirmasi via komentar kode `ai-pick.service.ts:5-7`). **Tidak ada nama perusahaan** di sini juga.
- **`/api/market-pulse`** (`app/api/market-pulse/route.ts:31-35`) **Pro-gated (402 untuk non-Pro/anon)** — beda dengan Market Pulse card `/home` sekarang yang eksplisit publik (`app/home/page.tsx:113-114`, komentar "Ringkasan pasar (IHSG + top gainer/loser) - publik, tanpa gerbang Pro"). Response (`modules/market/service/market-pulse.service.ts:215-240`): `{timestamp, indices, sectorHeatmap: [{sector,color,changePct,marketCap,stocks}], breadth: {total,advancing,declining,unchanged,advanceDeclineRatio,topGainers,topLosers,topVolume,topValue}}`.
- **`dailyPicks`** (`app/home/page.tsx:78, 159-163`) sudah di-fetch dari `/api/daily-picks` tapi **cuma dipakai untuk teks AI briefing** (`:250-254`), tidak pernah dirender sebagai widget sendiri. Interface `DailyPickCounts` (`:44-49`) cuma mencakup `attractive/breakout/undervalue/foreignAccumulation` — **belum mencakup `goldenCross`/`deadCross`** yang sebenarnya sudah ada di response (`app/api/daily-picks/route.ts:74-89`, shape `{count, items, detail, stale, asOf}`, `detail` untuk golden berisi `tp1/tp2`, untuk dead berisi `cl1/cl2`).
- **Jadwal Terdekat** (`:428-468`) sejajar LensRadar dalam grid 2-kolom (`:422`) — komentar `:419-421` menjelaskan alasan lama (dua card sama-sama tinggi). LensRadar perlu naik urutan sendirian (bukan sejajar) supaya cocok hierarchy target.
- **LensScanner teaser** (`:573-588`) — CTA banner murni, tidak disebut namanya di HOMEPAGE V2 poin A-F, jadi diposisikan sebagai section tambahan non-inti.
- Semua section sudah pakai `Card/CardHeader/CardTitle/Badge/Skeleton/EmptyState/SegmentedControl/PageContainer` dari `components/ui` secara konsisten (dikonfirmasi, tidak perlu disentuh pola primitive-nya).

## Keputusan produk (hasil brainstorming, AskUserQuestion)

1. **Market Pulse — Pro-gated, konsisten pola lain di halaman ini.** Card diperluas dengan sector strength (ringkas, bukan full heatmap 11 sektor) + breadth (advancing/declining), fetch `/api/market-pulse`. Non-Pro/anonymous lihat `EmptyState` "Upgrade ke Pro" — pola identik `picksNeedPro`/`picksLoginRequired` yang sudah ada di "Today's Opportunities" (`:302-303, 336-341`). IHSG sendiri **dihapus dari card ini** (redundan — sudah tampil terus-menerus di `TopMarketBar` global sejak Phase 1) — bukan diganti, benar-benar dicabut dari card ini.
2. **Hero Opportunity — reuse `/api/ai-pick`.** Ganti sumber data "Today's Opportunities" dari `/api/recommendations` ke `/api/ai-pick` (sama seperti LensRadar section). Item pertama (finalScore tertinggi) jadi Hero (card besar, visual menonjol), sisa 5 item berikutnya jadi LensRadar list di bawahnya (index 1-5, **exclusive** — tidak duplikat item Hero). "Signal" Hero = badge dari `flagged`/`flagReason`: `!flagged` → `Badge variant="success"` teks "Sinyal Kuat", `flagged` → `Badge variant="danger"` teks `flagReason` (mis. "dead cross"). **Nama perusahaan TIDAK ditampilkan** — field itu tidak ada di `AiPickItem`, backend work terpisah, di luar scope fase presentation-only ini (dicatat sebagai gap, bukan dikarang).
3. **LensRadar — pindah ke section sendiri, tidak sejajar Jadwal Terdekat.** Grid 2-kolom (`:422`) dibongkar. LensRadar jadi section lebar sendiri, tampil setelah Hero. Sumber data tetap `/api/ai-pick` (fetch yang sama dengan Hero, `radarItems` di-slice `[1, 6)` bukan `[0, 5)` supaya tidak duplikat item Hero).
4. **Insights (baru) — widget dari `dailyPicks` yang sudah di-fetch.** Extend `DailyPickCounts` interface dengan `goldenCross`/`deadCross` (shape `{count: number; stale: boolean}` — cukup untuk widget ringkas, tidak perlu `detail`/`items` array penuh yang sudah dipakai widget lain). Card baru: 2 angka besar (jumlah sinyal Golden Cross hari ini, jumlah Dead Cross), badge freshness dari `stale`. Zero fetch baru — data sudah ada di state `dailyPicks`.
5. **Jadwal Terdekat pindah ke bawah, digabung sejajar Watchlist Snapshot** (grid 2-kolom, pola yang sama yang sebelumnya dipakai Jadwal+LensRadar). Konten card sendiri (`:428-468`) tidak berubah, cuma posisi.
6. **LensScanner teaser pindah ke paling bawah**, setelah Watchlist Snapshot+Jadwal grid — jadi CTA penutup, bukan menyela flow discovery→opportunity→insight.

## Urutan final `/home`

1. Header (unchanged)
2. AI briefing hero (unchanged — narasi Gemini, sudah ada, tidak masuk 6 section HOMEPAGE V2 tapi dipertahankan karena bukan bagian yang diminta diubah)
3. **Market Pulse** (diperluas: sector strength + breadth, Pro-gated, IHSG dicabut)
4. **Hero Opportunity** (baru — card besar, item #1 dari `/api/ai-pick`)
5. **LensRadar** (section lebar sendiri, item #2-6 dari `/api/ai-pick`)
6. **Market Movers** (unchanged — tabs Gainer/Loser/Volume/Bearish/RSI Oversold)
7. **Insights** (baru — Golden/Dead Cross count dari `dailyPicks`)
8. **Watchlist Snapshot + Jadwal Terdekat** (grid 2-kolom, digabung)
9. **LensScanner teaser** (dipindah ke paling bawah)

## Scope — Perubahan File

Semua perubahan di `app/home/page.tsx` (satu file). Tidak ada perubahan route, tidak ada endpoint baru, tidak ada formula/scoring/business-logic — murni rewiring data yang sudah ada + reorder + card baru presentation-only.

### 1. Interface & state

| # | Lokasi | Perubahan |
|---|---|---|
| 1 | `:28-34` `interface AiPick` | **Dihapus** — diganti reuse tipe `radarItems` yang sudah ada (`:85-87`) untuk Hero+LensRadar sekaligus. |
| 2 | `:44-49` `interface DailyPickCounts` | Tambah 2 field: `goldenCross: { count: number; stale: boolean }; deadCross: { count: number; stale: boolean };` |
| 3 | `:70` `const [aiPicks, setAiPicks] = useState<AiPick[]>([]);` | **Dihapus** — Hero+LensRadar sama-sama derive dari `radarItems` (state `:85-87` yang sudah ada). |
| 4 | `:71` `const [ihsg, ...]` state | **Dipertahankan** (masih dipakai `TopMarketBar`? **Tidak** — `ihsg` state ini lokal ke `/home`, dipakai AI briefing payload `:249`. Tetap dipertahankan untuk itu, TIDAK dihapus — cuma card render IHSG-nya di §3 yang dicabut). |
| 5 | `:143-154` fetch `/api/recommendations` | **Dihapus seluruhnya** — 401/402 handling-nya (yang tadinya set `picksNeedPro`/`picksLoginRequired`) **dipindah** ke `fetchRadar` (§2.9), bukan dihapus — 2 state ini (`:103-104`) SUDAH ADA, tetap dipakai, cuma sumber `setPicksNeedPro(true)`/`setPicksLoginRequired(true)`-nya pindah dari fetch lama ke `fetchRadar`. |
| 6 | `:101` `const [loadingPicks, setLoadingPicks] = useState(true);` | **Dihapus** — state ini cuma dipakai untuk fetch `/api/recommendations` yang sudah tidak ada. Semua pemakaian `loadingPicks` di JSX (Hero skeleton, AI briefing gate `:243`) diganti `loadingRadar` (`:88`, sudah ada, di-set oleh `fetchRadar`). |
| 7 | Baru, dekat state Market Pulse | `const [marketPulse, setMarketPulse] = useState<{ sectorHeatmap: {sector:string; color:string; changePct:number}[]; breadth: {advancing:number; declining:number; total:number} } | null>(null);` `const [marketPulseNeedPro, setMarketPulseNeedPro] = useState(false);` `const [marketPulseLoginRequired, setMarketPulseLoginRequired] = useState(false);` `const [marketPulseError, setMarketPulseError] = useState(false);` `const [loadingMarketPulse, setLoadingMarketPulse] = useState(true);` |

### 2. Fetch logic

| # | Lokasi | Perubahan |
|---|---|---|
| 8 | `:143-154` fetch `/api/recommendations` | **Dihapus total** (digantikan reuse `/api/ai-pick`, lihat #9). |
| 9 | `:185-196` `fetchRadar` (`useCallback`) | Perluas: tangani status 401/402 sama seperti pola `/api/recommendations` lama (`:145-146`) — `if (r.status === 401) { setPicksLoginRequired(true); return null; } if (r.status === 402) { setPicksNeedPro(true); return null; }` sebelum `r.ok ? r.json() : null`. `setRadarItems((d.items \|\| []))` — **jangan** `.slice(0, 5)` di sini lagi (dulu `:192`), slicing dipindah ke render time (Hero ambil index 0, LensRadar ambil index 1-6) supaya index konsisten antar 2 section dari 1 array yang sama. |
| 10 | Baru — `useCallback` terpisah (bukan inline di `useEffect`) supaya bisa dipanggil ulang dari tombol "Coba lagi", dipanggil sekali di `useEffect` yang sama dengan fetch lain (`:140-183`) | `const fetchMarketPulse = useCallback(() => { setLoadingMarketPulse(true); setMarketPulseError(false); fetch('/api/market-pulse', { cache: 'no-store' }).then((r) => { if (r.status === 401) { setMarketPulseLoginRequired(true); return null; } if (r.status === 402) { setMarketPulseNeedPro(true); return null; } if (!r.ok) { setMarketPulseError(true); return null; } return r.json(); }).then((d) => { if (d) setMarketPulse({ sectorHeatmap: d.sectorHeatmap, breadth: d.breadth }); }).catch(() => setMarketPulseError(true)).finally(() => setLoadingMarketPulse(false)); }, []);` — dipanggil via `fetchMarketPulse()` di dalam `useEffect` (`:140-183`), sama pola dengan `fetchMarket`/`fetchRadar` yang sudah ada. |
| 11 | `:159-163` fetch `/api/daily-picks` | Tidak berubah — response sudah membawa `goldenCross`/`deadCross`, tinggal `DailyPickCounts` interface (§1.2) yang diperluas supaya field itu ke-type dan bisa dirender. |
| 12 | `:224` `const topPick = aiPicks.find(...) \|\| aiPicks[0];` | Ganti jadi `const topPick = radarItems[0];` (dipakai AI briefing payload `:248` — field yang dipakai di situ cuma `ticker`/`consensus`/`confidence`, sesuaikan ke field `AiPickItem`: `topPick.symbol`, ganti `consensus`→pakai label turunan dari `flagged` sama seperti Hero §3.2, `confidence`→`topPick.finalScore`). |

### 3. JSX render — urutan baru

**3.1 Market Pulse** (ganti isi `:373-417`, posisi tetap sebelum Hero)

Header CardTitle tetap "LensMarket". Body:
- `marketPulseLoginRequired` → `EmptyState title="Login untuk melihat LensMarket" description="Sector & breadth butuh akun."`
- `marketPulseNeedPro` → `EmptyState title="Fitur Pro" description="Upgrade ke Pro untuk melihat sector strength & market breadth."`
- `marketPulseError` → `EmptyState title="Data pasar sementara tidak tersedia." action={{ label: 'Coba lagi', onClick: fetchMarketPulse }}` (pola sama `:382-386` yang sebelumnya dipakai IHSG block).
- `loadingMarketPulse` → `Skeleton` (pola sama `:387-391`)
- `marketPulse` ada isinya → render breadth ringkas (`advancing`/`declining`/`total`, format mis. "62 naik • 38 turun dari 100 saham") + top 3 sector dari `sectorHeatmap` (sudah terurut by marketCap dari backend, `.slice(0, 3)`) dengan `sector`+`changePct` (warna hijau/merah by sign).
- IHSG block (`:394-413` existing) **dihapus seluruhnya**.

**3.2 Hero Opportunity** (baru, ditempatkan setelah Market Pulse, sebelum LensRadar section)

```tsx
{/* Hero Opportunity - item #1 dari /api/ai-pick (sama sumber data dengan LensRadar
    di bawahnya, radarItems[0] vs radarItems.slice(1,6) supaya tidak duplikat). */}
<motion.div variants={fadeUp} initial="hidden" animate="show">
  <Card variant="default" padding="lg" className="border-tv-blue/30 shadow-2">
    {loadingRadar ? (
      <Skeleton className="h-24 w-full" />
    ) : picksLoginRequired ? (
      <EmptyState title="Login untuk melihat Today's Opportunities" description="Sinyal AI harian butuh akun." />
    ) : picksNeedPro ? (
      <EmptyState title="Fitur Pro" description="Upgrade ke Pro untuk melihat Today's Opportunities." />
    ) : radarError ? (
      <EmptyState title="Data pasar sementara tidak tersedia." action={{ label: 'Coba lagi', onClick: fetchRadar }} />
    ) : !radarItems[0] ? (
      <EmptyState title="Belum ada peluang kuat hari ini" description="Coba cek lagi nanti setelah jam bursa berjalan." />
    ) : (() => {
      const hero = radarItems[0];
      return (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-tv-gold" />
              <CardTitle>Today&apos;s Opportunities</CardTitle>
            </div>
            {radarStale ? <Badge variant="neutral" dot>Data Sesi Terakhir</Badge> : <Badge variant="danger" dot>Live</Badge>}
          </div>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-number text-2xl font-bold text-white">{hero.symbol.replace('.JK', '')}</span>
                {hero.flagged ? (
                  <Badge variant="danger">{hero.flagReason}</Badge>
                ) : (
                  <Badge variant="success">Sinyal Kuat</Badge>
                )}
              </div>
              <div className={`font-number text-sm mt-1 ${hero.changePct >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
                Rp {Math.round(hero.price).toLocaleString('id-ID')} ({hero.changePct >= 0 ? '+' : ''}{hero.changePct.toFixed(2)}%)
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-tv-muted uppercase tracking-wide">LensScore</div>
              <div className="font-number text-3xl font-bold text-tv-blue">{hero.finalScore}</div>
            </div>
          </div>
          {hero.topReasons.length > 0 && (
            <ul className="text-xs text-tv-muted space-y-1">
              {hero.topReasons.slice(0, 3).map((r, i) => <li key={i}>• {r}</li>)}
            </ul>
          )}
          <div className="flex gap-2 pt-1">
            <Link href={`/technical/${hero.symbol}`} className="px-3 py-1.5 rounded-md bg-tv-blue hover:bg-tv-blueHover text-white text-xs font-semibold transition-colors">
              Buka Analisis
            </Link>
            <button
              onClick={() => window.dispatchEvent(new Event('open-ai-chat'))}
              className="px-3 py-1.5 rounded-md bg-tv-blue/10 hover:bg-tv-blue/20 text-tv-blue text-xs font-semibold transition-colors"
            >
              Ask LensAI
            </button>
          </div>
        </div>
      );
    })()}
  </Card>
</motion.div>
```

`radarStale` = state baru, `const [radarStale, setRadarStale] = useState(false);`, di-set dari `d.stale` di `fetchRadar` (§2.9), dipakai badge Hero DAN opsional badge LensRadar section header (konsisten dengan `breakout-radar/page.tsx:148`).

**3.3 LensRadar section** (ganti grid 2-kolom `:419-520` — card LensRadar `:474-519` jadi section lebar sendiri, tanpa Jadwal Terdekat di sampingnya)

Isi card sama persis seperti sebelumnya (`:474-519`), hanya:
- Bungkus `<motion.div variants={fadeUp} initial="hidden" animate="show">` sendiri (bukan lagi anak dari `staggerContainer` grid `:422`) menggantikan grid 2-kolom yang dibongkar.
- `radarItems.map(...)` (`:495`) → `radarItems.slice(1, 6).map(...)` (skip index 0 yang sudah jadi Hero).
- `loadingRadar`/`radarError`/`radarItems.length === 0` checks (`:482-492`) — ganti kondisi kosong dari `radarItems.length === 0` jadi `radarItems.length <= 1` (karena index 0 terpakai Hero, "kosong" buat section ini berarti tidak ada sisa item).

**3.4 Market Movers** (`:522-569`) — **tidak berubah**, posisi tetap setelah LensRadar section.

**3.5 Insights** (baru, ditempatkan setelah Market Movers)

```tsx
{/* Insights - Golden/Dead Cross count dari dailyPicks (sudah di-fetch untuk AI
    briefing di atas, sekarang juga dirender sebagai widget sendiri). */}
<motion.div variants={fadeUp} initial="hidden" animate="show">
  <Card>
    <CardHeader>
      <div className="flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-tv-blue" />
        <CardTitle>Market Insights</CardTitle>
      </div>
      <Link href="/breakout-radar" className="text-[11px] text-tv-blue hover:underline">LensRadar</Link>
    </CardHeader>
    {loadingDailyPicks ? (
      <Skeleton className="h-16 w-full" />
    ) : !dailyPicks ? (
      <EmptyState title="Data insight sementara tidak tersedia." />
    ) : (
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-tv-bg/50 border border-tv-border rounded-md p-3">
          <div className="text-[10px] text-tv-muted uppercase tracking-wide">Golden Cross</div>
          <div className="font-number text-2xl font-bold text-tv-green mt-1">{dailyPicks.goldenCross.count}</div>
          {dailyPicks.goldenCross.stale && <div className="text-[10px] text-tv-warning mt-1">Data sesi terakhir</div>}
        </div>
        <div className="bg-tv-bg/50 border border-tv-border rounded-md p-3">
          <div className="text-[10px] text-tv-muted uppercase tracking-wide">Dead Cross</div>
          <div className="font-number text-2xl font-bold text-tv-red mt-1">{dailyPicks.deadCross.count}</div>
          {dailyPicks.deadCross.stale && <div className="text-[10px] text-tv-warning mt-1">Data sesi terakhir</div>}
        </div>
      </div>
    )}
  </Card>
</motion.div>
```

**3.6 Watchlist Snapshot + Jadwal Terdekat** (grid 2-kolom baru, gabung `:428-468` Jadwal + `:592-622` LensWatch)

```tsx
<motion.div initial="hidden" animate="show" variants={staggerContainer} className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
  <motion.div variants={fadeUp}>{/* isi Card Jadwal Terdekat, persis :429-467, tidak berubah */}</motion.div>
  <motion.div variants={fadeUp}>{/* isi Card LensWatch, persis :593-621, tidak berubah */}</motion.div>
</motion.div>
```

**3.7 LensScanner teaser** (`:573-588`) — dipindah ke posisi paling bawah, setelah §3.6, sebelum modal (`:624`). Isi tidak berubah.

## Risiko

- **Index-slicing Hero/LensRadar dari 1 array (`radarItems[0]` vs `.slice(1,6)`)**: kalau `radarItems` berubah antar render (refetch), harus dipastikan React key (`it.symbol`) tetap stabil per item — sudah begitu di kode existing, tidak perlu perubahan tambahan, cuma dicatat sebagai area yang harus diverifikasi manual (Hero dan baris pertama LensRadar list harus **beda saham**, bukan symbol yang sama muncul dobel).
- **Market Pulse jadi Pro-gated**: user non-Pro yang sebelumnya lihat IHSG di card ini sekarang lihat paywall — **perubahan behavior yang disengaja** (disetujui via AskUserQuestion), bukan regresi tak sengaja. IHSG tetap terlihat via `TopMarketBar` global (Phase 1), jadi user non-Pro tidak benar-benar kehilangan akses ke IHSG, cuma sector/breadth yang di-gate.
- **`topPick` dipakai AI briefing payload (`:248`)** berubah tipe dari `AiPick` (`consensus`/`confidence`) ke `AiPickItem` (`flagged`/`finalScore`) — payload `/api/ai-briefing` (`app/api/ai-briefing/route.ts`) perlu dicek field apa yang benar-benar dibaca di sana sebelum submit (`consensus`/`confidence` mungkin dipakai untuk narasi teks "STRONG BUY dengan confidence X%" — kalau field itu hilang, teks briefing bisa jadi aneh). **Wajib dicek saat implementasi**, bukan diasumsikan aman.

## Testing

- `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`.
- Grep sapu bersih: `/api/recommendations` tidak lagi dipanggil dari `app/home/page.tsx`, `interface AiPick` sudah tidak ada.
- Manual: buka `/home` login sebagai Pro — pastikan urutan Market Pulse→Hero→LensRadar→Movers→Insights→Watchlist/Jadwal→Scanner benar, Hero dan baris pertama LensRadar beda saham, freshness badge Hero konsisten dengan badge yang sama di `/breakout-radar`. Buka sebagai non-Pro/anon — pastikan Market Pulse paywall tampil, TopMarketBar tetap tampilkan IHSG. Buka Insights — bandingkan angka Golden/Dead Cross dengan `/breakout-radar` tab yang sama.
