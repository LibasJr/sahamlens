# SahamLens — Admin Broker Summary Upload

Patch ini menambahkan alur pengumpulan **broker-level daily data** melalui:

`Admin -> Broker Summary -> Upload / Paste CSV -> Dry Run -> Import`

## Yang sengaja TIDAK dilakukan

- Tidak mengubah LensScore 40/30/30.
- Tidak mengganti CMF/Yahoo menjadi nama "Broker Flow".
- Tidak membuat BUY/SELL dari broker data.
- Tidak mengklaim file Stockbit sebagai feed resmi IDX.
- Tidak otomatis scraping/login Stockbit.

Tujuan fase ini adalah **mengumpulkan histori bersih dan auditable dahulu**.

## File baru

- `app/admin/broker-summary/page.tsx`
- `app/admin/broker-summary/BrokerSummaryUploadClient.tsx`
- `app/api/admin/broker-summary/import/route.ts`
- `modules/broker-flow/index.ts`
- `modules/broker-flow/service/broker-summary-import.service.ts`

## File existing yang perlu edit kecil

Lihat:
`components/Sidebar.BROKER-SUMMARY.patch.txt`

Jangan overwrite Sidebar penuh.

## Format CSV

Minimum:

```csv
trade_date,ticker,broker_code,buy_value,sell_value,buy_lot,sell_lot,buy_avg,sell_avg
2026-08-10,BBCA,YP,25400000000,8300000000,39500,12900,6430,6420
```

Alias yang diterima antara lain:
- `ticker / symbol / code / kode`
- `trade_date / date / tanggal`
- `broker_code / broker / kode_broker`
- `buy_value / buy`
- `sell_value / sell`
- `buy_lot / sell_lot`
- `buy_avg / sell_avg`

Value juga bisa membaca bentuk umum seperti `Rp25,4B`, `25.4B`, `800M`,
tetapi format raw integer tetap paling aman.

## Database

Saat import INSERT pertama, service membuat tabel secara idempoten:

`broker_summary_daily`

Unique:
`(trade_date, ticker, broker_code, source)`

Ini sengaja memasukkan `source`, sehingga suatu hari data Stockbit bisa dibandingkan
dengan vendor/API lain tanpa overwrite.

## Semantik source

Default:
`STOCKBIT_MANUAL`

Gunakan `IDX_MANUAL` hanya jika file memang berasal dari sumber IDX yang sah.
Jangan beri label `OFFICIAL` hanya karena datanya broker-level.

## Security integration point

API patch melakukan server-side authorization menggunakan session `role === 'admin'`.

Snapshot source yang tersedia saat patch dibuat menunjukkan SahamLens juga mempunyai
legacy signed admin-cookie (`sahamlens_admin`) untuk `/admin-login/key`, tetapi helper
verifikasinya tidak tersedia sebagai file yang dapat diedit pada sesi ini.

Jika production Anda masih mengandalkan legacy admin-cookie untuk akun non-admin,
samakan fungsi `requireAdmin()` di route baru dengan helper server yang dipakai oleh
`app/api/admin/...` existing / `isAdminServer()` existing. **Jangan** menghapus
authorization server-side.

## Setelah copy ke repo

Jalankan:

```bash
npm run typecheck
npm run build
```

Lalu login sebagai ADMIN dan buka:

`/admin/broker-summary`

Tes pertama sebaiknya hanya 2–10 row, jalankan Dry Run, baru Import.

## Fase berikutnya setelah histori terkumpul

Baru bangun analytics terpisah:
- Net Buy 1D / 3D / 5D / 10D / 20D
- Accumulation / Distribution Streak
- Broker concentration
- Top accumulator / distributor
- Broker consistency
- Estimated average entry
- PIT backtest terhadap forward return

Tidak ada komponen di atas yang seharusnya masuk LensScore sebelum diuji.
