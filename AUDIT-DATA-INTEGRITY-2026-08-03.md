# SAHAMLENS FINANCIAL DATA INTEGRITY AUDIT

**Tanggal:** 2026-08-03
**Target:** https://sahamlens.vercel.app + repo `c:\xampp\htdocs\trading` (branch `main`, commit `16f517f`)
**Prinsip uji:** REAL DATA OR NO DATA
**Status:** AUDIT SELESAI + REMEDIASI SUDAH DIKERJAKAN (lihat REMEDIASI di bawah). Laporan asli (bagian di bawah judul ini) ditulis SEBELUM perbaikan dan dibiarkan apa adanya sebagai catatan temuan awal.

---

## REMEDIASI (2026-08-03, setelah audit)

Atas instruksi eksplisit untuk melanjutkan perbaikan, seluruh temuan **CRITICAL** dan **HIGH**, plus beberapa **MEDIUM/LOW** yang murah-risiko-rendah, sudah diperbaiki di source code. Diverifikasi: `tsc --noEmit` bersih, `eslint` bersih, `vitest run` 185/185 lulus, `next build` sukses (79/79 halaman).

### CRITICAL - semua 9 diperbaiki

| ID | Perbaikan | File |
|---|---|---|
| C-01 | Hapus 3 fallback indeks hardcoded (LQ45 608, IDX30 462.5, Kompas100 rumus `IHSG/5.42` & 1132.4); perbaiki bug `\|\|` yang membuat fallback simbol benar tidak pernah tereksekusi; null-safe render N/A di UI | `market-pulse.service.ts`, `market-pulse/page.tsx` |
| C-02 | Hapus fallback `mockPrice = 10000` yang mengklaim sumber `api.goapi.io (Mock)`; ganti jadi 503 + `price: null` jujur | `api/live/[ticker]/route.ts` |
| C-03 | 4 halaman (earnings/moat/pattern/macro) yang 100% angka karangan (target IHSG, win-rate musiman, konsensus analis, rating moat) diganti pesan jujur "data tidak tersedia"; atribusi merek pihak ketiga (JPMorgan/Bain&Co/Renaissance/McKinsey) dihapus | `app/earnings`, `app/moat`, `app/pattern`, `app/macro` |
| C-04 | `/api/explain` yang mengarang statistik backtest ("3x terjadi, 2x profit") dan mengklaim "data broker" yang tidak ada di aplikasi ini - ditulis ulang, hanya menjelaskan makna indikator dari data yang benar-benar dikirim, tanpa statistik/klaim palsu | `api/explain/route.ts` |
| C-05 | Bug satuan ROE/DER/RevenueGrowth (Yahoo mengembalikan fraksi/x100, diteruskan mentah) di jalur trafik tertinggi - disamakan dengan modul lain yang sudah benar | `api/stock/[ticker]/route.ts` |
| C-06 | EPS/forwardEps/dividendRate emiten pelapor USD (ADRO, ITMG, dst.) tidak lagi dikalikan kurs (sudah IDR dari Yahoo) - PER pulih dari 0,0005x ke ~8x | `api/fundamental/[ticker]/route.ts` |
| C-07 | PBV mentah emiten USD (s/d 14.529x) dikoreksi mata uang sebelum masuk scoring engine | `recommendation.service.ts`, `api/stock/[ticker]/route.ts` |
| C-08 | Fallback chat AI yang mengklaim "mendeteksi MoS" + rekomendasi TAHAN tanpa data apa pun - diganti pesan jujur; prompt sistem ditambah aturan "kalau data belum cukup, jangan mengarang rekomendasi/level harga" | `api/chat/route.ts` |
| C-09 | `sharesOutstanding \|\| 1` yang meledakkan FCF/share jadi FCF total perusahaan saat data hilang - diganti `null` (metode DCF dilewati, bukan angka triliunan) | `dcf-valuation.service.ts` (2 fungsi) |

### HIGH - semua 11 diperbaiki

| ID | Perbaikan |
|---|---|
| H-01 | RSI disatukan ke Wilder smoothing baku (modul baru `modules/technical/service/rsi.ts`), dipakai ulang oleh 4 pemanggil yang sebelumnya beda-beda (rata-rata sederhana, bias s/d +11,85 poin) |
| H-02 | Penjaga panjang histori breakout dinaikkan 25→51 bar - mencegah MA50 dihitung dengan pembagi tetap 50 saat data cuma 25-50 bar (Golden Cross palsu) |
| H-03 | `foreignFlow` di recommendation engine (dulu murni arah harga hari ini, dilabeli "Asing STRONG NET BUY") diganti `analyzeAccumulationSignal` (CMF 4-lapis) - konsisten dengan halaman Detail Saham |
| H-04 | Skor default karangan (30/20/50/10/30) untuk data fundamental hilang di screener dihapus - bobot dinormalisasi ulang dari komponen yang benar-benar ada datanya |
| H-05 | Rumus skor PER (dulu simetris, menghukum saham murah sama seperti saham mahal) diganti monoton - PER di bawah rata-rata sektor selalu skor penuh |
| H-06 | Cabang "MACD mixed signal" yang matematis mustahil tercapai (macdHist>0 identik dengan macdLine>macdSignal) dihapus, bukan dipalsukan seolah tercapai |
| H-07 | `scoreBandar()` yang menyekor volRatio/foreignFlow dua kali (sudah dinilai penuh di scoreVolume/scoreAsing) diganti CMF20 (dimensi baru, di-thread dari data yang sudah dihitung di kedua pemanggil) |
| H-08 | Volatilitas (ATR) tidak lagi jadi vote arah BULLISH/BEARISH (ATR mengukur besaran, bukan arah) - selalu NEUTRAL untuk arah; `risk_agent` orchestrator dikeluarkan dari bobot final score (weight_pct 0), tetap tampil sebagai konteks |
| H-09 | Support/Resistance analyzer ditambah pita netral 40-60% dari range - sebelumnya ~50% saham otomatis vote BEARISH hanya karena posisi di paruh atas range, tanpa opsi NEUTRAL |
| H-10 | `local-council` (fallback saat AI provider gagal) - 7 dari 10 agen yang dulu mengembalikan confidence/alasan tetap ("Momentum netral", "Volatilitas normal") sekarang dihitung dari data riil yang tersedia (volRatio, support/resistance, ATR); Chart Pattern Reader jujur bilang "belum tersedia" |
| H-11 | Prompt Council AI - 6 field (`ma50`, `ma200`, `rsi`, dst.) yang dulu jatuh ke `0` saat data hilang (dibaca AI sebagai "data real") diganti `'N/A'`, konsisten dengan field lain yang sudah benar |

### MEDIUM/LOW - beberapa quick-fix ikut dikerjakan

| ID | Perbaikan |
|---|---|
| M-10 | Teks fallback intrinsic-explain yang salah menyebut metodologi ("median") diperbaiki jadi "rata-rata berbobot" |
| L-01 | `data/calendar.json` (dummy yatim, sudah digantikan `corporate-calendar.service.ts`) dihapus - dikonfirmasi 0 pemanggil sebelum dihapus |
| L-02 | Variabel `nim` mati di `dcf-valuation.service.ts` (di-set tapi tidak pernah dipakai) dihapus |

### Update 2026-08-03 (lanjutan) - SEMUA MEDIUM & LOW ikut diperbaiki

Atas instruksi eksplisit lanjutan ("kerjakan dan perbaiki total yang salah"), seluruh temuan MEDIUM dan LOW yang sebelumnya ditandai "di luar scope iterasi ini" SUDAH dikerjakan juga. Diverifikasi ulang setelah batch ini: `tsc --noEmit` bersih, `eslint` 0 error, `vitest run` 185/185 lulus, `next build` sukses (80/80 halaman, termasuk route baru `/api/risk-analysis`).

| ID | Perbaikan |
|---|---|
| M-01 | `OhlcRow` sekarang membawa `AdjClose` (disesuaikan dividen, dari Yahoo `indicators.adjclose`) di samping `Close` mentah. 7 analyzer tren (EMA/MACD/RSI/SMA/Trend/Momentum/Market Flow) dan MA inline di `api/stock/[ticker]` + `recommendation.service.ts` dipindah ke `AdjClose ?? Close`. Diverifikasi empiris: MA200 BBRI bergeser 5,52% setelah penyesuaian. `Close` mentah TETAP dipakai untuk chart/support-resistance/harga tampilan. |
| M-02 | Modul baru `shared/market/trading-session.ts` - estimasi volume "penuh sehari" dari volume parsial saat bursa masih buka, diterapkan di 5 titik pemanggil live (stock route, recommendation, screener, breakout, market-summary). Analyzer bersama (dipakai backtest) TIDAK disentuh - tetap murni data historis lengkap. |
| M-03 | 4 analyzer (EMA/MACD/RSI/Volatility/ATR) sekarang mengembalikan field `raw` (angka asli) - `app/api/stock/[ticker]`, `recommendation.service.ts`, dan `app/api/council` tidak lagi parse-regex string `value`. |
| M-04 | Modul baru `decision-thresholds.ts` memusatkan ambang `getKategori`/`decisionFromScore`/`calculateConsensus` dengan dokumentasi kenapa 2 di antaranya SENGAJA beda (skor komposit berbeda). Duplikat vote-consensus di `recommendation.service.ts` (cutoff 70/50/30) dihapus, diganti panggilan `calculateConsensus()` yang sama dipakai halaman Detail Saham (cutoff 80/60) - saham yang sama sekarang selalu dapat label konsensus yang sama di kedua halaman. |
| M-05 | `ai-briefing`, `intrinsic-explain`, dan orchestrator `buildAiSummary` dipindah dari `getModel()` (1 model Gemini acak, tanpa retry) ke `generateAI()` (cascade Gemini+Groq+OpenRouter yang sudah dipakai chat/council). Logging ditambahkan saat satu kandidat model gagal. `lib/gemini.ts` (dead code setelah migrasi) dihapus. |
| M-06 | Payload stale-fallback di `api/stock/[ticker]` sekarang membawa `_meta.source: 'stale-cache'` + `ageSeconds` - UI/pemanggil bisa membedakan data basi dari data segar. |
| M-07 | Modul baru `shared/http/freshness.ts` (DELAYED/EOD/STALE dari `meta.regularMarketTime` sungguhan, bukan `Date.now()` server) - diterapkan di `api/live` dan `api/stock`. |
| M-08 | `fetchDividendUniverse()` tidak lagi memotong ke 18 saham TERTINGGI sebelum `avgYield` dihitung - avgYield sekarang dari seluruh universe, pemotongan 18 hanya untuk tabel tampilan. |
| M-09 | Modul baru `modules/market/service/beta.service.ts` (regresi beta harian riil vs IHSG & USD/IDR) + endpoint baru `api/risk-analysis` - halaman `/risk` sekarang menghitung stress test dari beta historis portofolio pengguna sungguhan (diverifikasi: beta BBCA vs IHSG = 0,87, vs USD/IDR = -0,56, dari data riil). BI Rate tetap jujur "data tidak tersedia" (tidak ada sumber data historisnya). |
| L-03 | Simbol Kompas100 di `IDX_INDICES` diperbaiki (dulu `'^JKSE'`, simbol IHSG). |
| L-04 | `market-flow.ts` disatukan ke satu nama (`Market Flow Index (Accum/Dist)`) di ketiga cabangnya. |

---

## RINGKASAN EKSEKUTIF

| Dimensi | Skor | Catatan |
|---|---|---|
| DATA INTEGRITY | **38 / 100** | 1 angka indeks hardcoded terbukti LIVE di production; 4 halaman produksi 100% angka karangan |
| PRICE ACCURACY | **55 / 100** | OHLC dari Yahoo bersih (0 pelanggaran dari 1.215 bar diuji), tapi ada fallback harga palsu Rp 10.000 |
| TECHNICAL CALCULATION | **52 / 100** | MACD/EMA/ATR PASS. RSI FAIL vs standar (deviasi s/d +11,85 poin). Bug pembagi MA50. |
| FUNDAMENTAL CALCULATION | **35 / 100** | Bug satuan ROE/DER di jalur trafik tertinggi; EPS emiten pelapor USD dirusak 16.300x |
| SCREENER ACCURACY | **48 / 100** | Rumus skor PER menghukum saham murah; data kosong diberi skor karangan |
| SCORING ENGINE | **45 / 100** | Double counting, cabang mati, data N/A dapat 5 poin gratis |
| AI DATA SAFETY | **40 / 100** | 1 endpoint mengarang statistik backtest & mengklaim "data broker" yang tidak ada |
| DCF ACCURACY | **50 / 100** | Asumsi transparan & sensitivitas benar, tapi ada `sharesOutstanding \|\| 1` dan kurs fallback 15.500 |

**Total temuan: 34** — **9 CRITICAL**, **11 HIGH**, **10 MEDIUM**, **4 LOW**.

**Kabar baiknya:** audit dummy-data 2026-08-01 sebelumnya benar-benar berhasil. `seedRandom()` di Foreign Flow, Bandar Flow, dan orchestrator sudah dihapus tuntas. Tidak ditemukan satu pun `Math.random()` yang menghasilkan angka finansial. Pipeline utama (harga, OHLC, backtest, compare, calendar, dividend, macro) benar-benar tersambung ke Yahoo Finance.

**Kabar buruknya:** masih ada 4 halaman produksi yang seluruh angkanya karangan, 1 nilai indeks palsu yang bisa dibuktikan tayang saat ini juga, dan beberapa bug satuan yang membuat skor fundamental salah untuk hampir semua saham.

---

## TAHAP 1 — HASIL SCAN DATA DUMMY

Scan 301 file `.ts`/`.tsx` (kecuali `node_modules`, `.next`, `sahamlens-android`, `android-webview`, `mobile`).

### `Math.random()` — hasil scan

| File | Baris | Isi | Produksi? | Risiko |
|---|---|---|---|---|
| `lib/gemini.ts` | 28 | Pilih model Gemini acak | Ya | LOW — bukan data finansial |
| `lib/aiProviders.ts` | 36 | Shuffle urutan provider AI | Ya | LOW — bukan data finansial |
| `lib/demo-portfolio.ts` | 100, 139 | ID transaksi acak | Ya | LOW — hanya ID, bukan harga |
| `lib/trendingTickers.ts` | 17 | Pilih simbol trending acak | Ya | LOW — pilihan simbol, harga tetap dari API |

**Verdict TAHAP 1: LULUS untuk `Math.random()`.** Tidak ada satu pun angka finansial (harga, volume, PER, ROE, flow) yang dihasilkan dari random. Ini perbaikan nyata dari audit sebelumnya.

### Hardcoded / fallback angka finansial — hasil scan

Lihat temuan **C-01** s/d **C-05** di bawah. Ringkasan lokasi:

| File | Baris | Data | Produksi? | Risiko |
|---|---|---|---|---|
| `modules/market/service/market-pulse.service.ts` | 115, 121, 131 | Harga indeks IDX30/LQ45/Kompas100 | **YA — TERBUKTI TAYANG** | **CRITICAL** |
| `app/api/live/[ticker]/route.ts` | 55 | `mockPrice = 10000` | Ya (saat Yahoo 429/403) | **CRITICAL** |
| `app/api/explain/route.ts` | 19-48 | Statistik backtest & "data broker" | Ya (endpoint hidup, tanpa auth) | **CRITICAL** |
| `app/earnings/page.tsx` | 54, 58, 115, 125 | Konsensus revenue/laba, bull/bear case | **YA — 100% waktu** | **CRITICAL** |
| `app/pattern/page.tsx` | 52, 57, 62, 82, 88, 92 | Win rate musiman, probabilitas | **YA — 100% waktu** | **CRITICAL** |
| `app/macro/page.tsx` | 111-136, 150, 157 | Target IHSG, outlook BI Rate, rotasi sektor | **YA — 100% waktu** | **CRITICAL** |
| `app/moat/page.tsx` | 100 | Kesimpulan pemenang sektor | **YA — 100% waktu** | **CRITICAL** |
| `app/risk/page.tsx` | 100-125 | Angka stress test | Ya (diberi label "estimasi generik") | MEDIUM |
| `app/api/chat/route.ts` | 68 | Klaim "MoS terdeteksi" tanpa hitungan | Ya (saat AI provider kosong) | HIGH |
| `modules/ai/service/local-council.service.ts` | 21-30 | Confidence & alasan 10 agen | Ya (saat AI gagal) | HIGH |
| `modules/fundamental/service/dcf-valuation.service.ts` | 63, 316 | Kurs USD/IDR fallback 15.500 | Ya | HIGH |
| `app/api/fundamental/[ticker]/route.ts` | 53 | Kurs USD/IDR fallback 15.500 | Ya | HIGH |
| `data/calendar.json` | seluruh | Kalender corporate action dummy | **Tidak** — sudah yatim | LOW |

**Test fixture** di `__tests__/` dan `*/__tests__/*` sudah benar terpisah dari runtime — tidak ada mock finansial yang bocor ke produksi lewat jalur test.

---

## TEMUAN CRITICAL

### C-01 — Nilai indeks LQ45 hardcoded, TERBUKTI TAYANG DI PRODUCTION SEKARANG

- **FILE:** `modules/market/service/market-pulse.service.ts`
- **LINE:** 117-122 (LQ45), 111-116 (IDX30), 123-133 (Kompas100)
- **FUNCTION:** `getMarketPulse()`

**MASALAH**
```ts
quote = await fetchYahooQuote('LQ45.JK') || await fetchYahooQuote('^JKLQ45');
if (!quote || quote.price === 0) {
  console.error('Failed to fetch LQ45, using dummy data');
  quote = { price: 608, changePct: -1.1, sparkline: [], volume: 0 } as any;
}
```

Operator `||` gagal karena `fetchYahooQuote('LQ45.JK')` mengembalikan **objek yang truthy** dengan `price: 0` (simbol `LQ45.JK` ada di Yahoo tapi tidak punya data intraday). Karena objeknya truthy, fallback ke `^JKLQ45` (simbol yang BENAR dan berfungsi) tidak pernah dieksekusi. Alur langsung jatuh ke angka hardcoded.

