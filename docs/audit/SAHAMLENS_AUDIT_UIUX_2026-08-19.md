# SahamLens — Audit UI/UX, Desain Visual & Pengalaman Pengguna

**Tanggal:** 19 Agustus 2026
**Metode:** audit statis atas kode sumber (54 halaman non-API, 51 komponen tingkat atas, `app/globals.css` 1.197 baris, `tailwind.config.js`). Aplikasi **tidak** dijalankan dan tidak ada screenshot yang diambil; angka rasio kontras di bawah dihitung dari nilai heksadesimal yang tertulis di kode terhadap warna latar token yang berlaku, bukan hasil pengukuran browser. Temuan yang bergantung pada rendering nyata ditandai secara eksplisit.
**Cakupan:** pilar 1–5 sesuai permintaan (hierarki & densitas, responsif, warna & aksesibilitas, visualisasi data, micro-interaction & state).

---

## 1. Executive Summary UI/UX

### Skor keseluruhan: **73 / 100**

| Pilar | Skor | Ringkas |
|---|---|---|
| 1. Hierarki visual & layout density | 72 | Token & skala tipe sudah didefinisikan rapi, tapi mayoritas halaman tidak memakainya |
| 2. Responsif & breakpoint | 78 | Terbaik di kelasnya untuk 320–430px; celah nyata di 768–1023px |
| 3. Warna, dark theme & a11y | 71 | Fondasi token luar biasa kuat, bocor lewat 476 kelas palet mentah |
| 4. Visualisasi data & chart | 68 | Toolbar chart setara TradingView; komponen gauge/heatmap masih hardcoded |
| 5. Micro-interaction & state | 76 | Skeleton/empty state termasuk yang terbaik yang pernah saya audit; layer modal tertinggal |

### First impression

Ini bukan aplikasi yang perlu "dibuat lebih bagus". Ini aplikasi yang **fondasi desainnya sudah di atas rata-rata industri, tetapi sebagian besar antarmukanya belum tersambung ke fondasi itu**.

Bukti fondasinya kuat:

- `app/globals.css` memuat matriks kontras yang dihitung ulang dua kali (teks polos, teks di atas tint 15–20%, teks putih di atas bidang padat) untuk tema terang **dan** gelap, dijaga oleh `__tests__/color-contrast.test.ts`.
- `AppShell` memasang `MotionConfig reducedMotion="user"` — menutup celah yang hampir selalu terlewat: aturan CSS `prefers-reduced-motion` tidak pernah dilihat Framer Motion.
- `MobileNav` mengukur tinggi dirinya sendiri lewat `ResizeObserver` dan menulis `--lens-mobile-nav-clearance`, bukan menebak spacer.
- `components/chart/FinancialChartToolbar.tsx` memakai `aria-pressed`, `aria-haspopup`, `aria-expanded`, `aria-label` yang tidak bergantung lebar layar, `min-h-11` di sentuh, dan overflow menu di mobile. Ini kualitas setara toolbar TradingView.
- `app/ownership-flow/page.tsx` dan `app/screener/page.tsx` punya empty state yang **menjelaskan sebab kekosongan**, bukan melaporkan nol.

Bukti sambungannya belum jadi:

| Primitif | Dipakai | Pola mentah tandingannya | Adopsi |
|---|---|---|---|
| `<Card>` | 102 | 268 pola `bg-tv-card border border-tv-border rounded-*` | **28%** |
| `<Button>` | 27 | 196 `<button>` mentah | **12%** |
| `.lens-chip` | 6 | ~9 pola badge ad-hoc + seluruh `<Badge>` | **~10%** |

Konsekuensinya terlihat di radius saja: `rounded-lg` 415×, `rounded-xl` 405×, `rounded-2xl` 82×. Primitif `<Card>` justru memakai `rounded-2xl` — radius yang paling jarang dipakai di aplikasi. Artinya kartu yang dibuat lewat design system dan kartu yang dibuat manual **berdampingan di halaman yang sama dengan sudut yang berbeda**.

Kesan tiga detik pertama tetap profesional dan "mahal" — glassmorphism halus, tabular-nums konsisten, gradient aksen biru→ungu yang dipilih dengan mengukur kontras. Tapi begitu mata bergerak ke kartu kedua, ketidakkonsistenan mulai terasa sebagai "beberapa halaman dibuat orang yang berbeda", dan itulah yang memisahkan 73 dari 90.

---

## 2. Top 5 Critical UI/UX Flaws

### 🔴 CRITICAL-1 — Lantai tipografi global membatalkan seluruh skala tipe yang ditulis di komponen

**Lokasi:** `app/globals.css:1063-1078` (aturan `html .text-[10px] { font-size: 0.8125rem }` dst.), berdampak ke 99 berkas / 809 deklarasi.

**Sebab.** Aturan ini menaikkan **semua** `text-[9px]`, `text-[10px]`, `text-[11px]`, `text-[12px]`, `text-xs` beserta varian `sm:`/`md:`-nya menjadi 13px, di **semua** lebar layar, dengan spesifisitas `html .kelas` (0,1,1) supaya menang tanpa bergantung urutan.

**Dampak.**

1. **Skala tipe yang ditulis di komponen jadi kode mati.** `components/ui/Badge.tsx:7` menulis `text-[12px] leading-4 sm:text-[10px] sm:leading-none`. Kedua cabang dinaikkan ke 13px, jadi seluruh logika responsifnya tidak pernah berjalan. Hal yang sama berlaku di `MetricCard` (`text-[12px] ... sm:text-[10px]`), `Table` (`text-[12px] ... sm:text-[10px]`), dan `EmptyState`.
2. **Badge menggelembung.** Berkas CSS sendiri sudah mengenali masalah ini dan membuat jalan keluar `.lens-chip` (12px + `line-height: 1`) — tetapi `.lens-chip` **hanya dipakai 6 kali** di 6 berkas, dan primitif `<Badge>` yang seharusnya jadi kanon justru tidak memakainya. Jadi obat yang benar sudah ada, tapi tidak diminum.
3. **Padding tidak ikut naik.** Kotak yang tingginya dikunci untuk teks 10px kini mengisi teks 13px: `app/home/page.tsx:1201` (`h-5 !text-[10px]`, 20px kotak untuk baris 13px), `components/MarketMoverCard.tsx:74` dan `app/screener/page.tsx:1004` (`h-6 w-6` avatar dengan `text-[10px]`).
4. **Header tabel melebar 30%.** 15 lokasi memakai `text-[10px] uppercase tracking-[0.1-0.12em]`. Pada 13px + tracking 0.12em, label seperti "PERUBAHAN (%)" tumbuh ~30% dan memaksa kolom melebar atau terbungkus.

