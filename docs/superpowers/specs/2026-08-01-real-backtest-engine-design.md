# Real Backtest Engine — Design Spec

**Tanggal:** 2026-08-01
**Konteks:** Ditemukan lewat audit bug menyeluruh (backend+frontend) atas seluruh codebase. `app/api/backtest/route.ts` saat ini menghasilkan semua angka (return %, win rate, max drawdown, equity curve, sample trades) murni dari `Math.random()`, hanya diseed dari jumlah filter yang dipilih user — bukan dari data harga historis saham manapun. Dua request identik menghasilkan angka berbeda tiap kali. Ini disajikan ke user berbayar sebagai hasil backtest strategi trading, yang merupakan masalah integritas data untuk tool pengambilan keputusan trading saham. User (product owner) memilih untuk membangun backtest engine sungguhan, bukan sekadar melabeli hasil sebagai simulasi ilustratif.

## Keputusan produk (hasil brainstorming)

1. **Cakupan strategi: scan universe 100 saham khusus backtest**, bukan satu saham spesifik. Tidak perlu ubah UI untuk tambah field pilih ticker.
   - **Bukan** `fetchScreenerUniverse()`/`SCREENER_UNIVERSE` yang sudah ada (51 saham) — itu sengaja dibatasi kecil karena dipakai fetch LIVE per-request (halaman Screener, `pickSameSectorPeer` di Compare) dan memperbesarnya akan ikut memperlambat/menambah risiko rate-limit fitur-fitur itu.
   - Universe backtest pakai **daftar hardcode terpisah** (`modules/backtest/constants/backtest-universe.ts`), dikurasi manual ke 100 ticker likuid (boleh superset dari 51 ticker `SCREENER_UNIVERSE` yang sudah ada + ~49 ticker likuid lain) — aman diperbesar karena hanya dipakai cron harian (async, bukan per-request), bukan sumber dinamis dari `idx_emiten_900.csv` (ditolak - butuh logic ranking tambahan & risiko kualitas data emiten kecil yang jarang diperdagangkan).
2. **Entry rule:** beli saham pada hari dimana SEMUA filter/indikator yang dipilih user menunjukkan keputusan BULLISH untuk saham itu di hari itu.
3. **Exit rule:** jual saat kondisi entry tidak lagi terpenuhi — mirror persis dari entry (entry butuh SEMUA filter terpilih BULLISH; exit terjadi begitu SALAH SATU filter yang sama tidak lagi BULLISH untuk saham itu di hari itu). Bukan stop-loss/take-profit tetap atau holding period tetap.
4. **Position sizing:** equal-weight FIXED per slot, maksimal 5 posisi terbuka bersamaan. Ukuran satu slot = (ekuitas total portofolio saat itu — kas + posisi terbuka di-mark-to-market) / 5, dihitung ulang tiap kali ada slot kosong yang mau diisi sinyal baru (bukan modal awal statis dibagi 5 selamanya — supaya P/L dari trade sebelumnya ikut compounding, konsisten dengan bentuk equity curve yang sudah ada di UI). Slot yang kosong berarti bagian kas itu menganggur (tidak dialokasikan ke posisi lain) sampai ada sinyal baru mengisi slot tersebut.
5. **Filter 'Foreign Flow' dihapus** dari daftar filter yang bisa dipilih — nilainya di `app/api/stock/[ticker]/route.ts` adalah pseudo-random (hash deterministik dari nama ticker), bukan data aliran dana asing sungguhan. Backtest tidak bisa jujur memakai sinyal palsu sebagai kriteria entry/exit.
6. **Volume sudah terwakili** lewat filter `'Volume vs Avg 20D'` (`analyzeVolume`) yang sudah ada — tidak perlu indikator likuiditas/eksekusi tambahan di luar 9 filter yang ada. Realisme eksekusi (slippage, likuiditas order besar) di luar scope.

## Arsitektur

Precompute harian via cron + simulasi cepat on-demand saat request (bukan hitung langsung per-request — lihat "Alternatif yang dipertimbangkan" di bawah).