**DATA SOURCE:** Tidak ada. Angka literal di source code.

**BUKTI EMPIRIS — production, 2026-08-03 09:01 UTC**
```
$ curl -s https://sahamlens.vercel.app/api/market-pulse
... {"symbol":"^JKLQ45","name":"LQ45","price":608,"changePct":-1.1,"sparkline":[],"volume":0} ...
```
Nilai LQ45 sesungguhnya pada waktu yang sama (`^JKLQ45` dari Yahoo):
```
^JKLQ45  http 200  price 622.162  prevClose 621.244  changePct +0.15
```

| Metrik | SahamLens | Referensi (Yahoo `^JKLQ45`) | Selisih | Selisih % |
|---|---|---|---|---|
| LQ45 harga | 608 | 622,162 | -14,162 | **-2,28%** |
| LQ45 perubahan | **-1,10%** | **+0,15%** | — | **ARAH TERBALIK** |

**DAMPAK:** Kartu LQ45 di halaman Ringkasan Pasar menampilkan indeks **turun 1,1%** padahal kenyataannya **naik 0,15%**. Angka `608` juga statis — tidak akan pernah berubah sampai kode diubah. Pengguna yang menilai sentimen pasar dari kartu ini mendapat sinyal yang berkebalikan dari kenyataan.

**Catatan tambahan:**
- IDX30 fallback `462.5` — saat ini `IDX30.JK` masih berfungsi (349,038), jadi tidak aktif. Tapi jika Yahoo mengubah simbol, angka basi 462,5 (selisih +32% dari nilai riil) akan tayang.
- Kompas100 punya jalur lebih parah: `quote = { ...ihsg, price: ihsg.price / 5.42 }` (baris 128) — nilai indeks Kompas100 direkayasa dengan membagi IHSG dengan konstanta ajaib `5.42`. Saat ini tidak aktif (Kompas100.JK berfungsi = 816,37), tapi jika aktif akan menghasilkan 6223/5,42 = 1148 vs nilai riil 816 (**+40% salah**). Fallback terakhirnya angka literal `1132.4`.
- `IDX_INDICES` baris 7 mendeklarasikan Kompas100 dengan simbol `'^JKSE'` (simbol IHSG), lalu ditimpa cabang `if`. Deklarasi ini menyesatkan.

**SOLUSI**
Ganti seluruh blok fallback dengan `price: null` dan biarkan UI merender "Data tidak tersedia". Perbaiki chaining dengan mengecek `price > 0`, bukan truthiness objek:
```ts
const tryQuote = async (...syms: string[]) => {
  for (const s of syms) { const q = await fetchYahooQuote(s); if (q && q.price > 0) return q; }
  return null;
};
quote = await tryQuote('^JKLQ45', 'LQ45.JK');   // simbol yang berfungsi didahulukan
```

---

### C-02 — Fallback harga palsu Rp 10.000 untuk saham apa pun

- **FILE:** `app/api/live/[ticker]/route.ts`
- **LINE:** 55-64
- **FUNCTION:** `GET()`

**MASALAH**
```ts
// Fallback if blocked
const mockPrice = 10000;

return NextResponse.json({
  price: mockPrice,
  changePercent: 0,
  volume: 0,
  lastUpdate: new Date().toISOString(),
  source: 'api.goapi.io (Mock)',
  delay: '15m'
});
```

Ketika Yahoo mengembalikan 429 (rate limit) atau 403 (blocked) — kondisi yang **rutin terjadi** pada endpoint publik Yahoo tanpa API key — endpoint ini mengembalikan **Rp 10.000 untuk ticker apa pun**, dengan HTTP 200 dan `lastUpdate` = waktu sekarang.

**DATA SOURCE:** Tidak ada. `source: 'api.goapi.io (Mock)'` menyebut provider yang tidak pernah dipanggil di kode ini.

**DAMPAK:** Ini persis pola `price || 1000` yang dilarang, hanya dengan angka berbeda. Konsumen endpoint ini:

| Konsumen | File:Line | Dampak saat fallback aktif |
|---|---|---|
| Beranda — kartu IHSG | `app/home/page.tsx:95` | IHSG ditampilkan 10.000 (riil ~6.223) |
| Dashboard — kartu IHSG | `components/Dashboard.tsx:163` | Sama |
| Risk Calculator | `app/risk-calculator/page.tsx:55` | Harga entry ter-prefill Rp 10.000 → seluruh position sizing & risk/reward salah |
| Multi-Agent | `app/multi-agent/page.tsx:58` | Harga acuan salah |
| /earnings, /moat, /pattern, /macro | 4 file | (sudah rusak karena C-03) |

Risk Calculator adalah yang paling berbahaya: pengguna menghitung ukuran lot dan stop loss dari harga entry Rp 10.000 yang tidak ada hubungannya dengan harga saham sungguhan.

**CONTOH:** Yahoo 429 → `GET /api/live/BBCA` → `{"price":10000,...}`. BBCA riil Rp 6.275. Selisih **+59,4%**.

**SOLUSI:** Hapus blok fallback. Kembalikan `503` dengan `{ error: 'Data harga tidak tersedia', source: null }`. Semua konsumen sudah punya jalur `catch`/`null` — biarkan mereka menampilkan "N/A".

---

### C-03 — Empat halaman produksi menampilkan 100% angka karangan, setiap saat, untuk semua ticker

- **FILE:** `app/earnings/page.tsx`, `app/moat/page.tsx`, `app/pattern/page.tsx`, `app/macro/page.tsx`
- **FUNCTION:** komponen halaman masing-masing

**MASALAH**
Keempat halaman memanggil `/api/live/[ticker]`, lalu membaca:
```ts
const res = await fetch('/api/live/' + ticker);
const json = await res.json();
setData(json);
...
const ai = data?.analysis || {};
```

`/api/live/[ticker]` **hanya** mengembalikan `{ price, changePercent, volume, lastUpdate, source, delay }`. Tidak ada field `analysis`, tidak ada `stock`, tidak ada `consensus`. Artinya `ai` **selalu `{}`**, dan setiap ekspresi `{ai.X || 'literal'}` **selalu** merender literal-nya.

Ini bukan "fallback yang jarang terpakai". Ini satu-satunya jalur yang pernah dieksekusi — 100% permintaan, semua ticker, sejak halaman dibuat.

**Reachability:** keempatnya tidak ada di sidebar, tapi terbuka di production:
```
GET https://sahamlens.vercel.app/pattern   -> 200
GET https://sahamlens.vercel.app/macro     -> 200
GET https://sahamlens.vercel.app/earnings  -> 200
GET https://sahamlens.vercel.app/moat      -> 200
```

**DATA SOURCE:** Tidak ada — seluruhnya literal di JSX.

**CONTOH — angka yang selalu tayang:**

| Halaman | Line | Klaim yang ditampilkan | Realita |
|---|---|---|---|
| `/earnings` | 54 | "Konsensus Revenue: **Rp 24.8 T**" | Tidak ada data konsensus analis di aplikasi ini |
| `/earnings` | 58 | "Konsensus Laba Bersih: **Rp 5.2 T**" | Sama |
| `/earnings` | 44 | "Jadwal Rilis LK: **Q3 2026**" | Tidak dihitung dari `calendarEvents` |
| `/earnings` | 115 | "kenaikan harga **+4% hingga +6%**" | Proyeksi karangan |
| `/earnings` | 125 | "profit taking hingga **-3%**" | Proyeksi karangan |
| `/pattern` | 52 | "Window Dressing Desember: **85% Win Rate (+3.8%)**" | Tidak ada backtest musiman di codebase |
| `/pattern` | 57 | "Ramadan & Lebaran: **+4.2% Pre-Lebaran**" | Sama |
| `/pattern` | 62 | "January Effect: **72% Win Rate**" | Sama |
| `/pattern` | 82 | "Probabilitas penguatan 30 hari pasca LK positif adalah **76.5%**" | Sama |
| `/pattern` | 88 | "**Rabu & Jumat** cenderung punya net buy asing terbesar" | Aplikasi ini tidak punya data net buy asing sama sekali |
| `/pattern` | 92 | "Volume spike **2.0x** rata-rata 20 hari" | Tidak dihitung |
| `/macro` | 150 | "TARGET IHSG: **7.800 - 8.000**" | Proyeksi karangan |
| `/macro` | 157 | "BI Rate diperkirakan memangkas **25-50 bps**" | Tidak ada data BI Rate (lihat `macro-refresh.service.ts` — hanya USD/IDR) |
| `/macro` | 111-136 | Daftar OVERWEIGHT/NEUTRAL/UNDERWEIGHT per sektor | Tidak dihitung, tidak berubah saat dropdown diganti |
| `/moat` | 100 | "**BBCA** adalah pemenang utama sektor keuangan..." | Tidak berubah walau pengguna memilih sektor Energy/Retail/dll |
| `/moat` | 74-88 | Tabel Market Cap / Profit Margin / Moat / Pangsa Pasar / Rating Manajemen | Selalu kosong (`emitens = []`) |
| `/earnings` | 80-96 | Tabel Beat/Miss 4 kuartal | Selalu kosong (`history = []`) |

**Masalah tambahan — atribusi merek pihak ketiga.** Halaman-halaman ini melabeli angka karangan tersebut dengan nama institusi riil: `moduleBank="JPMORGAN"`, `"BAIN & CO"`, `"RENAISSANCE TECH"`, `"MCKINSEY & CO"`, dengan judul seperti "Rekomendasi Rotasi Sektor McKinsey Matrix" dan "TARGET IHSG MCKINSEY". Ini mengaitkan riset karangan dengan firma nyata yang tidak pernah memproduksinya — masalah hukum/reputasi terpisah dari masalah data.

**DAMPAK:** Pelanggaran paling berat terhadap prinsip REAL DATA OR NO DATA di seluruh aplikasi. Pengguna yang menemukan URL ini (link langsung, riwayat browser, hasil pencarian) melihat proyeksi laba, target indeks, dan win-rate statistik yang seluruhnya fiktif namun disajikan dengan otoritas penuh.

**SOLUSI:** Pilih salah satu, jangan setengah-setengah:
1. Hapus keempat halaman + route-nya (paling cepat, karena tidak ada di navigasi).
2. Kalau mau dipertahankan: bangun backend nyatanya dulu, dan sampai itu ada, ganti seluruh literal jadi `'Data belum tersedia'` serta hapus atribusi merek pihak ketiga.

---

### C-04 — Endpoint `/api/explain` mengarang statistik backtest dan mengklaim "data broker" yang tidak ada

- **FILE:** `app/api/explain/route.ts`
- **LINE:** 19-48
- **FUNCTION:** `POST()`

**MASALAH** — seluruh isi respons endpoint ini adalah string hardcoded yang menyamar sebagai hasil analisis historis:

```ts
// baris 20-21
explanation = `EMA20 (${data?.ema20 || '-'}) masih di bawah EMA50 ... selama 12 hari. ...`;
historical  = "3x terjadi di 6 bulan terakhir, 2x lanjut turun";

// baris 24
historical  = "4x terjadi di 6 bulan terakhir, 3x profit";

// baris 28
explanation = `RSI ${data.value} masuk OVERSOLD (<35). Secara historis di ${symbol},
               tiap RSI <32, rebound 3-5% dalam 5 hari (Hist Accuracy 45%). ...`;

// baris 40-41
explanation = "Meski Foreign Net terlihat negatif, data broker menunjukkan Top Buyer
               memborong lebih banyak volume dibanding Top Seller secara agregat.
               Ini indikasi akumulasi diam-diam oleh smart money/bandar lokal.";

// baris 48
historical  = "Tingkat akurasi sistem untuk pola ini adalah 62-72%.";
```

Rincian pelanggaran:
1. **"selama 12 hari"** — durasi cross tidak pernah dihitung; angka literal untuk semua saham.
2. **"3x terjadi di 6 bulan terakhir, 2x lanjut turun"**, **"4x ... 3x profit"** — statistik kejadian historis yang tidak pernah di-backtest. Modul backtest (`modules/backtest/`) tidak pernah dipanggil dari sini.
3. **"tiap RSI <32, rebound 3-5% dalam 5 hari (Hist Accuracy 45%)"** — diklaim spesifik "di `${symbol}`", membuatnya terdengar seperti hasil studi per-emiten. Tidak ada.
4. **"data broker menunjukkan Top Buyer memborong lebih banyak volume dibanding Top Seller"** — **aplikasi ini tidak punya data broker sama sekali.** Fakta ini didokumentasikan berulang kali oleh kode itu sendiri (`foreign-flow-proxy.ts:2`, `flow/[ticker]/route.ts:9`, `orchestrator.service.ts:44`: "IDX tidak menyediakan feed broker summary gratis", "Top Broker DIHAPUS"). Endpoint ini mengklaim persis data yang seluruh codebase lain akui tidak ada.
5. **"Tingkat akurasi sistem untuk pola ini adalah 62-72%"** — klaim akurasi sistem tanpa dasar pengukuran apa pun.

**Tanpa autentikasi.** Berbeda dari route lain, tidak ada `getSession()`. Siapa pun bisa memanggilnya.

**DATA SOURCE:** Tidak ada.

**DAMPAK:** Statistik backtest palsu adalah bentuk misinformasi finansial paling berbahaya — angka "45% Hist Accuracy" dan "62-72% akurasi sistem" memberi ilusi rigor kuantitatif pada tebakan. Klaim "data broker" secara langsung membohongi pengguna tentang kemampuan produk.

**Mitigasi yang ada saat ini:** tidak ada pemanggil di codebase (grep `api/explain` → 0 hasil di `app/`, `components/`, `modules/`). Endpoint yatim tapi tetap ter-deploy dan hidup.

**SOLUSI:** Hapus file `app/api/explain/route.ts` seluruhnya. Kalau fitur "jelaskan indikator ini" mau dihidupkan lagi, hitung statistiknya dari `modules/backtest/` yang sudah ada dan bisa dipertanggungjawabkan.

---

### C-05 — Bug satuan ROE / DER / Revenue Growth di jalur trafik tertinggi

- **FILE:** `app/api/stock/[ticker]/route.ts`
- **LINE:** 164, 165, 167
- **FUNCTION:** `GET()` → diteruskan ke `calculateScore()`

**MASALAH**
```ts
roe           = quoteSummary.financialData?.returnOnEquity  || null;   // TIDAK dikali 100
der           = quoteSummary.financialData?.debtToEquity    || null;   // TIDAK dibagi 100
revenueGrowth = quoteSummary.financialData?.revenueGrowth   || null;   // TIDAK dikali 100
```

Kontrak `FundamentalInput` di `modules/technical/service/scoring.service.ts:30-33` menyatakan eksplisit:
```ts
roe: number | null;  // already in % (e.g. 18.2)
der: number | null;  // ratio (e.g. 0.4)
```

**BUKTI SATUAN YAHOO (diverifikasi live via `yahoo-finance2`, 2026-08-03):**
```
BBCA.JK  returnOnEquity = 0.21818      (= 21,82%)
TLKM.JK  debtToEquity   = 59.982       (= 0,60x)
ASII.JK  debtToEquity   = 41.125       (= 0,41x)
BBCA.JK  revenueGrowth  = 0.025        (= +2,5%)
```

Modul lain **sudah benar** — inilah bukti ini bug, bukan konvensi:
- `modules/market/service/screener.service.ts:141-142` → `returnOnEquity * 100`, `debtToEquity / 100` ✅
- `modules/recommendation/service/recommendation.service.ts:157-160` → sama ✅
- `modules/fundamental/service/analyzers/roe-analyzer.ts:5` → `roe * 100` ✅
- `modules/fundamental/service/analyzers/der-analyzer.ts:16` → `der / 100` ✅
- `app/api/stock/[ticker]/route.ts` → **satu-satunya yang tidak** ❌

**DAMPAK — jejak untuk BBCA (harga Rp 6.275, ROE riil 21,8%):**

| Langkah | Nilai | Cabang di `scoreProfitabilitas()` | Poin |
|---|---|---|---|
| Yahoo `returnOnEquity` | 0,21818 | — | — |
| Diteruskan apa adanya | 0,21818 | `roe > 20`? tidak → `>= 15`? tidak → `>= 8`? tidak → **else** | **0 / 5** |
| Seharusnya | 21,818 | `roe > 20` → ya | **5 / 5** |

Teks yang tampil ke pengguna: **"ROE 0.2% (lemah)"** untuk bank paling profitabel di IDX.

| Langkah | Nilai (TLKM) | Cabang di `scoreKesehatan()` | Poin |
|---|---|---|---|
| Yahoo `debtToEquity` | 59,982 | `< 0.5`? tidak → `< 1.0`? tidak → `< 2.0`? tidak → **else** | **0 / 5** |
| Seharusnya | 0,600 | `< 1.0` → ya | **4 / 5** |

Teks yang tampil: **"DER 59.98x (berisiko tinggi)"** — DER sesungguhnya 0,60x, sangat sehat.

**Akibat berantai:**
1. **Setiap saham** kehilangan hingga 10 dari 30 poin `fundamental_score` di halaman Detail Saham / Technical Analyzer.
2. `total_score` turun 10 poin → banyak saham yang seharusnya `BUY` (≥60) turun jadi `HOLD`, `HOLD` (≥45) jadi `SELL`.
3. Skor komposit ini dikirim ke prompt Council AI (`app/api/council/route.ts` → `data.score`) — AI merasionalisasi angka yang salah, lalu menulis narasi meyakinkan berdasarkan premis palsu.
4. Saham yang sama menghasilkan `fundamental_score` **berbeda** di halaman Screener (benar) vs Detail Saham (salah) — inkonsistensi yang bisa dilihat pengguna.

