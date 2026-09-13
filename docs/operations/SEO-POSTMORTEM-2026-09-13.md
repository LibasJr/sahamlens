# Post-mortem SEO — 13 September 2026

Catatan ini ditulis supaya kejadian yang sama bisa dikenali dalam hitungan menit,
bukan jam. Semua angka di sini terukur dari produksi, bukan perkiraan.

## Ringkasan satu paragraf

Sepuluh halaman publik menyuruh Google mengabaikan dirinya sendiri selama entah
berapa lama, karena satu baris di `app/layout.tsx`. Perbaikannya kecil. Yang
memakan waktu justru dua kesalahan saya sendiri saat memperbaikinya: menggeneralisasi
dari satu halaman, lalu menulis gerbang yang mengunci kesalahan itu supaya lolos.

---

## 1. Bug utama: canonical warisan

### Gejalanya

Tidak ada. Tidak ada yang merah, tidak ada log, tidak ada alarm. Situs jalan normal.
Satu-satunya petunjuk adalah traffic organik non-brand yang datar — dan itu mudah
dijelaskan dengan seribu alasan lain.

### Akarnya

`app/layout.tsx` memuat:

```ts
alternates: { canonical: '/' },
```

Next **mewariskan** metadata root ke setiap halaman anak yang tidak menimpanya.
Hanya 24 dari 60 halaman punya metadata sendiri. Sisanya mengirim:

```html
<link rel="canonical" href="https://sahamlens.id">
```

Artinya setiap halaman berkata ke mesin pencari: "saya bukan halaman asli, yang
asli itu beranda."

Sitemap mendaftarkan 970 URL dan berkata "indeks ini semua". Canonical membatalkannya
satu per satu. **Canonical yang menang.**

### Terukur di produksi sebelum perbaikan

```
/screener        canonical: https://sahamlens.id
/breakout-radar  canonical: https://sahamlens.id
/market-pulse    canonical: https://sahamlens.id
/news            canonical: https://sahamlens.id
/calendar        canonical: https://sahamlens.id
/about           canonical: https://sahamlens.id
/transparency    canonical: https://sahamlens.id
/fundamental /dcf /moat /dividend  — sama
```

### Cara cek ulang dalam 10 detik

```bash
for u in / /screener /fundamental /dcf /moat /news /about; do
  printf "%-16s %s\n" "$u" \
    "$(curl -s "https://sahamlens.id$u" | grep -o '<link rel="canonical" href="[^"]*' | sed 's/.*href="//')"
done
```

Kalau semua baris memulangkan `https://sahamlens.id`, bug ini kembali.

### Perbaikannya

Buang canonical dari root layout. Halaman yang tidak mendeklarasikan apa pun akan
**self-canonical** — salah yang jauh lebih ringan daripada menunjuk beranda.

Lalu deklarasikan per halaman.

---

## 2. Jebakan: halaman `'use client'` tidak bisa punya metadata

Ini yang membuat perbaikannya tidak sesederhana "tambahkan canonical di tiap page".

Komponen client **tidak bisa** mengekspor `metadata`. Next mengabaikannya **tanpa
peringatan** — tidak ada error, tidak ada warning di build. Kode terlihat benar,
HTML-nya tidak berubah.

Semua halaman fitur SahamLens adalah `'use client'`:

```
screener  breakout-radar  market-pulse  news  calendar  about
fundamental  dcf  moat  dividend  backtest
risk  risk-calculator  macro  ownership-flow  pattern  earnings
compare  recommendations  status
```

### Solusinya: `layout.tsx` tipis di folder rute

```tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Screener Saham IDX',
  description: '...',
  alternates: { canonical: '/screener' },
};

export default function ScreenerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
```

Sebelas sudah dibuat. **Sisanya belum** — lihat bagian "Yang belum dikerjakan".

### Cara mengenali halaman yang butuh ini

```bash
cd /opt/sahamlens/app
for p in app/*/page.tsx; do
  d=$(dirname "$p")
  if head -1 "$p" | grep -q "use client" && [ ! -f "$d/layout.tsx" ]; then
    echo "BUTUH LAYOUT: $d"
  fi
done
```

---

## 3. Bug sampingan: judul dobel

```
Analisis Saham BBCA - Teknikal, Chart & Skor total | SahamLens | SahamLens
```

`app/layout.tsx` memakai `template: '%s | SahamLens'`. Halaman yang menulis sufiks
itu sendiri membuatnya muncul dua kali, dan judulnya terpotong di hasil pencarian.

**Aturan:** jangan pernah menulis `| SahamLens` di `title` halaman. Template root
sudah menambahkannya.

Gerbang `app/__tests__/seo-canonical.test.ts` sekarang menjaga ini.

---

## 4. KESALAHAN SAYA — yang paling penting dicatat

### Apa yang terjadi

