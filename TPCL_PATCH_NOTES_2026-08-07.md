# SahamLens TP/CL Patch — Round 1

## Tujuan
Patch P0 untuk menghilangkan dua sumber kebenaran TP/CL dan memperkeras kualitas stop struktural tanpa mengubah threshold/bobot LensScore.

## Perubahan
1. `buildLongTradingSetup()` tetap menjadi engine TP/CL executable.
2. Support hanya dipakai sebagai basis stop struktural bila memiliki minimal 2 sentuhan.
3. Support satu sentuhan dianggap `WEAK`; engine fallback ke ATR daripada memberi presisi palsu.
4. Tambah metadata `supportQuality`, `nearestSupport`, `riskPct`, `riskAtr`.
5. `cl2` dipertahankan untuk kompatibilitas API, tetapi secara eksplisit deprecated dan diberi alias `emergencyRiskLevel`.
6. `RiskRewardCalculator` tidak lagi menyebut support = SL dan resistance = TP.
   Kartu itu sekarang hanya menampilkan konteks struktur S/R sehingga tidak berkonflik dengan engine TP/CL server-side.
7. Test ditambah untuk confirmation, risk metrics, compatibility dan tick-size.

## Yang sengaja BELUM dilakukan
- Tidak mengubah multiplier 0.25 ATR, 0.75 ATR, 1.5 ATR, TP 2R/3R secara arbitrer.
- Tidak menambahkan max-stop-distance angka tetap sebelum ada validasi empiris.
- Tidak mengubah LensScore/threshold/OOS.
- Tidak menghapus field `cl2` langsung karena masih ada konsumen API/UI lama.

## Tahap berikutnya
TP/CL Validation Lab:
- TP-hit-before-SL
- expectancy
- profit factor
- MAE/MFE
- time-to-hit
- per regime
- parameter grid yang diuji train/validation/OOS (bukan optimize dan apply otomatis)
