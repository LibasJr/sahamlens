# Rencana Validasi Ownership Flow

Status sekarang: **Phase 1 — raw metrics only.**

```
experimental  = true
inFinalScore  = false
```

Ownership Flow **tidak ikut menghitung LensScore** dan tidak akan ikut sebelum
lolos validasi di dokumen ini.

---

## Kenapa belum masuk skor

Tidak ada satu pun bukti — di SahamLens maupun di literatur yang kita verifikasi
sendiri — bahwa perubahan komposisi kepemilikan pada horizon pendek memprediksi
imbal hasil saham IDX. Memasukkan faktor yang belum diuji ke dalam skor
advisory berarti mengubah keputusan pengguna berdasarkan tebakan.

Prinsip yang berlaku:

> Lebih baik "Eksperimental — tidak masuk LensScore" daripada memasukkan faktor
> yang belum tervalidasi.

---

## Fase

### Phase 1 — sekarang

- Kumpulkan snapshot historis sejak tanggal implementasi
- Tampilkan angka mentah + delta (pp) + tanggal observasi + sumber
- Klasifikasi tren: **`DATA_ONLY`** — ambang belum divalidasi
- Tidak ada skor, tidak ada BUY/SELL

`OWNERSHIP_TREND_THRESHOLDS_VALIDATED = false` di
`modules/ownership-flow/scoring/ownership-flow-classification.ts`, dijaga oleh
test yang sengaja gagal bila seseorang menyalakannya tanpa audit.

### Phase 2 — audit distribusi (prasyarat pelabelan)

Sebelum label "akumulasi/distribusi" boleh muncul sama sekali:

1. Kumpulkan minimal beberapa bulan observasi lintas universe
2. Hitung distribusi historis delta kepemilikan (per horizon)
3. Tentukan ambang dari **persentil yang terukur**, bukan angka bulat yang enak
   dibaca
4. Catat persentil dan ukuran sampel yang dipakai
5. Baru set `OWNERSHIP_TREND_THRESHOLDS_VALIDATED = true` beserta ambangnya

### Phase 3 — validasi prediktif (prasyarat masuk skor)

Uji minimal:

```
delta kepemilikan  →  forward return
horizon: 1D, 5D, 10D, 20D
```

dengan syarat yang tidak boleh ditawar:

- **Point-in-time murni** — pakai `asOfObservation()`, yang tidak pernah
  mengembalikan baris ber-`observed_date` setelah tanggal keputusan
- **Tanpa look-ahead** — termasuk tidak memakai observasi yang baru dipublikasi
  setelah tanggal keputusan
- **Survivorship awareness** — emiten delisting tidak boleh hilang dari sampel
- **Ukuran sampel dilaporkan** — bukan hanya rata-rata imbal hasil
- **Kalender transaksi** — forward return dihitung pada hari bursa nyata
- **Out-of-sample** — periode uji terpisah dari periode penentuan ambang

Bahan yang sudah tersedia untuk itu: `asOfObservation()`, `listOwnershipHistory()`,
dan `computeDeltaSet()` (fungsi murni, bebas I/O — bisa dipanggil langsung dari
harness backtest).

### Phase 4 — integrasi skor (hanya jika Phase 3 lulus)

Kalau — dan hanya kalau — Phase 3 menunjukkan hubungan yang bertahan
out-of-sample:

1. Bawa ke Calibration Lab bersama faktor lain
2. Tentukan bobot lewat optimizer yang sudah ada, bukan dipilih manual
3. Ubah `inFinalScore` menjadi `true` **dalam commit yang memuat bukti backtest**
4. Perbarui halaman Transparansi

Kalau Phase 3 **tidak** lulus: Ownership Flow tetap di Phase 1 selamanya sebagai
evidence layer. Itu hasil yang sah, bukan kegagalan.

---

## Yang tidak boleh diklaim sebelum Phase 3

- ❌ "Akumulasi asing memprediksi kenaikan harga"
- ❌ "Kepemilikan asing naik → sinyal beli"
- ❌ Skor 0–100 apa pun yang masuk ke keputusan advisory

Yang boleh, sekarang juga:

- ✅ "Kepemilikan asing per 15 Agu 2026: 42,75%"
- ✅ "Naik 0,51 pp dibanding snapshot 7 hari sebelumnya"
- ✅ "Konsisten dengan akumulasi" (deskriptif)