`/technical/BBCA` mengirim dua `<h1>`: satu dari `Header.tsx` ("LensConsensus
Technical + Bandarmology"), satu dari halaman ("BBCA"). Saya perbaiki dengan
mengubah Header jadi `<p>` **tanpa syarat**.

`Header.tsx` dipakai SEMUA halaman. Di `/screener`, `/fundamental`, `/backtest`,
h1 dari Header itu **satu-satunya** judul halaman. Menghapusnya membuat halaman
kehilangan h1 sepenuhnya — memperburuk SEO, bukan memperbaikinya.

### Kenapa lolos dari gerbang saya

Gerbang yang saya tulis berbunyi:

```ts
expect(source).not.toMatch(/<h1[\s>]/);  // di Header.tsx
```

Ia memeriksa Header tidak punya h1, **tanpa menanyakan dampaknya ke halaman lain**.
Gerbang itu lulus sambil mengunci keputusan yang salah. Itu lebih buruk daripada
tidak ada gerbang, karena memberi rasa aman palsu.

### Yang menangkapnya

Playwright, di CI:

```
[chromium-app] › critical-path.spec.ts:58 › journey riset publik memuat
screener, fundamental, dan backtest — FAILED
```

Test itu merender halaman sungguhan dan menuntut `page.locator('h1').first()`
terlihat. Bukti primer mengalahkan test yang membaca kode.

### Perbaikan akhirnya

Prop opt-in, default aman:

```tsx
titleAs?: 'h1' | 'p';   // default 'h1'
```

Hanya halaman yang **sudah punya h1 sendiri** yang opt-in ke `'p'`. Saat ini hanya
`/technical/[symbol]` lewat `ClientHeader.tsx`.

### Penjaga arah di gerbang baru

Gerbang sekarang memindai `app/` dan `components/`: siapa pun menambah `titleAs="p"`
di halaman tanpa `<h1>` sendiri akan merah, dengan pesan menyebut berkas pelakunya.

Diuji negatif (wajib — gerbang yang belum pernah merah belum terbukti menjaga):

```
default diubah jadi 'p'              -> 2 failed   OK
titleAs="p" disuntik di /screener    -> 1 failed   OK
dipulihkan                           -> 32 passed  OK
```

---

## 5. Pola kesalahan yang berulang tiga kali hari ini

Ketiganya bentuknya sama: **menyimpulkan dari satu indikator tanpa menelusuri
ke sumbernya.**

| # | Kesimpulan saya | Kenyataan | Yang mengoreksi |
|---|---|---|---|
| 1 | "Sinkronisasi broker tidak jalan otomatis" — karena timer `sahamlens-broker-summary-scan` disabled | Pelakunya `sahamlens-idx-flow-sync.timer`, enabled dan aktif. Data tidak basi; 11 Sep memang hari bursa terakhir | `journalctl` unit yang benar |
| 2 | "Canonical ticker punya variasi ganda" — mengikuti dokumen SEO | Sudah dinormalisasi benar. `/technical/bbca.jk` -> canonical `/technical/BBCA` | `curl` empat varian |
| 3 | "Header h1 harus jadi p" — dari satu halaman ticker | Header dipakai semua halaman; tiga halaman kehilangan h1 | Playwright di CI |

**Aturannya:** nama unit bukan bukti fungsi. Dokumen bukan bukti keadaan. Satu
halaman bukan bukti untuk komponen bersama. Selalu `curl`/`journalctl`/render
sungguhan sebelum menyimpulkan.

---

## 6. Artefak yang membingungkan: `h1=0` di server lokal

Saat verifikasi, `/technical/BBCA` di `next start` lokal memulangkan **0** `<h1>`,
padahal seharusnya 1. Sempat terlihat seperti bug.

**Penyebabnya:** server lokal jalan tanpa `.env.production`. Halaman ter-suspend,
`<h1>` hanya ada di payload RSC dan belum ter-render ke HTML awal.

```
tanpa env : 75.210 byte, h1=0
dengan env: 88.177 byte, h1=1   (produksi: 89.365 byte)
```

**Aturan:** verifikasi HTML lokal **wajib** memakai `.env.production`.

```bash
cd <worktree>
cp /opt/sahamlens/app/.env.production .env.production && chmod 600 .env.production
npx next start -p 3199
# ... verifikasi ...
rm -f .env.production     # JANGAN lupa
```

`.env*` sudah ada di `.gitignore:57`, tapi tetap hapus setelah selesai.

### Mematikan server verifikasi

`pkill -f "next start"` **membunuh shell-nya sendiri** (polanya cocok dengan
perintah itu sendiri). Pakai port:

```bash
PID=$(ss -lptnH "sport = :3199" | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2)
[ -n "$PID" ] && kill "$PID"
```

---

## 7. Yang BELUM dikerjakan

### a. Halaman aplikasi privat mengundang indeksasi

```
/login       robots=index, follow
/signup      robots=index, follow
/dashboard   robots=index, follow
/watchlist   (default: index)
/portfolio   (default: index)
```

Halaman ini seharusnya `noindex`. Ini bagian "pemisahan dua lapisan" yang benar —
dan jauh lebih murah daripada rencana rename URL di dokumen SEO.

### b. `/calendar` tidak punya `<h1>`

Memakai `<h2 class="lens-page-title">Corporate Calendar`. **Praregresi**, sudah
begitu sebelum pekerjaan hari ini.

### c. Delapan halaman `'use client'` masih tanpa canonical sendiri

`risk`, `risk-calculator`, `macro`, `ownership-flow`, `pattern`, `earnings`,
`compare`, `recommendations`, `status`.

Belum mendesak: tidak ada di sitemap. Tapi kalau nanti dimasukkan sitemap, layout
tipisnya harus dibuat dulu.

### d. Structured data

Hanya ada di `app/page.tsx`. Nol di halaman ticker — padahal di sanalah
`BreadcrumbList` dan `FAQPage` paling berdampak.

---

## 8. Penilaian dokumen `arsitektur-seo-sahamlens.md`

Diagnosis sistemiknya bagus, **prioritas eksekusinya salah urutan**. Dokumen itu
disusun tanpa memeriksa situs sungguhan: tiga dari lima "masalah" di §2 sudah
beres, dan bug canonical yang membatalkan seluruh Fase 1 tidak disebut sama sekali.

| Bagian | Nilai | Alasan |
|---|---|---|
| §2 temuan struktur | 4/10 | 3 dari 5 "masalah" sudah beres |
| §3 rename URL ke Indonesia | 3/10 | risiko tinggi, imbalan rendah |
| §6 template emiten | 9/10 | ide terbaik, datanya sudah ada |
| §8 pisah sitemap | 7/10 | benar, belum mendesak di 970 URL |
| §9 prioritas | 2/10 | Fase 1 sia-sia selama canonical rusak |
| §10 pisah dua lapisan | 8/10 | strategi benar |

**Yang tidak direkomendasikan:**

- **Rename URL** (`/technical` -> `/analisa-teknikal`, `/saham/{kode}`). URL kata
  kunci persis sudah lemah sebagai faktor peringkat. Memindah 962 URL = kehilangan
  ekuitas, redirect chain, kerja berminggu-minggu.
- **`/belajar-saham` + `/glosarium`.** Itu proyek menulis, bukan engineering, dan
  tanpa moat — siapa pun bisa menulis "arti golden cross".

**Yang layak diambil:** hub `/saham/{kode}` yang menggabungkan teknikal + fundamental
+ valuasi + ownership + risiko dalam satu halaman. Itu moat sungguhan: data 962
emiten, ownership flow KSEI, broker summary 88 broker, LensScore berumus terbuka.
Tidak ada pesaing IDX yang punya itu.

**Urutan yang benar:** canonical dulu (selesai), tunggu Google merayapi ulang
(2-4 minggu), baru nilai apakah layak lanjut ke hub emiten.

---

## 9. Gerbang yang sekarang menjaga

`app/__tests__/seo-canonical.test.ts` — 32 assertion:

- root layout **tidak** menetapkan canonical warisan
- beranda dan `/transparency` menyatakan canonical sendiri
- 11 halaman client punya `layout.tsx` dengan title + description + canonical
- halaman itu memang `'use client'` (alasan layout terpisah masih berlaku)
- judul halaman ticker tidak menduplikasi sufiks `| SahamLens`
- `Header` memakai tag yang bisa dipilih pemanggil, default `'h1'`
- halaman ticker mengirim `titleAs="p"` dan menyisakan tepat satu `<h1>`
- **penjaga arah:** tidak ada halaman lain memakai `titleAs="p"` tanpa `<h1>` sendiri

Mengikuti CLAUDE.md §2: `stripComments()` sebelum mencocokkan pola, normalisasi
pemisah path, dan penjaga jumlah supaya pemindai yang rusak ketahuan.

---

## 10. Referensi cepat

| Masalah | Perintah |
|---|---|
| Canonical semua halaman | lihat §1 |
| Halaman client tanpa layout | lihat §2 |
| Hitung `<h1>` | `curl -s URL \| grep -oiE '<h1[ >]' \| wc -l` |
| Judul dobel | `curl -s URL \| grep -o '<title>[^<]*'` |
| Halaman `noindex` | `curl -s URL \| grep -o 'name="robots" content="[^"]*'` |
| Jumlah URL sitemap | `curl -s https://sahamlens.id/sitemap.xml \| grep -c '<loc>'` |

**PR terkait:** #407 (canonical + judul + h1).
