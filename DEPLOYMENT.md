# SahamLens - Deployment Notes

Catatan ini buat siapa pun/AI apa pun (Gemini, Cursor, Claude, dst) yang lanjutin kerjaan deploy
atau pembaruan program di project ini. Dimulai setelah deploy pertama ke Vercel (2026-07-29);
**production pindah ke VPS sendiri pada 2026-08-12/13 dan sejak itu deploy-nya otomatis dari
GitHub Actions.**

## Baca ini dulu: 6 kalimat yang menentukan segalanya

1. **Production = VPS sendiri**, bukan Vercel. Domain `sahamlens.id`.
2. **Deploy = push ke `main`.** GitHub Actions (`.github/workflows/deploy-vps.yml`) jalan
   setelah CI hijau, SSH ke VPS, dan menjalankan skrip `deploy` di sana. Tidak ada
   `vercel --prod`, tidak ada langkah manual.
3. **Env var production ada di `/opt/sahamlens/app/.env.production` di VPS**, bukan di
   dashboard Vercel. Menambah env var di Vercel tidak berpengaruh apa pun ke pengguna.
4. **Cron dijalankan dari dua tempat**: 9 job lewat QStash, 3 job lewat systemd timer di VPS.
   `vercel.json` sengaja **tidak boleh** berisi blok `crons` lagi (alasannya di bawah).
5. **Vercel masih hidup sebagai standby** dan tetap ikut build tiap push - tapi tidak
   melayani pengguna dan tidak boleh menjalankan job terjadwal apa pun.
6. Kalau menemukan instruksi lama bernuansa "set env di Vercel / `npx vercel ls` / `vercel --prod`",
   itu **catatan historis**, bukan perintah yang berlaku.

## Aturan wajib saat ada perubahan

- **Setiap perubahan kode/config/dependency/job/deployment harus ikut memperbarui `DEPLOYMENT.md`
  bila berdampak ke cara build, deploy, env var, cron/QStash/systemd, smoke test, cache, gating
  akses, atau jebakan operasional.**
- Kalau perubahan murni UI/logic kecil dan tidak mengubah cara deploy, tetap tambahkan catatan
  singkat di bagian "Log perubahan deployment" kalau commit itu sudah dipush ke `main`.
- **Env var baru = dua langkah, dan langkah keduanya tidak otomatis.** Menambahkan nama var ke
  kode/`.env.example` TIDAK membuatnya ada di production. Var itu harus ditulis manual ke
  `/opt/sahamlens/app/.env.production` di VPS, lalu `sudo systemctl restart sahamlens`.
  Auto-deploy tidak pernah menyentuh file itu. Tulis var baru di dokumen ini supaya
  orang/agen berikutnya tahu apa yang harus dipasang di server.
- **Jadwal cron baru juga tidak otomatis.** Push kode route `/api/cron/*` hanya membuat
  endpoint-nya ada. Jadwalnya harus didaftarkan sendiri - ke QStash (curl) atau sebagai
  systemd timer di VPS - dan dicatat di `config/scheduled-jobs.json` (`npm run audit:cron`
  akan gagal kalau manifest drift).
- **Jangan mengembalikan blok `crons` ke `vercel.json`.** Lihat "Jebakan" di bawah.
- Jangan mengandalkan ingatan percakapan AI. Keputusan operasional yang penting harus tertulis
  di dokumen ini supaya agen berikutnya tidak mengulang jebakan lama.

## Status live

Diverifikasi langsung di server 2026-08-13.

| Komponen | Kenyataan di server |
| --- | --- |
| Domain | `sahamlens.id`, `www.sahamlens.id`, `vps.sahamlens.id` |
| Masuknya trafik | Cloudflare Tunnel `sahamlens-prod` (token di `/etc/cloudflared/token`), rute di Zero Trust -> Published application routes -> `http://localhost:80` |
| Web server | Nginx, `/etc/nginx/sites-available/sahamlens`, `proxy_pass http://127.0.0.1:3001` |
| Aplikasi | systemd `sahamlens.service` ("SahamLens Next.js Production"), `User=lens`, `WorkingDirectory=/opt/sahamlens/app`, `ExecStart=/usr/bin/npm start` (next start -p 3001) |
| Env var | `EnvironmentFile=/opt/sahamlens/app/.env.production` (+ 3 baris `Environment=` inline di unit) |
| Sumber kode | git checkout di `/opt/sahamlens/app`, branch `main`, remote `github.com/LibasJr/sahamlens` |
| Cache | Redis lokal di VPS (`REDIS_URL`), bukan Upstash Redis lagi (migrasi 2026-08-13, commit `69b93ce`) |
| Database | Postgres Neon - tetap eksternal, tidak ikut pindah ke VPS |
| Port masuk | tidak ada yang dibuka ke internet - cloudflared connect keluar |

**Vercel hari ini**: project `libas/trading` masih terhubung ke repo dan masih ikut build tiap
push ke `main`, jadi ia selalu berisi kode terbaru sebagai standby. Tapi ia **tidak melayani
trafik pengguna** (domain tidak menunjuk ke sana) dan **tidak boleh menjalankan cron**. URL
lama https://sahamlens.vercel.app hanya berguna untuk membandingkan build, bukan untuk smoke
test production.

## Log perubahan deployment

### 2026-08-14 - CATATAN PENTING: QStash sudah penuh, maksimal 10 job

Ditemukan saat mendaftarkan `/api/cron/news` (entri di bawah): **plan QStash yang
dipakai punya batas maksimal 10 Schedule**, dan sekarang PERSIS terisi 10/10:
`ai-pick-scan`, `backtest-precompute`, `breakout-scan`, `fundamental-snapshot`,
`macro`, `market-pulse`, `market-summary`, `news`, `recommendation-scan`,
`watchlist-alert`.

**Kalau butuh cron baru lagi ke depan, ADA DUA JALAN** (bukan cuma "upgrade plan"):
1. Lepas salah satu dari 10 Schedule QStash di atas untuk memberi ruang - hanya kalau
   job lama itu sudah tidak relevan.
2. **Pakai systemd timer di VPS**, seperti 3 job yang sudah begitu
   (`lens-bucket-backtest`, `lens-score-optimizer`, `broker-summary-scan`) - TIDAK ikut
   hitungan limit 10 QStash ini sama sekali, karena jalur penjadwalannya beda (timer OS
   di server, bukan layanan QStash eksternal). Ini opsi PALING PRAKTIS untuk job
   berikutnya selama QStash masih penuh.
   Atau upgrade plan QStash kalau memang perlu tetap di jalur QStash.

### 2026-08-14 - `/api/cron/news` terdaftar di QStash - manifest cron 100% `known`

Susulan entri di bawah. Pengguna sudah mendaftarkan Schedule QStash untuk
`/api/cron/news` mengikuti instruksi persis (`*/5 9-15 * * 1-5`, sama dengan
`market-summary`/`market-pulse`/`breakout-scan`) - dikonfirmasi. `config/scheduled-jobs.json`
diperbarui: `scheduleStatus` naik dari `"verify-dashboard"` jadi `"known"`. `npm run
audit:cron` sekarang melapor **0 dari 13 job yang masih harus diverifikasi** - manifest
cron akhirnya lengkap 100%.

### 2026-08-14 - Cron baru: `/api/cron/news` - sebelumnya News TIDAK PERNAH di-pre-warm

Pertanyaan pengguna: "apa ada cron job untuk update news?" - jawabannya sebelumnya
**tidak ada sama sekali**. `/api/news` murni `getOrCompute()` on-demand dengan TTL 60
detik saat bursa buka (`getMarketAwareTtlSec()`) - persis pola `MARKET_SUMMARY` sebelum
diperbaiki: tiap 60 detik pas bursa buka, pengunjung PERTAMA menanggung ~10 fetch RSS
feed + 1 panggilan AI klasifikasi berita (`getMarketNews()`), bisa terasa lambat.

Ditambahkan `app/api/cron/news/route.ts`, pola SAMA PERSIS dengan
`app/api/cron/market-summary/route.ts`: hitung ulang di jadwal, simpan ke
`COMPUTED_CACHE_KEY.MARKET_NEWS` (kunci yang SAMA dibaca `/api/news` - wajib lewat
`computed-keys.ts`, bukan literal terpisah, supaya tidak drift). TTL baru
`CACHE_TTL_SEC.MARKET_NEWS` = 6 menit (`shared/cache/ttl-policy.ts`) - interval cron
rencana 5 menit + buffer 1 run telat, sama seperti pola `MARKET_SUMMARY`.

**BELUM BISA JALAN OTOMATIS** - kode route-nya sudah ada dan lolos build, TAPI QStash
Schedule-nya BELUM didaftarkan (butuh dashboard QStash, di luar akses sesi agen ini).
`config/scheduled-jobs.json` mencatat entri ini dengan `scheduleStatus: "verify-dashboard"`
supaya `npm run audit:cron` tidak diam-diam melewatkannya.

**Langkah pendaftaran di dashboard QStash** (samakan dengan job lain seperti
`market-summary`/`market-pulse`/`breakout-scan` yang sudah terdaftar):
1. Buat Schedule baru, destination `https://sahamlens.id/api/cron/news`, method `POST`.
2. Cron expression `*/5 9-15 * * 1-5`, timezone Asia/Jakarta (header `Upstash-Cron`,
   ikuti konvensi 9 job QStash lain yang sudah ada).
3. Setelah terdaftar dan sekali berhasil jalan (cek `Last Run` di dashboard), update
   `config/scheduled-jobs.json`: `schedule` diisi cron expression di atas,
   `scheduleStatus` diubah jadi `"known"`.

typecheck, lint, npm test (1198 test - termasuk test baru
`app/api/cron/news/__tests__/route.test.ts`), `npm run audit:cron`, dan build semua
lolos.

### 2026-08-14 - Jadwal 3 job systemd terverifikasi, manifest cron 100% lengkap

Lanjutan audit jadwal cron di bawah. Temuan #3 (jadwal 3 job systemd tidak diketahui
dari kode) SEKARANG TERSELESAIKAN - pengguna menjalankan `systemctl list-timers --all`
langsung di VPS dan membagikan hasilnya:

| Job | Jadwal sungguhan | Bukti |
| --- | --- | --- |
| `lens-bucket-backtest` | Harian, 17:00 WIB | LAST Kam 13/8 17:00:02, NEXT Jum 14/8 17:00:00 |
| `broker-summary-scan` | Harian, 19:10 WIB | LAST Kam 13/8 19:10:07, NEXT Jum 14/8 19:10:10 |
| `lens-score-optimizer` | Mingguan, Sabtu 18:00 WIB | LAST n/a (belum pernah jalan), NEXT Sab 15/8 18:00:00 |

`config/scheduled-jobs.json` diperbarui: ketiganya `scheduleStatus` naik dari
`"verify-server"` jadi `"known"`, kolom `schedule` diisi ekuivalen cron-nya, `source`
mencatat baris LAST/NEXT yang jadi dasarnya (bukan tebakan). `npm run audit:cron`
sekarang melapor **0 jadwal yang masih harus diverifikasi** dari 12 job total (3
systemd + 9 QStash) - sebelumnya 3.

Sekaligus terkonfirmasi lewat screenshot dashboard QStash terpisah dari pengguna: jadwal
`market-summary` (`*/5 9-15 * * 1-5`) dan `backtest-precompute` (`30 5 * * 1-5`) di
manifest **cocok persis** dengan yang sungguhan dikonfigurasi di QStash - tidak ada
drift dokumentasi untuk keduanya.

**Temuan #2 (jam berhenti tidak konsisten 15:00 vs 16:00 WIB antar job QStash) MASIH
BELUM diselesaikan** - screenshot yang dibagikan belum mencakup cron string lengkap
`ai-pick-scan`/`macro` untuk dikonfirmasi silang, dan keputusan apakah itu sengaja atau
bukan tetap perlu pengguna/pemilik produk.

### 2026-08-14 - Audit jadwal cron: TTL Macro dibetulkan, 2 temuan butuh akses manual

