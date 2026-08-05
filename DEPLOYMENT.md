# SahamLens - Deployment Notes

Catatan ini buat siapa pun/AI apa pun (Gemini, Cursor, Claude, dst) yang lanjutin kerjaan deploy
atau pembaruan program di project ini. Ditulis setelah deploy pertama ke Vercel (2026-07-29).

## Aturan wajib saat ada perubahan

- **Setiap perubahan kode/config/dependency/job/deployment harus ikut memperbarui `DEPLOYMENT.md`
  bila berdampak ke cara build, deploy, env var, cron/QStash, smoke test, cache, gating akses,
  atau jebakan operasional.**
- Kalau perubahan murni UI/logic kecil dan tidak mengubah cara deploy, tetap tambahkan catatan
  singkat di bagian "Log perubahan deployment" kalau commit itu sudah dipush ke production/main.
- Jangan mengandalkan ingatan percakapan AI. Keputusan operasional yang penting harus tertulis
  di dokumen ini supaya agen berikutnya tidak mengulang jebakan lama.

## Status live

- **Production URL**: https://sahamlens.vercel.app
  (2026-08-03: pindah dari `trading-three-liard.vercel.app`. Kalau menemukan URL lama di
  catatan/skrip lain, itu sudah usang - ganti ke domain ini.)
- **Vercel project**: `libas/trading` (projectId `prj_buCsXaT6sXen6LwAmeMcNLCBkYSO`, orgId `team_L8xvUeG8WKjNY8R0o9h8k8wE` - lihat `.vercel/project.json`)
- **GitHub**: `github.com/LibasJr/sahamlens`, branch `main`, sudah di-connect ke project Vercel di atas lewat `vercel link`.
- Vercel CLI di mesin dev sudah login sebagai akun `libasjr`. Kalau sesi expired, perlu `npx vercel login` ulang (device auth flow, buka browser).

## Log perubahan deployment

### 2026-08-05 - LensRadar scanner tetap tampil saat advisory belum tervalidasi

- `/api/ai-pick` sekarang tetap mengirim ranking hasil scan data real sebagai scanner/pantauan
  walau `modelValidation.validated=false`.
- Guard validasi model tidak dihapus: response menambahkan `advisoryEnabled=false` dan `note`
  eksplisit bahwa LensRadar belum boleh dibaca sebagai rekomendasi beli/jual.
- Beranda mengubah panel dari "Rekomendasi LensRadar" menjadi "Pantauan LensRadar" dan
  menampilkan catatan validasi model supaya pengguna tidak melihat panel kosong tanpa sebab.
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

## Cara deploy ulang setelah ubah kode

1. Pastikan lolos check dulu sebelum push/deploy:
   ```
   npx tsc --noEmit -p tsconfig.json
   npm run build
   ```
2. Commit & push ke `main` seperti biasa. **Auto-deploy dari push TERKONFIRMASI jalan
   sendiri** (diverifikasi 2026-08-03: dua push berturut-turut masing-masing memicu
   deployment Production baru tanpa perintah manual apa pun). Cukup tunggu dan pantau:
   ```
   npx vercel ls
   ```
   Deployment baru muncul berstatus `● Building` dalam hitungan detik setelah push, lalu
   `● Ready` sekitar 2 menit kemudian.
3. Deploy manual **hanya kalau** setelah beberapa menit tidak ada deployment baru di
   `npx vercel ls`:
   ```
   npx vercel --prod --yes
   ```
4. Smoke test setelah deploy (ganti URL kalau domain berubah) - **DIPERBARUI 2026-08-03**:
   cookie contoh lama (`role=admin`, `sahamlens_demo_session=...` buatan tangan) sudah tidak
   berlaku - session sekarang JWT bertanda tangan (`shared/auth/session.ts`), tidak bisa
   dipalsukan lewat `-H "Cookie: ..."` biasa. Smoke test tanpa login (anonymous trial otomatis
   aktif untuk sebagian besar fitur, lihat bagian "Gating akses" di bawah):
   ```
   curl -s -o /dev/null -w "%{http_code}\n" https://sahamlens.vercel.app/
   curl -s -o /dev/null -w "%{http_code}\n" https://sahamlens.vercel.app/technical/DGWG.JK
   curl -s "https://sahamlens.vercel.app/api/screener?profile=Moderat" | head -c 300
   ```
   Buat smoke test jalur admin: buka `https://sahamlens.vercel.app/admin-login/key?key=<ADMIN_SECRET_KEY>`
   di browser (bukan curl - butuh redirect + cookie httpOnly tersimpan di browser), baru lanjut
   ke `/admin` atau menu Pro-gated lainnya.

   Waktu respons acuan (diukur 2026-08-03, setelah deploy AI Pick satu tab):

   | Endpoint | Waktu | Catatan |
   |---|---|---|
   | `/breakout-radar` | 0,28 s | halaman AI Pick, murni baca cache |
   | `/` | 0,80 s | |
   | `/api/ai-pick` | 0,97 s | murni baca cache |
   | `/api/daily-picks` | 3,77 s | paling lambat - `getMarketSummary()` atas 250 saham, dipakai widget beranda |

   Request pertama setelah deploy selalu lebih lambat karena cold start lambda; ukur yang
   kedua kalau mau angka yang mewakili.

