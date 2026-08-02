# SahamLens - Deployment Notes

Catatan ini buat siapa pun/AI apa pun (Gemini, Cursor, Claude, dst) yang lanjutin kerjaan deploy
atau pembaruan program di project ini. Ditulis setelah deploy pertama ke Vercel (2026-07-29).

## Status live

- **Production URL**: https://trading-three-liard.vercel.app
- **Vercel project**: `libas/trading` (projectId `prj_buCsXaT6sXen6LwAmeMcNLCBkYSO`, orgId `team_L8xvUeG8WKjNY8R0o9h8k8wE` - lihat `.vercel/project.json`)
- **GitHub**: `github.com/LibasJr/sahamlens`, branch `main`, sudah di-connect ke project Vercel di atas lewat `vercel link`.
- Vercel CLI di mesin dev sudah login sebagai akun `libasjr`. Kalau sesi expired, perlu `npx vercel login` ulang (device auth flow, buka browser).

## Cara deploy ulang setelah ubah kode

1. Pastikan lolos check dulu sebelum push/deploy:
   ```
   npx tsc --noEmit -p tsconfig.json
   npm run build
   ```
2. Commit & push ke `main` seperti biasa. GitHub sudah ke-connect ke Vercel project ini, tapi
   **auto-deploy dari push belum pernah kekonfirmasi jalan sendiri** - kalau setelah push gak ada
   deployment baru muncul di `npx vercel ls`, deploy manual (step 3).
3. Deploy manual dari root repo:
   ```
   npx vercel --prod --yes
   ```
4. Smoke test setelah deploy (ganti URL kalau domain berubah):
   ```
   curl -s -o /dev/null -w "%{http_code}\n" https://trading-three-liard.vercel.app/
   curl -s https://trading-three-liard.vercel.app/api/portfolio -H "Cookie: sahamlens_demo_session=%7B%22id%22%3A1%2C%22username%22%3A%22test%22%2C%22role%22%3A%22free%22%7D"
   curl -s -o /dev/null -w "%{http_code}\n" https://trading-three-liard.vercel.app/technical/DGWG.JK
   curl -s https://trading-three-liard.vercel.app/api/council?symbol=DGWG.JK -H "Cookie: role=admin"
   ```
   `/api/council` dan `/api/stock/[ticker]` **selalu 429** tanpa cookie admin/login (lihat bagian
   "Gating akses" di bawah) - itu bukan bug, pakai `-H "Cookie: role=admin"` buat smoke test.

## ⚠️ Jebakan yang sudah pernah bikin deploy gagal

**Folder `mobile/` (React Native app terpisah, ~469MB) bikin deploy CLI gagal** dengan error
`File size limit exceeded (100 MB)`. Penyebab: `mobile/android/.gradle/.../executionHistory.bin`
(141MB) dan `mobile/android/app/build/outputs/apk/release/app-release.apk` (66MB) - keduanya
sudah di-`.gitignore` (gak ke-push ke GitHub), TAPI `vercel --prod` CLI meng-upload dari working
directory lokal dan **tidak menghormati `.gitignore`**, cuma menghormati `.vercelignore`.

Fix-nya sudah ada di `.vercelignore` (root repo) yang exclude `mobile/` + beberapa script test.
**Jangan hapus/skip `.vercelignore` ini**, dan kalau nambah folder besar baru yang gak perlu
ikut ke-deploy, tambahkan di sana juga.

## Environment variables yang sudah di-set di Vercel (Production + Preview)

Set lewat `printf '%s' "$VALUE" | npx vercel env add NAME production` (ganti `production` jadi
`preview` buat scope satunya). Cek status: `npx vercel env ls`.

