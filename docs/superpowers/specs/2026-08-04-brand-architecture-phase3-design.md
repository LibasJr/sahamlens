# Brand Architecture — Fase 3 (LensScanner, LensMarket, LensTechnical, LensWatch, LensAlert) — Design Spec

**Tanggal:** 2026-08-04
**Konteks:** Lanjutan `2026-08-03-brand-architecture-phase2-design.md` (LensAI/LensScore/LensRadar/LensFlow, sudah merge ke main). Master doc `SahamLens_Brand_Architecture.txt` urutan eksekusi poin 9: "Baru perluas ke LensScanner, LensMarket, LensTechnical, LensWatch dan LensAlert" setelah fase core selesai + test hijau.

Audit penuh (Explore agent, baca ulang kode terkini 2026-08-04) menemukan realita berikut sebelum keputusan diambil:

- **Screener:** 3 istilah beda untuk fitur sama — "Stock Screener" (Sidebar/moat/pricing), "Screener AI" (recommendations, + badge "SYSTEM AI" di sebelahnya), dan moduleTitle halaman `/screener` sendiri sudah "LensAI Multi-Factor Screener" dari fase lalu (salah kategori — ini fitur user-pilih-filter, seharusnya LensScanner bukan LensAI, sesuai definisi brand: Scanner = user pilih kondisi, Radar = app yang aktif menemukan).
- **Market overview:** 3 halaman beda (root `/` tanpa entri Sidebar, `/market-pulse` satu-satunya dengan entri Sidebar resmi "Ringkasan Pasar", `/market/[category]` kategori spesifik Top Gainer dst tanpa label payung).
- **Technical Analyzer:** 4 istilah beda di 1 halaman (`/dashboard`) — "Technical Analyzer" (nav), "Technical AI Analytics" (moduleTitle branch error), "Pure Algorithmic Trading (TS Analyzers)" (moduleTitle branch normal), "Algo Filters" (h3 komponen `AlgoFilters.tsx`, juga muncul terpisah di `backtest/page.tsx:205` dan `fundamental/page.tsx:411`) — plus kontradiksi: loading state bilang "Running AI Algorithms..." padahal positioning halaman yang sama eksplisit "Pure Math"/non-AI.
- **Watchlist & Alert:** 1 halaman (`/watchlist`) mencampur 2 konsep brand berbeda (LensWatch = watchlist/monitoring, LensAlert = notifikasi) — sudah dipisah jadi 2 section berbeda di kode (list watchlist vs card alert), tinggal dipetakan ke nama masing-masing.
- **Klaim menyesatkan ditemukan:** `shared/config/pricing.ts:71` dan `components/Sidebar.tsx:88` (subtitle "Portfolio & Telegram Bot") menjanjikan notifikasi Telegram real-time untuk alert watchlist — **tidak ada jalur kode yang mengirim alert watchlist lewat Telegram** (`sendTelegramMessage` di `lib/telegram.ts` cuma dipanggil dari `app/api/payment/notify/route.ts`, notifikasi admin pembayaran manual). Mekanisme alert yang benar-benar jalan cuma browser `Notification` API (butuh tab/PWA terbuka). Pola sama seperti temuan lama "Foreign Flow dikarang" — klaim fitur ke calon pembayar Pro yang tidak sesuai implementasi.

## Keputusan produk (hasil brainstorming, AskUserQuestion)

1. **LensScanner — full rename termasuk moduleTitle halaman sendiri.** "Stock Screener"/"Screener AI" di semua tempat → LensScanner (drop "AI", fitur ini murni filter matematis `screener.service.ts`, bukan model AI). moduleTitle `/screener` dipindah dari kategori LensAI ke LensScanner (`"LensAI Multi-Factor Screener"` → `"LensScanner Multi-Factor"`), karena Scanner = user pilih filter, beda kategori dari AI/reasoning layer.
2. **LensMarket — cuma `/market-pulse`.** Satu-satunya halaman dengan entri Sidebar resmi untuk kategori "market overview". Root `/` (`Dashboard.tsx`, tidak ada di nav) dan `/market/[category]` (Top Gainer dst, kategori spesifik) TIDAK disentuh — sesuai prinsip "jangan paksa semua nama branded ke setiap halaman".
3. **LensTechnical — satu nama konsisten + hapus wording "AI" yang kontradiktif.** Semua varian ("Technical Analyzer", "Technical AI Analytics", "Pure Algorithmic Trading", "Algo Filters" di manapun ia muncul, termasuk cross-reference di `backtest`/`fundamental`) diseragamkan LensTechnical. "SMART AI"/"Running AI Algorithms..." dihapus (fitur ini deterministik/non-AI, kontradiksi dengan positioning "Pure Math" yang sudah ada di halaman yang sama) — **hanya untuk moduleBank/moduleTitle/komponen milik Technical Analyzer/dashboard**, TIDAK menyentuh `moduleBank="SMART AI"` milik halaman Fundamental Analyzer (`app/fundamental/page.tsx:202,255`) — itu identitas halaman lain, di luar 5 brand term fase ini, dicatat sebagai temuan terpisah (lihat Addendum).
4. **LensWatch + LensAlert — 1 halaman, 2 nama untuk 2 section yang sudah terpisah secara struktur.** `/watchlist` jadi LensWatch (nav + h2, keseluruhan halaman/daftar saham dipantau), section card alert di dalamnya (`h3 "Push Notifications (HP/Browser)"`) jadi LensAlert. Tidak ada split halaman baru — dua section yang sudah ada secara struktural cuma dikasih nama masing-masing.
5. **Klaim Telegram palsu diperbaiki bareng rename LensAlert.** `pricing.ts:71` dan `Sidebar.tsx:88` diubah supaya akurat (notifikasi in-app/browser, bukan Telegram real-time) — konsisten dengan prinsip anti-klaim-palsu di brand doc (poin 14: larangan mengarang fitur yang tidak didukung data/implementasi nyata).

