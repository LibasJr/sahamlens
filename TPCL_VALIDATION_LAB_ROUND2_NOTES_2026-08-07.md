# SahamLens — TP/CL Validation Lab Round 2

## Status
RESEARCH ONLY. Patch ini tidak mengubah parameter production otomatis.

## Single Source of Truth
`buildLongTradingSetup()` tetap menjadi engine TP/CL tunggal.
Production tanpa override tetap memakai:
- support buffer 0.25 ATR
- min stop distance 0.75 ATR
- fallback 1.5 ATR
- min RR 1.5
- TP1 2R
- TP2 3R

Validation Lab memanggil fungsi yang sama dengan parameter candidate hanya untuk sensitivity test.

## Protocol
- Universe: LensRadar LensScore >= 80
- Liquidity: avg value 20D >= Rp1 miliar
- Score version: SCORE_VERSION aktif
- Price basis: RAW/executable
- Snapshot setup: hanya OHLC sampai tanggal sinyal
- Entry: Open H+1
- Horizon: T+20
- Cost: sama dengan LensRadar round-trip cost
- Corporate-action guard
- TP+SL pada daily bar yang sama => SL first (konservatif)
- Stop gap => exit pada open yang lebih buruk
- Gap H+1 sudah melewati stop/TP1 => trade tidak dibuka

## Metrics
TP1 hit, TP2 reach, SL hit, expectancy, profit factor, median return, MAE, P95 MAE,
MFE, holding time, time-to-TP1, dan breakdown IHSG regime.

## Temporal Split
60% TRAIN / 20% VALIDATION / 20% HOLDOUT berdasarkan tanggal.

PENTING: HOLDOUT ini hanya retrospective diagnostic, BUKAN genuine OOS, karena parameter
baseline sudah dikembangkan dengan akses histori.

## Tidak ada
- auto ranking winner
- auto apply ke production
- auto update parameter
- klaim validated

## URL
/admin/tpcl-validation
