# Status Broker Summary — IDX OFFICIAL ACTIVE

> Status repo per 2026-09-06. Status timer/runtime VPS tetap harus diverifikasi langsung di server.

## Ringkasan

Broker Summary resmi IDX aktif melalui job `idx-flow-sync`. Endpoint
`TradingSummary/GetBrokerSummary` menghasilkan agregat EOD seluruh pasar per kode broker:
`Value`, `Volume`, dan `Frequency`. Data disimpan ke `broker_market_daily` dengan provenance
`IDX_OFFICIAL_API` dan disajikan melalui `/admin/broker-eod`.

Endpoint resmi tersebut tidak menyediakan ticker maupun pemisahan buy/sell. Karena itu datanya
tidak boleh dipaksakan ke `broker_summary_daily`, tidak dapat menghasilkan net buy per emiten,
dan tidak menggantikan Ownership Flow.

| Aspek | Status |
|---|---|
| Pipeline aktif | `idx-flow-sync` |
| Sumber aktif | `IDX_OFFICIAL_API` |
| Storage aktif | `broker_market_daily` |
| Cakupan | Agregat seluruh pasar per kode broker |
| Field resmi | `Value`, `Volume`, `Frequency` |
| Panel admin | `/admin/broker-eod` |
| Index Alpha | Legacy/nonaktif; bukan prasyarat produksi |
| `broker_summary_daily` historis | Tetap fail-closed; belum boleh dianggap bersih tanpa forensic audit |

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
