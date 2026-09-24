# Deploy otomatis berbasis tarik (pull)

## Kenapa bukan GitHub Actions lagi

Sampai 2026-09-24 deploy produksi dipicu `Deploy VPS` (`.github/workflows/deploy-vps.yml`) lewat
SSH dari runner GitHub ke VPS memakai terowongan Cloudflare:

```
ssh -o ProxyCommand="cloudflared access ssh --hostname <host>" lens@<host> deploy --force
```

Jalur itu bergantung pada tiga hal di luar repo: runner GitHub bisa keluar jaringan, terowongan
Cloudflare hidup, dan `cloudflared access` di runner berhasil. Kegagalannya berbentuk:

```
Connection timed out during banner exchange
Connection to UNKNOWN port 65535 timed out
```

Hasilnya lampu merah di GitHub padahal produksi sehat, lalu deploy harus dijalankan manual -
dan riwayat deploy jadi tidak lagi tercatat di tempat yang sama dengan riwayat kode.

Skrip ini membalik arahnya: **VPS yang menarik**, bukan GitHub yang mendorong. Tidak ada SSH
masuk, tidak ada kunci deploy di GitHub, tidak ada terowongan yang harus hidup.

## Cara kerjanya

`sahamlens-auto-deploy.timer` berjalan tiap 5 menit dan memanggil `auto-deploy.sh`:

1. `git fetch origin main`, bandingkan dengan SHA yang benar-benar selesai di-deploy
   (`/opt/sahamlens/deployed-sha`, ditulis oleh `deploy-sahamlens` setelah restart + health check).
   Sama → keluar tanpa tindakan.
2. Gerbang CI: baca check-runs untuk SHA itu dari GitHub. Yang dinilai hanya pemeriksaan selain
   `deploy` dan `ci-cancelled-guard`.
   - ada yang masih berjalan → tunggu tik berikutnya;
   - ada yang gagal/dibatalkan/timeout → **jangan deploy**, kirim alarm (sekali per SHA);
     jenis `cancelled` dijalankan ulang sekali otomatis, menggantikan peran job
     `ci-cancelled-guard` yang lama;
   - semua hijau → lanjut;
   - tidak ada check-run sama sekali → tetap deploy, dengan peringatan di log.
3. Jalankan `/usr/local/bin/deploy-sahamlens` (sebagai user `lens`, **bukan** `sudo`).
   Skrip itu yang menjalankan `npm ci`, build, migrasi aditif, restart, health check, dan
   rollback ke versi terakhir yang terbukti jalan bila ada tahap yang gagal.

## Alarm

Kegagalan dan penolakan deploy mengirim HTTP POST ke `$SAHAMLENS_ALERT_WEBHOOK` (dibaca dari
`/opt/sahamlens/app/.env.production`). Kalau variabel itu kosong, alarm hanya masuk journal -
tidak ada yang hilang diam-diam, tapi tidak ada yang diberi tahu secara aktif pula.

Lihat catatan:

```bash
journalctl -u sahamlens-auto-deploy.service -n 50
systemctl list-timers sahamlens-auto-deploy.timer
```

## Uji tanpa menyentuh produksi

```bash
/opt/sahamlens/scripts/auto-deploy.sh --dry-run
```

## Mematikan

```bash
sudo systemctl disable --now sahamlens-auto-deploy.timer
```

Setelah dimatikan, deploy kembali manual: `/usr/local/bin/deploy-sahamlens` sebagai user `lens`.
Workflow `Deploy VPS` di GitHub tetap ada sebagai jalur cadangan dan hanya berjalan bila
dijalankan manual (`workflow_dispatch`) - pemicu otomatisnya sudah dimatikan supaya lampu merah
tidak lagi muncul untuk sesuatu yang bukan kesalahan kode.