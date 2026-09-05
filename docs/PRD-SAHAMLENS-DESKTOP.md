# PRD — SahamLens Desktop

**Produk:** SahamLens Desktop  
**Platform awal:** Windows 11 melalui Tauri 2  
**Platform lanjutan:** macOS dan Linux setelah build, signing, dan QA stabil  
**Status:** Final  
**Pemilik produk:** Libas  
**Tujuan:** Edukasi dan riset mandiri investor ritel Indonesia  
**Model akses saat ini:** Tidak ada paket berbayar  
**Dokumen acuan:** `docs/DESKTOP.md`, `desktop/README.md`, `desktop-web/README.md`, dan `docs/notes/SAHAMLENS_PRD_TOTAL_VISUAL_REDESIGN_V3.md`

## 1. Ringkasan

SahamLens Desktop adalah research workstation native untuk investor ritel Indonesia. Produk ini menyediakan seluruh kemampuan riset SahamLens dalam antarmuka desktop yang multi-panel, keyboard-first, dapat disusun, dan mempertahankan konteks emiten lintas alat.

SahamLens Desktop bukan website yang dibungkus menjadi aplikasi. Backend, data, metodologi, akun, dan kontrak API tetap digunakan bersama dengan SahamLens web, tetapi shell, navigasi, layout, interaksi, dan alur kerja desktop dirancang khusus untuk penggunaan intensif di layar besar.

Produk ini bersifat edukatif dan membantu pengguna memahami data serta risiko. Produk tidak mengeksekusi order, tidak menjanjikan keuntungan, dan tidak menggantikan keputusan pengguna.

## 2. Pemangku Kepentingan

| Peran               | Penanggung jawab        | Tanggung jawab                                           |
| ------------------- | ----------------------- | -------------------------------------------------------- |
| Product owner       | Libas                   | Visi, prioritas, dan keputusan rilis                     |
| Product/engineering | Tim SahamLens           | Arsitektur, implementasi, kualitas, dan operasional      |
| Design              | Belum ditentukan        | Desktop UX, design system, dan aksesibilitas             |
| Data/research       | Tim SahamLens           | Semantik data, provenance, freshness, dan metodologi     |
| Security/privacy    | Belum ditentukan        | Credential, Tauri permissions, CSP, updater, dan privasi |
| Pengguna beta       | Investor ritel terpilih | Validasi kegunaan, stabilitas, dan manfaat edukasi       |

## 3. Latar Belakang

### 3.1 Masalah pengguna

SahamLens web sudah memiliki rangkaian fitur riset yang luas. Namun, penggunaan intensif melalui browser masih memiliki hambatan:

- konteks emiten mudah terputus saat pengguna berpindah halaman;
- riset membutuhkan banyak tab browser;
- browser bercampur dengan pekerjaan dan notifikasi lain;
- chart, fundamental, ownership, valuation, berita, risiko, dan LensAI belum dapat disusun dalam satu meja kerja;
- pengguna harus mengulangi pencarian ticker ketika berpindah alat;
- tata letak web harus melayani desktop, tablet, mobile, halaman publik, dan SEO sekaligus;
- shortcut browser atau PWA tidak memberi multi-panel, workspace tersimpan, deep link native, secure credential storage, system tray, file integration, dan multi-window.

### 3.2 Mengapa aplikasi desktop dibutuhkan

Jika SahamLens Desktop hanya menampilkan halaman web di dalam Tauri, nilainya hampir sama dengan shortcut browser. Karena itu, aplikasi desktop hanya layak dibangun bila memberi cara kerja yang berbeda dan lebih kuat:

- satu konteks emiten untuk semua alat;
- beberapa panel dapat terlihat bersamaan;
- layout dapat diubah dan disimpan;
- ticker dapat dibuka sebagai tab internal;
- alur utama dapat dijalankan dengan keyboard;
- integrasi native dipakai untuk credential, notifikasi, file, clipboard, deep link, window state, dan updater;
- layar besar dan multi-monitor diperlakukan sebagai kemampuan utama, bukan sekadar viewport lebih lebar.

