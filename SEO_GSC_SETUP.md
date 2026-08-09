# SahamLens — Google Search Console Setup

Kode SEO sudah menyiapkan title, meta description, canonical, robots.txt, sitemap.xml, dan WebSite structured data.
Bagian di bawah tetap harus dilakukan oleh pemilik domain karena membutuhkan akses Google/DNS.

## 1. Verifikasi Domain Property (disarankan)

1. Buka Google Search Console.
2. Add property → pilih **Domain**.
3. Masukkan `sahamlens.id`.
4. Google akan memberi TXT record verifikasi.
5. Tambahkan TXT tersebut di DNS provider domain SahamLens.
6. Kembali ke Search Console dan klik Verify.

Domain Property via DNS adalah pilihan yang paling lengkap karena mencakup seluruh protocol/subdomain.

## 2. Submit sitemap

Setelah deployment production selesai dan dua URL berikut bisa dibuka:

- `https://sahamlens.id/robots.txt`
- `https://sahamlens.id/sitemap.xml`

Buka Search Console → Sitemaps → masukkan:

`sitemap.xml`

Pastikan statusnya **Success**.

## 3. Request indexing homepage

Search Console → URL Inspection → masukkan:

`https://sahamlens.id/`

Lalu:

1. Test Live URL.
2. Pastikan page available to Google.
3. Lihat rendered page/screenshot jika tersedia.
4. Klik Request Indexing.

Lakukan juga untuk URL publik prioritas setelah homepage:

- `/home`
- `/breakout-radar`
- `/screener`
- `/market-pulse`
- `/news`
- `/calendar`

## 4. Optional URL-prefix verification token

Jika Anda memilih metode HTML meta tag untuk URL-prefix property, salin hanya nilai token Google ke environment variable Vercel:

`GOOGLE_SITE_VERIFICATION=<token>`

Jangan masukkan seluruh tag `<meta ...>`.

Setelah environment variable ditambahkan, redeploy production. Root layout akan menghasilkan `google-site-verification` meta tag otomatis.

## 5. Validasi setelah deploy

Periksa source/head homepage untuk memastikan:

- Title: `SahamLens - Screener & Analisis Saham IDX Berbasis AI`
- canonical: `https://sahamlens.id/`
- meta description tersedia
- `WebSite` JSON-LD tersedia
- robots tidak memblokir homepage
- sitemap hanya memuat halaman publik yang dapat diakses crawler

Catatan: Request Indexing tidak menjamin halaman langsung masuk index. Google tetap menentukan crawl/index berdasarkan sistemnya sendiri.
