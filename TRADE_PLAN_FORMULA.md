# TradePlan v1.0

TradePlan v1.0 adalah metodologi TP/CL produksi untuk rencana long SahamLens.
Tujuannya bukan memprediksi harga pasti, tetapi membentuk rencana risiko yang
auditable dari data historis yang benar-benar tersedia.

## Kontrak Utama

- Versi model: `TRADE_PLAN_V1_0`.
- Entry reference: `OPEN_H_PLUS_1`.
- Dasar CL: struktur support terkonfirmasi + ATR 14.
- Dasar TP: resistance struktural dan risk/reward.
- Minimal risk/reward: `1.5`.
- Fraksi harga: dibulatkan ke tick size IDX.
- Tidak ada Broker Summary.
- Tidak ada CMF sebagai input TradePlan.
- Tidak ada angka dummy. Jika input tidak tersedia, output menandai `NOT_AVAILABLE`
  dan mencatatnya di `missingData`.

## Input

| Input | Sumber | Status |
|---|---|---|
| Support/resistance struktural | OHLC harga | Wajib untuk setup struktur |
| ATR 14 | OHLC harga | Wajib |
| Risk/reward | Turunan entry, CL, TP | Wajib |
| ADX/DMI | OHLC harga | Opsional, masuk confidence |
| Bollinger %B | Harga adjusted | Opsional, masuk confidence |
| Volume ratio 20D | Volume OHLC | Opsional, masuk confidence |
| Foreign flow IDX 20D | IDX official foreign flow | Opsional, masuk confidence |

## Output

TradePlan mengembalikan:

- `entryReference`
- `entry`
- `stopLoss`
- `cutLoss`
- `takeProfit1`
- `takeProfit2`
- `riskReward`
- `riskPercent`
- `riskAtr`
- `riskLevel`
- `confidenceScore`
- `confidenceLevel`
- `reasons`
- `missingData`
- `caveats`
- `dataPoints`

## Fail-Closed

TradePlan mengembalikan `null` bila:

- histori harga tidak cukup,
- harga sekarang tidak valid,
- ATR tidak tersedia,
- CL tidak berada di bawah entry,
- resistance terdekat membuat RR kurang dari minimum.

Kondisi di atas sengaja tidak diisi fallback karena fallback numerik pada TP/CL
akan terlihat seperti rekomendasi harga nyata.