### 3.3 Fondasi yang sudah ada

Repositori sudah memiliki:

- shell Tauri 2;
- target static export di `desktop-web/`;
- komponen riset yang digunakan bersama aplikasi web;
- native bridge untuk request `/api/*` ke `https://sahamlens.id/api/*`;
- autentikasi desktop berbasis bearer token;
- target window minimum 1024 × 700;
- UI Vite lama di `desktop/src/` sebagai rollback sementara.

Fondasi ini belum dianggap produk desktop final. UI, keamanan credential, native bridge, CSP, permissions, workspace, dan pipeline rilis masih harus diselesaikan.

## 4. Visi dan Prinsip Produk

### 4.1 Visi

> SahamLens Desktop adalah meja kerja edukasi dan riset saham Indonesia yang membantu investor ritel melihat data, bukti, risiko, dan konteks secara terpadu sebelum mengambil keputusan sendiri.

### 4.2 Prinsip pengalaman

1. **Jawaban dahulu. Bukti kedua. Detail ketiga.**
2. **Satu emiten, satu konteks, banyak perspektif.**
3. **Capability parity, bukan page parity.**
4. **Keyboard-first, bukan keyboard-only.**
5. **Padat tetapi tidak sesak.**
6. **Trust harus terlihat.**
7. **Edukasi, bukan instruksi transaksi.**
8. **Gagal tertutup saat bukti kritis tidak cukup.**

### 4.3 Posisi produk

SahamLens Desktop bukan:

- shortcut website atau webview generik;
- broker atau aplikasi order saham;
- social trading platform;
- terminal tick-by-tick;
- chatbot generik;
- salinan Bloomberg;
- mesin rekomendasi yang menjanjikan hasil;
- produk berbayar atau bagian dari paket premium pada fase saat ini.

## 5. Tujuan dan Hasil yang Diharapkan

### 5.1 Tujuan pengguna

Pengguna dapat:

1. menemukan emiten dengan cepat;
2. membuka beberapa emiten dalam tab internal;
3. melihat beberapa perspektif riset secara bersamaan;
4. mempertahankan ticker aktif saat berpindah alat;
5. menyimpan dan memulihkan layout workspace;
6. memahami sumber, waktu, freshness, coverage, serta keterbatasan data;
7. membedakan fakta, estimasi, insight turunan, dan data yang belum tersedia;
8. mempelajari alasan di balik suatu indikator atau kesimpulan;
9. menggunakan LensAI dalam konteks emiten dan panel aktif;
10. menerima alert edukatif yang dipilih sendiri tanpa dorongan transaksi.

### 5.2 Tujuan produk

- meningkatkan kedalaman riset lintas modul;
- mengurangi perpindahan tab dan pengulangan pencarian;
- meningkatkan pemahaman investor ritel terhadap data dan risiko;
- menyediakan pengalaman layar besar yang tidak dapat diberikan shortcut browser;
- mempertahankan satu sumber kebenaran untuk data dan metodologi web serta desktop;
- membangun aplikasi native tanpa menggandakan backend.

### 5.3 Key Results

Baseline diukur selama beta tertutup. Target 90 hari setelah rilis umum:

| Key Result                                                            |                             Target |
| --------------------------------------------------------------------- | ---------------------------------: |
| Sesi tanpa crash                                                      |                            ≥ 99,5% |
| Pengguna beta menyelesaikan alur cari emiten → buka tiga perspektif   |                              ≥ 70% |
| Pengguna beta berhasil menyusun dan menyimpan workspace tanpa bantuan |                              ≥ 80% |
| Median waktu aplikasi dibuka sampai workspace terakhir siap           | ≤ 5 detik pada perangkat referensi |
| Median pergantian panel yang asetnya sudah termuat                    |                           ≤ 300 ms |
| Pengguna aktif mingguan yang memakai minimal tiga fitur riset         |                              ≥ 50% |
| Pengguna aktif yang kembali pada minggu keempat                       |                              ≥ 35% |
| Error request dengan request ID yang dapat disalin                    |                               100% |
| Insight material menampilkan freshness/provenance sesuai kontrak      |                               100% |
| Pengguna usability test memahami status stale/missing/restricted      |                              ≥ 80% |
| Temuan keamanan kritis terbuka saat rilis                             |                                  0 |

