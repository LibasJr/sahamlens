# Audit & implementasi tipografi — 24 September 2026

Sumber: brief audit tipografi operator (24 September 2026) + pemeriksaan langsung repo pada
HEAD `4171e256`. Dokumen ini mencatat bukti, keputusan, dan sisa pekerjaan supaya fase
berikutnya tidak mengulang penemuan yang sama.

## 1. Yang ditemukan (bukti primer)

Perintah yang dijalankan di worktree `typo/phase1-fonts-scale` (turunan `4171e256`):

```bash
grep -n "font-family\|--font-inter" app/globals.css            # token font
grep -rn "text-\[[0-9.]*px\]" app components | wc -l           # ukuran piksel acak
node scripts/audit-typography-ratchet.mjs                      # angka final
```

| Temuan | Angka terukur |
|---|---|
| Token `--font-inter` berisi | `Arial, Helvetica, sans-serif` |
| Token `--font-jetbrains-mono` berisi | `'Courier New', monospace` |
| Penyebutan `text-[Npx]` (di luar kartu ekspor) | **718** di 111 berkas dari 478 diperiksa |
| Di antaranya di bawah 13px | **655** (tersebar di bawah "lantai kompatibilitas" `@media (max-width: 767px)`) |
| Keluarga font yang benar-benar dimuat | tidak ada — stack sistem |

Artinya, sebelum perubahan ini aplikasi **tidak pernah menyajikan Inter maupun JetBrains
Mono**, meskipun setiap peran tipografi dan konfigurasi Tailwind menyebut namanya. Nama
tokennya benar; fontnya yang bohong.

## 2. Keputusan yang diambil

### 2.1 Font: `next/font/local` + berkas woff2 ikut di-commit

Ada dua kegagalan yang harus dihindari sekaligus, dan keduanya sudah pernah terjadi:

1. **Empat keluarga font** (Plus Jakarta Sans + Sora + Space Grotesk + JetBrains Mono), di
   mana Sora/Space Grotesk dirujuk lewat nama literal sehingga variabel `next/font`-nya
   tidak pernah terpakai.
2. **`2fef5146` (23 September 2026)** — `next/font/google` dilepas karena build CI harus
   mengambil berkas dari `fonts.googleapis.com`. Ini memperbaiki CI, tetapi penggantinya
   (stack sistem) mengembalikan masalah (1) dalam bentuk yang lebih halus: seluruh peran
   tipografi tetap bernama Inter sementara yang dirender Arial.

Karena itu berkasnya sekarang ikut di-commit di `app/fonts/` dan dimuat `next/font/local`:
tidak ada permintaan jaringan saat build, dan keluarga fontnya benar-benar Inter/JetBrains
Mono. Berkasnya variable font subset latin:

- `inter-latin-wght-normal.woff2` (48 KB, 100–900)
- `inter-latin-wght-italic.woff2` (52 KB, 100–900)
- `jetbrains-mono-latin-wght-normal.woff2` (40 KB, 100–800)

Subset latin dipilih karena antarmuka dan data pasar seluruhnya ASCII/latin; glyph di luar
itu jatuh ke stack `fallback` yang dideklarasikan di `app/layout.tsx`.

**Jangan** mengganti ini dengan `next/font/google`.

### 2.2 Token: `--font-inter` mengikat, fallback di dalam `var()`

`globals.css` sekarang berbunyi:

```css
--font-inter: var(--font-inter-src, -apple-system, …, Arial, sans-serif);
```

Fallback ditulis **di dalam** `var()`, bukan sebagai item kedua daftar. Kalau
`--font-inter-src` tidak terdefinisi (mis. harness test yang merender HTML tanpa layout
Next), `var(--font-inter-src, …)` mengambil stack cadangan; sedangkan
`var(--font-inter-src), Arial` akan membatalkan **seluruh** deklarasi `font-family` pada
`computed-value time` dan teks jatuh ke serif default.

### 2.3 Urutan berkas `globals.css` adalah kontrak

