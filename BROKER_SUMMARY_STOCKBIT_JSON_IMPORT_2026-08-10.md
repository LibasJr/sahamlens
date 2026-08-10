# Broker Summary Stockbit JSON Import — 2026-08-10

## Tujuan
Menambahkan jalur import manual untuk response JSON Broker Distribution yang terlihat di browser pengguna Stockbit, tanpa menyimpan cookie, token, atau kredensial Stockbit.

## Semantik data
Response contoh memiliki `start_date`, `end_date`, `date_info`, `by_value.top_broker_buy`, dan `by_value.top_broker_sell`. Ini adalah agregasi periode, bukan row harian. Karena itu data JSON disimpan ke tabel baru `broker_summary_period`, bukan dipaksakan ke `broker_summary_daily`.

## Flow Admin
Admin → Broker Summary → Stockbit JSON → isi/konfirmasi ticker → paste/upload `.json`/`.txt` → Dry Run & Preview → Import Broker Data.

## Yang disimpan
- start_date / end_date / as_of_date
- ticker
- broker_code
- broker_type (Asing/Lokal/Pemerintah bila tersedia)
- buy_value
- sell_value
- net_value
- source / source_file

`distribute_to` sengaja tidak diproyeksikan menjadi summary row agar tidak mencampur network distribution matrix dengan broker summary sederhana.

## Safety
- admin-only endpoint
- max input 2 MB
- JSON schema validation fail-closed
- ticker wajib dikonfirmasi karena response body tidak membawa symbol
- future date ditolak
- append-only / idempotent via unique key periode+ticker+broker+source
- tidak menyimpan atau meminta Cookie/Authorization Stockbit
- belum memengaruhi LensScore/advisory