**SOLUSI:** Samakan dengan pola yang sudah benar di `recommendation.service.ts:157-160`:
```ts
roe           = qs.financialData?.returnOnEquity  != null ? qs.financialData.returnOnEquity  * 100 : null;
der           = qs.financialData?.debtToEquity    != null ? qs.financialData.debtToEquity    / 100 : null;
revenueGrowth = qs.financialData?.revenueGrowth   != null ? qs.financialData.revenueGrowth   * 100 : null;
```
Lebih baik lagi: normalisasi satuan di **satu** fungsi bersama, supaya tidak ada file ke-4 yang salah lagi.

---

### C-06 — EPS emiten pelapor USD dikalikan kurs → PER hancur 16.300x

- **FILE:** `app/api/fundamental/[ticker]/route.ts`
- **LINE:** 59, 60, 71, 79-81
- **FUNCTION:** `GET()`

**MASALAH**
```ts
if (priceCurrency === 'IDR' && finCurrency === 'USD') {
   let exchangeRate = 15500;
   ...
   if (quoteSummary.defaultKeyStatistics.trailingEps) quoteSummary.defaultKeyStatistics.trailingEps *= exchangeRate;  // ❌
   if (quoteSummary.defaultKeyStatistics.forwardEps)  quoteSummary.defaultKeyStatistics.forwardEps  *= exchangeRate;  // ❌
   if (quoteSummary.summaryDetail.dividendRate)       quoteSummary.summaryDetail.dividendRate       *= exchangeRate;  // ❌
   ...
   quoteSummary.summaryDetail.trailingPE = currentPrice / quoteSummary.defaultKeyStatistics.trailingEps;
}
```

File lain di repo yang sama menyatakan asumsi **berlawanan**, dan file itulah yang benar — `modules/fundamental/service/dcf-valuation.service.ts:70-73`:
```ts
// FIX: Yahoo Finance EPS & DPS are ALREADY in IDR.
// Only BVPS and FCF are in USD.
bvps *= exchangeRate;
```

**BUKTI EMPIRIS (live, 2026-08-03):**
```
ADRO.JK  price=2470   fincur=USD  eps=310.45   PE_yahoo=7.956   2470/310.45 = 7.96  ✅ EPS sudah IDR
ITMG.JK  price=24650  fincur=USD  eps=2894.94  PE_yahoo=8.515   24650/2894.94 = 8.51 ✅ EPS sudah IDR
ADRO.JK  bookValue=0.17  → jelas USD (PBV Yahoo mentah 14.529x)  ✅ BVPS memang USD
```

EPS terbukti sudah dalam IDR (bagi harga IDR dengan EPS langsung menghasilkan PER Yahoo yang benar). BVPS memang USD.

**DAMPAK — halaman Fundamental Analyzer, emiten pelapor USD:**

| Ticker | EPS Yahoo | EPS setelah dikali kurs | PER benar | PER ditampilkan |
|---|---|---|---|---|
| ADRO | 310,45 | 5.060.335 | **7,96x** | **0,00049x** |
| ITMG | 2.894,94 | 47.187.522 | **8,51x** | **0,00052x** |

`analyzePe()` (`pe-analyzer.ts:11`) lalu mengevaluasi `pe < 15` → **BULLISH dengan confidence 95** untuk setiap emiten pelapor USD, tanpa peduli valuasi sesungguhnya. Ini bukan sekadar tampilan salah — ini vote BULLISH permanen yang masuk ke `consensus` halaman itu (`UNDERVALUED (BULLISH x%)`).

`dividendRate` juga dikali kurs → Rp 236 jadi Rp 3,8 juta per lembar.

Emiten IDX pelapor USD yang terdampak (ada di universe aplikasi): ADRO, ITMG, MEDC, INCO, AADI, ADMR, BYAN, HRUM, INDY, NCKL, MBMA, PTBA-grup terkait, dan lainnya.

**Catatan:** `bookValue *= exchangeRate` di baris 61 **BENAR** — jangan ikut dihapus.

**SOLUSI:** Hapus tiga baris pengali EPS/forwardEps/dividendRate. Pertahankan hanya BVPS, FCF, operatingCashflow, totalRevenue, grossProfits, totalCash, totalDebt. Setelah itu jangan hitung ulang `trailingPE` sama sekali — nilai `summaryDetail.trailingPE` dari Yahoo sudah benar.

---

### C-07 — PBV mentah emiten pelapor USD (nilai s/d 14.529x) masuk ke scoring engine

- **FILE:** `modules/recommendation/service/recommendation.service.ts` (baris 156), `app/api/stock/[ticker]/route.ts` (baris 163)
- **FUNCTION:** `analyzeStock()`, `GET()`

**MASALAH**
```ts
pbv = quoteSummary?.defaultKeyStatistics?.priceToBook || null;
```
Diteruskan langsung ke `calculateScore()` tanpa koreksi mata uang. Untuk emiten pelapor USD, `priceToBook` Yahoo membandingkan harga IDR dengan book value USD.

**BUKTI:** `ADRO.JK priceToBook = 14529.411`, `ITMG.JK priceToBook = 14331.396`. Nilai sesungguhnya setelah koreksi kurs: **0,89x** dan **0,88x** — dua-duanya di bawah book value (murah).

**DAMPAK** — jejak `scoreValuasi()` untuk ADRO:

| Langkah | Nilai | Cabang | Poin | Teks ke pengguna |
|---|---|---|---|---|
| PBV diteruskan | 14.529,41 | `< 1`? tidak → `< 2`? tidak → **else** | **1 / 5** | "PBV 14529.41x (premium)" |
| PBV sebenarnya | 0,89 | `< 1` → ya | **5 / 5** | "PBV 0.89x (di bawah book)" |

Saham yang diperdagangkan **di bawah nilai buku** dilabeli "premium" dan kehilangan 4 poin valuasi. Berlaku untuk seluruh sektor batu bara & tambang di universe rekomendasi.

`modules/fundamental/service/dcf-valuation.service.ts` sudah menangani ini dengan benar (baris 110-112 menghitung `calcBvps` dari `price / priceToBook`), jadi polanya sudah ada di repo — tinggal dipakai ulang.

**SOLUSI:** Sebelum meneruskan ke `calculateScore()`, cek `price.currency === 'IDR' && financialData.financialCurrency === 'USD'`; kalau ya, jangan pakai `priceToBook` mentah — hitung `pbv = price / (bookValue * fxRate)` atau set `null` (dan biarkan `scoreValuasi` melaporkan data tidak lengkap).

---

### C-08 — Fallback chat AI mengarang kesimpulan valuasi & rekomendasi

- **FILE:** `app/api/chat/route.ts`
- **LINE:** 65-69
- **FUNCTION:** `POST()`

**MASALAH**
```ts
if (!hasAnyAIProvider()) {
  return NextResponse.json({
    role: 'assistant',
    content: `**[MODE SIMULASI AI]**\n\n... * **Valuasi Internal:** Engine kami mendeteksi
      bahwa saham ini sedang berada di sekitar nilai wajar atau batas Margin of Safety (MoS).
      \n* **Tren:** Selalu konfirmasi dengan MA20 dan MA50 sebelum entry.
      \n\n**KESIMPULAN SEMENTARA:**\n**TAHAN** ...`
  });
}
```

Tidak ada MoS yang dihitung di jalur kode ini. Tidak ada ticker yang diketahui. Tidak ada harga. Namun respons menyatakan "Engine kami **mendeteksi**" bahwa saham berada di sekitar nilai wajar, lalu mengeluarkan **rekomendasi TAHAN**.

**DAMPAK:** Rekomendasi tanpa dasar data apa pun, dengan klaim palsu bahwa engine internal telah melakukan deteksi. Label "[MODE SIMULASI AI]" tidak menetralkan ini — pengguna tetap membaca kesimpulan valuasi + rekomendasi.

