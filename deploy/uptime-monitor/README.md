# Pemantau ketersediaan

Timer systemd tiap 5 menit yang memeriksa lima hal dan **memberi peringatan tanpa
me-restart apa pun**. Restart otomatis punya tempatnya sendiri di
`deploy/cloudflared-watchdog/`; me-restart untuk keadaan yang tidak bisa diperbaiki
restart cuma menukar kegagalan diam dengan kegagalan berisik.

## Kenapa perlu, padahal sudah ada Sentry

Sentry melaporkan galat yang dikirim proses yang **masih hidup**. Ia tidak melaporkan:

| Kelas kegagalan | Terlihat di Sentry? | Terlihat di pemantau eksternal? |
|---|---|---|
| Proses mati total | tidak | ya |
| Tunnel putus | tidak | ya |
| DB/Redis mati (aplikasi tetap menjawab) | sebagian | ya, sejak `/api/health` 503 |
| **Produksi menyajikan build LAMA** | tidak | **tidak — HTTP 200 sempurna** |
| **Deploy "sukses" yang tidak berpindah versi** | tidak | **tidak — HTTP 200 sempurna** |

Dua baris terakhir adalah alasan berkas ini ada. Kejadian 23 Agustus 2026 (CLAUDE.md §7):
`git pull` di checkout produksi membuat deploy berikutnya jadi no-op yang melapor sukses;
workflow hijau, `git log` benar, dan pengguna dilayani build berumur dua belas jam. Tidak
ada satu pun pemantau HTTP di dunia yang akan menandai itu — respons 200-nya sempurna.

Yang membuktikan produksi benar-benar berpindah versi cuma dua hal, dan keduanya diperiksa
di sini:

```bash
curl -s http://127.0.0.1:3001/ | grep -o '"buildId":"[^"]*"'
cat /opt/sahamlens/app/.next/BUILD_ID
```

## Pasang

```bash
bash deploy/uptime-monitor/install.sh
```

## Peringatan ke luar (opsional)

Tanpa konfigurasi, peringatan hanya masuk journal:

```bash
journalctl -u sahamlens-uptime-monitor -n 50 --no-pager
```

Untuk kirim ke Slack/Discord/webhook lain, isi `SAHAMLENS_ALERT_WEBHOOK` di
`/opt/sahamlens/app/.env.production` (payload `{"text": "..."}`).

## Ini BUKAN pengganti pemantau eksternal

Pemantau yang berjalan di mesin yang sama tidak bisa melaporkan mesin itu mati. Pasang juga
Uptime Kuma / healthchecks.io / Better Stack yang mengetuk `https://sahamlens.id/api/health`
dari luar. Keduanya menangkap kelas kegagalan yang berbeda dan tidak saling menggantikan —
lihat tabel di atas.

## Kalau timer ini yang berisik

Ambang & target bisa ditimpa lewat env di unit-nya: `SAHAMLENS_ORIGIN`,
`SAHAMLENS_SERVICE`, `SAHAMLENS_APP_DIR`, `SAHAMLENS_DEPLOY_STATE`,
`SAHAMLENS_MONITOR_TIMEOUT`. Penjaga yang memerah untuk hal normal akan diabaikan dalam
seminggu — kalau satu pemeriksaan sering merah tanpa ada yang rusak, perbaiki
pemeriksaannya, jangan matikan timernya.
