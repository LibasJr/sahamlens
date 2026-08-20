# Laporan: Total Visual Redesign V3 — "Calm Intelligence"

**Tanggal:** 20 Agustus 2026
**PRD:** `SAHAMLENS_PRD_TOTAL_VISUAL_REDESIGN_V3.md`
**Spec:** `docs/superpowers/specs/2026-08-20-visual-redesign-v3-design.md`
**Branch integrasi:** `redesign/v3` → PR final ke `main`
**Gerbang akhir:** `npm run verify:prod` EXIT=0, `npm run test:responsive` EXIT=0

---

## A. Ringkasan perubahan visual

V3 bukan pekerjaan token — `globals.css` V2 sudah membawa skala tipografi semantik yang
lengkap. Yang tertinggal adalah **komposisi**: aplikasi menyusun dirinya sebagai papan
kartu berbobot setara, dan tiap permukaan diam-diam menumbuhkan skala tipe tandingannya
sendiri.

| Ukuran | Sebelum | Sesudah |
|---|---|---|
| Ukuran font arbitrer di permukaan riset | 98 | **0** |
| Warna hex mati di shell + Watchlist | 9 | **0** |
| `<Card>` di beranda | 10 | **4** |
| `<Card>` di halaman emiten | 8 | **5** |
| `<Card>` di Technical + Flow | 18 | **9** |
| Gradien permukaan dekoratif | 2 | **0** |
| Glow (`shadow-[0_0_Npx_rgba(...)]`) | 3 | **0** |
| Test | 2231 | **2281** |
| Test harness responsif | 5 | **14** |

**45 berkas berubah, 3.759 baris masuk, 385 keluar.**

---

## B. Sebelum → sesudah, per permukaan

**App shell.** Sidebar memakai `lens-eyebrow` untuk label grup alih-alih
`text-[10.5px]/tracking-[0.16em]` rakitan tangan; tiga hex mati jadi token, sehingga shell
ikut berganti saat tema berubah alih-alih mengabaikannya. Bayangan 18px/60px dilepas. Top
bar: blok IHSG dan status pasar tadinya dua pill ber-border sehingga bar terbaca sebagai
dua kartu kecil mengambang di kartu ketiga; keduanya kehilangan bingkai dan menjadi satu
baseline.

**Beranda.** Kondisi Pasar, Peluang Hari Ini, Agenda, dan Saham Dipantau berhenti menjadi
kartu — mereka bagian halaman, bukan objek. Market snapshot pindah ke `MetricBand`.

**Halaman emiten.** Halaman ini sudah menumbuhkan salinan primitifnya sendiri: `ARAH_PENANDA`,
peta lokal berisi panah, warna arah, dan frasa `sr-only` — duplikat aturan `InsightRow`.
Dihapus. Baris kepercayaan (keselarasan, coverage, kesegaran) berhenti menjadi tiga sel
bergaris yang memberi konteks bobot setara dengan skor yang dijelaskannya, dan menjadi satu
`StatusMeta`.

**Technical & Flow.** Dua kelompok angka yang sama-sama dikotakkan, dengan jawaban
berlawanan. Ringkasan arus dana asing hanya berarti dibaca bersama → satu `MetricBand`.
Deret pivot diseragamkan tetapi **tidak** dipindah ke primitif itu: merah/hijau di sana
konvensi resistance/support, bukan penilaian, dan tone `positive`/`negative` akan mengubah
artinya.

**Screener & Watchlist.** 52 ukuran arbitrer dan 5 hex. Hex-nya mewarnai badge sinyal
Watchlist lewat `style` inline — jadi badge itu tidak ikut mode terang. Sel tabel Screener
naik ke `lens-chip`, bukan `lens-meta`: keduanya 12px, tetapi `line-height: 1` menjaga
tinggi baris tetap ringkas.

**LensAI.** Jawaban asisten berhenti menjadi gelembung percakapan berekor dan mengalir
sebagai teks dengan `max-w-prose`. Giliran pengguna tetap gelembung — itu menandai siapa
yang bicara.

---

## C. Integritas backend

**Tidak ada perubahan** pada: API, skema basis data, migrasi, autentikasi, entitlement,
scoring, skema analitik, backend LensAI, rate limit, maupun cron.