### Komponen baru

1. **`modules/backtest/constants/backtest-universe.ts`**
   Daftar hardcode 100 ticker likuid IDX khusus backtest (superset dari `SCREENER_UNIVERSE` yang sudah ada + ~49 ticker likuid lain, dikurasi manual sekali). Terpisah dari `SCREENER_UNIVERSE` supaya tidak mempengaruhi performa fitur live (Screener, Compare) yang sengaja dibatasi kecil.

2. **`modules/backtest/service/precompute.service.ts`**
   Untuk tiap saham di `backtest-universe.ts` (100 ticker): ambil OHLCV historis via `fetchYahooHistory(ticker, '5y')` (5 tahun — memberi buffer aman ~200 hari perdagangan lookback yang dibutuhkan indikator seperti MA200 sejak hari pertama window, di atas kebutuhan periode backtest maksimal 24 bulan). Jalankan 9 analyzer asli (`analyzeEma`, `analyzeRsi`, `analyzeMacd`, `analyzeVolume`, `analyzeTrend`, `analyzeVolatility`, `analyzeMomentum`, `analyzeSupport`, `analyzeSma`) **hari-per-hari** (rolling window per hari, bukan cuma snapshot hari terakhir seperti di `/api/stock`). `analyzeMarketFlow` diverifikasi saat implementasi apakah butuh data selain OHLCV — kalau ya, disesuaikan atau dikeluarkan dari daftar filter backtest dengan catatan yang sama seperti Foreign Flow.
   Hasilkan deret keputusan `{date, ticker, indicator, decision}` per saham. IHSG (`^JKSE`) diambil & diproses bersamaan sebagai data benchmark alpha.
   Catatan biaya: 100 ticker x 5 tahun history ~2x lebih berat dari perkiraan awal 51 ticker — tetap wajar untuk cron async sekali sehari, tapi runtime cron & permukaan kegagalan-per-ticker jadi lebih besar (lihat "Error handling").

3. **`app/api/cron/backtest-precompute/route.ts`**
   Endpoint cron baru, pola sama seperti `app/api/cron/watchlist-alert` (`verifyQStashSignature`, `withJobRunLog`). Jalan sekali sehari. Panggil precompute service, simpan hasil ke Redis (`shared/cache/redis-cache.ts`) dengan key `sahamlens:cache:computed:backtest-indicators:v1`, TTL ~36 jam (buffer kalau cron sempat telat/gagal sekali).

4. **`modules/backtest/service/simulate.service.ts`**
   Baca deret indikator dari cache. Iterasi hari demi hari sepanjang periode terpilih (3/6/12/24 bulan):
   - Cek posisi terbuka: exit di harga penutupan hari itu begitu salah satu filter terpilih tidak lagi BULLISH untuk saham itu.
   - Cari kandidat baru di slot kosong (maks 5): entry kalau semua filter terpilih BULLISH, ukuran posisi = ekuitas total saat itu / 5 (fixed per slot, dihitung ulang tiap pengisian slot baru — lihat detail compounding di bagian "Keputusan produk").
   - Posisi yang masih terbuka saat periode berakhir **di-force-close** di harga penutupan hari terakhir dan dihitung sebagai trade biasa (bukan diabaikan) — supaya P/L tidak "hilang" dari total return.
   - Equity curve dihitung harian secara internal, disampling per-bulan untuk kompatibilitas dengan bentuk data chart yang sudah ada di frontend (`equityCurve[]` sepanjang `period+1`).
   - Hasilkan: return %, win rate, total trades, max drawdown, alpha vs IHSG, equity curve (strategi + IHSG), daftar trade (tanggal, simbol, harga beli/jual, P/L%).

5. **`app/api/backtest/route.ts`** (rewrite total, ganti logic `Math.random()`)
   Baca cache indikator dari Redis, panggil `simulate.service` dengan `{filters, modal, period}` dari body request. Kalau cache kosong (deploy pertama / cron belum pernah jalan): fallback panggil precompute langsung secara sinkron (lambat, tapi tetap menghasilkan data asli, bukan gagal) — pola sama seperti `market-pulse`/`breakout-radar` yang sudah ada di codebase ini.