Telemetri tidak boleh merekam token, isi percakapan LensAI, portofolio lengkap, watchlist lengkap, atau strategi pengguna tanpa kebutuhan dan persetujuan yang jelas.

## 6. Segmen Pengguna

### 6.1 Investor ritel yang sedang belajar

**Pekerjaan:** memahami emiten, indikator, valuasi, risiko, dan hubungan antara data sebelum mengambil keputusan sendiri.  
**Kebutuhan:** penjelasan sederhana, istilah yang dapat dibuka, sumber, freshness, contoh, dan batas interpretasi.  
**Hambatan:** data pasar tersebar dan istilah keuangan sering disajikan tanpa konteks.

### 6.2 Investor mandiri yang melakukan riset mendalam

**Pekerjaan:** menilai kualitas bisnis, valuasi, ownership, risiko, dan bukti historis.  
**Kebutuhan:** fundamental, valuation, compare, ownership, news, calendar, dan provenance yang mudah dilacak.  
**Hambatan:** banyak tab, definisi metrik tidak konsisten, dan waktu data tidak jelas.

### 6.3 Trader ritel berbasis aturan

**Pekerjaan:** menyaring kandidat lalu memeriksa chart, volume, momentum, katalis, restriction, dan invalidation.  
**Kebutuhan:** LensRadar, screener, technical, watchlist, risk calculator, dan backtest.  
**Hambatan:** noise tinggi dan sinyal sering tampil tanpa risiko atau konteks kualitas data.

### 6.4 Power user

**Pekerjaan:** memeriksa banyak emiten dan perspektif dalam satu sesi.  
**Kebutuhan:** tab emiten, multi-panel, saved workspace, shortcut, command palette, multi-window, dan ekspor.  
**Hambatan:** navigasi halaman memperlambat riset dan memutus konteks.

### 6.5 Batas awal

- fokus BEI/IDX;
- Bahasa Indonesia sebagai bahasa utama;
- koneksi internet diperlukan untuk autentikasi dan data aktual;
- semua pengguna memperoleh fitur berdasarkan kesiapan teknis dan batas penggunaan yang wajar, bukan paket berbayar;
- Windows 11 menjadi platform beta pertama;
- macOS dan Linux dirilis setelah build, signing, dan QA platform lulus.

## 7. Strategi Kesetaraan Fitur

### 7.1 Capability parity

Seluruh kemampuan fungsional web harus tersedia dari SahamLens Desktop. Kesetaraan berarti pengguna dapat menyelesaikan pekerjaan yang sama, bukan setiap URL dan tampilan web disalin satu per satu.

Kemampuan riset yang wajib tersedia:

- Home dan market context;
- dashboard/ringkasan emiten;
- Technical;
- Fundamental;
- Ownership Flow;
- Compare;
- Screener;
- LensRadar/Breakout Radar;
- Valuation/DCF;
- Backtest;
- Risk dan Risk Calculator;
- Watchlist;
- Recommendations sebagai materi decision-support yang transparan;
- LensAI dan multi-agent research bila sudah tersedia untuk ritel;
- News;
- Calendar, earnings, dan dividend;
- Macro;
- Moat;
- Pattern;
- status, transparency, methodology, privacy, disclaimer, dan terms;
- autentikasi dan pemulihan akun.

### 7.2 Tiga jenis implementasi fitur

**Shared capability**

Data, chart engine, kalkulasi, LensScore, LensAI, kontrak API, provenance, freshness, dan data-quality semantics digunakan bersama web.

**Desktop-native presentation**

Fitur riset tampil sebagai panel, tab, drawer, dock, atau workspace. Shell dan interaction model berbeda dari web.

**Web-support presentation**

