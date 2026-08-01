# Sinyal Hari Ini — Design Spec

**Tanggal:** 2026-08-02
**Konteks:** Selama audit dummy-data (2026-08-01) dan diskusi lanjutan soal AI Pick, muncul pertanyaan pengguna: backtest sudah bisa menguji "kalau saya pakai kombinasi filter X, historically hasilnya bagaimana" — tapi tidak ada cara untuk bertanya "kombinasi filter X ini, SEKARANG cocok ke saham mana saja?" tanpa mengetes satu-satu di Technical Analyzer. AI Pick (`/breakout-radar`) sudah menjawab pertanyaan sejenis tapi dengan kriteria TETAP (bukan filter custom pilihan user) dan tanpa konteks historis. Fitur ini mengisi celah itu: live screener dari kombinasi filter custom yang sama dipakai Backtest, ditambah konteks seberapa reliable kombinasi itu historically.

## Keputusan produk (hasil brainstorming)

1. **Sumber data: cache precompute harian yang sudah ada** (`readBacktestCache()`, diisi cron `app/api/cron/backtest-precompute`, 94 saham — lihat `docs/superpowers/specs/2026-08-01-real-backtest-engine-design.md`), **bukan** live-fetch baru. Konsekuensi: data "sampai penutupan kemarin", bukan intraday real-time — ditampilkan jujur lewat label "Data per [tanggal]" (pola sama dengan tab Backtest). Alasan: tidak perlu infrastruktur fetch baru, mencakup universe 94 saham penuh (bukan dibatasi ~51 seperti kalau harus live-fetch per-request), dan konsisten dengan cara Backtest sendiri bekerja.
2. **Gabungkan live match + histori dalam satu tampilan** — bukan cuma daftar saham yang cocok hari ini, tapi juga statistik historis (win rate/return/alpha) dari kombinasi filter yang sama, dari `simulateBacktest()` yang sudah ada. User langsung lihat "5 saham ini cocok filter X sekarang" DAN "filter X ini historically menang 62% dari waktu ke waktu" dalam satu layar — ini yang membedakan fitur ini dari AI Pick/Screener biasa.
3. **Skor per saham: "X/9 indikator bullish"** — dihitung dari SEMUA 9 indikator yang ada di cache (bukan cuma indikator yang dipilih user sebagai filter kriteria "cocok"). Kriteria "cocok" tetap biner (semua filter TERPILIH harus BULLISH), tapi supaya daftar tidak rata tanpa urutan, tiap saham yang lolos diberi skor tambahan dari total indikator bullish-nya hari itu (termasuk yang tidak dipilih sebagai filter) — saham dengan skor lebih tinggi (lebih banyak konfirmasi indikator lain) ditampilkan lebih dulu. Data real dari cache yang sama, bukan angka karangan.
4. **Penempatan: tab baru di dalam halaman Backtest yang sudah ada** (`app/backtest/page.tsx`), bukan menu/halaman terpisah di Sidebar. Berbagi UI pemilihan filter yang sama dengan tab Backtest (tidak duplikasi form). Nama tab: **"Sinyal Hari Ini"**.
5. **Akses: ikut aturan akses terbuka yang baru** (2026-08-01) — halaman Backtest (dan tab baru ini) bisa dibuka tanpa login. Endpoint API di baliknya tetap wajib login (pola `getSession()` yang sama dengan `/api/backtest`) — kalau belum login saat klik tombol, tampilkan modal ajakan daftar (`PaywallModal` dengan `ctaHref="/signup"`, pola yang sama sudah dipakai halaman lain), bukan error mentah.

## Arsitektur

Tidak ada komponen infrastruktur baru (tidak ada cron baru, tidak ada Redis key baru) — murni logic baru di atas data yang sudah di-precompute untuk Backtest.

### Komponen baru

1. **`modules/backtest/service/live-signal.service.ts`**
   Fungsi baru `computeLiveSignal(cache: BacktestIndicatorCache, filters: IndicatorName[]): LiveSignalResult`:
   - Untuk tiap ticker di cache: ambil index HARI TERAKHIR dari `bars`/`decisions` (bukan iterasi seluruh histori seperti `simulateBacktest` — cuma butuh snapshot hari terakhir).
   - "Cocok" kalau SEMUA `filters` yang dipilih user = `BULLISH` pada hari terakhir itu untuk ticker itu.
   - Untuk ticker yang cocok, hitung skor = jumlah dari SEMUA 9 `IndicatorName` yang bernilai `BULLISH` pada hari itu (bukan cuma yang ada di `filters`).
   - Urutkan hasil oleh skor tertinggi dulu (tie-break: alfabetis ticker, untuk determinisme).
   - Kembalikan `{ dataAsOf, matches: { symbol, price, score }[] }` — `price` dari `bars` hari terakhir yang sama, `dataAsOf` dari `cache.computedAt` (pola sama dengan `/api/backtest`).

