# Status Broker Summary — FAIL-CLOSED SETELAH INSIDEN ZERO DUMMY

> Status repo per 2026-08-17. Status timer/runtime VPS harus diverifikasi langsung di server.

## Ringkasan

Broker Summary **tidak boleh menganggap semua row di `broker_summary_daily` sebagai data nyata**.
Source historis `IDX_EOD_REPORT` pernah dipakai oleh generator sintetis dan juga pernah dipakai
sebagai label parser manual. Karena provenance label itu tercemar, row tersebut **diblok dari jalur
publik** sampai audit database selesai.

| Aspek | Status |
|---|---|
| Generator sintetis lama | **dihapus dari working tree** |
| `IDX_EOD_REPORT` | **UNVERIFIED / tidak boleh dibaca publik** |
| Source publik yang diizinkan | `INDEX_ALPHA_API` saja |
| Status source publik | **KNOWN_EXTERNAL_PROVIDER_UNRECONCILED** |
| `hasRealBrokerData` | tidak boleh bernilai true hanya karena row ada |
| Database historis | **belum boleh dianggap bersih tanpa forensic audit** |
| Cron/timer | repo memiliki konfigurasi; **runtime VPS perlu diverifikasi** |

## Aturan Zero Dummy

1. Missing/unverified data tetap unavailable; jangan diubah menjadi angka.
2. Jangan memakai `source='IDX_EOD_REPORT'` sebagai bukti keaslian.
3. Jangan `TRUNCATE`/`DELETE` sebelum fingerprint insiden dan batch import diperiksa.
4. Data provider eksternal harus dilabeli sebagai provider eksternal dan belum direkonsiliasi
   terhadap sumber primer bila rekonsiliasi belum dilakukan.
5. Klasifikasi broker yang tidak ada di mapping internal harus `UNKNOWN`, bukan otomatis
   `DOMESTIC_INSTITUTION`.

## Forensic audit produksi

Jalankan di VPS dengan `DATABASE_URL` yang benar:

```bash
npm run audit:broker-forensics
```

Script tersebut **READ-ONLY** (`BEGIN READ ONLY` + `SELECT` + `ROLLBACK`). Ia memeriksa fingerprint
generator yang diketahui untuk 10–14 Agustus 2026 tanpa menghapus atau mengubah data.

## Hubungan dengan Ownership Flow

**Ownership Flow bukan pengganti Broker Summary.** Broker Summary mengukur transaksi per kode broker,
sedangkan Ownership Flow mengukur komposisi kepemilikan. Keduanya tidak boleh saling diubah label atau
dijadikan substitusi data.