**Masalah terkait di file yang sama** (baris 27, aturan prompt #5):
```
5. Berikan kesimpulan akhir: **BELI**, **JUAL**, atau **TAHAN** beserta level entry/exit jika memungkinkan.
```
Prompt **mewajibkan** AI selalu memberi rekomendasi + level harga, tanpa satu pun aturan yang mengizinkan AI menjawab "data tidak tersedia". Ketika `context` kosong (pengguna chat dari halaman tanpa ticker aktif), AI tetap dipaksa mengarang level entry/exit. Bandingkan dengan prompt Council (`council.service.ts:16`) yang benar: *"kalau suatu dimensi tidak ada datanya, bilang 'data belum cukup' alih-alih mengarang"*.

**Masalah ketiga:** `context` berasal dari `body.context` — sepenuhnya dikirim client (`components/AIChat.tsx:100`). Server tidak memverifikasi apa pun. Client yang dimodifikasi bisa menyuapi "data referensi" apa pun ke analis AI.

**SOLUSI:**
1. Ganti fallback jadi: `"Council AI belum terkonfigurasi di server ini. Analisis AI tidak tersedia — silakan gunakan Technical Analyzer & Fundamental Analyzer yang berbasis perhitungan langsung."` Tanpa klaim valuasi, tanpa rekomendasi.
2. Tambahkan aturan prompt: *"Kalau Data Referensi kosong atau tidak memuat angka yang dibutuhkan, katakan 'Data tidak tersedia' dan JANGAN memberi rekomendasi atau level harga."*
3. Ambil konteks di server dari `/api/stock/[ticker]` berdasarkan ticker, bukan menerima blob dari client.

---

### C-09 — `sharesOutstanding || 1` merusak seluruh valuasi DCF saat data hilang

- **FILE:** `modules/fundamental/service/dcf-valuation.service.ts`
- **LINE:** 53 (`calculateIntrinsicValue`), 289 (`calculateDcfModel`)

**MASALAH**
```ts
let shares = quoteSummary.defaultKeyStatistics?.sharesOutstanding || 1;
let fcf    = quoteSummary.financialData?.freeCashflow || null;
let fcf_per_share = fcf ? fcf / shares : null;
```

Jika Yahoo tidak mengembalikan `sharesOutstanding`, pembaginya menjadi **1**. FCF per lembar menjadi **FCF total perusahaan**.

**CONTOH:** ASII — `freeCashflow = 16.600.374.706.176`, `sharesOutstanding = 40.063.816.240`.
- Benar: FCF/share = Rp 414
- Kalau `sharesOutstanding` hilang: FCF/share = Rp 16.600.374.706.176
- `intrinsic_dcf = (fcf_per_share * 1.05) / (0.12 - 0.05)` = **Rp 249 kuadriliun per lembar**

Karena `intrinsic_dcf > 0`, nilai ini masuk ke `validFairValues` **dan** ke blend berbobot sektor. `fair_value` meledak, `mos` mendekati +100%, dan `valuation_agent` di orchestrator (bobot 20%, tertinggi dari 9 agen) memberi skor 100 → keputusan **STRONG BUY**.

Ini persis pola terlarang `X || 1` yang menghasilkan angka finansial fiktif dari data yang hilang.

**SOLUSI**
```ts
const shares = quoteSummary.defaultKeyStatistics?.sharesOutstanding;
const fcf_per_share = (fcf && shares && shares > 0) ? fcf / shares : null;
```
Kalau `null`, metode DCF dilewati (kode di bawahnya sudah menangani `fcf_per_share` null dengan benar).

---

## TEMUAN HIGH

### H-01 — RSI menyimpang dari standar hingga 11,85 poin; 4 implementasi berbeda di codebase

- **FILE:** `modules/technical/service/analyzers/rsi-analyzer.ts:4-12`, `modules/market/service/market-summary.service.ts:54-66`, `modules/recommendation/service/breakout.service.ts:96-104`, `lib/miniCouncil.ts:41-51`

**MASALAH:** Keempatnya memakai rata-rata aritmatik sederhana atas 14 selisih terakhir, bukan smoothing Wilder (RMA) yang menjadi definisi baku RSI (J. Welles Wilder, 1978) dan yang dipakai TradingView, Stockbit, RTI, dan seluruh platform arus utama.

**HASIL PERBANDINGAN (data Yahoo riil, 243 bar, 2026-08-03):**

| Ticker | RSI SahamLens | RSI Wilder (referensi) | Selisih | Verdict |
|---|---|---|---|---|
| BBCA | 56,52 | 51,89 | +4,63 | **FAIL** |
| TLKM | 60,87 | 56,50 | +4,37 | **FAIL** |
| ASII | 58,95 | 54,29 | +4,66 | **FAIL** |
| **BBRI** | **68,42** | **56,57** | **+11,85** | **FAIL** |
| BMRI | 50,00 | 48,42 | +1,58 | WARNING |

Toleransi wajar untuk RSI: ±1,0 poin. Empat dari lima sampel gagal.

**DAMPAK:**
1. **BBRI**: SahamLens 68,42 hampir menyentuh ambang overbought 70; standar bilang 56,57 (netral biasa). `scoreRsiMacd()` memberi 5 poin (`rsi > 70 && <= 78` hampir kena) vs 8 poin seharusnya; `rsi-analyzer` mengeluarkan vote BULLISH confidence 68 vs 57.
2. Bias sistematis ke atas → over-diagnosis overbought pada saham yang sedang naik dan under-diagnosis oversold pada saham turun.
3. Kategori "RSI Oversold" di halaman utama (`market-summary.service.ts`) meranking dari nilai yang bias — urutannya berbeda dari yang dilihat pengguna di TradingView.
4. Empat implementasi berbeda tipis (`diff > 0` vs `diff >= 0`, penanganan `losses === 0` berbeda) berarti **saham yang sama bisa menampilkan RSI berbeda** di halaman Detail Saham vs Ringkasan Pasar vs AI Pick.

**SOLUSI:** Satu fungsi `rsiWilder(closes, period)` di `modules/technical/`, dipakai keempat pemanggil. Implementasi referensi:
```ts
let avgGain = (jumlah gain 14 pertama) / 14;
let avgLoss = (jumlah loss 14 pertama) / 14;
for (i = 15..n) {
  avgGain = (avgGain * 13 + gain[i]) / 14;
  avgLoss = (avgLoss * 13 + loss[i]) / 14;
}
```

---

### H-02 — MA50 dibagi 50 walau datanya kurang dari 50 bar → Golden Cross palsu

- **FILE:** `modules/recommendation/service/breakout.service.ts`
- **LINE:** 68, 76-79

**MASALAH**
```ts
if (history.length < 25) return null;        // penjaga: minimal 25 bar
...
const ma50     = closes.slice(-50).reduce((a,b)=>a+b,0) / 50;      // ❌ pembagi tetap 50
const prevMa50 = closes.slice(-51,-1).reduce((a,b)=>a+b,0) / 50;   // ❌
```

Ketika `closes.length` antara 25 dan 49 (saham baru IPO, saham yang lama disuspend, atau `range=3mo` yang terpotong libur panjang), `slice(-50)` hanya mengembalikan sejumlah elemen yang ada, tapi pembaginya tetap 50.

**CONTOH:** 30 bar, rata-rata harga Rp 1.000.
- `ma50` dihitung = (30 × 1.000) / 50 = **Rp 600**
- `ma20` = Rp 1.000
- `ma20 > ma50` → **selalu true**, dan `prevMa20 <= prevMa50` bisa terpicu → **GOLDEN CROSS palsu (+3 poin)**

Bandingkan dengan `sma()` di `market-summary.service.ts:48-52` dan `recommendation.service.ts:22-25` yang benar (`if (closes.length < period) return null`).

**DAMPAK:** Saham dengan histori pendek mendapat sinyal GOLDEN CROSS palsu, masuk ke halaman AI Pick tab "Golden Cross", dan mendapat `BONUS_GOLDEN_CROSS = 10` poin di `rankAiPicks()`.

**SOLUSI:** `if (history.length < 51) return null;` atau pakai `sma()` yang mengembalikan `null` saat data kurang.

---

### H-03 — `foreignFlow` di recommendation engine hanyalah arah harga, tapi dilabeli "asing"

- **FILE:** `modules/recommendation/service/recommendation.service.ts`
- **LINE:** 126-130

**MASALAH**
```ts
let foreignFlow = 'NEUTRAL';
if      (changePct >  0.5 && volRatio > 1.2) foreignFlow = 'STRONG NET BUY';
else if (changePct >  0)                     foreignFlow = 'NET BUY';
else if (changePct < -0.5 && volRatio > 1.2) foreignFlow = 'STRONG NET SELL';
else if (changePct <  0)                     foreignFlow = 'NET SELL';
```

Ini murni **arah perubahan harga hari ini**. Tidak ada komponen aliran dana sama sekali. Persis logika biner yang ditinggalkan oleh `foreign-flow-proxy.ts` (lihat komentar di baris 8-13 file itu: *"sebelumnya netValueBillion cuma biner — hari close naik = FULL nilai transaksi dihitung 'beli'... Diganti Chaikin Money Flow"*). Rewrite itu tidak pernah sampai ke file ini.

Nilai tersebut lalu masuk ke `calculateScore(... { foreignFlow, ... })` → `scoreAsing()` menghasilkan teks:
> **"Asing STRONG NET BUY 5D berturut"** (15 poin dari 15)

**DAMPAK:**
1. Saham yang naik >0,5% dengan volume >1,2x otomatis dilabeli **"Asing STRONG NET BUY"** — klaim tentang perilaku investor asing yang tidak pernah diukur.
2. `scoreAsing` + `scoreBandar` = 30 dari 100 poin total, keduanya diberi makan variabel `foreignFlow` yang sama. Sepertiga skor rekomendasi ditentukan oleh arah harga yang di-relabel.
3. Nilai ini juga dikirim ke prompt Council AI, sehingga agen "Bandar" menulis narasi tentang akumulasi asing berdasarkan sinyal yang sebenarnya cuma "harga naik".
4. Inkonsisten dengan `app/api/stock/[ticker]/route.ts:235-252` yang untuk halaman lain memakai `analyzeAccumulationSignal()` (CMF 4-lapis) yang jauh lebih ketat. Saham yang sama bisa "STRONG NET BUY" di halaman Rekomendasi dan "NEUTRAL" di halaman Detail Saham.

**SOLUSI:** Pakai `analyzeAccumulationSignal(dailyHistory)` yang sudah ada dan sudah di-import di file yang sama, sama seperti `stock/[ticker]/route.ts`. Kalau tidak, ubah label jadi "Arah Harga + Volume", jangan "Asing".

---

### H-04 — Data tidak tersedia diberi skor gratis, bukan ditandai N/A

- **FILE:** `modules/technical/service/scoring.service.ts:248`, `modules/market/service/screener.service.ts:192-197, 223`

**MASALAH**

`scoring.service.ts:248` — `scoreAsing()`:
```ts
return { score: 5, reason: 'Asing N/A' };   // 5 dari 15 poin untuk data yang tidak ada
```

`screener.service.ts:192-197` — `scoreStock()`:
```ts
const perScore    = s.per        != null ? ... : 30;   // data hilang → 30/100
const roeScore    = s.roe        != null ? ... : 20;   // → 20/100
const derScore    = s.der        != null ? ... : 50;   // → 50/100
const divScore    = s.div_yield  != null ? ... : 10;   // → 10/100
const growthScore = s.rev_growth != null ? ... : 30;   // → 30/100
```

`screener.service.ts:223` — rata-rata PER sektor:
```ts
if (!list || list.length === 0) return 15;   // PER sektor tidak diketahui → dianggap 15
```

**DAMPAK:** Saham dengan data fundamental kosong tetap mendapat skor numerik dan tetap bisa masuk peringkat 10 besar screener, bersaing dengan saham yang datanya lengkap. Angka `30/20/50/10/30/15` tidak berasal dari data mana pun — ini persis pola `PER || 10`, `ROE || 15` yang dilarang, hanya dipindah ke dalam ternary.

Kasus terburuk: `derScore = 50` untuk data hilang lebih tinggi daripada `derScore` saham riil dengan DER 1,3x (`100 - 1.3*40 = 48`). Ketidaktahuan diberi nilai lebih baik daripada fakta.

**SOLUSI:** Kalau komponen tidak punya data, keluarkan dari perhitungan dan **renormalisasi bobot** yang tersisa (pola ini sudah benar di `dcf-valuation.service.ts:204-209`). Tampilkan `N/A` di kolomnya dan turunkan indikator kelengkapan data, bukan mengisi angka.

---

### H-05 — Rumus skor PER menghukum saham murah

- **FILE:** `modules/market/service/screener.service.ts`
- **LINE:** 192

**MASALAH**
```ts
const perScore = s.per != null && s.per > 0
  ? Math.max(0, 100 - Math.abs(s.per - sectorAvgPer) / sectorAvgPer * 100)
  : 30;
```

Rumus ini memberi skor tertinggi ke saham yang PER-nya **paling dekat dengan rata-rata sektor**, dan menghukum penyimpangan ke **dua arah** secara simetris.

**CONTOH — sektor dengan rata-rata PER 15:**

| Saham | PER | `perScore` | Interpretasi ekonomi |
|---|---|---|---|
| A | 15,0 | **100** | Valuasi persis pasaran |
| B | 7,5 | **50** | **Setengah harga pasaran — dihukum** |
| C | 22,5 | **50** | 50% lebih mahal — dihukum sama |
| D | 30,0 | **0** | Dua kali lipat pasaran |
| E | 3,0 | **20** | **Seperlima pasaran — hampir nol poin** |

Saham termurah di sektornya (PER 3, kandidat value paling jelas) mendapat 20 poin; saham yang persis rata-rata sektor mendapat 100. Bobot `per` adalah 0,15-0,25 tergantung profil risiko — pada profil Konservatif dan Moderat, ini mendistorsi peringkat secara langsung.

Label kolomnya di UI adalah "PER (Valuasi)" dengan pembanding "PER Sektor", yang mengomunikasikan ke pengguna bahwa PER lebih rendah = lebih baik. Rumusnya tidak melakukan itu.

**SOLUSI:** Gunakan skor monoton menurun terhadap PER relatif, misal `perScore = clamp(100 * (2 - per/sectorAvgPer), 0, 100)` sehingga PER = 0,5× sektor → 100, PER = sektor → 100... atau lebih sederhana: ranking persentil terbalik terhadap universe. Yang penting: lebih murah tidak boleh menghasilkan skor lebih rendah.

---

### H-06 — Cabang "MACD mixed signal" tidak pernah bisa tercapai (kode mati)

- **FILE:** `modules/technical/service/scoring.service.ts`
- **LINE:** 114-123
- **FUNCTION:** `scoreRsiMacd()`

**MASALAH**
```ts
if (t.macdHist > 0 && t.macdLine > t.macdSignal) {      // 7 poin
  ...
} else if (t.macdHist > 0 || t.macdLine > t.macdSignal) { // 3 poin — MATI
  parts.push(`MACD mixed signal`);
} else {                                                 // 0 poin
  parts.push(`MACD bearish`);
}
```

Berdasarkan definisi, `macdHist = macdLine - macdSignal`. Maka `macdHist > 0` dan `macdLine > macdSignal` adalah **kondisi yang identik secara matematis**. Cabang `else if` dengan `||` tidak pernah bisa true jika cabang pertama false.

Redundansi yang sama ada di `macd-analyzer.ts:21` dan `:24`.

**DAMPAK:** MACD hanya pernah menghasilkan 7 poin atau 0 poin — tidak ada gradasi. Sistem skor kehilangan resolusi yang jelas-jelas diniatkan penulisnya. Teks "MACD mixed signal" tidak pernah muncul ke pengguna.

**SOLUSI:** Definisikan cabang tengah dengan kondisi yang benar-benar berbeda, misal `macdHist > 0` (bullish) vs `macdHist < 0 && macdHist > prevMacdHist` (bearish tapi menyempit → mixed). Butuh histogram periode sebelumnya sebagai input tambahan.

---

### H-07 — Double counting: satu faktor dihitung berkali-kali dalam skor & konsensus

- **FILE:** `modules/technical/service/scoring.service.ts:251-267`, `app/api/stock/[ticker]/route.ts:196-276`, `modules/technical/service/consensus.service.ts`

**MASALAH A — `scoreBandar()` mengulang input yang sudah dinilai:**
```ts
function scoreBandar(flow: FlowInput) {
  if (flow.volRatio >= 2.0 && flow.foreignFlow.includes('BUY')) return { score: 15, ... };
  ...
}
```
`volRatio` sudah dinilai penuh di `scoreVolume()` (0-10 poin). `foreignFlow` sudah dinilai penuh di `scoreAsing()` (0-15 poin). `scoreBandar()` menilai **kombinasi keduanya lagi** untuk 15 poin tambahan, tanpa input baru apa pun. Volume tinggi dihitung dua kali (10 + 15 = 25 dari 100 poin); arah flow dihitung dua kali (15 + 15 = 30).

**MASALAH B — konsensus 12 vote, tapi hanya ~4 faktor independen:**

| Vote | Analyzer | Faktor sesungguhnya |
|---|---|---|
| 1 | `analyzeEma` (EMA20 vs EMA50) | Tren MA |
| 2 | `analyzeSma` (skor SMA 5/10/20) | Tren MA |
| 3 | `analyzeTrend` (MA 20/50/200) | Tren MA |
| 4 | `analyzeMomentum` (1D/5D) | Arah harga jangka pendek |
| 5 | `analyzeVolume` (arah × volume) | Arah harga + volume |
| 6 | `analyzeMarketFlow` (A/D dari arah close × volume) | Arah harga + volume |
| 7 | Bandarmology (CMF) | Posisi close dalam range × volume |
| 8 | Foreign Flow (CMF 4-lapis) | Posisi close dalam range × volume |
| 9 | `analyzeRsi` | Momentum RSI |
| 10 | `analyzeMacd` | Momentum MA |
| 11 | `analyzeSupport` | Posisi dalam range 20D |
| 12 | `analyzeVolatility` | Volatilitas |

Tiga vote untuk tren MA, tiga untuk arah harga × volume, dua untuk CMF. `calculateConsensus()` memperlakukan semuanya sebagai model independen dengan bobot sama, lalu menghitung `bullPct >= 80 → STRONG BUY`. Dalam tren naik yang kuat, 6-8 vote otomatis searah karena mengukur hal yang sama.

**DAMPAK:** Confidence konsensus melebih-lebihkan bukti. "STRONG BUY (83%)" terlihat seperti 10 dari 12 model independen setuju; sebenarnya sekitar 3 faktor independen setuju, masing-masing dihitung 3-4 kali.

**SOLUSI:** Kelompokkan analyzer per faktor, hitung satu vote per kelompok (median/mayoritas internal), lalu konsensus atas kelompok. Untuk `scoreBandar()`: hapus, atau ganti inputnya dengan sesuatu yang belum dinilai (mis. CMF20 yang belum masuk `FlowInput`).

---

### H-08 — Volatilitas diperlakukan sebagai sinyal arah

- **FILE:** `modules/technical/service/analyzers/volatility-analyzer.ts:20-26`, dipakai sebagai `risk_agent` di `modules/ai/service/orchestrator.service.ts:238-243`

**MASALAH**
```ts
if (volatilityPct > 3)   { decision = 'BEARISH'; }   // volatilitas tinggi → vote JUAL
else if (volatilityPct < 1.5) { decision = 'BULLISH'; } // volatilitas rendah → vote BELI
```

ATR mengukur besaran pergerakan, bukan arahnya. Saham yang melonjak +8% dan saham yang anjlok -8% memiliki ATR sama dan mendapat vote BEARISH sama.

**DAMPAK:**
1. Vote ini masuk ke `calculateConsensus()` dengan bobot sama seperti MACD dan RSI.
2. Di orchestrator, ia menjadi `risk_agent` dengan **bobot 10%** dari final score. Saham yang bergerak agresif ke atas dihukum di skor akhir.
3. Efek sistematis: saham blue chip likuid dan lamban (ATR rendah) selalu mendapat vote BULLISH gratis; saham small-cap yang volatil selalu BEARISH — terlepas dari fundamental atau tren.

**SOLUSI:** Volatilitas seharusnya menjadi **modulator confidence** atau kolom risiko terpisah, bukan vote arah. Kalau tetap ingin ada `risk_agent`, keluarkan dari `weightedEntries` untuk final score dan tampilkan sebagai konteks risiko.

---

### H-09 — Support & Resistance: separuh saham otomatis dapat vote BEARISH

- **FILE:** `modules/technical/service/analyzers/support-resistance.ts`
- **LINE:** 26-33

**MASALAH**
```ts
if (distToSupport < 2 && distToResistance > 5)       { decision = 'BULLISH'; ... }
else if (distToResistance < 2 && distToSupport > 5)  { decision = 'BEARISH'; ... }
else if (distToSupport < distToResistance)           { decision = 'BULLISH'; confidence = 60; }
else                                                 { decision = 'BEARISH'; confidence = 60; }
```

Cabang terakhir menangkap **setiap** saham yang harganya berada di paruh atas range 20 hari. Tidak ada kondisi NEUTRAL sama sekali dari cabang 3 & 4 — secara statistik sekitar 50% saham otomatis mendapat vote BEARISH hanya karena posisinya di range.

**Algoritma S/R itu sendiri (TAHAP 6):** `support = min(Low[-20:])`, `resistance = max(High[-20:])`. Ini bukan level acak — bisa direproduksi dan didokumentasikan. Tapi ini adalah bentuk paling primitif: **tanpa** deteksi swing pivot, **tanpa** konfirmasi volume, **tanpa** clustering level historis yang berulang, **tanpa** pivot point klasik. Nilai `support`/`resistance` yang dikirim ke prompt Council AI berasal dari sini, lalu agen "S/R Hunter" menulis narasi seperti *"Tunggu 274 jebol atau hold, RR 1:4.33 baru enak di 274"* seolah 274 adalah level teknikal yang bermakna — padahal itu sekadar harga terendah 20 hari terakhir.

**SOLUSI:** Tambahkan pita netral (mis. jika `|distToSupport - distToResistance| < 20%` dari range → NEUTRAL). Untuk kualitas level: deteksi swing high/low (fractal 2-2 atau 3-3), lalu cluster level yang tersentuh ≥2 kali dengan volume di atas rata-rata.

---

### H-10 — `local-council` menampilkan confidence dan alasan yang dikarang

- **FILE:** `modules/ai/service/local-council.service.ts`
- **LINE:** 20-31

**MASALAH**
```ts
{ name: "Volume Analyst",       signal: "WAIT", confidence: 50, reason: "Data volume tidak cukup" },
{ name: "Momentum",             signal: "HOLD", confidence: 60, reason: "Momentum netral" },
{ name: "S/R Hunter",           signal: "WAIT", confidence: 55, reason: "Menunggu di support" },
{ name: "Risk Manager",         signal: "HOLD", confidence: 70, reason: "Risk/Reward standar" },
{ name: "Breakout Hunter",      signal: "WAIT", confidence: 65, reason: "Belum ada konfirmasi breakout" },
{ name: "Volatility",           signal: "HOLD", confidence: 60, reason: "Volatilitas normal" },
{ name: "Chart Pattern Reader", signal: "WAIT", confidence: 50, reason: "Tidak ada pola yang jelas" },
```

Tujuh dari sepuluh "agen" mengeluarkan kesimpulan tetap tanpa menyentuh data. **"Momentum netral"**, **"Volatilitas normal"**, **"Risk/Reward standar"**, **"Menunggu di support"** adalah pernyataan tentang kondisi pasar saham tertentu — tapi tidak satu pun dihitung. Angka confidence 50/55/60/65/70 juga literal.

Ironisnya, data yang dibutuhkan **tersedia** di parameter `data` yang sama (`data.atr`, `data.volRatio`, `data.support`, `data.resistance` — semua dikirim ke `getCouncil()` dan dipakai di prompt AI-nya).

Baris 5 juga: `const rsi = data?.rsi || 50;` — RSI yang hilang menjadi 50 (netral) dan dipakai untuk menentukan `rsiSignal`.

**DAMPAK:** Ketika AI provider gagal/kena limit (kondisi yang sering, lihat M-05), pengguna melihat 10 kartu agen dengan confidence dan alasan spesifik, tidak bisa dibedakan dari analisis sungguhan. Hanya `summary_id` di paling bawah yang menyebut "Fallback lokal berjalan".

**SOLUSI:** Hitung ketujuh agen dari `data` yang sudah tersedia (semuanya bisa: volume dari `volRatio`, S/R dari `support`/`resistance`, volatilitas dari `atr`, risk/reward dari `(resistance-price)/(price-support)`). Untuk yang benar-benar tidak punya data (Chart Pattern), tampilkan `signal: 'N/A', confidence: null, reason: 'Deteksi pola belum tersedia'`.

---

### H-11 — Prompt Council AI menerima `0` sebagai "DATA REAL"

- **FILE:** `modules/ai/service/council.service.ts`
- **LINE:** 63-73

**MASALAH**
```ts
const promptData = {
  price: data?.currentPrice || data?.price || 0,
  ma50: data?.ma50 || 0,
  ma200: data?.ma200 || 0,
  ema: data?.ema || 0,
  rsi: data?.rsi || 0,
  support: data?.support || 0,
  resistance: data?.resistance || 0,
  score: data?.score || 0,
  // atr, volRatio, foreignFlow, eps, lastQuarter → SUDAH benar pakai 'N/A'
};
```

Enam field harga/indikator jatuh ke `0`, lalu disisipkan ke prompt di bawah judul:
> `DATA REAL (JANGAN sebut angka lain di luar daftar ini - kalau suatu dimensi tidak ada datanya, bilang "data belum cukup" alih-alih mengarang)`

AI menerima `MA50 0, MA200 0, Support 0, Res 0, RSI 0` sebagai **fakta terverifikasi**. Aturan "bilang data belum cukup" tidak akan terpicu karena dari sudut pandang AI, datanya *ada* — nilainya nol.

Konsekuensi yang bisa diprediksi: agen Trend Follower akan menyimpulkan "harga jauh di atas MA200 (0) → uptrend ekstrem, STRONG BUY". Agen Mean Reversion akan bilang "RSI 0 = oversold ekstrem, BUY".

Menariknya, empat field di file yang **sama** sudah benar memakai `'N/A'` (`atr`, `volRatio`, `foreignFlow`, `eps`) — jadi polanya sudah dipahami penulisnya, hanya belum diterapkan konsisten.

**SOLUSI:** Ubah keenam field ke pola `?? 'N/A'` seperti `atr`. Prompt sudah punya aturan yang tepat untuk menanganinya.

---

## TEMUAN MEDIUM

### M-01 — Harga dividen tidak diperhitungkan: `close` mentah dipakai, `adjclose` tidak pernah dibaca

- **FILE:** `modules/technical/service/yahoo-history.service.ts:46-54`, `app/api/stock/[ticker]/route.ts:175-186`, `modules/recommendation/service/recommendation.service.ts:63-74`, `modules/market/service/market-summary.service.ts:92-100`, `modules/backtest/service/precompute.service.ts`

**MASALAH:** Seluruh aplikasi membaca `indicators.quote[0].close` dan **tidak pernah** `indicators.adjclose[0].adjclose`.

**HASIL VERIFIKASI (data riil, rentang 1 tahun, 2026-08-03):**

| Ticker | Selisih `close` vs `adjclose` di awal rentang | Jumlah event dividen 1y | Jumlah event split 1y |
|---|---|---|---|
| BBCA | 4,82% | 3 | 0 |
| TLKM | 7,54% | 1 | 0 |
| ASII | 6,42% | 2 | 0 |
| BBRI | 9,48% | 2 | 0 |
| BMRI | 9,96% | 2 | 0 |

**Verifikasi split (TAHAP 4) — hasil BAIK:** `indicators.quote.close` dari Yahoo **sudah disesuaikan untuk stock split**. Diuji pada dua split 5:1 yang diketahui:
```
UNVR.JK  split 5:1 @ 2020-01-02:  2019-12-30=8400  2020-01-02=8550   (mulus, tanpa lompatan 5x)
BBRI.JK  split 5:1 @ 2017-11-10:  2017-11-09=2990  2017-11-10=2981   (mulus)
```
Jadi **stock split, reverse split, dan bonus share TIDAK menghasilkan sinyal palsu.** Ini temuan positif.

**Yang belum ditangani: dividen.** Selisih 5-10% per tahun berarti:
1. MA200 pada saham berdividen tinggi (BBRI 9,5%/th, BMRI 10%/th) duduk sistematis lebih tinggi dari yang seharusnya secara total return.
2. Backtest 5 tahun (`precompute.service.ts` pakai `range: '5y'`) mengabaikan seluruh dividen — return strategi understated ~5-10% per tahun, dan pembanding IHSG-nya (`^JKSE`, indeks harga, juga tanpa dividen) konsisten sehingga `alphaPct` masih valid sebagai perbandingan relatif.
3. Pada tanggal ex-dividend, `close` turun sebesar dividen — pada BBRI dengan yield ~9%, satu pembayaran semesteran ≈ -4,5% dalam sehari. Ini bisa memicu `analyzeMomentum` BEARISH, `analyzeVolume` BEARISH, dan negative MFM di `foreign-flow-proxy` — **sinyal jual palsu dari peristiwa korporasi, bukan dari pasar.**

Rights issue tidak ditangani sama sekali (Yahoo `adjclose` juga tidak menanganinya secara konsisten untuk IDX).

**SOLUSI:** Untuk indikator berbasis return dan backtest, gunakan `adjclose`. Untuk level harga yang ditampilkan ke pengguna (harga saat ini, support/resistance yang akan dipakai untuk order riil), tetap gunakan `close` mentah. Pemisahan ini harus eksplisit, bukan implisit.

---

### M-02 — Volume intraday parsial dibandingkan dengan rata-rata volume harian penuh

- **FILE:** `modules/technical/service/analyzers/volume-analyzer.ts:5-11`, `modules/market/service/screener.service.ts:133-146`, `modules/recommendation/service/breakout.service.ts:88-90`, `modules/technical/service/scoring.service.ts:133`

**MASALAH:** `volToday` / `currentVol` diambil dari bar hari ini, yang selama jam bursa masih **parsial**. Pembandingnya adalah rata-rata 20 hari penuh.

**DAMPAK:** Pukul 10:00 WIB, sekitar 25% sesi berlalu; sebuah saham yang menuju volume 2× normal baru mencatat 0,5× → `scoreVolume()` memberi 1 poin ("Volume 0.5x avg — RENDAH") bukan 10 poin. Semua ambang volume (`>= 1.5` valid, `>= 2.0` sangat tinggi, `isVolSpike`, `volConfirmed` di `analyzeAccumulationSignal`) bias ke bawah secara sistematis sepanjang hari, lalu tiba-tiba benar setelah bursa tutup.

Efek terlihat langsung: kategori "Breakout" dan "Akumulasi Asing" di AI Pick memberi hasil berbeda pukul 10:00 vs pukul 16:00 untuk pasar yang sama.

Kasus khusus di `screener.service.ts:134`: `averageVolume10days || averageVolume` — mencampur baseline 10 hari dan 3 bulan tergantung ketersediaan field, sehingga `vol_ratio` antar saham tidak selalu dibandingkan terhadap basis yang sama.

**SOLUSI:** Salah satu: (a) ekstrapolasi volume hari berjalan berdasarkan fraksi sesi yang telah berlalu (zona `Asia/Jakarta`, sesi 09:00-16:00 dengan jeda), atau (b) bandingkan volume hari **kemarin** yang sudah lengkap terhadap rata-rata 20 hari, dan beri label jelas.

---

### M-03 — `analyzeRsi`/`analyzeMacd` diparse dari string tampilan, dengan fallback angka

- **FILE:** `app/api/stock/[ticker]/route.ts:307-320`, `modules/recommendation/service/recommendation.service.ts:177-189`

**MASALAH**
```ts
const rsiResult = analyzersResult.find((r: any) => r.label?.includes('RSI'));
const rsiVal    = rsiResult ? parseFloat(rsiResult.value?.replace('RSI: ', '') || '50') : 50;

const macdMatch = macdResult.value.match(/MACD: ([\-\d.]+), Sig: ([\-\d.]+), Hist: ([\-\d.]+)/);
if (macdMatch) { macdLineVal = parseFloat(macdMatch[1]); ... }   // kalau tidak match → tetap 0,0,0
```

Nilai numerik diambil kembali dengan mem-parse string yang diformat untuk ditampilkan ke manusia. Jika analyzer mengembalikan `value: 'N/A'` (histori < 15 bar), `parseFloat('N/A')` → `NaN`, lalu `|| '50'` tidak menyelamatkan karena `NaN` sudah terlanjur jadi hasil `parseFloat` — hasilnya `NaN` masuk ke `scoreRsiMacd()` di mana semua perbandingan `NaN >= 50` false → jatuh ke cabang terakhir tanpa poin, dan `t.rsi.toFixed(1)` menghasilkan `"NaN"` di teks alasan.

Untuk MACD, kegagalan regex diam-diam menghasilkan `0, 0, 0` → `scoreRsiMacd` melaporkan **"MACD bearish"** untuk saham yang MACD-nya tidak diketahui.

Perubahan format string di analyzer (mis. menambahkan pemisah ribuan) akan diam-diam mematikan scoring tanpa error.

**SOLUSI:** Analyzer harus mengembalikan nilai numerik terstruktur di samping string tampilannya:
```ts
return { label: 'RSI 14', value: `RSI: ${rsi.toFixed(2)}`, raw: { rsi }, decision, confidence };
```

---

### M-04 — Ambang batas ajaib tanpa dasar yang terdokumentasi

- **FILE:** berbagai

Nilai-nilai berikut menentukan rekomendasi tapi tidak ada penjelasan asal-usulnya, tidak ada backtest pendukungnya, dan tidak bisa dikonfigurasi:

| Nilai | Lokasi | Fungsi |
|---|---|---|
| `rsi > 78` = overbought (bukan 70) | `scoring.service.ts:105`, `rsi-analyzer.ts:23` | Ambang zona jual |
| `rsi >= 52 && rsi <= 60` | `breakout.service.ts:105` | Pita "RSI MOMENTUM" untuk bonus breakout |
| `total > 75` STRONG BUY, `>= 60` BUY, `>= 45` HOLD | `scoring.service.ts:272-275` | Batas kategori rekomendasi |
| `score >= 65 / 55 / 45 / 35` | `orchestrator.service.ts:141-145` | Batas keputusan multi-agent (berbeda dari di atas) |
| `bullPct >= 80 / 60` | `consensus.service.ts:83-92` | Batas konsensus (berbeda lagi) |
| `bullPct >= 70 / 50 / 30` | `recommendation.service.ts:105-108` | Batas konsensus keempat, berbeda lagi |
| `pbvWajar = (roe/12) * 1.4`, cap 3,2 | `dcf-valuation.service.ts:114-122` | PBV wajar bank |
| `pbvWajar = (roe/12) * 0.85` | `dcf-valuation.service.ts:125` | PBV wajar non-bank |
| `defaultPER = 14.5 / 15` | `dcf-valuation.service.ts:161` | PER wajar |
| DDM: growth 5%, discount 12% (10,5% untuk bank ROE>20) | `dcf-valuation.service.ts:143-148` | Sama untuk semua saham |
| `SBN_10Y_YIELD_PCT = 6.7`, `EQUITY_RISK_PREMIUM_PCT = 5.2` | `dcf-valuation.service.ts:258-259` | WACC untuk semua saham |
| `BONUS_BREAKOUT 15 / ACCUMULATION 10 / GOLDEN_CROSS 10 / OVERSOLD 5` | `ai-pick.service.ts:14-17` | Bonus peringkat AI Pick |
| Bobot profil risiko (`der: 0.35, div: 0.30, ...`) | `screener.service.ts:199-203` | Peringkat screener |

**Empat definisi ambang konsensus yang berbeda** (`consensus.service`, `recommendation.service`, `orchestrator.service`, `scoring.service`) berarti saham yang sama bisa "BUY" di satu halaman dan "HOLD" di halaman lain — bukan karena data berbeda, tapi karena batas angkanya berbeda.

`SBN_10Y_YIELD_PCT = 6.7` khususnya: yield SBN 10 tahun bergerak setiap hari, dan aplikasi ini **sudah punya** `modules/macro/` dengan tabel `macro_indicators` serta cron refresh. WACC dihitung dari konstanta beku sementara infrastruktur untuk mengambilnya secara live sudah tersedia.

**SOLUSI:** Pindahkan seluruh ambang ke satu file konstanta terdokumentasi dengan justifikasi + tanggal kalibrasi per nilai. Satukan keempat definisi konsensus. Ambil SBN 10Y dari `modules/macro/`.

---

### M-05 — Rotasi model Gemini memuat ID model yang perlu diverifikasi

- **FILE:** `lib/gemini.ts:20-28`

**MASALAH**
```ts
const MODEL_CANDIDATES = [
  'gemini-2.5-flash',      // valid
  'gemini-2.0-flash',      // valid
  'gemini-3.5-flash',      // ?
  'gemini-3.6-flash',      // ?
  'gemini-3.1-flash-lite', // ?
];
export function pickGeminiModelName(): string {
  return MODEL_CANDIDATES[Math.floor(Math.random() * MODEL_CANDIDATES.length)];
}
```

Tiga dari lima ID tidak sesuai dengan penamaan model Gemini yang diketahui. Komentar mengklaim daftar ini "dikonfirmasi nyata & aktif untuk API key ini via GET /v1beta/models" — klaim ini tidak dapat saya verifikasi tanpa API key, jadi tidak saya golongkan sebagai temuan pasti.

**Relevansi terhadap integritas data:** jika tiga ID tersebut tidak valid, sekitar 60% panggilan AI gagal dengan 404 dan aplikasi jatuh ke jalur fallback. Jalur fallback itulah yang memuat temuan **C-08** (chat mengarang MoS + rekomendasi TAHAN) dan **H-10** (local-council mengarang confidence 10 agen). Artinya frekuensi kemunculan konten karangan terikat langsung ke validitas daftar ini.

**SOLUSI:** Jalankan `GET https://generativelanguage.googleapis.com/v1beta/models?key=$GEMINI_API_KEY` dan pangkas daftar ke ID yang benar-benar dikembalikan. Tambahkan logging saat sebuah kandidat mengembalikan 404 supaya kegagalan terlihat.

---

### M-06 — Cache stale-fallback disajikan tanpa penanda umur data

- **FILE:** `app/api/stock/[ticker]/route.ts:143-150`, `shared/cache/ttl-policy.ts:40`

**MASALAH**
```ts
const stale = await cacheGet<any>(staleFallbackKey);
if (stale) {
  console.warn(`yfinance fetch failed, returning stale fallback cache for ${ticker}`);
  return NextResponse.json(await withQuotaInfo(stale, ticker, ...));
}
```
`STALE_FALLBACK: 24 * 60 * 60` — data berumur sampai 24 jam dikembalikan dengan bentuk payload yang **identik** dengan data segar. Tidak ada field `stale: true`, tidak ada `dataAge`, tidak ada `computedAt`.

Strategi "lebih baik data basi daripada error keras" itu sendiri masuk akal untuk aplikasi ini. Yang bermasalah adalah penyajiannya sebagai data terkini.

**DAMPAK:** Pengguna melihat harga dan skor kemarin sebagai harga hari ini. Untuk keputusan intraday, ini setara dengan data palsu — walaupun asalnya asli.

**SOLUSI:** Sertakan `_meta: { source: 'stale-cache', computedAt, ageSeconds }` di payload, dan tampilkan banner di UI: *"Data per {waktu} — sumber data sedang tidak dapat dijangkau."*

---

### M-07 — Klasifikasi kesegaran data hardcoded, tidak pernah diukur (TAHAP 15)

- **FILE:** `app/api/live/[ticker]/route.ts:39-40`

**MASALAH**
```ts
lastUpdate: new Date().toISOString(),   // waktu SERVER, bukan waktu data
source: 'Yahoo Finance',
delay: '15m'                            // literal, tidak pernah dihitung
```

`lastUpdate` mencatat kapan **server merespons**, bukan kapan **harga tercatat**. Yahoo mengembalikan `meta.regularMarketTime` (timestamp bar sesungguhnya) — field ini tidak pernah dibaca.

**BUKTI:** pada saat pengujian, `meta.regularMarketTime = 2026-08-03T08:49:59Z` (15:49 WIB) sementara `lastUpdate` yang dikembalikan API = `2026-08-03T09:02:00Z`. Selisih 12 menit sudah muncul di satu pengujian; pada akhir pekan atau hari libur bursa, selisihnya bisa berhari-hari sementara `lastUpdate` tetap menunjukkan "sekarang".

`delay: '15m'` adalah klaim tetap yang tidak pernah diverifikasi terhadap timestamp sesungguhnya.

**Klasifikasi yang seharusnya ada dan tidak ada di mana pun:** REALTIME / DELAYED / EOD / HISTORICAL. Tidak ada endpoint yang membedakannya. Data EOD di hari libur disajikan dengan format identik dengan data intraday di tengah sesi.

**SOLUSI:**
```ts
const marketTime = meta.regularMarketTime * 1000;
const ageMs = Date.now() - marketTime;
return {
  price, changePercent, volume,
  dataTimestamp: new Date(marketTime).toISOString(),
  ageSeconds: Math.round(ageMs / 1000),
  freshness: ageMs < 20*60*1000 ? 'DELAYED' : isMarketOpen() ? 'STALE' : 'EOD',
  source: 'Yahoo Finance',
};
```

---

### M-08 — `average_portfolio_yield` dihitung dari 18 saham dividen tertinggi, disajikan sebagai yield portofolio pengguna

- **FILE:** `modules/fundamental/service/dividend-plan.service.ts:107-110, 121`

**MASALAH**
```ts
results.sort((a, b) => b.yield_pct - a.yield_pct);
return results.slice(0, 18);        // 18 yield TERTINGGI dari ~50 saham
...
const avgYield = universe.reduce((sum, s) => sum + s.yield_pct, 0) / universe.length;
const estAnnualIncomeNow = capital * (avgYield / 100);
const requiredCapitalForTarget = avgYield > 0 ? (targetMonthly * 12) / (avgYield / 100) : 0;
```

`avgYield` adalah rata-rata dari **kuartil teratas** universe, bukan yield portofolio yang realistis. Angka ini kemudian dipakai untuk menghitung penghasilan bulanan pengguna, modal yang dibutuhkan untuk mencapai target, dan proyeksi compounding 10 tahun.

**DAMPAK:** Modal yang dibutuhkan untuk mencapai target penghasilan pasif **terlalu rendah**, dan proyeksi penghasilan **terlalu tinggi** — pada perencanaan 10 tahun dengan compounding, distorsinya berlipat.

Proyeksi compounding juga mengasumsikan yield konstan 10 tahun **dan** harga saham tetap. Ini diakui di komentar kode (baris 130-133) dan dilabeli "Simulasi" di UI — asumsinya transparan, jadi bagian ini dapat diterima. Yang bermasalah hanya pemilihan sampel `avgYield`-nya.

**SOLUSI:** Tampilkan yield rata-rata **terbobot** dari saham yang benar-benar dipilih pengguna, atau kalau tetap ingin memakai universe, beri label eksplisit: *"Asumsi: yield rata-rata 18 saham dividen tertinggi di universe (bukan portofolio Anda)"* dan sertakan skenario konservatif (median universe penuh).

---

### M-09 — Halaman /risk menampilkan angka stress test tetap

- **FILE:** `app/risk/page.tsx:100-125`

**MASALAH:** Empat kartu hasil stress test (`-5.75%`, `-12.5%`, `-4.2%`, `-6.8%`) adalah literal JSX. Alokasi portofolio di sebelahnya (`BBCA 30%, BBRI 25%, TLKM 20%, ASII 15%, GOTO 10%`) juga hardcoded sebagai state awal, dan mengubahnya tidak mengubah satu pun angka stress test.

**Faktor peringan:** halaman ini **jujur menyatakan keterbatasannya** — subtitle: *"Estimasi ilustratif skenario makro Indonesia (belum dihitung dari komposisi portofolio Anda)"*, dan kartu pertama diberi catatan *"Estimasi generik, bukan portofolio Anda"*. Ini pembeda utama dari C-03, di mana tidak ada pengungkapan apa pun.

**Sisa masalah:** hanya kartu pertama yang punya disclaimer; tiga kartu lainnya (`-12.5%`, `-4.2%`, `-6.8%`) diberi label deskriptif ("Skenario Panik Pasar", "Ketatnya Likuiditas Perbankan", "Capital Outflow Asing") yang justru terbaca seperti hasil perhitungan. Halaman ini juga tidak ada di sidebar.

**SOLUSI:** Hitung sungguhan — beta setiap saham terhadap IHSG dapat diregresikan dari histori yang sudah tersedia, lalu shock portofolio = Σ(bobot × beta × shock). Kalau tidak, samakan disclaimer di keempat kartu dan hapus label penyebab yang menyiratkan kausalitas.

---

### M-10 — Penjelasan intrinsic value salah menyebut metodologinya sendiri

- **FILE:** `app/api/intrinsic-explain/route.ts:28`

**MASALAH**
```ts
return `Estimasi harga wajar Rp ${...} untuk ${input.symbol} adalah median dari ${methodNames}, ...`;
```

`calculateIntrinsicValue()` menghitung `fair_value` sebagai **rata-rata berbobot** menurut router sektor (`dcf-valuation.service.ts:211-218`), dengan renormalisasi bobot. Median hanya dipakai di cabang fallback yang jarang (`totalWeightUsed === 0`, baris 220-227).

**DAMPAK:** Pengguna diberi tahu metodologi yang salah, sehingga tidak bisa memvalidasi angka tersebut. Untuk saham bank, misalnya, bobot sesungguhnya adalah PBV 45% / DDM 30% / PER 25% — sangat berbeda dari "median".

**SOLUSI:** Bangun teks dari `applied_rule` yang sudah dikembalikan fungsinya:
```
"...adalah rata-rata berbobot dari PBV Fair (45%), DDM (30%), dan PER Fair (25%) sesuai sektor Banks..."
```

---

## TEMUAN LOW

| ID | File:Line | Masalah | Dampak |
|---|---|---|---|
| L-01 | `data/calendar.json` | Kalender corporate action dummy (BBCA "Cum Date Dividen 5.65%", GOTO "Perkiraan EPS: -Rp 2") masih ada di repo | Sudah yatim — `corporate-calendar.service.ts` menggantikannya. Hapus supaya tidak dipakai ulang tanpa sadar |
| L-02 | `dcf-valuation.service.ts:45-49` | `let nim = 0.055; // default bank` — variabel diberi nilai default lalu tidak pernah dipakai | Kode mati. Hapus sebelum ada yang memakainya |
| L-03 | `market-pulse.service.ts:7` | `IDX_INDICES` mendeklarasikan Kompas100 dengan simbol `'^JKSE'` (simbol IHSG) | Menyesatkan pembaca kode; nilainya ditimpa cabang `if` |
| L-04 | `market-flow.ts:39` | Label indikator berubah di tengah fungsi: `'Market Flow (Accum/Dist)'` (baris 2) vs `'Accumulation / Distribution'` (baris 39) vs `'Market Flow Index'` (key di `precompute.service.ts:47`) | Tiga nama untuk satu indikator; menyulitkan pencocokan antar modul |

---

## TAHAP 2 — DATA LINEAGE

| Data | Sumber | Jalur | Status |
|---|---|---|---|
| Price (current) | Yahoo `chart.meta.regularMarketPrice` | Yahoo → route → Redis (TTL 3m) → UI | ✅ Terlacak |
| Open / High / Low / Close | Yahoo `chart.indicators.quote[0]` | sama | ✅ Terlacak (split-adjusted, **bukan** dividend-adjusted — M-01) |
| Previous Close | Diturunkan dari `closes[n-2]`, atau `meta.chartPreviousClose` untuk range=1d | sama | ✅ Benar (bug range sudah diperbaiki, lihat komentar `market-summary.service.ts:103-105`) |
| Volume | Yahoo `quote[0].volume` / `meta.regularMarketVolume` | sama | ⚠️ Parsial saat jam bursa (M-02) |
| Market Cap | Yahoo `summaryDetail.marketCap` | quoteSummary → filter Rp500M | ✅ Terlacak |
| PER | Yahoo `summaryDetail.trailingPE` | quoteSummary → scoring | ⚠️ Dirusak untuk emiten USD di `/api/fundamental` (C-06) |
| PBV | Yahoo `defaultKeyStatistics.priceToBook` | quoteSummary → scoring | ❌ Tanpa koreksi mata uang (C-07) |
| ROE | Yahoo `financialData.returnOnEquity` (fraksi) | quoteSummary → scoring | ❌ Bug satuan di `/api/stock` (C-05) |
| ROA | Yahoo `financialData.returnOnAssets` | quoteSummary → `roa-analyzer` | ✅ Terlacak |
| DER | Yahoo `financialData.debtToEquity` (persen) | quoteSummary → scoring | ❌ Bug satuan di `/api/stock` (C-05) |
| EPS | Yahoo `defaultKeyStatistics.trailingEps` (IDR) | quoteSummary → intrinsic | ❌ Dikali kurs di `/api/fundamental` (C-06) |
| Revenue | Yahoo `financialData.totalRevenue` | quoteSummary → analyzer | ✅ Terlacak |
| Net Income | **Tidak pernah diambil langsung** — hanya lewat `profitMargins` & `trailingEps` | — | ⚠️ Tidak ada laporan laba rugi mentah |
| Cash Flow | Yahoo `financialData.freeCashflow` / `operatingCashflow` | quoteSummary → DCF | ✅ Terlacak |
| Debt | Yahoo `financialData.totalDebt` | quoteSummary → analyzer | ✅ Terlacak |
| Dividend | Yahoo `summaryDetail.dividendYield` / `dividendRate` + `chart(events:dividends)` | quoteSummary + chart → dividend-plan | ✅ Terlacak (satuan benar: `* 100`) |
| **Foreign Flow** | **TIDAK ADA SUMBER — proxy CMF dari harga+volume** | Yahoo OHLCV → `foreign-flow-proxy.ts` → UI | ⚠️ **Diberi label proxy di sebagian besar tempat, TAPI di `recommendation.service.ts` dilabeli "Asing NET BUY" tanpa kualifikasi (H-03)** |
| Corporate Action | Yahoo `calendarEvents` (dividen + earnings saja) | quoteSummary → calendar | ✅ Terlacak; RUPS & split diakui tidak tersedia |
| News | RSS via `rss-parser` | RSS → `modules/news` | ✅ Terlacak |
| Macro | Yahoo `USDIDR=X` **saja** | Yahoo → Postgres `macro_indicators` | ⚠️ Hanya kurs. BI Rate & inflasi tidak ada — **tapi `/macro` page tetap menampilkan outlook BI Rate karangan (C-03)** |
| IHSG | Yahoo `^JKSE` | Yahoo → market-pulse | ✅ Terlacak |
| **LQ45** | **HARDCODE `608`** | Literal di source | ❌ **CRITICAL (C-01)** |
| IDX30 | Yahoo `IDX30.JK` (fallback hardcode `462.5` tidak aktif) | Yahoo → market-pulse | ⚠️ Bom waktu |
| Kompas100 | Yahoo `Kompas100.JK` (fallback `IHSG/5.42` lalu `1132.4`, tidak aktif) | Yahoo → market-pulse | ⚠️ Bom waktu |
| Konsensus analis (revenue/laba) | **TIDAK ADA SUMBER** | Literal di `app/earnings/page.tsx` | ❌ **CRITICAL (C-03)** |
| Statistik musiman | **TIDAK ADA SUMBER** | Literal di `app/pattern/page.tsx` | ❌ **CRITICAL (C-03)** |
| Target IHSG / outlook BI Rate | **TIDAK ADA SUMBER** | Literal di `app/macro/page.tsx` | ❌ **CRITICAL (C-03)** |
| Moat / pangsa pasar / rating manajemen | **TIDAK ADA SUMBER** | Literal di `app/moat/page.tsx` | ❌ **CRITICAL (C-03)** |
| Statistik akurasi indikator | **TIDAK ADA SUMBER** | Literal di `app/api/explain/route.ts` | ❌ **CRITICAL (C-04)** |
| "Data broker / Top Buyer" | **TIDAK ADA SUMBER — data ini tidak ada di aplikasi** | Literal di `app/api/explain/route.ts` | ❌ **CRITICAL (C-04)** |

---

## TAHAP 3 — VALIDASI HARGA

**Uji integritas OHLC** — 5 ticker × 243 bar harian = **1.215 bar**:

| Ticker | Bar | Pelanggaran `High >= max(O,C,L)` | Pelanggaran `Low <= min(O,C)` | Volume negatif |
|---|---|---|---|---|
| BBCA | 243 | 0 | 0 | 0 |
| TLKM | 243 | 0 | 0 | 0 |
| ASII | 243 | 0 | 0 | 0 |
| BBRI | 243 | 0 | 0 | 0 |
| BMRI | 243 | 0 | 0 | 0 |

**PASS** — tidak ada satu pun pelanggaran relasi OHLC atau volume negatif. Data mentah Yahoo bersih.

**Uji rumus perubahan harga:**
```
changePct = ((currentPrice - prevClose) / prevClose) * 100
```
Implementasi konsisten dan benar di `market-summary.service.ts:108`, `market-pulse.service.ts:56, 91`, `live/[ticker]/route.ts:34`, `recommendation.service.ts:113`. **PASS.**

Satu jebakan yang **sudah ditangani dengan benar**: `meta.chartPreviousClose` untuk `range` selain `1d` mengembalikan close dari **awal rentang**, bukan kemarin. Terverifikasi: pada `range=1y`, BBCA melaporkan `chartPreviousClose = 8300` sementara close kemarin sesungguhnya Rp 6.325. `market-summary.service.ts` sudah menghindari jebakan ini dan mendokumentasikannya (baris 103-105). ✅

**Timezone (TAHAP 3):** Yahoo mengembalikan `exchangeTimezoneName: "Asia/Jakarta"` dan timestamp Unix UTC. Kode mengkonversi dengan `new Date(ts * 1000).toISOString().split('T')[0]`, yang menghasilkan **tanggal UTC**, bukan tanggal WIB.

Untuk bar harian IDX, timestamp bar adalah 09:00 WIB = 02:00 UTC → tanggalnya sama, jadi tidak ada bug dalam praktik saat ini. Namun paket `date-fns-tz` sudah menjadi dependensi dan tidak dipakai di jalur ini. Ini kerapuhan laten, bukan bug aktif. Klasifikasi: **LOW, tidak dilaporkan sebagai temuan terpisah.**

**Pencampuran jenis harga:** ⚠️ `currentPrice = meta.regularMarketPrice` (intraday) dibandingkan terhadap `history[].Close` di mana bar terakhir juga hari ini (parsial). `analyzeMomentum` menghitung `pct1D` sebagai `(currentPrice - history[n-2].Close)` — ini benar (membandingkan intraday vs close kemarin). Tetapi `analyzeVolume` membandingkan volume parsial hari ini terhadap rata-rata harian penuh — inkonsisten (M-02).

---

## TAHAP 5 — AUDIT INDIKATOR TEKNIKAL

Metode: implementasi ulang independen tiap rumus dari definisi bakunya, dijalankan pada data Yahoo yang sama (243 bar, 2026-08-03), lalu dibandingkan.

| Indikator | Input | Periode | Rumus di SahamLens | File:Function | Verdict |
|---|---|---|---|---|---|
| SMA | Close | 5/10/20/50/200 | `Σclose / n` | `moving-average.ts:analyze` | **PASS** |
| EMA | Close | 20/50 | `k=2/(p+1)`, seed = `prices[0]` | `ema-analyzer.ts:calculateEMA` | **PASS** (dengan 243 bar, bias seed sudah luruh sepenuhnya) |
| RSI | Close | 14 | Rata-rata aritmatik sederhana | `rsi-analyzer.ts:analyze` | **FAIL** (H-01, deviasi s/d +11,85) |
| MACD line | Close | 12,26 | `EMA12 - EMA26` | `macd-analyzer.ts:analyze` | **PASS** — cocok persis ke 2 desimal di kelima ticker |
| MACD signal | MACD line | 9 | `EMA9(macdLine)` | sama | **PASS** — cocok persis |
| MACD histogram | — | — | `macdLine - signal` | sama | **PASS** — cocok persis |
| Bollinger Band | Close | — | `stddev()` ada di `miniCouncil.ts:34` | `lib/miniCouncil.ts` | **PASS** (populasi stddev, bukan sampel — beda tipis tapi konvensi Bollinger memang populasi) |
| ATR | HLC | 14 | `Σ max(H-L, \|H-Cprev\|, \|L-Cprev\|) / 14` | `volatility-analyzer.ts`, `screener.service.ts:atr14Pct` | **PASS** — definisi True Range benar; SMA (bukan Wilder RMA) tapi ini varian yang lazim |
| Stochastic | — | — | **Tidak diimplementasikan** | — | N/A |
| ADX | — | — | **Tidak diimplementasikan** | — | N/A |
| Support / Resistance | High/Low | 20 | `min(Low)` / `max(High)` | `support-resistance.ts` | **PASS numerik** — tapi metode primitif & bias vote (H-09) |
| Volume Average | Volume | 20 | `Σvol[-21..-2] / 20` (tidak termasuk hari ini) ✅ | `volume-analyzer.ts:5-9` | **PASS** — pengecualian hari ini sudah benar di sini |
| Momentum | Close | 1D/5D | `(price - close[n-k]) / close[n-k]` | `momentum-analyzer.ts` | **PASS** |
| CMF (Chaikin Money Flow) | HLCV | 20 | `Σ(MFM × Vol) / ΣVol` | `foreign-flow-proxy.ts:chaikinMoneyFlow20` | **PASS** — MFM = `((C-L)-(H-C))/(H-L)` sesuai definisi Chaikin |
| CLV | HLC | 1 | `(C-L)/(H-L)` | `foreign-flow-proxy.ts:closeLocationValue` | **PASS** |

**Bukti numerik MACD (semua cocok persis ke 2 desimal):**

| Ticker | MACD SL | MACD ref | Signal SL | Signal ref | Hist SL | Hist ref |
|---|---|---|---|---|---|---|
| BBCA | 76,55 | 76,55 | 90,60 | 90,60 | -14,05 | -14,05 |
| TLKM | 6,59 | 6,59 | -8,80 | -8,80 | 15,39 | 15,39 |
| ASII | 30,53 | 30,53 | 19,05 | 19,05 | 11,48 | 11,48 |
| BBRI | 33,20 | 33,20 | 21,70 | 21,70 | 11,50 | 11,50 |
| BMRI | 5,71 | 5,71 | 22,16 | 22,16 | -16,45 | -16,45 |

**Catatan tentang seed EMA:** `calculateEMA` melakukan seeding dengan `prices[0]` alih-alih `SMA(period)`. Dengan ≥243 bar bias ini luruh di bawah presisi 2 desimal (terbukti di atas). Namun penjaga `analyzeMacd` adalah `history.length < 35` — pada 35-60 bar, bias seed masih material. Pemanggil di produksi menggunakan 200-250 bar, jadi tidak berdampak saat ini. Klasifikasi: **catatan, bukan temuan.**

---

## TAHAP 7 & 8 — AUDIT & REPRODUKSI SCREENER

### Screener utama (`/api/screener`)

| Aspek | Nilai |
|---|---|
| Universe | Gabungan `SCREENER_UNIVERSE` (51) + `AI_PICK_UNIVERSE` → 114 saham, disaring ke `CURATED_TICKERS` sebelum diranking |
| Sumber data | Yahoo `quoteSummary` (assetProfile, defaultKeyStatistics, financialData, summaryDetail, price) + chart `range=1mo` |
| Filter | `price > 0` (baris 131-132) — tidak ada filter fundamental keras |
| Formula | `perScore×w.per + roeScore×w.roe + derScore×w.der + divScore×w.div + growthScore×w.growth + momentumScore×w.momentum` |
| Ambang | Tidak ada; ranking murni, ambil 10 teratas |
| Sorting | Skor turun |
| Perilaku data hilang | **Diisi skor default 30/20/50/10/30 — H-04** |

**Reproduksi manual (data Yahoo riil, 2026-08-03, profil Moderat):**

Bobot Moderat: `roe 0.25, per 0.25, growth 0.20, der 0.15, div 0.15, momentum 0`

**BBCA** — `sector = Banks`, misalkan `sectorAvgPer = 13.0`:
```
RAW:   per=13.299  roe=0.21818  der=null  div_yield=0.0563  rev_growth=0.025  grossMargin=0
NORM:  per=13.30   roe=21.82%   der=null  div=5.63%         growth=2.5%
CALC:  perScore    = 100 - |13.30-13.00|/13.00*100          = 97.7
       roeScore    = min(100, 21.82*3)                       = 65.5
       derScore    = null → 50 (DEFAULT KARANGAN — H-04)     = 50.0
       divScore    = min(100, 5.63*15)                       = 84.5
       growthScore = min(100, max(0, 50 + 2.5*5))            = 62.5
SKOR:  97.7*0.25 + 65.5*0.25 + 62.5*0.20 + 50.0*0.15 + 84.5*0.15 = 73.6
FILTER: BBCA ∈ CURATED_TICKERS → LOLOS
MOAT:  roe 21.82 >= 20 TAPI grossMargin 0 < 40 → "Sedang" (seharusnya "Lebar")
```
> **Kenapa BBCA lolos?** Skor 73,6 masuk 10 besar. **Tapi 7,5 poin (50×0,15) berasal dari skor DER karangan** karena bank tidak melaporkan `debtToEquity` ke Yahoo. Dan rating moat-nya turun karena `grossMargins` bank = 0.

**TLKM** — misalkan `sectorAvgPer = 15.0`:
```
RAW:   per=15.198  roe=0.17683  der=59.982  div_yield=0.0849  rev_growth=0.064
NORM:  per=15.20   roe=17.68%   der=0.600   div=8.49%         growth=6.4%
CALC:  perScore    = 100 - |15.20-15.00|/15.00*100  = 98.7
       roeScore    = min(100, 17.68*3)               = 53.0
       derScore    = max(0, 100 - 0.600*40)          = 76.0
       divScore    = min(100, 8.49*15)               = 100.0  (di-cap)
       growthScore = min(100, max(0, 50 + 6.4*5))    = 82.0
SKOR:  98.7*0.25 + 53.0*0.25 + 82.0*0.20 + 76.0*0.15 + 100.0*0.15 = 80.8
```
> **Kenapa TLKM lolos?** Skor 80,8 — semua komponen dari data riil, tidak ada default. Ini contoh screener bekerja sebagaimana mestinya.

**ADRO** (emiten pelapor USD) — `sector = Energy`, misalkan `sectorAvgPer = 8.5`:
```
RAW:   per=7.956  roe=0.10256  der=19.536  div_yield=0.0961  rev_growth=0.234
NORM:  per=7.96   roe=10.26%   der=0.195   div=9.61%         growth=23.4%
CALC:  perScore    = 100 - |7.96-8.50|/8.50*100  = 93.6
       roeScore    = min(100, 10.26*3)            = 30.8
       derScore    = max(0, 100 - 0.195*40)       = 92.2
       divScore    = min(100, 9.61*15)            = 100.0
       growthScore = min(100, max(0, 50+23.4*5))  = 100.0  (di-cap)
SKOR:  93.6*0.25 + 30.8*0.25 + 100.0*0.20 + 92.2*0.15 + 100.0*0.15 = 79.9
```
> **Catatan penting:** Screener menghitung ADRO dengan **BENAR** karena memakai `summaryDetail.trailingPE` (yang sudah IDR) dan tidak menyentuh `priceToBook`. Bug mata uang C-06/C-07 **tidak** memengaruhi screener — hanya `/api/fundamental` dan `/api/stock`.

**Demonstrasi H-05 — saham murah dihukum.** Andaikan sebuah saham Energy dengan PER 4,0 (setengah dari rata-rata sektor 8,5):
```
perScore = 100 - |4.00-8.50|/8.50*100 = 47.1
```
Saham dengan PER 4 mendapat 47,1, sementara ADRO dengan PER 7,96 mendapat 93,6. Saham yang **dua kali lebih murah** mendapat **separuh skor valuasi**. Ini kebalikan dari yang dikomunikasikan kolom "PER (Valuasi)" di UI.

### Screener "RSI Oversold" (halaman utama)

| Aspek | Nilai |
|---|---|
| Universe | `MARKET_STOCKS` (250 saham, dipilih dari data riil via `scratch/rank-liquidity.js`) |
| Formula | `rsi(closes, 14)` — rata-rata sederhana, **bukan Wilder (H-01)** |
| Filter | **Tidak ada filter keras** — ranking `rsi14` menaik, ambil 50 (didokumentasikan, baris 215-218) |
| Perilaku data hilang | `rsi14 !== null` → dibuang. ✅ **Benar** |

> **Kenapa saham X ada di daftar Oversold?** Karena RSI-nya termasuk 50 terendah dari 250 saham — **bukan** karena RSI < 30. Ini didokumentasikan di komentar kode dan merupakan keputusan yang dapat dipertanggungjawabkan. Tetapi RSI-nya sendiri bias +4 s/d +12 poin ke atas (H-01), sehingga urutan peringkatnya berbeda dari platform lain.

Kategori `undervalue` di `/api/daily-picks:52` memakai filter keras yang benar (`rsi < 30`) atas daftar yang sama. ✅

### Screener "Breakout"

| Aspek | Nilai |
|---|---|
| Universe | `AI_PICK_UNIVERSE` (~109 saham) |
| Formula skor | `GOLDEN CROSS +3`, `VOL SPIKE(>2x) +2`, `RSI 52-60 +1`, `NEAR RES(<2%) +1`, `BANDAR AKUM +1` |
| Filter | `score > 0`, ambil 8 teratas |
| Perilaku data hilang | `history.length < 25` → dibuang — **tapi penjaga ini terlalu longgar untuk MA50 (H-02)** |

> **Kenapa saham lolos Breakout?** Minimal satu dari lima sinyal terpicu. Sinyal `GOLDEN CROSS` (bobot terbesar, 3 poin) **tidak dapat dipercaya** untuk saham dengan 25-50 bar histori karena bug pembagi MA50 (H-02). Ambang `RSI 52-60` juga arbitrer dan tak terdokumentasi (M-04).

### AI Pick — kontradiksi ambang

`modules/recommendation/service/ai-pick.service.ts:5-8, 80`:
```ts
/** Ambang kategori BUY di getKategori()... daftar "hari ini beli apa" tidak boleh
 *  memuat saham yang sistem sendiri tidak kategorikan layak beli. */
const MIN_SCORE = 60;
...
.filter((i) => i.finalScore >= MIN_SCORE)
```

Filter diterapkan pada `finalScore` = `baseScore + bonus`, bukan `baseScore`. Total bonus maksimum = 15+10+10+5 = **40 poin**.

**Contoh yang melanggar niat yang ditulis di komentarnya sendiri:**
```
Saham Z: baseScore = 25   → getKategori(25) = "SELL"
  + breakout       +15
  + akumulasi      +10
  + golden cross   +10
  + oversold        +5
  = finalScore     = 65   → LOLOS filter MIN_SCORE
```
Saham yang dikategorikan **SELL** oleh scoring engine muncul di daftar "hari ini beli apa". Perbaikannya sederhana: terapkan `MIN_SCORE` pada `baseScore`, gunakan `finalScore` hanya untuk mengurutkan.

---

## TAHAP 9 — VALIDASI RUMUS FUNDAMENTAL

| Rasio | Rumus di SahamLens | Rumus standar | Verdict |
|---|---|---|---|
| PER | `summaryDetail.trailingPE` (langsung dari Yahoo) | Price / EPS | **PASS** — diverifikasi: BBCA 6275/471,84 = 13,30 = `trailingPE` ✅ |
| PBV | `defaultKeyStatistics.priceToBook` | Price / BVPS | **PASS untuk emiten IDR**; **FAIL untuk emiten USD (C-07)** |
| EPS | `defaultKeyStatistics.trailingEps` | — | **PASS** (sudah IDR); **dirusak di `/api/fundamental` (C-06)** |
| ROE | `financialData.returnOnEquity × 100` | Net Income / Equity | **PASS** di screener/recommendation/analyzer; **FAIL di `/api/stock` (C-05)** |
| ROA | `financialData.returnOnAssets × 100` | Net Income / Assets | **PASS** |
| DER | `financialData.debtToEquity / 100` | Total Debt / Equity | **PASS** di screener/recommendation/analyzer; **FAIL di `/api/stock` (C-05)** |
| Revenue Growth | `financialData.revenueGrowth × 100` | (Rev_t - Rev_t-1)/Rev_t-1 | **PASS** di screener; **FAIL di `/api/stock` (C-05)** |
| Profit Growth | `earningsGrowth` via `eps-growth-analyzer` | — | **PASS** |
| Dividend Yield | `summaryDetail.dividendYield × 100` | DPS / Price | **PASS** — diverifikasi BBCA 0,0563 → 5,63% ✅ |
| Market Cap | `summaryDetail.marketCap` | Shares × Price | **PASS** |
| Current Ratio | `financialData.currentRatio` | Current Assets / Current Liabilities | **PASS** |

**Konsistensi periode (TAHAP 9):**
Seluruh rasio berasal dari kelompok field TTM Yahoo (`trailingPE`, `trailingEps`, `returnOnEquity`, `revenueGrowth`). **Tidak ditemukan pencampuran TTM dengan annual atau quarterly.** ✅

Yang **tidak** ada: label periode di UI. Pengguna tidak diberi tahu bahwa PER adalah TTM, atau kapan laporan keuangan terakhir yang mendasarinya. `mostRecentQuarter` sebenarnya diambil di `app/api/council/route.ts` untuk cache key dan prompt AI — tapi tidak pernah ditampilkan di kartu rasio. **Rekomendasi:** tampilkan `mostRecentQuarter` di samping setiap rasio fundamental.

**Kasus khusus bank — penalti sistematis (bagian dari C-05/H-04):**
BBCA tidak melaporkan `debtToEquity` maupun `currentRatio` ke Yahoo (normal untuk bank — konsep DER dan current ratio tidak berlaku pada neraca bank). Akibatnya `scoreKesehatan()` mengembalikan `{ score: 0, reason: '' }` — nol dari 10 poin, dengan alasan **string kosong**. Setiap bank di universe kehilangan 10 poin "kesehatan" secara permanen dan pengguna tidak diberi penjelasan apa pun. Seharusnya: keluarkan komponen ini dari perhitungan untuk sektor keuangan dan renormalisasi, atau ganti dengan CAR/NPL bila datanya tersedia.

---

## TAHAP 10 — AUDIT DCF

Dua model terpisah. Keduanya perlu dinilai berbeda.

### Model A — `calculateDcfModel()` (halaman /dcf) — **KUALITAS BAIK**

| Komponen | Nilai / Sumber | Transparan ke pengguna? |
|---|---|---|
| Free Cash Flow | Yahoo `financialData.freeCashflow` | ✅ |
| Shares Outstanding | Yahoo `defaultKeyStatistics.sharesOutstanding` | ⚠️ **`|| 1` — C-09** |
| Growth (5 tahun) | `clamp(ROE × retentionRatio, 0.02, 0.12)` — sustainable growth rate riil | ✅ ditampilkan di `executive_summary` |
| Retention Ratio | `1 - payoutRatio` (riil), fallback 0,6 | ⚠️ fallback 0,6 tidak diungkap |
| WACC | `6.7% + 5.2% = 11.9%` — konstanta beku | ✅ `sbn_10y_yield` & `risk_premium` dikembalikan terpisah |
| Terminal Growth | 3,5% konstan | ✅ dikembalikan sebagai `terminal_growth_pct` |
| Terminal Value | `FCF_5 × (1+g) / (WACC - g)` — Gordon Growth benar | ✅ `pv_terminal_value` dikembalikan |
| Net Debt | **Tidak dikurangkan** | ❌ tidak diungkap |
| Sensitivitas | WACC ±1% × TG {3,0 / 3,5 / 4,0}%, tiap sel dihitung ulang penuh | ✅ tabel penuh dikembalikan |

**Reproduksi (ASII, data riil 2026-08-03):**
```
RAW DATA
  price               = Rp 5.025
  freeCashflow        = Rp 16.600.374.706.176
  sharesOutstanding   = 40.063.816.240
  returnOnEquity      = 0,11983  (11,98%)
  payoutRatio         = 0,5172
  financialCurrency   = IDR (tanpa konversi kurs)

ASSUMPTIONS
  FCF/share           = 16.600.374.706.176 / 40.063.816.240 = Rp 414,35
  retentionRatio      = 1 - 0,5172 = 0,4828
  rawGrowth           = 0,11983 × 0,4828 = 0,05785
  projectionGrowth    = clamp(0,05785, 0,02, 0,12) = 5,785%
  WACC                = 6,7% + 5,2% = 11,9%
  terminalGrowth      = 3,5%

FORMULA
  Tahun 1: 414,35 × 1,05785 = 438,32   PV = 438,32/1,119^1 = 391,71
  Tahun 2: 463,68                      PV = 370,25
  Tahun 3: 490,50                      PV = 350,00
  Tahun 4: 518,88                      PV = 330,86
  Tahun 5: 548,90                      PV = 312,77
  Σ PV FCF                                 = 1.755,59
  TV      = 548,90 × 1,035 / (0,119 - 0,035) = 6.762,53
  PV(TV)  = 6.762,53 / 1,119^5               = 3.853,42

FAIR VALUE = 1.755,59 + 3.853,42 = Rp 5.609
MOS        = (5.609 - 5.025) / 5.609 = +10,4%  → UNDERVALUED
```
Seluruh langkah dapat direproduksi dari output API. **Ini standar yang benar** — bagian aplikasi yang paling baik dalam hal transparansi asumsi.

**Kekurangan Model A:**
1. `sharesOutstanding || 1` (C-09).
2. `Net Debt` tidak dikurangkan — Enterprise Value diperlakukan sebagai Equity Value. Untuk emiten dengan utang besar, fair value overstated. Bisa dibela dengan argumen bahwa ini "FCF to Equity", tapi tidak dinyatakan di mana pun.
3. WACC = 11,9% identik untuk semua saham — tidak ada beta, tidak ada struktur modal spesifik emiten. Nama "WACC" mengklaim lebih dari yang dihitung; sesungguhnya ini *cost of equity* build-up.
4. `SBN_10Y_YIELD_PCT = 6.7` beku padahal `modules/macro/` sudah ada (M-04).

### Model B — `calculateIntrinsicValue()` (Intrinsic Value Engine) — **KUALITAS RENDAH**

Metode yang dilabeli **"DCF (FCF)"** sesungguhnya adalah **Gordon Growth satu tahap**:
```ts
intrinsic_dcf = (fcf_per_share * 1.05) / (0.12 - 0.05);   // baris 173
```
Tidak ada proyeksi multi-tahun, tidak ada tabel PV, tidak ada terminal value terpisah. Sekadar perpetuitas tumbuh dengan `g = 5%` dan `r = 12%` **konstan untuk semua saham**. Sensitivitas terhadap parameter sangat ekstrem: pembagi 0,07 berarti mengubah `r` dari 12% ke 11% menaikkan nilai wajar **17%**. Tidak satu pun dari kedua asumsi ini ditampilkan ke pengguna (`methods.dcf` hanya mengembalikan `{ name, value, color }`).

DDM juga sama: `(dps * 1.05) / (0.12 - 0.05)`.

`PBV Fair` untuk bank memakai rumus tanpa penurunan teoretis: `pbvWajar = (roe/12) * 1.4` dengan komentar `// Premium 40% for CASA`, dan varian `(roe/11) * 1.3` untuk ROE > 20. Angka 12, 1,4, 11, 1,3 dan cap 3,2 tidak berasal dari mana pun. (Catatan positif: floor 2,5 sudah dihapus dengan alasan yang benar dan terdokumentasi di baris 118-122.)

`PER Fair = eps × 15` (14,5 untuk bank) — PER wajar tetap untuk seluruh emiten, tanpa memandang pertumbuhan atau kualitas.

**DAMPAK:** `fair_value` dari Model B masuk ke `valuation_agent` orchestrator dengan **bobot 20% — bobot terbesar dari 9 agen** (`orchestrator.service.ts:267-274`), dan dipakai sebagai "Harga Wajar" di halaman Compare.

**SOLUSI:** Ganti label `'DCF (FCF)'` menjadi `'Gordon Growth (FCF)'` supaya jujur; ekspos `g` dan `r` di `methods.dcf`; atau lebih baik, panggil `calculateDcfModel()` (Model A yang benar) untuk komponen DCF-nya.

---

## TAHAP 11, 12, 13 — REKOMENDASI, SCORING, CONSENSUS

### Scoring Matrix — `calculateScore()`

| Faktor | Sumber | Bobot (poin) | Alasan tertulis? | Perhitungan | Catatan audit |
|---|---|---|---|---|---|
| MA Trend | SMA 20/50/200 dari Close | 15 | Ya ("IDX Threshold") | Tangga: 15 / 10 / 5 / 3 / 0 | ✅ |
| RSI + MACD | RSI14, MACD(12,26,9) | 15 | Ya | RSI 0-8 + MACD 0-7, di-cap 15 | ⚠️ Cabang mixed mati (H-06); RSI bias (H-01); tidak ada penjaga null (M-03) |
| Volume | volToday / volAvg20 | 10 | Ya (">1,5x AVG 20D") | Tangga: 10 / 8 / 4 / 1 | ⚠️ Volume parsial (M-02) |
| Valuasi | PER, PBV | 10 | Ya | PER 0-5 + PBV 0-5 | ⚠️ PBV rusak untuk emiten USD (C-07) |
| Profitabilitas | ROE, Revenue Growth | 10 | Ya (">15% SEHAT") | ROE 0-5 + Growth 0-5 | ❌ Bug satuan (C-05) |
| Kesehatan | DER, Current Ratio | 10 | Ya | DER 0-5 + CR 0-5 | ❌ Bug satuan (C-05); bank selalu 0 |
| Asing | `foreignFlow`, `consecutiveBuyDays` | 15 | Sebagian | Tangga: 15 / 12 / 10 / 8 / 5 / 2 / 0 | ❌ Input adalah arah harga (H-03); N/A dapat 5 poin (H-04) |
| Bandar | `volRatio`, `foreignFlow` | 15 | Tidak | Tangga: 15 / 12 / 8 / 5 / 2 | ❌ **Double counting murni — tidak ada input baru** (H-07) |
| **TOTAL** | | **100** | | | |

**Rumus final score:**
```
technical_score   = maTrend + rsiMacd + volume         (0-40)
fundamental_score = valuasi + profitabilitas + kesehatan (0-30)
flow_score        = asing + bandar                      (0-30)
total_score       = technical + fundamental + flow       (0-100)

kategori: > 75 STRONG BUY | >= 60 BUY | >= 45 HOLD | selain itu SELL
```

**Ringkasan double counting:**

| Faktor mendasar | Berapa kali dihitung | Total poin dari faktor yang sama |
|---|---|---|
| Volume relatif | 2× (`scoreVolume` + `scoreBandar`) | 25 dari 100 |
| Arah flow | 2× (`scoreAsing` + `scoreBandar`) | 30 dari 100 |
| Tren MA | 2× (`scoreMATrend` + MACD di `scoreRsiMacd`) | ~19 dari 100 |

### Recommendation Engine

Ada **empat** mesin keputusan berbeda yang berjalan paralel dengan ambang berbeda:

| Mesin | File | Skala input | Ambang |
|---|---|---|---|
| `getKategori` | `scoring.service.ts:271` | total_score 0-100 | 75 / 60 / 45 |
| `calculateConsensus` | `consensus.service.ts:83` | bullPct dari 12 vote | 80 / 60 |
| `analyzeStock` inline | `recommendation.service.ts:105` | bullPct dari 10 vote | 70 / 50 / 30 |
| `decisionFromScore` | `orchestrator.service.ts:141` | weighted score 0-100 | 65 / 55 / 45 / 35 |

Saham dengan `total_score = 62` adalah **BUY** menurut `getKategori`, tetapi **HOLD** menurut `decisionFromScore` (62 < 65 tapi ≥ 55 → BUY... sebenarnya BUY juga). Contoh yang lebih tajam: `score = 58` → `getKategori` = **HOLD** (< 60), `decisionFromScore` = **BUY** (≥ 55). Pengguna melihat dua rekomendasi berbeda untuk saham yang sama di halaman Detail Saham vs Multi-Agent.

### Consensus Engine — arsitektur

Arsitektur yang diwajibkan:
```
REAL MARKET DATA → CALCULATION ENGINE → SCORING ENGINE → CONSENSUS → AI EXPLANATION
```

**Kesesuaian: SEBAGIAN BESAR SUDAH BENAR.** ✅ Ini pencapaian nyata dari audit sebelumnya.

Bukti bahwa AI **tidak** menjadi sumber kebenaran angka:
- `orchestrator.service.ts:284-289`: `finalScore` dihitung dari agen kuantitatif **sebelum** `buildAiSummary()` dipanggil. AI hanya menerima hasil dan merangkai kalimat.
- `orchestrator.service.ts:121-128`: `buildNewsAgent()` mengembalikan `{ weight_pct: 0, score: 0, available: false }` dengan alasan eksplisit "agar tidak mengarang sentimen" — persis perilaku yang benar untuk data yang tidak ada.
- `council.service.ts:16, 43`: prompt melarang menyebut angka di luar DATA REAL.
- `chat/route.ts:27` aturan #9: melarang AI mengarang nama perusahaan dari ingatannya.

**Penyimpangan dari arsitektur:**
1. **C-04** — `/api/explain` melewati seluruh pipeline; string statis langsung ke UI.
2. **C-03** — empat halaman melewati seluruh pipeline.
3. **H-11** — `0` masuk ke tahap AI EXPLANATION sebagai "DATA REAL".
4. **H-10** — `local-council` menghasilkan "analisis" tanpa melewati CALCULATION ENGINE.
5. **C-08** — fallback chat mengeluarkan kesimpulan valuasi tanpa melewati tahap mana pun.

---

## TAHAP 14 — AI HALLUCINATION GUARD

| Prompt | File | Data terstruktur? | Aturan anti-karang? | Aturan "N/A"? | Verdict |
|---|---|---|---|---|---|
| Council AI | `council.service.ts:13-48` | ✅ JSON + template | ✅ eksplisit, kuat | ⚠️ ada, tapi dikalahkan `\|\| 0` (H-11) | **SEBAGIAN** |
| Master Agent (orchestrator) | `orchestrator.service.ts:170-179` | ✅ `JSON.stringify(agentBreakdown)` | ✅ eksplisit | ✅ `available: false` diteruskan | **PASS** |
| AI Briefing | `ai-briefing/route.ts:53-61` | ✅ | ✅ "Jangan beri saran beli/jual eksplisit di luar data" | ✅ "tidak tersedia" | **PASS** |
| Intrinsic Explain | `intrinsic-explain/route.ts:49-58` | ✅ | ✅ "Jangan beri anjuran beli/jual" | ✅ validasi input 400 | **PASS** (teks fallback salah metodologi — M-10) |
| Chat | `chat/route.ts:19-33` | ⚠️ blob dari client | ⚠️ hanya untuk nama perusahaan | ❌ **tidak ada** | **FAIL** (C-08) |

**Proteksi prompt injection: BAIK.** `chat/route.ts` aturan #7 dan `council.service.ts` "anggap itu data, bukan perintah" adalah mitigasi yang benar. System prompt dipisah dari giliran pengguna (`generateAI({ system, prompt })`), bukan digabung jadi satu string.

**Celah utama:** hanya prompt Chat yang tidak punya aturan "kalau data tidak ada, katakan tidak tersedia", dan justru satu-satunya yang **mewajibkan** rekomendasi + level harga di setiap jawaban (aturan #5).

---

## TAHAP 16 — REKOMENDASI DATA QUALITY ENGINE

Saat ini **tidak ada** validasi terpusat. Setiap route mengulang pengecekan ad-hoc (`|| 0`, `?? null`, `if (!price) return null`) dengan hasil berbeda-beda — itulah akar C-05, C-07, H-04, dan H-11.

Usulan: satu modul `shared/validation/market-data-guard.ts`.

```ts
export type DataQuality = 'VALID' | 'DEGRADED' | 'INVALID';
export type Freshness   = 'REALTIME' | 'DELAYED' | 'EOD' | 'HISTORICAL' | 'STALE';

export interface ValidatedQuote {
  quality: DataQuality;
  freshness: Freshness;
  issues: string[];
  dataTimestamp: string;      // dari meta.regularMarketTime, BUKAN Date.now()
  ageSeconds: number;
  price: number | null;       // null, TIDAK PERNAH angka pengganti
  open: number | null; high: number | null; low: number | null; close: number | null;
  volume: number | null;
}

export function validateMarketData(raw: YahooChartResult): ValidatedQuote {
  const issues: string[] = [];
  const num = (v: unknown): number | null =>
    (typeof v === 'number' && Number.isFinite(v)) ? v : null;   // buang NaN & Infinity

  const price = num(raw.meta?.regularMarketPrice);
  if (price === null)  issues.push('PRICE_MISSING');
  if (price !== null && price <= 0) issues.push('PRICE_NON_POSITIVE');

  const o = num(...), h = num(...), l = num(...), c = num(...);
  if (h !== null && l !== null && h < l)                       issues.push('OHLC_HIGH_LT_LOW');
  if (h !== null && o !== null && h < o)                       issues.push('OHLC_HIGH_LT_OPEN');
  if (h !== null && c !== null && h < c)                       issues.push('OHLC_HIGH_LT_CLOSE');
  if (l !== null && o !== null && l > o)                       issues.push('OHLC_LOW_GT_OPEN');
  if (l !== null && c !== null && l > c)                       issues.push('OHLC_LOW_GT_CLOSE');

  const volume = num(raw.meta?.regularMarketVolume);
  if (volume !== null && volume < 0)                           issues.push('VOLUME_NEGATIVE');

  const bars = raw.timestamp?.length ?? 0;
  if (bars === 0)                                              issues.push('NO_HISTORY');

  const marketTime = num(raw.meta?.regularMarketTime);
  const ageSeconds = marketTime ? Math.round(Date.now()/1000 - marketTime) : Infinity;
  if (ageSeconds > 48*3600)                                    issues.push('STALE_OVER_48H');

  // Outlier: gerakan > 40% dalam sehari di IDX = kemungkinan besar corporate action
  // atau data rusak (ARA/ARB IDX maksimal 35%).
  const prev = num(raw.meta?.chartPreviousClose);
  if (price !== null && prev !== null && prev > 0
      && Math.abs((price - prev) / prev) > 0.40)               issues.push('OUTLIER_MOVE_GT_40PCT');

  const quality: DataQuality =
    issues.some(i => i.startsWith('PRICE_') || i === 'NO_HISTORY') ? 'INVALID'
    : issues.length > 0                                          ? 'DEGRADED'
    : 'VALID';

  return { quality, freshness: classifyFreshness(ageSeconds), issues,
           dataTimestamp: marketTime ? new Date(marketTime*1000).toISOString() : '',
           ageSeconds, price, open: o, high: h, low: l, close: c, volume };
}
```

**Aturan penegakan** (ini bagian yang paling penting, bukan fungsi validasinya):

| Konsumen | Kebijakan saat `INVALID` | Kebijakan saat `DEGRADED` |
|---|---|---|
| Screener | Buang saham dari universe | Masukkan, tapi tandai kolom yang bermasalah `N/A` — **tanpa skor default** |
| Scoring engine | Kembalikan `null`, bukan skor 0 | Keluarkan komponen dan **renormalisasi bobot** |
| Prompt AI | Kirim `'N/A'` — **jangan pernah `0`** | Kirim `'N/A'` untuk field yang bermasalah |
| Rekomendasi | Jangan hasilkan rekomendasi sama sekali | Hasilkan dengan penanda kelengkapan data |
| UI | Render "Data tidak tersedia" | Render nilai + ikon peringatan + `dataTimestamp` |

Satu aturan yang mengikat seluruh laporan ini: **tidak ada fungsi yang boleh mengganti data yang hilang dengan angka.** `|| 0`, `|| 1`, `|| 50`, `|| 15`, `?? 30` pada nilai finansial semuanya dilarang tanpa kecuali.

---

## TAHAP 17 — CROSS VALIDATION

**Metode:** membandingkan output SahamLens dengan Yahoo Finance (provider yang dipakai SahamLens sendiri) sebagai baseline. Data IDX resmi memerlukan langganan berbayar dan tidak dapat diakses dalam audit ini — keterbatasan yang perlu dicatat: audit ini memvalidasi **integritas pipeline** (apakah SahamLens setia menyampaikan data providernya), bukan **akurasi provider** terhadap IDX.

**Waktu pengambilan: 2026-08-03 09:01-09:02 UTC (16:01 WIB), pasca-penutupan bursa.**

### Harga saham

| Ticker | SahamLens (`/api/live`) | Yahoo (referensi) | Selisih | Selisih % |
|---|---|---|---|---|
| BBCA | 6.275 | 6.275 | 0 | **0,00%** |
| TLKM | 2.710 | 2.710 | 0 | **0,00%** |
| ASII | 5.050* | 5.050 | 0 | **0,00%** |
| BBRI | 3.010 | 3.010 | 0 | **0,00%** |
| BMRI | 4.160 | 4.160 | 0 | **0,00%** |

\* `quoteSummary` melaporkan 5.025 vs `chart` 5.050 — selisih 0,5% antar endpoint Yahoo pada waktu berbeda, di luar kendali SahamLens.

**PASS.** Harga saham diteruskan tanpa distorsi.

### Indeks

| Indeks | SahamLens (`/api/market-pulse`) | Referensi | Selisih | Selisih % |
|---|---|---|---|---|
| IHSG | 6.223,426 / -0,20% | `^JKSE` 6.223,426 / -0,20% | 0 | **0,00%** ✅ |
| IDX30 | 349,038 / -0,21% | `IDX30.JK` 349,038 / -0,21% | 0 | **0,00%** ✅ |
| Kompas100 | 816,37 / -0,02% | `Kompas100.JK` 816,37 / -0,02% | 0 | **0,00%** ✅ |
| **LQ45** | **608,00 / -1,10%** | `^JKLQ45` **622,162 / +0,15%** | **-14,162** | **-2,28%, ARAH TERBALIK** ❌ |

### OHLC & Volume

Diverifikasi pada 1.215 bar (bagian TAHAP 3): **0 pelanggaran**. Volume di `/api/live/BBCA` = 55.056.800, identik dengan `meta.regularMarketVolume` Yahoo. **PASS.**

### Fundamental

| Metrik | Ticker | SahamLens | Yahoo | Verdict |
|---|---|---|---|---|
| PER (screener) | BBCA | 13,3x | 13,299 | ✅ PASS |
| ROE (screener) | BBCA | 21,8% | 0,21818 → 21,82% | ✅ PASS |
| DER (screener) | TLKM | 0,60x | 59,982 → 0,600 | ✅ PASS |
| Div Yield (screener) | BBCA | 5,63% | 0,0563 → 5,63% | ✅ PASS |
| **ROE (`/api/stock`)** | BBCA | **"0,2% (lemah)"** | 21,82% | ❌ **FAIL — C-05** |
| **DER (`/api/stock`)** | TLKM | **"59,98x (berisiko tinggi)"** | 0,60x | ❌ **FAIL — C-05** |
| **PER (`/api/fundamental`)** | ADRO | **0,00049x** | 7,96x | ❌ **FAIL — C-06** |
| **PBV (scoring)** | ADRO | **14.529,41x** | 0,89x (dikoreksi kurs) | ❌ **FAIL — C-07** |

### Market Cap
`summaryDetail.marketCap` diteruskan langsung tanpa transformasi. ✅ PASS.

---

## TAHAP 19 — UJI KEGAGALAN DATA

| Skenario | Perilaku saat ini | Sesuai "REAL DATA OR NO DATA"? |
|---|---|---|
| Yahoo timeout (`/api/stock`) | Coba stale cache (≤24 jam), kalau kosong → HTTP 500 | ⚠️ Data basi tanpa penanda (M-06) |
| Yahoo 429/403 (`/api/live`) | **Kembalikan `price: 10000`, HTTP 200** | ❌ **CRITICAL — C-02** |
| Yahoo gagal (`market-pulse`, LQ45) | **Kembalikan `price: 608`** | ❌ **CRITICAL — C-01** |
| Yahoo gagal (`market-pulse`, IDX30/Kompas100) | Kembalikan 462,5 / 1132,4 | ❌ Bom waktu (C-01) |
| Yahoo gagal (`market-summary`) | `fetchQuote` → `null` → saham dilewati | ✅ **BENAR** |
| Yahoo gagal (`screener`) | `fetchOne` → `null` → saham dilewati | ✅ **BENAR** |
| Yahoo gagal (`breakout`) | `analyzeSymbolForBreakout` → `null` → dilewati | ✅ **BENAR** |
| Yahoo gagal (`flow`) | HTTP 500 dengan pesan | ✅ **BENAR** |
| Yahoo gagal (`backtest precompute`) | Log peringatan, saham dilewati | ✅ **BENAR** |
| Price `null` | `if (!price) return null` di `fetchOne` | ✅ **BENAR** |
| Volume `null` | `quote.volume?.[i] \|\| 0` | ⚠️ Volume tidak diketahui jadi 0 → rasio volume salah |
| Fundamental `null` (screener) | Skor default 30/20/50/10/30 | ❌ **H-04** |
| Fundamental `null` (scoring) | 0 poin dengan reason `''` (bank) | ⚠️ Tidak diungkap ke pengguna |
| Histori kosong | `if (history.length === 0) return null` | ✅ **BENAR** |
| Histori < 200 bar (MA200) | `sma(closes, Math.min(200, len))` → dilabeli "MA200" padahal bukan | ⚠️ Salah label |
| Histori 25-50 bar (MA50) | Dibagi 50 walau data kurang | ❌ **H-02** |
| AI timeout (Council) | `runLocalCouncil()` — 7 agen karangan | ❌ **H-10** |
| AI tidak dikonfigurasi (Chat) | "[MODE SIMULASI AI]" + klaim MoS + rekomendasi TAHAN | ❌ **C-08** |
| AI timeout (Briefing) | `fallbackBriefing()` dari data riil | ✅ **BENAR** |
| AI timeout (Intrinsic Explain) | `fallbackExplanation()` dari angka riil | ✅ (metodologi salah — M-10) |
| AI timeout (Orchestrator) | `buildLocalSummary()` dari `agentBreakdown` riil | ✅ **BENAR** |
| Redis down | `cacheGet`/`cacheSet` degrade ke no-op | ✅ **BENAR** |
| Database timeout | Error dipropagasi | ✅ **BENAR** |
| `sharesOutstanding` hilang | Dibagi 1 → fair value meledak | ❌ **C-09** |
| Kurs USD/IDR gagal | Fallback 15.500 | ⚠️ Kurs riil saat ini ~16.300 (~5% error) |

**Rangkuman:** 14 dari 25 skenario kegagalan menangani ketiadaan data dengan benar. 6 mengisi dengan angka karangan. 5 menangani sebagian.

---

## PRIORITAS PERBAIKAN

Diurutkan berdasarkan (paparan ke pengguna × besar kesalahan × biaya perbaikan).

**Segera — angka palsu tayang ke pengguna:**
1. **C-01** — Perbaiki resolusi indeks LQ45; hapus ketiga fallback hardcoded. *Terbukti live saat ini.* (~15 menit)
2. **C-02** — Hapus `mockPrice = 10000`, kembalikan 503. (~10 menit)
3. **C-03** — Hapus atau kosongkan 4 halaman karangan + hapus atribusi merek pihak ketiga. (~30 menit untuk penghapusan)
4. **C-04** — Hapus `app/api/explain/route.ts`. (~2 menit)

**Segera — kesalahan hitung yang memengaruhi setiap rekomendasi:**
5. **C-05** — Perbaiki satuan ROE/DER/revenueGrowth di `/api/stock`. (~5 menit, dampak besar)
6. **C-06** — Hapus pengali kurs pada EPS/forwardEps/dividendRate di `/api/fundamental`. (~5 menit)
7. **C-07** — Koreksi mata uang PBV sebelum masuk scoring. (~20 menit)
8. **C-09** — Hilangkan `sharesOutstanding || 1`. (~5 menit)

**Berikutnya — integritas AI:**
9. **C-08** — Perbaiki fallback chat + tambahkan aturan "N/A" ke prompt.
10. **H-11** — Ganti enam `|| 0` di prompt Council menjadi `?? 'N/A'`.
11. **H-10** — Hitung 7 agen `local-council` dari data yang sudah tersedia.

**Berikutnya — akurasi perhitungan:**
12. **H-01** — Satu implementasi RSI Wilder untuk keempat pemanggil.
13. **H-02** — Perbaiki penjaga panjang histori untuk MA50.
14. **H-03** — Pakai `analyzeAccumulationSignal` di recommendation engine.
15. **H-04** — Hilangkan skor default; renormalisasi bobot.
16. **H-05** — Perbaiki rumus skor PER supaya monoton.

**Terjadwal — kualitas metodologi:**
17. **H-06, H-07, H-08, H-09** — Perbaiki cabang mati, double counting, vote volatilitas & S/R.
18. **M-01** — Pisahkan `adjclose` (indikator/backtest) dari `close` (level harga).
19. **M-02** — Normalisasi volume intraday.
20. **M-03** — Analyzer kembalikan nilai numerik terstruktur.
21. **M-04** — Satukan ambang ke satu file konstanta terdokumentasi; satukan 4 definisi konsensus.
22. **M-06, M-07** — Tambahkan `dataTimestamp` + klasifikasi kesegaran (REALTIME/DELAYED/EOD/STALE) di seluruh endpoint.
23. **TAHAP 16** — Bangun `validateMarketData()` dan tegakkan di seluruh konsumen.
24. **M-05, M-08, M-09, M-10, L-01..L-04** — Sisanya.

---

## LAMPIRAN — SKRIP VERIFIKASI

Seluruh angka empiris di laporan ini dapat direproduksi. Skrip berada di direktori scratchpad sesi ini:

| Skrip | Membuktikan |
|---|---|
| `verify.js` | Integritas OHLC (1.215 bar), RSI SahamLens vs Wilder, MACD vs referensi, celah `close` vs `adjclose` |
| `verify2.js` | Resolusi simbol indeks, meta `/api/live`, event split |
| `verify3.js` | Replikasi persis `fetchYahooQuote()` → membuktikan jalur dummy LQ45; verifikasi penyesuaian split |

Verifikasi production satu baris:
```bash
curl -s https://sahamlens.vercel.app/api/market-pulse \
  | grep -o '"name":"LQ45"[^}]*'
# Aktual : "name":"LQ45","fullName":"LQ45 Index","price":608,"changePct":-1.1,"sparkline":[]
# Riil   : ^JKLQ45 = 622.162 (+0.15%)
```

---

*Audit dilakukan 2026-08-03. Tidak ada source code, formula, skema database, atau dependensi yang diubah.*
