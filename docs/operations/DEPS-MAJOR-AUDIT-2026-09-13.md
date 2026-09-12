# Analisis Upgrade Mayor Dependency — 13 September 2026

Sumber: SahamLens Weekly Maintenance Report (`job_id e365f9914ded`), WARN
`deps/outdated` — 29 dependency tertinggal, 15 beda versi mayor.

Bagian non-breaking (18 paket minor/patch) sudah dituntaskan di PR #395.
Dokumen ini menilai **sisa upgrade mayor** satu per satu, dengan bukti
pemakaian nyata di repo — bukan sekadar membaca changelog.

Metodologi: hitung jumlah call-site API yang benar-benar berubah, bukan
jumlah file yang meng-import. Paket yang "dipakai 147 file" belum tentu
berisiko kalau API yang dipakai tidak berubah.

---

## Ringkasan keputusan

| Paket | Dari → Ke | Call-site terdampak | Risiko | Keputusan |
|---|---|---|---|---|
| @types/node | 20.19.43 → 22.20.2 | 0 (typecheck lolos) | **Rendah** | ✅ **Dikerjakan di PR ini** — memperbaiki mismatch |
| tailwind-merge | 2.6.1 → 3.7.0 | 1 (`lib/utils/cn.ts`) | Rendah–sedang | ⏸️ Tunda — terikat Tailwind v4 |
| nodemailer | 9.1.1 → 10.0.9 | 2 (`createTransport`, `sendMail`) | Sedang | ⏸️ Tunda — tanpa urgensi keamanan |
| react-markdown | 8.0.7 → 10.1.0 | 1 (`components/AIChat.tsx`) | Sedang | ⏸️ Tunda |
| framer-motion | 12.43.0 → 13.2.0 | 156 (`motion` 138, `AnimatePresence` 18) | Sedang | ⏸️ Tunda |
| lucide-react | 0.453.0 → 1.45.0 | 147 berkas import | Sedang | ⏸️ Tunda |
| lightweight-charts | 4.2.3 → 5.2.1 | **34 call-site** di 5 berkas | **Tinggi** | ⛔ PR khusus |
| tailwindcss | 3.4.19 → 4.3.3 | seluruh styling + config | **Tinggi** | ⛔ PR khusus |
| react + react-dom | 18.3.1 → 19.3.0 | seluruh komponen | **Tinggi** | ⛔ Tunda — tidak dipaksa Next 16 |
| @types/react(+dom) | 18.3.x → 19.3.0 | terikat React 19 | **Tinggi** | ⛔ Tunda — ikut React |
| typescript | 5.9.3 → 7.0.2 | seluruh kode | **Tinggi** | ⛔ Tunda — rilis sangat baru |
| eslint | 9.39.5 → 10.10.0 | seluruh config lint | Sedang–tinggi | ⛔ Tunda — `eslint-config-next` belum siap |
| vitest | 4.1.11 → 5.0.0 | 358 berkas test | Sedang–tinggi | ⛔ Tunda — rilis sangat baru |

---

## Detail per paket

### ✅ @types/node 20 → 22 — dikerjakan di PR ini

**Ini bukan "tertinggal", ini mismatch nyata.** Runtime produksi sudah
Node `v22.23.2`, `engines` di `package.json` menyatakan `">=22 <23"`, dan
seluruh workflow CI memakai `node-version: '22'`. Tapi `@types/node`
masih `^20.17.0` — artinya tipe yang dipakai saat typecheck menggambarkan
runtime yang **berbeda** dari yang sebenarnya dijalankan.

Konsekuensinya: API Node 22 yang dipakai di kode bisa lolos/gagal typecheck
dengan alasan yang salah, dan API yang sudah dihapus di Node 22 masih tampak
tersedia bagi compiler.

Bukti aman: `tsc --noEmit` lolos **tanpa satu error pun** setelah upgrade,
nol perubahan kode dibutuhkan.

### ⛔ lightweight-charts 4 → 5 — risiko tertinggi di daftar ini

