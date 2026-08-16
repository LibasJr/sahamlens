# Market Data Reconciliation (D-1 phase 1)

SahamLens membandingkan **harga penutupan pada tanggal perdagangan yang sama** dari dua sumber dan menyimpan buktinya. Aturan v1 sengaja ketat: harga harus sama persis. Jika berbeda, ticker berstatus `MISMATCH` dan UI menyatakan **data sedang diperiksa**; sistem tidak memilih angka yang "terlihat lebih masuk akal".

## Sumber

- Primary operational source: Yahoo Chart (`YAHOO_CHART`).
- Secondary verification source: halaman Stock Summary Bursa Efek Indonesia (`IDX_PUBLIC_STOCK_SUMMARY`), **verification-only**.

Secondary public endpoint bukan pengganti kontrak data. Untuk menutup sisi lisensi D-1 secara penuh, gunakan produk EoD IDX / redistributor berlisensi dan pertahankan kontrak interface reconciliation yang sama.

## Failure policy

- Sumber pembanding gagal: fitur utama tetap berjalan, health menjadi degraded dan tidak ada klaim `verified` baru.
- Yahoo 403/429/repeated failure: circuit breaker menghentikan repeated outbound calls sementara.
- Secondary public comparator adalah **verify-only** dan tidak disajikan ulang sebagai fallback harga publik. Jika Yahoo gagal dan tidak ada cache operasional yang sah, endpoint tetap fail-closed (`503`/`N/A`).
- Mismatch: tidak ada auto-correction, tidak masuk sebagai bukti akurasi, UI memperingatkan pengguna.

## Interpretasi coverage

`match_count / compared_count` hanya mengukur pasangan yang benar-benar tersedia dari kedua sumber. UI publik juga menampilkan `compared_count / universe_count` agar match-rate tinggi pada coverage rendah tidak menyesatkan. `PRIMARY_ONLY`, `SECONDARY_ONLY`, dan `NO_DATA` adalah gap, bukan match.

## Environment

```env
MARKET_RECON_ENABLED=true
MARKET_RECON_UNIVERSE_LIMIT=200
MARKET_RECON_YAHOO_CONCURRENCY=4
IDX_PUBLIC_STOCK_SUMMARY_URL=https://www.idx.co.id/umbraco/Surface/TradingSummary/GetStockSummary
PROVIDER_CIRCUIT_FAILURE_THRESHOLD=5
PROVIDER_CIRCUIT_OPEN_SEC=900
```

`IDX_PUBLIC_STOCK_SUMMARY_URL` adalah comparator operasional dari situs IDX, bukan kontrak redistribusi. Jika endpoint menolak otomasi (mis. HTTP 403/429), circuit breaker akan menghentikan request berulang dan reconciliation gagal-tertutup. Jangan mengganti dengan aggregator acak hanya agar status hijau.

## Install VPS

1. Jalankan migration `007_market_data_reconciliation.sql` lewat migration runner SahamLens.
2. Restart aplikasi setelah build/CI lolos.
3. Pasang timer: `bash deploy/market-data-reconcile/install.sh`.
4. Test manual: `sudo systemctl start sahamlens-market-data-reconcile.service`.
5. Audit: `node --env-file=.env.production scripts/audit-market-data-reconciliation.mjs`.
6. Lihat `/admin/data-integrity` dan `/transparency`.
