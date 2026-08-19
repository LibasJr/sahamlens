# Catatan untuk agen yang menyunting repo ini

Isinya bukan gaya penulisan kode, melainkan jebakan yang sudah pernah menjatuhkan
build produksi di repo ini. Semua yang tertulis di sini punya kejadiannya, bukan
kehati-hatian teoretis. Baca sebelum menyunting.

## 1. `npm run typecheck` TIDAK cukup untuk membuktikan tipe aman

`tsc --noEmit` hanya melihat tipe route bikinan Next setelah ada build yang
menghasilkannya di `.next/types/**`. Selama belum pernah `npm run build`, seluruh
kelas galat itu tidak terlihat.

Terukur 19 Agustus 2026: tiga route menulis `GET(request?: Request)`. `typecheck`,
`lint`, dan 1975 test semuanya hijau; `next build` gagal dengan

```
Type 'Request | undefined' is not assignable to type 'NextRequest | Request'.
```

**Aturan:** parameter pertama route handler wajib `request: Request` — jangan pernah
opsional. Kalau test perlu memanggilnya tanpa argumen, buat `new Request(...)` di
test, bukan bikin parameternya opsional.

**Sebelum mengklaim pekerjaan selesai, jalankan `npm run verify:prod`.** Itu satu-satunya
perintah yang menjalankan seluruh gerbang, termasuk `npm run build` dan `audit:bundle`.
`typecheck && lint && test` saja pernah hijau di atas `main` yang tidak bisa di-build.

## 2. Gerbang yang memindai kode sumber

Repo ini punya banyak "gerbang": test dan skrip audit yang membaca berkas sumber lalu
mencocokkan pola. Semuanya rapuh dengan cara yang sama.

**Buang komentar sebelum mencocokkan pola.** `lib/api/fetcher.ts` menjelaskan dirinya
dengan menulis `fetch('/api/...')` di komentar dokumentasi; ratchet adopsi
menghitungnya sebagai pemanggilan nyata dan gagal `0 -> 1` pada repo yang tidak
menambah satu pun pemanggilan. Pakai `stripComments()` seperti di
`scripts/audit-adoption-ratchet.mjs` dan `quote-summary-modules.test.ts`.

**Normalkan pemisah path.** `path.relative` mengembalikan `app\api\...` di Windows.
Gerbang yang membandingkannya dengan daftar ber-`/` akan menandai SETIAP berkas
sebagai pelanggar di Windows dan tidak pernah benar-benar memeriksa apa pun. Tutup
dengan `.split(path.sep).join('/')`.

**Kalau berkas yang dijaga pindah, pindahkan gerbangnya.** Gerbang yang menunjuk path
lama tidak gagal — ia lulus tanpa memeriksa apa pun, dan itu jauh lebih buruk. Dua
kejadian: gerbang `quoteSummary` masih mencari `app/api/stock/[ticker]/route.ts`
setelah pemanggilnya pindah ke `modules/technical/service/`, dan test tablet masih
membaca `app/screener/page.tsx` setelah markup tabelnya pindah ke
`components/screener/ScreenerResults.tsx`.

Karena itu gerbang pemindai wajib punya penjaga jumlah, seperti di
`quote-summary-modules.test.ts`:

```ts
it('menemukan pemanggil quoteSummary untuk diperiksa', () => {
  // Kalau angka ini jatuh ke nol, pemindainya yang rusak - bukan berarti tidak ada bug.
  expect(findings.length).toBeGreaterThan(5);
});
```

**Jangan pernah meluluskan gerbang dengan menaruh polanya di komentar.**
`app/screener/page.tsx` pernah diberi komentar berisi daftar kelas persis yang
di-grep test tablet. Itu membuat gerbangnya hijau karena prosa, sementara markup
sungguhannya bebas berubah. Kalau sebuah gerbang merah, perbaiki kodenya atau
perbaiki gerbangnya — jangan beri makan polanya.

**Test yang memanggil pemindai lewat `execFileSync` butuh timeout eksplisit.** Batas
bawaan vitest 5 detik cukup saat berjalan sendirian, tapi lewat saat suite penuh
berjalan paralel — dan gagalnya muncul sebagai "timeout", bukan sebagai hal yang
sebenarnya diuji. Pakai `}, 30_000);`.

## 3. Kontrak API

**`runController` menambahkan `meta.requestId` ke setiap body objek, secara aditif.**
Test yang menegaskan body lengkap harus ikut menyebutnya, bukan mengabaikannya:

```ts
expect(json).toEqual({ ...cached, meta: { requestId: expect.any(String) } });
```

`toMatchObject` juga lulus, tapi ia berhenti memeriksa field yang tidak disebut —
pilih `toEqual` kecuali memang ada alasan.

**Route komputasi publik wajib memanggil `checkPublicComputeBudget`** lalu membalas
lewat `rateLimitResult(budget, '<pesan yang menyebut endpoint-nya>')`. Route tanpa
penjaga ini meneruskan setiap request ke penyedia data hulu tanpa batas.

**`publicCacheHeaders` hanya untuk respons yang identik bagi semua pengunjung.**
Daftarnya dikunci di `__tests__/public-cache-headers.test.ts`. Ini invarian keamanan,
bukan performa: `CDN-Cache-Control: public` membuat Cloudflare menyajikan satu salinan
ke siapa pun, jadi respons yang pernah berbeda menurut sesi akan bocor ke pengguna
berikutnya. Menambah route ke daftar itu berarti menyatakan ia tidak pernah membaca sesi.

## 4. Dependensi dan deploy

**Kalau `package.json` berubah, `git pull` di VPS tidak cukup — wajib `npm ci`.**
Kejadian 19 Agustus 2026: `swr` ditarik tanpa `npm ci` dan build melaporkan
`Can't resolve 'swr'` di tiga berkas halaman, seolah kodenya yang rusak. Hook
`prebuild` (`scripts/check-deps-installed.mjs`) sekarang menghentikannya lebih dulu
dengan pesan yang menyebutkan perintah perbaikannya — jangan dilepas.

**Jalur deploy yang benar adalah Actions -> Deploy VPS**, bukan `git pull` manual.
Workflow menjalankan `verify:prod` di runner GitHub lebih dulu; VPS baru disentuh
setelah semuanya lolos. `git pull` manual melewati gerbang itu seluruhnya dan
memaksa VPS memikul build 5+ menit sambil tetap melayani pengguna. Jalur manual di
`docs/operations/DEPLOYMENT.md` memang ada, tapi statusnya jalur darurat.

**Setelah merge, pastikan tidak ada penanda konflik yang ikut ter-commit:**

```bash
git grep -nE "^<<<<<<< |^>>>>>>> "
```

Ini pernah terjadi dan lolos ke `main` — tujuh berkas, termasuk satu route produksi
yang karenanya tidak bisa di-parse sama sekali.

## 5. Lingkungan lokal

**Jangan menjalankan `next dev` kedua terhadap `.next` yang sama.** Dua instance
Turbopack berebut berkas yang sama menghasilkan `os error 32` ("used by another
process") dan `build-manifest.json` hilang — gejalanya SETIAP route membalas 500,
yang terbaca persis seperti aplikasi rusak total. Kalau sudah terjadi: matikan
prosesnya, `rm -rf .next`, jalankan ulang satu saja.

**Jangan commit `next-env.d.ts` setelah menjalankan `next dev`.** Next menulis ulang
isinya ke `.next/dev/types/...`, sedangkan build produksi memakai `.next/types/...`.
Berkasnya sendiri sudah menyatakan "should not be edited".
