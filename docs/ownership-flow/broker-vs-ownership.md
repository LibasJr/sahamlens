# Broker Summary vs Ownership Flow

Dokumen ini ada karena satu kesalahan penalaran sangat mudah terjadi dan sangat
sulit terdeteksi setelah masuk ke produk:

> "Kepemilikan asing naik → berarti broker asing membeli."

**Kesimpulan itu tidak valid.** Dokumen ini menjelaskan kenapa, dan menetapkan
batas bahasa yang wajib dipatuhi UI, API, dan LensAI.

---

## 1. Dua besaran yang berbeda

| | Broker Summary | Ownership Flow |
|---|---|---|
| Yang diukur | **Transaksi** per kode broker pada satu hari bursa | **Komposisi kepemilikan** efek pada satu tanggal observasi |
| Satuan | Lot / nilai rupiah, beli & jual per broker | Persentase kepemilikan (lokal, asing, scripless) |
| Sumbernya | Rekap perdagangan bursa per broker | Posisi tercatat di kustodian (KSEI) |
| Pertanyaan yang dijawab | "Siapa yang bertransaksi hari ini?" | "Siapa yang memegang, per tanggal ini?" |
| Frekuensi | Harian (hari bursa) | Mengikuti cadence publikasi kustodian |
| Status di SahamLens | **Nonaktif** (ingestion manual) | **Aktif sebagai evidence layer, eksperimental** |

---

## 2. Kenapa kenaikan porsi asing ≠ pembelian oleh asing

Porsi kepemilikan asing adalah **rasio**:

```
foreign_pct = saham dimiliki asing / total saham tercatat
```

Rasio ini bisa naik tanpa satu pun pembelian baru oleh investor asing:

1. **Perpindahan antar-asing.** Pemegang lokal menjual ke investor asing yang
   sudah ada. Porsi asing naik, tetapi tidak ada "broker asing X" yang bisa
   ditunjuk dari data ini.
2. **Perubahan penyebut.** Buyback, delisting sebagian, atau perubahan jumlah
   saham tercatat mengubah rasio tanpa transaksi apa pun di pembilangnya.
3. **Reklasifikasi kustodian.** Perubahan pencatatan status pemegang (lokal ↔
   asing) mengubah angka tanpa peristiwa pasar.
4. **Aksi korporasi.** Right issue, private placement, konversi — semuanya
   menggeser komposisi di luar mekanisme perdagangan reguler.

Sebaliknya: broker asing yang net buy besar **tidak selalu** menaikkan porsi
kepemilikan asing — banyak broker asing mengeksekusi order untuk nasabah lokal.

**Kode broker menandai siapa yang mengeksekusi, bukan siapa yang memiliki.**

---

## 3. Batas bahasa yang wajib

### Dilarang

- "Asing sedang beli / jual"
- "Broker asing X mengakumulasi"
- "Net buy asing sebesar ..."
- Menyebut nama/kode broker mana pun dari data Ownership Flow
- Menurunkan rekomendasi beli/jual dari perubahan kepemilikan

### Diizinkan

- "Kepemilikan asing naik 0,51 pp dibanding snapshot sekitar 7 hari sebelumnya"
- "Konsisten dengan akumulasi" (deskriptif, bukan klaim transaksi)
- "Porsi kepemilikan asing per 15 Agu 2026 adalah 42,75%"

Aturan ini ditegakkan di tiga tempat, bukan sekadar dituliskan di sini:

- `app/api/chat/blocks/ownership-flow-blocks.ts` — instruksi eksplisit ke model
- `modules/ownership-flow/scoring/ownership-flow-classification.ts` — tidak ada
  label transaksi dalam enum tren, dan ada test yang menjaganya
- `components/ownership-flow/OwnershipFlowCard.tsx` — pembeda tercetak tepat di
  bawah angkanya, bukan hanya di dokumentasi

---

## 4. Percentage point (pp) vs persen

Perubahan kepemilikan **selalu** dinyatakan dalam percentage point.

```
40,00%  →  41,00%
  = +1,00 pp          (selisih absolut)
  = +2,50% relatif    ((41 - 40) / 40)
```

UI dan API memakai **pp**. Menuliskannya sebagai "%" membuat pembaca
menyimpulkan besaran yang salah — dan pada contoh di atas, salahnya 2,5×.

Field API bernama `deltaUnit: "percentage_point"` justru agar konsumen pihak
ketiga tidak perlu menebak.

---

## 5. Kenapa Broker Summary tetap disimpan

Broker Summary **tidak dihapus**: kode, skema database, dan seluruh data
historisnya utuh. Yang dilakukan hanya menonaktifkan ingestion-nya, karena
sumber yang tersedia menuntut upload berkas manual per emiten — tidak scalable
untuk ratusan ticker.

Ownership Flow **bukan penggantinya**. Keduanya menjawab pertanyaan berbeda, dan
ketika sumber broker summary yang legal, stabil, serta dapat diotomasi tersedia,
fitur itu dapat diaktifkan kembali tanpa kehilangan apa pun.

Lihat `docs/ownership-flow/broker-summary-status.md`.