### Alur data

```
Cron (harian, QStash)
  -> fetchYahooHistory x 100 saham (backtest-universe.ts) + IHSG (5 tahun OHLCV)
  -> 9 analyzer dijalankan per-hari per-saham (bukan cuma hari terakhir)
  -> Redis: deret keputusan {date, ticker, indicator, decision} + harga penutupan harian
       |
       v
POST /api/backtest {filters, modal, period}
  -> baca cache Redis (fallback: precompute sinkron kalau cache-miss)
  -> simulate.service: entry/exit/position-sizing day-by-day
  -> response: {return, alpha, winRate, totalTrades, maxDD, equityCurve, ihsgCurve, trades}
```

## Error handling & edge case

- **Kombinasi filter tidak pernah cocok (0 trade):** balas metrik nol dengan pesan eksplisit ("Tidak ada saham yang memenuhi kriteria filter ini dalam periode terpilih"), bukan `NaN`/`Infinity` dari pembagian oleh nol saat hitung win rate.
- **Saham baru IPO** (belum listing di sebagian window backtest): dilewati untuk hari-hari sebelum data historisnya mulai, tidak menggagalkan precompute saham itu untuk hari-hari setelahnya.
- **Satu saham gagal fetch dari Yahoo saat cron jalan:** di-skip dengan warning log, 99 saham lain tetap lanjut diproses — satu kegagalan tidak menggagalkan seluruh precompute harian.
- **Modal/alokasi per slot terlalu kecil untuk 1 lot (100 lembar):** sinyal itu dilewati diam-diam, pola sama seperti kasus `finalLot === 0` yang sudah ada di Risk Calculator.
- **Cache-miss di `/api/backtest`:** fallback precompute sinkron (lebih lambat, tapi tetap data asli) — degradasi yang sama seperti pola existing di `market-pulse`/`breakout-radar`, bukan error ke user.

## Testing

- Unit test `simulate.service.ts` dengan deret indikator **sintetis** (input deterministik yang di-construct langsung di test, bukan hit Yahoo Finance asli) — cover: entry/exit dasar, cap 5 slot equal-weight, force-close posisi di akhir periode, kasus 0 trade (tidak ada yang cocok), kasus semua trade menang, kasus semua trade kalah, alpha vs IHSG.
- Unit test `precompute.service.ts` dengan `fetchYahooHistory` di-mock — cover: satu saham gagal fetch tidak menggagalkan saham lain, saham dengan data historis lebih pendek dari window (IPO baru) tidak crash.
- Tidak perlu integration test yang benar-benar hit Yahoo Finance di CI (lambat, flaky, tergantung koneksi eksternal) — cukup unit test dengan data yang sudah di-mock/di-construct.

## Pemetaan filter UI -> analyzer asli

Saat verifikasi exact signature untuk plan implementasi, ditemukan 2 dari 9 nama filter di UI **tidak punya analyzer asli yang cocok** (`'Bollinger Bands'` dan `'Trend Price vs MA200'` tidak dihitung oleh fungsi manapun di `modules/technical`). Diputuskan me-rename 2 filter itu supaya jujur sesuai analyzer yang benar-benar ada, bukan memetakannya diam-diam ke indikator yang berbeda konsepnya. Pemetaan final (9 filter, 1:1 ke 9 dari 10 analyzer di `modules/technical` — `analyzeMomentum`/`'Momentum 1D/5D'` sengaja tidak dipakai filter manapun):