## ⚠️ Jebakan yang sudah pernah bikin deploy gagal

**Folder `mobile/` (React Native app terpisah, ~469MB) bikin deploy CLI gagal** dengan error
`File size limit exceeded (100 MB)`. Penyebab: `mobile/android/.gradle/.../executionHistory.bin`
(141MB) dan `mobile/android/app/build/outputs/apk/release/app-release.apk` (66MB) - keduanya
sudah di-`.gitignore` (gak ke-push ke GitHub), TAPI `vercel --prod` CLI meng-upload dari working
directory lokal dan **tidak menghormati `.gitignore`**, cuma menghormati `.vercelignore`.

Fix-nya sudah ada di `.vercelignore` (root repo) yang exclude `mobile/` + beberapa script test.
**Jangan hapus/skip `.vercelignore` ini**, dan kalau nambah folder besar baru yang gak perlu
ikut ke-deploy, tambahkan di sana juga.

**`output: 'standalone'` di `next.config.mjs` BIKIN DEPLOY VERCEL GAGAL** (ditemukan 2026-08-05,
setelah 4 deploy Production berturut-turut gagal ~7 jam). Opsi ini ditambahkan buat `Dockerfile`
(jalur self-host, BUILD 010) dengan komentar yang KELIRU bilang "tidak memengaruhi Vercel" - untuk
Next.js 16 + Turbopack, mode standalone melewatkan `.next/next-server.js.nft.json` yang justru
dibaca pipeline build Vercel sendiri setelah `next build` selesai, jadi build sukses penuh
(compile+typecheck+prerender lolos semua) lalu tetap gagal `ENOENT` di step terakhir. Fix: gated
lewat `output: process.env.VERCEL ? undefined : 'standalone'` (Vercel set `VERCEL=1` otomatis,
Dockerfile tidak) - **kalau mengubah `next.config.mjs` lagi, jangan hapus guard `process.env.VERCEL`
ini** kecuali sudah verifikasi ulang lewat `npx vercel ls` bahwa deploy tetap Ready.

**`eslint-config-next` versi harus align sama `eslint`** - upgrade Next.js 14→16 (2026-08-04) naikin
`eslint-config-next` ke `^16.3.0` yang butuh peer `eslint@>=9`, tapi `eslint` devDependency dibiarkan
`^8.57.0`. Vercel selalu install bersih (tanpa cache `node_modules` lokal), jadi `npm install`
ERESOLVE-fail keras di sana meskipun mesin dev lokal masih punya install lama yang "kelihatan" jalan.
Fix sementara: root `.npmrc` isi `legacy-peer-deps=true`. **Perbaikan jangka panjang yang lebih
benar**: upgrade `eslint` ke `^9` + migrasi `.eslintrc.json` ke flat config `eslint.config.mjs`
(ESLint 9 default-nya tidak baca `.eslintrc.*` lagi) - belum dikerjakan, `.npmrc` cuma nge-relax
resolusi peer-dep, bukan benerin akar masalahnya.

## Environment variables yang sudah di-set di Vercel (Production)

**REWRITE TOTAL (audit BUILD 002, 2026-08-03)** - tabel dan seluruh bagian di bawah ini
sebelumnya menjelaskan arsitektur Telegram-login + fake-Supabase-shim + JSON lokal yang
**SUDAH DIGANTI TOTAL** oleh restrukturisasi DDD (2026-07-31): auth sekarang email/password
(JWT session, `shared/auth/session.ts`), storage sekarang Postgres (Neon) beneran lewat `pg`
(bukan file JSON/shim), cache Redis (Upstash) beneran, cron lewat QStash beneran. Isi
sebelumnya dibuang total (bukan ditambal) karena hampir semua file yang dirujuk (`lib/auth.ts`,
`lib/constants.ts`, `lib/dbLocal.ts`, `lib/supabase.ts`, `lib/supabaseClient.ts`, `lib/cache.ts`,
`components/TelegramLogin.tsx`, `modules/user/service/telegram-auth.service.ts`,
`app/api/auth/telegram`, `app/api/watchlist/migrate`) **sudah tidak ada di repo sama sekali**
(diverifikasi lewat `ls`/`grep` sebelum ditulis ulang, bukan asumsi).

