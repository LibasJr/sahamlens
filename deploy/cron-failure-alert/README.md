# Notifikasi Telegram untuk kegagalan cron

Mengirim notifikasi Telegram tiap kali sebuah unit systemd cron SahamLens masuk
status `failed`. Menutup celah yang dicatat CLAUDE.md/preflight: sebelum ini,
kegagalan cron individual (sync data, scan, backup) hanya terlihat di journal -
tidak ada push apa pun.

## Kenapa terpisah dari uptime-monitor

`deploy/uptime-monitor/` memeriksa kesehatan **aplikasi utama** (proses hidup,
DB/Redis, BUILD_ID vs disk, deployed-sha vs HEAD, restart loop) tiap 5 menit lewat
polling aktif. Skrip ini **reaktif**, dipicu langsung oleh systemd (`OnFailure=`)
saat unit cron individual gagal - keduanya saling melengkapi, bukan duplikat.

| | uptime-monitor | cron-failure-alert (berkas ini) |
|---|---|---|
| Trigger | polling tiap 5 menit | `OnFailure=` systemd, langsung saat gagal |
| Yang diperiksa | app utama sebagai satu kesatuan | tiap unit cron individual |
| Alert channel | webhook generik (opsional, kosong secara default) | Telegram bot yang sudah aktif |
| Throttle | ya (3x gagal beruntun) | tidak - tiap kegagalan cron dikirim |

## Cara kerja

1. Tiap unit target dipasangi drop-in `OnFailure=sahamlens-cron-alert@%n.service`
   di `/etc/systemd/system/<unit>.d/99-cron-failure-alert.conf`.
2. Saat unit itu gagal, systemd menyalakan
   `sahamlens-cron-alert@<nama-unit-terenkode>.service`.
3. Unit itu memanggil `cron-failure-alert.sh <nama-unit>` yang mengambil
   `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` dari `.env.production` (bot yang sama
   dipakai `lib/telegram.ts` untuk notifikasi pembayaran - tidak ada kredensial
   baru) dan mengirim pesan berisi nama unit + potongan journal terakhir.

## Pasang

```bash
bash deploy/cron-failure-alert/install.sh
```

Idempotent - jalankan ulang kapan saja aman, drop-in ditimpa dengan isi yang sama.

## Cakupan

Dipasang ke semua unit cron data/bisnis (sync, scan, collector, backup, worker).
**Sengaja tidak** dipasang ke `sahamlens.service` (app utama - `Restart=always`
sudah menangani, uptime-monitor sudah memeriksa drift/restart-loop),
`sahamlens-uptime-monitor.service` (sudah punya alert + throttle sendiri), dan
`sahamlens-cloudflared-watchdog.service` (auto-heal frekuensi tinggi, bukan
kegagalan yang perlu ditindak manual). Lihat komentar di `install.sh` untuk detail.

## Verifikasi manual

```bash
# Paksa satu unit oneshot gagal untuk uji jalur end-to-end:
sudo systemctl start sahamlens-privacy-cleanup.service
# (kalau perlu unit yang pasti gagal untuk tes, buat unit percobaan terpisah -
# jangan sengaja merusak env unit produksi hanya untuk tes.)

journalctl -u 'sahamlens-cron-alert@*' -n 20 --no-pager
```

Pesan Telegram muncul di chat yang sama dengan notifikasi klaim pembayaran.

## Menambah unit baru

Tambahkan nama unit ke array `TARGET_UNITS` di `install.sh`, jalankan ulang skrip
install. Unit dengan template (`@.service`) otomatis mencakup semua instance-nya.
