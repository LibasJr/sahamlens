# SahamLens — Audit Integritas Data & Algoritma Kuantitatif

**Tanggal audit:** 2026-08-19
**Commit yang diaudit:** `f7717c8` (branch `main`, working tree bersih)
**Ruang lingkup:** 991 berkas terlacak; 586 berkas sumber produksi
**Stack:** Next.js 16 (App Router) · React 18 · PostgreSQL (`pg`) · Redis · Yahoo Finance (`yahoo-finance2`) · IDX/KSEI (sinkronisasi Python) · Vitest
**Metode:** inventaris arsitektur, pemindaian anti-dummy, penelusuran pipeline data, audit rumus baris-per-baris terhadap definisi baku, pemeriksaan keamanan

---

> **PEMBARUAN 2026-08-19 — PERBAIKAN SUDAH DITERAPKAN.**
> Temuan CRITICAL, keempat HIGH, dan lima MEDIUM sudah diperbaiki; lihat
> [§0 Status Perbaikan](#0-status-perbaikan). Verifikasi: `tsc --noEmit` bersih,
> `eslint` 0 error (12 warning `react-hooks/exhaustive-deps` yang memang sudah ada
> sebelum perubahan ini), **1860/1860 test lulus**, `npm run build` sukses,
> `audit:zero-dummy` / `audit:manual-market` / `audit:schema` PASS.
> Isi laporan di bawah dipertahankan apa adanya sebagai catatan temuan aslinya.

---

## 0. Status Perbaikan

| ID | Temuan | Status | Perubahan inti |
| :--- | :--- | :--- | :--- |
| **C-01** | Papan pencatatan IDX dari daftar ketikan tangan | **SELESAI** | `lib/utils/idx-trading-board.ts` ditulis ulang: ketiga `Set` dihapus, papan kini dipetakan dari kolom `listing_board` di `all.csv` lewat `getEmitenBoard()` baru di `shared/market/emiten-list.ts`, dikirim ke klien sebagai `stock.listing_board` dari `/api/stock/[ticker]`. Papan tidak dikenal mengembalikan `null` dan lencana tidak dirender — tidak ada lagi default `DEVELOPMENT`. Papan `NEW_ECONOMY` ditambahkan. **Salah klasifikasi 419/962 (43,6%) → 0/962 (0%); penanda FCA 20 → 153, cocok persis dengan CSV.** |
| **H-01** | DER 100x terlalu besar di kartu ekspor | **SELESAI** | `fmtDer()` baru di `shared/format/fundamental-format.ts` memegang pembagian 100 di satu tempat; `FundamentalMoatEarningsExportCard3D.tsx:167` memakainya. DER 0,47x tidak lagi tampil "47,20x". |
| **H-02** | DCF menghitung utang dua kali | **SELESAI** | Kerangka ditetapkan eksplisit sebagai FCFE: `buildFcfeProjection()` (fungsi murni, diekspor & diuji) mengembalikan nilai ekuitas tanpa pengurangan utang bersih. `wacc_pct` dihapus dari respons (model tidak pernah menghitung WACC), diganti `valuation_framework`. `enterprise_value_per_share` → `equity_value_per_share`. UI `/dcf` menampilkan utang bersih sebagai konteks neraca, bukan langkah rumus. |
| **H-03** | Seasonality memakai harga non-total-return | **SELESAI** | `adjClose` dialirkan dari Yahoo lewat `/api/public-chart/[ticker]` (`includeAdjustedClose=true`) dan `/api/stock/[ticker]`. `calculateMonthlySeasonality()` kini menolak `close` sepenuhnya; tanpa `adjClose` ia mengembalikan `basis: 'UNAVAILABLE'` + alasan, dan komponen menampilkan alasan itu. |
| **H-04** | Tooltip LQ45 mengasersikan status resmi | **SELESAI** | `LQ45_BADGE_TITLE` + `LQ45_VERIFICATION_STATUS` di `lib/utils/blue-chip-index.ts` menjadi satu sumber teks; kedua halaman memakainya. Tooltip kini menyebut periode berlaku dan menyatakan snapshot internal belum dicocokkan ke pengumuman IDX. |
| **M-01** | Reverse DCF mengembalikan batas kurungnya sendiri | **SELESAI** | `solveImpliedGrowth()` mengevaluasi kedua ujung sebelum bisection; di luar rentang mengembalikan `pct: null` + `status: ABOVE_RANGE`/`BELOW_RANGE`, dan UI menulis "> 60%" / "< −30%". |
| **M-02** | Altman Z manufaktur dipakai untuk semua sektor | **SELESAI** | Diganti Altman Z″ (varian non-manufaktur & pasar berkembang): `6.56·X1 + 3.26·X2 + 6.72·X3 + 1.05·X4` dengan nilai **buku** ekuitas, ambang 1,1 / 2,6. Label ambang di UI mengikuti konstanta yang sama. Catatan: rekomendasi asli meminta pemilihan varian per sektor — taksonomi sektor provider tidak punya kategori "manufaktur", jadi menebaknya akan mengganti satu bias sistematis dengan bias lain yang lebih sulit dilihat. Z″ dipakai untuk seluruh emiten non-keuangan, dan alasannya didokumentasikan di kode. |
| **M-04** | `earningsQuarterlyGrowth` salah label | **SELESAI** | Label "EPS Growth (QoQ)" → "Pertumbuhan Laba (YoY, kuartalan)". Nilainya tidak diubah — yang salah namanya, bukan angkanya. |
| **M-05** | Return bulanan melompati bulan yang hilang | **SELESAI** | Kontinuitas bulan kalender kini benar-benar diperiksa lewat nomor bulan absolut; lubang membiarkan sel kosong. |
| **M-06** | Pengelompokan bulan memakai zona waktu server | **SELESAI** | Diganti `Intl.DateTimeFormat` zona `Asia/Jakarta`, sesuai konvensi `previous-close.ts` / `trading-session.ts`. |
| M-03, M-07, M-08, M-09, M-10, seluruh LOW | — | **BELUM** | Refaktor Prioritas 2/3 (konsolidasi analyzer, indikator sisi klien, kesegaran `all.csv`, deduplikasi indikator). Lihat [§9](#9-daftar-berkas-yang-harus-di-refactor-total). |

**Cakupan test setelah perbaikan** (jumlah test per berkas, bukan selisih):

| Berkas | Sebelum | Sesudah |
| :--- | ---: | ---: |
| `lib/utils/__tests__/idx-trading-board.test.ts` | 4 | 13 |
| `lib/utils/__tests__/seasonality.test.ts` | 2 | 13 |
| `modules/fundamental/service/__tests__/golden-valuation.test.ts` | 22 | 33 |
| `lib/fundamental/__tests__/financial-health.test.ts` | 8 | 11 |
| `shared/format/__tests__/fundamental-format.test.ts` | 7 | 10 |

Nilai acuan pada golden test dihitung ulang oleh implementasi terpisah dari rumusnya,
bukan disalin dari keluaran kode yang diuji. Dua berkas test lama (`idx-trading-board`,
`seasonality`) ditulis ulang karena kontrak fungsinya berubah; kasus uji aslinya
dipertahankan dan disesuaikan, termasuk catatan eksplisit atas perubahan perilaku yang
disengaja pada bulan pertama matriks musiman.

---

## 1. Ringkasan Eksekutif

**STATUS AUDIT AWAL: GAGAL (FAILED) — 1 temuan CRITICAL, 4 temuan HIGH.**
*(Seluruhnya sudah ditutup — lihat §0.)*

Kegagalan ini **bukan** karena adanya dummy data generik. Justru sebaliknya: proyek ini
punya disiplin anti-dummy yang di atas rata-rata. `npm run audit:zero-dummy` lolos, tidak
ada `Math.random()` yang menghasilkan angka finansial, tidak ada `mockData`/`sampleData`,
tidak ada seeder yang menyuntikkan saham fiktif ke basis data, tidak ada `INSERT INTO`
sama sekali di 11 berkas migrasi, dan pola fail-closed (`return null`, bukan konstanta
cadangan) diterapkan konsisten di jalur kurs USD/IDR, ATR, RSI, dan ingestion Ownership Flow.

Kegagalannya berasal dari kelas masalah yang lebih halus dan lebih berbahaya:
**data statis hasil ketikan tangan yang disajikan ke pengguna sebagai fakta bursa**, dan
**tiga kesalahan satuan/metodologi kuantitatif** yang menghasilkan angka salah tanpa
pernah melempar error.

Temuan penentu status GAGAL adalah `lib/utils/idx-trading-board.ts`: tiga himpunan ticker
yang ditulis manual mengklasifikasikan papan pencatatan IDX setiap emiten, sementara
berkas `all.csv` di repositori yang sama sudah memuat kolom `listing_board` resmi.
Keduanya bertentangan pada **419 dari 962 emiten (43,6%)**. Aplikasi ini dapat menampilkan
GOTO dengan dua lencana yang saling meniadakan pada baris yang sama: "Indeks LQ45" dan
"Papan Pemantauan Khusus (FCA)" — kombinasi yang mustahil menurut aturan IDX.

**Rekomendasi jalur rilis:** hentikan promosi build ke produksi sampai temuan
`C-01`, `H-01`, dan `H-02` ditutup. Temuan `H-03` dan `H-04` dapat ditutup pada rilis
berikutnya, tetapi label UI-nya wajib dikoreksi sekarang juga karena keduanya adalah
klaim faktual yang tidak didukung datanya.

### Papan skor

| Kategori | CRITICAL | HIGH | MEDIUM | LOW |
| :--- | ---: | ---: | ---: | ---: |
| DUMMY_DATA | 0 | 0 | 0 | 0 |
| STATIC_DATA | 1 | 1 | 3 | 2 |
| ALGORITHM_ERROR | 0 | 3 | 6 | 3 |
| DATA_PIPELINE | 0 | 0 | 1 | 2 |
| SECURITY | 0 | 0 | 0 | 1 |
| **Total** | **1** | **4** | **10** | **8** |

---

## 2. Inventaris Arsitektur & Aliran Data

```text
SUMBER EKSTERNAL
  Yahoo Finance (yahoo-finance2)  ──┐
  IDX EOD (curl_cffi, Python)     ──┤
  KSEI Holding Composition        ──┤
  RSS berita (rss-parser)         ──┤
  Google Gemini / OpenRouter      ──┘
                                     │
                                     ▼
LAPISAN AKUISISI
  shared/market/data-provider-adapter.ts     — adaptor provider tunggal
  shared/market/previous-close.ts            — resolusi acuan penutupan
  shared/market/usd-idr-rate.ts              — sumber kurs tunggal, fail-closed
  shared/http/provider-circuit-breaker.ts    — pemutus sirkuit provider
  scripts/sync-idx-foreign-flow.py           — artefak data/foreign-flow/*.json
  modules/ownership-flow/source/*            — registry sumber ber-audit-status
                                     │
                                     ▼
CRON / PENJADWALAN  (23 rute, config/scheduled-jobs.json)
  QStash signature ATAU CRON_SECRET pada setiap rute — tidak ada rute cron tanpa gerbang
  shared/scheduler/job-run-log.repository.ts — log eksekusi ke PostgreSQL
                                     │
                                     ▼
PENYIMPANAN
  PostgreSQL  — 11 migrasi, nol INSERT data pasar
  Redis       — shared/cache/ttl-policy.ts (TTL sadar jam bursa)
  Berkas      — all.csv (master emiten), data/foreign-flow/, data/pit-batch51/
                                     │
                                     ▼
KOMPUTASI
  modules/technical/service/{rsi,ema,atr}.ts        — indikator baku tunggal
  modules/technical/service/scoring.service.ts      — LensScore 40/30/30
  modules/fundamental/service/fair-multiples.service.ts  — Gordon/CAPM
  modules/fundamental/service/dcf-valuation.service.ts   — DCF & nilai wajar
  lib/fundamental/financial-health.ts               — Piotroski, Altman Z
  modules/backtest/service/performance-metrics.ts   — Sharpe, Sortino, CAGR
                                     │
                                     ▼
PENYAJIAN
  app/api/**  (161 berkas)  →  app/**  (halaman)  →  components/**
```

**Berkas yang berhubungan langsung dengan data saham** telah ditandai dan ditelusuri
seluruhnya. Setiap angka yang tampil di UI dapat dilacak balik ke satu panggilan API
nyata, satu artefak sinkronisasi bertimestamp, atau satu tabel PostgreSQL — **kecuali**
yang tercatat pada temuan `C-01`, `H-02`, `M-01`, dan `M-08` di bawah.

---

## 3. Hasil Pemindaian Anti-Dummy

| Pemeriksaan | Hasil |
| :--- | :--- |
| `npm run audit:zero-dummy` | LULUS — 586 berkas produksi, nol tanda tangan regresi |
| Berkas bernama `mock*`/`dummy*`/`sample*`/`fake*` | Nihil di jalur produksi. Yang ada hanya `data/source-fixtures/ksei/*.html` (fixture uji parser, tidak pernah dibaca runtime) dan `app/api/chat/__tests__/fixtures/` |
| `Math.random()` menghasilkan angka finansial | **Nihil.** 10 kemunculan, seluruhnya non-finansial: pembangkit ID, jitter backoff, pemilih tema kartu, pemilih fakta layar tunggu |
| Array saham berisi harga di frontend | Nihil |
| JSON statis berisi harga/laporan keuangan di `/public` | Nihil. `/public` hanya memuat ikon, logo, APK, `manifest.json` |
| Seeder / `INSERT INTO` di migrasi | **Nihil pada 11 berkas migrasi** |
| Komentar `// TODO: replace with real API` | Nihil. Satu-satunya TODO di seluruh basis kode produksi adalah catatan refaktor di `modules/user/service/admin.service.ts:27` |
| Fallback yang mengembalikan angka karangan saat API gagal | **Nihil.** Pola yang dipakai adalah `return null` + status eksplisit (`NO_FCF_DATA`, `DATA_UNAVAILABLE`, `BLOCKED`) |
| Rahasia di `NEXT_PUBLIC_*` | Nihil. Hanya URL aplikasi, detail rekening pembayaran (memang publik), dan satu flag pengujian |
| Berkas `.env` ter-commit | Nihil. Hanya `.env.example`; `.gitignore` memblokir `.env*` |

**Kesimpulan bagian ini: kebijakan Zero-Dummy dipatuhi.** Nol temuan berkategori
`DUMMY_DATA`. Yang gagal adalah kategori `STATIC_DATA` — data nyata yang pernah benar,
tidak punya mekanisme pembaruan, dan sekarang sudah menyimpang dari kenyataan.

---

## 4. Tabel Temuan

| Severity | Kategori | Lokasi (File:Line) | Temuan | Bukti Code | Dampak | Rekomendasi Fix |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **CRITICAL** | STATIC_DATA | [lib/utils/idx-trading-board.ts:16-33](lib/utils/idx-trading-board.ts#L16-L33) | Tiga himpunan ticker papan pencatatan IDX ditulis manual (20 Akselerasi, 20 FCA, 42 Utama) tanpa tanggal sumber, tanpa penjaga kedaluwarsa, dan **bertentangan dengan `all.csv` di repo yang sama** yang memuat kolom `listing_board` resmi untuk 962 emiten. Emiten yang tidak ada di ketiga himpunan jatuh ke default `DEVELOPMENT` yang **diasersikan sebagai fakta**. **Diukur: 419 dari 962 emiten (43,6%) salah klasifikasi.** | `const WATCHLIST_FCA_TICKERS = new Set([`<br>`'GOTO','BUMI','POLA','KREN','ENRG',`<br>`'DEWA','BRMS','TRAM','MYRX',…])`<br><br>Silang-periksa penuh ke `all.csv` (962 emiten):<br>`Utama          → "Pengembangan" : 224`<br>`Pemantauan Khs → "Pengembangan" : 137`<br>`Akselerasi     → "Pengembangan" :  36`<br>`Pengembangan   → "Akselerasi"   :  11`<br>`Utama          → "FCA"          :   4`<br>`Pemantauan Khs → "Akselerasi"   :   3`<br>`Pengembangan   → "FCA"          :   2`<br>`Ekonomi Baru   → "Pengembangan" :   1`<br>`Utama          → "Akselerasi"   :   1`<br><br>Himpunan FCA: **7 dari 20 salah**<br>(BUMI, DEWA, ENRG, BRMS = Utama;<br>GOTO, POLA = Pengembangan;<br>MYRX = tidak terdaftar lagi)<br><br>Himpunan Akselerasi: **15 dari 20 salah** | Lencana papan tampil di Dashboard ([app/dashboard/page.tsx:1123](app/dashboard/page.tsx#L1123)) dan LensFundamental ([app/fundamental/page.tsx:541](app/fundamental/page.tsx#L541)). Untuk emiten FCA palsu, muncul kotak peringatan berisi **klaim mekanisme perdagangan yang salah**: "Periodic Call Auction (5 sesi lelang/hari)" — pada BUMI, DEWA, ENRG, BRMS yang sesungguhnya Papan Utama dengan perdagangan kontinu. Sebaliknya, 137 emiten yang **benar-benar** di Papan Pemantauan Khusus tidak mendapat peringatan itu sama sekali. GOTO/BUMI/DEWA menerima lencana "Indeks LQ45" **dan** "Papan Pemantauan Khusus (FCA)" pada baris yang sama — kombinasi yang mustahil menurut aturan IDX. Papan "Ekonomi Baru" tidak dapat direpresentasikan sama sekali. | Hapus ketiga `Set`. Turunkan `classifyTradingBoard()` dari kolom `listing_board` di `all.csv` lewat `loadEmitenList()` (nilainya sudah dibaca dan dibuang di [shared/market/emiten-list.ts:34](shared/market/emiten-list.ts#L34)). Tambahkan varian papan `NEW_ECONOMY`. Untuk kode yang tidak ada di CSV, kembalikan `null` dan **jangan render lencana** — bukan `DEVELOPMENT`. Daftarkan `all.csv` ke `MANUAL_MARKET_REFERENCE_REVIEWS` dengan `reviewBy` supaya CI mengingatkan saat basi. |
| **HIGH** | ALGORITHM_ERROR | [components/export/FundamentalMoatEarningsExportCard3D.tsx:167](components/export/FundamentalMoatEarningsExportCard3D.tsx#L167) | DER dirender **100x terlalu besar**. `fmtKali()` tidak membagi 100, padahal kontrak API untuk field `debtToEquity` adalah persen — konvensi yang dipatuhi 5 pemanggil lain. | `{ code:'DER', val: fmtKali(fundamentals.debtToEquity) }`<br><br>`fmtKali = v => `${v.toFixed(2)}x``<br><br>Konvensi di tempat lain:<br>`screener.service.ts:209  debtToEquity / 100`<br>`recommendation.service.ts:274  / 100`<br>`api/stock/[ticker]/route.ts:247  / 100`<br>`cron/fundamental-snapshot:37  / 100`<br>`fundamental-pit-adapter.ts:31  pit.der * 100` | Kartu ekspor Fundamental & Moat — aset yang **dirancang untuk dibagikan ke publik** (Infographic Studio, ekspor PDF/gambar) — menampilkan emiten ber-DER 0,47x sebagai **"47,20x"**. Angka itu menyiratkan kebangkrutan pada perusahaan yang neracanya sehat, dan tersebar di luar aplikasi tanpa konteks apa pun. | Ganti menjadi `fmtKali(fundamentals.debtToEquity / 100)`, atau lebih baik: tambahkan `fmtDer()` di [shared/format/fundamental-format.ts](shared/format/fundamental-format.ts) yang memiliki pembagian itu di satu tempat, lalu pakai di seluruh pemanggil. Tambahkan uji regresi yang mengunci `fmtDer(47.2) === '0.47x'`. |
| **HIGH** | ALGORITHM_ERROR | [modules/fundamental/service/dcf-valuation.service.ts:553-554](modules/fundamental/service/dcf-valuation.service.ts#L553-L554) | **Utang dihitung dua kali.** Model mendiskonto arus kas yang sudah dikurangi bunga (FCFE) memakai *cost of equity*, lalu **masih** mengurangkan utang bersih. Kode menamai hasilnya `enterpriseValuePerShare`, padahal untuk menjadi *enterprise value* arus kasnya harus FCFF (sebelum bunga) dan diskontonya harus WACC. Tidak satu pun terpenuhi. | `const enterpriseValuePerShare = pvFcfSum + pvTerminalValue;`<br>`const fairValue = enterpriseValuePerShare - netDebtPerShare;`<br><br>Sumber FCF:<br>`fcf = quoteSummary.financialData.freeCashflow`<br>(Yahoo: arus kas operasi − capex; arus kas operasi **sudah** setelah bunga dibayar)<br><br>Diskonto:<br>`discountRatePct = SBN_10Y + ERP  // = cost of equity`<br><br>Kode sendiri menyamakan keduanya:<br>`cost_of_equity_pct: discountRatePct,`<br>`wacc_pct: discountRatePct,` | Nilai wajar di halaman `/dcf` **terlalu rendah secara sistematis** untuk setiap emiten berutang, sebanding dengan utang bersih per saham. Emiten padat modal (JSMR, semen, properti, telko) paling parah terpukul. `valuation_status` yang diturunkan darinya (`UNDERVALUED`/`OVERVALUED`) bias ke arah "mahal", begitu pula seluruh `sensitivity_table` dan `implied_fcf_growth_pct`. | Pilih satu kerangka dan konsisten: **(a) FCFE** — buang `- netDebtPerShare` pada baris 554, pertahankan diskonto *cost of equity*, ganti nama field `enterprise_value_per_share` menjadi `equity_value_per_share`; atau **(b) FCFF** — hitung FCFF = FCF + bunga×(1−pajak), diskonto pada WACC sungguhan, baru kurangkan utang bersih. Opsi (a) adalah perubahan terkecil dan paling jujur terhadap data yang tersedia dari Yahoo. Sampai diperbaiki, jangan sajikan `wacc_pct` dan `cost_of_equity_pct` sebagai dua angka berbeda. |
| **HIGH** | ALGORITHM_ERROR | [lib/utils/seasonality.ts:88-93](lib/utils/seasonality.ts#L88-L93) | Matriks musiman 10 tahun dihitung dari harga **split-adjusted saja**, bukan *total return*. Proyek ini bahkan sudah mendefinisikan konstanta yang tepat untuk keperluan ini dan tidak memakainya. | `ret = ((current.lastClose - prev.lastClose) / prev.lastClose) * 100;`<br><br>Sumber candle: `app/dashboard/page.tsx:583`<br>`const candles = chartCandles.length > 0 ? chartCandles : data?.stock?.history`<br><br>[shared/market/price-basis.ts:32-33](shared/market/price-basis.ts#L32-L33):<br>`export const RETURN_PRICE_BASIS = 'TOTAL_RETURN_ADJUSTED';`<br>`export const TRADING_PRICE_BASIS = 'SPLIT_ADJUSTED';`<br>`// Yahoo chart quote.* is split-adjusted retroactively` | Setiap bulan cum-dividen mencatat penurunan harga ex-date sebagai **return bulanan negatif yang sesungguhnya tidak terjadi**. Untuk emiten IDX ber-yield tinggi (PTBA, ITMG, HMSP, UNVR, TLKM, BBCA) distorsinya 2-10 poin persen pada bulan pembayaran, dan **selalu satu arah**. `monthWinRates`, `monthAverages`, `bestMonth`, dan `worstMonth` semuanya terkontaminasi — bulan pembayaran dividen sistematis tampak sebagai bulan terburuk. Ini persis kebalikan dari kesimpulan yang benar. | Alirkan deret berbasis `RETURN_PRICE_BASIS` (adjusted close) ke `SeasonalityMatrix`, bukan deret harga perdagangan. Kalau *total return* tidak tersedia untuk suatu emiten, kembalikan `null` dan tampilkan status "tidak tersedia" — jangan diam-diam pakai harga mentah. Tambahkan parameter `priceBasis` wajib pada `calculateMonthlySeasonality()` supaya pemanggil tidak bisa lupa. |
| **HIGH** | STATIC_DATA | [lib/utils/blue-chip-index.ts:27-33](lib/utils/blue-chip-index.ts#L27-L33) · [app/dashboard/page.tsx:1130](app/dashboard/page.tsx#L1130) | Daftar konstituen LQ45 **belum pernah diverifikasi** terhadap pengumuman resmi IDX — diakui eksplisit di komentar kodenya sendiri — tetapi tooltip UI mengasersikannya sebagai fakta resmi. | Komentar kode:<br>`// >>> MASIH WAJIB DIVERIFIKASI MANUAL <<<`<br>`// Sampai 2026-08-18 daftar yang tersisa itu pun`<br>`// BELUM pernah dicocokkan ke pengumuman resmi IDX.`<br><br>Tooltip UI:<br>`title="Konstituen resmi indeks LQ45`<br>`Bursa Efek Indonesia (IDX)"` | Klaim identitas indeks yang tidak bersumber, disajikan sebagai fakta bursa. Karena "Blue-chip" di aplikasi ini **didefinisikan** sebagai keanggotaan LQ45 ([lib/utils/blue-chip-index.ts:9](lib/utils/blue-chip-index.ts#L9)), kesalahan daftar langsung merambat ke sinyal kepercayaan yang paling menonjol di UI. Daftar juga kedaluwarsa 2026-10-30 (72 hari lagi) tanpa jalur pembaruan otomatis. | Sampai verifikasi manual terhadap Peng-00148/BEI.POP/07-2026 selesai, turunkan bahasa tooltip menjadi "Daftar LQ45 periode 2026-08-03 s/d 2026-10-30 (snapshot internal, belum diverifikasi ke pengumuman IDX)". Setelah diverifikasi, catat tanggal verifikasi + nomor pengumuman di `lq45-universe.ts` dan naikkan kembali bahasanya. Tambahkan uji CI yang gagal ketika `CURRENT_LQ45_EFFECTIVE_TO` sudah lewat. |
| MEDIUM | ALGORITHM_ERROR | [modules/fundamental/service/dcf-valuation.service.ts:581-602](modules/fundamental/service/dcf-valuation.service.ts#L581-L602) | Reverse DCF memakai bisection tanpa memeriksa akar terkurung. Ketika harga pasar berada di luar rentang `[-30%, +60%]`, fungsi mengembalikan **batas kurungnya sendiri** sebagai jika itu hasil pengukuran. | `let low = -0.30; let high = 0.60;`<br>`for (let iter = 0; iter < 25; iter++) { … }`<br>`impliedGrowthPct = Math.round(bestG*1000)/10;` | Emiten yang harganya memperhitungkan pertumbuhan >60% (saham momentum, emiten pasca-IPO) melaporkan **tepat 60,0%**; emiten dalam tekanan berat melaporkan **tepat −30,0%**. Angka batas ini tampak seperti hasil hitungan dan dipakai pengguna sebagai bukti. | Evaluasi model pada `low` dan `high` sebelum iterasi. Jika `fairVal(high) < price` atau `fairVal(low) > price`, kembalikan `null` dengan penanda `IMPLIED_GROWTH_OUT_OF_RANGE`, lalu tampilkan "> 60%" / "< −30%" di UI, bukan angka batas. |
| MEDIUM | ALGORITHM_ERROR | [lib/fundamental/financial-health.ts:196-202](lib/fundamental/financial-health.ts#L196-L202) | Altman Z bentuk **manufaktur publik** diterapkan ke seluruh emiten non-keuangan. Suku `1.0 × (Sales/TA)` menghukum berat emiten padat modal yang perputaran asetnya memang rendah secara struktural. | `1.2*(WC/TA) + 1.4*(RE/TA) + 3.3*(EBIT/TA)`<br>`+ 0.6*(MVE/TL) + 1.0*(Sales/TA)`<br><br>Zona: `score < 1.8 ? 'DISTRESS' : score <= 2.99 ? 'GREY' : 'SAFE'` | Emiten properti, jalan tol, menara telekomunikasi, dan pembangkit listrik yang sehat masuk zona GREY/DISTRESS karena model bisnisnya, bukan karena risiko gagal bayarnya. Label "DISTRESS" adalah pernyataan berat tentang perusahaan nyata. Ambang bawah juga 1.8, sedangkan nilai Altman adalah 1.81. | Pakai Altman Z″ (varian 1993, 4 variabel, tanpa suku Sales/TA, ambang 1.1/2.6) untuk emiten non-manufaktur, dan pertahankan Z klasik hanya untuk manufaktur. Bedakan lewat `profile.sector`/`industry`. Perbaiki ambang bawah ke 1.81. Kalau varian yang benar tidak dapat dipilih, kembalikan `NOT_APPLICABLE` — konsisten dengan perlakuan sektor keuangan yang sudah benar di berkas ini. |
| MEDIUM | ALGORITHM_ERROR | [modules/fundamental/service/analyzers/der-analyzer.ts:2-8](modules/fundamental/service/analyzers/der-analyzer.ts#L2-L8) | Satuan `debtToEquity` diasumsikan tanpa validasi, dan komentarnya mengakui ketidakpastian itu apa adanya. | `// > 2.0 ratio (Yahoo returns percentage/ratio`<br>`// sometimes, usually raw * 100)`<br>`if (der > 200) { decision = 'BEARISH'; }`<br>`else if (der < 100) { decision = 'BULLISH'; }`<br>`value: `${(der/100).toFixed(2)}x`` | Kalau provider mengembalikan rasio mentah untuk sebagian emiten, DER 1,5x tampil sebagai "0,02x" dan diberi label **BULLISH** — kebalikan penuh dari kenyataan. Tidak ada pemeriksaan kewarasan yang akan menangkapnya. Kontras tajam dengan disiplin satuan USD/IDR di berkas lain proyek ini. | Normalisasi di satu tempat: kalau `der > 0 && der < 10`, hampir pasti rasio mentah; kalau `der >= 10`, persen. Lebih baik lagi, hitung DER dari `totalDebt / (marketCap / priceToBook)` yang satuannya tidak ambigu, dan kembalikan `null` kalau tidak dapat ditentukan. |
| MEDIUM | ALGORITHM_ERROR | [modules/fundamental/service/analyzers/eps-growth-analyzer.ts:2,19](modules/fundamental/service/analyzers/eps-growth-analyzer.ts#L2) | Metrik salah label ganda. `earningsQuarterlyGrowth` dari Yahoo adalah pertumbuhan **laba** kuartalan **year-over-year**, bukan EPS, dan bukan quarter-over-quarter. | `const growth = data?.defaultKeyStatistics?.earningsQuarterlyGrowth;`<br>`return { label: 'EPS Growth (QoQ)', … }` | Pengguna membaca "EPS Growth (QoQ) +25%" dan menyimpulkan momentum kuartal terakhir, padahal angkanya membandingkan terhadap kuartal yang sama tahun lalu, dan tidak menormalisasi jumlah saham beredar (sehingga right issue/buyback tidak tercermin). | Ubah label menjadi "Pertumbuhan Laba (YoY, kuartalan)". Kalau EPS growth sesungguhnya dibutuhkan, turunkan dari deret EPS di `modules/fundamental/repository/fundamental-history.repository.ts` yang sudah menyimpan riwayat per periode. |
| MEDIUM | ALGORITHM_ERROR | [modules/fundamental/service/analyzers/roe-analyzer.ts:12-17](modules/fundamental/service/analyzers/roe-analyzer.ts#L12) · der/eps/dividend-analyzer | Field `confidence` diturunkan dari **besaran metriknya sendiri**, bukan dari ketidakpastian statistik apa pun. Ini presisi palsu. | `confidence = Math.min(95, 50 + (roePct * 2));`<br>`confidence = Math.min(99, 60 + growthPct);`<br>`confidence = Math.min(95, 50 + yieldVal * 5);` | "Confidence 95%" pada kartu analyzer terbaca sebagai pernyataan tentang keandalan data atau kekuatan bukti. Sesungguhnya ia hanya transformasi linear dari nilai metrik yang sudah ditampilkan tepat di sebelahnya — informasi nol, kesan otoritas tinggi. Nilai ini juga ikut menentukan urutan/penonjolan kartu di UI. | Ganti nama field menjadi `strength` (kekuatan sinyal) dan nyatakan di UI bahwa ia diturunkan dari besaran metrik. Atau hapus. Simpan `confidence` khusus untuk hal yang benar-benar diukur, misalnya kelengkapan data — pola yang sudah benar di `coverage_pct` pada `scoring.service.ts`. |
| MEDIUM | ALGORITHM_ERROR | [lib/utils/seasonality.ts:84-92](lib/utils/seasonality.ts#L84-L92) | Return bulanan diambil dari **entri sebelumnya dalam array terurut**, bukan dari bulan kalender sebelumnya. Komentarnya mengklaim ada pemeriksaan kontinuitas yang tidak pernah ditulis. | `const prevKey = sortedMonthKeys[i - 1];`<br>`const prev = prevKey ? monthMap.get(prevKey) : null;`<br>`// If previous month exists in continuous`<br>`// sequence, use prev month's last close`<br>`if (prev) { ret = ((current.lastClose - prev.lastClose) / prev.lastClose) * 100; }` | Emiten dengan bulan yang hilang (suspensi, jeda perdagangan, awal riwayat) mendapat return multi-bulan yang **diatribusikan ke satu bulan**. Saham yang disuspensi 3 bulan menampilkan lonjakan raksasa pada satu sel matriks. | Bandingkan `prev.year`/`prev.month` dengan bulan kalender sebelumnya; kalau tidak bersebelahan, set `null` dan biarkan selnya kosong. |
| MEDIUM | ALGORITHM_ERROR | [lib/utils/seasonality.ts:65-66](lib/utils/seasonality.ts#L65-L66) | Pengelompokan bulan memakai `getFullYear()`/`getMonth()` — **zona waktu server**, bukan Asia/Jakarta. Melanggar konvensi proyek sendiri. | `const year = c.date.getFullYear();`<br>`const month = c.date.getMonth();`<br><br>Konvensi proyek, [shared/market/previous-close.ts:35](shared/market/previous-close.ts#L35):<br>`new Intl.DateTimeFormat('en-CA', {`<br>`  timeZone: 'Asia/Jakarta', … })` | Pada server dengan offset negatif terhadap UTC, bar bursa tanggal 1 dapat masuk ke ember bulan sebelumnya. Hasil matriks musiman menjadi **bergantung pada lokasi deploy** — bug yang tidak akan pernah muncul di pengembangan lokal WIB dan akan muncul diam-diam setelah pindah wilayah. | Pakai `Intl.DateTimeFormat` dengan `timeZone: 'Asia/Jakarta'`, sama persis dengan `previous-close.ts` dan `trading-session.ts`. |
| MEDIUM | ALGORITHM_ERROR | [app/dashboard/page.tsx:116-119](app/dashboard/page.tsx#L116-L119) | Implementasi SMA **keempat** dalam basis kode ini, dijalankan di klien, dan **dibulatkan**. Ini kelas bug yang sama persis dengan C-01 (dua ATR) dan L-3 (tiga EMA) yang sudah diperbaiki proyek ini. | `function smaOf(candles, period) {`<br>`  return Math.round(slice.reduce(…) / period);`<br>`}`<br><br>Salinan lain: `lib/chart-indicators.ts:112 smaSeries`, `lib/miniCouncil.ts:66 sma`, dan MA di dalam `scoring.service.ts` | Untuk harga yang berada dalam ±0,5 dari MA, Dashboard dapat menampilkan "harga di atas MA20" sementara `scoreMATrend()` di server menghitungnya di bawah — dua kesimpulan berlawanan pada layar yang sama. Perhitungan indikator di klien juga berarti angkanya tidak dapat diaudit dari log server. | Hapus `smaOf`, `pctChange`, `volatility20D` dari komponen klien. Sajikan nilainya dari `app/api/stock/[ticker]` yang sudah memakai indikator baku. Kalau perhitungan klien tetap diperlukan untuk responsivitas, impor dari `lib/chart-indicators.ts` dan hapus pembulatan. |
| MEDIUM | STATIC_DATA | [all.csv](all.csv) · [shared/market/emiten-list.ts:21-43](shared/market/emiten-list.ts#L21-L43) | Master 962 emiten dibaca dari CSV statis tanpa metadata kesegaran, tanpa entri di `MANUAL_MARKET_REFERENCE_REVIEWS`, dan tanpa pekerjaan cron yang memperbaruinya. | `const csvPath = fs.existsSync(allCsvPath) ? allCsvPath : legacyCsvPath;`<br>`const lines = fs.readFileSync(csvPath, 'utf8')…`<br>`// cache di module scope, tidak pernah invalidasi` | Emiten IPO baru **ditolak sebagai kode saham tidak valid** oleh `getEmitenSymbolSet()`, yang dipakai LensAI untuk mengenali kode saham dari pertanyaan bebas. Emiten delisting tetap muncul. `app/sitemap.ts` menerbitkan halaman untuk emiten yang sudah tidak ada. Cache module-scope tidak pernah kedaluwarsa selama instance hidup. | Daftarkan `all.csv` ke `MANUAL_MARKET_REFERENCE_REVIEWS` dengan `reviewedAt` + `reviewBy` supaya penjaga CI yang sudah ada ikut mengawasinya. Tambahkan pekerjaan cron bulanan yang menyegarkan dari daftar emiten IDX dan gagal keras bila jumlah barisnya turun drastis. |
| MEDIUM | STATIC_DATA | [modules/market/service/market-pulse.service.ts:28-40](modules/market/service/market-pulse.service.ts#L28-L40) | Heatmap sektor dihitung dari 4-8 saham wakil per sektor yang dikurasi manual, bukan indeks sektor IDX. | `const IDX_SECTORS = [`<br>`  { sector:'Financial', stocks:['BBCA.JK','BBRI.JK',…] },`<br>`  … ]` | Persentase per sektor tidak sebanding dengan indeks sektor IDX mana pun dan sangat sensitif terhadap satu saham. **Mitigasi yang sudah ada dan memadai:** UI menyatakan keterbatasan ini secara eksplisit tiga kali (subjudul heatmap, tiap tile, dan modal detail) dengan kalimat "bukan indeks sektor resmi IDX". Diturunkan ke MEDIUM murni karena pengungkapannya jujur. | Pertahankan pengungkapan. Kalau kelak akurasi sektor diperlukan, ambil indeks sektor IDX (IDXFIN, IDXENERGY, dst.) lewat jalur yang sama dengan `^JKSE`/`^JKLQ45` yang sudah berjalan. |
| MEDIUM | DATA_PIPELINE | [modules/fundamental/service/dcf-valuation.service.ts:280-289](modules/fundamental/service/dcf-valuation.service.ts#L280-L289) vs [:554](modules/fundamental/service/dcf-valuation.service.ts#L554) | Dua perlakuan utang berbeda untuk emiten yang sama di dua halaman. `calculateIntrinsicValue()` (LensFundamental) **tidak** mengurangkan utang bersih dari perpetuitas FCF; `calculateDcfModel()` (`/dcf`) mengurangkannya. | LensFundamental:<br>`intrinsic_dcf = (fcf_per_share * 1.05) / (0.12 - 0.05);`<br>`validFairValues.push(intrinsic_dcf);  // tanpa netDebt`<br><br>Halaman /dcf:<br>`fairValue = enterpriseValuePerShare - netDebtPerShare;` | Satu emiten menampilkan dua nilai wajar berbasis FCF yang berbeda di dua halaman, tanpa cara bagi pengguna untuk tahu keduanya memakai perlakuan neraca yang berbeda. Ini kelas masalah yang sama dengan C-05 yang sudah diperbaiki proyek ini untuk PBV/PER. | Setelah `H-02` diselesaikan, samakan perlakuannya. Kalau keduanya memang dimaksudkan berbeda (perpetuitas cepat vs proyeksi penuh), nyatakan perbedaannya di `assumptions.note` masing-masing. |
| LOW | ALGORITHM_ERROR | [lib/chart-indicators.ts:161,231,263](lib/chart-indicators.ts#L161) | RSI, EMA, ATR, dan MACD punya implementasi deret terpisah dari implementasi skalar di `modules/technical/service/`. Diverifikasi **ekuivalen secara numerik hari ini**, tetapi tidak ada yang menjamin keduanya tetap sama setelah perbaikan berikutnya. | `lib/chart-indicators.ts`: `rsiSeries`, `emaValues`, `atrSeries`, `macdSeries`<br>`modules/technical/service/`: `calculateRsi`, `calculateEmaSeries`, `calculateWilderAtr`, `calculateMacd` | Risiko divergensi masa depan pada angka yang tampil berdampingan di layar. Basis kode ini sudah pernah tertimpa masalah ini dua kali (C-01 dua ATR, L-3 tiga EMA) dan mendokumentasikannya sebagai kelas bug yang harus dihapus. | Refaktor `chart-indicators.ts` sehingga fungsi deretnya memanggil primitif baku di `modules/technical/service/`, atau sebaliknya. Sampai itu terjadi, tambahkan uji golden yang mengunci kedua jalur menghasilkan nilai identik pada deret uji yang sama. |
| LOW | DATA_PIPELINE | [shared/cache/ttl-policy.ts:18](shared/cache/ttl-policy.ts#L18) vs [shared/market/trading-session.ts:8](shared/market/trading-session.ts#L8) | Dua definisi jam bursa dengan jam tutup berbeda: 16:00 dan 15:00. | `ttl-policy.ts:    hour >= 9 && hour < 16`<br>`trading-session.ts: SESSION_CLOSE_MINUTES = 15 * 60` | Tujuannya memang berbeda (TTL cache vs deteksi bar berjalan) dan selisihnya konservatif ke arah aman, tetapi dua sumber kebenaran jam bursa akan menyimpang saat IDX mengubah jam sesi. | Satukan ke `trading-session.ts` sebagai sumber tunggal; biarkan `ttl-policy.ts` menambahkan bantalannya sendiri secara eksplisit (`isIdxMarketHoursNow() || withinMinutesAfterClose(60)`). |
| LOW | ALGORITHM_ERROR | [app/dashboard/page.tsx:134-137](app/dashboard/page.tsx#L134-L137) | `volatility20D` memakai varians **populasi** (÷n), sedangkan `performance-metrics.ts` memakai varians **sampel** (÷n−1) untuk besaran yang sama. | Dashboard: `variance = … / returns.length;`<br>[modules/backtest/service/performance-metrics.ts:83](modules/backtest/service/performance-metrics.ts#L83): `… / (values.length - 1)` | Volatilitas tahunan di Dashboard sekitar 2,5% relatif lebih rendah daripada di Backtest untuk deret 20 hari yang sama. Kecil, tetapi terlihat kalau pengguna membandingkan dua halaman. | Pakai `sampleStdDev` bersama. Diselesaikan sekaligus oleh perbaikan `M-07` (hapus perhitungan indikator di klien). |
| LOW | STATIC_DATA | [modules/market/service/dcf-valuation.service.ts:403-405](modules/fundamental/service/dcf-valuation.service.ts#L403-L405) · [fair-multiples.service.ts:36-38](modules/fundamental/service/fair-multiples.service.ts#L36-L38) | Yield SBN 10Y (6,7%) dan equity risk premium (5,2%) adalah asumsi statis dengan `SET_ON: '2026-08-03'` dan tidak ada sumber data yang menyegarkannya. | `const SBN_10Y_YIELD_PCT = 6.7;`<br>`const EQUITY_RISK_PREMIUM_PCT = 5.2;`<br>`const MACRO_ASSUMPTION_SET_ON = '2026-08-03';` | Setiap nilai wajar, PBV*, PER*, Sharpe, dan Sortino bergantung pada dua angka yang kini berumur 16 hari dan akan terus menua. **Mitigasi yang sudah ada dan kuat:** ditandai `is_assumption: true`, tanggal penetapannya diekspos ke UI, dan tabel sensitivitas WACC disediakan. Diturunkan ke LOW karena pengungkapannya lengkap. | Tambahkan penjaga CI yang gagal bila `SET_ON` berumur lebih dari 90 hari, sejalan dengan pola `reviewBy` di `MANUAL_MARKET_REFERENCE_REVIEWS`. |
| LOW | ALGORITHM_ERROR | [lib/utils/position-sizer.ts:47-62](lib/utils/position-sizer.ts#L47-L62) | Ukuran posisi berbasis risiko tidak memperhitungkan komisi broker maupun slippage. | `const maxRiskIdr = (capitalIdr * riskTolerancePct) / 100;`<br>`maxLots = Math.floor(maxRiskIdr / riskPerLotIdr);`<br>`actualRiskLossIdr = totalShares * riskPerShareIdr;` | Kerugian sesungguhnya saat cut loss melampaui batas risiko yang diminta sebesar komisi beli + jual (IDX umumnya 0,15%-0,35% gabungan). Pada toleransi risiko 1%, selisihnya berarti. Rumus intinya sendiri benar. | Tambahkan input `feePctRoundTrip` opsional (default 0) dan sertakan dalam `riskPerShareIdr`. Atau nyatakan di UI bahwa angkanya belum termasuk biaya transaksi. |
| LOW | ALGORITHM_ERROR | [modules/news/service/news.service.ts:105-114](modules/news/service/news.service.ts#L105-L114) | Sentimen cadangan berbasis pencocokan kata kunci tunggal pada judul. | `const POSITIVE_WORDS = ['naik','menguat',…,'laba',…];`<br>`const posHit = POSITIVE_WORDS.find(w => lower.includes(w));`<br>`if (posHit && !negHit) return { sentiment:'POSITIF', … }` | "Rugi bersih menyusut tajam" terklasifikasi NEGATIF meski kabarnya baik. **Mitigasi yang sudah ada:** alasan yang ditampilkan menyebut kata pemicunya apa adanya (`Mengandung kata kunci positif: "laba"`), sehingga pengguna dapat menilai sendiri, dan jalur utamanya adalah klasifikasi AI dengan heuristik ini hanya sebagai cadangan. | Cukup pertahankan. Kalau ingin lebih baik, beri label "Heuristik kata kunci" pada badge saat jalur cadangan aktif, agar berbeda kasat mata dari hasil klasifikasi AI. |
| LOW | SECURITY | [.env.example:134](.env.example#L134) · [shared/auth/session.ts:64,93](shared/auth/session.ts#L64) | `NEXT_PUBLIC_TESTING_OPEN_ACCESS=true` pada template env — gerbang berbayar terbuka secara default pada penyiapan baru. | `.env.example:  NEXT_PUBLIC_TESTING_OPEN_ACCESS=true`<br>`session.ts:  if (TESTING_OPEN_ACCESS) return true;`<br>`proxy.ts:298  if (TESTING_OPEN_ACCESS || payload.role === 'admin' …)` | Penyiapan produksi baru yang menyalin `.env.example` apa adanya akan membuka seluruh fitur Pro ke semua pengunjung termasuk tamu. **Mitigasi yang sudah ada:** `scripts/audit-production-integrity.mjs:20` sudah memperingatkan kondisi ini dan skrip itu bagian dari `npm run verify:prod`. Ini pilihan bisnis fase beta, bukan kebocoran. | Ubah nilai di `.env.example` menjadi `false` dan pindahkan `=true` ke komentar dengan penjelasan. Naikkan peringatan di `audit-production-integrity.mjs` dari `warn` menjadi `fail` ketika `NODE_ENV === 'production'`. |

---

## 5. Audit Algoritma — Rumus Benar vs Implementasi

### 5.1 Indikator Teknikal

| Algoritma | Rumus Benar (Wilder 1978 / Appel / Bollinger / Chaikin) | Implementasi Saat Ini | Status |
| :--- | :--- | :--- | :--- |
| **RSI (14)** | Seed = rata-rata 14 gain/loss pertama; lalu RMA: `avg = (avg×13 + nilai)/14`; `RSI = 100 − 100/(1+RS)` | [modules/technical/service/rsi.ts:19-47](modules/technical/service/rsi.ts#L19-L47) — Wilder smoothing tepat, `avgLoss === 0 → 100`, `null` bila bar < period+1 | **BENAR** |
| **EMA** | Seed = SMA `period` pertama; `EMA = P×k + EMA₋₁×(1−k)`, `k = 2/(period+1)` | [modules/technical/service/ema.ts:37-54](modules/technical/service/ema.ts#L37-L54) — seed SMA benar; `firstValidEmaIndex()` mencegah pembacaan rentang seed | **BENAR** |
| **MACD (12,26,9)** | `MACD = EMA12 − EMA26`; `Signal = EMA9(MACD)` dihitung hanya atas MACD yang sah | [modules/technical/service/ema.ts:82-102](modules/technical/service/ema.ts#L82-L102) — `firstValid = slow − 1`, signal hanya atas irisan sah. Perbaikan M-10 sudah diterapkan | **BENAR** |
| **SMA** | `Σ(close)/n` atas jendela bergerak | [lib/chart-indicators.ts:112-122](lib/chart-indicators.ts#L112-L122) — jendela geser O(n), benar | **BENAR** (lihat `M-07` untuk salinan klien yang dibulatkan) |
| **ATR (14)** | `TR = max(H−L, \|H−C₋₁\|, \|L−C₋₁\|)`; seed = rata-rata 14 TR; lalu RMA | [modules/technical/service/atr.ts:75-90](modules/technical/service/atr.ts#L75-L90) — Wilder benar; TR = 0 **disertakan** (benar); bar 0 tidak diberi TR semu | **BENAR** |
| **Bollinger Bands (20, 2)** | `Mid = SMA20`; `Upper/Lower = Mid ± k×σ`, σ = **deviasi populasi** | [lib/chart-indicators.ts:143-158](lib/chart-indicators.ts#L143-L158) — σ populasi (÷n), sesuai definisi Bollinger dan `ta.stdev` TradingView | **BENAR** |
| **CMF (20)** | `MFM = ((C−L)−(H−C))/(H−L)`; `CMF = Σ(MFM×V)/ΣV` | [lib/chart-indicators.ts:259-280](lib/chart-indicators.ts#L259-L280) — benar; `range === 0` → MFV 0; `volumeSum <= 0` → `null` | **BENAR** |
| **Heikin-Ashi** | `HAclose = (O+H+L+C)/4`; `HAopen = (HAopen₋₁+HAclose₋₁)/2` | [lib/chart-indicators.ts:92-110](lib/chart-indicators.ts#L92-L110) | **BENAR** |
| **Stochastic** | `%K = 100×(C−L14)/(H14−L14)` | **Tidak diimplementasikan.** Muncul hanya sebagai label di `backtest.types.ts` | **TIDAK ADA** — bukan cacat; tidak diklaim di UI |
| **Volatilitas tahunan** | `σ(return harian) × √252` | [app/dashboard/page.tsx:130-139](app/dashboard/page.tsx#L130-L139) — varians populasi (lihat `L-03`) | **BENAR dengan catatan satuan** |

**Pemeriksaan bias:**
- **Look-ahead / repainting:** [modules/technical/service/atr.ts:98-101](modules/technical/service/atr.ts#L98-L101) `wilderAtrAt()` mengiris `bars.slice(0, index+1)` — bar masa depan tidak dapat mempengaruhi ATR pada tanggal itu. **Benar.**
- **Off-by-one SMA/EMA:** SMA memancarkan nilai pertama pada `i === period − 1`; EMA menandai indeks sah pertama pada `period − 1`. **Benar.**
- **Survivorship bias:** [modules/market/constants/lq45-universe.ts:6-7](modules/market/constants/lq45-universe.ts#L6-L7) memuat peringatan eksplisit agar snapshot ini tidak dipakai membacktest tanggal sebelum `effectiveFrom`. **Ditangani secara sadar.**
- **Pembagian nol:** dijaga di setiap rumus yang diperiksa (`avgLoss === 0`, `prev > 0`, `volumeSum > 0`, `rawMax === 0`, `spread = Math.max(MIN_SPREAD, r − g)`).
- **Adjusted close:** **GAGAL pada Seasonality** — lihat `H-03`. Benar di tempat lain lewat `RETURN_PRICE_BASIS`.

### 5.2 Rasio Fundamental & Valuasi

| Algoritma | Rumus Benar | Implementasi Saat Ini | Status |
| :--- | :--- | :--- | :--- |
| **PBV Wajar** | Gordon: `PBV* = (ROE − g)/(r − g)` | [fair-multiples.service.ts:176](modules/fundamental/service/fair-multiples.service.ts#L176) — `(roeDecimal − g)/spread` | **BENAR** |
| **PER Wajar** | `PER* = payout × (1+g)/(r − g)` | [fair-multiples.service.ts:181-182](modules/fundamental/service/fair-multiples.service.ts#L181-L182) — memakai `payout_implied = 1 − g/ROE` agar konsisten dengan batas `g`; identitas `PBV = PER × ROE` terpenuhi | **BENAR** — pilihan yang secara teoretis lebih rapat daripada payout teramati |
| **Cost of Equity** | CAPM: `r = Rf + β×ERP` | [fair-multiples.service.ts:75-82](modules/fundamental/service/fair-multiples.service.ts#L75-L82) — β di-clamp 0,4-2,0 dengan alasan likuiditas IDX yang dijelaskan | **BENAR** (Rf & ERP statis, lihat `L-04`) |
| **Sustainable Growth** | `g = ROE × (1 − payout)` | [fair-multiples.service.ts:94-102](modules/fundamental/service/fair-multiples.service.ts#L94-L102) — dibatasi 5% dengan alasan ekonomi yang benar | **BENAR** |
| **Graham Number** | `√(22.5 × EPS × BVPS)` | [dcf-valuation.service.ts:178](modules/fundamental/service/dcf-valuation.service.ts#L178) — `Math.sqrt(22.5 × eps × bvps)`, dilewati bila EPS/BVPS ≤ 0 | **BENAR** |
| **DDM (Gordon)** | `P = D₀(1+g)/(r − g)` | [dcf-valuation.service.ts:243-249](modules/fundamental/service/dcf-valuation.service.ts#L243-L249) | **BENAR** — `r` 10,5% untuk bank ROE>20 adalah asumsi yang diungkap, bukan kesalahan rumus |
| **Margin of Safety** | `(Nilai Intrinsik − Harga)/Nilai Intrinsik` | [dcf-valuation.service.ts:325](modules/fundamental/service/dcf-valuation.service.ts#L325) dan [:594](modules/fundamental/service/dcf-valuation.service.ts#L594) | **BENAR** |
| **DCF 5 tahun** | Proyeksi FCF; `TV = FCF₅(1+g)/(WACC − g)`; PV; **kurangi utang bersih hanya bila memakai FCFF@WACC** | [dcf-valuation.service.ts:539-555](modules/fundamental/service/dcf-valuation.service.ts#L539-L555) | **SALAH** — lihat `H-02` (utang dihitung dua kali) |
| **Reverse DCF** | Bisection atas `g` sampai `NilaiWajar(g) = Harga`, dengan pemeriksaan kurungan | [dcf-valuation.service.ts:578-603](modules/fundamental/service/dcf-valuation.service.ts#L578-L603) | **SALAH SEBAGIAN** — bisection benar, kurungan tidak diperiksa; lihat `M-01` |
| **Piotroski F-Score** | 9 kriteria: ROA>0, CFO>0, ΔROA>0, CFO>NI, ΔLeverage↓, ΔCR↑, tanpa dilusi, ΔGM↑, ΔATO↑ | [financial-health.ts:107-118](lib/fundamental/financial-health.ts#L107-L118) — kesembilan kriteria hadir dan benar; skor **tidak diterbitkan** kecuali kesembilannya dapat dievaluasi | **BENAR** — penanganan data kurang yang patut dicontoh |
| **Altman Z** | Manufaktur: `1.2X₁+1.4X₂+3.3X₃+0.6X₄+1.0X₅`, ambang 1.81/2.99 | [financial-health.ts:196-203](lib/fundamental/financial-health.ts#L196-L203) — koefisien benar, ambang 1.8 (seharusnya 1.81), diterapkan ke seluruh non-keuangan | **SALAH KONTEKS** — lihat `M-02` |
| **Sharpe Ratio** | `(mean(excess)/σ(excess)) × √periode` | [performance-metrics.ts:182-188](modules/backtest/service/performance-metrics.ts#L182-L188) — σ sampel (n−1), `periodsPerYear` diturunkan dari data | **BENAR** |
| **Sortino Ratio** | `mean(excess)/downside_deviation × √periode`, downside dirata-rata atas **seluruh** pengamatan | [performance-metrics.ts:192-196](modules/backtest/service/performance-metrics.ts#L192-L196) — penyebut atas `excess.length`, bukan hanya hari rugi | **BENAR** — kesalahan umum ini justru dihindari secara eksplisit |
| **CAGR** | `(Akhir/Awal)^(1/tahun) − 1` | [performance-metrics.ts:161](modules/backtest/service/performance-metrics.ts#L161) — `tahun` dari rentang tanggal nyata | **BENAR** |
| **Profit Factor** | `Σ laba / \|Σ rugi\|` | [performance-metrics.ts:120-122](modules/backtest/service/performance-metrics.ts#L120-L122) — `null` bila tidak ada trade rugi, bukan ∞ | **BENAR** |
| **P/L Portofolio** | `(Sekarang − Beli)/Beli × 100` | [modules/portfolio/utils/pnl-calculator.ts:6-8](modules/portfolio/utils/pnl-calculator.ts#L6-L8) — override hardcode lama sudah dihapus | **BENAR** |
| **Risk/Reward** | `(TP − Entry)/(Entry − SL)` | [pnl-calculator.ts:10-15](modules/portfolio/utils/pnl-calculator.ts#L10-L15) | **BENAR** |
| **Position Sizing** | `Lot = ⌊(Modal×Risk%)/(RisikoPerSaham×100)⌋` | [position-sizer.ts:47-54](lib/utils/position-sizer.ts#L47-L54) — 100 saham/lot IDX benar | **BENAR** (biaya transaksi tidak disertakan, `L-05`) |
| **PER / PBV / ROE / ROA / NPM** | Rasio langsung dari provider | Diteruskan apa adanya dari `yahoo-finance2` dengan koreksi mata uang USD→IDR; `null` bila tidak tersedia | **BENAR** |
| **DER** | `Total Utang / Total Ekuitas` | Provider mengembalikan persen; 5 pemanggil membagi 100; **1 pemanggil tidak** | **SALAH pada satu jalur** — lihat `H-01` dan `M-03` |
| **Dividend Yield** | `DPS/Harga × 100` | Diperlakukan konsisten sebagai fraksi × 100 di 4 pemanggil; diverifikasi oleh uji `dividendYield: 0.045 → 4.5` | **BENAR** |
| **Seasonality bulanan** | Return bulanan dari **adjusted close** bulan kalender bersebelahan | [seasonality.ts:80-95](lib/utils/seasonality.ts#L80-L95) | **SALAH** — lihat `H-03`, `M-05`, `M-06` |

### 5.3 Scoring & Screening

**LensScore** ([modules/technical/service/scoring.service.ts](modules/technical/service/scoring.service.ts)) — bobot Teknikal 40 / Fundamental 30 / Flow 30, sumber tunggal di [shared/constants/lens-score-weights.ts](shared/constants/lens-score-weights.ts) dengan uji yang mengunci totalnya 100.

| Aspek | Penilaian |
| :--- | :--- |
| **Renormalisasi** | **BENAR.** `combine()` ([:775-789](modules/technical/service/scoring.service.ts#L775-L789)) memisahkan pembilang (bobot yang datanya ada) dari penyebut kelengkapan (`declaredMax`, konstan). Komponen yang datanya hilang tidak berubah menjadi nol yang menghukum, dan kehilangan itu tetap terlihat lewat `coverage_pct`. |
| **Tidak berlaku vs tidak tersedia** | **BENAR.** `declaredMax === 0` menandai komponen yang tidak relevan untuk sektor (DER/CR untuk bank) dan dipisahkan dari `missing` — bank tidak terlihat "datanya kurang" karena rasio yang memang tidak berlaku. |
| **Ambang batas kategori** | **HIPOTESIS.** `STRONG_BUY`/`BUY`/`HOLD` belum divalidasi terhadap forward return. Ini diakui di kode. Ada infrastruktur kalibrasi (`lens-score-optimizer`, `score-calibration.service`, `/admin/calibration`) yang membandingkan proposal terhadap baseline nyata. |
| **Bobot 40/30/30** | **HIPOTESIS, diungkap.** Tidak diturunkan dari optimasi. Panel admin sengaja **tidak** dapat mengubahnya saat runtime — perubahan hanya lewat commit. Keputusan yang benar. |
| **Double counting** | **SUDAH DIPERBAIKI** (temuan H-1 audit sebelumnya): `scoreAsing()` dan `scoreBandar()` dulu menilai kuantitas CMF yang sama dua kali. |
| **Ambang `scoreMultipleRatio`** | Ditandai `[HIPOTESIS]` di komentar. Skala 0-5 dipakai bersama PER dan PBV agar sebanding. |

**Kesimpulan:** normalisasi dan penanganan data kurang pada LensScore adalah bagian terkuat
dari basis kode ini. Bobot dan ambangnya adalah hipotesis yang **dinyatakan sebagai
hipotesis**, bukan disamarkan sebagai hasil pengukuran.

---

## 6. Integritas Pipeline Data

| Pemeriksaan | Hasil |
| :--- | :--- |
| **Cache selamanya** | Tidak ada. TTL sadar jam bursa: 60 detik saat bursa buka, 6 jam saat tutup ([shared/cache/ttl-policy.ts](shared/cache/ttl-policy.ts)). Cache kurs USD/IDR 7 hari **disengaja** dan didokumentasikan sebagai bantalan outage multi-hari. |
| **Fallback ke data karangan saat fetch gagal** | **Tidak ada.** `getUsdIdrRate()` mengembalikan `null` bila fetch gagal **dan** belum pernah ada nilai tersimpan; kontraknya secara eksplisit melarang pemanggil menggantinya dengan konstanta. Konstanta `\|\| 15500` lama sudah dihapus dari kelima call-site. |
| **Penanganan API down / rate limit** | [shared/http/provider-circuit-breaker.ts](shared/http/provider-circuit-breaker.ts) + backoff eksponensial dengan jitter di [ownership-fetcher.service.ts:194](modules/ownership-flow/service/ownership-fetcher.service.ts#L194). |
| **Data kosong / emiten delisting** | Fail-closed dengan status bernama: `NO_FCF_DATA`, `NO_ROE_DATA`, `NO_BALANCE_SHEET_DATA`, `NEGATIVE_EQUITY_VALUE`, `SECTOR_BANK`, `DATA_UNAVAILABLE`, `BLOCKED`. UI merender status, bukan angka nol. |
| **Timestamp `lastUpdate`** | Nyata. `job_run_log` di PostgreSQL, `mtimeMs` berkas untuk artefak IDX ([idx-foreign-flow.service.ts:152](modules/market/service/idx-foreign-flow.service.ts#L152)), `assessFreshness` fail-closed ke STALE bila cadence sumber `UNKNOWN`. |
| **Acuan penutupan sebelumnya** | [shared/market/previous-close.ts](shared/market/previous-close.ts) — **contoh terbaik di basis kode ini.** Menolak `meta.previousClose` Yahoo yang terbukti melewati satu sesi dan membalik arah IHSG; memakai riwayat harian dengan tanggal zona Jakarta; menandai `metaDisagrees` untuk diagnostik. |
| **Autentikasi rute cron** | Setiap rute bergerbang: tanda tangan QStash (`verifyQStashSignature`) atau `CRON_SECRET`. Tidak ada rute cron terbuka. |
| **Gerbang sumber Ownership Flow** | [ownership-flow-ingest.service.ts:113-146](modules/ownership-flow/service/ownership-flow-ingest.service.ts#L113-L146) — gerbang diperiksa **sebelum satu pun request keluar**. Sumber `UNVERIFIED` memblokir ingestion tanpa peduli feature flag apa pun. Ini fail-closed dalam bentuk terkuatnya. |
| **Basis data** | 11 migrasi, **nol `INSERT INTO`**. Harga & fundamental diperbarui lewat cron (`fundamental-snapshot`, `market-summary`, `intraday-collect`, `broker-summary-scan`), bukan sisipan statis sekali jalan. |

---

## 7. Keamanan & Performa

| Pemeriksaan | Hasil |
| :--- | :--- |
| Kunci API di frontend | **Bersih.** Sepuluh variabel `NEXT_PUBLIC_*` seluruhnya non-rahasia: URL aplikasi, detail rekening pembayaran (memang untuk ditampilkan), satu flag pengujian. |
| Berkas `.env` ter-commit | **Bersih.** `.gitignore` memblokir `.env*` dengan pengecualian eksplisit hanya untuk `.env.example`. |
| Rahasia hardcoded | **Bersih.** [shared/auth/jwt.ts:15](shared/auth/jwt.ts#L15) menolak start aplikasi tanpa `JWT_SECRET_KEY`. |
| Pembangkit OTP | **Benar.** `crypto.randomInt` (CSPRNG), bukan `Math.random()` — temuan H4 audit sebelumnya sudah ditutup. |
| Gerbang berbayar | Berfungsi, tetapi default-terbuka di template env — lihat `L-06`. |
| Perhitungan di klien yang seharusnya di server | **Ditemukan** — `smaOf`, `pctChange`, `volatility20D` di [app/dashboard/page.tsx:116-139](app/dashboard/page.tsx#L116-L139); lihat `M-07`. |
| Kompleksitas | [modules/technical/service/atr.ts:98-101](modules/technical/service/atr.ts#L98-L101) `wilderAtrAt()` menghitung ulang seluruh deret setiap indeks — O(n²) pada backtest panjang. Benar secara hasil, bukan masalah korektness. Optimasi bertahap tersedia bila profiling menunjukkannya. |

---

## 8. Daftar Berkas 100% Bersih

Berkas berikut diperiksa baris demi baris dan **tidak memiliki temuan** — rumusnya cocok
dengan definisi baku, penanganan data hilangnya fail-closed, dan tidak ada nilai statis
yang disajikan sebagai data pasar.

**Indikator teknikal**
- [modules/technical/service/rsi.ts](modules/technical/service/rsi.ts)
- [modules/technical/service/ema.ts](modules/technical/service/ema.ts)
- [modules/technical/service/atr.ts](modules/technical/service/atr.ts)

**Valuasi fundamental**
- [modules/fundamental/service/fair-multiples.service.ts](modules/fundamental/service/fair-multiples.service.ts)
- [modules/fundamental/service/analyzers/roa-analyzer.ts](modules/fundamental/service/analyzers/roa-analyzer.ts)
- [modules/fundamental/service/analyzers/pe-analyzer.ts](modules/fundamental/service/analyzers/pe-analyzer.ts)
- [modules/fundamental/service/analyzers/pbv-analyzer.ts](modules/fundamental/service/analyzers/pbv-analyzer.ts)

**Backtest & metrik kinerja**
- [modules/backtest/service/performance-metrics.ts](modules/backtest/service/performance-metrics.ts)

**Pipeline data & integritas**
- [shared/market/previous-close.ts](shared/market/previous-close.ts)
- [shared/market/usd-idr-rate.ts](shared/market/usd-idr-rate.ts)
- [shared/market/price-basis.ts](shared/market/price-basis.ts)
- [shared/market/trading-session.ts](shared/market/trading-session.ts)
- [shared/format/fundamental-format.ts](shared/format/fundamental-format.ts)

**Scoring**
- [modules/technical/service/scoring.service.ts](modules/technical/service/scoring.service.ts)
- [shared/constants/lens-score-weights.ts](shared/constants/lens-score-weights.ts)

**Ownership Flow (seluruh modul)**
- [modules/ownership-flow/source/source-registry.ts](modules/ownership-flow/source/source-registry.ts)
- [modules/ownership-flow/service/ownership-flow-ingest.service.ts](modules/ownership-flow/service/ownership-flow-ingest.service.ts)
- [modules/ownership-flow/config/ownership-flow.config.ts](modules/ownership-flow/config/ownership-flow.config.ts)

**Portofolio & risiko**
- [modules/portfolio/utils/pnl-calculator.ts](modules/portfolio/utils/pnl-calculator.ts)

**Keamanan**
- [shared/auth/jwt.ts](shared/auth/jwt.ts)
- [modules/user/utils/otp-generator.ts](modules/user/utils/otp-generator.ts)

**Basis data**
- Seluruh 11 berkas di [database/migrations/](database/migrations/)

---

## 9. Daftar Berkas yang Harus Di-refactor Total

Diurutkan berdasarkan urgensi. "Refactor total" berarti struktur berkasnya sendiri yang
salah, bukan sekadar satu baris yang perlu ditambal.

### Prioritas 1 — memblokir rilis

**1. [lib/utils/idx-trading-board.ts](lib/utils/idx-trading-board.ts)** *(seluruh berkas)*
Tiga himpunan ticker yang ditulis tangan harus hilang seluruhnya. Berkas ini seharusnya
berupa fungsi tipis di atas kolom `listing_board` dari `all.csv`, dengan default
mengembalikan `null` — bukan `DEVELOPMENT`. Selama himpunan ini ada, tidak ada yang
menjamin ia tetap benar setelah pengumuman IDX berikutnya, dan riwayat berkas ini
menunjukkan ia memang sudah tidak benar sekarang.

**2. [modules/fundamental/service/dcf-valuation.service.ts](modules/fundamental/service/dcf-valuation.service.ts)** *(fungsi `calculateDcfModel`, baris 418-659)*
Kerangka arus kasnya harus diputuskan secara eksplisit (FCFE atau FCFF) lalu diterapkan
konsisten pada pilihan diskonto, penamaan variabel, dan perlakuan utang bersih. Saat ini
ketiganya saling bertentangan, dan kode menyamakan `wacc_pct` dengan `cost_of_equity_pct`
sebagai bukti kebingungan itu. Berkas ini juga memuat **dua** model nilai wajar berbasis
FCF yang berbeda (`calculateIntrinsicValue` dan `calculateDcfModel`) yang perlu didamaikan.

**3. [lib/utils/seasonality.ts](lib/utils/seasonality.ts)** *(seluruh berkas)*
Tiga cacat pada satu fungsi: basis harga yang salah (`H-03`), zona waktu server (`M-06`),
dan kontinuitas bulan yang tidak diperiksa meski komentarnya mengklaim sebaliknya
(`M-05`). Tulis ulang dengan `priceBasis` sebagai parameter wajib, tanggal zona Jakarta
lewat `Intl.DateTimeFormat`, dan pemeriksaan bulan bersebelahan yang sesungguhnya.

### Prioritas 2 — rilis berikutnya

**4. [components/export/FundamentalMoatEarningsExportCard3D.tsx](components/export/FundamentalMoatEarningsExportCard3D.tsx)** *(baris 155-175, blok metrik)*
Blok metrik memanggil formatter secara ad-hoc dan satu di antaranya salah 100x. Ganti
menjadi tabel deklaratif `{ field, formatter }` yang formatternya dipilih dari peta satuan
tunggal, sehingga tidak mungkin lagi memasangkan field persen dengan `fmtKali`.

**5. [modules/fundamental/service/analyzers/](modules/fundamental/service/analyzers/)** *(15 berkas, sebagai satu kelompok)*
Analyzer berbagi bentuk yang sama (`{label, value, decision, confidence}`) tetapi
masing-masing mengarang skala `confidence`-nya sendiri dari besaran metrik, menuliskan
asumsi satuannya sendiri, dan menamai labelnya sendiri. Satukan menjadi satu helper
bersama yang menerima ambang + satuan, agar kesalahan satuan `der-analyzer` dan salah
label `eps-growth-analyzer` tidak bisa terulang per berkas.

**6. [app/dashboard/page.tsx](app/dashboard/page.tsx)** *(baris 67-140, helper perhitungan)*
Komponen klien 1300+ baris yang menghitung indikatornya sendiri. Pindahkan `smaOf`,
`pctChange`, `volatility20D`, dan `buildIndexPayload` ke jalur server, sajikan hasilnya
lewat API yang sudah ada, dan biarkan halaman ini hanya merender.

### Prioritas 3 — utang teknis terjadwal

**7. [lib/chart-indicators.ts](lib/chart-indicators.ts)** — buat fungsi deretnya memanggil
primitif baku di `modules/technical/service/` agar salinan indikator berhenti bertambah.

**8. [all.csv](all.csv) + [shared/market/emiten-list.ts](shared/market/emiten-list.ts)** —
tambahkan metadata kesegaran, daftarkan ke penjaga CI `MANUAL_MARKET_REFERENCE_REVIEWS`,
dan sediakan cron pembaruan bulanan.

---

## 10. Catatan Penutup

Basis kode ini tidak memiliki masalah dummy data. Yang dimilikinya adalah masalah
**data statis yang membusuk**, dan itu lebih sulit dilihat karena setiap nilainya pernah
benar. Tiga himpunan ticker di `idx-trading-board.ts` hampir pasti akurat pada hari
ditulis. Yang tidak ada adalah mekanisme yang membuatnya salah **secara berisik** ketika
IDX menerbitkan pengumuman berikutnya.

Proyek ini sudah menemukan pola pertahanannya sendiri: `MANUAL_MARKET_REFERENCE_REVIEWS`
dengan `reviewBy` yang diperiksa CI, `CURRENT_LQ45_EFFECTIVE_TO` dengan uji yang menolak
daftar kedaluwarsa, `auditStatus: 'UNVERIFIED'` yang memblokir ingestion, dan
`MACRO_ASSUMPTION_SET_ON` yang mengungkap umur asumsi. Pola-pola itu bagus. Yang kurang
adalah penerapannya yang menyeluruh — `all.csv` dan `idx-trading-board.ts` adalah dua
daftar referensi manual terbesar di aplikasi ini, dan keduanya justru berada di luar
penjagaan itu.

Perbaikan yang paling bernilai bukan menambal ketiga himpunan ticker, melainkan
menjadikannya turunan dari sumber yang sudah ada di repositori, lalu memasukkan sumber
itu ke dalam penjaga kesegaran yang sudah proyek ini bangun.

---

*Audit dilakukan tanpa mengubah satu baris kode pun. Tidak ada perbaikan otomatis yang
diterapkan, sesuai ketentuan audit.*