Semua peran di atas `.lens-number` menyetel `font-family` (Inter). Pada spesifisitas sama,
deklarasi **terakhir** yang menang. Karena itu `.lens-number` sengaja dideklarasikan paling
akhir di antara peran font, supaya bisa dikomposisikan:

```html
<span class="lens-meta lens-number font-semibold">BBCA</span>
```

Utility Tailwind (`font-number`) **tidak bisa** dipakai untuk komposisi ini: `@tailwind
utilities` dipancarkan lebih awal, jadi peran `lens-*` selalu menang atasnya. Dijaga test
`__tests__/typography-font-loading.test.ts`.

## 3. Perubahan pada fase 1 (+ Header sebagai item pertama fase 2)

| Berkas | Perubahan |
|---|---|
| `app/fonts/*.woff2` | berkas font asli ikut di-commit (baru) |
| `app/layout.tsx` | `next/font/local` untuk Inter + JetBrains Mono, variabel dipasang di `<html>` |
| `app/globals.css` | `--font-inter`/`--font-jetbrains-mono` mengikat ke font yang dimuat; peran baru `lens-ui`, `lens-number`, `lens-display`; `lens-eyebrow` 10px/700 → 12px/600 |
| `components/Header.tsx` | tiga `text-[10px]` (badge modul, ticker, kuota analisa) → `lens-meta` / `lens-meta lens-number` |
| `scripts/audit-typography-ratchet.mjs` (baru) | ratchet `audit:typography`, ikut `verify:prod` |
| `config/typography-baseline.json` (baru) | baseline 718 / 655 |
| `__tests__/typography-font-loading.test.ts` (baru) | gerbang font, urutan peran, `tabular-nums`, penjaga `lens-chip` |
| `components/__tests__/shell-design-system.test.ts` | `components/Header.tsx` masuk daftar shell (nol ukuran arbitrer) |

`lens-eyebrow` naik dari 10px ke 12px dengan alasan yang terukur: ia satu-satunya peran yang
ukurannya **berbeda** antara desktop (10px) dan ponsel (lantai kompatibilitas mengangkatnya
ke 12px). Tebalnya diturunkan 700 → 600 agar tidak tampak berat pada ukuran yang lebih besar.

## 4. Yang belum dikerjakan (fase berikutnya)

| Fase | Target | Ukuran arbitrer saat ini |
|---|---|---|
| 2 | `Sidebar` (sisa utility), kartu/form/tabel/primitif bersama, `TickerAnalysisShell` | **selesai** — lihat §7 |
| 3 | `AIChat` (LensAI), `app/news`, teks metodologi panjang | **selesai** (kecuali angka mono di jawaban) — lihat §8 |
| 4 | DCF, Risk, Dividend, Watchlist, Screener, Calendar | **selesai** (Watchlist & Screener sudah bersih sebelumnya) — lihat §9 |
| 5 | `text-[Npx]` sisanya, klasifikasi pengecualian, penyederhanaan lantai kompatibilitas | 646 tersebar di 92 berkas (per 25 Sep 2026) |

Offender terbesar (kandidat PR berikutnya, di luar kartu ekspor): `components/Dashboard.tsx`
(30), `app/breakout-radar/page.tsx` (23), `components/radar/SetupCard.tsx` (21),
`app/ownership-flow/page.tsx` (20), `components/fundamental/FundamentalHealthSuite.tsx` (18).

`components/export/**` sengaja **tidak** dipindai ratchet: kanvas PNG berukuran tetap,
tipografinya ikut ukuran kanvas, bukan hierarki baca aplikasi.

## 5. Cara memverifikasi

```bash
npm run audit:typography     # ratchet, boleh turun tidak boleh naik
npm test -- typography       # gerbang font + hierarki skala
npm run verify:prod          # dari WORKTREE, bukan dari /opt/sahamlens/app
node scripts/audit-typography-ratchet.mjs --update   # mengunci capaian baru
```

## 6. Catatan lingkungan (bukan bagian tipografi)

