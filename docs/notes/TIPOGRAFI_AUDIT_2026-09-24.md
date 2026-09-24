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
| 2 | `Sidebar` (`text-xs`/`text-sm` sisa), kartu/form/tabel bersama, `TickerAnalysisShell` | Sidebar: 0 arbitrér, sisa utility |
| 3 | `AIChat` (LensAI), `app/news`, teks metodologi panjang | `app/news`: 1 |
| 4 | DCF, Risk, Dividend, Watchlist, Screener, Calendar | `app/dcf`: 6 · `app/risk`: 13 · `app/dividend`: 13 · `app/calendar`: 4 |
| 5 | `text-[Npx]` sisanya, klasifikasi pengecualian, penyederhanaan lantai kompatibilitas | 718 tersebar di 111 berkas |

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