# Desain: Total Visual Redesign V3 — "Calm Intelligence"

**Tanggal:** 20 Agustus 2026
**Basis repo:** `main` @ `53668c8`
**PRD sumber:** `SAHAMLENS_PRD_TOTAL_VISUAL_REDESIGN_V3.md`
**Sifat:** redesign visual frontend menyeluruh. **Backend dibekukan.**

---

## 1. Masalah

Redesign V2 sudah menaikkan hierarki, konsistensi, aturan responsif, dedupe request,
semantik navigasi, dan kesegaran data. Yang belum terjadi: perubahannya tidak cukup besar
untuk terbaca sebagai redesign. Screenshot sebelum dan sesudah V2 masih terlihat seperti
aplikasi yang sama dengan penyesuaian kecil.

Audit baseline (20 Agustus 2026) menunjukkan kenapa:

- **Token sudah matang.** `app/globals.css` (1461 baris) sudah memuat peran tipografi
  semantik lengkap: `lens-hero-title`, `lens-page-title`, `lens-section-title`, `lens-body`,
  `lens-meta`, `lens-label`, `lens-metric`, `lens-metric-lg`, `lens-chip`. Skala radius dan
  spacing sudah monotonik.
- **Komposisinya yang tertinggal.** `components/HomeWorkspace.tsx` (658 baris) menyusun
  beranda sebagai deretan `<Card>` berbobot setara — persis "equal-weight dashboard grid"
  yang PRD §8 larang.
- **Primitif komposisi belum ada.** `components/ui/` memuat 23 berkas (Card, MetricCard,
  Table, Skeleton, PageContainer, Badge, SegmentedControl, ...) tetapi tidak satu pun yang
  menyusun *bagian halaman*: tidak ada header seksi, band metrik, baris insight, tab riset,
  maupun baris status.

Jadi V3 bukan pekerjaan token. **V3 adalah pekerjaan komposisi.**

---

## 2. Tujuan

Frontend yang terbaca sebagai satu produk riset yang tenang, editorial, dan padat tanpa
sesak — dengan perbedaan yang terlihat dari screenshot tanpa penjelasan.

Prinsip yang mengatur setiap keputusan:

> **Answer first. Evidence second. Detail third.**
> **Hierarki visual harus jelas sebelum teksnya dibaca.**

## 3. Bukan tujuan

Tidak menyentuh: kontrak API, skema basis data, migrasi, autentikasi, entitlement, batas
tamu, rate limit, logika LensScore, perhitungan finansial, semantik pasar, perilaku request
ID, provenance/kesegaran, skema analitik, prompt/streaming/verifikasi LensAI, cron, maupun
topologi deploy.

Kalau sebuah ide visual menuntut backend: **ubah idenya, bukan backend-nya.**

---

## 4. Strategi integrasi

Semua fase masuk ke branch integrasi `redesign/v3`, satu PR per fase. Satu PR final
memindahkannya ke `main`.

**Alasannya bukan kerapian review, melainkan produksi.** Deploy di repo ini berjalan
otomatis dari merge ke `main` (`deploy-vps.yml`, menunggu CI hijau). Kalau tiap fase
mendarat di `main`, pengguna sungguhan menghabiskan beberapa hari dengan shell V3 di atas
beranda V2 — campuran yang tidak pernah dirancang siapa pun.

`deploy-vps.yml` tidak perlu diubah: ia hanya bereaksi pada `head_branch == 'main'`, jadi
produksi tetap V2 sampai merge terakhir.