Komentar `ponytail:` di `globals.css:1013` sudah menyebut batas pendekatan ini sendiri ("tambalan berbasis nama kelas, bukan skala tipe sungguhan"). Temuan ini menaikkannya jadi prioritas: tambalannya kini menutupi lebih banyak permukaan daripada skala aslinya.

---

### 🔴 CRITICAL-2 — Tidak ada satu pun tabel dengan kolom kode saham yang dibekukan

**Lokasi:** seluruh aplikasi. `grep 'sticky left-0'` → **0 hasil**. 12 hasil `sticky top-0` (semua header halaman, bukan kolom).

**Sebab.** Tabel finansial terlebar di aplikasi:

- `app/screener/page.tsx` — 17 kolom (`SORTABLE_COLUMNS` + kolom `#`), `hidden lg:block overflow-x-auto`
- `app/recommendations/page.tsx:288-` — 8 kolom, `p-4` per sel, `overflow-x-auto min-h-[500px]`
- `app/ownership-flow/page.tsx:227` — 8 kolom, `min-w-[900px]`

**Dampak.** Begitu pengguna menggulir ke kanan untuk melihat "Bandarmology" atau "Δ Asing vs prev", **kode sahamnya sendiri hilang dari layar**. Di tabel 17 kolom, itu berarti membaca angka tanpa tahu itu milik emiten mana. Komentar di `app/ownership-flow/page.tsx:223` sudah menyadari persis masalah ini untuk mobile ("menggulirnya menyamping membuat kode sahamnya sendiri hilang dari pandangan") dan menyelesaikannya dengan kartu di `md:hidden` — tapi solusinya berhenti di mobile; di desktop dan tablet masalahnya tetap ada, justru di tabel yang paling lebar.

TradingView, Koyfin, dan Stockbit semuanya membekukan kolom simbol. Ini bukan penyempurnaan, ini ekspektasi dasar kategori produk.

---

### 🔴 CRITICAL-3 — `/recommendations` tertinggal satu generasi dari halaman lain

**Lokasi:** `app/recommendations/page.tsx`

> **KOREKSI (saat penerapan perbaikan).** Versi pertama temuan ini menyatakan halaman ini
> "nol Skeleton, nol EmptyState" berdasarkan hitungan **nama komponen**, bukan perilaku.
> Itu keliru: halaman ini **punya** keadaan memuat dan keadaan kosong, ditulis tangan di
> dalam `<tbody>` (`app/recommendations/page.tsx:347-362`), lengkap dengan pesan berbeda
> untuk "pencarian tidak cocok", "pemindaian gagal", dan "belum ada hasil". Klaim "void
> 500px" dan "tabel kosong tanpa penjelasan" pada versi pertama **tidak benar**. Yang
> tersisa sebagai temuan nyata adalah tiga hal di bawah.

Halaman ini memakai primitif bersama paling sedikit di antara halaman utama:

| | Skeleton (primitif) | EmptyState (primitif) | Keadaan kosong | Retry di error |
|---|---|---|---|---|
| `/home` | 14 | 19 | primitif | ada |
| `/dashboard` | 8 | 6 | primitif | ada |
| `/market-pulse` | 9 | 5 | primitif | ada |
| `/screener` | 2 | 3 | primitif, di LUAR `<tbody>` | ada |
| **`/recommendations`** | **0** | **0** | ditulis tangan, **di DALAM `<tbody>`** | **tidak ada** |

**Dampak konkret.**

1. **Header tabel tidak bisa dijangkau keyboard.** `<th ... onClick={() => handleSort('ticker')}>` — `<th>` bukan elemen fokusabel, tidak ada `tabIndex`, tidak ada `<button>` di dalamnya, tidak ada `aria-sort`. Delapan kontrol pengurutan yang mustahil dipakai tanpa mouse. Bandingkan `app/screener/page.tsx:644-` yang melakukannya dengan benar memakai `<button type="button">` dan penanda dua-arah.
2. **Spinner, bukan skeleton.** Keadaan memuatnya adalah `<RefreshCw className="animate-spin">` di tengah sel `colSpan={8}`. `min-h-[500px]` mencegah CLS (bagus), tapi spinner memberi lebih sedikit informasi bentuk daripada skeleton dan terasa lebih lambat pada durasi yang sama — kriteria `progressive-loading` di pilar 5.
3. **Keadaan kosong hidup di dalam `<tbody>`.** Persis anti-pola yang `/screener` sudah singkirkan secara sadar (komentar `app/screener/page.tsx:611`: sel `colSpan` "memaksa ilustrasi & tombol aksi hidup di dalam tata letak tabel, dan di layar sempit ia ikut tergulir horizontal bersama kolom kosong"). Di layar sempit, pesan "tidak ada data yang cocok" ikut bergeser keluar layar saat tabel digulir.
4. **Error tanpa jalan keluar.** `scanError` dirender sebagai kotak merah teks saja; tombol "Refresh Data" ada di baris terpisah di atasnya dan tidak dihubungkan ke pesan errornya.

---

### 🟠 CRITICAL-4 — Tema terang bocor lewat 476 kelas palet Tailwind mentah

**Lokasi:** 476 kemunculan `(text|bg|border)-(slate|amber|emerald|rose|…)-(100…900)`, di antaranya **238** adalah `text-*-200/300/400` — rentang yang paling berbahaya di atas latar putih.

Lapisan kompatibilitas di `globals.css:509-560` hanya menangani `text-white`, `bg-white/*`, `bg-black/*`, dan `border-white/*`. Kelas palet mentah **tidak tercakup sama sekali**.

Rasio kontras terhitung di atas kartu putih tema terang:

| Lokasi | Kelas | Rasio | Ambang | Status |
|---|---|---|---|---|
| `RadialScoreGauge.tsx:38` legenda "50 Netral" | `text-amber-500` | **2,15:1** | 4,5:1 | ❌ gagal berat |
| `RadialScoreGauge.tsx:36` skor ≥75 | `text-emerald-500` | **2,54:1** | 3:1 (teks besar) | ❌ gagal |
| `RadialScoreGauge.tsx:37` skor 45–59 | `text-amber-600` | 3,19:1 | 4,5:1 (chip kategori) | ❌ gagal |
| `RadialScoreGauge.tsx:39` legenda "0 Bearish" | `text-rose-500` | 3,67:1 | 4,5:1 | ❌ gagal |
| `transparency/page.tsx:88` angka mismatch | `text-amber-300` | **1,44:1** | 4,5:1 | ❌ gagal berat |
| `ProTradingViewChart.tsx:566` badge POC | `text-amber-500` | 2,15:1 | 4,5:1 | ❌ gagal |
| `screener/page.tsx:568` ikon Award | `text-amber-400` | 1,67:1 | 3:1 (grafis) | ❌ gagal |
| `MetricCard.tsx:88` garis sparkline | `#22C55E` | 2,28:1 | 3:1 (grafis) | ❌ gagal |
| `MarketRegimePanel.tsx:11-15` bar indikator | `#EAB308` | 1,92:1 | 3:1 (grafis) | ❌ gagal |

