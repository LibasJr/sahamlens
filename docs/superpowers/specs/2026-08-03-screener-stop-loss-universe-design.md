# Stock Screener: Stop Loss & Universe — Design

**Tanggal:** 2026-08-03
**Status:** Menunggu review
**Menyentuh:** `modules/market/service/screener.service.ts`, `app/screener/page.tsx`

## Masalah

Pemeriksaan Stock Screener menemukan dua hal, keduanya soal saran yang tidak berdasar —
bukan bug fungsional. Screener sendiri sehat: datanya asli dari `quoteSummary`, sudah
di-cache 30 menit lewat `getOrCompute()`, dan Bandarmology-nya memakai definisi CMF yang
sama dengan AI Pick.

### 1. Stop loss yang disarankan terbukti merugikan

`rankScreener()` menampilkan kolom `stop_loss` yang dihitung dari persentase tetap per
profil risiko: **5%** (Konservatif), **8%** (Moderat), **12%** (Agresif).

Pengujian atas 4.705 sampel (109 saham, 5 tahun, entry di open hari berikutnya, exit dicek
pakai High/Low harian, biaya 0,8% sekali putar, tahan maksimal 60 hari bursa):

| Cara stop | Net/trade | Menang | Kena stop | Rugi terburuk |
|---|---|---|---|---|
| tanpa stop | **+1,34%** | 41% | — | **-83,1%** |
| tetap 5% *(Konservatif)* | +0,02% | 20% | **77%** | -5,8% |
| tetap 8% *(Moderat)* | +0,30% | 28% | 64% | -8,8% |
| tetap 12% *(Agresif)* | +0,11% | 33% | 50% | -12,8% |
| ATR x1,5 | +0,23% | 19% | 79% | -34,9% |
| ATR x2 | +0,17% | 24% | 71% | -46,3% |
| ATR x3 | +0,09% | 30% | 58% | -53,7% |

ATR 14 rata-rata **3,65% dari harga**, jadi stop 5% hanya 1,4x pergerakan harian normal —
itulah sebabnya tersentuh di 77% transaksi. Angka yang diberikan ke profil **Konservatif**
justru yang paling merusak: memangkas hampir seluruh keuntungan (+0,02%) tanpa pengguna
tahu bahwa itu yang terjadi.

Stop berbasis ATR **tidak** lebih baik — dugaan awal keliru. ATR x2 (+0,17%) kalah dari
stop tetap 8% (+0,30%), dan ekor ruginya jauh lebih dalam karena stop yang lebar bisa
dilewati gap pembukaan.

Yang benar disimpulkan bukan "stop itu buruk", melainkan **stop menukar return dengan
perlindungan ekor**. Tanpa stop menghasilkan return terbaik tapi menanggung risiko -83%.
Trade-off itu keputusan pengguna, bukan sesuatu yang pantas diputuskan sepihak oleh sebuah
kolom tabel.

### 2. Lima saham di universe tidak layak direkomendasikan

`SCREENER_UNIVERSE` (51 saham) memuat lima yang tidak lolos standar kualitas yang dipakai
universe Backtest dan AI Pick:

| Ticker | Sebab |
|---|---|
| GOTO | harga rata-rata Rp 50 — tick 1 rupiah = spread 2% |
| BUKA | harga rata-rata Rp 115 |
| MEGA | transaksi Rp 185 juta/hari |
| BYAN | transaksi Rp 965 juta/hari |
| SILO | transaksi Rp 680 juta/hari |

Kelimanya bisa muncul di 10 besar dan direkomendasikan untuk dibeli.

Universe itu dipakai empat fitur: `/api/screener`, `/api/compare`,
`dividend-plan.service.ts`, dan `corporate-calendar.service.ts`. Membuang kelima saham dari
konstantanya akan menghilangkan mereka dari **semua** fitur — padahal Compare, Dividend, dan
Calendar adalah alat pencarian, bukan pemberi rekomendasi. Pengguna berhak membandingkan
GOTO atau melihat jadwal dividennya.

## Keputusan

**Saring hanya di titik yang merekomendasikan.** Screener memilih dari universe tersaring;
fitur pencarian tetap melihat daftar luas.

**Ganti kolom stop loss dengan informasi volatilitas.** Screener berhenti memberi angka
yang terdengar otoritatif, dan mulai memberi tahu ruang gerak wajar saham supaya pengguna
bisa memutuskan sendiri.

## Arsitektur

```
fetchScreenerUniverse()  →  ambil 114 saham (SCREENER_UNIVERSE ∪ universe tersaring)
                            cache 30 menit, satu key
                              │
        ┌─────────────────────┴──────────────────────┐
        │                                            │
   rankScreener()                              /api/compare
   saring ke 109 tersaring                     pakai semua 114
   → GOTO/BUKA/MEGA/BYAN/SILO                  (melebar dari 51)
     tidak bisa direkomendasikan
```