Audit atas permintaan pengguna ("job apa saja yang mesti selalu update, apa jadwalnya
sudah sesuai") menemukan 3 hal. Satu diperbaiki lewat kode, dua lainnya BUTUH akses yang
tidak tersedia dari sesi agen ini (dashboard QStash, SSH VPS) - dicatat di sini supaya
jelas kenapa belum ikut diperbaiki, bukan terlewat.

**1. DIPERBAIKI - `MACRO_DASHBOARD` TTL 30 menit vs cron 1 jam sekali.** Sama persis
polanya dengan bug `MARKET_SUMMARY` yang sudah diperbaiki sebelumnya: `app/api/cron/macro`
(satu-satunya pe-warm cache-nya) jalan `0 9-16 * * 1-5` (sejam sekali), tapi TTL cache
cuma 30 menit - ada jendela ~30 menit tiap jam di mana cache pasti kosong sebelum cron
berikutnya. `CACHE_TTL_SEC.MACRO_DASHBOARD` (`shared/cache/ttl-policy.ts`) dinaikkan ke
70 menit (interval cron 60 menit + buffer 1 run telat), pola sama dengan `MARKET_SUMMARY`
(cron 5 menit + TTL 6 menit).

**2. BELUM BISA DIPERBAIKI - jam berhenti tidak konsisten antar job.**
`breakout-scan`/`market-pulse`/`market-summary`/`recommendation-scan`/`watchlist-alert`
berhenti 15:00 WIB, tapi `ai-pick-scan`/`macro` jalan sampai 16:00 WIB. Jadwal ASLI-nya
hidup di dashboard QStash (`config/scheduled-jobs.json` di repo cuma MANIFEST yang
mencerminkan apa yang sudah dikonfigurasi di sana - bukan sumber kebenaran yang
mengendalikan jadwal sungguhan). Mengubah angka di file JSON itu TANPA mengubah jadwal
sungguhan di QStash akan membuat dokumentasi BERBOHONG tentang kenyataan - lebih buruk
daripada dibiarkan. Perlu login dashboard QStash (atau `curl` API QStash dengan token)
untuk mengubah jadwal sungguhan, lalu manifest diperbarui supaya cocok kembali.

**3. BELUM BISA DIVERIFIKASI - jadwal 3 job systemd tidak diketahui dari kode.**
`lens-bucket-backtest`, `lens-score-optimizer`, `broker-summary-scan` berstatus
`"verify-server"` di manifest sejak awal - jadwalnya cuma ada di unit timer systemd di
VPS, di luar repo. Perlu `systemctl list-timers` dijalankan LANGSUNG di server untuk
tahu jadwal sungguhannya.

typecheck, lint, npm test (1195 test), dan build semua lolos untuk perbaikan #1.

### 2026-08-14 - Nav bar mobile turun lebih dekat ke tepi, label "Kualitas" dihapus

**1. Nav bar bawah (Home/Market/Radar/Analyze/Menu) "kurang ke bawah".** Laporan
pengguna dengan screenshot - ada gap terlihat di antara nav bar dan tepi layar.
`.lens-mobile-nav` (`app/globals.css`) punya jarak tetap `0.75rem` (12px) DI LUAR
`env(safe-area-inset-bottom)` perangkat - di HP dengan navigasi 3-tombol Android
(bukan gesture, safe-area-inset-bottom biasanya 0), itu jadi gap kosong murni tanpa
fungsi. Dikecilkan ke `0.375rem`. Tombol Ask LensAI (`.lens-ai-floating`) ikut
disesuaikan supaya jaraknya ke nav bar tetap sama seperti sebelumnya.

**2. Kartu "Valuasi Harga"/"Kualitas Fundamental" masih tidak sejajar di HP** setelah
perbaikan `min-h-[28px]` sebelumnya - ternyata belum cukup untuk beberapa lebar layar
(label masih pecah jadi 2 baris). Diperbaiki tuntas dengan memendekkan label jadi
"Fundamental" saja - selalu 1 baris seperti "Valuasi Harga" di sampingnya, pendekatan
yang jauh lebih tahan lebar layar mana pun daripada menebak-nebak tinggi 2 baris.

typecheck, lint, npm test (1195 test), dan build semua lolos.

### 2026-08-14 - Dua bug tampilan HP di LensFundamental: kartu tidak sejajar, ikon search dobel

Laporan pengguna dengan screenshot `/fundamental` di HP:

**1. Kartu "Valuasi Harga" (Undervalued) dan "Kualitas Fundamental" (Bagus) tidak
sejajar.** Label "Kualitas Fundamental" lebih panjang dari "Valuasi Harga" dan pecah
jadi 2 baris di layar sempit, tapi label itu sendiri tidak punya tinggi tetap - jadi
kartu di bawahnya cuma ikut turun di SATU kolom, bukan dua-duanya. Diperbaiki dengan
`min-h-[28px]` + flex-center di kedua label (`app/fundamental/page.tsx`) - cukup untuk
2 baris, jadi kedua kartu selalu mulai di garis yang sama baik labelnya 1 baris maupun 2.

**2. Dua ikon kaca pembesar tumpang tindih di kotak pencarian.** `CommandPalette.tsx`
sudah merender ikon Search-nya sendiri di dalam tombol trigger. `Header.tsx` (dipakai
`/fundamental`, `/dashboard`, `/dcf`, `/technical/[symbol]`) menambahkan ikon KEDUA di
atasnya lewat `<span className="absolute left-3">` + `[&_button]:pl-9` - tampaknya sisa
dari sebelum CommandPalette punya ikon sendiri. Di layar sempit (teks placeholder
disembunyikan, tersisa cuma ikon) kelihatan sebagai dua ikon search bersisian. Overlay
& padding hack yang redundan itu dihapus dari `Header.tsx`.

typecheck, lint, npm test (1195 test), dan build semua lolos.

### 2026-08-14 - Search & LensAI tampil gelap saat tema terang (dropdown dark-only)

Laporan pengguna dengan screenshot: pakai tema Light, buka pencarian (Ctrl/Cmd+K atau
ikon cari) - panel hasil pencariannya tetap gelap. Root cause: `CommandPalette.tsx`
(dropdown pencarian global) memakai warna hex mati `bg-[#0D1522]` untuk latar panel dan
`text-white` untuk teksnya - keduanya TIDAK ikut aturan tema, beda dari trigger
button-nya sendiri yang sudah pakai token `tv-*`. Aplikasi ini punya DUA cara membuat
komponen theme-aware: token `tv-*` (`bg-tv-surface`, `text-tv-text`, dst - nilainya
didefinisikan ulang otomatis per tema lewat CSS var `--lens-*`), atau daftar patch
`.light .bg-white\/[...]` dkk di `app/globals.css` yang menimpa utility class hex/putih
literal yang sudah terlanjur dipakai di banyak file. `bg-[#0D1522]` milik CommandPalette
TIDAK ada di kedua jalur itu - lolos dari patch list (yang cuma menutupi `#090E18`,
`#0A101B`, `#080D16`, `#111A29`) DAN tidak pakai token langsung.

Diperbaiki dengan mengganti ke token `tv-*` langsung (lebih tahan lama daripada
menambah entri patch baru) di 3 file:
- `components/CommandPalette.tsx` - panel dropdown pencarian global (bug yang
  dilaporkan), termasuk trigger button, border, teks, dan panel preview mini-chart.
- `components/SymbolAutocomplete.tsx` - dropdown autocomplete di form (Portfolio,
  Watchlist, dst) - bug identik (`bg-[#101A2A]/98` + `text-white`), ditemukan saat
  audit proaktif komponen sejenis.
- `components/AIChat.tsx` (panel Ask LensAI) - bug LEBIH PARAH: kontainer panel
  (`bg-[#0A111D]/98`) tidak dipatch, dan teks balasan AI memakai token `text-tv-text`
  (theme-aware, jadi GELAP di tema terang) di atas panel yang TETAP gelap - kombinasi
  keduanya membuat isi chat nyaris tidak terbaca di tema terang, bukan cuma soal warna
  latar. Bubble pesan asisten & indikator loading (`bg-white/[0.04]`) ikut diperbaiki.

Sekalian ditambal di `app/globals.css`: `bg-white/[0.04]`, `bg-white/[0.05]`, dan
`bg-white/[0.06]` (dipakai 7+ file lain untuk hover state) TERNYATA tidak ada di daftar
patch - tetangga dekatnya (`0.025`, `0.035`, `0.045`) ada, ini cuma terlewat. Ditambahkan
ke aturan yang sudah ada supaya perbaikannya berlaku app-wide, bukan cuma di 3 file di
atas.

typecheck, lint, npm test (1195 test - termasuk `__tests__/color-contrast.test.ts` yang
tidak terpengaruh karena ini bukan soal kontras warna, tapi latar yang sama sekali tidak
ikut ganti tema), dan build semua lolos.

### 2026-08-14 - Lanjutan audit cache: DCF, Intrinsic Value, Risk Matrix

Lanjutan dari audit "semua menu harus ada cache" di bawah - tiga rute lagi ditemukan
TANPA cache Redis:

- **`/api/dcf/[ticker]`** (Valuation) - sebelumnya HANYA mengandalkan header HTTP
  `Cache-Control`/`CDN-Cache-Control`. Header itu hanya berguna kalau ada CDN yang
  membacanya di depan origin - production sudah pindah ke VPS + Cloudflare Tunnel
  (2026-08-13, BUKAN mode CDN cache Cloudflare), jadi header-nya kemungkinan besar
  tidak dibaca siapa pun dan tiap buka `/dcf` untuk ticker yang sama tetap hitung
  ulang model DCF live. Sekarang dibungkus `getOrCompute` (TTL `CACHE_TTL_SEC.TECHNICAL`,
  sama pola dengan `/api/fundamental/[ticker]`).
- **`/api/intrinsic/[ticker]`** (dipanggil `components/IntrinsicValue.tsx` di halaman
  `/fundamental`) - TANPA cache sama sekali, walau `/api/fundamental/[ticker]` untuk
  ticker yang SAMA sudah di-cache dari perbaikan sebelumnya. Dibungkus `getOrCompute`
  dengan pola sama.
- **`/api/risk-analysis`** (Risk Matrix) - body request-nya personal (portofolio per
  pengguna), tapi histori harga IHSG dan USDIDR=X yang dipakai menghitung beta BUKAN
  personal - diminta ulang oleh setiap pengguna yang menjalankan Risk Matrix, tanpa
  cache. Histori per ticker portofolio juga ikut dibungkus (ticker populer sering
  beririsan antar pengguna). Cache ditaruh DI ROUTE ini (bukan di
  `modules/technical/service/yahoo-history.service.ts`, fungsi yang sama dipakai
  jalur cron/precompute/screener yang sudah punya lapisan cache sendiri di atasnya -
  menambah cache di dalamnya berisiko dobel-cache tanpa manfaat jelas).

Ketiganya pakai pola `null` dibungkus jadi `{ notFound: true }` sebelum di-cache
(`getOrCompute` memperlakukan `null` sebagai cache-miss permanen - tanpa pembungkus,
ticker yang datanya memang tidak tersedia akan terus menembak live tiap request).
`risk-analysis` sengaja TIDAK memakai pola ini - kegagalan fetch Yahoo di situ
transien (bukan sifat permanen ticker), jadi `null` dibiarkan apa adanya supaya
tidak ikut ter-cache sebagai kegagalan permanen.

Tes baru: `app/api/dcf/[ticker]/__tests__/route.test.ts`,
`app/api/intrinsic/[ticker]/__tests__/route.test.ts`,
`app/api/risk-analysis/__tests__/route.test.ts`.

Sisa menu yang SUDAH diaudit dan dipastikan tidak butuh perbaikan: Risk Calculator &
live price (`/api/live/[ticker]`, `/api/public-chart/[ticker]` - pakai Next.js fetch
`revalidate`, cache market-aware bawaan Next.js, bukan Redis, tapi tetap cache
sungguhan), Backtest "Live Filter Check" (sengaja live-by-design, lihat komentar di
route-nya), serta semua endpoint data pribadi (portfolio/watchlist/alert/profile) -
tidak boleh di-share-cache karena isinya milik satu identitas.

### 2026-08-14 - Cache hilang/tidak pernah dihangatkan: LensRadar, Fundamental/Moat, Macro

Laporan pengguna: menu LensRadar, LensScanner, Macro, dan Transparansi "agak lama" saat
dibuka. Audit setiap route di baliknya menemukan DUA masalah berbeda, bukan satu:

**1. `/api/lens-score-bucket-backtest` (tab Recommendations di LensRadar) - TANPA CACHE
SAMA SEKALI.** Query SELURUH tabel `lens_radar_history` (semua ticker x semua tanggal,
tanpa filter/limit) dari Postgres dan hitung ulang t-test/kalibrasi bucket LIVE di setiap
request - beda dari `/api/transparency` yang menghitung hal serupa dari tabel yang sama
tapi SUDAH di-cache. Sekarang dibungkus `getOrCompute` (single-flight, TTL 30 menit -
`CACHE_TTL_SEC.LENS_BUCKET_BACKTEST`, kunci per `scoreVersion`).

**2. `/api/fundamental/[ticker]` (Fundamental & Moat) - TANPA CACHE SAMA SEKALI.** Tiap
buka halaman menembak quoteSummary Yahoo, `calculateIntrinsicValue()`, 
`fetchNormalizedEarnings()`, DAN satu panggilan Google Translate untuk deskripsi
perusahaan - semuanya live, tanpa cache. Sekarang dibungkus `getOrCompute` per ticker
(TTL `CACHE_TTL_SEC.TECHNICAL` - 1 menit saat bursa buka, 30 menit saat tutup, sama
dengan pola `/api/stock/[ticker]`). Mode PIT (`?as_of=`) sengaja TIDAK ikut cache ini -
satu baca Postgres langsung, sudah murah. Hasil "ticker tidak ditemukan" ikut di-cache
supaya ticker salah/delisted tidak menembak Yahoo berulang.

**3. Macro - cache-nya ADA (`getOrCompute`, TTL 30 menit) tapi TIDAK PERNAH
dihangatkan.** `/api/cron/macro` (jadwal `0 9-16 * * 1-5`, sudah terdaftar) ternyata cuma
me-refresh indikator USD_IDR ke Postgres - tidak pernah menyentuh
`COMPUTED_CACHE_KEY.MACRO_DASHBOARD`, kunci cache yang justru dibaca `/api/macro`. Jadi
dashboard makro publik selalu bergantung pengunjung pertama tiap 30 menit membayar
komputasi live. Job cron yang sudah berjalan itu sekarang JUGA pre-warm cache dashboard -
**tidak perlu registrasi jadwal baru** di QStash/systemd, cuma menambah kerjaan di job
yang sudah ada. Gagal pre-warm tidak menggagalkan job utama (refresh USD_IDR).

**LensScanner (`/api/screener`) dan Transparansi (`/api/transparency`) sudah benar** -
keduanya sudah pakai `getOrCompute` (TTL 30 menit) sejak awal, cuma memang tidak ada cron
yang pre-warm (tidak seperti Macro, tidak ada job terjadwal existing yang bisa
"ditumpangi" tanpa registrasi baru). Ini BUKAN bug, cache-nya jalan - hanya berarti
pengunjung pertama tiap 30 menit yang menanggung komputasi live, sama seperti pola lama
Macro sebelum diperbaiki. Kalau perlu dihilangkan juga, butuh cron/systemd timer baru
yang didaftarkan manual di VPS (lihat "Aturan wajib saat ada perubahan" di atas) -
di luar scope perbaikan kode murni.

Tes baru: `app/api/lens-score-bucket-backtest/__tests__/route.test.ts`,
`app/api/fundamental/[ticker]/__tests__/route.test.ts`,
`app/api/cron/macro/__tests__/route.test.ts` - mengunci bahwa ketiganya membaca lewat
`getOrCompute`/`cacheSet`, bukan memanggil komputasi live langsung.

### 2026-08-13 - TP/CL Validation Lab jadi menu sendiri di admin panel

Rute `/admin/tpcl-validation` sudah terpisah sejak awal, tapi satu-satunya tautan menujunya
terkubur DI DALAM halaman Calibration Lab - jadi terbaca seolah bagian dari kalibrasi
LensScore, padahal yang diuji mesin TP/CL (structure + ATR + fraksi harga IDX), kuantitas yang
sama sekali berbeda. Sekarang kartu sendiri di grid `/admin` (`app/admin/page.tsx`), dan
tautan di dalam Calibration Lab dihapus. Commit `4780478`.

Murni UI: tidak mengubah cara build, deploy, env var, cron, atau gating akses. Dicatat di sini
karena aturan paling atas dokumen ini mewajibkan setiap commit yang sudah masuk `main` punya
catatan, sekecil apa pun perubahannya - dan commit ini sempat lolos tanpa catatan.

Diverifikasi lokal sebelum dicatat (dev server + cookie admin, bukan pembacaan kode saja):
`/admin` merender kartunya, `/admin/calibration` nol referensi `tpcl-validation`, dan
`/admin/tpcl-validation` balas 200.

### 2026-08-13 - Rule tamu dirombak: fitur analisis dibuka penuh, hanya Portfolio & Watchlist wajib akun

Keputusan produk baru, MENGGANTIKAN aturan 2026-08-11 (trial anonim 7 hari yang
menggerbang fitur premium untuk tamu tanpa akun): **tamu sekarang bebas pakai fitur
analisis apa pun, selamanya, tanpa batas waktu** - screener, backtest, fundamental,
compare, recommendations, risk-calculator, dcf, macro, moat, pattern, risk, dividend,
earnings, market, dashboard. Yang tetap wajib akun cuma dua, dan alasannya beda: bukan
soal Pro/gratis, tapi karena datanya milik satu identitas yang harus tersimpan lintas
kunjungan - **Portfolio** (posisi & transaksi) dan **Watchlist** (daftar pantau & alert).
Menu admin tetap digerbang terpisah lewat cookie admin, tidak berubah.

Perubahan inti:
- `shared/constants/access.ts` - `PROTECTED_PAGES` dipangkas dari 17 halaman jadi
  `['/portfolio', '/watchlist']` saja. Ini satu sumber yang dipakai proxy DAN Sidebar,
  jadi menu yang tampil dan halaman yang boleh dibuka tidak pernah berbeda.
- `shared/auth/session.ts` - fungsi baru `hasOpenOrProAccess(session)`: `null` (tamu)
  selalu `true`; user login tetap lewat `checkProAccessLive()` seperti sebelumnya
  (perilaku Pro/gratis untuk akun terdaftar TIDAK berubah). Dipakai menggantikan
  `checkProAccessLive` langsung di 8 route: `/api/backtest`, `/api/backtest/
  live-filter-check`, `/api/recommendations`, `/api/lens-score-bucket-backtest`,
  `/api/compare`, `/api/dividend-plan`, `/api/flow/[ticker]`, `/api/stock/[ticker]`.
  Early-exit 401 untuk tamu tanpa trial aktif dihapus dari semua route ini - sekarang
  tamu selalu lolos gerbang akses, respons 402 hanya berlaku untuk akun terdaftar yang
  bukan Pro.
- Cookie trial anonim TETAP diterbitkan untuk tamu (dipakai sebagai identitas kuota
  chat LensAI & telemetri), hanya saja tidak lagi dipakai untuk keputusan akses fitur.
- **Kuota chat LensAI untuk tamu dinaikkan dari 5 ke 25 pertanyaan** per jendela trial
  anonim (`shared/usage/guest-chat-quota.ts` `GUEST_CHAT_LIMIT`) - satu-satunya batas
  produk yang sengaja dipertahankan untuk tamu, bukan kelalaian.
- Limiter IP umum 150 request/hari (`proxy.ts`) TIDAK diubah - itu pengaman anti-abuse
  terpisah dari gerbang fitur di atas, tetap berlaku untuk halaman di luar allowlist
  `isPublicGuestPage`/`isPublicGuestApi`, dan cukup longgar untuk pemakaian wajar.

Tes: `__tests__/proxy-guest-access.test.ts` menambahkan blok `it.each` atas 15 halaman
yang dulu terproteksi, memastikan tamu tidak lagi diarahkan ke `/login`, plus assersi
`PROTECTED_PAGES` persis `['/portfolio', '/watchlist']`. `app/api/backtest/__tests__/
route.test.ts` dan `app/api/recommendations/__tests__/route.test.ts` ditulis ulang:
mock `hasOpenOrProAccess` menggantikan `checkProAccessLive`, tes "401 tanpa
trial aktif" diganti jadi "tetap 200".

### 2026-08-13 - Kontras: seluruh matriks warna, dijaga tes

Laporan PageSpeed berikutnya menggagalkan lencana **hijau**, padahal yang sebelumnya
menggagalkan yang **merah** - di halaman yang sama, tanpa ada perubahan kode di antaranya.
Penyebabnya sederhana dan penting: hari itu IHSG naik. Lighthouse hanya memeriksa elemen
yang **kebetulan terlihat** saat ia menjalankan halaman.

Karena itu seluruh matriks dihitung sekaligus (7 warna aksen x 3 tingkat tint x 2 tema),
dan hasilnya jauh lebih luas dari yang dilaporkan: **14 kombinasi gagal**. `warning`,
`gold`, dan `blue` gagal di SEMUA tingkat tint di mode terang (serendah 3,74:1) dan tidak
pernah tersampling Lighthouse sama sekali.

Arah perbaikannya berlawanan di dua tema, dan itu bukan kebetulan: tint selalu menggeser
latar ke arah warna teksnya sendiri, jadi teksnya harus menjauh - **menggelapkan di tema
terang, mencerahkan di tema gelap**. Nilai dipilih sebagai pergeseran TERKECIL yang
membuat ketiga peran lulus pada tint terberat, jadi warnanya nyaris tidak berubah secara
visual.

**Sekarang dijaga `__tests__/color-contrast.test.ts`** - 45 pemeriksaan atas nilai token
langsung dari `globals.css`. Ini yang membuat perbaikannya berhenti berulang: pelanggaran
berikutnya gagal saat `npm test`, bukan muncul sebagai screenshot pengguna berbulan-bulan
kemudian. Tes itu **langsung membuktikan diri**: ia menangkap regresi yang muncul dari
perbaikan ini sendiri - biru mode terang digelapkan sampai warna hover-nya jadi terlalu
mirip (selisih luminans 0,0097), sehingga umpan balik hover praktis hilang.

### 2026-08-13 - PageSpeed lanjutan: kontras mode terang, cache aset, chunk markdown

Dikerjakan dari laporan PageSpeed production yang sebenarnya (bukan pengukuran lokal).

**1. Kontras GAGAL di mode terang - diperbaiki di level token.** Lencana perubahan IHSG
di header (`bg-tv-red/15 text-tv-red`) terukur 4,46:1 merah dan 4,09:1 hijau di mode
terang; ambangnya 4,5:1. Mode gelap justru sudah lulus (5,32 dan 6,58), jadi ini murni
masalah pasangan terang.

Penyebabnya peran KETIGA yang terlewat waktu palet terang dibuat: warna yang sama dipakai
sebagai teks **di atas tint-nya sendiri**, dan pola itu ada di **33 berkas**. Karena itu
yang digelapkan adalah tokennya (`--lens-red` -> `#B02323`, `--lens-green` -> `#12722F`),
bukan satu `<span>`. Menggelapkan token memperbaiki ketiga peran sekaligus - teks polos,
teks di atas tint, dan teks putih di atas bidang padat - dan tabel rasio di
`app/globals.css` sudah diperbarui dengan angka terukur.

**2. Cache aset statis** (`next.config.mjs headers()`). `/sahamlens-scope.png` disajikan
TTL 4 jam, jadi pengunjung yang kembali esok hari mengunduhnya lagi. Next tidak memasang
`Cache-Control` untuk berkas `/public`; nilainya datang dari default Cloudflare. Sekarang
30 hari + `stale-while-revalidate`. **Sengaja BUKAN 1 tahun `immutable`** seperti yang
diminta Lighthouse: berkas `/public` tidak punya hash isi di namanya, jadi logo yang
diperbarui akan tersangkut setahun tanpa cara membatalkannya selain mengganti nama.

**3. Chunk react-markdown ditunda** - `unused-javascript` turun dari 157 KiB ke 132 KiB.
Parser markdown (~33 KiB) ikut terunduh di setiap halaman meski panel chat tidak pernah
dibuka. AIChat memang sudah `dynamic()`, tapi itu hanya menunda sampai hidrasi, bukan
sampai dipakai. Sekarang parser dimuat saat panel dibuka.

**Sisa `unused-javascript` (132 KiB) TIDAK dikejar, dan itu keputusan sadar.** Setelah
diidentifikasi dari isinya, dua chunk terbesar adalah runtime framework: `7149`
(`FetchStrategy`, `EntryStatus`, `PrefetchKind`, `AppRouter` - App Router Next.js) dan
`4bd1b696` (`stateNode`, `alternate`, `memoizedProps` - reconciler React). Lighthouse
menandainya "tidak terpakai" karena belum dipakai saat load pertama, padahal ia dipakai
saat navigasi dan hidrasi. Sisanya framer-motion, yang memang dipakai untuk animasi masuk
di banyak halaman.

**Dua temuan yang BUKAN pekerjaan kode - perlu keputusan Anda:**

- **Cloudflare Web Analytics ada di jalur kritis, 920 md.** Rantainya:
  `sahamlens.id` (198 md) -> `/beacon.min.js` (250 md) -> `/cdn-cgi/rum` (**920 md**).
  Skrip ini disuntikkan otomatis oleh Cloudflare, bukan oleh kode aplikasi. Mematikannya
  ada di dashboard Cloudflare (Web Analytics), bukan di repo ini.
- **JavaScript versi lama, 13 KiB** (`Array.prototype.at`, `Object.hasOwn`,
  `String.prototype.trimStart`, dst). Bisa dihapus dengan menaikkan target `browserslist`
  ke peramban modern - **tapi saya sengaja tidak melakukannya**: aplikasi ini punya
  pembungkus WebView Android (`sahamlens-android/`), dan WebView lama persis yang
  membutuhkan polyfill itu. Menukar 13 KiB dengan risiko aplikasi Android blank adalah
  pertukaran yang buruk, dan itu keputusan produk, bukan keputusan teknis.

### 2026-08-13 - Perbaikan PageSpeed: logo 263 KiB untuk avatar 32 piksel

Diukur dengan Lighthouse 12 (preset desktop) terhadap build production yang dijalankan
lokal. Dua audit gambar gagal dengan total ~500 KiB pemborosan, dan penyebabnya satu
berkas: `/sahamlens-scope.png` (512x512, 263 KiB) dipakai lewat `<img>` mentah di tiga
tempat untuk ditampilkan **32-36 piksel**.

Ketiganya diubah ke `next/image` (pola yang sudah dipakai `Sidebar.tsx`). Hasil terukur
pada berkas yang sama:

| | Byte terkirim |
| --- | --- |
| Sebelum (PNG asli) | 269.595 |
| Sesudah, `w=32` WebP | 462 |
| Sesudah, `w=64` (retina) | 1.146 |

Kedua audit (`uses-responsive-images`, `modern-image-formats`) kini bernilai 1.

**Yang TIDAK jadi diubah, dan kenapa itu penting dicatat**: dugaan awal saya PNG-nya
belum dioptimalkan. Sharp memang bisa menghasilkan 105 KiB - tetapi setelah dibandingkan
piksel per piksel, versi itu **tidak lossless** (417.597 byte berbeda, selisih maksimum
37); opsi `effort` memicu kuantisasi palet. Re-encode yang benar-benar lossless justru
menghasilkan **357 KiB, lebih besar dari aslinya**. Jadi berkas sumbernya sudah optimal
dan sengaja tidak disentuh. **Jangan "mengoptimalkan" aset merek ini tanpa membandingkan
piksel lebih dulu.**

**Catatan operasional**: optimasi gambar Next berjalan saat runtime dan butuh `sharp`
(sudah jadi dependency langsung, v0.35.3). Hasilnya di-cache di `.next/cache/images` -
jadi permintaan PERTAMA per ukuran membayar biaya CPU konversi, sesudahnya gratis. Kalau
`.next` dibersihkan saat deploy, cache itu ikut hilang dan biaya konversi terjadi lagi
sekali per ukuran - normal, bukan gejala kerusakan.

**Batas pengukuran ini**: dijalankan terhadap server lokal, jadi angka LCP/TTFB-nya tidak
mewakili production (tidak ada latensi jaringan, Cloudflare Tunnel, atau Nginx). Yang
diukur di sini adalah hal-hal level kode - ukuran & format aset, JS tak terpakai,
aksesibilitas, SEO - dan itu berlaku sama di production. Lingkungan CI/agen tidak bisa
menjangkau `sahamlens.id` (kebijakan jaringan), dan kuota API PageSpeed anonim sedang
habis, jadi verifikasi terhadap production harus dijalankan dari mesin yang bisa
mengaksesnya.

### 2026-08-13 - Streaming jawaban LensAI, dengan gerbang verifikasi angka

Jawaban LensAI kini mengalir bertahap, TAPI hanya teks yang angkanya sudah lolos
verifikasi yang boleh sampai ke layar. Streaming polos ditolak dengan sengaja: kalau
token dialirkan apa adanya, angka karangan terbaca pengguna pada detik pertama dan
koreksi apa pun datang terlambat - itu membuka kembali kelas bug yang melahirkan aturan
#21, hanya dengan catatan kaki.

Yang memungkinkan jalan tengah: verifikasi angka di repo ini **deterministik dan tidak
memanggil AI**, jadi biayanya mikrodetik. Teks ditahan sampai satu satuan utuh (paragraf,
atau kalimat yang sudah cukup panjang), diperiksa, lalu dilepas.

**Yang perlu diketahui operator:**

- **Header `X-Accel-Buffering: no` WAJIB ada.** Nginx di VPS mem-buffer respons proxy
  secara default; tanpa header itu seluruh "streaming" tertahan di reverse proxy lalu
  tiba sekaligus, dan pengguna tidak melihat bedanya sama sekali dengan sebelum ada
  streaming. Kalau ada laporan "streaming-nya tidak jalan di production padahal jalan di
  lokal", **periksa ini lebih dulu** sebelum menyalahkan kode.
- **Jalur lama tidak berubah.** Streaming hanya aktif kalau klien mengirim
  `{"stream": true}`. Sembilan pemanggil `generateAI()` lain dan klien versi lama tetap
  menerima JSON seperti biasa.
- **Biaya AI tidak bertambah** untuk jawaban normal (satu panggilan). Jawaban yang gagal
  verifikasi tetap memakai dua panggilan, sama seperti sebelumnya.
- **Jawaban deterministik tidak di-stream** (di luar ranah, sapaan, pertanyaan balik) -
  memang tidak ada yang perlu dialirkan, dan responsnya tetap JSON.
- Kalau provider gagal SETELAH teks mulai mengalir, aliran berhenti dengan teks seadanya
  dan tidak pindah provider. Menyambung dua jawaban dari dua model berbeda menghasilkan
  kalimat mulus dengan isi campuran - lebih menyesatkan daripada jawaban terpotong.

### 2026-08-13 - Contoh pembuka LensAI mengikuti halaman

Perubahan UI murni, tidak menyentuh build/env/cron. Dicatat karena menutup celah produk
yang lahir dari perubahan minggu ini sendiri: cakupan LensAI melonjak (pasar, sektor,
LensRadar, dividen, earnings, arus dana, metodologi skor, portofolio), tetapi layar
pembukanya masih menawarkan SATU contoh - analisis teknikal emiten yang sedang dibuka.
**Kemampuan yang tidak diketahui siapa pun sama saja dengan tidak ada.**

- Di halaman emiten (`/technical/BBCA.JK` dst): contoh diarahkan ke emiten itu -
  fundamental, teknikal, dividen, arus dana.
- Di halaman lain: contoh pertanyaan pasar - kondisi pasar & sektor, skor tertinggi hari
  ini, top gainer, cara skor ditentukan.
- Aturan isi daftar (`components/ai-chat-starters.ts`): setiap contoh WAJIB punya jalur
  data nyata dan padanan di fixture `eval:lensai`. Menawarkan contoh yang berujung
  "datanya belum tersedia" lebih buruk daripada tidak menawarkan apa pun - pengguna
  mencobanya sekali, gagal, lalu berhenti mencoba yang lain.

Sekalian memperbaiki deteksi halaman emiten: logika lama ("segmen terakhir URL = simbol")
mengubah `/screener` menjadi simbol `SCREENER` dan menawarkan pertanyaan tentang emiten
yang tidak ada.

### 2026-08-13 - BUG NYATA: kata umum terbaca sebagai kode emiten

Ditemukan oleh evaluasi jawaban end-to-end yang baru (`npm run eval:answers`), bukan dari
kode. **Bug ini sudah ada jauh sebelum perubahan LensAI minggu ini.**

`extractMentionedTickers()` meng-uppercase seluruh prompt lalu mencocokkan tiap kata 4
huruf dengan daftar 1.283 emiten. Kata sehari-hari yang kebetulan sama dengan kode emiten
karena itu dibaca sebagai kode saham:

| Pertanyaan pengguna | Dulu dibaca sebagai | Akibatnya |
| --- | --- | --- |
| "harga **emas** hari ini berapa?" | emiten `EMAS` | analisis emiten kecil, bukan penolakan jujur "emas di luar cakupan" |
| "saham Tesla lagi **naik** gak?" | emiten `NAIK` | sama |
| "saya mau **beli** saham apa?" | emiten `BELI` | analisis PT Beli, bukan peringkat LensRadar |

Kata lain yang bentrok: `BAIK`, `AMAN`, `UANG`, `SATU`, `POLA`, `GUNA`, `IKAN`, `AGAR`,
`ENAK`. Dampaknya lebih dalam daripada salah jawab: begitu router mengira ada emiten,
seluruh gerbang "pertanyaan tingkat pasar" ikut mati - termasuk penolakan jujur untuk aset
di luar cakupan SahamLens.

**Perbaikan**: huruf besar-kecil pada teks ASLI dipakai sebagai sinyal (sebelumnya
dibuang oleh `toUpperCase()`). Ditulis KAPITAL selalu diterima sebagai kode emiten
(`EMAS` tetap bekerja untuk yang memang memaksudkan emitennya); ditulis huruf kecil DAN
ada di daftar kata umum (`app/api/chat/indonesian-stopwords.ts`) ditolak; huruf kecil di
luar daftar tetap diterima (`bbca gimana` harus tetap jalan).

**Evaluasi routing ikut diperbaiki**: dulu jumlah ticker ditulis manual di fixture sebagai
MASUKAN, jadi ia buta secara struktural terhadap kesalahan ekstraksi. Sekarang ekstraktor
sungguhan yang dipakai, dan angka itu berubah peran menjadi ekspektasi yang diperiksa.

### 2026-08-13 - Evaluasi kualitas jawaban (`npm run eval:answers`)

Pelengkap `eval:lensai`. Memanggil `/api/chat` yang sungguhan pada server hidup, jadi
mengukur JAWABAN, bukan cuma routing. Pemeriksaannya tetap deterministik: intent sesuai,
`routing.numberCheck.ok` (tidak ada angka tak tertelusur), penutup DYOR sesuai kebijakan,
dan jawaban tidak kosong/bukan error penyedia.

**SENGAJA tidak dijalankan di CI** - butuh kuota AI dan hasilnya tidak identik tiap kali.
Jalankan manual: `npm run dev` lalu `npm run eval:answers -- --limit=10`.

Karena 9Router dipin di depan cascade (`tryFirst`), seluruh eval lewat satu endpoint itu
kalau terpasang. **Dari mesin dev, `NINEROUTER_BASE_URL` tidak boleh `127.0.0.1:20128`** -
alamat itu hanya sah di dalam VPS; pakai hostname publiknya. Tidak ada API key baru:
key-nya sama dengan yang sudah dipakai aplikasi.

Catatan: pertanyaan yang jalurnya deterministik (nyeleneh, di luar cakupan, sapaan,
pertanyaan balik) tetap terukur penuh **tanpa API key sama sekali** - berguna untuk
memverifikasi perubahan routing tanpa membakar kuota.

### 2026-08-13 - LensAI: evaluasi routing, pertanyaan harga masa depan, DYOR

- **Evaluasi routing (`npm run eval:lensai`).** 65 pertanyaan nyata di
  `app/api/chat/__tests__/fixtures/lensai-questions.json`, dicek apakah sampai ke data
  yang benar. TIDAK memanggil AI, jadi bisa jalan di CI dan gratis. Ini menjawab pola
  lama repo ini: perbaikan LensAI selalu dimulai dari screenshot, tanpa satu pun angka
  yang menyatakan keadaan sekarang. **Menambah pertanyaan cukup mengedit JSON-nya.**
  Kalau sebuah pertanyaan gagal, itu temuan - bukan alasan mengubah pertanyaannya
  supaya lulus.
- **Pertanyaan harga masa depan** ("besok naik gak?") kini punya intent sendiri. Bukan
  ditolak: dijawab dengan tren, level, setup TP/CL, base rate historis per bucket, dan
  ukuran risiko - dengan larangan tegas menyebut angka harga besok. Pertanyaan pantauan
  berbingkai besok ("saham apa yang patut dipantau besok dari market hari ini") tetap
  dijawab peringkat LensRadar hari ini, plus bingkai yang sama.
- **"Bagus atau jelek?" kini masuk mesin keputusan.** Sebelumnya hanya "bagus gak"
  PERSIS yang tertangkap; bentuk lain jatuh ke data mentah tanpa keputusan model,
  gerbang kelayakan, dan status validasi - padahal justru pertanyaan itu yang paling
  membutuhkannya.
- **Penutup DYOR ditempel di server** (`app/api/chat/dyor.ts`), bukan diminta lewat
  aturan prompt. Penafian yang muncul "biasanya" bukan penafian. Tidak ditempel ke
  sapaan/penolakan/penjelasan fitur - penafian yang muncul di mana-mana melatih pengguna
  berhenti membacanya.
- Perbaikan sambil jalan: jawaban kaleng "bisa bantu apa" masih memuat daftar kemampuan
  lama (empat hal) dan polanya tidak menangkap "kamu bisa bantu apa?" - bentuk yang
  paling sering diketik. Keduanya diperbaiki.

### 2026-08-13 - LensAI: satu sumber keputusan, verifikasi angka, multi-topik

Lanjutan dari perubahan cakupan data di bawah. Tiga lapisan ditambahkan:

- **Keputusan & TP/CL dari mesin yang sama dengan halaman aplikasi.** Pertanyaan "bagus
  gak / layak beli / TP-CL berapa" sekarang memakai `analyzeStock()` (mesin halaman
  Recommendations) dan `tradeSetup` dari cache LensRadar, bukan kesimpulan yang disusun
  model sendiri dari blok fundamental + teknikal. **Ini memperbaiki risiko nyata**: dua
  jalur perhitungan berbeda bisa memberi kesimpulan berbeda untuk emiten yang sama pada
  menit yang sama, dan pengguna tidak punya cara tahu mana yang benar. Level TP/CL
  sengaja TIDAK dihitung ulang di chat - angka level harga adalah hal terakhir yang boleh
  berbeda antara dua layar.
