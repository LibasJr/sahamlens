# Private Daily Market Brief

Kirim ke chat yang sudah diizinkan untuk `@LensOps_bot`:

- pre-market: Senin–Jumat, 08:45 WIB;
- post-market: Senin–Jumat, 16:15 WIB.

Sumbernya hanya endpoint lokal aplikasi: market pulse, market summary, dan transparansi model. Setiap pesan membawa waktu data sumber.

## Shadow mode

Selama `modelStatus` bukan `VALIDATED_OUT_OF_SAMPLE` atau status OOS bukan `VALIDATED`, brief tidak menerbitkan kandidat saham. Pesan menyatakan gerbang belum lolos, bukan mengubah sinyal riset menjadi rekomendasi.

## Install

```bash
cd /opt/sahamlens/app
bash deploy/daily-market-brief/install.sh
```

## Verifikasi

```bash
systemctl list-timers sahamlens-daily-market-brief-pre.timer sahamlens-daily-market-brief-post.timer --all
systemctl start sahamlens-daily-market-brief@pre.service
journalctl -u sahamlens-daily-market-brief@pre.service -n 20 --no-pager
```
