# Timer `intraday-collect` (Intraday Validation Lab)

Unit systemd untuk `/api/cron/intraday-collect`. **Belum terpasang di VPS** — selama belum,
`config/scheduled-jobs.json` menandainya `scheduleStatus: "verify-server"` dan pengumpulan
data intraday hanya jalan kalau ditekan manual dari `/admin/intraday-validation`.

Unit memanggil `127.0.0.1:3001` (bukan `sahamlens.id`) agar job sampai 240 detik tidak
melewati batas timeout Cloudflare. Setelah deploy yang membawa perubahan unit, salin ulang
file `.service` sebelum menjalankan `daemon-reload`.

## Pasang

```bash
sudo cp sahamlens-intraday-collect.service /etc/systemd/system/
sudo cp sahamlens-intraday-collect.timer   /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now sahamlens-intraday-collect.timer
systemctl list-timers --all | grep -i intraday
```

## Verifikasi (jangan menebak)

```bash
# 1. Jalankan sekali manual, lihat exit code-nya
sudo systemctl start sahamlens-intraday-collect.service
systemctl status sahamlens-intraday-collect.service

# 2. Konfirmasi di Postgres, bukan dari log saja
#    SELECT job_name, status, started_at, finished_at, meta
#    FROM job_run_log WHERE job_name = 'intraday-collect'
#    ORDER BY started_at DESC LIMIT 5;
```

`meta` berisi `tickersProcessed`, `signalsWritten`, `outcomesWritten`, `referenceTradingDays`,
`missingDayRows`, dan `budgetExhausted`. `budgetExhausted: true` berarti anggaran 240 detik
habis sebelum seluruh emiten selesai — normal untuk backfill besar, dan aman karena
seluruh tulisan idempoten (upsert per `(ticker, trading_date, signal_minute_wib,
model_version, config_hash)`).

## Setelah terkonfirmasi jalan

Ubah entri `/api/cron/intraday-collect` di `config/scheduled-jobs.json`:

```json
{"path": "/api/cron/intraday-collect", "provider": "systemd", "schedule": "30 17 * * 1-5", "scheduleStatus": "known", "source": "systemctl list-timers --all di VPS <tanggal>: sahamlens-intraday-collect.timer, LAST ..., NEXT ..."}
```

lalu `npm run audit:cron`.

## Kenapa systemd, bukan QStash

QStash sudah penuh 10/10 job (lihat docs/operations/DEPLOYMENT.md, entri 2026-08-14 "CATATAN PENTING").
Route-nya tetap punya handler POST + verifikasi signature QStash supaya bisa dipindah
tanpa mengubah kode kalau slot terbuka.