## Scope — Perubahan File

Semua perubahan teks label/subtitle/moduleTitle/moduleBank/copy. Tidak ada perubahan formula, logic alert-evaluation, route, atau nama file/komponen/service internal.

### LensScanner
| # | File:Line | Current | New |
|---|---|---|---|
| 1 | `components/Sidebar.tsx:72` | nav "Stock Screener" | nav "LensScanner" (subtitle "Filter Saham Multi-Faktor" tetap) |
| 2 | `app/screener/page.tsx:40` | `moduleTitle="LensAI Multi-Factor Screener"` | `moduleTitle="LensScanner Multi-Factor"` |
| 3 | `app/screener/page.tsx:41` | `moduleBank="LENSAI"` | `moduleBank="LENSSCANNER"` |
| 4 | `app/moat/page.tsx:44` | link teks "Stock Screener" | link teks "LensScanner" |
| 5 | `app/recommendations/page.tsx:220` | h2 "Rekomendasi Top 50 (Screener AI)" | h2 "Rekomendasi Top 50 (LensScanner)" |
| 6 | `app/recommendations/page.tsx:222` | badge "SYSTEM AI" | badge "LENSSCANNER" |
| 7 | `shared/config/pricing.ts:64` | "Stock Screener - filter multi-faktor" | "LensScanner - filter multi-faktor" |

### LensMarket
| # | File:Line | Current | New |
|---|---|---|---|
| 8 | `components/Sidebar.tsx:60` | nav "Ringkasan Pasar" | nav "LensMarket" (subtitle "Index, Sector & Breadth" tetap) |
| 9 | `app/market-pulse/page.tsx:203` | h2 "Ringkasan Pasar" | h2 "LensMarket" |
| 10 | `app/market-pulse/page.tsx:441` | title "Daftar Dulu untuk Lihat Ringkasan Pasar" | title "Daftar Dulu untuk Lihat LensMarket" |
| 11 | `app/market-pulse/page.tsx:442` | body "Ringkasan Pasar butuh akun..." | body "LensMarket butuh akun..." |

### LensTechnical + AI cleanup
| # | File:Line | Current | New |
|---|---|---|---|
| 12 | `components/Sidebar.tsx:68` | nav "Technical Analyzer" | nav "LensTechnical" (subtitle "10 Pure Math Filters" tetap) |
| 13 | `app/dashboard/page.tsx:501` | `moduleTitle="Technical AI Analytics"` | `moduleTitle="LensTechnical"` |
| 14 | `app/dashboard/page.tsx:502` | `moduleBank="SMART AI"` | `moduleBank="LENSTECHNICAL"` |
| 15 | `app/dashboard/page.tsx:515` | "...fitur Smart AI dari SahamLens." | "...fitur Pro dari SahamLens." |
| 16 | `app/dashboard/page.tsx:540` | `moduleTitle="Pure Algorithmic Trading (TS Analyzers)"` | `moduleTitle="LensTechnical — Pure Algorithmic Trading"` |
| 17 | `app/dashboard/page.tsx:541` | `moduleBank="SMART AI"` | `moduleBank="LENSTECHNICAL"` |
| 18 | `components/AlgoFilters.tsx:37` | h3 "Algo Filters" | h3 "LensTechnical" |
| 19 | `components/AlgoFilters.tsx:107` | "Running AI Algorithms..." | "Menjalankan Filter Teknikal..." |
| 20 | `app/backtest/page.tsx:205` | h3 "Algo Filters" | h3 "LensTechnical" |
| 21 | `app/fundamental/page.tsx:411` | h3 "Algo Filters" | h3 "LensTechnical" |
| 22-31 | 10 lokasi `'Unlimited Technical Analyzer (10 filter)'` — `app/backtest/page.tsx:460`, `app/breakout-radar/page.tsx:264`, `app/dashboard/page.tsx:517`, `app/dashboard/page.tsx:1046`, `components/UserProfileModal.tsx:251`, `app/compare/page.tsx:238`, `app/recommendations/page.tsx:408`, `app/market-pulse/page.tsx:432`, `app/fundamental/page.tsx:214`, `app/fundamental/page.tsx:476` | "Unlimited Technical Analyzer (10 filter)" | "Unlimited LensTechnical (10 filter)" |

