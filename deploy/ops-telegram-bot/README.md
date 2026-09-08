# SahamLens Visual Ops Bot

`@LensOps_bot` adalah bot khusus operasi SahamLens. Bot ini tidak memakai bot
produk/pembayaran dan tidak mengirim ringkasan teks biasa: dashboard, alert cron,
dan alert storage selalu berupa kartu PNG dengan tombol inline.

## Ruang lingkup

- Dashboard visual: aplikasi, API/data, storage, dan unit job yang gagal.
- Tombol: `Refresh dashboard`, `Storage`, `App health`, `Job status`.
- Perintah yang setara: `/start`, `/storage`, `/health`, `/jobs`.
- Alert visual: kegagalan cron dan transisi status disk.
- Tidak ada tombol destructive, restart, deploy, cleanup, atau akses shell dari
  Telegram. Tindakan produksi tetap mengikuti workflow SahamLens yang diaudit.

Bot memakai long polling sehingga tidak membutuhkan webhook publik. Pesan dan tombol
hanya dilayani untuk `TELEGRAM_OPS_CHAT_ID`; chat lain diabaikan tanpa respons.

## Konfigurasi

Isi hanya di `/opt/sahamlens/app/.env.production` (jangan commit):

```dotenv
TELEGRAM_OPS_BOT_TOKEN=<token-bot-ops>
TELEGRAM_OPS_CHAT_ID=<chat-id-operator>
```

`TELEGRAM_BOT_TOKEN` dan `TELEGRAM_CHAT_ID` lama sengaja tidak dibaca oleh bot Ops.
Mereka tetap khusus untuk notifikasi produk/pembayaran.

## Instalasi setelah deploy

```bash
cd /opt/sahamlens/app
bash deploy/ops-telegram-bot/install.sh
bash deploy/cron-failure-alert/install.sh
bash deploy/disk-monitor/install.sh
```

Installer membutuhkan `python3-pil` pada OS untuk merender kartu PNG. Ia hanya
membuat service non-destructive dan tidak memodifikasi service aplikasi utama.

## Verifikasi

```bash
systemctl is-active sahamlens-ops-telegram-bot.service
journalctl -u sahamlens-ops-telegram-bot.service -n 30 --no-pager
```

Kirim `/start` ke bot Ops. Respons yang benar berupa foto dashboard SahamLens dan
tombol inline, bukan pesan teks polos.
