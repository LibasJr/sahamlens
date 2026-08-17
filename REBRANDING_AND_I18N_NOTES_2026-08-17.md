# Catatan Rilis: Rebranding Logo 3D & Multi-Bahasa Bilingual (ID/EN) SahamLens
**Tanggal**: 17 Agustus 2026  
**Status**: Selesai & Terverifikasi (Commit `f7150e5`)

---

## 1. Ringkasan Eksekutif

Pembaruan ini mencakup dua inisiatif besar pada platform SahamLens:
1. **Rebranding Logo 3D Embossed & Optimasi Ikon Mobile PWA (Safe Zone)**.
2. **Implementasi Sistem Multi-Bahasa Lengkap (Bilingual: Bahasa Indonesia 🇮🇩 & English 🇬🇧)** dengan pengalih instan tanpa reload (*zero latency*).

---

## 2. Rincian Pembaruan

### A. Rebranding Logo Visual & Ikon Multi-Platform
* **Konsep Desain**: Simbol Mata Lensa Aperture dengan Grafik Candlestick Hijau Naik bergaya 3D Embossed tebal dan modern dengan palet warna dark luxury slate (`#182432`).
* **Tata Letak Vertikal (*Stacked 1:1 Block*)**: Simbol diletakkan di atas tengah, dan teks `SahamLens` serta tagline `FINTECH STOCK SCREENER • FINANCIAL CLARITY` diposisikan di bawah tengah secara proporsional.
* **Optimasi Safe Zone Mobile PWA**:
  - Mengatasi pemotongan sudut melengkung (*squircle*) pada sistem operasi Android.
  - Memperkecil logo ke zona aman 66% (*Safe Zone*) di tengah canvas bujur sangkar 1024x1024.
  - Mengisi latar belakang dengan pencahayaan gradasi metalik alami (*ambient gradient blend*).
* **Aset yang Diperbarui**:
  - `public/sahamlens-logo.png` (512x512): Navbar & Header.
  - `public/icon-pwa-512.png` & `public/icon-pwa-192.png`: Android PWA install & homescreen icon.
  - `app/apple-icon.png` (180x180): Apple iOS Safari homescreen icon.
  - `app/favicon.ico` & `public/favicon.ico`: Favicon browser tab & Google Search index.
  - `public/og-image.png` (1200x630): Social share preview card (WhatsApp, Twitter, Telegram).
  - `public/manifest.json`: Konfigurasi PWA dengan cache-buster `?v=5`.

### B. Sistem Multi-Bahasa Bilingual (ID 🇮🇩 / EN 🇬🇧)
* **Arsitektur i18n Reaktif**:
  - `lib/i18n/LanguageContext.tsx`: Context provider & hook `useLanguage()` dengan persistensi ganda di `localStorage` dan cookie `sahamlens_lang`.
  - `lib/i18n/locales/id.ts`: Kamus Bahasa Indonesia lengkap.
  - `lib/i18n/locales/en.ts`: Kamus English lengkap dengan terminologi analisis kuantitatif standar global.
* **Komponen Pengalih (`components/ui/LanguageSwitcher.tsx`)**:
  - Mode Pill toggle di Navbar Header.
  - Mode Compact di layar mobile sempit.
  - Mode Bar toggle di Sidebar Bawah.
* **Komponen & Halaman yang Diterjemahkan**:
  - `components/AppShell.tsx`: Root language provider wrapper.
  - `components/TopMarketBar.tsx`: Status bursa (*Market Open / Closed*), waktu Jakarta / WIB, dan format angka dinamis.
  - `components/Sidebar.tsx`: Seluruh judul grup, nama menu, sub-menu, status koneksi IDX, dan tombol login/logout.
  - `components/Dashboard.tsx`: Hero, Quick Search, Bento Grid, Metrik Transparansi, dan Running Text Sinyal Saham (TP/CL, Bandar Flow).
  - `components/GettingStartedGuide.tsx`: Panduan 4 langkah awal interaktif.
  - `components/SiteFooter.tsx`: Disclaimer sumber data dan tautan navigasi legal.

### C. Pemeliharaan CI & Audit Integritas
* **Skrip Audit Kepatuhan (`scripts/audit-risk-controls.mjs`)**: Disesuaikan untuk memverifikasi teks disclaimer kepatuhan di dalam kamus i18n.
* **Hasil Verifikasi**:
  - `npm run typecheck`: **0 TypeScript errors**.
  - `npm run audit:risk-controls`: **22 pass, 0 fail**.
  - `npx vitest run`: **193 test suites passed (1.767 tests passed, 0 fail)**.

---

## 3. Daftar Berkas Baru & Dimodifikasi

```
├── lib/
│   └── i18n/
│       ├── LanguageContext.tsx       [Baru] Context provider & hook i18n
│       ├── index.ts                  [Baru] Ekspor modul
│       ├── locales/
│       │   ├── id.ts                 [Baru] Kamus Bahasa Indonesia
│       │   └── en.ts                 [Baru] Kamus English
│       └── __tests__/
│           └── i18n.test.ts          [Baru] Unit test parity kamus i18n
├── components/
│   ├── ui/
│   │   └── LanguageSwitcher.tsx      [Baru] Komponen switcher ID/EN
│   ├── AppShell.tsx                  [Edit] LanguageProvider root wrapper
│   ├── TopMarketBar.tsx              [Edit] i18n status pasar & LanguageSwitcher
│   ├── Sidebar.tsx                   [Edit] i18n seluruh menu navigasi
│   ├── Dashboard.tsx                 [Edit] i18n hero, bento, sinyal, metrik
│   ├── GettingStartedGuide.tsx       [Edit] i18n panduan langkah mulai
│   └── SiteFooter.tsx                [Edit] i18n footer & disclaimer
├── public/
│   ├── sahamlens-logo.png            [Edit] Logo 3D baru
│   ├── icon-pwa-512.png              [Edit] Ikon PWA 512px safe zone
│   ├── icon-pwa-192.png              [Edit] Ikon PWA 192px safe zone
│   ├── manifest.json                 [Edit] Manifest PWA v5
│   └── og-image.png                  [Edit] OpenGraph card v5
├── app/
│   ├── layout.tsx                    [Edit] Manifest & icon cache buster v5
│   ├── apple-icon.png                [Edit] Ikon Apple iOS v5
│   └── favicon.ico                   [Edit] Favicon v5
└── scripts/
    ├── update-logo-assets.mjs        [Edit] Generator aset logo safe zone otomatis
    └── audit-risk-controls.mjs       [Edit] Penyesuaian audit P-1 i18n
```

---

## 4. Prosedur Deployment ke VPS Produksi

Untuk menerapkan pembaruan ini di server VPS:

```bash
cd /opt/sahamlens/app
git pull origin main
npm run build
sudo systemctl restart sahamlens
```