Halaman akun, legal, privacy, terms, dan konten publik yang tidak memerlukan workstation dapat tampil sebagai dialog desktop yang sesuai atau dibuka aman di browser eksternal. Fungsinya tetap dapat diakses dari desktop.

### 7.3 Feature parity matrix

Tim wajib membuat dan menjaga `docs/desktop/FEATURE-PARITY.md` dengan kolom:

- kemampuan web;
- entry point desktop;
- bentuk desktop: panel/tab/dialog/external;
- status: planned/in progress/verified;
- keterbatasan;
- test penerimaan;
- pemilik.

Rilis umum tidak boleh dilakukan jika fitur web hilang tanpa keputusan dan penjelasan eksplisit.

## 8. Solusi UX Desktop

### 8.1 Shell utama

```text
┌──────────────────────────────────────────────────────────────────┐
│ Title/Context Bar: Market • Ticker • Freshness • Search • Status│
├───────────┬──────────────────────────────────────┬───────────────┤
│ Navigator │ Main Workspace                      │ Inspector /   │
│ Watchlist │ Chart / Table / Research Panel      │ LensAI / Data │
│ Radar     │                                      │ Evidence      │
├───────────┴──────────────────────────────────────┴───────────────┤
│ Activity Dock: Alerts • Events • Requests • Data Status         │
└──────────────────────────────────────────────────────────────────┘
```

Bagian utama:

- navigator kiri yang dapat diperkecil;
- tab emiten internal;
- workspace multi-panel;
- inspector kanan untuk evidence, metric detail, risk, atau LensAI;
- activity dock bawah;
- context bar untuk ticker, market status, freshness, restriction, dan koneksi;
- command palette global;
- account dan settings.

### 8.2 Home desktop

Home desktop bukan homepage web. Saat aplikasi dibuka, tampilkan:

- workspace terakhir;
- recent tickers;
- saved workspaces;
- watchlist;
- market status dan freshness;
- event material;
- alert terbaru;
- akses cepat ke Screener, LensRadar, Compare, dan LensAI;
- status koneksi dan versi aplikasi.

### 8.3 Multi-panel workspace

MVP wajib mendukung:

- minimal dua panel riset bersamaan;
- resize panel;
- memilih isi panel;
- menutup dan membuka panel;
- reset ke layout default;
- menyimpan layout;
- memulihkan layout setelah restart;
- layout per workspace;
- batas minimum ukuran panel agar tetap dapat digunakan.

Panel awal:

- chart;
- overview;
- fundamental;
- valuation;
- ownership;
- news/event;
- risk;
- LensAI.

### 8.4 Tab emiten internal

- pengguna dapat membuka beberapa ticker;
- setiap tab mempertahankan ticker dan state panel;
- tab dapat ditutup dan diurutkan;
- tab aktif dipulihkan saat restart;
- batas tab ditetapkan untuk menjaga memori;
- data ticker lama tidak boleh tampil sebagai data ticker baru saat tab berubah.

### 8.5 Saved workspace

Workspace menyimpan:

- komposisi panel;
- ukuran panel;
- panel aktif;
- tab ticker;
- preferensi visual non-sensitif.

Workspace tidak menyimpan bearer token, response API mentah, isi LensAI, atau data sensitif tanpa keputusan privasi eksplisit.

Default workspace:

1. **Belajar Emiten:** overview, fundamental, glossary/evidence, dan LensAI.
2. **Analisis Teknikal:** chart, volume/indicator, news/event, dan risk.
3. **Nilai dan Kualitas:** fundamental, valuation, compare, dan ownership.
4. **Cari Peluang:** Screener/LensRadar, chart preview, restriction, dan watchlist.

### 8.6 Keyboard dan command palette

MVP:

- `Ctrl/Cmd + K`: command palette;
- `Ctrl/Cmd + J`: LensAI;
- pencarian ticker dan nama emiten;
- buka fitur, workspace, dan ticker melalui command palette;
- pindah tab dan panel dengan keyboard;
- Escape menutup layer sesuai urutan;
- shortcut tidak mengambil alih input teks secara salah;
- daftar shortcut dapat ditemukan;
- focus dikembalikan setelah modal/drawer ditutup.

