# Rotasi log — kenapa ini bukan satu berkas logrotate

Seluruh servis SahamLens memakai `Type=oneshot`/`simple` tanpa `StandardOutput=file`, jadi
**tidak ada satu pun log aplikasi yang ditulis ke `/var/log/sahamlens*`**. Semuanya masuk
journald. Menaruh berkas logrotate untuk path yang tidak pernah dibuat siapa pun akan
menghasilkan konfigurasi yang lulus tanpa memutar apa pun — persis kelas kegagalan yang
diperingatkan CLAUDE.md §2 untuk gerbang: hijau karena tidak memeriksa apa-apa.

`docs/operations/DEPLOYMENT.md` sudah menyebut disk habis oleh log sebagai "penyebab
kematian VPS paling klasik", tapi obatnya di sana masih berupa perintah cek manual. Yang
menumpuk ada tiga, dan ketiganya diputar dengan mekanisme yang berbeda:

| Sumber | Mekanisme | Berkas di sini |
|---|---|---|
| journald (seluruh unit systemd) | `journald.conf.d` drop-in | `journald-sahamlens.conf` |
| Nginx (`/var/log/nginx/*.log`) | logrotate | `nginx-sahamlens` |
| Docker (kontainer 9Router) | `daemon.json` log driver | lihat §Docker di bawah |

## Pasang

```bash
bash deploy/logrotate/install.sh
```

Verifikasi tanpa menunggu rotasi berikutnya:

```bash
journalctl --disk-usage                       # harus stabil di bawah SystemMaxUse
sudo logrotate --debug /etc/logrotate.d/sahamlens-nginx   # kering, tidak memutar apa pun
df -h /
```

## Angka yang dipilih, dan alasannya

**journald 512M / 14 hari.** Cukup untuk menelusuri satu insiden mundur dua minggu — rentang
yang benar-benar dipakai saat menyelidiki kejadian seperti 23 Agustus 2026 — dan cukup kecil
supaya tidak pernah menjadi penyebab disk penuh di VPS satu box. `SystemMaxUse` adalah pagar
yang mengikat; `MaxRetentionSec` hanya memangkas lebih awal kalau ruangnya masih longgar.

**Nginx 14 rotasi harian, terkompresi.** Sama alasannya. `notifempty` dan `missingok` ada
supaya konfigurasi ini tidak berisik di mesin yang belum memasang nginx.

## Docker

Kontainer 9Router memakai driver log bawaan `json-file` yang **tidak punya batas ukuran** —
ia tumbuh sampai disk habis. Batasnya dipasang di `/etc/docker/daemon.json`:

```json
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "50m", "max-file": "3" }
}
```

Ini hanya berlaku untuk kontainer yang dibuat **setelah** `systemctl restart docker`;
kontainer yang sudah jalan harus dibuat ulang (`docker compose up -d --force-recreate`).
`install.sh` menyentuhnya secara sengaja TIDAK otomatis — me-restart daemon Docker di mesin
produksi harus keputusan sadar, bukan efek samping skrip pasang log.