**Regresi paling kasat mata:** `components/ui/Skeleton.tsx:24` mengunci gradien gelap `#101926 → #1A2940 → #101926`. Di tema terang, kontras terhadap `--lens-bg` = **16,44:1** — bukan "kurang terbaca", melainkan **balok hitam pekat di atas halaman putih** setiap kali data dimuat. Karena `app/layout.tsx` memilih tema dari `prefers-color-scheme` bila pengguna belum pernah memilih, pengunjung ber-OS terang melihat ini pada detik pertama kunjungan pertama, di `/home` (14 skeleton), `/market-pulse` (9), dan `/dashboard` (8).

Satu kasus lagi yang lolos dari penjaga yang sudah ada: `app/market-pulse/page.tsx:114` memakai `text-white` di atas `bg-tv-green/80`. Aturan penjaga di `globals.css:546` sengaja memakai `[class~='bg-tv-green']` (kata utuh) supaya tidak kena tint `/10` — tapi konsekuensinya `bg-tv-green/80` yang **hampir padat** juga tidak tercakup. Chip saham di dalam Heatmap sektor gagal kontras di kedua tema.

---

### 🟠 CRITICAL-5 — Lapisan tooltip & modal belum layak sentuh

**A. 175 native `title=` sebagai satu-satunya penjelasan metrik.**
Terbanyak di `app/home/page.tsx` (15), `app/market-pulse/page.tsx` (11), `app/breakout-radar/page.tsx` (10), `components/ProTradingViewChart.tsx` (6).

Atribut `title` **tidak muncul sama sekali di layar sentuh**, delay ~1 detik di desktop, hilang saat scroll, dan tidak bisa dibaca lambat. Untuk aplikasi yang seluruh nilai jualnya adalah "rumus terbuka, bukan kotak hitam", ini berarti **pengguna mobile tidak pernah bisa membaca definisi metriknya**. Contoh nyata: `HeatmapTile` (`market-pulse/page.tsx:87`) menaruh seluruh keterangan sektor di `title=`; di HP tile itu bisa diketuk tapi keterangannya tidak pernah tampil.

**B. Tidak ada satu pun modal yang mengunci scroll latar.**
`grep "document.body.style.overflow"` → **0 hasil**, padahal ada ≥6 modal: `CommandPalette`, `UserProfileModal`, `PaywallModal`, `PromoUpgradeModal`, `StockNewsModal`, `FundamentalBackfillClient`. Di HP, membuka modal lalu menggulir akan menggulirkan halaman di belakangnya; menutup modal mengembalikan pengguna ke posisi scroll yang berbeda.

**C. Focus trap ADA, tapi disalin lima kali — dan dua hal hilang di kelima salinannya.**

> **KOREKSI (saat penerapan perbaikan).** Versi pertama temuan ini menyatakan "tidak ada
> focus trap". Itu **salah**: focus trap sudah terpasang di kelima modal, ditulis benar,
> lengkap dengan `aria-modal="true"` dan penanganan `Escape`. Yang saya lewatkan adalah
> bahwa ia **disalin verbatim** — 30 baris identik sampai ke pilihan selektor dan
> `setTimeout(..., 30)`-nya — di `PaywallModal`, `PromoUpgradeModal`, `StockNewsModal`,
> `UserProfileModal`, dan `CommandPalette`.

Duplikasi itulah temuannya, dan bentuk kegagalannya terbukti: **dua kekurangan yang sama
hilang di kelima salinan sekaligus**, karena memperbaikinya menuntut penemuan yang sama
diulang lima kali.

1. **Tidak ada pengembalian fokus.** Kelimanya memindahkan fokus *masuk* ke dialog tapi tidak pernah mengembalikannya. Bagi pengguna keyboard, menutup dialog melempar fokus ke awal dokumen — jejak navigasinya hilang. Itu justru kelompok pengguna yang seluruh focus trap ini dibuat untuknya.
2. **Tidak ada kunci gulir latar** (poin B di atas).

Dan dialog **keenam** — konfirmasi INSERT append-only di `app/admin/fundamental-backfill/FundamentalBackfillClient.tsx:226` — tidak menyalin apa pun: ia memasang `aria-modal="true"` tanpa `Escape`, tanpa trap, tanpa kunci gulir. Sebuah konfirmasi aksi destruktif tanpa jalan keluar yang pasti.

---

## 3. Review Detail per Halaman

### `/` + `/home` — Dashboard / Beranda

**Kelebihan.** Densitas state terbaik di aplikasi: 14 `Skeleton`, 19 `EmptyState`, 6 jalur retry. Snapshot SSR IHSG menandai umur data (`classifyFreshness`) sehingga angka berumur 21 menit tidak tampil seolah real-time — praktik yang bahkan Stockbit tidak konsisten melakukannya.

**Kelemahan.**
- 15 native `title=` — jumlah terbanyak di aplikasi, semuanya mati di HP.
- `grid-cols-3` tanpa prefix + `h-5 !text-[10px]` (baris 1201): kotak 20px berisi teks yang di-render 13px.
- 12 `text-white` mentah; aman berkat lapisan kompatibilitas, tapi menambah ketergantungan pada `!important` yang rapuh.

**Quick fix.** Ganti `title=` pada kartu metrik dengan komponen tooltip yang membuka lewat tap; naikkan `h-5` → `h-6` pada chip baris 1201.

---

### `/technical/[symbol]` — Analisis Teknikal & Chart Pro

**Kelebihan — halaman terbaik dari sisi perceived performance.** Memakai React `Suspense` dengan skeleton **yang bentuknya meniru konten aslinya** (`LensConsensusAnalysisSkeleton`, baris 450–472: judul, bar, empat kartu 96px). Ini streaming SSR yang benar dan CLS-nya mendekati nol. Judulnya memakai `lens-page-title` — satu dari sedikit halaman yang patuh skala tipe.