Gabungan kedua universe tepat **114** saham, dan selisihnya persis kelima saham bermasalah
itu. Satu pengambilan data melayani keduanya — tidak ada 46 saham yang diambil dua kali.

`SCREENER_UNIVERSE` **tidak diubah**, sehingga Corporate Calendar dan Dividend berperilaku
persis seperti sekarang. Keduanya di luar cakupan perubahan ini.

### Komponen

**`CURATED_TICKERS`** — daftar ticker yang boleh direkomendasikan, isinya sama dengan
`AI_PICK_UNIVERSE` (109 emiten: harga >= Rp 200, transaksi >= Rp 1 M/hari, volatilitas
<= 120%/tahun). Di-import, bukan disalin, karena keduanya menjawab pertanyaan yang sama:
"saham ini layak direkomendasikan atau tidak".

**`filterCurated(universe)`** — fungsi murni, menyaring `RawStock[]` ke yang ada di
`CURATED_TICKERS`. Dipanggil di awal `rankScreener()`, sebelum perhitungan skor apa pun.
Perbandingan ticker dinormalisasi karena `RawStock.ticker` sudah dibuang akhiran `.JK`.

**`atr14Pct(ohlcv)`** — fungsi murni, mengembalikan ATR 14 sebagai persen dari harga
terakhir, atau `null` kalau bar < 15. Dihitung dari OHLCV yang **sudah** diambil
`fetchOne()` untuk Bandarmology (`range=1mo`, ~21 bar) — tidak ada request tambahan.

## Perubahan tampilan

| Sebelum | Sesudah |
|---|---|
| Kolom **"Stop Loss"** berisi harga, mis. `4750` | Kolom **"Volatilitas Harian"** berisi `±3,6%/hari` |
| `stop_loss: number` di respons | `atr_pct: number \| null` di respons |

Keterangan di bawah tabel:

> Rata-rata pergerakan harian 14 hari terakhir. Stop di bawah angka ini akan sering
> tersentuh fluktuasi biasa — pengujian kami atas 4.705 sampel menunjukkan stop 5%
> tersentuh di 77% transaksi dan memangkas hampir seluruh keuntungan.

Konstanta `stopLossPct` (0,05 / 0,08 / 0,12) dihapus seluruhnya. Kolom `entry` tetap —
itu harga sekarang, fakta, bukan saran.

Profil risiko **tetap berfungsi seperti sekarang** dan tidak diubah: bobotnya sudah
berbeda secara berarti (Konservatif memberatkan DER 35% + dividen 30% dengan bobot
pertumbuhan nol; Agresif kebalikannya). Yang dihapus hanya stop loss-nya.

## Penanganan kegagalan

| Kondisi | Perilaku |
|---|---|
| Histori < 15 bar | `atr_pct: null` → UI tampil "N/A", baris tetap muncul |
| Cache lama tanpa field `atr_pct` | Diperlakukan sebagai null, bukan error |
| Semua saham tersaring habis | Kembalikan array kosong; UI menampilkan "Tidak ada saham yang memenuhi kriteria", bukan tabel kosong tanpa penjelasan |
| Ticker ada di cache tapi tidak di `CURATED_TICKERS` | Dilewati diam-diam — memang itu tujuan penyaringan |

## Pengujian

Ditulis lebih dulu, masing-masing harus gagal sebelum implementasi ada:

1. `atr14Pct()` menghitung benar untuk deret OHLCV yang diketahui hasilnya.
2. `atr14Pct()` mengembalikan `null` kalau bar kurang dari 15.
3. `filterCurated()` membuang GOTO, BUKA, MEGA, BYAN, SILO.
4. `filterCurated()` mempertahankan saham yang ada di daftar tersaring.
5. `rankScreener()` tidak pernah mengembalikan ticker di luar `CURATED_TICKERS`, meski
   universe masukan memuatnya.
6. `rankScreener()` mengembalikan array kosong kalau seluruh universe tersaring habis —
   bukan melempar error.
7. Hasil `rankScreener()` memuat `atr_pct` dan **tidak** lagi memuat `stop_loss`.

## Yang sengaja tidak dikerjakan

- **`SCREENER_UNIVERSE` tidak diubah.** Corporate Calendar dan Dividend tetap memakai 51
  saham yang sama seperti sekarang.
- **Bobot profil risiko tidak disentuh.** Tidak ada bukti bahwa bobotnya bermasalah, dan
  mengubahnya tanpa pengujian akan mengulang kesalahan yang spec ini justru perbaiki.
- **Tidak menambahkan stop loss versi baru.** Pengujian menunjukkan tidak ada varian yang
  memperbaiki hasil; menyodorkan angka lain hanya mengganti tebakan dengan tebakan.
- **Backtest dan AI Pick tidak disentuh.**