### 8.7 Context menu dan desktop interactions

Klik kanan dapat menyediakan tindakan yang relevan:

- buka ticker di tab baru;
- buka di panel;
- tambah/hapus watchlist;
- copy ticker atau nilai;
- lihat sumber dan as-of;
- ekspor bagian terpilih.

Tidak ada tindakan transaksi atau copy yang menyembunyikan sumber dan waktu data.

### 8.8 Multi-window dan multi-monitor

Masuk P1 setelah single-window stabil:

- pop-out chart;
- pop-out Compare atau LensAI;
- pindah panel ke jendela baru;
- pemulihan posisi jendela dengan validasi monitor;
- fallback aman jika monitor kedua tidak tersedia.

## 9. Fitur Native yang Membenarkan Instalasi

### 9.1 P0/MVP

- OS secure credential storage;
- saved window state;
- saved workspace;
- tab emiten internal;
- multi-panel resizable;
- command palette dan keyboard navigation;
- deep link internal dasar, misalnya `sahamlens://ticker/BBCA`;
- clipboard actions yang aman;
- native open/save dialog untuk ekspor;
- signed installer;
- informasi versi dan diagnostics;
- safe external-link handling.

### 9.2 P1

- native notification opt-in;
- system tray yang dapat dimatikan;
- auto-update bertanda tangan;
- multi-window;
- layout lanjutan dan workspace templates;
- background activity yang eksplisit dan dapat dimatikan.

### 9.3 P2

- advanced alert builder;
- dukungan multi-monitor lebih dalam;
- offline reading untuk snapshot non-aktual dengan label jelas;
- catatan riset pengguna;
- portfolio-aware educational workspace bila kebijakan data telah ditetapkan.

## 10. Fitur Edukasi

Setiap modul utama harus membantu pengguna memahami, bukan hanya melihat angka.

### 10.1 Explainability

- istilah dan metrik memiliki penjelasan singkat;
- pengguna dapat membuka metode perhitungan;
- insight menunjukkan bukti pendukung dan penentang;
- estimasi ditandai sebagai estimasi;
- data turunan ditandai sebagai hasil perhitungan;
- LensScore dijelaskan sebagai keselarasan faktor/bukti, bukan probabilitas keuntungan;
- backtest menjelaskan sample size, periode, bias, dan keterbatasan;
- LensAI memisahkan fakta, inferensi, asumsi, dan informasi yang tidak tersedia.

### 10.2 Risk-first education

- risiko dan invalidation terlihat bersama peluang;
- restriction, suspension, UMA, dan investability state tidak boleh disembunyikan;
- data stale atau coverage rendah tidak dapat tampil sebagai kepastian;
- keputusan akhir selalu berada pada pengguna;
- tidak ada CTA “Buy”, “Sell”, atau dorongan transaksi;
- gunakan bahasa edukatif seperti “pelajari”, “bandingkan”, “periksa risiko”, dan “lihat bukti”.

### 10.3 Disclaimer

Disclaimer harus tersedia, tetapi tidak boleh dipakai untuk membenarkan desain yang menyesatkan. Label sumber, freshness, status data, risiko, dan keterbatasan tetap wajib berada dekat konteks yang relevan.

## 11. Persyaratan Fungsional P0

### 11.1 Desktop shell

- shell khusus desktop, bukan `AppShell` web tanpa perubahan;
- default 1440 × 920;
- minimum 1024 × 700;
- resizable;
- restore posisi dan ukuran secara aman;
- single-instance behavior;
- tidak ada proses liar setelah exit.

### 11.2 Autentikasi

- akun SahamLens digunakan bersama web dan desktop;
- token disimpan di credential vault OS;
- token tidak berada di localStorage, sessionStorage, DOM, log, atau analytics;
- logout menghapus credential;
- expiry dan revocation ditangani tanpa loop;
- pengguna yang belum login mendapatkan akses sesuai kebijakan akses ritel saat ini;
- tidak ada gate paket berbayar pada desktop.

