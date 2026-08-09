# Test cases yang wajib dicek setelah dipasang di full repo

1. CSV valid -> dry-run tanpa menulis DB.
2. Insert CSV valid -> row tersimpan.
3. Upload file identik kedua kali -> inserted 0, skipped = semua row.
4. Duplicate key di DALAM file -> reject.
5. Tanggal masa depan -> reject.
6. 31 Februari -> reject.
7. Broker code kosong / karakter aneh -> reject.
8. Ticker `BBCA` -> normalisasi `BBCA.JK`.
9. `Rp25,4B` -> 25.400.000.000.
10. buy/sell kosong seluruhnya -> reject.
11. non-admin -> 403.
12. data source berbeda untuk key sama -> boleh coexist.