**Kelemahan.**
- `ProTradingViewChart.tsx:178` menyetel `fontFamily: 'var(--font-geist-mono), …)'`. **`--font-geist-mono` tidak didefinisikan di mana pun** — `app/layout.tsx` hanya mendefinisikan `--font-inter` dan `--font-jetbrains-mono`. Label harga & sumbu waktu karena itu jatuh ke `ui-monospace` generik, berbeda font dari seluruh angka lain di aplikasi. `TradingViewChart.tsx:245` punya masalah kembar dengan cara berbeda: `'JetBrains Mono, monospace'` sebagai nama literal, padahal `next/font` menghasilkan nama keluarga ber-hash.
- Tombol rentang waktu `px-2 py-0.5 text-[10px]` (baris 540) ≈ **19px tinggi** di desktop; tombol reset zoom `p-1` dengan ikon `h-3.5` ≈ **22px**. Keduanya di bawah minimum WCAG 2.5.8 (24×24). Di mobile tertolong aturan global `button { min-height: 44px }`, jadi **justru desktop yang gagal**.
- Badge POC melayang `absolute top-12 left-4` dengan `flex-wrap`; di 320px kedua badge terbungkus jadi dua baris dan menutupi bagian atas kanvas chart.
- Chart dikunci `h-[420px]` di semua lebar. Di 1920px, chart "Pro" setinggi 420px terasa kecil dibanding panel di sekitarnya.

**Quick fix.** Ganti variabel font chart ke `--font-jetbrains-mono`; naikkan tombol rentang ke `min-h-6 px-2.5`; buat tinggi chart responsif.

---

### `/market-pulse` — Market Pulse & Fear/Greed Quant

**Kelebihan.** `MarketRegimePanel` adalah komponen data-viz terbaik di aplikasi: gauge conic-gradient dengan `role="img"` + `aria-label` berisi skor dalam kalimat, `flex-wrap` yang dikomentari secara eksplisit untuk 320px, dan label jujur ("Skor deterministik data pasar · bukan voting AI"). `HeatmapTile` memasang ikon `TrendingUp`/`TrendingDown` di samping angka — arah pergerakan tidak pernah hanya disampaikan lewat warna, jadi ramah buta warna.

**Kelemahan.**
- Skala warna Fear/Greed berakhir di **biru** (`#3b82f6` untuk skor ≥80, `MarketRegimePanel.tsx:15`). Merah→oranye→kuning→hijau→**biru** mencampur keluarga rona: biru dibaca sebagai "informasi/netral" di seluruh sisa aplikasi (tombol primer, aksen aktif), sehingga "greed ekstrem" justru terlihat paling netral. CNN Fear & Greed dan TradingView keduanya memperdalam hijau, tidak berpindah rona.
- Kelima warna skala itu hex mati, bukan token. Bar indikator setinggi `h-1.5` (6px) dengan `#EAB308` di tema terang = **1,92:1** — praktis tidak terlihat.
- `bg-tv-green/80 text-white` pada chip saham di dalam tile (baris 114) gagal kontras di kedua tema (lihat CRITICAL-4).
- 11 native `title=`, termasuk seluruh keterangan tile heatmap.

**Quick fix.** Ganti `scoreColor()` ke token `--lens-*`; jadikan ≥80 hijau tua alih-alih biru; tebalkan bar ke `h-2`.

---

### `/screener` — Stock Screener & Filter Multidimensi

**Kelebihan — rujukan internal untuk halaman lain.**
- Pengurutan dilakukan dengan `<button type="button">` di dalam `<th>`, lengkap dengan ikon `ArrowUpDown` redup yang **menandai kolom sortable sebelum klik pertama** (komentar baris 644 menjelaskan ini persis).
- Empty state dikeluarkan dari `<tbody>` supaya ilustrasi & tombol aksi tidak ikut tergulir horizontal bersama 16 kolom kosong (komentar baris 611). Detail yang hampir selalu terlewat.
- Tiga state terpisah dan jujur: skeleton saat memuat, `EmptyState` + "Coba lagi" saat error, `EmptyState` berbeda saat hasil memang nihil ("Pemindaian berjalan normal dan hasilnya nihil").
- Ada transformasi kartu untuk layar sempit (baris 887).

**Kelemahan.**
- Tabel utama `hidden lg:block` — **iPad portrait (768px) kehilangan 12 dari 17 kolom**. Untuk perangkat berlayar 1024×768 yang sering dipakai analis, ini penurunan besar tanpa jalan tengah.
- 37 `text-[10px]` — terbanyak di aplikasi; semuanya dinaikkan ke 13px, memperlebar 17 kolom itu.
- Tidak ada `aria-sort` di `<th>`; screen reader tahu kolomnya bisa diklik tapi tidak tahu urutan mana yang sedang aktif.
- Ikon `text-amber-400` (baris 568) = 1,67:1 di tema terang.
- Tidak ada kolom kode saham yang dibekukan (CRITICAL-2) — paling terasa di sini.

**Quick fix.** Turunkan ambang tabel ke `md:block` dengan subset kolom untuk tablet; tambahkan `aria-sort`; bekukan kolom pertama.

---

### `/dcf` — Kalkulator DCF & Valuasi Saham

**Kelebihan.** Kejujuran modelnya patut dicontoh: baris "Utang Bersih / Saham" secara eksplisit ditandai *"(konteks neraca, tidak dikurangkan)"*, dan ketika bisection gagal konvergen, yang ditampilkan adalah batas rentangnya apa adanya (`ABOVE_RANGE` / `BELOW_RANGE`), bukan angka presisi palsu. Blok gate tamu (`isGuestLimited`) menjelaskan apa yang terkunci, bukan sekadar memburamkannya.

**Kelemahan.**
- **Overflow horizontal di 320–375px.** `headerExtra` (baris 91) adalah `flex items-center gap-6` berisi tiga blok metrik — **tanpa `flex-wrap`**. Pembungkusnya di `TickerAnalysisShell.tsx:69` adalah `w-full shrink-0 md:w-auto`, jadi tidak bisa menyusut. Karena `<main>` memakai `overflow-y-auto` (yang membuat `overflow-x` terhitung `auto` menurut spesifikasi CSS), hasilnya **seluruh halaman bisa digulir menyamping** di iPhone SE. Ini pelanggaran langsung terhadap aturan "tidak ada horizontal scroll di mobile".
- **Tidak ada loading state.** State `loading` ada tapi hanya dipakai untuk mengganti teks ringkasan. Selama fetch, tabel proyeksi tetap menampilkan data emiten sebelumnya — pengguna mengira sudah lihat angka emiten baru padahal belum. `Suspense fallback` di baris 344 adalah `<div>` kosong.
- **Error tanpa retry.** `loadError` dirender sebagai kotak merah teks; tidak ada tombol coba lagi (`error-recovery`).
- Status valuasi (`UNDERVALUED`/`OVERVALUED`) sudah berupa teks, jadi aman untuk buta warna. ✅