### 11.3 Native API bridge

- hanya `https://sahamlens.id`;
- hanya route API yang diizinkan;
- method, header, body size, timeout, dan redirect dibatasi;
- response status dan request ID dipertahankan;
- renderer tidak memegang bearer token;
- tidak ada database credential atau provider API key di installer;
- bridge gagal tertutup untuk input tidak dikenal.

### 11.4 Workspace

- ticker aktif menjadi context utama;
- semua panel membaca context yang sama;
- tab menyimpan context masing-masing;
- pengguna dapat menyimpan beberapa workspace;
- tersedia layout default;
- restore gagal harus kembali ke layout aman, bukan blank screen.

### 11.5 Data quality

UI membedakan:

- fresh;
- delayed;
- stale;
- missing;
- partial;
- inconsistent;
- proxy;
- official;
- unavailable;
- restricted/suspended.

Nilai missing tidak boleh menjadi nol. Data delayed tidak boleh disebut real-time. Decision-support yang membutuhkan bukti kritis harus dinonaktifkan ketika bukti tidak cukup.

### 11.6 LensAI

- dapat dibuka sebagai panel/drawer;
- menerima ticker, panel, dan sumber yang diizinkan sebagai konteks;
- tidak memperoleh bearer token;
- jawaban mempertahankan evidence dan freshness;
- percakapan tidak masuk telemetri secara default;
- UI memberi jalur kembali ke sumber;
- tidak memberi instruksi transaksi personal yang seolah pasti.

### 11.7 Ekspor

- ekspor menggunakan dialog file native;
- format awal: gambar/PDF/CSV sesuai fitur;
- hasil ekspor menyertakan ticker, as-of, sumber, dan disclaimer bila material;
- nama file disanitasi;
- aplikasi tidak menulis di luar lokasi pilihan pengguna.

## 12. Persyaratan UX dan Visual

Desktop memiliki design system dan composition sendiri, tetapi tetap satu identitas SahamLens.

- dark-first;
- tenang, presisi, dan mudah dipindai;
- lebih padat daripada web;
- lebih sedikit card dan lebih banyak hierarchy melalui alignment, divider, serta whitespace;
- panel resizable;
- tabel dengan sticky header/column bila perlu;
- toolbar ringkas;
- context menu;
- hover hanya sebagai tambahan, bukan satu-satunya akses informasi;
- angka memakai tabular numerics;
- status tidak bergantung pada warna saja;
- fokus keyboard terlihat;
- target interaksi minimum tetap dapat digunakan;
- zoom 100–200% tetap berfungsi;
- mendukung scaling OS dan layar 4K;
- tidak menggunakan layout mobile sebagai fondasi desktop.

## 13. Persyaratan Teknologi

### 13.1 Pembagian kode

**Shared:**

- tipe dan kontrak API;
- research/data services;
- metodologi dan kalkulasi;
- chart primitives;
- provenance/freshness components;
- autentikasi server;
- design tokens yang memang sama.

**Web-only:**

- web shell;
- responsive/mobile navigation;
- SEO route presentation;
- marketing/public landing composition.

**Desktop-only:**

- desktop shell;
- panel/docking system;
- tab emiten;
- workspace persistence;
- command system;
- Tauri adapters;
- native window/file/clipboard/notification integration.

Tidak boleh membuat ulang logika finansial hanya untuk desktop.

### 13.2 Security

- CSP aktif; `csp: null` dilarang untuk rilis;
- Tauri capability memakai least privilege;
- unrestricted shell permission dilarang;
- TLS only;
- certificate error gagal tertutup;
- request route, method, headers, body, timeout, dan redirects menggunakan allowlist;
- signed installer dan signed update;
- dependency scanning npm dan Cargo;
- threat model mencakup XSS-to-native, SSRF, token theft, malicious API response, unsafe navigation, local log leakage, dan updater compromise.

### 13.3 Performa