v5 menyatukan pembuatan series ke satu fungsi `addSeries` dan menghapus
seluruh API `addXxxSeries` ([migrasi
resmi](https://tradingview.github.io/lightweight-charts/docs/migrations/from-v4-to-v5)).

Call-site yang harus ditulis ulang — dihitung dari repo, bukan perkiraan:

```
15  addLineSeries
 5  addCandlestickSeries
 5  addHistogramSeries
 3  addAreaSeries
 3  addBarSeries
 3  addBaselineSeries
--
34  total, tersebar di 5 berkas
```

Berkas terdampak: `components/TradingViewChart.tsx`,
`components/ProTradingViewChart.tsx`, `components/backtest/CandleReplayChart.tsx`,
`components/dashboard/downloadTechnicalReport.ts`, `app/fundamental/page.tsx`.

Ini jantung fitur teknikal aplikasi. 34 call-site dengan perilaku visual yang
hanya bisa diverifikasi mata, bukan oleh unit test — butuh PR khusus dengan
pemeriksaan chart manual per halaman.

### ⛔ tailwindcss 3 → 4

v4 adalah penulisan ulang engine (Rust/Oxide): `tailwind.config.js` dihapus
total dan diganti direktif `@theme` di CSS, plugin API berubah, palet warna
berubah. Repo ini masih punya `tailwind.config.js` (5.287 byte) dan
`postcss.config.js` — keduanya harus dimigrasi.

Risiko spesifik: perubahan palet warna bisa menggeser tampilan **seluruh**
halaman secara halus. Gerbang `responsive` dan test tablet di repo ini
memeriksa kelas CSS tertentu (lihat CLAUDE.md §2) — migrasi ini hampir pasti
memerahkan gerbang-gerbang itu dan perlu pembaruan terkoordinasi, bukan
tambal sulam.

### ⛔ react 18 → 19 (+ @types/react, @types/react-dom)

**Temuan yang mengubah prioritas:** `next@16.3.5` menerima
`react: "^18.2.0 || ^19.0.0"`. Jadi React 19 **bukan keharusan** untuk tetap
memakai Next 16 terbaru — tidak ada tekanan kompatibilitas. Upgrade ini murni
pilihan, dan karena menyentuh seluruh tree komponen (21 berkas animasi, 147
berkas ikon, seluruh halaman), nilainya tidak sebanding dengan risikonya
sekarang.

### ⛔ typescript 5.9 → 7.0 dan vitest 4 → 5

Keduanya mayor yang **baru sekali rilis**: `typescript` masih punya tag
`rc: 7.0.1-rc` bersamaan dengan `latest: 7.0.2`, dan `vitest` `latest: 5.0.0`
berdampingan dengan `beta 5.0.0-beta.7` / `rc 5.0.0-rc.4` — pola rilis yang
baru saja berpindah dari RC.

Prinsip: jangan jadi pengadopsi pertama compiler dan test runner sekaligus
pada basis kode dengan 2.973 test yang menjaga produksi. Biarkan matang
beberapa rilis patch dulu.

### ⛔ eslint 9 → 10

`eslint` 10 sudah ada (`latest: 10.10.0`, sementara 9.39.5 berstatus
`maintenance`), tetapi repo ini memakai `eslint-config-next@16.3.5` yang
terikat ekosistem ESLint 9. Upgrade mendahului dukungan resmi config Next
berarti gerbang lint pecah tanpa manfaat nyata.

### ⏸️ nodemailer 9 → 10

Hanya 2 call-site (`createTransport`, `sendMail` di
`modules/user/repository/email.repository.ts`) jadi secara mekanis kecil.
Tapi **seluruh kerentanan nodemailer sudah ditambal di 9.1.1** (PR #394),
sehingga tidak ada dorongan keamanan. Jalur pengiriman email melayani reset
password dan verifikasi akun; mengubahnya tanpa alasan kuat adalah risiko
tanpa imbalan.

### ⏸️ framer-motion 12 → 13, lucide-react 0.453 → 1.45, react-markdown 8 → 10, tailwind-merge 2 → 3

Sebaran luas (138 pemakaian `motion`, 18 `AnimatePresence`, 147 berkas ikon)
membuat biaya verifikasi tinggi sementara imbalannya kosmetik.
`tailwind-merge` v3 menyelaraskan diri dengan Tailwind v4, jadi wajar
dikerjakan **bersama** migrasi Tailwind, bukan sendirian.

---

## Rencana bertahap yang diusulkan

1. **PR ini** — `@types/node` → 22 (typecheck terbukti lolos, nol perubahan kode).
2. **Terjadwal, satu PR per paket** — `nodemailer` 10, lalu `react-markdown` 10,
   lalu `framer-motion` 13, lalu `lucide-react` 1.x. Masing-masing kecil dan
   bisa diputar balik sendiri-sendiri.
3. **PR khusus dengan verifikasi visual** — `lightweight-charts` 5 (34 call-site,
   perlu pemeriksaan chart manual per halaman).
4. **PR khusus dengan pembaruan gerbang** — `tailwindcss` 4 + `tailwind-merge` 3
   bersamaan.
5. **Tunggu matang** — `typescript` 7, `vitest` 5, `eslint` 10 (setelah
   `eslint-config-next` mendukung), `react` 19 + `@types/react` 19.

Prinsip yang dipakai: satu PR satu paket mayor, supaya kalau ada regresi,
penyebabnya tidak ambigu dan rollback-nya bersih.