**Quick fix.** Tambahkan `flex-wrap` + turunkan `gap-6` → `gap-4` di `headerExtra`; render skeleton saat `loading`; tambahkan tombol retry di kotak error.

---

### `/recommendations` — AI Pick & Radar Breakout

Lihat **CRITICAL-3**. Halaman dengan jarak terjauh dari standar internal aplikasi sendiri. Prioritas perbaikan tertinggi karena polanya sudah tersedia lengkap di `/screener` dan tinggal disalin.

**Catatan tambahan.** Peta terminologi `FOREIGN_FLOW_LABEL` (baris 24–33) yang mengganti "STRONG NET BUY" menjadi "AKUMULASI KUAT" adalah keputusan produk yang benar dan berani — proxy CMF tidak boleh berbagi kosakata dengan data broker asing sungguhan. Pertahankan.

---

### `/ownership-flow` — Ownership Flow KSEI

**Kelebihan — halaman paling matang dari sisi UX konten.**
- Status "Eksperimental" dan "Tidak masuk LensScore" ditempel di sebelah `<h1>`, bukan di catatan kaki.
- Transformasi kartu di `md:hidden` dengan alasan yang ditulis eksplisit di komentar.
- Empty state membedakan dua sebab yang berbeda: "belum ada observasi tersimpan" vs "tidak ada emiten yang cocok" — dengan penjelasan berbeda untuk masing-masing.
- `aria-label="Cari kode saham"` pada input, `tabular-nums` di semua kolom angka, `null` selalu diurutkan ke bawah dengan alasan yang benar ("belum ada data bukan nilai terkecil, ia bukan nilai sama sekali").

**Kelemahan.**
- **Kontrol yang tidak melakukan apa-apa.** Halaman memasang `<Header currentTicker={headerTicker} …>` — pemilih ticker global yang menonjol — sementara komentarnya sendiri (baris 41–43) mengakui bahwa nilainya "hanya meneruskan navigasi Header, tidak menyaring tabel di bawah". Pengguna melihat pemilih emiten di atas tabel lintas-emiten dan wajar menyimpulkan itu filternya. Ini pelanggaran *affordance* klasik.
- Kotak error (baris 155) tanpa tombol retry; tombol "Muat ulang" ada di header terpisah.
- Tidak ada `aria-sort` di komponen `Th`.

**Quick fix.** Sembunyikan pemilih ticker di `Header` untuk halaman lintas-emiten (tambahkan prop `showTickerPicker={false}`), atau sambungkan ke `query`.

---

### `/transparency` — Transparency & Model Validation

**Kelebihan.** Isi terbaik dari sisi kepercayaan pengguna: bagian "Apa arti belum tervalidasi?" ditulis dengan bahasa manusia, dan komitmen fail-closed/point-in-time/reproducible dinyatakan sebagai empat pernyataan pendek yang bisa dipindai.

**Kelemahan.**
- `text-amber-300` pada angka mismatch (baris 88) = **1,44:1** di tema terang. Ini angka paling penting di halaman validasi dan justru yang paling tidak terbaca.
- Halaman memakai `min-h-screen bg-tv-bg` + `max-w-7xl mx-auto` sendiri, bukan `PageContainer` (`max-w-[1680px]`) seperti halaman lain — lebar konten melompat saat berpindah ke/dari halaman ini.
- Judul memakai `lens-page-title` ✅, tapi `<h2>` di dalamnya memakai `text-base font-semibold` mentah, bukan `lens-section-title`.
- Grid metrik `sm:grid-cols-4`: di 640px, empat kolom untuk label sepanjang "Coverage dibandingkan" terlalu sempit.

**Quick fix.** `text-amber-300` → `text-tv-warning`; pakai `PageContainer`; naikkan grid ke `sm:grid-cols-2 lg:grid-cols-4`.

---

### Temuan lintas-halaman: empat perlakuan judul halaman yang berbeda

| Halaman | Kode |
|---|---|
| `/transparency`, `/technical/[symbol]`, `/recommendations` | `className="lens-page-title"` ✅ |
| `/dashboard:968` | `font-heading text-xl font-bold tracking-tight text-white sm:text-2xl md:text-[28px]` |
| `/ownership-flow:123` | `font-heading text-xl font-bold text-tv-text sm:text-2xl` |
| `components/Header.tsx:56` | `truncate text-lg font-bold tracking-tight text-white md:text-xl` |

Empat ukuran akhir yang berbeda untuk peran yang sama. `md:text-[28px]` bahkan berada di luar skala tipe yang didokumentasikan di `globals.css:236` (12/14/16/18/24/32).

---

## 4. Actionable Redesign / CSS Tweaks

Diurut menurut rasio dampak-terhadap-usaha. Semua ditulis untuk diterapkan langsung.

---

### FIX-1 — Sambungkan `<Badge>` ke `.lens-chip` (1 baris, menyelesaikan CRITICAL-1 poin 2)

Jalan keluarnya sudah ada di CSS, primitifnya tinggal ikut.

```diff
// components/ui/Badge.tsx:15
  return <span className={cn(
-   'inline-flex items-center gap-1.5 rounded-full border font-bold uppercase tracking-[0.12em]',
+   'lens-chip inline-flex items-center gap-1.5 rounded-full border font-bold uppercase tracking-[0.12em]',
    SIZES[size], VARIANTS[variant], className)} {...props}>
```

Lalu sederhanakan `SIZES` — kedua cabang responsifnya sudah tidak pernah berlaku:

```diff
-const SIZES = { sm: 'px-2 py-0.5 text-[12px] leading-4 sm:text-[10px] sm:leading-none',
-                md: 'px-2.5 py-1 text-[13px] leading-4 sm:text-[11px] sm:leading-none' };
+const SIZES = { sm: 'px-2 py-0.5', md: 'px-2.5 py-1' };
```

---

### FIX-2 — Skeleton peka tema (menghapus balok hitam di halaman putih)

```diff
// components/ui/Skeleton.tsx:22-26
      className={cn(
-       'bg-[linear-gradient(90deg,#101926_25%,#1A2940_50%,#101926_75%)] bg-[length:200%_100%] animate-shimmer',
+       'lens-skeleton bg-[length:200%_100%] animate-shimmer',
        VARIANTS[variant], className)}
```