| Var | Ada di Vercel? | Catatan |
|---|---|---|
| `GEMINI_API_KEY` | ✅ | dipakai `/api/council` (10-agent). Tanpa ini fallback ke `runLocalCouncil`. |
| `ADMIN_TELEGRAM_ID` | ✅ (`660211525`) | dipakai `lib/auth.ts getAdminTelegramIds()`. Catatan: `lib/limits.ts checkAnalisaLimit` **hardcode** angka `660211525` langsung, gak baca env ini - kalau ID admin pernah ganti, harus update di 2 tempat. |
| `TELEGRAM_BOT_TOKEN` | ✅ | buat verifikasi HMAC Telegram Login Widget (`lib/auth.ts verifyTelegramAuth`). |
| `TELEGRAM_CHAT_ID` | ✅ | buat `lib/telegram.ts` (cek dulu masih dipakai atau tidak sebelum asumsi). |
| `ADMIN_SECRET_KEY` | ✅ (baru ditambahkan 2026-07-29, dirotasi 2026-08-02) | Sejak 2026-08-02 ini JALUR DARURAT, bukan satu-satunya cara login admin lagi - password utama sekarang disimpan sebagai hash di tabel `admin_secret` (database), bisa diganti admin sendiri lewat form "Ganti Password Admin" di `/admin` tanpa deploy ulang (lihat `modules/user/controller/admin.controller.ts` `handleChangeAdminSecret`). Env var ini tetap harus di-set sebagai cadangan kalau password database sampai lupa. **Nilai aslinya ada di Vercel env vars (Sensitive - TIDAK BISA dibaca ulang sekali tersimpan, lihat insiden 2026-08-02) dan `.env.local` lokal (gitignored) - jangan pernah commit nilainya ke git atau taruh di file yang ke-track.** |
| `INTERNAL_API_SECRET` | ❌ belum di-set di Vercel (baru ditambahkan lewat audit bug 2026-08-01) | dipakai `shared/auth/internal-service.ts` supaya panggilan server-to-server (`modules/notification/service/alert-evaluation.service.ts` -> `/api/stock/[ticker]`, `/api/breakout-radar`, `/api/market-pulse`) bisa lewati gate session+Pro yang sebetulnya buat request browser user. **Tanpa var ini di-set di Vercel, sistem alert (Telegram notif harga/RSI/breakout/breadth) TIDAK AKAN BERFUNGSI di production** - `isInternalServiceRequest()` fail-closed (selalu `false`) kalau env var kosong. Nilai lokal ada di `.env.local` (gitignored); set nilai yang sama persis di Vercel lewat `printf '%s' "$VALUE" | npx vercel env add INTERNAL_API_SECRET production` (dan `preview`). |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` / `DATABASE_URL` | ❌ belum di-set di Vercel | nilai di `.env.local` lokal sekarang **kelihatan seperti placeholder/dummy** (terlalu pendek buat JWT/connection string asli). App belum benar-benar jalan di atas Supabase - lihat bagian "Arsitektur data" di bawah. Isi env ini di Vercel HANYA kalau sudah migrasi ke Supabase project yang beneran. |
| `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` | ❌ belum di-set | dipakai `components/TelegramLogin.tsx`, fallback ke `'LibasBot'` kalau kosong. Widget Telegram Login **gak akan render/jalan** kecuali domain production didaftarkan ke bot itu lewat `/setdomain` di @BotFather. Verifikasi dulu `LibasBot` itu emang bot yang benar sebelum daftar domain. |
| `NEXT_PUBLIC_PAYMENT_DANA_NUMBER` / `NEXT_PUBLIC_PAYMENT_DANA_NAME` / `NEXT_PUBLIC_PAYMENT_GOPAY_NUMBER` / `NEXT_PUBLIC_PAYMENT_GOPAY_NAME` / `NEXT_PUBLIC_PAYMENT_BANK_NAME` / `NEXT_PUBLIC_PAYMENT_BANK_ACCOUNT_NUMBER` / `NEXT_PUBLIC_PAYMENT_BANK_ACCOUNT_NAME` | ✅ sudah di-set di Vercel Production (sesi 2026-08-02) | Dipakai `shared/config/payment.ts` untuk menampilkan metode pembayaran manual di `PaywallModal`. Nilai asli (nomor DANA/GoPay, nomor rekening, nama pemilik) HANYA ada di Vercel dashboard + `.env.local` lokal (gitignored) - jangan pernah commit nilainya ke git. Kalau salah satu metode belum diisi, baris itu otomatis tidak ditampilkan (lihat `getPaymentMethods()`). |

> **UPDATE (audit keamanan, sesi ini):** `lib/supabase.ts` (layer 2 di bawah) SUDAH DIHAPUS,
> begitu juga seluruh integrasi login/bot Telegram (`components/TelegramLogin.tsx`,
> `modules/user/service/telegram-auth.service.ts`, `app/api/auth/telegram`,
> `app/api/watchlist/migrate`) - semuanya dead code yang cuma nulis ke shim lokal itu, bukan data
> nyata. Section "Gating akses" dan "Kenapa menu admin dev hilang" di bawah ini JUGA SUDAH BASI
> (gating sekarang murni `checkProAccess`/session, bukan `telegram_id`) - jangan dipercaya tanpa
> cek ulang source-nya langsung. `app/admin/page.tsx` juga sudah tidak lagi baca tabel palsu itu.

## Arsitektur data (biar gak ketuker istilah "Supabase")

Ada 3 layer penyimpanan berbeda di project ini, JANGAN dianggap sama:

1. **`data/*.json`** (`portfolios.json`, `users.json`, `transactions.json`, dll) - dibaca/ditulis
   lewat `lib/dbLocal.ts`. Sudah Vercel-aware: di Vercel (`process.env.VERCEL` ada), write cuma
   nyimpen ke variable in-memory (`memoryStore`), gak nulis ke disk (read-only filesystem).
   Konsekuensi: data baru (signup, transaksi) **hilang tiap cold start** lambda di Vercel. Fallback
   portfolio (DGWG 10 lot @369, GGRM 1 lot @17450, cash 63,1jt) di-hardcode di
   `app/api/portfolio/route.ts` supaya `/portfolio` gak pernah blank walau data kosong.

2. **`local_db.json`** - dibaca/ditulis lewat `lib/supabase.ts`, yang **BUKAN Supabase beneran**,
   cuma shim lokal fs-based yang niru API `.from(table).select()/.insert()/...` (buat watchlist,
   alerts, telegram-login user record, usage_logs, admin panel). Sebelum 2026-07-29 file ini
   **gak ada guard Vercel** (`writeDB()` langsung `fs.writeFileSync`, bakal throw `EROFS` di
   filesystem read-only Vercel). Sudah ditambal hari itu juga: sekarang ada `isVercel` check +
   `memoryDB` in-memory fallback (pola sama kayak `dbLocal.ts`). Konsekuensi sama: data hilang
   tiap cold start di Vercel selama belum pakai Supabase beneran.

3. **`lib/supabaseClient.ts`** - client Supabase asli (`@supabase/supabase-js`), baca
   `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`. **Belum dipakai di mana pun** saat
   dokumen ini ditulis (cek ulang dengan grep `from '@/lib/supabaseClient'` sebelum asumsi berubah).

**Kalau mau data beneran persistent di Vercel** (signup, watchlist, alerts, usage log gak hilang
tiap cold start): satu-satunya cara jangka panjang adalah migrasi `lib/supabase.ts` (dan idealnya
`lib/dbLocal.ts`) buat benar-benar manggil Supabase project asli, bukan nambah guard lagi.

## Gating akses (kenapa data "gak muncul" buat visitor baru)

`app/api/stock/[ticker]/route.ts` (dipakai oleh SEMUA halaman analisa: technical, dashboard,
fundamental, screener, breakout-radar, dst) punya baris ini di paling awal:

```ts
if (!isAdmin && !telegram_id) {
  return NextResponse.json({ error: 'Limit analisa harian habis' }, { status: 429 });
}
```

Artinya **visitor yang belum login Telegram ATAU belum punya cookie admin selalu dapat 429**,
sebelum sempat cek kuota 5x/hari yang sebenarnya. Frontend (fundamental, dashboard,
breakout-radar, recommendations, watchlist, market-pulse, compare - lihat masing-masing
`page.tsx`) menampilkan `<PaywallModal>` begitu nerima 429. Ini KEMUNGKINAN BESAR **desain yang
disengaja** (produk paywall-first, harus login Telegram dulu buat dapet kuota gratis), bukan bug
Vercel - tapi kalau owner sendiri (`ADMIN_TELEGRAM_ID`) juga kena, berarti belum ada cara gampang
buat dia login sebagai admin di production. Solusi sekarang: pakai `/admin-login/key?key=<ADMIN_SECRET_KEY>`.
(Catatan: lihat baris ADMIN_SECRET_KEY di tabel environment variables untuk cara login admin yang akurat saat ini.)

Kalau ke depannya mau ada mode "preview tanpa login" buat visitor anonim, itu perubahan logic di
baris di atas - **tanyakan dulu ke pemilik produk**, jangan diubah sepihak, karena ini keputusan
bisnis (paywall vs freemium terbuka), bukan bug teknis.

## Kenapa "menu admin dev" hilang di production

`components/TelegramLogin.tsx` punya tombol "Dev: Force Admin" yang cuma render kalau
`process.env.NODE_ENV === 'development'` - hilang otomatis begitu di-build production (baik lokal
`npm run build` maupun di Vercel). Jalur admin buat production ada 2:

1. **`/admin-login/key?key=<ADMIN_SECRET_KEY>`** - set httpOnly cookie langsung, gak perlu Telegram.
   Ini yang paling gampang dipakai sekarang (env var sudah di-set, lihat tabel di atas).
   (Catatan: lihat baris ADMIN_SECRET_KEY di tabel environment variables untuk cara login admin yang akurat saat ini.)
2. **Telegram Login Widget** (`/admin-login`) - perlu `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` di-set
   dan domain production didaftarkan ke bot itu lewat `/setdomain` di @BotFather. Belum
   dikonfigurasi saat dokumen ini ditulis.

## Bug ke-2 yang sudah ditemukan & ditambal (2026-07-29): dua skema cookie admin yang gak nyambung

Ternyata ada **dua sistem cookie admin yang independen** di codebase ini, dan sebelum tambalan
ini, aktivasi lewat `/admin-login/key` gak beneran membuka akses data:

- `sahamlens_admin=1` (`ADMIN_COOKIE`/`ADMIN_COOKIE_VALUE` di `lib/constants.ts`, httpOnly) -
  dipakai `middleware.ts` (bypass rate limit) dan `isAdminServer()`/`lib/auth.ts` (guard halaman
  `/admin`).
- `saham_admin=true` + `role=admin` (bukan httpOnly, dibaca juga lewat `document.cookie` di
  client) - dipakai `app/api/stock/[ticker]/route.ts`, `app/api/council/route.ts`, dan
  `lib/limits.ts hasProAccess()`/badge admin di `TelegramLogin.tsx`.

`/admin-login/key/route.ts` dan `/api/auth/telegram/route.ts` (login admin via Telegram) sebelumnya
CUMA set cookie yang pertama. Akibatnya: abis "aktivasi admin", `/admin` panel kebuka tapi
`/api/stock`/`/api/council` (dan semua menu yang manggil endpoint itu: technical, dashboard,
fundamental, dst) **tetap 429** - persis keluhan user "semua menu gagal muat" yang masih muncul
walau sudah pakai link aktivasi admin.

Sudah ditambal: kedua route sekarang set ketiga cookie sekaligus (`sahamlens_admin`,
`saham_admin`, `role`). Kalau nambah jalur admin baru, selalu set ketiganya, atau - lebih baik
lagi - refactor semua pengecekan admin di codebase ini supaya cuma baca satu sumber kebenaran
(`isAdminServer()`) biar gak kejadian lagi drift kayak gini.

## "Akun Demo" minta signup, bukan langsung nampilin porto - ini bukan bug

`/portfolio` (`app/portfolio/page.tsx`) motret status login lewat `/api/auth/me`
(`DEMO_SESSION_COOKIE`, terpisah total dari cookie admin di atas). Kalau belum pernah signup di
domain ini, yang muncul adalah form "Akun Demo" (Login/Daftar) - **bukan** langsung dashboard
porto. ini konsisten dengan komentar yang sudah ada duluan di `lib/dbLocal.ts`
(`DEFAULT_PORTFOLIOS` sengaja dikosongin: "portfolio virtual sekarang per-user ... User baru
wajib daftar dulu"). Jadi kalau tampilannya beda dari yang diinget user ("gak kayak Stockbit
tadi"), submit form Daftar dulu buat bikin akun demo baru (modal virtual Rp100jt, holdings kosong
- BUKAN otomatis keisi DGWG/GGRM contoh). Kalau produk butuh porto contoh yang udah keisi
default buat demo baru, itu perubahan behavior yang perlu dikonfirmasi dulu ke pemilik produk,
bukan sesuatu yang boleh diubah sepihak.

Catatan tambahan: karena penyimpanan `data/users.json`/`data/portfolios.json` di Vercel cuma
in-memory (lihat bagian "Arsitektur data"), akun demo yang baru signup bisa "hilang" kalau lambda
kena cold start baru - user perlu signup ulang. Ini keterbatasan yang sama, belum ada fix jangka
pendek selain migrasi ke database beneran.

## Security fix yang sudah diterapkan (2026-07-29)

`app/admin/page.tsx` (panel admin: daftar user, tombol "Set Pro") **sebelumnya tidak ada
pengecekan otentikasi sama sekali** - siapa pun yang tahu URL `/admin` bisa lihat semua
telegram_id/username/role user dan klik "Set Pro" buat upgrade akun siapa pun gratis. Sudah
ditambal dengan `isAdminServer()` guard (redirect ke `/admin-login` kalau belum admin) di level
halaman DAN di dalam server action "Set Pro" itu sendiri (defense in depth). Kalau bikin
halaman/server action admin baru, selalu pasang guard yang sama dari awal.

## File yang jangan diubah tanpa alasan kuat

- `.vercelignore` - exclude `mobile/` wajib ada (lihat bagian jebakan deploy di atas).
- `lib/dbLocal.ts`, `lib/supabase.ts`, `lib/sahamLensGuard.ts`, `lib/cache.ts` - semua punya
  guard `isVercel`/try-catch buat filesystem read-only. Kalau nambah file baru yang nulis ke
  disk (`fs.writeFileSync` dkk), tiru pola yang sama, jangan nulis fs langsung tanpa guard.
