# Kontribusi ke SahamLens

Repo ini publik supaya rumusnya bisa **diperiksa**, bukan supaya bisa dipakai ulang.
Bacalah `LICENSE` sebelum apa pun: seluruh hak dilindungi, dan visibilitas publik bukan
pemberian lisensi. Tidak ada izin untuk menjalankan, men-deploy, atau menurunkan karya dari
kode ini.

Itu tidak berarti kontribusi tidak diterima. Justru sebaliknya — transparansi tanpa jalur
koreksi cuma pajangan. Dokumen ini menjelaskan apa yang berguna dikirim, dan apa yang akan
ditolak.

## Yang paling berguna

**Koreksi metodologi.** Ini yang paling bernilai dan paling jarang datang. Kalau menurut
Anda ada komponen LensScore yang salah secara kuantitatif — bias yang tidak disebutkan,
kuantitas yang dihitung dua kali, ambang yang salah untuk sektor tertentu — buka issue
dengan argumennya. Rumus lengkapnya ada di
[`docs/audit/LENS_SCORE_FORMULA.md`](docs/audit/LENS_SCORE_FORMULA.md); tidak ada bagian yang
disembunyikan, jadi tidak ada alasan menebak.

Argumen yang bisa ditindaklanjuti menyebut **komponen mana**, **kenapa keliru**, dan
**perilaku apa yang seharusnya**. Contoh nyata perbaikan seperti ini ada di riwayat repo:
`scoreAsing()`/`scoreBandar()` dulu menyekor kuantitas yang sama dua kali, dan volume tinggi
dulu diberi poin penuh tanpa melihat arah harga.

**Laporan data salah.** Nama emiten keliru, angka fundamental yang tidak cocok dengan
laporan keuangannya, sektor yang salah klasifikasi. Sertakan tickernya, angka yang
ditampilkan, angka yang benar, dan sumbernya.

**Laporan bug.** Langkah reproduksi, yang diharapkan, yang terjadi.

## Yang akan ditolak

- **PR fitur baru tanpa diskusi lebih dulu.** Repo ini sedang memangkas cakupan, bukan
  menambah. Buka issue dulu.
- **Perubahan angka rumus tanpa argumen kuantitatif.** "Menurut saya bobot teknikal harusnya
  50" bukan argumen. Yang dibutuhkan: alasan, dan idealnya bukti out-of-sample.
- **Perubahan yang meluluskan gerbang dengan memberi makan polanya.** Kalau sebuah audit
  merah, perbaiki kodenya atau perbaiki gerbangnya — jangan taruh polanya di komentar.
  Ini pernah terjadi dan alasannya ada di `CLAUDE.md` §2.
- **Test yang di-skip, dimatikan, atau dikarantina untuk membuat CI hijau.**
- **Angka finansial karangan** dalam bentuk apa pun, termasuk di test dan dokumentasi.
  `npm run audit:zero-dummy` memindainya, dan kebijakan ini bukan soal rapi-rapi: aplikasi
  ini menampilkan angka yang dipakai orang untuk memutuskan uang.

## Alur kerja

**1. Baca `CLAUDE.md` lebih dulu.** Isinya bukan gaya penulisan kode, melainkan jebakan yang
sudah pernah menjatuhkan build produksi di repo ini. Setiap poinnya punya tanggal
kejadiannya.

**2. Jalankan preflight sebelum menyunting apa pun.**

```bash
npm run preflight
```

**3. Selalu lewat PR.** Jangan pernah push langsung ke `main`. Riwayat 19 Agustus 2026
memisahkannya dengan bersih: semua yang rusak datang dari commit langsung ke `main` berpesan
satu kata, sementara semua merge lewat PR bersih.

**4. Sebelum mengklaim selesai:**

```bash
npm run verify:prod
```

`typecheck && lint && test` saja **tidak cukup** — ketiganya pernah hijau di atas `main` yang
tidak bisa di-build. Hanya `verify:prod` yang menjalankan seluruh gerbang termasuk
`npm run build`. Kalau `package.json` berubah, `npm ci` dulu.

**5. Tunggu CI hijau sebelum merge.** PR yang ada tapi tidak ditunggu tidak menjaga apa pun.
Perhatikan juga bahwa job `build` memakai `needs: typecheck-lint-test` — kalau job pertama
merah, gerbang build **dilewati**, bukan gagal. Selama `main` merah, anggap tidak ada
informasi apa pun tentang kesehatan di belakangnya.

## Mengubah rumus atau bobot LensScore

Ini punya prosedur sendiri karena konsekuensinya melampaui satu berkas. Bobot yang berubah
tanpa kenaikan versi membuat Calibration Lab dan Bucket Backtest membandingkan angka dari
dua model berbeda seolah satu model — dengan spread, p-value, dan jumlah sampel yang
semuanya tetap terlihat meyakinkan. Kegagalan diam seperti itu yang paling mahal di sistem
scoring.

Urutannya, seluruhnya dalam satu PR:

1. Ubah angkanya di `shared/constants/lens-score-weights.ts` atau
   `modules/technical/service/scoring.service.ts`
2. Naikkan `version` di `modules/technical/config/lens-score-model.ts`
3. Perbarui `docs/audit/LENS_SCORE_FORMULA.md`
4. Perbarui golden vector di
   `modules/technical/service/__tests__/lens-score-snapshot.test.ts`
5. `npm run verify:prod`
6. Setelah merge & deploy: `npm run backfill:lens-history`

`lens-score-snapshot.test.ts` akan merah kalau salah satu dari langkah 2–4 terlewat. **Jangan
perbarui angkanya supaya hijau lagi** — putuskan dulu apakah perubahan skornya memang
disengaja.

## Menambah route API

Dua aturan yang bukan preferensi gaya:

- Parameter pertama route handler wajib `request: Request` — **jangan pernah opsional**.
  `tsc --noEmit` tidak melihat kelas galat ini sampai ada `next build`. Kalau test perlu
  memanggilnya tanpa argumen, buat `new Request(...)` di test.
- Route komputasi publik wajib memanggil `checkPublicComputeBudget` lalu membalas lewat
  `rateLimitResult(budget, '<pesan yang menyebut endpoint-nya>')`. Tanpa itu, setiap request
  diteruskan ke penyedia data hulu tanpa batas.
- `publicCacheHeaders` **hanya** untuk respons yang identik bagi semua pengunjung. Ini
  invarian keamanan, bukan performa: `CDN-Cache-Control: public` membuat Cloudflare
  menyajikan satu salinan ke siapa pun, jadi respons yang pernah berbeda menurut sesi akan
  bocor ke pengguna berikutnya. Daftarnya dikunci di `__tests__/public-cache-headers.test.ts`.

## Bahasa

Komentar kode, pesan commit, dan dokumentasi ditulis dalam **Bahasa Indonesia**, mengikuti
isi repo yang sudah ada. Komentar menjelaskan **kenapa**, bukan **apa** — kalau sebuah
keputusan punya tanggal dan insiden di belakangnya, tulis tanggalnya.

## Keamanan

Jangan buka issue publik untuk kerentanan keamanan. Kirim langsung ke pemilik repo.