- **Verifikasi angka (`app/api/chat/verify-numbers.ts`).** Setiap angka berbentuk klaim
  data di jawaban dicocokkan dengan Data Terverifikasi Server, prompt pengguna, dan
  riwayat. Kalau ada yang tidak tertelusur: satu kali perbaikan diminta ke model dengan
  menyebut angka yang bermasalah; kalau masih gagal, jawaban tetap dikirim **dengan
  catatan jujur di bawahnya**, bukan disunting diam-diam. Hasil pemeriksaan ikut di
  `routing.numberCheck` - **pantau log `[LensAI:verify]` untuk melihat seberapa sering
  ini terjadi.** Konsekuensi biaya: pertanyaan yang gagal verifikasi memakai DUA panggilan
  AI, bukan satu.
- **Asumsi DCF ikut dikirim ke LensAI.** Blok valuasi dulu hanya memuat nilai wajar dan
  MoS - dua angka hasil tanpa satu pun dasar, sehingga "harga wajarnya sekian" terbaca
  seperti pengukuran. Sekarang biaya ekuitas CAPM, risk-free + ERP, beta dan sumbernya,
  asumsi pertumbuhan, PER*/PBV* wajar, dan metode yang benar-benar terpakai ikut dikirim.
  Dua hal yang wajib ikut karena mudah menyesatkan: **tingkat diskonto ada DUA** (CAPM per
  emiten untuk PBV*/PER*, tetap 12% untuk DDM & perpetuitas FCF), dan **bobot metode per
  sektor berstatus hipotesis** yang belum divalidasi terhadap forward return.
- **Multi-topik + pertanyaan balik.** Satu pertanyaan bisa memicu sampai 2 blok data
  tambahan ("fundamental BBCA gimana, ada berita apa?"). Pertanyaan yang terlalu pendek
  tanpa emiten dan tanpa riwayat dijawab dengan pertanyaan balik deterministik - tanpa
  panggilan AI.

Tidak ada env var, skema database, atau cron baru.

### 2026-08-13 - LensAI (Ask AI) menjangkau seluruh fitur aplikasi