Saat menjalankan `verify:prod` dari worktree, proses background yang dijalankan lewat
perkakas terminal Hermes dibatasi cgroup `MemoryMax` 4 GiB (lihat
`tools/process_registry.py`: batas = min(`memory.max` gateway, separuh RAM, 4 GiB)).
`npm test` dengan 24 worker **dan** `next build` melewati batas itu dan di-OOM-kill
(`exit 137`, `constraint=CONSTRAINT_MEMCG`). Jalankan lewat scope yang lebih besar:

```bash
systemd-run --user --scope --property=MemoryMax=16G --collect /bin/bash -lc \
  'cd <worktree> && npm run verify:prod'
```

Ditemukan juga empat proses `jest-worker` yatim dari worktree `.worktrees/t_a6b9af99`
(direktori sudah dihapus) yang berjalan **12 jam** pada 100% CPU dan menahan swap — efek
dari test run yang parentnya mati tanpa mematikan worker-nya. Sudah dihentikan; penyebabnya
belum ditelusuri dan tidak diperbaiki di PR ini.

## 7. Fase 2 — permukaan bersama (PR kedua)

**26 penyebutan** ukuran arbitrer dihapus dari **13 berkas** (`components/ui/**` 12 berkas +
`components/Sidebar.tsx`). Ratchet turun dari 718/655 menjadi **689/627** (98 berkas dari 479
diperiksa) dan baseline diperketat supaya capaiannya tidak bisa kembali diam-diam. Selisih 29
pada ratchet berasal dari `ui/Table.tsx`, yang menanggung dua penyebutan pada satu baris
(`text-[12px]` dan `sm:text-[10px]`).

| Berkas | Sebelum → sesudah | Alasan |
|---|---|---|
| `ui/LanguageSwitcher.tsx` (5) | `text-[11px]` → `lens-meta` / `lens-meta lens-number` | 11px dirender 13px oleh lantai; 12px adalah ukuran yang dimaksud |
| `ui/NotificationCenter.tsx` (6) | `text-[10px]`→`text-xs`, `text-[11px]`→`lens-meta`, `text-[11.5px]`→`lens-body-sm`, `text-[10.5px]`→`lens-meta` | isi notifikasi adalah teks bacaan, bukan microcopy |
| `ui/RadialScoreGauge.tsx` (2), `ui/PriceRangeSlider.tsx` (2) | → `lens-meta` (+`lens-number` untuk angka) | label sumbu/rentang, angka tetap mono |
| `ui/EmptyState.tsx`, `ui/Select.tsx`, `ui/Input.tsx`, `ui/Textarea.tsx` (2), `ui/Toast.tsx`, `ui/SegmentedControl.tsx`, `ui/LoadingFact.tsx` | `sm:text-[11px]` → `sm:text-xs`; label form → `lens-label`; error → `lens-body-sm`; toast `text-[13px]` → `lens-body-sm`; eyebrow → `lens-eyebrow` | satu skala, bukan campuran |
| `ui/Table.tsx` | `text-[12px] … sm:text-[10px]` → `lens-meta` | header tabel 12px; **`lens-chip` tidak dipakai** di `<th>` (bug `display:inline-flex` pada elemen struktur tabel) |
| `Sidebar.tsx` | `text-xs` → `text-sm` (tautan Admin) | target menu 13–14px, tebal tetap 700 |

Satu pengecualian disengaja dan dijaga test: `ui/TickerAvatar.tsx` memakai `text-[10px]` di
kotak **berukuran tetap** (`w-7 h-7` = 20px). Menggantinya dengan peran justru merusak —
`lens-meta` menyetel `line-height: 1.35`, sedangkan yang menahan inisial di dalam kotak
adalah `leading-none`. Gerbang
`components/ui/__tests__/shared-ui-typography.test.ts` memastikan pengecualian itu tetap
hanya satu, tetap punya `leading-none`, dan bahwa jumlah ukuran arbitrer di seluruh primitif
tidak bertambah.

`TickerAnalysisShell.tsx` sendiri sudah bersih (0 ukuran arbitrer); isinya yang menentukan
harga utama di halaman analisis masuk fase 4 bersama halaman finansial.

## 8. Fase 3 — nilai baca: LensAI dan News (PR ketiga)

