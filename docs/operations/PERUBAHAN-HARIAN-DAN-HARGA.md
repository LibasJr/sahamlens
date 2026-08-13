# Perubahan harian & harga — peta lengkap

Ditulis 2026-08-14 setelah bug "IHSG/emiten minus tampil plus" kembali **empat kali dalam
satu hari**, tiap kali di file berbeda. Penyebabnya bukan satu bug, melainkan satu kesalahan
yang disalin ke banyak tempat — dan tiap perbaikan hanya menyentuh jalur yang kebetulan
dilaporkan pengguna.

Dokumen ini ada supaya siapa pun (manusia atau AI) yang memperbaiki angka harga berikutnya
tidak perlu menelusuri ulang dari nol.

## Aturan yang tidak boleh dilanggar

1. **Penutupan acuan HANYA lewat `resolvePreviousClose()`** (`shared/market/previous-close.ts`).
   Fungsi itu membandingkan **tanggal bursa**, bukan posisi larik.
2. **Jangan baca `meta.previousClose` / `meta.chartPreviousClose` langsung.** Terukur meleset
   sampai **seminggu**: 2026-08-14 ia melaporkan penutupan 7 Agustus untuk TLKM, ASII, dan BMRI.
   Boleh diteruskan sebagai argumen ke `resolvePreviousClose()`, tidak boleh dipakai sendiri.
3. **Jangan ambil acuan dari `array[array.length - 2]`.** Semua larik OHLC di repo ini membuang
   bar ber-`close` null saat dibangun, dan bar sesi berjalan MEMANG masih null di Yahoo — jadi
   elemen terakhir sudah sesi kemarin dan `length-2` menunjuk dua sesi lalu.
4. **Jangan pasang fallback ke pola lama.** `resolvePreviousClose() ?? closes[length-2]`
   menghidupkan kembali bug yang sama. Angka salah lebih buruk daripada tidak ada angka.
5. **Bump `COMPUTED_CACHE_VERSION`** (`shared/cache/cache-version.ts`) setiap kali mengubah cara
   sebuah angka dihitung. Tanpa itu perbaikan tertahan cache sampai 30 menit — 24 jam di jalur
   stale-fallback — dan pengguna tetap melihat angka yang sudah diketahui salah.

Aturan 2 dan 3 dijaga otomatis oleh `shared/market/__tests__/previous-close-guard.test.ts`.
CI gagal kalau polanya muncul lagi. **Jangan tambahkan pengecualian tanpa membaca
`previous-close.ts` lebih dulu.**

## Kenapa bug ini begitu sulit terlihat

Sesi berjalan punya bar di Yahoo **sebelum** `close`-nya terisi. Selama jendela itu:

```
timestamps : [... 11 Agu, 12 Agu, 13 Agu ]
closes     : [... 320,    332,    null   ]   <- 13 Agu ada, nilainya belum
meta.regularMarketPrice = 318                <- harga 13 Agu, SUDAH ada
```

Kode yang membuang bar null lalu mengambil "dua dari belakang" menghasilkan **320** (11 Agu),
lalu membandingkannya dengan harga **13 Agu**. Dua sisi dari sesi yang berbeda. Untuk DGWG itu
berarti +3,75% tampil di layar padahal kenyataannya **−4,22%** — arah terbalik, bukan sekadar
angka meleset.

Gejalanya juga menyesatkan: di luar jam bursa semuanya terlihat wajar, dan sebagian ticker
kebetulan benar. Itu sebabnya perbaikan parsial terasa berhasil berkali-kali.

## Semua tempat yang menghitung perubahan harian

| Berkas | Menyuplai | Status |
| --- | --- | --- |
| `shared/market/previous-close.ts` | **satu-satunya sumber kebenaran** | acuan |
| `app/page.tsx` | kartu IHSG (SSR beranda) | pakai resolver |
| `app/api/live/[ticker]/route.ts` | harga live per saham | pakai resolver |
| `app/api/stock/[ticker]/route.ts` | halaman **Lens Teknikal** | pakai resolver |
| `modules/technical/service/yahoo-history.service.ts` | teknikal + chat (`previousClose`) | pakai resolver |
| `modules/market/service/market-summary.service.ts` | `daily-picks`, daftar beranda | pakai resolver |
| `modules/market/service/market-pulse.service.ts` | indeks + breadth 53 saham | pakai resolver |
| `modules/recommendation/service/recommendation.service.ts` | `/api/recommendations` | pakai resolver |
| `modules/recommendation/service/ai-pick-scan.service.ts` | `/api/ai-pick` | pakai `res.previousClose` |

Yang **sengaja** masih memakai posisi larik, karena kedua sisi perbandingannya dari larik yang
sama sehingga tidak bisa membalik tanda — batasnya: menampilkan perubahan **sesi terakhir yang
selesai**, bukan sesi berjalan:

`breakout.service.ts`, `app/dashboard/page.tsx`, `components/CommandPalette.tsx`,
`lib/miniCouncil.ts`, dan dua analyzer indikator (`momentum`, `volume`).

## Chart: sesi berjalan hilang dari lilin terakhir

Masalah yang sama, wujud berbeda. `app/api/public-chart/[ticker]/route.ts` menyaring bar
ber-`close` null, jadi lilin terakhir berhenti di sesi kemarin sementara header menampilkan
harga hari ini — dua angka tentang saham yang sama, di layar yang sama, berbeda satu hari.

Sekarang route itu menyusun lilin sesi berjalan dari `meta` di respons yang sama
(`regularMarketPrice`/`DayHigh`/`DayLow`/`Volume`). Satu-satunya nilai yang bukan dari Yahoo
adalah `open` — `regularMarketOpen` sering tidak dikirim, jadi dipakai penutupan sesi sebelumnya
yang dijepit ke rentang high/low. Aproksimasi ini **disengaja dan terbatas pada badan lilin
terakhir**; high/low/close/volume semuanya nilai sungguhan.

Satu endpoint ini menyuplai **kedua** chart — beranda (`components/Dashboard.tsx`) dan Lens
Teknikal (`components/StockChartPanel.tsx`).

## Cara memverifikasi tanpa menebak

Bandingkan langsung dengan Yahoo, jangan mengandalkan tampilan:

```bash
curl -s "https://query1.finance.yahoo.com/v8/finance/chart/DGWG.JK?range=5d&interval=1d" \
  -H "User-Agent: Mozilla/5.0" | jq '{
    closes: .chart.result[0].indicators.quote[0].close,
    price:  .chart.result[0].meta.regularMarketPrice,
    meta:   .chart.result[0].meta.previousClose
  }'
```

Acuan yang benar = penutupan **tanggal bursa terakhir yang berbeda** dari sesi harga berjalan.
Kalau `meta.previousClose` berbeda dari itu, yang salah `meta` — bukan perhitungannya.

## Setelah memperbaiki: kapan pengguna melihatnya

- **Langsung**: `/api/live`, `/api/public-chart` (tanpa cache Redis).
- **Setelah bump `COMPUTED_CACHE_VERSION`**: halaman teknikal dan `market-summary`.
- **Menunggu cron**: `ai-pick`, `breakout` — daftar hasil scan baru ditulis ulang saat job
  berikutnya jalan (jam bursa). Hard refresh browser TIDAK menyentuh cache server.