**Masalah**: LensAI hanya punya jalur data untuk 6 hal (fundamental, teknikal, valuasi,
banding, IHSG level+RSI, berita). Semua pertanyaan di luar itu jatuh ke intent `UNKNOWN`,
yang berarti NOL data terverifikasi - dan karena system prompt melarang menjawab dari
ingatan model (aturan #14/#16, lahir dari rentetan bug halusinasi), LensAI **wajib
menolak**. Jadi data yang sudah dihitung cron tiap 5 menit - breadth, regime, sektor,
peringkat pasar, LensRadar - tidak pernah bisa ditanyakan pengguna.

**Yang ditambahkan** (intent + blok data, pola yang sama dengan blok lama):
peringkat LensRadar, metodologi LensScore, peringkat pasar (gainer/loser/nilai/oversold/
relative strength), sektor + breadth + regime, makro, screener, bukti backtest per bucket,
dividen, earnings, kalender korporasi, arus broker + proksi akumulasi, moat, risiko/beta,
serta portofolio & watchlist milik pengguna.

**Keputusan yang perlu diketahui operator**:

- **Semua blok baru membaca CACHE saja** (`cacheGet`), tidak pernah `getOrCompute` untuk
  komputasi berat. `getMarketSummary()` memindai 250 saham dan `getMarketPulse()` memindai
  puluhan saham - menjalankannya dari dalam request chat berarti satu pertanyaan pengguna
  menanggung scan penuh. **Konsekuensi operasional: kalau cron pemindai mati, LensAI akan
  menjawab "datanya belum tersedia" alih-alih lambat.** Itu disengaja. Kalau banyak
  keluhan seperti itu muncul, periksa cron/QStash dan `job_run_log` lebih dulu, bukan
  kode chat-nya.
- **Portofolio & watchlist ikut terkirim ke penyedia AI** (Gemini/Groq/9Router) - disetujui
  pemilik produk 2026-08-13, **khusus untuk pengguna yang sedang login**. userId diambil
  dari sesi JWT di route, bukan dari body request, supaya tidak ada yang bisa meminta
  portofolio orang lain dengan menyisipkan id. Pengunjung anonim dijawab "silakan login",
  tanpa satu pun query ke database.
- **Pertanyaan di luar ranah dijawab tanpa memanggil AI sama sekali**
  (`app/api/chat/out-of-scope.ts`). Untuk "harga emas hari ini" atau "prediksi bitcoin",
  model PUNYA jawaban dari data latihnya; aturan prompt cuma melarang, tidak menghapus.
  Kalau tidak ada panggilan AI, tidak ada angka yang bisa dikarang. Efek samping yang
  menyenangkan: pertanyaan seperti ini jadi gratis dan instan.
- **Cache key hasil komputasi disatukan** di `shared/cache/computed-keys.ts` dan dipakai
  bersama oleh route publik + chat. Sebelumnya tiap route punya literal sendiri; pembaca
  kedua yang salah satu huruf akan selalu cache-miss **tanpa error apa pun** - untuk
  LensAI kegagalannya tak terlihat, cuma jawaban yang lebih miskin.
- **Perbaikan biaya**: `marketNewsBlock()` di chat dulu memanggil `getMarketNews()`
  LANGSUNG - menarik ~10 feed RSS + satu klasifikasi AI setiap kali ada pertanyaan
  "kenapa turun", padahal `/api/news` sudah menyimpan hasil yang sama di Redis. Sekarang
  keduanya berbagi satu kunci cache.

**Tidak ada env var baru, tidak ada perubahan skema database, tidak ada cron baru.**

### 2026-08-13 - Dokumen ini ditulis ulang untuk jalur VPS + auto-deploy

Tidak ada perubahan perilaku aplikasi. Yang diperbaiki adalah dokumennya sendiri: sebelumnya
seluruh instruksi operasional masih berbentuk "deploy ke Vercel", dengan satu blok peringatan
di atas yang menyatakan production sudah pindah. Bentuk itu berbahaya - pembaca yang melompat
ke bagian yang dibutuhkannya (env var, cron, deploy ulang) mendapat instruksi Vercel tanpa
pernah melihat peringatannya.

- Bagian "Cara deploy" ditulis ulang: **jalur utama = push ke `main`**, rantai
  CI -> Deploy VPS -> SSH -> skrip `deploy`. Jalur manual di VPS diturunkan statusnya menjadi
  prosedur darurat, lengkap dengan perintah diagnosa (`journalctl`, `systemctl`) dan rollback.
- Bagian env var berpindah dari "yang di-set di Vercel" ke `/opt/sahamlens/app/.env.production`,
  dengan penegasan bahwa **auto-deploy tidak pernah menulis file itu** - env var baru selalu
  butuh langkah manual di server plus restart.
- `UPSTASH_REDIS_REST_URL/TOKEN` dipindah ke daftar LEGACY dan diganti `REDIS_URL` (menyusul
  migrasi cache ke Redis VPS, `69b93ce`). `.env.example` dan komentar di
  `shared/cache/redis-cache.ts` ikut disesuaikan - keduanya masih menyebut Upstash.
- Bagian cron dipisah tegas: 3 job systemd timer di VPS, 9 job QStash, 0 Vercel Cron. Jam
  systemd sengaja TIDAK disalin dari `vercel.json` lama karena jam sebenarnya hidup di server.
- Dua jebakan baru dinaikkan ke bagian Jebakan: `vercel.json` yang tidak boleh berisi `crons`
  lagi, dan keharusan memastikan siapa penjadwal sebuah route sebelum mengubah handler-nya.
- Jebakan lama yang khusus era `vercel --prod` (folder `mobile/`, `.vercelignore`) ditandai
  HISTORIS alih-alih dihapus.
- `config/scheduled-jobs.json`: tiga job yang masih mengklaim `provider: "vercel"` dengan
  `source: "vercel.json"` dikoreksi menjadi `systemd` + `verify-server`. Klaim lama itu sudah
  salah sejak `2a64988` menghapus blok `crons`, dan `npm run audit:cron` meloloskannya karena
  hanya memeriksa satu arah (vercel.json -> manifest). Audit sekarang memeriksa dua arah dan
  **gagal kalau `vercel.json` berisi blok `crons` sama sekali**.

### 2026-08-13 - 9Router: satu endpoint proxy untuk banyak AI di cascade LensAI

**Kenapa**: provider AI gratis (Gemini/Groq/OpenRouter/Kimi/NVIDIA) masing-masing punya
kuota harian sendiri dan katalog model yang berubah tanpa peringatan - tiap kali sebuah
slug model dihapus penyedianya, kodenya harus ikut diubah. 9Router
(`github.com/decolua/9router`) adalah proxy OpenAI-compatible self-hosted yang merutekan
satu request ke 40+ provider dengan fallback internal, jadi penambahan/penggantian model
cukup dilakukan di dashboard 9Router tanpa deploy ulang SahamLens.

**Yang berubah di kode**:
- `lib/aiProviders.ts`: 9Router masuk sebagai provider OpenAI-compatible seperti Groq/Kimi,
  TAPI dibangun dari env var saat runtime (`buildNineRouterProvider()`) karena base URL dan
  daftar model-nya milik instance masing-masing, bukan konstanta yang bisa di-hardcode.
- Ranking: model 9Router (`auto`, `cc/claude-opus-4-7`, `glm/glm-5.1`, ...) tidak bisa
  dinilai `MODEL_PRIORITY` yang statis, jadi provider ini punya flag `tryFirst` dan
  ditempatkan di depan seluruh cascade (bisa dibalik dengan `NINEROUTER_PRIORITY=last`).
- Timeout: 9Router punya lantai timeout sendiri (default 15 detik) karena melakukan
  fallback ke upstream-nya sendiri; budget caller tetap dipakai kalau sudah lebih longgar.
  Semua route pemanggil AI `maxDuration >= 60`, jadi lantai ini aman.
- `lib/sahamLensGuard.ts`: berhenti menyalin daftar provider secara hardcode (dulu cuma
  tahu 3 env var, jadi deployment yang hanya memakai Kimi/NVIDIA diperingatkan salah).
  Sekarang memanggil `hasAnyAIProvider()`.
- Cascade lama TIDAK dihapus. Kalau 9Router mati/limit, percobaan lanjut ke provider
  langsung seperti sebelumnya, dan kalau semua gagal fallback rule-based tetap jalan.

**Cara pasang di VPS**: langkah demi langkah ada di `docs/operations/9ROUTER.md`, file
deploy siap pakai (compose + Nginx + installer) di `deploy/9router/`. Repo ini private,
jadi VPS tidak bisa clone tanpa token - `deploy/9router/bootstrap-9router.sh` menulis
ketiga file itu di VPS tanpa clone. Bootstrap DIGENERATE dari ketiga file tersebut;
kalau salah satunya diubah, generate ulang supaya tidak melenceng.

**Env var baru** - ditambahkan ke `/opt/sahamlens/app/.env.production` di VPS, lalu
`sudo systemctl restart sahamlens`:

| Env var | Wajib | Isi |
| --- | --- | --- |
| `NINEROUTER_BASE_URL` | ya (untuk aktif) | `http://127.0.0.1:20128/v1` - aplikasi dan 9Router satu mesin, jadi panggilannya TIDAK perlu keluar ke internet: lebih cepat dan tidak tunduk batas 100 detik Cloudflare. `https://router.sahamlens.id` juga berfungsi dan berguna untuk uji dari luar. Boleh ditulis dengan/tanpa `/v1` - dinormalkan di kode. |
| `NINEROUTER_API_KEY` | ya (untuk aktif) | API key dari Dashboard 9Router -> Settings -> API Keys. Sensitive. |
| `NINEROUTER_MODELS` | tidak | Daftar model dipisah koma, urutan = urutan percobaan. Kosong = `auto`. |
| `NINEROUTER_PRIORITY` | tidak | `first` (default) atau `last`. |
| `NINEROUTER_TIMEOUT_MS` | tidak | Default `15000`. |
| `NINEROUTER_PROMPT_BUDGET` | tidak | `cheap` / `smart` / `mini`, dikirim sebagai header `X-Prompt-Budget`. |

Keduanya (`BASE_URL` + `API_KEY`) harus diisi. Base URL tanpa API key sengaja DIABAIKAN -
itu berarti router-nya terbuka untuk siapa pun yang tahu URL-nya, dan itu tidak boleh
terjadi diam-diam.

**Jebakan operasional**:
- **`localhost:20128` TIDAK akan bisa dipakai dari Vercel.** Route SahamLens jalan di
  serverless Vercel, jadi `NINEROUTER_BASE_URL` harus URL yang bisa dijangkau dari
  internet. Jalankan 9Router di VPS (bisa VPS yang sama dengan Redis) dengan
  `REQUIRE_API_KEY=true`.
- **VPS SahamLens memakai Cloudflare Tunnel** (`sahamlens-prod` di zona `sahamlens.id`),
  jadi jalur yang benar adalah menambah public hostname `router.sahamlens.id` ke tunnel
  itu - BUKAN membuka port 80/443 dan memasang certbot. Potongan ingress-nya ada di
  `deploy/9router/cloudflared-ingress.yml`. Konsekuensinya: request tunduk pada batas
  100 detik Cloudflare (lewat itu balas 524), jadi `NINEROUTER_TIMEOUT_MS` harus tetap
  jauh di bawah itu.
- 9Router versi Docker bind ke `0.0.0.0`. Jangan buka port `20128` mentah ke internet -
  taruh di belakang reverse proxy HTTPS, dan biarkan dashboard-nya tidak publik
  (`AUTH_COOKIE_SECURE=true` + password kuat kalau memang harus dibuka).
- Kalau log produksi penuh `[AI:9router] ... HTTP 401`, key-nya salah/di-rotate di
  dashboard. `HTTP 404` biasanya berarti nama model di `NINEROUTER_MODELS` tidak ada di
  instance itu - cek `GET {base}/v1/models`, jangan menebak nama model (jebakan yang sama
  sudah pernah terjadi dengan katalog `:free` OpenRouter).
- Sebagian pemanggil (news intelligence, chat) mengirim `response_format:
  {"type":"json_object"}`. Model yang tidak mendukung mode JSON akan menolak request itu
  dan percobaan lanjut ke provider berikutnya - bukan bug, tapi kalau sering terjadi
  pilih model 9Router yang mendukung JSON mode supaya router-nya benar-benar terpakai.
- Sebelum memasang env var di Vercel, jalankan `npm run check:9router` di mesin dev
  (membaca `.env.local`). Skrip itu memeriksa `GET /v1/models`, memvalidasi tiap nama di
  `NINEROUTER_MODELS` terhadap katalog nyata, lalu mengirim satu request sungguhan.
- Smoke test setelah deploy: buka `/chat`, kirim satu pertanyaan, lalu cek log fungsi.
  Kalau jawaban keluar tanpa baris `[AI:9router]` yang gagal, routing sudah lewat 9Router.

### 2026-08-06 - Gerbang likuiditas ADV20 di backtest bucket + kolom return gross

**Masalah**: angka +4,15% pada bucket 80-100 dihitung dari SELURUH baris
`lens_radar_history`, termasuk hari-hari saat emitennya praktis tidak diperdagangkan.
Backtest tidak punya data volume sama sekali, jadi "return" dari saham yang tidak bisa
dibeli dalam ukuran wajar ikut masuk rata-rata.

**Perubahan**:

- Kolom baru `lens_radar_history.avg_value_20d` - ADV20 point-in-time (rata-rata
  `close x volume` 20 bar terakhir SAMPAI tanggal baris itu, memakai close mentah).
  Diisi `scripts/backfill-lens-history.mjs` untuk histori dan
  `history-archive.service.ts` untuk scan harian, yang meneruskan `adv20Idr` dari
  gerbang kelayakan agar backtest dan produk memakai satu angka likuiditas.
- `bucket-backtest.service.ts` dan `calibration.service.ts` membuang sinyal dengan
  ADV20 di bawah `ADV_HARD_FLOOR_IDR` (Rp 1 miliar/hari) - konstanta yang sama dengan
  gerbang kelayakan produk. Baris tanpa ADV20 juga dibuang dan dihitung terpisah
  (`unknown_liquidity_rows`), bukan diloloskan diam-diam sebagai likuid.
- Kolom baru `lens_bucket_stats.avg_t20_gross`, `illiquid_rows_skipped`,
  `unknown_liquidity_rows`. `avg_t20` TETAP angka bersih biaya (0,5% round-trip sudah
  dikurangkan di dalam `calculateForwardReturnPct`) - kolom gross ditambahkan supaya
  besar ongkos terhadap edge terlihat, bukan supaya ada dua definisi return T+20.
- Halaman /transparency memisahkan kolom Avg T+20 Gross dan Avg T+20 Net, dan
  menyebutkan berapa sinyal dibuang gerbang likuiditas.

**Hasil recalc `run_date` 2026-08-06** (26.917 baris, 109 ticker; 1.139 baris dibuang
karena ADV20 < Rp 1 M/hari, 244 baris DGWG.JK dibuang karena tidak punya ADV20 - emiten
itu ada di arsip tapi tidak ada di `BACKTEST_UNIVERSE`):

| Bucket | Avg T+20 gross | Avg T+20 net | Win rate | Max DD P95 | Trade terburuk | Sampel |
|---|---|---|---|---|---|---|
| 80-100 | +4,54% | +4,04% | 47,72% | -27,06% | -63,62% | 861 |
| 70-79 | +1,79% | +1,29% | 45,41% | -30,75% | -69,48% | 1.542 |
| 60-69 | +0,16% | -0,34% | 43,53% | -32,77% | -75,31% | 2.153 |
| <60 | +0,46% | -0,04% | 43,96% | -31,27% | -76,09% | 15.695 |

Gerbang likuiditas memangkas bucket 80-100 dari +4,15% ke +4,04%: edge-nya menyusut
0,11 poin persen, jadi angka lama bukan artefak saham sepi - tetapi sekarang klaimnya
bisa dipertanggungjawabkan.

**Caveat yang TIDAK diperbaiki oleh perubahan ini** (lihat laporan audit):
`fundamental_history` hanya punya snapshot 2026-01-30 untuk 4 emiten (ASII, BBCA, BBRI,
TLKM) dan snapshot 2026-08-06 untuk 109 emiten yang belum dipakai baris histori mana
pun. Karena `fundamentalAsOf()` benar-benar point-in-time (`observed_date <= tanggal
sinyal`) - tidak ada look-ahead - konsekuensinya seluruh backtest efektif menilai
LensScore versi teknikal+flow saja, bukan LensScore yang dikirim ke pengguna.

### 2026-08-06 - Fix Max Drawdown per bucket yang selalu -100%

**Gejala**: kolom Max Drawdown di Performa per Bucket LensScore menunjukkan -100,00%
untuk keempat bucket sekaligus.

**Bukan penyebabnya**: data kotor. Audit `lens_radar_history` (26.728 baris, 110 ticker)
menemukan nol baris dengan harga 0/NULL, nol baris di bawah tick minimum Rp50, dan
return T+20 terburuk hanya -78,86%. Tidak ada satu pun trade yang bisa membuat modal
habis.

**Penyebab sebenarnya**: `maxDrawdownPct` mengalikan seluruh return T+20 secara
berurutan seolah-olah satu modal berpindah dari trade ke trade. Sinyal LensRadar
tumpang tindih - ratusan ticker memberi sinyal di hari yang sama dan tiap trade T+20
masih berjalan saat sinyal berikutnya muncul - jadi 918 sampai 16.284 return dikalikan
beruntun. Volatility drag (`E[log(1+r)] < log(1+E[r])`) menekan equity ke nol pada
setiap bucket: total log-growth -5,4 (bucket 80-100) sampai -126 (bucket <60). Hasilnya
-100% terlepas dari kualitas sinyal. Fungsi yang sama diduplikasi di
`bucket-backtest.service.ts` dan `transparency.service.ts`.

**Perbaikan**: drawdown sekarang diukur per trade sebagai Maximum Adverse Excursion -
penurunan terdalam dari harga entry selama satu trade T+20 berjalan, memakai low harian
yang sudah disesuaikan corporate action. Dua angka disimpan, keduanya dari
`history-return-utils.ts` dan dipakai bersama oleh bucket-backtest dan transparency:

- `max_dd_p95` (`drawdownPercentile95Pct`) - persentil 95 dari besaran penurunan,
  nearest-rank. Ini yang ditampilkan di UI sebagai **Max DD (P95)**. Persentil diambil
  dari besaran, bukan dari nilai bertanda: mengurutkan drawdown negatif menaik lalu
  mengambil P95 justru mengembalikan trade yang nyaris tidak turun.
- `worst_mae` (`worstTradeDrawdownPct`) - satu trade terburuk. Statistik ekor, dipakai
  sebagai konteks di kolom **Trade Terburuk**.

Kolom `max_drawdown_t20` diganti nama jadi `worst_mae` lewat migrasi idempoten di
`schema.service.ts`. Baris `run_date` sebelum 2026-08-06 harus di-NULL-kan manual -
isinya nilai equity-curve lama, bukan MAE.

Drawdown level portofolio butuh position sizing dan aturan alokasi yang belum ada di
LensRadar. Sampai itu dibangun, jangan mengembalikan metrik equity curve di sini.

**Filter gocap**: ambang Rp50 hanya diuji pada `raw_close_price`. Harga
TOTAL_RETURN_ADJUSTED bisa sah berada di bawah 50 setelah faktor split dipakai mundur,
jadi memfilter harga adjusted akan menghapus histori yang valid.

**Angka setelah fix** (run_date 2026-08-06, 19.358 trade T+20, 0 dibuang):

| bucket | max_dd_p95 | worst_mae |
| --- | --- | --- |
| 80-100 | -26,49% | -63,62% |
| 70-79 | -30,79% | -69,48% |
| 60-69 | -32,31% | -75,31% |
| <60 | -30,87% | -76,09% |

Selisih P95 vs worst itu wajar: worst didorong APIC.JK yang jatuh dari 1730 ke 525 dalam
20 hari bursa dan BLUE.JK 6730 ke 3098. Avg T+1/T+5/T+20, Win Rate, dan Avg Win/Loss
tidak berubah.

**Recalc**: jalankan ulang `GET /api/cron/lens-bucket-backtest` dengan
`Authorization: Bearer $CRON_SECRET`. Upsert-nya memakai kunci `(run_date, bucket)`,
jadi tidak perlu DELETE manual. `TRANSPARENCY_CACHE_VERSION` dibump ke `drawdown-v2`
supaya payload Redis lama yang masih berisi -100% tidak bertahan sampai TTL habis.

### 2026-08-06 - Redesign UI 14 halaman ke design system "Lens"

Perubahan UI/UX menyeluruh. **Tidak mengubah cara build, env var, cron/QStash, atau
gating akses** - seluruhnya di lapisan render dan state komponen. Dicatat di sini
karena sudah masuk `main`/production (commit `91a2c05`, `8726ed7`, `b9b345b`).

- **Token warna diganti nilainya di tempat** di `tailwind.config.js` (nama token `tv-*`
  dipertahankan): bg `#0B0F19`, card `#12182B`, border `#1E293B`, blue `#3B82F6`,
  green `#22C55E`. Konsekuensinya SEMUA halaman ikut berubah warna lewat satu diff -
  termasuk halaman yang belum di-redesign. Hex hardcode di `app/globals.css`,
  `app/layout.tsx`, dan `components/Sidebar.tsx` ikut disesuaikan.
- **Font 4 unduhan jadi 2**: Inter (teks/heading) + JetBrains Mono (angka). Plus Jakarta
  Sans, Sora, dan Space Grotesk dilepas dari `next/font`. Catatan untuk agen berikutnya:
  aturan `.font-heading`/`.font-number` di `globals.css` datang SETELAH `@tailwind
  utilities`, jadi ia menang atas `fontFamily` di `tailwind.config.js`. Kalau mengganti
  font, ubah KEDUANYA - kalau tidak, config-nya diam-diam tidak berpengaruh (itu yang
  terjadi pada Space Grotesk sebelum perubahan ini).
- Komponen bersama baru di `components/ui/`: `MetricCard`, `LoadingFact`, `TickerAvatar`.
  `EmptyState` diperluas (illustration/progress/countdown), `Card` dapat alias `GlassCard`.
- Aturan `prefers-reduced-motion` global ditambahkan di `globals.css`.
- Tiga blok `<style>` scrollbar mati dihapus (`/dashboard`, `/fundamental`, `/compare`,
  `/breakout-radar`, `/backtest`) - warnanya dari palet lama dan sebagian kelasnya tidak
  pernah dipakai. Scrollbar global sudah ditangani `globals.css`.
- Gulir bersarang dihapus di `/breakout-radar`, `/compare`, `/backtest`: ketiganya dulu
  `flex h-screen` + anak `overflow-y-auto` di dalam `<main>` AppShell yang sudah
  menggulir. **Jebakan**: kalau menambah halaman baru, jangan buat kontainer gulir
  sendiri - AppShell sudah menyediakannya.
- Sejumlah perbaikan bug non-kosmetik ikut di dalamnya (state error yang hilang,
  pewarnaan yang terbalik, `useMemo` dengan dependensi kurang di `/calendar`, tombol
  debug "Test Cron" di `/watchlist` yang tidak pernah digerbangi `isAdmin`). Rinciannya
  ada di badan ketiga commit di atas.
- Smoke test setelah deploy: `/`, `/calendar`, `/transparency`, `/watchlist`,
  `/portfolio`, `/backtest` semua 200.
- Menyusul di commit `ee82359`: `/news`, `/admin`, `/admin/calibration`, dan
  `/admin/fundamental-backfill` - melengkapi seluruh 18 tujuan navigasi di sidebar.
  Tiga perubahan di sana punya dampak operasional, bukan sekadar tampilan:
  - `/admin` sekarang `robots: index:false` (sebelumnya mewarisi `index:true` dari
    root layout), dan kolom "Terakhir Aktif" dipaksa `timeZone: 'Asia/Jakarta'` -
    sebelumnya dirender di zona waktu SERVER (UTC di Vercel) sehingga meleset 7 jam.
    **Jebakan**: halaman Server Component yang memformat waktu WAJIB menyebut
    timeZone eksplisit; tanpa itu hasilnya ikut zona waktu mesin build/runtime.
  - `/admin/calibration` menyatakan status beku `THRESHOLD_RECOMMENDER_ENABLED=false`
    di muka. Kalau flag itu nanti dinyalakan kembali, tombolnya otomatis muncul lagi -
    tidak ada teks yang perlu diedit.
  - `/admin/fundamental-backfill` sekarang menolak Insert sebelum ada Dry Run yang
    lolos atas kombinasi masukan yang sama persis (CSV + source + percentInput +
    skipEmptyRows). Mengubah salah satu opsi membatalkan izin Insert.
- Halaman depan `/` (commit `426819c`) - awalnya TERLEWAT dari inventarisasi karena
  daftarnya disusun dari tujuan di sidebar, sedangkan `/` tidak ada di sidebar
  (AppShell memperlakukannya khusus, tanpa sidebar & TopMarketBar). **Jebakan untuk
  agen berikutnya**: "semua menu" tidak sama dengan "semua halaman" - `/` dan rute
  yatim lain (`/dcf`, `/moat`, `/pattern`, `/macro`, `/earnings`, `/dividend`,
  `/risk`, `/recommendations`, `/multi-agent`, `/market/[category]`) tidak pernah
  muncul di `components/Sidebar.tsx`.
  - Tiga fetch di halaman itu (`/api/public-chart`, `/api/live/^JKSE`,
    `/api/market-summary`) dulu berakhir di `.catch(console.error)` tanpa state
    kegagalan - satu-satunya halaman publik & terindeks, dan bisa tersangkut di teks
    "Memuat..." selamanya. Sekarang ketiganya punya jalur gagal masing-masing.

### 2026-08-06 - Admin UI Fundamental Backfill

- Halaman protected baru: `/admin/fundamental-backfill`.
- Menu admin/sidebar sekarang punya entry **Fundamental Backfill**.
- Admin bisa upload/paste CSV, klik **Dry Run**, lalu **Insert ke DB** tanpa terminal.
- API baru: `POST /api/admin/fundamental-backfill`, digerbang cookie admin yang sama
  dengan panel admin lain.
- Import tetap append-only ke `fundamental_history`:
  `ON CONFLICT (ticker, observed_date) DO NOTHING`.
- Checkbox `Lewati baris placeholder kosong` default aktif agar template besar bisa
  dipakai bertahap; baris kosong tidak diinsert, dan baris yang berisi angka invalid
  tetap ditolak.
- Tidak ada env var baru. Rollback: revert commit UI/API ini; data yang sudah masuk
  tetap bisa dihapus dengan filter tanggal+sumber spesifik jika memang diperlukan.

### 2026-08-06 - One-shot backfill fundamental_history point-in-time

- Script baru: `scripts/backfill-fundamental-history.mjs`.
- Cara jalan manual:
  - Dry-run dulu dari file CSV:
    `npm run backfill:fundamental-history -- --file=data/fundamental-awal-2026.csv --dry-run`
  - Eksekusi insert append-only:
    `npm run backfill:fundamental-history -- --file=data/fundamental-awal-2026.csv`
  - Jika satu file mewakili satu tanggal snapshot:
    `npm run backfill:fundamental-history -- --file=data/fundamental-awal-2026.csv --observed-date=2026-01-31 --source=IDX`
  - Opsi tambahan:
    `--format=csv|json`, `--tickers=BBCA.JK,TLKM.JK`, `--percent-input=percent|decimal`,
    `--source=<nama-sumber>`, `--skip-empty-rows`, `--dry-run`.
- Format kolom yang diterima: `ticker`, `observed_date`, `per`, `pbv`, `roe`, `der`,
  `current_ratio`, `revenue_growth`, `source`. Alias umum seperti `symbol`,
  `observedDate`, `publication_date`, `pe_ratio`, `priceToBook`, `returnOnEquity`,
  dan `revenueGrowth` juga diterima. Header CSV/JSON dibaca case-insensitive, jadi
  format Excel seperti `Kode`, `PER`, `PBV`, `ROE` tetap valid.
- Guard audit: `observed_date` wajib point-in-time, tidak boleh tanggal masa depan,
  dan minimal satu metrik harus terisi. Null tetap null; tidak diubah menjadi 0.
- Script **tidak** mengambil fundamental Yahoo hari ini untuk ditempel ke awal 2026.
  Backfill awal 2026 hanya sah jika file input berasal dari laporan/snapshot historis
  dengan tanggal publikasi/observed date yang bisa dipertanggungjawabkan.
- Template mass input tersedia di `data/fundamental-awal-2026-template-100-liquid.csv`.
  Isinya 100 ticker pertama dari universe likuid SahamLens plus DGWG yang ditambahkan
  manual; baris yang metriknya masih kosong adalah placeholder untuk diisi dari
  Excel/provider data, bukan untuk langsung di-import sebagai fundamental kosong.
  Jika template belum lengkap tapi ingin memproses baris yang sudah diisi, jalankan
  dengan `--skip-empty-rows`; tanpa flag ini, baris kosong tetap ditolak fail-closed.
- Insert ke `fundamental_history` idempoten dan append-only:
  `ON CONFLICT (ticker, observed_date) DO NOTHING`. Eksekusi ulang tidak menimpa
  angka lama, supaya audit trail point-in-time tidak berubah diam-diam.
- Env var: memakai `DATABASE_URL`; script akan load `.env.local` jika variabel belum ada.
- Rollback plan data: hapus hanya window dan sumber spesifik setelah verifikasi target,
  misalnya:
  `DELETE FROM fundamental_history WHERE observed_date BETWEEN <start> AND <end> AND source = <source>`.
  Jangan memakai delete luas tanpa filter tanggal+sumber.

### 2026-08-06 - LensRadar UI: breakdown skor komposit

- Halaman `LensRadar Live` (`/breakout-radar`) sekarang menampilkan kolom terpisah:
  `Total`, `Teknikal`, `Fundamental`, `Flow`, dan `Coverage`.
- Kolom `Total` tetap LensScore 0-100. `Teknikal` maksimum 40, `Fundamental` maksimum
  30, `Flow` maksimum 30, dan `Coverage` adalah porsi bobot skor yang punya data.
- Kolom lama `Rincian` diubah menjadi `Sinyal` agar label seperti `breakout`,
  `golden cross`, dan `akumulasi` tidak tercampur dengan angka coverage.
- Tidak ada perubahan formula scoring, API, database, cron, atau env var. Ini perubahan
  presentasi UI dari field yang sudah dikirim `/api/ai-pick`.

### 2026-08-06 - One-shot backfill LensRadar 1 tahun

- Script baru: `scripts/backfill-lens-history.mjs`.
- Cara jalan manual:
  - Dry-run satu/dua ticker dulu:
    `npm run backfill:lens-history -- --dry-run --tickers=BBCA.JK,TLKM.JK --skip-backtest`
  - Eksekusi penuh:
    `npm run backfill:lens-history`
  - Opsi tambahan:
    `--start=YYYY-MM-DD`, `--end=YYYY-MM-DD`, `--range=2y`,
    `--tickers=BBCA.JK,TLKM.JK`, `--skip-backtest`, `--score-version=<versi>`.
- Default mengambil universe 109 ticker dari `BACKTEST_UNIVERSE` dan fetch Yahoo Chart
  `range=2y`. Yang di-insert tetap window 1 tahun; ekstra 1 tahun hanya warm-up agar
  MA200/MACD/RSI tidak kosong di awal window.
- Script memakai require-hook lokal untuk memanggil fungsi TypeScript produksi:
  `calculateScore`, analyzer RSI/MACD, proxy flow, constant model version, price-basis
  guard, dan `runAndSaveLensBucketBacktest`. Ini sengaja agar rumus backfill tidak drift
  dari runtime.
- Fundamental historis **tidak di-backfill dari data hari ini**. Script hanya membaca
  `fundamental_history` dengan `observed_date <= tanggal sinyal`. Jika snapshot historis
  belum ada, input fundamental dikirim `null` dan coverage turun; ini mencegah look-ahead
  bias dan tidak membuat data dummy.
- Insert ke `lens_radar_history` idempoten dengan `ON CONFLICT (date, ticker) DO UPDATE`,
  termasuk metadata Fase 1/3: `score_version`, `valuation_version`, `signal_version`,
  `data_snapshot_version`, `calculation_timestamp`, `raw_close_price`,
  `adjusted_close_price`, `price_basis = TOTAL_RETURN_ADJUSTED`,
  `adjustment_factor`, `corporate_action_status`, `price_data_timestamp`,
  `price_data_version = price-adjustment-v1`.
- Setelah insert penuh, script otomatis menjalankan `runAndSaveLensBucketBacktest()` untuk
  mengisi `lens_bucket_stats`, kecuali diberi `--skip-backtest`.
- Cache `/api/transparency` dibump ke versi `backfill-v1` dan script akan menghapus
  key transparency setelah backtest selesai, supaya halaman publik tidak menampilkan
  payload lama `totalSamples=0` sampai TTL 30 menit habis.
- Env var: memakai `DATABASE_URL`; script akan load `.env.local` jika variabel belum ada.
- Rollback plan data: karena script upsert, rollback aman adalah restore dari backup/PITR
  atau hapus window spesifik secara eksplisit setelah menghitung target:
  `DELETE FROM lens_radar_history WHERE date BETWEEN <start> AND <end> AND score_version = 'lens-score-v1.3.0'`.
  Jangan pakai delete luas tanpa filter tanggal+versi.

### 2026-08-06 - Audit Ronde 3 Fase 3: Corporate Action & Price Basis

- Fase yang dikerjakan: **hanya Fase 3 - Corporate Action dan Konsistensi Price Basis**.
  Fase 1/2 tidak diubah kecuali kompatibilitas pembacaan histori yang sekarang membawa
  metadata basis harga.
- Kebijakan price basis:
  - `RETURN_PRICE_BASIS = TOTAL_RETURN_ADJUSTED` untuk forward return, calibration,
    bucket backtest, MA/RSI/MACD/momentum/market-flow return-based.
  - `TRADING_PRICE_BASIS = RAW` untuk harga display, support/resistance, ATR raw OHLC,
    tick/order level, dan chart tradable.
  - Yahoo `AdjClose` diperlakukan sebagai sumber adjusted provider untuk fase ini
    (`YAHOO_CHART_ADJCLOSE`, `price-adjustment-v1`). Jika adjusted price hilang,
    sistem fail-closed; tidak ada fallback `AdjClose ?? Close` di scoring path utama.
- Data model additive/idempotent di `shared/database/schema.service.ts`:
  `lens_radar_history` ditambah `raw_close_price`, `adjusted_close_price`,
  `price_basis`, `adjustment_factor`, `corporate_action_status`,
  `price_data_timestamp`, `price_data_version`; `lens_bucket_stats` ditambah
  `price_basis`, `price_data_version`.
- Histori LensRadar baru tetap mempertahankan `close_price` lama sebagai raw/display
  compatibility. Validasi/backtest baru hanya menerima row dengan
  `price_basis = TOTAL_RETURN_ADJUSTED` dan `adjusted_close_price` valid; legacy/unknown
  price basis tidak masuk sampel.
- `shared/market/price-basis.ts` menjadi guard bersama:
  normalisasi OHLC raw/adjusted, derivasi adjusted OHLC dari adjustment factor,
  `PriceBasisMismatchError`, status `MISSING_ADJUSTED_PRICE`,
  `INVALID_ADJUSTMENT_FACTOR`, `LEGACY_UNKNOWN_PRICE_BASIS`, dan corporate-action
  detector sebagai **[HIPOTESIS PENJAGA]**, bukan alat menebak rasio split.
- Endpoint/detail yang menampilkan analisis saham mulai membawa metadata `priceMeta`
  agar audit/debug/Ask AI tidak menyebut "harga" tanpa basis.
- Cache `/api/transparency` tetap versioned dan kini juga membawa `RETURN_PRICE_BASIS`
  + `PRICE_ADJUSTMENT_VERSION` dalam cache key.
- Sisa yang sengaja belum diubah di fase ini: beberapa endpoint context-only
  (`/api/chat`, `/api/council`, `/api/compare`) masih memiliki fallback `AdjClose ?? Close`
  untuk ringkasan/prompt, bukan validasi/backtest/scoring utama. Tandai untuk Fase 10
  Ask AI contract agar semua konteks harga punya basis eksplisit.
- Rollback plan: revert commit Fase 3. Kolom DB baru nullable/additive aman dibiarkan.
  Jika hard rollback DB diperlukan, drop hanya kolom/index price-basis baru setelah
  memastikan tidak ada consumer baru yang membacanya. Jangan menimpa/menghapus
  `close_price` lama karena itu raw audit trail.
- Tidak ada env var baru.

### 2026-08-06 - Audit Ronde 3 Fase 1: Model Versioning hardening

- Fase yang dikerjakan: **hanya Fase 1 - Model Versioning** dari
  `SAHAMLENS_AUDIT_KUANTITATIF_RONDE3_2026-08-05.md`.
- Default backtest/calibration sekarang hanya membaca `SCORE_VERSION` aktif
  (`lens-score-v1.3.0`). Baris legacy tanpa `score_version` dan baris versi lain ditolak
  secara fail-closed, bukan digabung diam-diam.
- Backtest menerima filter versi eksplisit:
  - Service cron: `calculateLensBucketStats(..., { scoreVersion })`.
  - Endpoint lama: `GET /api/lens-score-bucket-backtest?scoreVersion=<versi>`.
- Output analisis LensRadar sekarang membawa metadata audit versi:
  `scoreVersion`, `requestedScoreVersion`, `rejectedRows`, `unversionedRows`,
  `versionMixed`, `versionRejectedReason`.
- Cache publik `/api/transparency` ikut dibump menjadi cache key berbasis
  `SCORE_VERSION`. Ini penting agar Redis tidak menyajikan payload lama tanpa metadata versi
  setelah deploy Fase 1.
- `lens_bucket_stats` ditambah kolom idempoten `score_version` dan index
  `(score_version, run_date DESC)`. Snapshot stats terbaru dibaca per versi, bukan latest
  global lintas versi.
- Migration database mengikuti pola repo: additive/idempotent di
  `shared/database/schema.service.ts`, bukan file SQL terpisah (lihat aturan operasional di
  bagian bawah dokumen ini).
- Rollback plan: revert commit kode Fase 1. Kolom tambahan di Postgres aman dibiarkan karena
  nullable, additive, dan tidak mengubah primary key. Jika perlu hard rollback database manual,
  drop hanya `lens_bucket_stats.score_version` dan index
  `idx_lens_bucket_stats_score_version_run_date`; kolom versi di `lens_radar_history`
  sebaiknya tetap dipertahankan sebagai audit trail.
- Tidak ada env var baru.

### 2026-08-05 - Audit kuantitatif ronde 3: fail-closed validation & DCF bridge

- Validasi LensRadar diperketat:
  - Forward return T+1/T+5/T+20 sekarang memakai kalender hari bursa global, bukan indeks
    baris per ticker di `lens_radar_history`.
  - Observasi dengan gap harga harian >40% dalam window entry-exit dibuang sebagai mitigasi
    aksi korporasi/split yang belum punya adjusted close point-in-time.
  - T-test admin/transparency memakai sampel efektif non-overlap per ticker per 20 hari
    bursa, bukan sampel harian yang tumpang tindih.
  - Status produk LensRadar dipaksa `RESEARCH_ONLY`: p-value tetap ditampilkan untuk riset,
    tetapi flag/banner “tervalidasi” tidak boleh aktif sebelum uji out-of-sample tersedia.
- Equity curve `/transparency` Top 5 LensRadar sekarang compound per window 20 hari yang tidak
  tumpang tindih, bukan return 20-hari yang dikalikan setiap hari bursa.
- Cron `lens-bucket-backtest` memakai logika horizon/guard yang sama dengan calibration agar
  snapshot `lens_bucket_stats` tidak menyimpan statistik bias.
- `lens_radar_history` ditambah kolom versi model/audit trail secara idempoten:
  `score_version`, `valuation_version`, `signal_version`, `data_snapshot_version`,
  `calculation_timestamp`. Arsip harian baru menulis versi ini otomatis.
- Technical LensScore: volume 0 dinilai sebagai data valid dengan skor 0, bukan dianggap missing
  lalu bobotnya direnormalisasi.
- TP/CL LensRadar dibulatkan ke fraksi harga IDX dan RR dihitung ulang setelah pembulatan.
- DCF LensAI:
  - UI/backend tidak lagi melabeli `Rf + ERP` sebagai WACC aktual; sekarang disebut
    `discount_rate_pct` / cost-of-equity proxy.
  - DCF FCF menghasilkan enterprise value per share lalu dikurangi net debt per share sebelum
    menjadi fair value ekuitas. Jika data utang/kas tidak tersedia, DCF fail-closed sebagai
    `NO_BALANCE_SHEET_DATA`.
- Tidak ada env var baru.

### 2026-08-05 - Menu UI untuk Transparency & Calibration

- Sidebar sekarang menampilkan menu publik **Transparansi** (`/transparency`) di grup
  Intelligence, sehingga halaman validasi LensRadar tidak perlu dibuka manual lewat URL.
- Sidebar admin sekarang menampilkan **Kalibrasi LensRadar** (`/admin/calibration`) di grup
  Admin untuk role `admin`. Proteksi halaman tetap memakai `isAdminServer()`; link ini hanya
  menambah discoverability UI, bukan membuka akses baru.
- Sidebar juga membaca `GET /api/admin-status`, jadi admin yang masuk lewat
  `/admin-login/key?key=...` tetap melihat menu Admin meski tidak sedang login sebagai akun
  user ber-role `admin`.
- Tidak ada perubahan env var, dependency, cron, cache, atau schema database.

### 2026-08-05 - LensScore auto re-weight proposal (manual approval)

- Service baru `modules/lens-radar/service/lens-score-optimizer.service.ts`.
- Vercel Cron baru: `GET /api/cron/lens-score-optimizer`, schedule `0 11 * * 0` UTC =
  Minggu 18:00 WIB, protected dengan `CRON_SECRET`.
- Optimizer membaca `lens_bucket_stats` 90 hari terakhir untuk menentukan window validasi, lalu
  memakai histori point-in-time `lens_radar_history` yang punya breakdown komponen
  `technical_score`, `fundamental_score`, `flow_score` untuk simulasi bobot baru.
- Schema `lens_radar_history` ditambah kolom idempoten: `technical_score`,
  `fundamental_score`, `flow_score`, `coverage_pct`, `updated_at`.
- Cron `ai-pick-scan` sekarang mengarsipkan skor harian LensRadar ke `lens_radar_history`
  setelah menulis cache Redis, supaya optimizer punya data komponen real untuk run berikutnya.
- Tabel baru `lens_weight_proposals` menyimpan proposal bobot: baseline weights, proposed
  weights, spread T+20, p-value, jumlah sampel, status, reason, dan window 90 hari.
- Status proposal bisa `PENDING_APPROVAL`, `INSUFFICIENT_STATS`,
  `INSUFFICIENT_COMPONENT_HISTORY`, atau `NO_VALID_CANDIDATE`. Tidak ada perubahan otomatis ke
  bobot production; admin tetap harus approve/manual apply.
- `/admin/calibration` sekarang menampilkan kartu "Rekomendasi Bobot Baru" dari proposal terbaru.
- Tidak ada env var baru; reuse `CRON_SECRET` yang sudah diset untuk Vercel Cron.

### 2026-08-05 - Public Transparency Page LensRadar

- Halaman publik baru: `/transparency`, bisa diakses tanpa login.
- Endpoint publik baru: `GET /api/transparency`, tidak memakai gate Pro/admin, tetapi memakai
  cache Redis `LENS_TRANSPARENCY` 30 menit supaya pengunjung publik tidak memicu hitung ulang
  histori/Yahoo pada setiap request.
- Halaman menampilkan tabel bucket `80-100`, `70-79`, `60-69`, `<60` dari snapshot terbaru
  `lens_bucket_stats`: Avg T+1/T+5/T+20, Win Rate T+20, Total Sampel, Max Drawdown T+20,
  Avg Win T+20, Avg Loss T+20.
- Schema `lens_bucket_stats` ditambah kolom idempoten `max_drawdown_t20`, `avg_win_t20`,
  `avg_loss_t20`. Cron `lens-bucket-backtest` sekarang menghitung dan menyimpan metric ini
  dari return T+20 real; tidak ada data dummy.
- Equity curve publik dihitung dari `lens_radar_history` point-in-time: tiap tanggal sinyal
  ambil Top 5 LensRadar, entry Open H+1, exit T+20, biaya round-trip 0,5%, dibandingkan dengan
  IHSG (`^JKSE`) pada window entry/exit yang sama.
- Banner validasi:
  - `<90` hari validasi: kuning "Dalam masa pengumpulan data validasi".
  - `>=90` hari dan p-value Welch one-tailed `80-100 > <60` `<0.05`: hijau
    "Tervalidasi: Bucket 80-100 outperform signifikan".
  - selain itu: netral, data cukup panjang tapi belum signifikan.
- Disclaimer audit eksplisit: point-in-time, entry Open H+1, setelah fee 0,4% + slippage 0,1%,
  data sejak `startDate`, bukan nasihat investasi.
- Tidak ada env var baru. Pastikan cron `lens-bucket-backtest` jalan setelah deploy agar kolom
  metric baru di `lens_bucket_stats` terisi; sebelum itu halaman tetap fallback ke hitungan
  real on-demand bila snapshot metric baru masih null.

### 2026-08-05 - Admin Calibration Lab untuk LensRadar

- Halaman internal baru: `/admin/calibration`, protected dengan `isAdminServer()` dan redirect
  ke `/admin-login` kalau bukan admin.
- Admin Panel (`/admin`) sekarang punya link ke "LensRadar Calibration Lab".
- Endpoint admin baru:
  - `GET /api/admin/calibration` untuk data grafik bucket, t-test, dan simulasi threshold.
  - `POST /api/admin/calibration/recommend-threshold` untuk rekomendasi ambang via AI cascade
    (`generateAI`) dengan fallback rule-based bila semua provider gagal/limit.
- Service baru `modules/lens-radar/service/calibration.service.ts` menghitung observasi real dari
  `lens_radar_history` dan open H+1 Yahoo OHLC; tidak memakai dummy. Jika data T+20 belum cukup,
  UI menampilkan empty/insufficient-data state.
- Grafik batang menampilkan avg return T+20 bucket 80-100, 70-79, 60-69. Tabel t-test memakai
  Welch one-tailed t-test untuk hipotesis `80-100 > <60` dengan ambang signifikan p-value `<0.05`.
- Slider threshold 60-90 menunjukkan win rate T+20, jumlah sinyal, avg return T+20, dan delta
  vs baseline ambang 80.
- Tidak ada env var baru. Fitur AI memakai provider AI yang sudah ada (`GEMINI_API_KEY`,
  `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `KIMI_API_KEY`, `NVIDIA_API_KEY`) dan tetap punya fallback
  deterministic jika provider tidak tersedia.

### 2026-08-05 - Strategy Builder: Lens bucket stats via Vercel Cron

- Ditambahkan service `modules/lens-radar/service/bucket-backtest.service.ts` untuk validasi
  LensScore per bucket dari tabel real `lens_radar_history` (`date`, `ticker`, `lens_score`,
  `close_price`, `market_cap`).
- Bucket skor: 80-100, 70-79, 60-69, `<60`. Entry price memakai open H+1 dari OHLC Yahoo
  (`fetchYahooHistory`, sumber yang sudah dipakai layer teknikal), bukan close hari sinyal,
  untuk menjaga point-in-time dan mengurangi look-ahead bias.
- Forward return dihitung untuk T+1, T+5, T+20 dari entry H+1, lalu dikurangi biaya round-trip
  0,5% (fee 0,4% + slippage 0,1%).
- Output service: `{ bucket, avg_T1, avg_T5, avg_T20, winRate_T5, winRate_T20, totalSamples }`
  plus metadata run untuk penyimpanan/audit.
- Schema Postgres ditambah secara idempoten: guard tabel input `lens_radar_history` + kolom
  `market_cap`, dan tabel output `lens_bucket_stats` dengan primary key `(run_date, bucket)`.
- Endpoint cron baru: `GET /api/cron/lens-bucket-backtest`, job log
  `lens-bucket-backtest`, guarded dengan `CRON_SECRET`.
- `vercel.json` ditambahkan untuk Vercel Cron: `0 10 * * 1-5` UTC = 17:00 WIB Senin-Jumat.
- Env var baru yang wajib ada di Production: `CRON_SECRET` (sudah ditambahkan sebagai
  Sensitive env via Vercel CLI pada 2026-08-05). Tanpa ini, route sengaja membalas 401 supaya
  endpoint tidak bisa dijalankan publik.
- Tidak menambah dependency Python/yfinance baru; implementasi memakai fetch Yahoo Finance
  yang sudah ada di TypeScript agar tetap cocok dengan runtime serverless Vercel.

### 2026-08-05 - LensScore bucket backtest di LensRadar

- Ditambahkan service `modules/recommendation/service/lens-score-bucket-backtest.service.ts`
  yang membaca tabel `lens_radar_history` (`date`, `ticker`, `lens_score`, `close_price`)
  dan menghitung bucket 80-100, 70-79, 60-69, `<60`.
- Return dihitung dengan sinyal close T, entry di close H+1, horizon 1/5/20 hari bursa
  dari entry aktual, lalu dikurangi biaya round-trip 0,5% (fee 0,4% + slippage 0,1%).
- Output mencakup Avg Return, Win Rate, jumlah sampel, dan Welch t-test sederhana
  bucket 80-100 vs 60-69.
- Endpoint baru: `/api/lens-score-bucket-backtest`, gating sama seperti LensRadar
  (trial anonim aktif/login Pro).
- Halaman `/breakout-radar` menampilkan tabel validasi bucket sebagai pengganti pesan
  kuning bila histori LensRadar sudah lebih dari 90 hari kalender.
- Tidak ada env var baru. Perlu memastikan tabel production `lens_radar_history` benar-benar
  terisi harian; jika tabel belum ada, endpoint mengembalikan histori belum siap, bukan 500.

### 2026-08-05 - Brand icon scope di header SahamLens

- Ikon kecil di sebelah teks "SahamLens" pada landing header, auth shell, dan halaman
  market category diganti dari logo lama/kotak "SL" menjadi `public/sahamlens-scope.png`.
- Sidebar sudah memakai asset scope yang sama, jadi perubahan ini menyamakan identitas
  brand antar halaman.
- Tidak ada perubahan env var, dependency, cron, cache, atau aturan scoring.

### 2026-08-05 - LensRadar scanner tetap tampil saat advisory belum tervalidasi

- `/api/ai-pick` sekarang tetap mengirim ranking hasil scan data real sebagai scanner/pantauan
  walau `modelValidation.validated=false`.
- Ranking memiliki dua mode: `advisory` tetap fail-closed atas cache legacy, sedangkan
  `scanner` boleh menampilkan cache sesi terakhir tanpa `eligibilityStatus` bila
  `kategori`/`coverage` membuktikan data skor cukup.
- Guard validasi model tidak dihapus: response menambahkan `advisoryEnabled=false` dan `note`
  eksplisit bahwa LensRadar belum boleh dibaca sebagai rekomendasi beli/jual.
- Beranda mengubah panel dari "Rekomendasi LensRadar" menjadi "Pantauan LensRadar" dan
  menampilkan catatan validasi model supaya pengguna tidak melihat panel kosong tanpa sebab.
- Empty-state "Proyeksi Level Harga" diperjelas: jika top scanner ada tetapi TP/CL kosong,
  berarti belum ada setup TP/CL valid dengan RR minimal 1,5 atau cache sesi terakhir belum
  berisi setup valid, bukan data dummy yang disembunyikan.
- `/breakout-radar` ikut diselaraskan menjadi halaman scanner/pantauan, bukan wording
  rekomendasi aksi.
- Smoke test yang perlu dicek setelah deploy Ready:
  - `/api/ai-pick` harus mengembalikan `items` kalau cache skor berisi saham lolos ranking,
    dengan `advisoryEnabled=false` selama LensScore belum tervalidasi.
  - `/` harus menampilkan "Pantauan LensRadar" dan daftar top scanner bila API berisi item.

### 2026-08-05 - Quant/data integrity audit (`23e8229`)

- Commit `23e8229 Audit SahamLens quant data integrity` sudah dipush ke `origin/main`.
- Auto-deploy Vercel seharusnya terpicu dari push ke `main` sesuai pola yang sudah terverifikasi.
  Status Ready production **tetap harus dicek** dengan `npx vercel ls` setelah push.
- Validasi lokal sebelum push:
  - `npm.cmd run typecheck` lulus.
  - `npm.cmd test` lulus: 51 file, 423 test.
  - `npm.cmd run build` lulus.
  - `git diff --check` bersih.
- Perubahan operasional penting:
  - AI Pick/Breakout kini fail-closed untuk setup trading: TP/CL hanya muncul kalau setup
    struktur + ATR punya RR minimal 1.5.
  - LensScore tetap ditahan sebagai rekomendasi aksi sampai validasi model point-in-time
    tersedia (`modules/validation/service/lens-score-validation.service.ts`).
  - Endpoint fundamental kini mengirim `dataQuality` berbasis identity checks PER/PBV/ROE.
  - `estimateFullDayVolume()` memakai profil intraday U-shape konservatif, bukan linear.
  - Backtest limitation menambahkan catatan restatement AdjClose/corporate action.
- Smoke test yang perlu diprioritaskan setelah deployment Ready:
  - `/api/ai-pick` harus boleh kosong dengan `modelValidation.validated=false`, bukan error.
  - `/api/fundamental/BBCA.JK` harus menyertakan field `dataQuality`.
  - `/api/daily-picks` harus tetap respons, termasuk kategori `relativeStrength`.
  - `/breakout-radar` harus tetap render walau setup TP/CL null untuk sebagian saham.

## Cara deploy (jalur utama: otomatis dari push)

**Deploy production TIDAK dilakukan manual.** Satu-satunya jalur normal adalah push ke `main`.

1. Lolos check dulu di lokal - sama persis dengan yang dijalankan CI, jadi kegagalan
   ketahuan sebelum masuk antrean deploy:
   ```
   npm run typecheck
   npm run lint
   npm test
   npm run build
   ```
2. Commit & push ke `main` (lewat PR atau langsung). Sisanya berjalan sendiri:

   ```
   push ke main
     -> workflow "CI" (.github/workflows/ci.yml): typecheck + lint + test, lalu build
     -> workflow "Deploy VPS" (.github/workflows/deploy-vps.yml) - dipicu workflow_run
        HANYA kalau CI conclusion == success DAN head_branch == main
     -> SSH ke VPS sebagai user `lens`, menjalankan satu perintah: `deploy`
     -> production hidup dengan kode baru
   ```

   Yang perlu diketahui tentang rantai ini:
   - **CI merah = tidak ada deploy.** Itu memang gerbangnya. Jangan akali dengan deploy manual;
     perbaiki dulu penyebab merahnya.
   - Job `build` di CI ber-`continue-on-error: true` (butuh secret `JWT_SECRET_KEY`/`DATABASE_URL`),
     jadi **CI bisa "success" walaupun build gagal** - dan itu tetap memicu Deploy VPS. Build yang
     menentukan terjadi di server. Ini kenapa langkah 1 tidak boleh dilewat: `npm run build`
     yang merah di lokal akan merah juga di VPS, tapi baru ketahuan setelah deploy jalan.
   - **Skrip `deploy` ada di VPS, bukan di repo** - sebuah executable di PATH user `lens`
     (mis. `/usr/local/bin/deploy`). Isinya tidak ikut ter-review di repo ini; kalau perlu tahu
     persis apa yang dijalankannya, baca file itu di server. Kalau step SSH keluar dengan kode
     127 artinya skrip itu hilang/tidak executable - alias di `~/.bashrc` TIDAK berlaku untuk
     SSH non-interaktif.
   - Kalau skrip itu gagal di tengah jalan, workflow ikut merah dengan kode exit skripnya
     (bukan 255) - artinya masalahnya **di server**, bukan di koneksi. Jangan asumsikan
     production sudah ter-update: cek `journalctl -u sahamlens` dan commit yang aktif di
     `/opt/sahamlens/app`.
   - `concurrency: sahamlens-production-vps` dengan `cancel-in-progress: false` - dua push
     berdekatan dideploy berurutan, tidak saling membunuh.
3. Pantau di tab **Actions** repo GitHub (`CI` lalu `Deploy VPS`). Langkah SSH sengaja
   menerjemahkan exit code jadi kalimat (127 / 255 / lainnya), jadi baca pesan errornya -
   jangan menebak.
4. Smoke test setelah "Deploy VPS" hijau. Session adalah JWT bertanda tangan
   (`shared/auth/session.ts`), jadi cookie tidak bisa dipalsukan lewat `-H "Cookie: ..."`;
   smoke test tanpa login memang cukup karena anonymous trial aktif otomatis (lihat "Gating akses"):
   ```
   curl -s -o /dev/null -w "%{http_code}\n" https://sahamlens.id/
   curl -s -o /dev/null -w "%{http_code}\n" https://sahamlens.id/technical/DGWG.JK
   curl -s "https://sahamlens.id/api/screener?profile=Moderat" | head -c 300
   curl -s https://sahamlens.id/api/health
   ```
   Jalur admin harus lewat browser (butuh redirect + cookie httpOnly):
   `https://sahamlens.id/admin-login/key?key=<ADMIN_SECRET_KEY>`, baru buka `/admin`.

### Jalur darurat (manual di VPS) - hanya kalau GitHub Actions tidak bisa dipakai

Pakai ini kalau Actions sedang down, secret SSH rusak, atau perlu rollback cepat. Bukan
kebiasaan harian - kalau dipakai, catat alasannya di "Log perubahan deployment".

```bash
ssh lens@<VPS_HOST>
cd /opt/sahamlens/app
git pull
npm ci
npm run build
sudo systemctl restart sahamlens
```

Bisa juga jalankan ulang deploy tanpa commit baru: buka Actions -> **Deploy VPS** ->
**Run workflow** (`workflow_dispatch`). Ini melewati gerbang CI, jadi pastikan `main` memang sehat.

Perintah diagnosa di server:

```bash
systemctl status sahamlens
journalctl -u sahamlens -n 200 --no-pager     # log aplikasi (pengganti Vercel Functions log)
journalctl -u sahamlens -f                    # ikuti live
sudo nginx -t && systemctl status nginx
systemctl list-timers | grep -i sahamlens     # cek cron systemd
```

Rollback: `git -C /opt/sahamlens/app checkout <commit-lama> && npm ci && npm run build &&
sudo systemctl restart sahamlens`. Ingat bahwa checkout ke commit lama membuat server berada
di detached HEAD - deploy otomatis berikutnya (`git pull`) bisa gagal sampai dikembalikan ke
`main`. Rollback yang lebih bersih: `git revert` di GitHub, biarkan pipeline yang menerbitkannya.

### Secret GitHub yang dipakai pipeline

Di Settings -> Secrets and variables -> Actions. Kalau salah satu hilang, "Deploy VPS" gagal di
langkah pertama dengan pesan yang menyebut nama secret-nya (langkah itu sengaja hanya mencetak
ada/tidak, tidak pernah nilainya).

| Secret | Wajib | Isi |
| --- | --- | --- |
| `VPS_SSH_KEY_B64` | ya (salah satu) | Private key OpenSSH milik deploy user, di-base64: `base64 -w0 < ~/.ssh/id_ed25519`. **Disarankan** - secret multi-baris gampang rusak akhiran barisnya. |
| `VPS_SSH_KEY` | ya (salah satu) | Alternatif: isi private key mentah, termasuk baris BEGIN/END. Bukan `.pub`, bukan `.ppk`, dan tidak boleh ber-passphrase (BatchMode tidak bisa mengetiknya). |
| `VPS_KNOWN_HOSTS` | ya | Keluaran `ssh-keyscan -p <PORT> <HOST>`. **Berubah kalau server dibangun ulang** - kalau tiba-tiba semua deploy gagal exit 255 setelah server diutak-atik, curigai ini dulu. |
| `VPS_HOST` | ya | Host/IP VPS. |
| `VPS_PORT` | tidak | Kosong = 22. |
| `JWT_SECRET_KEY`, `DATABASE_URL`, `ADMIN_SECRET_KEY` | tidak | Hanya untuk job `build` di CI (yang `continue-on-error`). Tidak ada hubungannya dengan env production - itu ada di `.env.production` di VPS. |

Kunci publik pasangan `VPS_SSH_KEY*` harus ada di `~lens/.ssh/authorized_keys` di VPS.

## ⚠️ Jebakan yang sudah pernah bikin deploy gagal

**Jangan kembalikan blok `crons` ke `vercel.json`** (kejadian 2026-08-12, commit `2a64988`).
Cron sudah dipindah ke VPS dan dihapus dari dashboard Vercel - tapi muncul lagi sendiri, karena
Vercel Cron BUKAN state dashboard: ia dibaca ulang dari `vercel.json` **setiap deployment**, dan
Vercel masih auto-deploy tiap push ke `main`. `CRON_SECRET` juga masih ada di environment Vercel,
persis header yang dikirim Vercel Cron - jadi dua job (`lens-bucket-backtest`,
`lens-score-optimizer`) benar-benar lolos otentikasi dan menulis ke database Neon yang sama
dengan VPS. Yang berbahaya `lens-score-optimizer`: dua run atas data identik menghasilkan dua
proposal bobot, dan halaman kalibrasi membaca "proposal terbaru". `vercel.json` sekarang hanya
berisi `$schema`, dan itu memang isinya yang benar.

**Kalau menambah/mengubah cron, tanya dulu penjadwalnya siapa** (kejadian 2026-08-12, commit
`8dfbe94` lalu diperbaiki `72034df`). Ada yang mengganti handler `GET` jadi `POST`-only + verifikasi
signature QStash pada `lens-bucket-backtest` dan `lens-score-optimizer`, dengan asumsi QStash sudah
jadi satu-satunya penjadwal. Kenyataannya 9 job di QStash dan **3 job di systemd timer** - dan dua
job itu termasuk yang systemd. Akibatnya systemd dapat 405 dan job mati **tanpa jejak di aplikasi**:
Bucket Backtest cuma berhenti ter-update, proposal bobot cuma berhenti muncul. Pola yang benar
sudah ada di repo: `GET` + `CRON_SECRET` untuk systemd, `POST` + signature untuk QStash, dua-duanya
hidup berdampingan di route yang sama.

**`output: 'standalone'` di `next.config.mjs` - guard `process.env.VERCEL` jangan dihapus.**
Riwayatnya: opsi ini ditambahkan untuk `Dockerfile`, dan sempat membuat 4 deploy Production
Vercel gagal berturut-turut (~7 jam, 2026-08-05) karena mode standalone melewatkan
`.next/next-server.js.nft.json` yang dibaca pipeline Vercel setelah `next build` selesai - build
sukses penuh, lalu `ENOENT` di step terakhir. Fix-nya `output: process.env.VERCEL ? undefined : 'standalone'`.
**Yang berubah setelah pindah VPS**: di VPS `VERCEL` tidak di-set, jadi build production
SEKARANG selalu standalone, sementara systemd menjalankan `npm start` (`next start -H 0.0.0.0 -p 3001`).

**Konsekuensinya ada peringatan yang MUNCUL TIAP START dan bukan tanda kerusakan** (diverifikasi
langsung 2026-08-13 dengan menjalankan build production apa adanya):

```
⚠ "next start" does not work with "output: standalone" configuration.
  Use "node .next/standalone/server.js" instead.
```

Meskipun begitu, server tetap melayani request dengan benar - diuji lewat `POST /api/chat` yang
membalas normal. Jadi kalau menemukan baris ini di `journalctl -u sahamlens`, **jangan
mengubah `ExecStart` hanya karena peringatan itu**: ia sudah ada sejak sebelum masalah apa pun
yang sedang dicari, dan mengganti perintah start di tengah insiden justru menambah satu variabel
baru. Kalau memang mau dirapikan (mis. supaya log bersih atau image lebih ramping), itu
perubahan tersendiri yang harus diuji di luar jam ramai: ganti `ExecStart` ke
`node .next/standalone/server.js` DAN pastikan `.next/static` + `public/` ikut tersalin ke
`.next/standalone/` - dua folder itu tidak ikut otomatis, dan tanpanya aplikasi tetap jalan
tapi seluruh CSS/gambar hilang.

Kalau mengubah `output` atau perintah start, verifikasi langsung di server
(`systemctl status sahamlens` + `curl localhost:3001`), jangan mengandalkan build lokal saja.

---

Dua jebakan berikut berasal dari era deploy Vercel lewat CLI. **Sudah tidak relevan untuk jalur
deploy sekarang** (VPS build sendiri dari git checkout, tidak ada upload working directory),
disimpan sebagai riwayat:

**[HISTORIS - era Vercel CLI] Folder `mobile/` (React Native app terpisah, ~469MB) bikin deploy CLI gagal** dengan error
`File size limit exceeded (100 MB)`. Penyebab: `mobile/android/.gradle/.../executionHistory.bin`
(141MB) dan `mobile/android/app/build/outputs/apk/release/app-release.apk` (66MB) - keduanya
sudah di-`.gitignore` (gak ke-push ke GitHub), TAPI `vercel --prod` CLI meng-upload dari working
directory lokal dan **tidak menghormati `.gitignore`**, cuma menghormati `.vercelignore`.

Fix-nya sudah ada di `.vercelignore` (root repo) yang exclude `mobile/` + beberapa script test.
**Jangan hapus/skip `.vercelignore` ini**, dan kalau nambah folder besar baru yang gak perlu
ikut ke-deploy, tambahkan di sana juga.

---

**`eslint-config-next` versi harus align sama `eslint`** - upgrade Next.js 14→16 (2026-08-04) naikin
`eslint-config-next` ke `^16.3.0` yang butuh peer `eslint@>=9`, tapi `eslint` devDependency dibiarkan
`^8.57.0`. **Masih relevan di jalur VPS**: CI (`npm ci`) dan VPS sama-sama install bersih tanpa
cache `node_modules` lokal, jadi resolusi peer-dep gagal keras di sana meskipun mesin dev lokal
masih punya install lama yang "kelihatan" jalan.
Fix sementara: root `.npmrc` isi `legacy-peer-deps=true`. **Perbaikan jangka panjang yang lebih
benar**: upgrade `eslint` ke `^9` + migrasi `.eslintrc.json` ke flat config `eslint.config.mjs`
(ESLint 9 default-nya tidak baca `.eslintrc.*` lagi) - belum dikerjakan, `.npmrc` cuma nge-relax
resolusi peer-dep, bukan benerin akar masalahnya.

## Environment variables production (di VPS, bukan di Vercel)

**Sumber kebenaran env production = `/opt/sahamlens/app/.env.production` di VPS**
(dibaca systemd lewat `EnvironmentFile=`, plus 3 baris `Environment=` inline di unit).
`next start` membaca env server-side saat runtime, jadi menambah var **tidak perlu build ulang** -
cukup restart:

```bash
sudo nano /opt/sahamlens/app/.env.production     # tambah/ubah var
sudo systemctl restart sahamlens
journalctl -u sahamlens -n 50 --no-pager         # pastikan naik bersih
```

Auto-deploy **tidak pernah menulis file ini**. Jadi kalau fitur baru butuh env var, deploy-nya
sukses tapi fiturnya mati sampai ada orang yang menambahkannya di server secara manual.

Env var di dashboard Vercel **tidak berpengaruh ke pengguna** (Vercel cuma standby). Perintah
`npx vercel env add/ls` di bawah ini hanya relevan kalau ada alasan khusus mengurus standby itu;
untuk production, edit `.env.production`.

Klasifikasi REQUIRED / OPTIONAL / LEGACY di bawah berasal dari audit BUILD 002 (2026-08-03,
grep pemakaian di source) dan diperbarui saat migrasi VPS:

**REQUIRED** (app tidak berfungsi penuh tanpa ini):
| Var | Dipakai untuk |
|---|---|
| `DATABASE_URL` | Postgres (Neon, tetap eksternal) - portfolio, watchlist, alert, macro_indicators, job_run_log, lens_bucket_stats. Kode HANYA baca `DATABASE_URL` (`shared/config/env.ts`). Var alias Neon lain (`POSTGRES_URL_NON_POOLING`, `PGHOST_UNPOOLED`, dst) dulu di-inject otomatis oleh integrasi Neon-Vercel; di VPS tidak ada yang meng-inject apa pun, dan tidak ada kode yang membacanya. |
| `REDIS_URL` | Cache (`shared/cache/redis-cache.ts` lewat klien `shared/cache/redis-local.ts`). **Sejak 2026-08-13 Redis jalan di VPS**, bukan Upstash REST lagi - `UPSTASH_REDIS_REST_URL`/`TOKEN` sudah tidak dibaca kode manapun. Kalau `REDIS_URL` kosong/Redis mati, semua fungsi cache degrade aman ke cache-miss (tidak crash), tapi jauh lebih lambat & Yahoo Finance kena request lebih sering. Cek cepat: `curl -s localhost:3001/api/health`. |
| `QSTASH_TOKEN` / `QSTASH_URL` / `QSTASH_CURRENT_SIGNING_KEY` / `QSTASH_NEXT_SIGNING_KEY` | Cron scheduler QStash untuk mayoritas job lama, lihat bagian "Jadwal QStash" di bawah. |
| `CRON_SECRET` | Proteksi 3 job yang dijadwalkan **systemd timer di VPS** (`lens-bucket-backtest`, `lens-score-optimizer`, `broker-summary-scan`). Timer memanggil `GET` dengan header `Authorization: Bearer <CRON_SECRET>`; tanpa var ini route balas 401 by design. Nilai di `.env.production` harus sama persis dengan yang dipakai skrip timer. **Catatan penting: var ini juga masih ada di environment Vercel** - itulah sebabnya blok `crons` di `vercel.json` berbahaya (lihat Jebakan). |
| `JWT_SECRET_KEY` | Session login email/password (`shared/auth/session.ts`, `jose`). |
| `ADMIN_SECRET_KEY` | Jalur darurat login admin (`/admin-login/key?key=...`) - password admin utama disimpan sebagai hash di tabel `admin_secret` (database), bisa diganti sendiri lewat `/admin` tanpa deploy ulang. Di VPS nilainya bisa dibaca dari `.env.production` (root/`lens`); simpan juga di `.env.local` lokal (gitignored). |
| `NINEROUTER_BASE_URL` / `NINEROUTER_API_KEY` | Gateway AI 9Router - lihat log perubahan 2026-08-13 dan `docs/operations/9ROUTER.md`. Opsional secara fungsional (cascade lama tetap jalan), tapi kalau salah satunya diisi tanpa yang lain, provider ini sengaja dilewati. |
| `GEMINI_API_KEY` | AI cascade (`lib/aiProviders.ts generateAI()`) - tanpa ini fallback ke heuristik rule-based per fitur (Council lokal, sentimen kata kunci, dst), BUKAN error. |

**OPTIONAL** (fitur spesifik degrade dengan aman kalau kosong):
| Var | Dipakai untuk |
|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_DSN` | Error tracking (`@sentry/nextjs`). |
| `SMTP_EMAIL` / `SMTP_PASSWORD` | Kirim email (reset password, dst - `nodemailer`). |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | **BUKAN login Telegram** (itu sudah dihapus total) - dipakai `lib/telegram.ts sendTelegramMessage()`, satu-satunya pemanggil `app/api/payment/notify/route.ts` (notifikasi ke admin saat ada bukti bayar manual masuk). |
| `NEXT_PUBLIC_PAYMENT_*` (BANK_ACCOUNT_NAME/NUMBER, BANK_NAME, GOPAY_NAME/NUMBER, DANA_NAME/NUMBER) | Metode pembayaran manual di `PaywallModal` (`shared/config/payment.ts`). Baris otomatis disembunyikan kalau salah satu metode belum diisi. |

**LEGACY - tidak dibaca kode manapun:**

- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` - digantikan `REDIS_URL` (migrasi
  2026-08-13). Kalau masih tercantum di `.env.production`, isinya tidak berpengaruh; hapus saja
  supaya tidak ada yang mengira cache masih di Upstash. (`.env.example` masih memuat nama lama -
  jangan dijadikan acuan.)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
  (sisa rencana Supabase yang tidak pernah dipakai), `ADMIN_TELEGRAM_ID`,
  `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` (sisa login Telegram yang sudah dihapus total - beda dari
  `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` di atas yang MASIH dipakai untuk notifikasi
  pembayaran). Sudah dihapus dari Vercel 2026-08-03 setelah diverifikasi 0 pemakaian di kode.

`INTERNAL_API_SECRET` (`shared/auth/internal-service.ts`, dipakai cron/alert evaluation supaya
panggilan server-to-server ke `/api/stock`, dst bisa lewati gate session) - status di
`.env.production` **belum pernah diverifikasi ulang setelah pindah VPS**. Kalau menyentuh alur
cron/alert, cek dulu di server: `sudo grep -c INTERNAL_API_SECRET /opt/sahamlens/app/.env.production`.

## Kapasitas VPS dan beban cron terukur (baseline 2026-08-13)

Spesifikasi: AMD Ryzen Threadripper 5965WX (24 core / 48 thread di silikonnya; alokasi VPS
16 vCPU), RAM 16 GB, SSD 200 GB. Redis ikut di box ini; Postgres (Neon) dan Sentry tetap
eksternal.

**Seluruh kerja cron sehari: 36 menit dari 1440.** Itu 2,5% dari SATU core. Diukur dari
`finished_at - started_at` di `job_run_log`, 13 Agustus, bukan taksiran:

| Job | Run/hari | Rata-rata | Terlama | Total/hari |
|---|---|---|---|---|
| `ai-pick-scan` | 23 | 44,9 s | 53,6 s | 17,2 mnt |
| `market-summary` | 84 | 4,2 s | 12,6 s | 5,9 mnt |
| `breakout-scan` | 84 | 3,0 s | 8,3 s | 4,2 mnt |
| `lens-bucket-backtest` | 1 | 213,4 s | 213,4 s | 3,6 mnt |
| enam job sisanya | 150 | < 4 s | 28,6 s | 4,1 mnt |

Kesimpulan sizing: **bottleneck-nya bukan CPU dan bukan RAM.** Job terberat (`ai-pick-scan`)
memakai 45 detik tiap 15 menit - duty cycle 5% di satu core. Yang terlama
(`lens-bucket-backtest`, 3,5 menit) jalan sekali sehari. Tidak ada satu pun job yang mendekati
jendela jadwalnya sendiri.

Ini juga menjelaskan kenapa Vercel jebol sementara box ini santai: yang meledak di sana bukan
komputasinya, tapi **model tagihan per-invocation**. 352 pemanggilan cron per hari plus setiap
request yang meleset dari cache dihitung sebagai function execution, dan `getMarketSummary()`
men-scan 250 saham. Beban komputasi yang sama persis di VPS biayanya rata.

Yang justru perlu diawasi, dan tidak satu pun soal ukuran mesin:

- **Tidak ada redundansi.** Vercel memberikannya gratis. Sekarang satu box mati = situs mati.
  Ini penurunan nyata yang ditukar dengan biaya rata - sadari, jangan lupakan.
- **Redis satu box dengan app.** Kalau persistence belum menyala, reboot mengosongkan cache dan
  request pertama sesudahnya menanggung scan 250 saham penuh. Tidak fatal (`redis-cache.ts`
  degrade aman ke cache-miss), tapi terasa oleh pengunjung pertama.
- **Disk lebih mungkin habis oleh log daripada oleh data.** Penyebab kematian VPS paling klasik.
  Yang menumpuk: journald, log nginx, image Docker 9router, dan build `.next` lama kalau skrip
  `deploy` tidak membersihkannya. Cek berkala: `df -h /`, `journalctl --disk-usage`,
  `docker system df`.
- **Tidak ada autoscale.** Lonjakan trafik menabrak box tetap.

Belum diukur: RSS proses Next.js, memori Redis terpakai, dan waktu respons endpoint di VPS
(angka lama yang beredar semuanya dari Vercel, sudah tidak relevan). Kalau sudah diukur, tulis
di sini beserta tanggalnya.

## Arsitektur data (sudah bukan Supabase/JSON lokal lagi)

Satu layer penyimpanan: **Postgres (Neon)**, diakses lewat `pg` (bukan ORM), tabel dibuat
idempoten (`CREATE TABLE IF NOT EXISTS`) oleh `shared/database/schema.service.ts` saat boot -
`portfolios`, `holdings`, `transactions`, `watchlists`, `alerts`, `macro_indicators`,
`job_run_log`, dst. Data PERSISTEN antar cold start Vercel (beda total dari arsitektur lama yang
cuma in-memory/file JSON dan hilang tiap cold start).

Cache Redis (di VPS sendiri lewat `REDIS_URL`, bukan Upstash - lihat tabel env di atas)
terpisah dari database - murni cache hasil hitungan (screener universe,
market summary, AI Pick scores, dst), TTL terpusat di `shared/cache/ttl-policy.ts`. Redis gagal/
belum dikonfigurasi = degrade aman ke cache-miss, tidak pernah menggagalkan request user.

## Gating akses (auth email/password, bukan Telegram lagi)

Login sekarang email/password biasa (`app/signup`, `app/login`) - JWT session lewat
`shared/auth/session.ts getSession()`. Akses fitur Pro dicek per-route lewat
`checkProAccessLive(session)`, BUKAN blanket 429 untuk semua non-login seperti dulu.

Pengunjung TANPA login (anonim) tetap dapat akses trial 7 hari otomatis
(`shared/auth/anonymous-trial.ts readOrIssueAnonymousTrial()`) untuk sebagian besar fitur
berbayar (Backtest, Recommendations, dst) - baru setelah trial habis, endpoint balas 402
`SUBSCRIPTION_REQUIRED` dan frontend menampilkan `<PaywallModal>`. Halaman itu sendiri (route
Next.js) TIDAK di-gate login sama sekali (`middleware.ts PROTECTED_PAGES = []`) - siapa pun bisa
buka URL-nya, cuma data dari API yang digerbang. Ini SUDAH sesuai prinsip "Page = Public,
Premium Data/API = Protected" (BUILD 002).

Admin: satu sumber kebenaran `isAdminServer()`, cookie `sahamlens_admin` (`ADMIN_COOKIE` di
`shared/constants/cookie-names.ts`) - login lewat `/admin-login/key?key=<ADMIN_SECRET_KEY>` atau
password admin di database (bisa diganti sendiri lewat `/admin`). Tidak ada lagi Telegram Login
Widget atau dua-skema-cookie-yang-gak-nyambung seperti versi arsitektur sebelumnya.

## File yang jangan diubah tanpa alasan kuat

- `vercel.json` - **harus tetap hanya berisi `$schema`**. Menambah blok `crons` menghidupkan
  penjadwal kedua yang menulis ke database yang sama (lihat Jebakan).
- `.github/workflows/deploy-vps.yml` - satu-satunya jalur deploy production. Perhatikan
  indentasi: pernah ada langkah yang menjorok lebih dangkal dari `steps:` sehingga SELURUH file
  gagal di-parse, dan gejalanya menyesatkan - run muncul bernama `.github/workflows/deploy-vps.yml`
  (bukan "Deploy VPS") dengan NOL job, tanpa satu pun pesan yang menyebut indentasi.
- `.github/workflows/ci.yml` - gerbang yang memicu deploy. Kalau nama workflow `CI` diubah,
  ubah juga `workflows: ["CI"]` di deploy-vps.yml, kalau tidak deploy berhenti dipicu diam-diam.
- `config/scheduled-jobs.json` - inventori cron; `npm run audit:cron` gagal kalau drift.
- `.vercelignore` - hanya relevan untuk build standby Vercel (lihat jebakan historis).
- `shared/database/schema.service.ts` - satu-satunya sumber definisi skema Postgres, idempoten.
  Kalau nambah tabel baru, tambahkan `CREATE TABLE IF NOT EXISTS` di sini, jangan bikin file SQL
  terpisah yang tidak pernah dijalankan (pelajaran dari `supabase/schema.sql`, dihapus 2026-08-03
  karena sudah lama superseded dan tidak direferensikan kode manapun).

## Penjadwal cron: dua tempat, tidak boleh tiga

Ada **12 route cron** di `app/api/cron/*`, dijalankan oleh **dua** penjadwal. Inventori
kanoniknya di `config/scheduled-jobs.json`, dijaga `npm run audit:cron`.

| Penjadwal | Jumlah | Cara memanggil | Guard |
|---|---|---|---|
| systemd timer di VPS | 3 | `GET` ke `https://sahamlens.id/api/cron/...` | header `Authorization: Bearer <CRON_SECRET>` |
| QStash (Upstash) | 9 | `POST` dari QStash | `verifyQStashSignature()` |
| ~~Vercel Cron~~ | 0 | - | **sengaja dikosongkan, jangan dihidupkan lagi** |

### 3 job di systemd timer (VPS)

| Endpoint | Nama job |
|---|---|
| `/api/cron/lens-bucket-backtest` | `lens-bucket-backtest` |
| `/api/cron/lens-score-optimizer` | `lens-score-optimizer` |
| `/api/cron/broker-summary-scan` | `broker-summary-scan` |

**Jam persisnya hidup di VPS, bukan di repo.** Jangan menyalin jam lama dari `vercel.json`
(sudah dihapus) sebagai fakta. Cek langsung:

```bash
systemctl list-timers --all | grep -i sahamlens
systemctl cat sahamlens-<job>.timer
```

Ketiga route ini menyediakan **dua handler sekaligus**: `GET` + `CRON_SECRET` untuk systemd, dan
`POST` + signature untuk QStash kalau suatu saat dipindahkan. Jangan hapus salah satunya "karena
kelihatan tidak dipakai" - itu persis kesalahan `8dfbe94` yang mematikan dua job tanpa jejak.

Job ini membaca `lens_radar_history`, mengambil open H+1 dari Yahoo OHLC lewat layer teknikal
yang sudah ada, lalu menyimpan agregat ke `lens_bucket_stats`. Kalau `CRON_SECRET` belum ada di
`.env.production`, request cron dibalas 401 by design.

Cara memicu manual dari VPS (mis. setelah deploy yang mengubah perhitungan):

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  https://sahamlens.id/api/cron/lens-bucket-backtest
```

Bukti jalannya ada di tabel `job_run_log` (Postgres) - cek itu, bukan menebak dari UI.

`lens-score-optimizer` hanya membuat proposal bobot di `lens_weight_proposals`, tidak
mengubah bobot production secara otomatis. Kalau proposal berstatus
`INSUFFICIENT_COMPONENT_HISTORY`, tunggu beberapa run `ai-pick-scan` karena breakdown
komponen baru mulai diarsipkan ke `lens_radar_history` sejak perubahan 2026-08-05 ini.

## Jadwal QStash (9 job)

Sisa cron dijalankan lewat QStash dan diverifikasi `verifyQStashSignature()` di tiap route.
Nama job di kolom kedua sama persis dengan argumen `withJobRunLog()`, jadi riwayat jalannya
bisa ditelusuri lewat tabel `job_run_log`.

**Sejak migrasi VPS, target URL jadwal QStash harus `https://sahamlens.id/...`.** Kalau menemukan
jadwal yang masih menunjuk `sahamlens.vercel.app`, itu memanggil server standby - hapus dan
daftarkan ulang, jangan biarkan dua target hidup bersamaan (dua server menulis ke database Neon
yang sama). Verifikasi target aktual dengan `GET /v2/schedules` (perintah di bawah).

**Jadwal ditulis ulang saat migrasi (2026-08-13) dan sekarang memakai `CRON_TZ=Asia/Jakarta`,
bukan lagi ekspresi UTC.** Ini perbaikan nyata, bukan kosmetik: jadwal UTC lama tidak ikut
bergerak kalau jam bursa digeser, dan pembaca harus mengurangi 7 jam di kepala setiap kali -
sumber salah baca yang berulang di dokumen ini sendiri.

| Endpoint | Nama job | Cron (`CRON_TZ=Asia/Jakarta`) | Arti | Lama (UTC) |
|---|---|---|---|---|
| `/api/cron/breakout-scan` | `breakout-scan` | `*/5 9-15 * * 1-5` | tiap 5 menit, 09:00-15:59 | `*/30 2-8 * * 1-5` |
| `/api/cron/market-pulse` | `market-pulse` | `*/5 9-15 * * 1-5` | tiap 5 menit, 09:00-15:59 | `*/15 2-8 * * 1-5` |
| `/api/cron/ai-pick-scan` | `ai-pick-scan` | `*/15 9-16 * * 1-5` | tiap 15 menit, 09:00-16:59 | `*/30 2-8 * * 1-5` |
| `/api/cron/recommendation-scan` | `recommendation-scan` | `*/15 9-15 * * 1-5` | tiap 15 menit, 09:00-15:59 | `*/30 2-8 * * 1-5` |
| `/api/cron/watchlist-alert` | `watchlist-alert` | `*/15 9-15 * * 1-5` | tiap 15 menit, 09:00-15:59 | `*/15 2-8 * * 1-5` |
| `/api/cron/macro` | `macro` | `0 9-16 * * 1-5` | tiap jam, 09:00-16:00 | `0 3 * * 1-5` (1x/hari) |
| `/api/cron/fundamental-snapshot` | `fundamental-snapshot` | `0 5 * * 1-5` | 05:00 hari bursa | `0 22 * * 0-4` |
| `/api/cron/backtest-precompute` | `backtest-precompute` | `30 5 * * 1-5` | 05:30 hari bursa | `30 22 * * 0-4` |
| `/api/cron/market-summary` | `market-summary` | `*/5 9-15 * * 1-5` | tiap 5 menit, 09:00-15:59 | `*/5 2-8 * * 1-5` |

Dua perubahan yang layak diperhatikan, karena keduanya menaikkan beban:

- **`macro` naik dari 1x/hari jadi 8x/hari** (tiap jam selama jam bursa). Sempat terbaca sebagai
  anomali di `docs/operations/SCHEDULED_JOBS.md` sebelum jadwal ini diketahui - ternyata disengaja.
- **`breakout-scan` naik 6x lipat** (`*/30` jadi `*/5`) dan `ai-pick-scan` 2x (`*/30` jadi `*/15`).

Diverifikasi terhadap `job_run_log` tanggal 2026-08-13, dan angkanya pas: `breakout-scan` 84 run
(7 jam x 12), `market-pulse` 84, `recommendation-scan` 28, `watchlist-alert` 28, `macro` 8.
**Tidak ada job yang jalan lebih sering dari jadwalnya**, jadi tidak ada penjadwal kedua yang ikut
memanggil endpoint yang sama. `ai-pick-scan` 23 dari ~32 - kurang, bukan lebih, jadi itu
`runWithJobConcurrencyGuard()` melewati run yang bertabrakan, bukan jadwal yang meleset.
| ~~`/api/cron/broker-summary-scan`~~ | `broker-summary-scan` | ~~`30 11 * * 1-5`~~ | **PINDAH ke systemd timer di VPS** - jangan didaftarkan lagi di QStash |

**Optimasi loading 2026-08-05**: `market-summary` adalah satu-satunya endpoint publik
berat (scan 250 saham) yang SEBELUMNYA tidak punya cron warmer - murni `getOrCompute()`
on-demand dengan TTL 2 menit. Karena endpoint ini dipakai landing page `/` dan `/home`
(halaman paling sering dibuka, tanpa login), pengunjung pertama tiap 2 menit menanggung
scan live 250 saham (bisa berumur beberapa detik) - salah satu penyebab utama keluhan
"aplikasi lemot". Sekarang dijadwalkan sama seperti `market-pulse`, TTL `MARKET_SUMMARY`
diperpanjang ke 6 menit (`shared/cache/ttl-policy.ts`). **Jadwal ini masih perlu
didaftarkan manual ke QStash** (lihat perintah `curl` di bawah) - kode dan cache TTL-nya
sudah dideploy, tapi schedule baru tidak otomatis terdaftar hanya dari push kode.

Sesi ini juga men-code-split `jsPDF`/`jspdf-autotable`/`xlsx` di `/dashboard`,
`/portfolio`, dan `/admin` (ExportButton) - ketiga library itu sebelumnya di-import
statis padahal hanya dipakai saat tombol Export/Download PDF diklik, jadi ikut terbundel
ke JS awal dua halaman tersibuk aplikasi ini. Sekarang `import()` dinamis di dalam
handler klik.

QStash menjadwalkan dalam UTC; WIB = UTC+7. Karena itu jadwal harian ditulis di hari
sebelumnya (`0-4` = Minggu-Kamis UTC menghasilkan Senin-Jumat WIB).

`backtest-precompute` didaftarkan 2026-08-03 (sebelumnya ADA di kode tapi TIDAK terdaftar
di QStash - `/api/backtest` selalu jatuh ke precompute sinkron lambat di dalam request).
Dijadwalkan 30 menit setelah `fundamental-snapshot` (murni supaya tidak start di detik yang
sama, keduanya independen satu sama lain) - cache `BACKTEST_INDICATORS` TTL 36 jam
(`shared/cache/ttl-policy.ts`), cukup untuk gap harian + buffer akhir pekan.

Mendaftarkan jadwal baru - domain **wajib** `sahamlens.id`, `QSTASH_TOKEN` diambil dari
dashboard Upstash. Setelah mendaftar, update juga `config/scheduled-jobs.json`:

```bash
curl -XPOST "https://qstash.upstash.io/v2/schedules/https://sahamlens.id/api/cron/ai-pick-scan" \
  -H "Authorization: Bearer $QSTASH_TOKEN" \
  -H "Upstash-Cron: */5 2-9 * * 1-5"

curl -XPOST "https://qstash.upstash.io/v2/schedules/https://sahamlens.id/api/cron/fundamental-snapshot" \
  -H "Authorization: Bearer $QSTASH_TOKEN" \
  -H "Upstash-Cron: 0 22 * * 0-4"
```

`broker-summary-scan` memakai endpoint batch Index Alpha (maksimal 50 ticker/request),
sehingga universe LensRadar 150 ticker selesai dalam 3 request HTTP. Kuota provider tetap
dihitung per ticker. Secret disimpan hanya sebagai `BROKER_DATA_API_KEY` di `.env.production`
VPS; jangan memakai prefix `NEXT_PUBLIC_`. Wajib konfirmasi hak penyimpanan dan redistribusi data secara
tertulis dengan provider sebelum hasil ditampilkan kepada pengguna SahamLens.

Memeriksa jadwal yang aktif:

```bash
curl -s "https://qstash.upstash.io/v2/schedules" -H "Authorization: Bearer $QSTASH_TOKEN"
```

Kalau `ai-pick-scan` belum pernah jalan, `/api/ai-pick` menjawab `ready: false` dan halaman
AI Pick menampilkan "Data sedang disiapkan" - itu perilaku yang disengaja, bukan error.
Endpoint sengaja TIDAK memindai sendiri saat cache kosong, karena satu request pengguna
akan menanggung ~109 fetch Yahoo.

**Urutan pendaftaran penting: `fundamental-snapshot` dulu, baru `ai-pick-scan`.** Diukur
2026-08-03 dengan universe yang sama: tanpa snapshot fundamental, `fundamental_score`
selalu 0 sehingga skor maksimal cuma 70 (teknikal 40 + flow 30), dan **tidak satu pun dari
109 saham mencapai ambang 60** - daftar tampil nyaris kosong. Dengan snapshot terisi,
sebarannya `{">=75": 3, "60-74": 10, "45-59": 46, "<45": 50}` dan daftar penuh 10 baris
berskor 64-91.

Snapshot fundamental baru terisi saat jadwal hariannya jalan (05:00 WIB). Untuk memicunya
sekali saat itu juga - misalnya tepat setelah deploy pertama - pakai `publish`, bukan
`schedules`:

```bash
curl -XPOST "https://qstash.upstash.io/v2/publish/https://sahamlens.id/api/cron/fundamental-snapshot" \
  -H "Authorization: Bearer $QSTASH_TOKEN"
```

Kalau menemukan halaman AI Pick menampilkan "Data sedang disiapkan" padahal jadwal aktif,
curigai cache Redis kosong/expired atau job terakhir gagal - cek `job_run_log` (tabel Postgres),
`GET /v2/schedules`, dan `journalctl -u sahamlens`, bukan asumsi jadwalnya belum didaftarkan.
Ingat cache pindah ke Redis VPS: `redis-cli` di server sekarang jalur diagnosa yang sah
(`redis-cli --scan --pattern 'sahamlens:cache:*' | head`).