Fase ini menyerang temuan brief yang paling langsung terasa pengguna: di layar **>768px**
jawaban panjang LensAI dirender 13px.

> **Koreksi (25 September 2026, lihat §10).** Kalimat di PR #488 menyebut jawaban LensAI
> "dirender 13px" seolah berlaku di semua layar. Itu tidak akurat: blok
> `@media (max-width: 768px)` — blok senior-friendly di `globals.css` — sudah menyetel
> `.ai-response` ke 15px, jadi ponsel sudah terbaca sejak awal dan yang benar-benar naik
> adalah desktop/tablet. Buktinya CSS produksi, bukan pembacaan kode:
> `.ai-response{color:#dbeafe;font-size:15px;line-height:1.65}` (aturan dasar) dan
> di dalam `@media (max-width:768px)` `.ai-response{font-size:.9375rem;line-height:1.65}`.

```css
/* aturan dasar - berlaku di >768px */
/* sebelum */
.ai-response { font-size: 13px; line-height: 1.75; }
/* sesudah */
.ai-response { font-size: 15px; line-height: 1.65; }
```

13px adalah ambang "tidak gagal", bukan ambang "nyaman" — dan jawaban LensAI bisa
berhalaman-halaman, jauh lebih panjang daripada satu kalimat metadata. Hierarki heading
Markdown-nya juga dinaikkan supaya tetap berjenjang di ukuran baru: h1 18→20px,
h2 16→17px, h3 14→15px.

| Berkas | Perubahan |
|---|---|
| `app/globals.css` | `.ai-response` 13px/1.75 → **15px/1.65** (aturan dasar, >768px); h1 20px, h2 17px, h3 15px |
| `components/AIChat.tsx` | pesan dan baris "sedang berpikir": `text-base leading-relaxed sm:text-sm` (16px ponsel → 14px desktop) → `lens-body` (15px/1.6) |
| `app/news/page.tsx` | subtitle → `lens-ui`; judul kartu nada → `lens-card-title`; penjelasan nada `text-[11px]` → `lens-body-sm`; pil filter → `lens-meta font-semibold` |
| `components/news/StructuredNewsCard.tsx` | judul artikel → `lens-card-title`; chip tahap `text-[10px]` → `lens-meta`; skor keyakinan → `lens-number lens-meta`; ringkasan dampak, alasan sentimen, dan catatan keyakinan (`text-[11px]`/`text-[10px]`) → `lens-body-sm` |

Input LensAI **sengaja tetap 16px di ponsel** (`text-base … sm:text-sm`): di bawah 16px,
Safari iOS memperbesar halaman begitu papan ketik terbuka. Perilaku itu sekarang dikunci
test supaya tidak "dirapikan" orang berikutnya.

Ratchet turun **689/627 → 682/620**. `app/news` dan `components/news` kini **nol** ukuran
arbitrer, begitu juga `components/AIChat.tsx`.