- startup sampai workspace siap ≤ 5 detik pada perangkat referensi;
- perpindahan panel cached ≤ 300 ms;
- panel berat dimuat saat diperlukan;
- chart tidak memblokir navigasi;
- polling berhenti atau diperlambat saat hidden/sleep;
- batas tab dan panel mencegah penggunaan memori tak terkendali;
- soak test minimal empat jam;
- bundle budget ditetapkan setelah baseline nyata.

### 13.4 Kompatibilitas

Beta pertama:

- Windows 11 yang masih didukung Microsoft;
- layar minimum 1024 × 700;
- scaling OS 100%, 125%, 150%, dan 200%;
- perangkat referensi ditetapkan sebelum performance gate final.

Dukungan macOS dan Linux hanya diumumkan setelah installer, signing, updater, dan QA platform lulus.

## 14. Privasi dan Telemetri

Boleh dikumpulkan secara minimum sesuai kebijakan:

- versi aplikasi;
- keluarga OS;
- waktu startup;
- crash class;
- keberhasilan/gagal load fitur;
- latency bucket;
- penggunaan fitur dalam bentuk agregat;
- request ID untuk diagnosis.

Tidak boleh dikumpulkan secara default:

- token;
- password;
- prompt dan jawaban LensAI;
- response API mentah;
- portfolio lengkap;
- watchlist lengkap;
- isi ekspor;
- strategi atau catatan riset pengguna.

Pengguna harus dapat melihat kebijakan dan mengendalikan telemetri sesuai ketentuan yang berlaku.

## 15. Aksesibilitas

- seluruh fungsi inti dapat digunakan dengan keyboard;
- semantic role dan accessible name tersedia;
- contrast memenuhi WCAG 2.2 AA untuk elemen utama;
- chart memiliki ringkasan tekstual;
- focus order mengikuti struktur visual;
- reduced motion dihormati;
- error menjelaskan masalah dan langkah berikutnya;
- status tidak hanya memakai warna;
- screen reader smoke test menjadi release gate.

## 16. Non-goals Rilis Pertama

- order atau integrasi broker;
- transaksi otomatis;
- tick-by-tick exchange terminal;
- backend/database lokal penuh;
- secret provider dalam installer;
- data pasar aktual dalam mode offline;
- plugin pihak ketiga;
- multi-window sebelum single-window stabil;
- semua variasi layout tanpa batas;
- perubahan scoring atau metodologi SahamLens;
- sistem paket berbayar;
- personalized financial advice.

## 17. Rencana Rilis

### Fase 0 — Validasi dan baseline

- feature parity matrix;
- arsitektur shell desktop;
- prototipe multi-panel;
- usability test dengan investor ritel;
- threat model;
- baseline build dan performa.

**Exit gate:** pengguna dapat membedakan manfaat desktop dari shortcut browser dan memahami model workspace.

### Fase 1 — Foundation alpha

- shell desktop baru;
- secure credential storage;
- native bridge hardening;
- CSP dan capability lockdown;
- tab emiten;
- multi-panel dasar;
- saved workspace;
- command palette.

**Exit gate:** tidak ada token di browser storage/log dan boundary native lulus security tests.

### Fase 2 — Feature parity alpha

- semua capability web dipetakan;
- modul riset tersedia sebagai panel/tab/dialog/external entry;
- data-quality states;
- LensAI context;
- ekspor native;
- educational explanations.

**Exit gate:** feature parity matrix tidak memiliki capability hilang tanpa keputusan eksplisit.

### Fase 3 — Closed beta Windows

- installer internal;
- observability aman;
- accessibility pass;
- performance dan soak tests;
- install/relaunch/logout/uninstall tests;
- security review;
- penggunaan oleh investor ritel terpilih.

**Exit gate:** crash-free ≥ 99,5% selama dua minggu, seluruh P0 lulus, dan tidak ada temuan critical/high.

### Fase 4 — Release candidate

- signed installer;
- release notes;
- privacy dan security review final;
- staged rollout;
- rollback rehearsal;
- dokumentasi penggunaan.

**Exit gate:** signature, build provenance, update/rollback, dan monitoring dapat diverifikasi.

### Fase 5 — General availability