| Nama filter UI (final) | Fungsi analyzer | Catatan |
|---|---|---|
| `EMA 20/50 Cross` | `analyzeEma` | tidak berubah |
| `Volume vs Avg 20D` | `analyzeVolume` | tidak berubah |
| `RSI 14` | `analyzeRsi` | tidak berubah |
| `MACD` | `analyzeMacd` | tidak berubah |
| `Volatility (ATR 14)` | `analyzeVolatility` | **rename dari `'Bollinger Bands'`** — tidak ada analyzer Bollinger Bands asli, ATR adalah analyzer volatilitas terdekat yang ada |
| `MA Trend IDX (20,50,200)` | `analyzeTrend` | tidak berubah |
| `Support & Resistance` | `analyzeSupport` | tidak berubah |
| `Market Flow Index` | `analyzeMarketFlow` | tidak berubah |
| `SMA Score (5,10,20)` | `analyzeSma` | **rename dari `'Trend Price vs MA200'`** — konsep MA200 sudah tercakup di `MA Trend IDX (20,50,200)`, ini analyzer SMA jangka pendek yang sebelumnya nganggur |

Semua analyzer punya signature seragam `analyze(history: OhlcRow[], currentPrice: number) -> {label, value, decision: 'BULLISH'|'BEARISH'|'NEUTRAL', confidence: number}` — dikonfirmasi dari `modules/technical/index.ts` dan isi tiap file analyzer. `analyzeMarketFlow` hanya butuh OHLCV (tidak butuh data eksternal lain), aman dipakai apa adanya di precompute harian.

## Perubahan frontend (`app/backtest/page.tsx`)

- Hapus `'Foreign Flow'` dari array `availableFilters`, dan rename `'Bollinger Bands'` -> `'Volatility (ATR 14)'`, `'Trend Price vs MA200'` -> `'SMA Score (5,10,20)'` (lihat tabel pemetaan di atas). Hasil akhir 9 filter tersisa (dari 10 semula).
- Preset "Bandar Accumulation" (`applyPreset('Accumulation')`), sebelumnya `['Foreign Flow', 'Market Flow Index', 'MACD']`, diganti jadi `['Market Flow Index', 'MACD', 'Volume vs Avg 20D']`.
- Preset "Oversold Bounce" (`applyPreset('Oversold')`), sebelumnya `['RSI 14', 'Bollinger Bands', 'Support & Resistance']`, diganti jadi `['RSI 14', 'Volatility (ATR 14)', 'Support & Resistance']` (ikut rename filter di atas).
- Preset "Bank BUMN Momentum" (`applyPreset('Momentum')`) = `['EMA 20/50 Cross', 'Volume vs Avg 20D', 'RSI 14']` — tidak berubah, tidak memakai filter yang di-rename/dihapus.
- Judul tabel "Simulated Trades (Sample)" diganti jadi "Riwayat Trade" — karena sekarang daftar trade asli hasil simulasi, bukan 5 sampel acak. Tabel menampilkan trade terbaru (dibatasi ~30) dengan catatan jumlah total kalau lebih banyak dari itu.
- Tambah indikator kecil di panel hasil: "Data per [tanggal terakhir cron precompute jalan]" — supaya user tahu ini berbasis data harian (di-update sekali sehari), bukan real-time.
- Tidak ada perubahan pada input Modal Awal / Periode / mekanisme submit (`POST /api/backtest` dengan body yang sama).

## Alternatif yang dipertimbangkan (ditolak)

- **Hitung semua langsung per-request tanpa cache:** lebih sederhana dibangun, tapi fetch+hitung indikator 100 saham x hingga 5 tahun history dalam satu request berisiko sangat lambat/timeout di Vercel serverless (endpoint lain di codebase ini sudah defensif pakai timeout 8 detik untuk SATU saham saja) dan boros/rawan rate-limit Yahoo Finance kalau banyak user pakai backtest bersamaan.
- **Precompute cuma untuk 3 preset yang ada (bukan filter bebas):** lebih murah dihitung, tapi menghilangkan fitur inti "Strategy Builder" (kombinasi filter bebas) yang jadi pembeda halaman ini.

## Scope check

Fokus: satu pipeline kohesif (precompute → cache → simulate → route → frontend tweak minor). Tidak didekomposisi jadi sub-proyek terpisah karena semua komponen saling bergantung dalam satu alur data yang sama dan diimplementasikan sebagai satu unit kerja.
