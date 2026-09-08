# Monitor storage VPS SahamLens

Memeriksa filesystem root (`/`) setiap 6 jam dan mengirim Telegram hanya saat status berubah:

- `LOW`: ruang bebas kurang dari 20 GB **atau** penggunaan minimal 85%.
- `CRITICAL`: kedua kondisi terjadi bersamaan.
- `OK`: satu notifikasi pemulihan setelah kondisi LOW/CRITICAL.

Tidak ada cleanup otomatis, resize, restart aplikasi, atau perubahan data. Kondisi normal pertama hanya membuat baseline lokal, tanpa Telegram.

## Install

Setelah deploy commit yang memuat artefak ini ke VPS:

```bash
bash deploy/disk-monitor/install.sh
```

Installer idempotent dan memasang:

- `/opt/sahamlens/scripts/disk-monitor.sh`
- `sahamlens-disk-monitor.service`
- `sahamlens-disk-monitor.timer`

Unit menggunakan Telegram bot SahamLens dari `.env.production`, dan kegagalan unit masuk ke pipeline `OnFailure=sahamlens-cron-alert@%n.service` yang sudah ada.

## Verifikasi

```bash
systemctl list-timers sahamlens-disk-monitor.timer --all --no-pager
journalctl -u sahamlens-disk-monitor.service -n 30 --no-pager
```

Untuk uji ambang tanpa mengubah filesystem, jalankan satu kali dengan environment override pada service/terminal terkontrol. Jangan menaikkan ambang produksi untuk sekadar mengirim test alert.

## Konfigurasi

Nilai default berada pada unit service dan dapat diubah lewat drop-in systemd:

- `SAHAMLENS_DISK_MONITOR_PATH=/`
- `SAHAMLENS_DISK_MONITOR_MIN_FREE_GB=20`
- `SAHAMLENS_DISK_MONITOR_MAX_USED_PCT=85`
- `SAHAMLENS_DISK_MONITOR_STATE_DIR=/var/lib/sahamlens/disk-monitor`