2. **`app/api/backtest/route.ts`** (extend, bukan endpoint baru)
   Tambah parameter opsional `mode: 'backtest' | 'live-signal'` di body request (default `'backtest'` kalau tidak diisi, supaya kontrak lama tidak berubah). Kalau `mode === 'live-signal'`:
   - Validasi filters sama persis dengan mode backtest (minimal 1 filter, dari `VALID_FILTERS`) — TIDAK butuh `modal`/`period` (posisi/waktu tidak relevan untuk snapshot hari ini).
   - Baca cache (fallback precompute sinkron kalau cache-miss, pola sama seperti mode backtest).
   - Panggil `computeLiveSignal(cache, filters)` untuk daftar saham cocok + skor.
   - Panggil `simulateBacktest(cache, { filters, modal: 100_000_000, periodMonths: 12 })` untuk histori (modal & periode di-hardcode ke default yang representatif — 12 bulan, modal Rp100 juta, ANGKA INI HANYA dipakai untuk menghitung win rate/return %/alpha % yang tidak bergantung skala modal, tidak ditampilkan sebagai modal ke user).
   - Response: `{ dataAsOf, matches: [{symbol, price, score}], historicalStats: { winRatePct, returnPct, alphaPct, totalTrades } }`.

3. **`app/backtest/page.tsx`** (extend)
   Tambah tab switcher "Backtest" / "Sinyal Hari Ini" di atas form filter (form filter itu sendiri dipakai bersama oleh kedua tab — state `selectedFilters` yang sama). Tombol aksi berubah sesuai tab aktif: "Backtest Sekarang" (mode lama) vs "Cek Saham Cocok Hari Ini" (mode baru, kirim `mode: 'live-signal'`, tanpa field modal/periode di tab ini karena tidak relevan).
   Tampilan hasil tab "Sinyal Hari Ini":
   - Bar ringkasan histori (win rate/return/alpha 12 bulan) di atas, gaya sama dengan metric cards Backtest.
   - Label "Data per [tanggal]" (dari `dataAsOf`).
   - Daftar saham cocok (kode + harga + skor "X/9"), diurutkan skor tertinggi.
   - Kosong (`matches.length === 0`): pesan eksplisit "Tidak ada saham yang cocok kombinasi filter ini hari ini" — bukan tabel kosong tanpa penjelasan.
   - 401 dari API: `PaywallModal` ajakan daftar (pola sama dengan halaman lain, lihat komponen `showLoginPrompt` di `app/dashboard/page.tsx` dkk).

### Alur data

```
GET readBacktestCache() (cache harian yang SAMA dipakai tab Backtest, tidak ada fetch baru)
  |
  v
POST /api/backtest {filters, mode: 'live-signal'}
  -> computeLiveSignal(cache, filters)   -> daftar saham cocok + skor X/9
  -> simulateBacktest(cache, {filters, modal: 100_000_000, periodMonths: 12})
                                          -> win rate/return/alpha histori
  -> response: {dataAsOf, matches, historicalStats}
```

## Error handling & edge case

- **Tidak ada saham yang cocok hari ini:** `matches: []`, frontend tampilkan pesan eksplisit (bukan tabel kosong diam-diam) — pola sama dengan kasus 0 trade di Backtest.
- **Cache-miss:** fallback precompute sinkron, sama persis dengan mode backtest yang sudah ada (lambat di request pertama, cepat setelahnya karena hasil precompute ikut ke-cache).
- **Filter kosong / tidak valid:** 400, validasi sama persis dengan mode backtest (reuse `VALID_FILTERS` yang sama, termasuk fix "tolak filter tidak dikenal" yang sudah ada).
- **Belum login:** 401 dari API (tidak berubah dari sekarang) → frontend tampilkan `PaywallModal` ajakan daftar, bukan error mentah/halaman kosong.
- **historicalStats dari kombinasi filter yang belum pernah menghasilkan trade dalam 12 bulan:** `totalTrades: 0`, `winRatePct: 0` (finite, bukan NaN — logic ini sudah ada di `simulateBacktest`) - tampilkan apa adanya, bukan disembunyikan.

## Testing

- Unit test `live-signal.service.ts` dengan `BacktestIndicatorCache` sintetis (di-construct langsung di test, pola sama dengan `simulate.service.test.ts`) — cover: saham cocok difilter benar (semua filter BULLISH di hari terakhir), saham TIDAK cocok kalau salah satu filter tidak BULLISH, skor dihitung dari SEMUA 9 indikator bukan cuma yang difilter, urutan hasil dari skor tertinggi, tie-break alfabetis, hasil kosong kalau tidak ada yang cocok.
- Test `app/api/backtest/route.ts` untuk `mode: 'live-signal'` (extend test file yang sudah ada) — cover: response shape benar, 401 tanpa sesi, 400 filter kosong/tidak valid, cache-miss fallback ke precompute sinkron dipanggil.
- Tidak perlu test UI otomatis (pola yang sama dengan tab Backtest yang sudah ada, tidak ada test frontend di codebase ini) — verifikasi manual di browser setelah implementasi.