Ini bukan pernyataan berdasarkan ingatan. `scripts/audit-frontend-only.mjs` dibangun di
fase 1 dan **gagal** kalau sebuah PR menyentuh `app/api/**`, repository/service modul,
migrasi, `shared/auth/**`, atau `shared/http/**`. Ia berjalan sebagai job CI wajib pada
setiap PR bertarget `redesign/**` dan hijau di kesembilannya.

Perubahan panel Flow ke data resmi BEI **memang** menyentuh backend — dan justru karena itu
ia dikeluarkan dari V3 dan mendarat lewat PR terpisah ke `main` (#82). Gerbangnya bekerja
persis seperti yang dimaksudkan: memaksa percakapan, bukan membiarkan perubahan diam-diam.

---

## D. Dampak jaringan

**Nol request baru.** Tidak ada endpoint yang ditambah, tidak ada pemanggilan ganda, dan
`shared/http/shared-market-request.ts` tidak disentuh.

Bundle: 5.841 KB → **5.810 KB**.

---

## E. Berkas yang berubah

- **Primitif baru:** `SectionHeader`, `MetricBand`, `InsightRow`, `StatusMeta`, `ResearchTabs`
- **Shell:** `Sidebar`, `TopMarketBar`, `MarketTicker`
- **Beranda:** `HomeWorkspace`, `HomeTodayBrief`, `HomeCalendarWatchlist`, `MarketPulseVisuals`
- **Riset:** `app/technical/[symbol]/page.tsx`, `TechnicalAnalysisSuite`, `BandarFlowPro`
- **Alat:** `ScreenerResults`, `app/watchlist/page.tsx`, `TickerAnalysisShell`
- **LensAI:** `AIChat`
- **Infrastruktur:** `scripts/audit-frontend-only.mjs`, `ci.yml`, `app/_workbench`, `e2e/`

---

## F. Hasil test

| Pemeriksaan | Hasil |
|---|---|
| `npm run verify:prod` | **EXIT=0** |
| Berkas test / test | 256 / **2281** lulus |
| lint | 0 error |
| build | sukses |
| `audit:bundle` | PASS |
| `audit:adoption` | PASS — nol kemunduran |
| `audit:a11y` | PASS |
| `npm run test:responsive` | **EXIT=0**, 14 test |
| `audit:frontend-only` | PASS di 9 PR |

---

## G. Utang visual yang tersisa

1. **`app/admin/**` masih memuat ukuran font arbitrer.** Admin bukan permukaan riset dan
   berada di luar lingkup PRD. Dikerjakan terpisah kalau memang diinginkan.
2. **Workbench memakai data contoh.** Ia mengukur komposisi dan aturan CSS, bukan halaman
   utuh berisi data pasar sungguhan.
3. **Sebagian besar permukaan tidak bisa dipotret** karena butuh sesi, database, dan data
   hulu. Bukti fase-fase itu bertumpu pada gerbang, bukan gambar — dan itu dinyatakan apa
   adanya di tiap PR, bukan disamarkan.

---

## H. Daftar QA manual — belum dijalankan, milik manusia

Tidak satu pun gerbang boleh menandai bagian ini selesai.

- [ ] `/` di 375, 768, 1440 — hierarki editorial, snapshot 2x2 di ponsel
- [ ] `/` sebagai tamu, login, dan Pro — tiga jalur `emptyHint` yang berbeda
- [ ] `/technical/BBCA.JK` sebagai tamu, login, Pro
- [ ] `/technical/IHSG` — navigasi sudut pandang TIDAK muncul
- [ ] Tautan "Flow" mendarat tepat di judul, tidak tertutup header sticky
- [ ] Fundamental BBCA dan BBRI (jalur bank berbeda)
- [ ] Emiten dengan artefak BEI vs tanpa artefak — yang kedua harus menyatakan "belum tersedia", bukan panel kosong
- [ ] Screener di 768 (tabel penuh + kolom sticky) dan 430 (kartu)
- [ ] Watchlist di 375 (harga + kesegaran terlihat) dan **mode terang** (badge sinyal)
- [ ] LensAI: jawaban tetap **mengalir bertahap**, bukan muncul sekaligus
- [ ] LensAI: paksa satu galat, pastikan referensi dukungan bisa disalin
- [ ] Tema gelap dan terang
- [ ] Reduced motion: ticker menjadi daftar statis
- [ ] Sidebar ciut — tooltip muncul dan terbaca