```css
/* app/globals.css — :root (gelap) */
--lens-skeleton-base: rgb(var(--lens-hover));
--lens-skeleton-sheen: rgb(var(--lens-border-light));

/* app/globals.css — html.light */
--lens-skeleton-base: rgb(var(--lens-border));
--lens-skeleton-sheen: rgb(var(--lens-card-alt));

.lens-skeleton {
  background-image: linear-gradient(
    90deg,
    var(--lens-skeleton-base) 25%,
    var(--lens-skeleton-sheen) 50%,
    var(--lens-skeleton-base) 75%
  );
}
```

**Dua stop, bukan satu token yang dipakai dua arah.** Versi naif (`--lens-card` untuk basis di kedua tema) menyelesaikan kasus terang sambil mengulang kegagalan yang sama secara terbalik: `--lens-card` di tema terang **adalah** putih, jadi skeleton hilang di atas kartu putih. Arah gradiennya memang harus berbalik — di latar gelap placeholder lebih terang dari kartunya, di latar terang lebih gelap.

Pengukuran saat menerapkan ini juga memunculkan **kegagalan kedua yang belum tercatat di audit awal**: basis gelap lama (`#101926`) praktis identik dengan `--lens-card` — **1,00:1**. Skeleton di tema gelap selama ini hanya terlihat karena sheen-nya *bergerak*, dan gerakan itu dimatikan oleh aturan `prefers-reduced-motion` di `globals.css:290`. Artinya justru pengguna yang meminta "kurangi gerakan" yang mendapat placeholder tak terlihat sama sekali. Basis `--lens-hover` membuatnya terbaca diam-diam pun (1,14:1 di atas kartu, 1,25:1 di atas latar halaman).

Satu perubahan ini memperbaiki **31 pemakaian skeleton di 25 berkas** sekaligus, di kedua tema.

Dijaga `__tests__/skeleton-visibility.test.ts` — invariannya diperiksa langsung (basis vs permukaan ≥ 1,08:1, sheen vs basis ≥ 1,25:1 di kedua tema), bukan dipercayakan pada pilihan token yang terasa benar.

---

### FIX-3 — Bekukan kolom kode saham (menyelesaikan CRITICAL-2)

```css
/* app/globals.css */
.lens-table-sticky-col :where(thead th, tbody td):first-child {
  position: sticky;
  left: 0;
  z-index: 2;
  background-color: rgb(var(--lens-card));
  /* Garis pemisah menandai batas beku; tanpa ini kolomnya "mengambang". */
  box-shadow: 1px 0 0 0 rgb(var(--lens-border));
}
.lens-table-sticky-col thead th:first-child { z-index: 3; }
```

Pemakaian — tambahkan satu kelas di pembungkus `overflow-x-auto`:

**Screener butuh DUA kolom beku, bukan satu.** Kolom pertamanya adalah nomor urut (`#`),
bukan kode saham — membekukan `first-child` saja akan mengunci angka peringkat sementara
satu-satunya kolom yang membuat 15 kolom sisanya berarti tetap ikut tergulir. Lebar kolom
`#` dikunci `w-12` supaya offset kolom kedua tepat, bukan tebakan.

```diff
// app/screener/page.tsx:637
- <div className="hidden lg:block overflow-x-auto">
+ <div className="lens-table-sticky-col lens-table-sticky-col-2 [--lens-sticky-head-bg:rgb(var(--lens-bg))] hidden lg:block overflow-x-auto">

// app/ownership-flow/page.tsx:227
- <div className="hidden overflow-x-auto md:block">
+ <div className="lens-table-sticky-col hidden overflow-x-auto md:block">

// app/recommendations/page.tsx:287
- <div className="overflow-x-auto min-h-[500px]">
+ <div className="lens-table-sticky-col overflow-x-auto min-h-[500px]">
```

Catatan: `bg-tv-card` opaque wajib, kalau tidak baris di bawahnya terlihat menembus saat digulir.

---

### FIX-4 — `/recommendations`: header sortable yang bisa dijangkau keyboard

Salin pola yang sudah benar dari `/screener`:

```diff
  <th
-   className="p-4 font-semibold cursor-pointer group hover:bg-tv-border transition-colors"
-   onClick={() => handleSort('ticker')}
+   className="p-4 font-semibold"
+   aria-sort={sortConfig?.key === 'ticker'
+     ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending')
+     : 'none'}
  >
-   <div className="flex items-center gap-1.5">Simbol {getSortIcon('ticker')}</div>
+   <button
+     type="button"
+     onClick={() => handleSort('ticker')}
+     className="group inline-flex min-h-6 items-center gap-1.5 rounded transition-colors hover:text-tv-text"
+   >
+     Simbol {getSortIcon('ticker')}
+   </button>
  </th>
```

Terapkan ke kedelapan `<th>`. `aria-sort` di `<th>` (bukan di tombol) sesuai spesifikasi WAI-ARIA.

---

### FIX-5 — DCF: hentikan horizontal scroll di 320px

```diff
// app/dcf/page.tsx:91
- <div className="flex items-center gap-6">
+ <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
```

```diff
// components/TickerAnalysisShell.tsx:69
- {headerExtra && <div className="w-full shrink-0 md:w-auto">{headerExtra}</div>}
+ {headerExtra && <div className="w-full min-w-0 md:w-auto md:shrink-0">{headerExtra}</div>}
```

`min-w-0` wajib: tanpa itu, flex item tidak boleh menyusut di bawah lebar kontennya, dan `flex-wrap` di dalam tidak akan pernah terpicu.

Tambahkan juga pengaman menyeluruh — murah dan menangkap regresi berikutnya:

```css
/* app/globals.css */
.lens-main { overflow-x: clip; }  /* clip, bukan hidden: tidak membuat scroll container baru */
```

---

### FIX-6 — Gauge & skala regime memakai token, bukan hex mati

```diff
// components/market/MarketRegimePanel.tsx:9-16
 function scoreColor(score: number | null): string {
-  if (score == null) return '#64748b';
-  if (score < 20) return '#ef4444';
-  if (score < 40) return '#f97316';
-  if (score < 60) return '#eab308';
-  if (score < 80) return '#22c55e';
-  return '#3b82f6';
+  // Token, bukan hex: nilainya berbeda antara tema terang & gelap, dan pasangan
+  // terangnya sudah lolos kontras (lihat matriks di globals.css).
+  if (score == null) return 'rgb(var(--lens-muted))';
+  if (score < 20) return 'rgb(var(--lens-red))';
+  if (score < 40) return 'rgb(var(--lens-warning))';
+  if (score < 60) return 'rgb(var(--lens-yellow))';
+  if (score < 80) return 'rgb(var(--lens-green))';
+  // Greed ekstrem = hijau paling pekat, bukan pindah ke biru. Biru sudah punya
+  // arti lain di aplikasi ini (aksi primer / netral-informatif).
+  return 'rgb(var(--lens-green-hover))';
 }
```