**`ci.yml` WAJIB diubah** supaya ikut terpicu pada `redesign/**`. Tanpa itu setiap PR fase
berdiri dengan **nol check** — dan nol check terbaca persis seperti hijau di daftar PR
(jebakan yang terukur 20 Agustus 2026, PR #70; sudah dicatat di `DEPLOYMENT.md`).

---

## 5. Sistem primitif

Dibangun lebih dulu, sebelum satu permukaan pun disusun ulang. Konsistensi datang dari
konstruksinya, bukan dari disiplin sembilan PR berturut-turut.

| Primitif | Peran | Alasan |
|---|---|---|
| `SectionHeader` | eyebrow + judul + lede | Pola ini sudah disalin tangan di halaman technical, blok Flow, dan Hari Ini. Ekstraksi menghapus tiga salinan yang bisa menyimpang. |
| `MetricBand` | deret metrik sebaris, tanpa kartu | PRD §13 minta band, bukan empat kartu. `MetricCard` yang ada adalah *kartu* — bentuk berbeda, bukan duplikat. |
| `InsightRow` | panah arah + judul + penjelasan | Bentuk "Yang penting dari [ticker]" (§17), kini dirakit tangan di halaman technical. |
| `ResearchTabs` | navigasi antar bagian riset | Digeneralisasi dari `StockPerspectiveNav`, mempertahankan lantai sentuh 44px-nya di SEMUA lebar. |
| `StatusMeta` | freshness · coverage · provenance | Merender keluaran `describeFreshness` yang sudah ada. Tanpa logika baru — ia presentasi murni. |

### Dua penyimpangan sadar dari daftar PRD Phase 1

**`Surface` tidak dibuat.** `Card` sudah menjadi primitif permukaan yang lengkap: `variant`
(default/glass/flat), `surface` (8 tingkat opasitas), `padding`, `radius`, `elevation`,
`highlight`. Menambah `Surface` di sebelahnya berarti dua primitif untuk satu pekerjaan, dan
orang berikutnya harus menebak mana yang benar. Kalau V3 membutuhkan permukaan "band" yang
lebih tenang, itu menjadi varian `Card`.

**`Divider` ditunda sampai terbukti berulang.** `<div className="border-t border-tv-border" />`
tidak membutuhkan komponen. Kalau ia muncul dengan spacing yang sama di banyak tempat, baru
diangkat. YAGNI.

### Batas terhadap `SegmentedControl`

Keduanya tampak mirip dan akan tertukar kecuali batasnya dinyatakan:

- **`ResearchTabs`** berpindah antar **bagian konten** (Technical / Fundamental / Flow / Valuation).
- **`SegmentedControl`** mengubah **cara data yang sama ditampilkan** (mis. periode chart).

Catatan terukur: `SegmentedControl` memakai `min-h-9` (36px), di bawah lantai sentuh 44px. Ia
selamat hanya karena aturan global menaikkannya ke 40px di rentang tablet.

---

## 6. Visual workbench

Rute `/_workbench` merender tiap primitif dan tiap komposisi V3 dengan data contoh.
Playwright memotretnya di 375 / 768 / 1440.

**Ia tidak boleh bisa dibuka pengguna.** Mekanismenya eksplisit, bukan sekadar niat:
halaman memanggil `notFound()` saat `process.env.NODE_ENV === 'production'`, dan rutenya
dikecualikan dari `sitemap.xml` serta ditandai `robots: noindex`. Dijaga test yang gagal
kalau salah satu dari ketiganya hilang — rute internal yang diam-diam terbuka di produksi
adalah cara paling lazim permukaan debug bocor.

Alasannya bukan demo. Dua hal yang tidak bisa dicapai tanpa ini:

1. **Umpan balik visual bagi agen yang mengerjakan.** Aplikasi ini tidak bisa dijalankan
   tanpa Postgres, Redis, dan data pasar hulu; tanpa workbench, seluruh V3 ditulis sambil
   menebak hasilnya. Menyalin `.env.production` **bukan** jalan keluar: berkas itu memuat
   `DATABASE_URL` produksi, `ADMIN_SECRET_KEY`, dan `CRON_SECRET`, dan sebagian skrip repo
   ini menghapus baris.
2. **Melihat primitif berdampingan.** Itulah satu-satunya cara ketidakkonsistenan spacing dan
   tipografi terlihat *sebelum* tersebar ke sepuluh halaman.

Mesinnya menumpang harness responsif yang sudah ada (`e2e/support/stylesheet.ts`): stylesheet
produksi asli yang dikompilasi Tailwind, Chromium sungguhan, nol kredensial.

**Batas yang jujur:** workbench memakai data contoh. Halaman utuh dengan data pasar sungguhan
tetap membutuhkan mata manusia — daftar QA manual di §10.

---

## 7. Fase dan PR

| PR | Fase | Berkas utama |
|---|---|---|
| 1 | Primitif + workbench + trigger CI + `audit:frontend-only` | `components/ui/*` (5 baru), `app/_workbench`, `e2e/`, `ci.yml`, `scripts/` |
| 2 | Shell | `Sidebar` (612), `TopMarketBar` (148), `MarketTicker` (145), `PageContainer` |
| 3 | Homepage | `HomeWorkspace` (658), `HomeBrandHero`, `HomeTodayBrief`, `MarketPulseVisuals`, `HomeCalendarWatchlist` |
| 4 | Stock detail | `app/technical/[symbol]/page.tsx`, `ClientHeader` |
| 5a | Technical / Fundamental / Flow | `TechnicalAnalysisSuite`, `app/fundamental`, `BandarFlowPro` |
| 5b | Screener / Watchlist / Valuation | `ScreenerResults`, `app/watchlist`, `TickerAnalysisShell` |
| 6 | LensAI | `AIChat` |
| 7 | Responsive + aksesibilitas | lintas permukaan, `globals.css` |
| 8 | Verifikasi + catatan penutup | dokumen |
| → | **PR final ke `main`** | seluruh V3 |

Fase 5 dipecah karena satu PR yang menyentuh enam permukaan riset tidak bisa direview dengan
jujur.

**Urutan mengikuti PRD, bukan §12.** PRD menyebut Stock Detail "highest priority" tetapi
menempatkannya di Phase 4, setelah shell dan homepage. Itu benar: shell dan homepage yang
menetapkan bahasa visualnya, dan stock detail memakainya. "Prioritas tertinggi" berarti paling
menentukan hasil, bukan harus dikerjakan pertama.

---

## 8. Kebijakan test

Gerbang yang **akan** terpicu oleh V3 — dan itu memang gunanya:

| Gerbang | Kapan terpicu |
|---|---|
| `e2e/responsive-contract.spec.ts` | Setiap kali kelas tata letak berubah. Ia **mengambil kelas dari sumber komponen**, jadi begitu kelasnya pindah ia melempar, bukan lulus diam-diam. Tiap fase yang mengubah kelas wajib ikut memperbaruinya. |
| `__tests__/watchlist-mobile-visibility.test.ts` | PR 5b |
| `__tests__/tablet-touch-targets.test.ts` | PR 5b dan 7 (`ScreenerResults`, `globals.css`) |
| `components/__tests__/sidebar-navigation.test.ts` | PR 2 |
| `components/__tests__/stock-perspective-nav.test.ts` | PR 1 dan 4 |
| `shared/analytics/__tests__/journey-instrumentation.test.ts` | Setiap komponen berinstrumentasi yang dipindah. Inilah yang menegakkan PRD §20. |

**Aturan saat sebuah test merah:** tentukan dulu apakah **perilaku** yang mundur atau hanya
**markup** yang pindah.

- Perilaku mundur → perbaiki kode produksi.
- Markup pindah → pindahkan asersinya ke batas presentasi yang baru, **menjaga invarian yang
  sama**.

Tidak pernah melemahkan. Tidak pernah menghapus. Yang tidak boleh disentuh sama sekali: test
keamanan, rate limit, tamu, integritas finansial, request ID, kontrak Screener responsif,
streaming, dan provenance/kesegaran.

---

## 9. Guardrail

### `audit:frontend-only` (baru)

Membandingkan berkas berubah terhadap `main` dan **gagal** kalau menyentuh `app/api/**`,
`modules/**/repository/**`, `modules/**/service/**`, `database/migrations/**`,
`shared/auth/**`, atau `shared/http/**`. Dijalankan di CI untuk PR bertarget `redesign/**`.

Sembilan PR lintas beberapa hari: larangan yang hanya hidup di dokumen akan dilanggar tanpa
ada yang menyadarinya. Gerbang ini mengubahnya menjadi sesuatu yang tidak bisa dilanggar
diam-diam — dan kalau suatu saat memang ada alasan sah, ia memaksa percakapan alih-alih diam.

### Guardrail yang sudah ada, tidak perlu ditambah

`audit:bundle`, `audit:performance`, `audit:adoption`, `audit:a11y`, `audit:ui`, dan test
dedupe request pasar (`shared/http/__tests__/shared-market-request.test.ts`).

Catatan tentang `audit:adoption`: ratchet melarang **kartu yang dirakit tangan**, bukan
melarang pengurangan `<Card>`. Menurunkan densitas kartu dengan mengganti `<Card>` menjadi
whitespace, divider, atau band **tidak** melanggarnya — mengganti `<Card>` dengan `<div>`
ber-border-dan-radius sendiri yang melanggarnya.

---

## 10. Selesai berarti

Selain seluruh kotak centang PRD §29:

- `npm run verify:prod` EXIT=0 dan `npm run test:responsive` EXIT=0 pada PR final;
- `audit:frontend-only` hijau di setiap PR fase — bukti backend benar-benar tidak tersentuh;
- screenshot workbench diperiksa pada tiap fase;
- QA manual oleh manusia pada halaman sungguhan: `/`, `/technical/BBCA.JK`, `/technical/IHSG`,
  Fundamental BBCA dan BBRI, Flow, LensRadar, Screener, Watchlist, LensAI, pada 375 / 430 /
  768 / 1024 / 1440, tema gelap dan terang, reduced motion, serta peran tamu / login / Pro.

**Batas yang tidak boleh disamarkan:** workbench dan harness mengukur komposisi dan aturan
CSS, bukan halaman utuh berisi data pasar sungguhan. Poin QA manual tetap milik manusia, dan
tidak boleh ditandai selesai oleh gerbang mana pun.

---

## 11. Risiko

| Risiko | Penanganan |
|---|---|
| Sembilan PR menumpuk, `redesign/v3` menjauh dari `main` | Tarik `main` ke `redesign/v3` di tiap awal fase. Konflik yang ditemukan lebih awal jauh lebih murah. |
| Redesign berhenti sebagai restyle | Workbench + kriteria PRD §4. Kalau sebuah fase tidak mengubah komposisi, ia belum selesai. |
| Instrumentasi analitik hilang saat komponen dipindah | `journey-instrumentation.test.ts` gagal kalau sebuah event kehilangan pemanggilnya. |
| Test yang terikat markup dilemahkan agar cepat hijau | §8 memisahkan "perilaku mundur" dari "markup pindah"; daftar test yang haram disentuh eksplisit. |
| Request bertambah tanpa disadari | `audit:performance` + test dedupe request pasar. Sebelum menambah fetch: periksa apakah datanya sudah ada di payload. |
