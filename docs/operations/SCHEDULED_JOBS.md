# Scheduled Jobs SahamLens

Inventori kanonik berada di `config/scheduled-jobs.json` dan diverifikasi oleh:

```bash
npm run audit:cron
```

## Aturan sumber kebenaran

- Cron Vercel: jadwal harus sama persis dengan `vercel.json`.
- QStash: route dan mekanisme signature berada di repo, tetapi cadence aktual dapat hidup di dashboard Upstash. Jika cadence belum terbukti dari source/export dashboard, manifest **harus** memakai `schedule: null` dan `scheduleStatus: "verify-dashboard"`.
- Jangan menebak jam job. Setelah cadence QStash diverifikasi di dashboard, salin nilai persisnya ke manifest dan ubah status menjadi `known`.
- Ketika menambah/menghapus `app/api/cron/*/route.ts`, update manifest pada PR yang sama; `npm run audit:cron` akan gagal bila inventory drift.

## Snapshot saat Round 3

Dua job Vercel dapat direkonstruksi langsung dari repo. Sembilan route QStash ditemukan, tetapi cadence dashboard tidak tersimpan di source yang tersedia, sehingga sengaja ditandai `verify-dashboard` sampai ada export/bukti dari Upstash.