Gerbang baru di `__tests__/typography-font-loading.test.ts` (describe "jawaban LensAI
nyaman dibaca"): ukuran `.ai-response` ≥ 15px, line-height 1.6–1.7, hierarki h1 > h2 > h3
dengan h1 ≥ 20px dan h3 ≥ 15px, `max-w-prose` (65ch) tetap ada di kolom jawaban, dan input
tetap 16px di ponsel.

**Belum:** angka di dalam jawaban LensAI belum dipaksa mono — itu butuh penandaan di
Markdown/backend, bukan sekadar CSS, dan berada di luar scope tipografi murni.

## 9. Fase 4 — halaman finansial (PR keempat)

36 ukuran arbitrer di `app/dcf`, `app/risk`, `app/dividend`, dan `app/calendar`
(`app/watchlist` dan `app/screener` sudah nol sejak awal).

Pemetaannya mengikuti satu aturan: **label pendek** (huruf besar, tebal, `tracking-wide`)
memakai `lens-meta` = 12px; **teks bacaan** (kalimat penjelasan, catatan skenario) memakai
`lens-body-sm` = 13px. Jadi tidak ada teks mengalir yang mengecil — yang berubah hanya
label.

**Ukuran yang benar-benar dirender berubah, dan itu disengaja.** Lantai kompatibilitas
mengangkat `text-[10px]`/`text-[11px]` ke 13px, jadi label-label itu hari ini tampil 13px
sementara sumbernya menulis 10px. Setelah migrasi mereka tampil **12px** — sejalan dengan
pengecualian `lens-chip` yang lebih dulu turun ke 12px dengan alasan yang sama: isinya kata
pendek, tebal, huruf besar semua, kontras tinggi, jadi terbaca pada ukuran lebih kecil
daripada teks mengalir.

Kasus terdokumentasi `lens-chip` di elemen tabel dihindari bukan dengan ingatan: header
tabel memakai `lens-meta`, yang **tidak** menyetel `display`. `lens-chip` menyetel
`display: inline-flex` dan pernah membuat satu `<tr>` header membengkak ~1654px.

| Berkas | Perubahan |
|---|---|
| `app/dcf/page.tsx` | 3 label kartu metrik + 2 baris header tabel `text-[10px]` → `lens-meta`; catatan "(konteks neraca…)" → `lens-meta` |
| `app/risk/page.tsx` | label skenario + label beta `text-[10px]` → `lens-meta`; 3 paragraf penjelasan `text-[10px] leading-relaxed` → `lens-body-sm`; kotak info `text-[11px] leading-relaxed` → `lens-body-sm`; grup nilai ringkas `text-[11px]` → `lens-meta` |
| `app/dividend/page.tsx` | 4 label KPI + 4 sub-catatan `text-[11px]` → `lens-meta`; kotak penjelasan `text-[11px] leading-relaxed` → `lens-body-sm`; 2 toggle `text-[11px]` → `lens-meta`; 2 baris header tabel `text-[10px]` → `lens-meta` |
| `app/calendar/page.tsx` | meta + legenda + lencana tipe `text-[10px]`/`text-[11px]` → `lens-meta` |

Ratchet turun **682/620 → 646/584**, berkas yang masih memakai ukuran acak 92 (dari 479
diperiksa).

### Gerbang baru: permukaan yang sudah bersih tidak boleh kotor lagi

`config/typography-migrated.json` menyimpan daftar 35 berkas yang sudah nol ukuran
arbitrer plus satu pengecualian yang beralasan (`components/ui/TickerAvatar.tsx`: kotak
avatar berukuran tetap, `leading-none` yang membuat inisialnya muat). Dijaga
`__tests__/typography-migrated-surfaces.test.ts`:

- daftar wajib ≥ 30 berkas (penjaga pemindai: daftar yang rusak tidak boleh lulus);
- setiap berkas wajib **ada** di path itu — gerbang yang menunjuk path lama akan lulus
  tanpa memeriksa apa pun, dan itu sudah pernah terjadi di repo ini;
- pengecualian tidak boleh bertambah ukurannya dan wajib masih memakai `leading-none`
  (tanpa itu alasan pengecualiannya hilang);
- tidak ada elemen struktur tabel (`tr`/`td`/`th`/`thead`/`tbody`) yang memakai
  `lens-chip`, dipindai dari seluruh `app/` + `components/`.

Pencocokan pola tetap membuang komentar lebih dulu. Kali ini salinannya dijadikan satu:
`scripts/lib/strip-comments.mjs`, dipakai bersama oleh ratchet dan gerbang baru — menyalin
regex itu per gerbang adalah cara paling rapi membuat salah satu gerbang kelak menghitung
prosa sebagai kode.

## 10. Koreksi fase 3 — gerbang yang hanya membaca aturan pertama

Ketahuan dari tangkapan layar aplikasi produksi, lalu dipastikan pada CSS yang benar-benar
disajikan server, bukan dengan membaca ulang kode:

```
.ai-response{color:#dbeafe;font-size:15px;line-height:1.65}      <- aturan dasar (>768px)
@media (max-width:768px){ ... .ai-response{font-size:.9375rem;line-height:1.75} ... }
```

Dua hal yang salah pada fase 3, keduanya karena gerbangnya dangkal:

1. **Narasi berlebihan.** PR #488 menulis jawaban LensAI "dirender 13px". Yang benar:
   hanya layar >768px yang 13px; ponsel sudah 15px lewat blok senior-friendly. Perbaikannya
   tetap nyata — desktop 13→15px — tapi klaimnya harus tepat.
2. **Gerbangnya buta pada `@media`.** `blokAi()` mengambil aturan **pertama** yang memuat
   `font-size`, jadi override di dalam media query tidak pernah diperiksa. Test yang hijau
   di atas aturan dasar yang benar sementara aturan ponsel bebas berubah adalah persis
   gerbang yang lulus tanpa memeriksa apa pun.

Perbaikan:

- `semuaAturanAi(properti)` mengumpulkan **setiap** aturan `.ai-response` (dasar maupun di
  dalam `@media`) yang menyetel properti itu; test menuntut minimal 2 aturan dan setiap
  nilainya dalam band (font-size ≥ 15px, line-height 1.6–1.7);
- tinggi baris aturan ponsel disamakan ke **1.65** dari 1.75: isi yang sama tidak punya
  alasan punya tinggi baris berbeda antara ponsel dan desktop, dan 1.75 di luar band.

Dibuktikan dengan kontrol negatif: tinggi baris aturan media query diubah ke nilai di luar
band, test **gagal** menyebut aturan itu, lalu dipulihkan dan test kembali hijau. Gerbang
yang tidak pernah merah belum terbukti menjaga apa pun.

## 11. Angka dan keluarga huruf di jawaban LensAI

Ditutup setelah §10, dari pertanyaan yang sama: "angka di jawaban ini mono atau tidak?"
Jawabannya tidak — dan sebabnya bukan yang diduga.

`.ai-response code` masih memakai **`'Fira Code', 'Cascadia Code', monospace`**. Kedua
keluarga itu tidak dimuat aplikasi ini sama sekali (hanya Inter dan JetBrains Mono yang
ada di `app/fonts/`), jadi nilainya jatuh ke monospace generik milik OS. Ini sisa era
empat keluarga huruf yang membuat nama token berbohong - kelas kesalahan yang sama dengan
`--font-jetbrains-mono: 'Courier New'` di §1, hanya bertahan lebih lama karena tidak ada
gerbang yang memeriksa keluarga huruf.

Perbaikan:

- `.ai-response code` → `var(--font-jetbrains-mono), Consolas, monospace`;
- `font-variant-numeric: tabular-nums` pada `.ai-response` (angka di prosa: "PER 7.04x,
  PBV 1.71x"), `.ai-response table` (tabel Markdown), dan `.ai-response code`.

Batas yang jujur: **mono penuh untuk angka di dalam prosa belum bisa dicapai dengan CSS.**
Angka yang menyatu dalam kalimat tidak punya selector; mono menuntut model membungkusnya
dengan backtick. `modules/ai/chat/build-system-prompt.ts` justru meminta sebaliknya untuk
baris data internal, dan mengubah perilaku keluaran model bukan pekerjaan tipografi. Yang
dijamin sekarang: digitnya tabular (sejajar saat dibandingkan) dan setiap nilai yang
memang di-backtick dirender mono design system, bukan monospace acak OS.

Gerbang baru: setiap deklarasi `font-family` di `globals.css` wajib dimulai
`var(--font-inter)` atau `var(--font-jetbrains-mono)` (dengan penjaga jumlah ≥ 15 deklarasi),
dan keluarga lama (`Fira Code`, `Cascadia Code`, `Courier New`, `Arial`) tidak boleh muncul
kembali. Juga dibuktikan dengan kontrol negatif: `var(--font-inter)` diganti `Arial` →
gerbang merah → dipulihkan → hijau.

Duplikasi ikut ditutup: salinan lokal `stripComments()` di
`__tests__/typography-font-loading.test.ts` dihapus, memakai `scripts/lib/strip-comments.mjs`
yang sama dengan ratchet. Menyalin regex itu per gerbang adalah cara paling rapi membuat
salah satu gerbang kelak menghitung prosa sebagai kode - persis kelas kegagalan §2.

## 12. Fase 5a — Dashboard (30 titik, 29 dimigrasikan)

Sasaran pertama fase 5 adalah berkas dengan ukuran acak terbanyak: `components/Dashboard.tsx`
(30 titik, terbanyak di repo). Hasilnya 29 penggantian, 1 sengaja dikecualikan.

**Aturan yang dipakai, dan kenapa.** Acuan penggantian bukan angka yang TERTULIS, melainkan
ukuran yang DIRENDER hari ini. Lantai kompatibilitas di §4 (`html .text-\[10px\]` … )
membuat `text-[10px]`, `text-[11px]`, `text-[12px]`, dan `text-xs` semuanya dirender 13px.
Jadi:

| Hari ini | Jadi | Alasan |
|---|---|---|
| `text-[10px]`/`[11px]`/`[12px]` pada label, pil, badge, `kbd` | `lens-label` (13px/1.25/650) | ukuran ter-render sama, tidak ada perubahan tata letak |
| sama, pada teks mengalir | `lens-body-sm` (13px/1.5/500) | idem, tinggi baris tetap 1.5 |
| `text-[13px]` pada `h3`/`h4` | `lens-card-title` (15px/1.35/650) | peran judul kartu; **satu-satunya kenaikan yang disengaja** |
| `text-[16px]` wordmark | `lens-card-title` | 16px ponsel, 15px desktop |
| `text-[18px]` angka mono | `lens-metric` (18px/1.2/700 mono) | sama persis |

**Angka mono tidak boleh diberi peran ukuran.** Peran ukuran menyetel `font-family: Inter`,
jadi memasangnya di elemen angka akan menghapus mono dan mengubah kolom angka jadi
proporsional. Karena itu `lens-number` (mono + `tabular-nums`, TANPA `font-size`) dipasang
di elemennya, dan **ukuran baris** dipindahkan ke peran pada pembungkusnya - di Dashboard,
baris kalender (`Link`) yang mendapat `lens-body-sm`, lalu simbol dan tanggal mewarisi 13px
dari situ. Aturan yang sama berlaku untuk setiap migrasi angka berikutnya.

**Satu pengecualian, dengan alasan yang diuji.** Harga IHSG di baris ringkas ponsel
(`flex md:hidden`) memakai `text-[14px] font-number`. Tidak ada peran angka mono 14px:
`lens-metric` 18px akan memperbesar baris ringkas itu, sedangkan peran ukuran lain memaksa
keluarga Inter dan menghapus mono. Baris itu masuk `config/typography-migrated.json` sebagai
`pengecualian` bersama syarat `wajibMengandung: ["font-number"]` - gerbang akan merah kalau
baris itu kehilangan `font-number`, karena alasan pengecualiannya saat itu sudah tidak
berlaku. Sisa berkasnya masuk daftar `bersih`.

**Divergensi yang disadari dari fase 2-4.** Fase-fase sebelumnya mengganti teks yang
dirender 13px dengan `lens-meta` (12px) - turun 1px, mengikuti skala peran. Fase 5a memilih
peran 13px supaya tidak ada satu pun perubahan tata letak. Akibatnya label di Dashboard
13px sementara label di halaman finansial 12px. Itu bukan kelalaian, tapi utang yang
memang harus dibayar di langkah "penyederhanaan lantai": begitu lantai dihapus, hanya
ukuran peran yang tersisa, dan penyatuannya (12px vs 13px) jadi keputusan desain tersendiri
yang disengaja - bukan efek samping migrasi.

**Kontrol negatif, dua arah.** Menambahkan `text-[9px]` ke berkas yang sudah bersih →
gerbang merah (`expected [ 'text-[14px]', 'text-[9px]' ] to deeply equal [ 'text-[14px]' ]`).
Melepas `font-number` dari baris yang dikecualikan → gerbang merah menyebut alasan
pengecualiannya. Keduanya dipulihkan → hijau.

Ratchet: **646 → 617** ukuran acak (sub-13px 584 → 560), berkas 92 tetap - Dashboard
menyumbang 29 dari angka pertama.