- rilis Windows;
- pantau crash, startup, auth, bridge, dan data-quality incidents;
- hentikan rollout jika guardrail terlewati;
- prioritaskan P1 berdasarkan data beta;
- mulai readiness macOS/Linux.

## 18. Guardrail Peluncuran

Rollout dihentikan bila:

- token atau data sensitif terindikasi bocor;
- crash-free session < 99%;
- auth failure naik dua kali baseline;
- ticker atau panel menampilkan data emiten lain;
- data stale tampil sebagai fresh;
- restriction/suspension/investability state hilang;
- bridge menerima origin atau route di luar allowlist;
- installer/signature/update validation gagal;
- aplikasi tidak dapat dipulihkan ke layout aman.

## 19. Risiko dan Mitigasi

| Risiko                                          | Dampak                         | Mitigasi                                                       |
| ----------------------------------------------- | ------------------------------ | -------------------------------------------------------------- |
| Desktop hanya menjadi web wrapper               | Tidak ada alasan instalasi     | Shell khusus, multi-panel, tabs, workspace, native integration |
| Dua frontend berkembang terpisah                | Semantik dan fitur menyimpang  | Shared domain/data components; shell dipisahkan                |
| Feature parity tertinggal                       | Pengguna kembali ke web        | Matrix parity dengan owner dan acceptance test                 |
| Token dicuri                                    | Pengambilalihan sesi           | OS credential vault, no-log, revocation, threat model          |
| Native bridge menjadi proxy bebas               | SSRF/data exfiltration         | Allowlist route/method/header/body/redirect                    |
| Layout terlalu bebas                            | Kompleks dan rapuh             | Template default dan batas docking yang jelas                  |
| Data stale terlihat aktual                      | Keputusan pengguna salah       | Freshness labels, fixtures, fail-closed                        |
| Bahasa edukasi berubah menjadi sinyal transaksi | Pengguna salah memahami produk | Explainability, risk-first copy, tanpa Buy/Sell CTA            |
| Aplikasi berat pada sesi panjang                | Retensi turun                  | Lazy load, tab limits, polling lifecycle, soak test            |
| Multi-platform terlalu awal                     | QA dan signing tidak matang    | Windows-first, perluasan setelah gate lulus                    |

## 20. Definition of Done MVP

MVP dianggap selesai bila:

- UI/UX desktop berbeda nyata dari web dan bukan sekadar webview;
- shell desktop, tab emiten, dua atau lebih panel, dan saved workspace bekerja;
- seluruh kemampuan web tercantum di feature parity matrix dan dapat diakses;
- fitur inti dapat digunakan keyboard-only;
- token disimpan di credential vault OS;
- CSP dan least-privilege capabilities aktif;
- native bridge gagal tertutup;
- data-quality dan restriction semantics tetap utuh;
- educational explanation tersedia pada metrik/insight utama;
- tidak ada gate paket berbayar;
- installer Windows ditandatangani dan dapat dihapus bersih;
- unit, integration, end-to-end, accessibility, security, performance, dan soak tests lulus;
- rollback telah diuji;
- tidak ada temuan keamanan critical/high terbuka;
- keputusan go/no-go didukung hasil pengujian nyata.

## 21. Keputusan Final Produk

1. Nama produk adalah **SahamLens Desktop**.
2. Kata **Pro** tidak digunakan pada nama, positioning, atau paket.
3. Produk tidak memiliki paket berbayar pada fase saat ini.
4. Tujuan utama adalah edukasi dan riset mandiri investor ritel.
5. Desktop memakai backend dan kapabilitas SahamLens yang sama, tetapi memiliki UI/UX sendiri.
6. Semua kemampuan web harus tersedia dari desktop melalui bentuk interaksi yang sesuai.
7. Multi-panel, tab emiten, saved workspace, command palette, dan native security adalah pembeda MVP.
8. Multi-window masuk P1 setelah single-window stabil.
9. Windows 11 menjadi target beta pertama.
10. Produk tidak menyediakan eksekusi order atau janji keuntungan.
