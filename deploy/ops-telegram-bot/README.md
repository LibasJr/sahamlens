# SahamLens Native Visual Ops Bot

`@LensOps_bot` adalah bot operasi khusus SahamLens. Semua dashboard dan alert
menggunakan pesan Telegram-native: icon/emoji, indikator status, bar visual, dan
tombol inline. Bot **tidak mengirim foto atau PNG**.

## Tampilan

- `🖥️ APPLICATION` — proses aplikasi.
- `💓 API & DATA` — API lokal, database, Redis, dan sumber data.
- `💾 STORAGE` — pemakaian root filesystem dengan bar penggunaan aktual.
- `📊 SCHEDULED JOBS` — ringkasan unit SahamLens yang gagal.
- `🟢 / 🟡 / 🔴 / 🚨` — status sehat, perlu perhatian, gagal, dan kritis.
- Tombol native: `🔄 Refresh`, `💾 Storage`, `💓 Health`, `📊 Jobs`.

Tidak ada tombol destructive, restart, deploy, cleanup, atau shell dari Telegram.
Aksi produksi tetap mengikuti workflow SahamLens yang diaudit.

## Keamanan

- Long polling: tidak ada webhook publik.
- Hanya `TELEGRAM_OPS_CHAT_ID` yang dilayani; chat lain diabaikan.
- Bot Ops memakai token sendiri, terpisah dari bot produk/pembayaran.

## Konfigurasi

Isi hanya di `/opt/sahamlens/app/.env.production` (jangan commit):

```dotenv
TELEGRAM_OPS_BOT_TOKEN=<token-bot-ops>
TELEGRAM_OPS_CHAT_ID=<chat-id-operator>
```

`TELEGRAM_BOT_TOKEN` dan `TELEGRAM_CHAT_ID` lama sengaja tidak dibaca oleh bot Ops.

## Instalasi setelah deploy

```bash
cd /opt/sahamlens/app
bash deploy/ops-telegram-bot/install.sh
bash deploy/cron-failure-alert/install.sh
bash deploy/disk-monitor/install.sh
```

## Verifikasi

```bash
systemctl is-active sahamlens-ops-telegram-bot.service
journalctl -u sahamlens-ops-telegram-bot.service -n 30 --no-pager
```

Kirim `/start` ke bot Ops. Respons yang benar adalah pesan native bericon dan tombol
inline, tanpa lampiran gambar.