Set lewat `printf '%s' "$VALUE" | npx vercel env add NAME production` (ganti `production` jadi
`preview` buat scope satunya). Cek status: `npx vercel env ls production`.

Dikelompokkan REQUIRED / OPTIONAL / LEGACY (audit BUILD 002) - diverifikasi lewat `vercel env ls`
+ grep pemakaian di source tanggal 2026-08-03:

**REQUIRED** (app tidak berfungsi penuh tanpa ini):
| Var | Dipakai untuk |
|---|---|
| `DATABASE_URL` (+ alias Neon lain: `POSTGRES_URL`, `PGHOST`, dst - lihat catatan di bawah) | Postgres (Neon) - portfolio, watchlist, alert, macro_indicators, job_run_log. Kode HANYA baca `DATABASE_URL` (`shared/config/env.ts`) - var Neon lain (`POSTGRES_URL_NON_POOLING`, `PGHOST_UNPOOLED`, dst, ada belasan) di-inject otomatis oleh integrasi Neon-Vercel, tidak dibaca kode manapun, aman dibiarkan (bukan sampah manual, punya integrasi). |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Cache (`shared/cache/redis-cache.ts`) - kalau kosong, semua fungsi cache degrade aman ke cache-miss (tidak crash), tapi performa jauh lebih lambat & Yahoo Finance kena request lebih sering. |
| `QSTASH_TOKEN` / `QSTASH_URL` / `QSTASH_CURRENT_SIGNING_KEY` / `QSTASH_NEXT_SIGNING_KEY` | Cron scheduler (bukan Vercel Cron) - 7 jadwal aktif, lihat bagian "Jadwal QStash" di bawah. |
| `JWT_SECRET_KEY` | Session login email/password (`shared/auth/session.ts`, `jose`). |
| `ADMIN_SECRET_KEY` | Jalur darurat login admin (`/admin-login/key?key=...`) - password admin utama disimpan sebagai hash di tabel `admin_secret` (database), bisa diganti sendiri lewat `/admin` tanpa deploy ulang. Nilai TIDAK BISA dibaca ulang dari Vercel setelah tersimpan (Sensitive) - simpan juga di `.env.local` lokal (gitignored). |
| `GEMINI_API_KEY` | AI cascade (`lib/aiProviders.ts generateAI()`) - tanpa ini fallback ke heuristik rule-based per fitur (Council lokal, sentimen kata kunci, dst), BUKAN error. |

