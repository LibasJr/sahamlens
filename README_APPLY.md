# Apply SahamLens Quant Patch Round 2.1

Basis: branch `quant-validation` setelah Round 2.

1. Extract ZIP ini.
2. Copy seluruh isi folder hasil extract ke root repository lokal `sahamlens` pada branch `quant-validation`.
3. Pilih Replace/Overwrite untuk file yang sama.
4. GitHub Desktop harus mendeteksi 3 file source/test berubah + note baru.
5. Commit message yang disarankan:
   `Make LensRadar validation reproducible`
6. Push origin.
7. Tunggu Vercel Preview status Ready.
8. Buka Calibration Lab dan cek blok `Audit reproducible · rv-2.1`.

Expected behavior: refresh berkali-kali pada dataset yang sama harus mempertahankan dataset hash, bootstrap CI, dan permutation p-value yang sama.
