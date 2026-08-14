# Watchdog cloudflared

Restart otomatis `cloudflared` kalau tunnel diam-diam berhenti melayani trafik tanpa
proses-nya benar-benar crash/exit (jadi `Restart=on-failure` bawaan systemd tidak pernah
terpicu). Lihat komentar panjang di `cloudflared-watchdog.sh` untuk insiden yang melatari
ini (2026-08-14).

## Cara pasang di VPS

```bash
sudo mkdir -p /opt/sahamlens/scripts
sudo cp cloudflared-watchdog.sh /opt/sahamlens/scripts/cloudflared-watchdog.sh
sudo chmod +x /opt/sahamlens/scripts/cloudflared-watchdog.sh

sudo cp sahamlens-cloudflared-watchdog.service /etc/systemd/system/
sudo cp sahamlens-cloudflared-watchdog.timer /etc/systemd/system/

sudo systemctl daemon-reload
sudo systemctl enable --now sahamlens-cloudflared-watchdog.timer
```

## Verifikasi

```bash
systemctl list-timers --all | grep cloudflared-watchdog
# Tes manual (jangan tunggu jadwal):
sudo /opt/sahamlens/scripts/cloudflared-watchdog.sh; echo "exit: $?"
journalctl -u sahamlens-cloudflared-watchdog.service -n 20 --no-pager
```

## Cara kerja

1. Tiap 2 menit, cek `https://sahamlens.id/api/health` (endpoint publik, sudah ada,
   memvalidasi Cloudflare edge -> tunnel -> nginx -> Next.js -> Postgres sekaligus -
   bukan cuma tunnel-nya).
2. Gagal SEKALI dicatat, TIDAK langsung restart (menghindari restart karena blip jaringan
   sesaat).
3. Gagal DUA KALI berturut-turut (>= ~2-4 menit downtime tergantung timing) -> `systemctl
   restart cloudflared`, lalu counter direset.
4. Berhasil kapan saja -> counter direset ke 0.

Log aksinya ada di `journalctl -u sahamlens-cloudflared-watchdog.service`.
