# Pengawas pengumpulan bar intraday

## Kenapa ada

Gerbang **"hari bursa OOS >= 60"** di Intraday Validation Lab dihitung **hanya dari sinyal
yang dibuat setelah protokol dibekukan** (`getIntradayCoverage(..., freezeTimestamp)`).
Gerbang itu karena itu **tidak bisa** dikejar dengan arsip lama — ia hanya bisa dikejar
dengan data baru yang masuk tiap hari bursa.

Masalahnya: `sahamlens-intraday-collect.timer` yang gagal **tidak memberi tahu siapa pun**.
Satu hari bursa terlewat = hitungan 60 hari mundur satu hari, tanpa satu pun tanda merah.
Kejadian nyata yang membuat unit ini ada: 24 September 2026, progres gerbang 8/60 hari
bursa sejak freeze 13 September 2026 (sisa 52 hari bursa) — angka itu tidak pernah terlihat
di mana pun kecuali ditanyakan manual.

## Apa yang diperiksa

1. Job `intraday-collect` sudah `SUCCESS` hari ini? (hanya hari kerja, hanya sesudah 18:00 WIB)
2. `intraday_signals` punya baris untuk tanggal bursa terakhir? Kalau belum, dibedakan
   **libur bursa** (job pasar lain juga tidak jalan) dari **kegagalan** (job pasar lain jalan,
   intraday tidak).
3. Progres gerbang: hari bursa terkumpul setelah freeze vs yang diwajibkan
   (`acceptance_criteria ->> 'minOosTradingDays'`).

## Apa yang TIDAK dilakukan

- Tidak me-restart apa pun.
- Tidak mengubah kriteria, ambang, protokol, atau isi basis data (baca-saja).
- Tidak melaporkan "sehat" kalau `DATABASE_URL` kosong — dalam kasus itu keluar kode 2
  dengan alasan tertulis.

## Hasil

- Semua sehat → `exit 0`, catatan tetap masuk journal.
- Ada masalah → `exit 1`, ringkasan masuk journal **dan** ke `SAHAMLENS_ALERT_WEBHOOK`
  kalau variabel itu diisi.

Periksa manual: `journalctl -u sahamlens-intraday-watchdog -n 50`