**OPTIONAL** (fitur spesifik degrade dengan aman kalau kosong):
| Var | Dipakai untuk |
|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_DSN` | Error tracking (`@sentry/nextjs`). |
| `SMTP_EMAIL` / `SMTP_PASSWORD` | Kirim email (reset password, dst - `nodemailer`). |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | **BUKAN login Telegram** (itu sudah dihapus total) - dipakai `lib/telegram.ts sendTelegramMessage()`, satu-satunya pemanggil `app/api/payment/notify/route.ts` (notifikasi ke admin saat ada bukti bayar manual masuk). |
| `NEXT_PUBLIC_PAYMENT_*` (BANK_ACCOUNT_NAME/NUMBER, BANK_NAME, GOPAY_NAME/NUMBER, DANA_NAME/NUMBER) | Metode pembayaran manual di `PaywallModal` (`shared/config/payment.ts`). Baris otomatis disembunyikan kalau salah satu metode belum diisi. |

**LEGACY - SUDAH DIHAPUS dari Vercel (2026-08-03, dikonfirmasi pemilik produk):**
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (sisa
rencana Supabase yang tidak pernah jadi dipakai), `ADMIN_TELEGRAM_ID`, `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`
(sisa sistem login Telegram yang sudah dihapus total - beda dari `TELEGRAM_BOT_TOKEN`/
`TELEGRAM_CHAT_ID` di atas yang MASIH dipakai untuk notifikasi pembayaran). Diverifikasi 0
pemakaian di kode sebelum dihapus, lalu dihapus lewat `npx vercel env rm <NAME> production`
(+ `preview` untuk 3 var Supabase yang scope-nya dua-duanya).

`INTERNAL_API_SECRET` (`shared/auth/internal-service.ts`, dipakai cron/alert evaluation supaya
panggilan server-to-server ke `/api/stock`, dst bisa lewati gate session) - **cek ulang statusnya
di `vercel env ls`**, dokumen sebelumnya bilang belum di-set tapi itu klaim lama, tidak
diverifikasi ulang di sesi ini.

## Arsitektur data (sudah bukan Supabase/JSON lokal lagi)

Satu layer penyimpanan: **Postgres (Neon)**, diakses lewat `pg` (bukan ORM), tabel dibuat
idempoten (`CREATE TABLE IF NOT EXISTS`) oleh `shared/database/schema.service.ts` saat boot -
`portfolios`, `holdings`, `transactions`, `watchlists`, `alerts`, `macro_indicators`,
`job_run_log`, dst. Data PERSISTEN antar cold start Vercel (beda total dari arsitektur lama yang
cuma in-memory/file JSON dan hilang tiap cold start).

Cache Redis (Upstash) terpisah dari database - murni cache hasil hitungan (screener universe,
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

- `.vercelignore` - exclude `mobile/` wajib ada (lihat bagian jebakan deploy di atas).
- `shared/database/schema.service.ts` - satu-satunya sumber definisi skema Postgres, idempoten.
  Kalau nambah tabel baru, tambahkan `CREATE TABLE IF NOT EXISTS` di sini, jangan bikin file SQL
  terpisah yang tidak pernah dijalankan (pelajaran dari `supabase/schema.sql`, dihapus 2026-08-03
  karena sudah lama superseded dan tidak direferensikan kode manapun).

## Jadwal QStash

Cron dijalankan lewat QStash (bukan Vercel Cron) dan diverifikasi dengan
`verifyQStashSignature()` di tiap route. Nama job di kolom kedua sama persis dengan
argumen `withJobRunLog()`, jadi riwayat jalannya bisa ditelusuri lewat log job.

9 jadwal (8 diverifikasi live lewat `GET /v2/schedules` semua status SUCCESS terakhir
jalan, `market-summary` ditambahkan 2026-08-05 - lihat catatan optimasi loading di
bawah tabel):

| Endpoint | Nama job | Cron (UTC) | Setara WIB |
|---|---|---|---|
| `/api/cron/recommendation-scan` | `recommendation-scan` | `*/15 2-8 * * 1-5` | tiap 15 menit, 09:00-15:00 hari bursa |
| `/api/cron/breakout-scan` | `breakout-scan` | `*/5 2-8 * * 1-5` | tiap 5 menit, 09:00-15:00 hari bursa |
| `/api/cron/market-pulse` | `market-pulse` | `*/5 2-8 * * 1-5` | tiap 5 menit, 09:00-15:00 hari bursa |
| `/api/cron/market-summary` | `market-summary` | `*/5 2-8 * * 1-5` | tiap 5 menit, 09:00-15:00 hari bursa |
| `/api/cron/ai-pick-scan` | `ai-pick-scan` | `*/5 2-9 * * 1-5` | tiap 5 menit, 09:00-16:00 hari bursa |
| `/api/cron/watchlist-alert` | `watchlist-alert` | `*/5 2-8 * * 1-5` | tiap 5 menit, 09:00-15:00 hari bursa |
| `/api/cron/macro` | `macro` | `0 3 * * 1-5` | 10:00 hari bursa |
| `/api/cron/fundamental-snapshot` | `fundamental-snapshot` | `0 22 * * 0-4` | 05:00 hari bursa (Senin-Jumat) |
| `/api/cron/backtest-precompute` | `backtest-precompute` | `30 22 * * 0-4` | 05:30 hari bursa (Senin-Jumat) |

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

Mendaftarkan jadwal baru - ganti `<DOMAIN>` dengan domain produksi, `QSTASH_TOKEN` diambil
dari dashboard Upstash:

```bash
curl -XPOST "https://qstash.upstash.io/v2/schedules/https://<DOMAIN>/api/cron/ai-pick-scan" \
  -H "Authorization: Bearer $QSTASH_TOKEN" \
  -H "Upstash-Cron: */5 2-9 * * 1-5"

curl -XPOST "https://qstash.upstash.io/v2/schedules/https://<DOMAIN>/api/cron/fundamental-snapshot" \
  -H "Authorization: Bearer $QSTASH_TOKEN" \
  -H "Upstash-Cron: 0 22 * * 0-4"
```

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
curl -XPOST "https://qstash.upstash.io/v2/publish/https://sahamlens.vercel.app/api/cron/fundamental-snapshot" \
  -H "Authorization: Bearer $QSTASH_TOKEN"
```

Status per 2026-08-03: **ketujuh jadwal SUDAH terdaftar dan aktif** (lihat tabel di atas,
semua `lastScheduleStates: SUCCESS` saat terakhir dicek). Kalau menemukan halaman AI Pick
menampilkan "Data sedang disiapkan" padahal jadwal aktif, curigai cache Redis kosong/expired
atau job terakhir gagal - cek `job_run_log` (tabel Postgres) atau `GET /v2/schedules`, bukan
asumsi jadwalnya belum didaftarkan.
