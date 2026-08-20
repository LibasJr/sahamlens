# Laporan: Penutupan Utang Redesign V2 "Calm Intelligence"

**Tanggal:** 20 Agustus 2026
**Basis:** `docs/design/CALM_INTELLIGENCE.md` + `docs/notes/REDESIGN_V2_CALM_INTELLIGENCE_NOTES_2026-08-20.txt`
**Hasil akhir di `main`:** `05db1f6` — `npm run verify:prod` EXIT=0, `npm run test:responsive` EXIT=0
**Produksi:** ter-deploy otomatis (Deploy VPS run `32324892981`), `sahamlens.id` balas 200, `/api/health` `status:ok`

---

## 1. Ringkasan

Catatan redesign v2 meninggalkan enam utang. Dua di antaranya (#2 request-id, #4 struktur
jawaban LensAI) sudah ditutup sebelum sesi ini. **Empat sisanya ditutup di sesi ini**, plus
satu commit dokumentasi.

| # | Utang | PR | Merge commit |
|---|---|---|---|
| 3 | Cap kesegaran Watchlist hanya tampil di `sm` ke atas | [#67](https://github.com/LibasJr/sahamlens/pull/67) | `02efe6d` |
| 6 | Verifikasi responsif bersifat statis | [#70](https://github.com/LibasJr/sahamlens/pull/70) | `f082b05` |
| 5 | `/dashboard` menampilkan nav tanpa tab aktif | [#68](https://github.com/LibasJr/sahamlens/pull/68) | `d450930` |
| 1 | Analytics PRD SEC.40 tidak terukur | [#69](https://github.com/LibasJr/sahamlens/pull/69) | `1a75b35` |
| — | Catatan penutupan | [#71](https://github.com/LibasJr/sahamlens/pull/71) | `05db1f6` |

Utang #6 ditutup **sebagian**, dengan sengaja. Alasannya di bagian 3.

---

## 2. Apa yang dikerjakan

### Utang 3 — Watchlist di lebar ponsel

Catatan aslinya menyebut "cap kesegaran hanya tampil di `sm` ke atas — tata letak bawaan,
bukan regresi". Benar soal mekanismenya, **meremehkan akibatnya**: seluruh kolom kanan
memakai `hidden sm:flex`, jadi yang hilang di bawah 640px bukan cap kesegaran saja
melainkan **harga terkini**. Yang tersisa di layar ponsel adalah persentase P&L — angka
turunan tanpa angka asalnya — di permukaan yang justru paling sering dibuka dari ponsel di
sela jam bursa (PRD §24).

Harga dan cap kini ikut dirender di kolom kiri pada lebar itu: menambah tinggi, bukan
kolom, supaya nama emiten tidak terjepit di 375px. Cap tetap lewat `describeFreshness`,
jadi STALE tetap amber — tidak turun jadi teks polos.

**Gerbang:** `__tests__/watchlist-mobile-visibility.test.ts` menghitung kemunculan harga dan
cap **di luar** setiap elemen yang tersembunyi di bawah `sm`. Elemen itu dicari lewat
penghitungan tag, bukan pencocokan daftar kelas persis — kelas tata letak berubah wajar,
invariannya tidak. Komentar dibuang dulu (CLAUDE.md §2) dan ada penjaga jumlah supaya
pemindainya tidak bisa lulus dengan memeriksa nol elemen.

### Utang 5 — Tab aktif `/dashboard`

`/dashboard` merender navigasi sudut pandang tanpa satu pun tab menyala. Empat tab mati
sekaligus terbaca sebagai navigasi rusak — apalagi sidebar menamai halaman itu
**"LensTechnical"**, persis nama tab pertamanya.

Keberatan di catatan asli ("menyalakannya akan menandai tab aktif yang justru membawa ke
halaman lain") tetap sah, jadi yang diubah bukan cuma keadaan tabnya: **tab aktif selalu
menunjuk ke halaman tempat pengguna berdiri**. Di `/dashboard` ia menunjuk ke
`/dashboard?symbol=...` — bentuk yang memang sudah diterima halaman itu dari Portfolio.

Karena tab Technical berhenti menjadi jalan keluar, jalur ke halaman analisis emiten
dinamai apa adanya: kartu di `DashboardFooterActions` sebelah DCF Valuation, hanya muncul
kalau `stockCodeFor` menyatakan itu emiten (indeks tidak punya halaman itu).

`/moat`, `/earnings`, `/dividend`, `/pattern` memakai shell yang sama dan **sengaja** tetap
tanpa tab menyala — mereka Tools, bukan sudut pandang.

**Gerbang:** pemilihan tab dan href dipindah ke fungsi murni
`perspectiveTabsFor(symbol, pathname)`, sehingga aturan "tab aktif tidak pernah memindahkan
pengguna" benar-benar diuji, bukan di-grep di dalam JSX. 30 test di berkas itu.

### Utang 1 — Analytics PRD SEC.40

Bagian "Beta evaluation" PRD menanyakan hal perilaku: waktu sampai tindakan berguna
pertama, konversi pencarian ke analisis, click-through LensRadar, berapa yang menembus dari
ringkasan ke bukti, pemakaian Watchlist berulang, pertanyaan LensAI berkonteks emiten.
**Tidak satu pun terukur.**

`product_funnel_events` tidak bisa menjawabnya, dan itu memang desainnya — `CHECK` pada
`event_type` plus `UNIQUE (visitor_id, event_type, feature, event_date)` ada karena ia
funnel sekali-per-hari. Semua pertanyaan di atas menghitung **urutan di dalam satu sesi**;
dideduplikasi per hari, angkanya tidak berarti apa-apa.

Karena itu `product_journey_events` berdiri sendiri (migrasi `010`): visitor, sesi, nama
event, permukaan, dan jarak milidetik dari awal sesi. Tanpa `user_id`, tanpa ticker, tanpa
URL.

Dua keputusan yang layak diketahui:

- **Elapsed diukur di klien, bukan dari `created_at`.** Event dikirim berkelompok dengan
  `keepalive` dan bisa tiba jauh setelah kliknya; jam server mengukur waktu tiba, bukan
  waktu perilaku.
- **DDL sengaja tanpa `CHECK` pada `event_name`.** Mengunci daftar event beta di DDL
  produksi berarti setiap event baru menuntut migrasi — cara paling pasti agar
  pengukurannya ditinggalkan. Penjaga kardinalitasnya adalah allowlist tertutup di
  controller, satu-satunya jalan tulis, dan ia **menolak seluruh kiriman alih-alih
  menyaring**: event yang dibuang diam-diam meninggalkan lubang di dalam sesi, dan metrik
  urutan paling rusak justru oleh lubang yang tidak terlihat.

Terinstrumentasi: analisis emiten dibuka, bukti benar-benar terlihat (IntersectionObserver,
bukan saat halaman dimuat — buktinya di bawah lipatan), pencarian dikirim, kandidat
LensRadar dibuka, Watchlist dibuka, pertanyaan LensAI dengan dan tanpa konteks emiten,
referensi dukungan yang sampai ke layar.

Panel admin **"Perjalanan riset (beta)"** membedakan `0%` dari "belum ada data" — dua temuan
yang berbeda — dan menampilkan penyebut tiap rasio, karena "75% dari 4 sesi" bukan temuan.
Retensi 90 hari ikut `scripts/cleanup-privacy-retention.mjs`.

**Gerbang:** `shared/analytics/__tests__/journey-instrumentation.test.ts` gagal kalau sebuah
event terdefinisi tapi tidak punya pemanggil di kode produksi — metrik yang tidak pernah
dikirim terbaca "belum ada data" selamanya dan tidak ada test lain yang menyadarinya.

### Utang 6 — Harness pengukuran responsif

Pemindai sumber yang ada menjawab "apakah aturannya tertulis". Yang belum pernah dijawab:
"apakah aturan itu menghasilkan yang dimaksud". `min-h-11` bisa tertulis dan tetap kalah
oleh aturan lain; `hidden sm:flex` bisa tertulis sementara breakpoint `sm` digeser di
`tailwind.config.js`. Keduanya lolos pemindai tanpa cela.

`e2e/responsive-contract.spec.ts` mengompilasi stylesheet produksi dengan Tailwind
sungguhan, **mengambil kelasnya dari sumber komponen**, lalu mengukur hasilnya di Chromium
pada 375 / 430 / 768 / 1024 / 1440. Kelas diambil dari sumber, bukan disalin ke test, jadi
saat kelas tata letak berubah pengukurannya ikut berubah — dan saat kelasnya hilang, harness
**melempar**, bukan diam-diam lulus.

**Terbukti menggigit:** mengganti `min-h-11` menjadi `min-h-8` membuat harness melaporkan
`Expected >= 44, Received 32`. Perubahan itu langsung dikembalikan dan tidak ikut ter-commit.

---

## 3. Batas yang disengaja

**Utang 6 ditutup sebagian.** Harness mengukur **aturan CSS**, bukan komposisi halaman utuh.
Poin 6 pada daftar QA manual — tablet 768/1024 pada halaman sungguhan — **masih milik
manusia**. Menandainya tutup penuh adalah klaim yang lebih nyaman dan salah.

Harness sengaja **tidak menjalankan aplikasinya**. Menyalakan Next.js di CI menuntut
database, kredensial, dan penyedia data hulu; hasilnya test yang gagal karena jaringan lalu
diabaikan orang dalam sebulan.

Harness juga **di luar `verify:prod`** — melipat unduhan browser ke dalam gerbang lokal akan
membuat seluruh pemeriksaan yang tidak ada hubungannya bergantung pada Chromium. Ia jalan
sebagai job CI tersendiri dan lewat `npm run test:responsive`.

---

## 4. Bukti

Tiap PR lolos `verify:prod` sebelum dibuka, dan CI GitHub hijau sebelum di-merge. Yang
paling menentukan adalah pengukuran **setelah semuanya tergabung** — CI per-PR tidak pernah
menguji keempatnya bersamaan:

| Pemeriksaan di `main` (`05db1f6`) | Hasil |
|---|---|
| `npm run verify:prod` | **EXIT=0** |
| Berkas test / test | 240 / **2155** lulus |
| `lint` | 0 error (100 warning, sama dengan baseline) |
| `next build` | sukses |
| `audit:bundle` | PASS |
| `npm run test:responsive` | **EXIT=0**, 5 test |
| `git grep` penanda konflik | bersih |

Job `responsive` juga hijau di CI Linux pada PR #70 — jadi harness bukan sesuatu yang hanya
jalan di satu mesin.

Perjalanan test sepanjang sesi: 2045 (baseline catatan) → 2103 (#67/#68) → 2143 (#69) →
**2155** (`main` gabungan).

---

## 5. Temuan operasional

Hal-hal yang ditemukan saat mengerjakan, bukan bagian dari utang, tapi berdampak:

1. **PR dengan base bukan `main` tidak menjalankan CI sama sekali.** `ci.yml` terpicu
   `pull_request: branches: [main]`. PR #70 sempat berdiri dengan **nol check** dan status
   `mergeable=clean` — dan nol check terbaca persis seperti hijau di daftar PR. Mengubah
   base ke `main` **tidak** memicu CI (event `edited` tidak ada di trigger default); perlu
   perubahan SHA agar `synchronize` menyala.

2. **Deploy produksi berjalan otomatis dari merge ke `main`**, tanpa langkah manual, lewat
   `deploy-vps.yml` yang menunggu CI hijau. Ini berarti kode #69 sampai ke produksi
   **sebelum migrasi `010` dijalankan**.

3. **`.next/types` basi lintas branch** menyebabkan `typecheck` gagal dengan galat yang
   terbaca seperti bug kode (`Cannot find module '.../analytics/journey/route.js'`).
   Obatnya `rm -rf .next`. Ini kerabat dekat jebakan CLAUDE.md §1.

---

## 6. Yang belum dikerjakan

1. **QA manual belum dijalankan.** Daftar di bagian 7 catatan redesign masih kosong. Yang
   menyangkut perubahan ini: Watchlist di 375px, tab `/dashboard`, `/moat` tanpa tab
   menyala, dan jalur data analytics.

2. ~~`docs/operations/DEPLOYMENT.md` belum diperbarui.~~ **DITUTUP** — dokumen itu
   mewajibkan pembaruan untuk setiap perubahan yang berdampak ke build, dependency, atau
   operasional, dan sesi ini menambah devDependency (Playwright), job CI baru, migrasi DB
   baru, serta env var retensi baru. Awalnya terlewat; ditutup di PR dokumentasi bersama
   laporan ini, sekalian mendokumentasikan **seluruh** keluarga `PRIVACY_*_RETENTION_DAYS`
   yang ternyata belum pernah tercatat di sana — bukan cuma var baru dari sesi ini.

3. ~~`/admin` tidak punya penahan galat.~~ **DITUTUP** — `getResearchJourneySummary()` duduk
   di `Promise.all` tanpa penangkap, jadi satu panel opsional yang gagal menjatuhkan seluruh
   halaman, termasuk Payment Order dan panel operasional yang tidak ada hubungannya.
   Kerentanan ini sudah ada sebelumnya (panel funnel sama); panel baru yang membuatnya
   terpicu. Sekarang tiap panel dimuat lewat `loadPanel()` dan merender pesan kegagalannya
   sendiri, sehingga kosong-karena-gagal tidak pernah terbaca sebagai kosong-karena-belum-
   ada-data. Menulis gerbangnya menangkap satu kasus nyata: presence yang gagal akan tampil
   sebagai "0 user aktif sekarang".

4. **Verifikasi migrasi `010` di produksi belum dikonfirmasi tertulis.** Panel admin tampil,
   yang menyiratkan tabelnya ada, tapi keluaran `scripts/migrate-database.mjs` belum
   dicatat.

---

## 7. Catatan untuk yang mengerjakan berikutnya

- **Urutan yang benar untuk perubahan berskema adalah migrasi dulu, baru kode.** Di sesi ini
  urutannya terbalik, dan di antara keduanya `/admin` berada dalam keadaan rapuh.
- Jangan menandai utang "tutup" kalau yang tertutup sebagian. Utang 6 sengaja ditulis
  "DITUTUP SEBAGIAN" supaya orang berikutnya tidak menyangka tablet 768/1024 sudah teruji
  otomatis.
- Setiap gerbang pemindai yang ditambah di sesi ini punya penjaga jumlah. Kalau angkanya
  jatuh ke nol, **pemindainya yang rusak** — bukan berarti tidak ada masalah.

---

## 8. PR susulan setelah laporan ini ditulis

| PR | Isi |
|---|---|
| `fix/admin-panel-fault-isolation` | Isolasi galat panel `/admin` (poin 6.3) |
| `docs/deployment-notes-2026-08-20` | `DEPLOYMENT.md` + laporan ini masuk repo (poin 6.2) |

Yang masih terbuka dari bagian 6: **QA manual** (6.1) dan **konfirmasi tertulis keluaran
migrasi `010`** (6.4).