### LensWatch + LensAlert
| # | File:Line | Current | New |
|---|---|---|---|
| 32 | `components/Sidebar.tsx:88` | nav "Watchlist & Alerts", subtitle "Portfolio & Telegram Bot" | nav "LensWatch", subtitle "Portfolio & Notifikasi" |
| 33 | `app/watchlist/page.tsx:282` | h2 "Watchlist & Alerts" | h2 "LensWatch" |
| 34 | `app/watchlist/page.tsx:474` | h3 "Push Notifications (HP/Browser)" | h3 "LensAlert" |
| 35 | `app/watchlist/page.tsx:244` | `new Notification('SahamLens Alert', ...)` | `new Notification('SahamLens LensAlert', ...)` |
| 36 | `app/watchlist/page.tsx:558` | "Watchlist unlimited (bukan cuma 3 saham)" | "LensWatch unlimited (bukan cuma 3 saham)" |
| 37 | `app/watchlist/page.tsx:559` | "Alert unlimited (bukan cuma 2)" | "LensAlert unlimited (bukan cuma 2)" |
| 38 | `shared/config/pricing.ts:71` | "Watchlist & Alert unlimited - notifikasi Telegram real-time untuk harga turun/naik dari target, RSI oversold, & konsensus STRONG BUY" | "LensWatch & LensAlert unlimited - notifikasi in-app/browser untuk harga turun/naik dari target, RSI oversold, & konsensus STRONG BUY" |
| 39 | `modules/notification/service/alert-evaluation.service.ts:69` | `'🚨 <b>ALERT SahamLens</b>'` | `'🚨 <b>SahamLens LensAlert</b>'` |
| 40 | `modules/notification/service/alert-evaluation.service.ts:78` | `'🚨 <b>ALERT SahamLens - Breakout Radar</b>'` | `'🚨 <b>SahamLens LensAlert - LensRadar</b>'` |
| 41 | `modules/notification/service/alert-evaluation.service.ts:88` | `'🚨 <b>ALERT SahamLens - Market Breadth</b>'` | `'🚨 <b>SahamLens LensAlert - LensMarket Breadth</b>'` |
| 42 | `modules/notification/service/alert-evaluation.service.ts:94` | `` `🚨 ALERT SahamLens: ${alert.symbol} (${alert.condition_type})` `` | `` `🚨 SahamLens LensAlert: ${alert.symbol} (${alert.condition_type})` `` |

**Di luar scope (dicatat, tidak dikerjakan fase ini):** `app/fundamental/page.tsx:202,255` `moduleBank="SMART AI"` — identitas halaman Fundamental Analyzer, bukan salah satu dari 5 brand term fase ini, bukan Technical Analyzer. `public/manifest.json` "Smart AI" — Tahap 8 (SEO/PWA), sudah ditunda sejak fase 2. LensScanner/Market/Technical tidak mengubah route/URL apapun.

## Risiko

- **Risiko utama (klaim Telegram):** perubahan copy murni, tidak ada risiko teknis — tapi WAJIB konsisten di kedua tempat (`pricing.ts:71` dan `Sidebar.tsx:88`) sekaligus, supaya tidak ada 1 tempat masih menjanjikan Telegram sementara tempat lain sudah jujur.
- **Risiko rendah lainnya:** semua perubahan literal string, tidak menyentuh logic. `AlgoFilters.tsx` dipakai di `/dashboard`; `backtest/page.tsx:205` dan `fundamental/page.tsx:411` adalah blok JSX terpisah (bukan import komponen yang sama), jadi mengubah salah satu tidak memengaruhi yang lain — masing-masing diedit sendiri-sendiri.

## Testing

- Grep ulang seluruh istilah lama ("Stock Screener", "Screener AI", "Ringkasan Pasar" di market-pulse, "Technical Analyzer"/"Technical AI Analytics"/"Pure Algorithmic Trading"/"Algo Filters"/"SMART AI"/"Running AI Algorithms" di scope, "Watchlist & Alerts", "Push Notifications (HP/Browser)", "Telegram" di pricing.ts/Sidebar.tsx) — pastikan cuma sisa di file yang sengaja di-skip (fundamental moduleBank, manifest.json).
- `npm run lint` / `tsc --noEmit` / `npm run build` / `npm test`.
- Manual check: `/screener`, `/moat`, `/recommendations`, `/market-pulse`, `/dashboard` (branch normal & branch error/no-data), `/backtest`, `/fundamental`, `/watchlist` — pastikan label baru tampil, tidak overflow.
