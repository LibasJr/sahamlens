# TP/CL P95 MAE Hotfix

MAE disimpan sebagai nilai negatif. Karena semakin negatif berarti semakin buruk,
ambang 'worst 5% tail' harus memakai percentile 0.05, bukan 0.95.

Perubahan:
- `percentile(maes, 0.95)` -> `percentile(maes, 0.05)`
- label UI diperjelas menjadi `MAE P95 (worst tail)`.

Tidak mengubah TP/CL production, ATR multiplier, RR, LensScore, atau parameter candidate.