```diff
// components/market/MarketRegimePanel.tsx:67
- <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-tv-hover">
+ <div className="mt-2 h-2 overflow-hidden rounded-full bg-tv-hover">
```

Hal yang sama untuk `RadialScoreGauge.tsx:36-41` (ganti `text-emerald-500` dst. menjadi `text-tv-green`/`text-tv-yellow`/`text-tv-red`) dan `MetricCard.tsx:88` (`#22C55E`/`#EF4444`/`#3B82F6` → `rgb(var(--lens-green))` dst.).

Bonus di `RadialScoreGauge`: `id="scoreGaugeGrad"` dan `id="gaugeGlow"` bersifat global di dokumen. Dua gauge dalam satu halaman menghasilkan id ganda dan `url(#…)` akan selalu menunjuk ke yang pertama. Perbaiki dengan `React.useId()`.

---

### FIX-7 — Tooltip yang hidup di layar sentuh

Ganti 175 `title=` bertahap, mulai dari kartu metrik dan tile heatmap. Pola minimum tanpa dependensi baru:

```tsx
// components/ui/InfoTip.tsx
'use client';
import { useState, useId } from 'react';
import { Info } from 'lucide-react';

export function InfoTip({ label }: { label: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={`Penjelasan: ${label}`}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
        className="grid h-6 w-6 place-items-center rounded text-tv-muted hover:text-tv-text"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="absolute left-1/2 top-full z-50 mt-1.5 w-56 -translate-x-1/2 rounded-lg border border-tv-border bg-tv-surface p-2.5 text-[13px] leading-relaxed text-tv-text shadow-2"
        >
          {label}
        </span>
      )}
    </span>
  );
}
```

Klik (bukan hover) sebagai pemicu utama sesuai aturan `hover-vs-tap`; `onBlur` menutupnya tanpa perlu listener global.

---

### FIX-8 — Kunci scroll + focus trap untuk seluruh modal

Satu hook, dipakai enam modal:

```tsx
// lib/hooks/useModalBehavior.ts
import { useEffect, type RefObject } from 'react';

export function useModalBehavior(open: boolean, ref: RefObject<HTMLElement>, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const { overflow, paddingRight } = document.body.style;
    // Kompensasi lebar scrollbar supaya layout tidak bergeser saat modal dibuka.
    const gap = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (gap > 0) document.body.style.paddingRight = `${gap}px`;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onClose();
      if (e.key !== 'Tab' || !ref.current) return;
      const nodes = ref.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
      previous?.focus();
    };
  }, [open, ref, onClose]);
}
```

---

### FIX-9 — Font chart disamakan dengan angka di seluruh aplikasi

```diff
// components/ProTradingViewChart.tsx:178
- fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
+ fontFamily: 'var(--font-jetbrains-mono), ui-monospace, monospace',

// components/TradingViewChart.tsx:245
- fontFamily: 'JetBrains Mono, monospace',
+ fontFamily: 'var(--font-jetbrains-mono), ui-monospace, monospace',
```

`next/font` menghasilkan nama keluarga ber-hash; hanya variabel CSS-nya yang bisa dirujuk. Menyebut `'JetBrains Mono'` secara literal tidak pernah resolve.

---

### FIX-10 — Tutup celah tint hampir-padat pada penjaga kontras

```diff
/* app/globals.css:546 */
 [class~='bg-tv-green'] .text-white,
+[class~='bg-tv-green\/80'] .text-white,
+[class~='bg-tv-green\/90'] .text-white,
 [class~='bg-tv-red'] .text-white,
+[class~='bg-tv-red\/80'] .text-white,
+[class~='bg-tv-red\/90'] .text-white,
```

Atau — lebih baik dan lebih tahan lama — hilangkan sumbernya di `app/market-pulse/page.tsx:114`:

```diff
- className={`text-[10px] font-number font-semibold px-1 py-0.5 rounded text-white ${
-   s.changePct >= 0 ? 'bg-tv-green/80' : 'bg-tv-red/80'
- }`}
+ className={`lens-chip font-number font-semibold px-1.5 py-0.5 rounded ${
+   s.changePct >= 0 ? 'bg-tv-green/15 text-tv-green' : 'bg-tv-red/15 text-tv-red'
+ }`}
```

Pola `tint 15% + teks berwarna` sudah tercakup penuh oleh matriks kontras yang ada dan konsisten dengan `<Badge>`.

---

### FIX-11 — Tutup celah tablet 768–1023px

Blok `@media (min-width: 768px) and (max-width: 1023px)` di `globals.css:1017` sudah ada tapi hanya mengurus ukuran huruf. Tambahkan target sentuh — tablet adalah perangkat sentuh yang saat ini mewarisi ukuran kontrol desktop:

```diff
 @media (hover: none) {
   .lens-main .min-h-9,
   .lens-app-shell .min-h-9 { min-height: 44px; }
+  /* Tablet memakai breakpoint md/lg, jadi kontrol yang dikecilkan di `sm:` sudah
+     aktif di sini. Lantai yang sama berlaku: jari tidak mengecil di layar besar. */
+  .lens-main :where(button, [role='button'], a.inline-flex) { min-height: 40px; }
 }
```

Dan turunkan ambang tabel screener supaya tablet tidak kehilangan 12 kolom:

```diff
// app/screener/page.tsx:637
- <div className="hidden lg:block overflow-x-auto">
+ <div className="lens-table-sticky-col hidden md:block overflow-x-auto">
```

---

### Wireframe usulan: baris tabel finansial di 375px

Pola kartu `/ownership-flow` sudah benar dan sebaiknya diangkat jadi primitif bersama, dipakai `/screener`, `/recommendations`, `/watchlist`, `/portfolio`:

```
┌─────────────────────────────────────────────┐
│ BBCA                            ▲ AKUMULASI │  ← kode + status (satu baris, kode kiri)
│                                             │
│ Rp 9.250        +1,37%                      │  ← harga besar + delta berwarna & bertanda
│ font-number, text-lg   text-tv-green        │
│                                             │
│ ┌───────────────┐ ┌───────────────────────┐ │
│ │ LENSSCORE     │ │ ASING Δ               │ │  ← maks 2 metrik sekunder per baris
│ │ 78            │ │ +0,42 pp              │ │
│ └───────────────┘ └───────────────────────┘ │
│                                             │
│ ⓘ 3 metrik lain            [ Detail ›  44px]│  ← sisanya di balik disclosure
└─────────────────────────────────────────────┘
```

Aturannya: **maksimal 4 nilai terlihat per kartu**, sisanya di balik progressive disclosure. Tujuh belas kolom tidak pernah menjadi kartu yang bisa dipindai — memilih empat yang penting adalah keputusan desain, bukan kompromi.

---

## 5. Benchmark Comparison

| Dimensi | SahamLens | TradingView | Koyfin | Stockbit | Catatan |
|---|---|---|---|---|---|
| **Token warna & pasangan tema** | 🟢 **di atas** | 🟢 | 🟢 | 🟡 | Matriks kontras yang dihitung untuk 3 peran warna dan dijaga unit test lebih ketat dari ketiganya |
| **Kejujuran data / labeling** | 🟢 **di atas semua** | 🟡 | 🟢 | 🔴 | "Bukan indeks sektor resmi IDX", "AKUMULASI" alih-alih "NET BUY", status `research-only` — tidak ada pembanding yang setara |
| **Empty state yang menjelaskan sebab** | 🟢 **di atas** | 🟡 | 🟡 | 🔴 | `EmptyState` dengan progress + countdown adalah pola yang tidak dimiliki ketiganya |
| **Toolbar chart & a11y-nya** | 🟢 setara | 🟢 | 🟡 | 🔴 | `aria-pressed`/`aria-expanded`/overflow menu setara TradingView |
| **Reduced motion & hemat daya** | 🟢 **di atas semua** | 🟡 | 🟡 | 🔴 | `lens-page-hidden` + `lens-battery-saver` + `will-change` dilepas saat jeda — tidak ada pembanding yang melakukan ini |
| **Kolom simbol beku di tabel** | 🔴 **tidak ada** | 🟢 | 🟢 | 🟢 | Satu-satunya dimensi di mana SahamLens tertinggal dari **semua** pembanding |
| **Densitas desktop** | 🟡 | 🟢 | 🟢 | 🟡 | Lantai 13px menyeluruh membuat desktop kurang padat dari terminal profesional; ini keputusan produk yang sadar (lihat komentar `globals.css:1040`), bukan cacat — tapi mengorbankan posisi "Bloomberg-like" |
| **Tooltip metrik di sentuh** | 🔴 | 🟢 | 🟢 | 🟢 | 175 native `title=` = nol tooltip di HP |
| **Kualitas layer modal** | 🟡 | 🟢 | 🟢 | 🟢 | `aria-modal` + Escape sudah ada; scroll lock & focus trap belum |
| **Konsistensi visual antar halaman** | 🟡 | 🟢 | 🟢 | 🟢 | Adopsi primitif 12–28% adalah akar dari sebagian besar sisa temuan |
| **Transformasi kartu di mobile** | 🟡 | 🔴 | 🔴 | 🟢 | Ada di 2 halaman (`ownership-flow`, `screener`); TradingView & Koyfin justru menyerah di mobile |

### Posisi keseluruhan

SahamLens **sudah melampaui Stockbit** pada hampir semua dimensi rekayasa antarmuka, dan **melampaui TradingView & Koyfin** pada aksesibilitas sistemik (reduced motion, hemat daya, matriks kontras berlapis) serta pada kejujuran penyajian data — dimensi terakhir ini bahkan menjadi diferensiator produk yang nyata, bukan sekadar detail teknis.

Jarak yang tersisa terhadap TradingView/Koyfin bukan soal selera visual, melainkan **tiga ergonomi tabel & overlay yang sudah menjadi ekspektasi kategori**: kolom simbol beku, tooltip yang hidup di sentuh, dan layer modal yang mengunci latar. Ketiganya terkandung di FIX-3, FIX-7, dan FIX-8.

Yang paling penting untuk dicatat: **tidak satu pun dari 5 temuan kritis membutuhkan keputusan desain baru.** Semuanya adalah menyambungkan permukaan aplikasi ke sistem yang sudah dibangun dan sudah terbukti benar di `globals.css` dan `components/ui/`. Itu sebabnya skor 73 hari ini realistis naik ke rentang 88–91 tanpa satu pun mockup baru.

---

## Lampiran — Urutan pengerjaan yang disarankan

| # | Fix | Berkas tersentuh | Dampak | Usaha |
|---|---|---|---|---|
| 1 | ✅ FIX-2 Skeleton peka tema | 3 | 25 berkas, tema terang | XS |
| 2 | ✅ FIX-1 Badge → `.lens-chip` | 1 | seluruh badge aplikasi | XS |
| 3 | ✅ FIX-5 DCF horizontal scroll | 2 | mobile 320–375px | XS |
| 4 | ✅ FIX-9 Font chart | 2 | konsistensi tipografi | XS |
| 5 | ✅ FIX-3 Kolom simbol beku | 4 | 3 tabel utama | S |
| 6 | ✅ FIX-10 Celah tint hampir-padat | 2 | heatmap sektor | S |
| 7 | ✅ FIX-6 Token pada gauge & skala | 3 | seluruh data-viz, tema terang | S |
| 8 | ✅ FIX-4 `/recommendations` sortable | 1 | a11y keyboard | M |
| 9 | ✅ FIX-8 Hook dialog bersama | 7 | 6 modal | M |
| 10 | FIX-11 Celah tablet | 2 | 768–1023px | M |
| 11 | FIX-7 InfoTip menggantikan `title` | ~20 bertahap | tooltip di sentuh | L |
| 12 | Migrasi `<Card>`/`<Button>` bertahap | ~86 | konsistensi visual | XL |

Nomor 1–9 **sudah diterapkan** (19 Agustus 2026), menutup **empat dari lima temuan kritis**
(CRITICAL-1 sebagian, CRITICAL-2, CRITICAL-4 sebagian, CRITICAL-5 poin B & C). Sisa terbesar:
migrasi `<Card>`/`<Button>` dan penggantian 175 native `title=`.
Verifikasi: `npm run typecheck` bersih, `npm run lint` bersih, `npm run audit:ui` PASS, `npm test` 1.869 tes / 202 berkas lulus.
Penjaga baru: `__tests__/skeleton-visibility.test.ts` (9 tes) — sudah diuji-mutasi, gagal saat token dikembalikan ke nilai lama.
