# Scheduled Jobs SahamLens

Inventori kanonik berada di `config/scheduled-jobs.json` dan diverifikasi oleh:

```bash
npm run audit:cron
```

## Siapa yang menjadwalkan apa

Production berjalan di VPS sendiri sejak 2026-08-12/13. Ada 12 route cron dan **dua** penjadwal:

| Penjadwal | Jumlah | Cara memanggil | Guard | Sumber jam |
| --- | --- | --- | --- | --- |
| systemd timer di VPS | 3 | `GET https://sahamlens.id/api/cron/...` | `Authorization: Bearer <CRON_SECRET>` | unit timer di VPS (`systemctl list-timers`) |
| QStash (Upstash) | 9 | `POST` dari QStash | `verifyQStashSignature()` | dashboard Upstash (`GET /v2/schedules`) |
| Vercel Cron | 0 | - | - | - |

**Vercel Cron sengaja kosong dan harus tetap kosong.** Vercel Cron bukan state dashboard - ia
dibaca ulang dari `vercel.json` pada setiap deployment, dan Vercel masih ikut build tiap push ke
`main`. `CRON_SECRET` juga masih ada di environment Vercel, jadi blok `crons` yang dikembalikan
akan benar-benar menjalankan job kedua kalinya terhadap database Neon yang sama (kejadian nyata,
commit `2a64988`). `npm run audit:cron` sekarang gagal kalau `vercel.json` berisi `crons`.

## Aturan sumber kebenaran

- **Jangan menebak jam job.** Jam sebenarnya tidak ada di repo: QStash di dashboard Upstash,
  systemd di unit timer VPS. Selama belum diverifikasi, manifest harus memakai `schedule: null`
  dengan `scheduleStatus: "verify-dashboard"` (QStash) atau `"verify-server"` (systemd).
  Setelah diverifikasi, salin nilai persisnya dan ubah status menjadi `known`.
- **Jangan memindahkan job antar penjadwal tanpa mengubah manifest dan handler-nya.** Tiga route
  systemd menyediakan `GET` (CRON_SECRET) *dan* `POST` (signature QStash) sekaligus. Menghapus
  handler yang "kelihatan tidak dipakai" pernah mematikan dua job tanpa jejak di aplikasi
  (`8dfbe94`, diperbaiki `72034df`) - systemd cuma menerima 405 dan job berhenti diam-diam.
- Ketika menambah/menghapus `app/api/cron/*/route.ts`, update manifest pada PR yang sama;
  `npm run audit:cron` akan gagal bila inventory drift.
- Mendaftarkan route baru ke QStash harus memakai domain `https://sahamlens.id` - bukan
  `sahamlens.vercel.app`, yang sekarang hanya server standby.

## Bukti empiris dari `job_run_log` (2026-08-13)

Jam sebenarnya memang tidak ada di repo, tapi ada sumber ketiga yang tidak butuh akses dashboard
maupun SSH: tabel `job_run_log` di Neon, diisi `withJobRunLog()` setiap kali job benar-benar
jalan. Ini bukan konfigurasi yang diklaim - ini yang betul-betul terjadi.

```sql
SELECT job_name, count(*), max(started_at) FROM job_run_log
WHERE started_at > now() - interval '3 days' GROUP BY job_name;
```

Hasil 2026-08-13: **kedua belas job jalan, tidak ada yang mati diam-diam setelah migrasi.**
`lens-bucket-backtest` tetap di 10:00 UTC dan `broker-summary-scan` tetap di 12:10 UTC - sama
persis dengan jadwal Vercel lama, jadi systemd timer memang mewarisi jamnya.

**Kenapa ini tetap tidak cukup untuk menaikkan status jadi `known`:** jumlah run hanya bisa
membuktikan job jalan LEBIH JARANG dari jadwalnya, tidak pernah lebih sering. `execute()`
dibungkus `runWithJobConcurrencyGuard()` yang membalas 202 dan **tidak menulis baris log** saat
run sebelumnya masih berjalan - jadi `breakout-scan` yang terbaca 171 run dari ~252 yang
diharapkan tidak membuktikan cadence-nya berubah. Ekspresi cron tetap harus diambil dari
sumbernya.

Arah sebaliknya yang justru konklusif: run yang MUNCUL tidak bisa diciptakan oleh skip.

### Anomali: `macro` naik dari 1x/hari jadi tiap jam

| Waktu (UTC) | Pola |
| --- | --- |
| 10, 11, 12 Ags - `03:00` | 1x/hari, cocok dengan `0 3 * * 1-5` yang didokumentasikan |
| 13 Ags - `02:00` sampai `09:00` | **tiap jam, menit 00, masih berlanjut** |

Perubahannya mulai 2026-08-13 02:00 UTC. Karena skip hanya bisa mengurangi run, run tambahan ini
nyata - `macro` sekarang jalan ~24x lipat dari yang tertulis. Belum diketahui apakah cadence
QStash-nya sengaja diubah, atau ada penjadwal kedua yang ikut memanggil endpoint yang sama
setelah migrasi. **Verifikasi `GET /v2/schedules` di QStash dan `systemctl list-timers` di VPS
sebelum menambal apa pun** - kalau penyebabnya penjadwal kedua, mengubah cadence QStash tidak
akan menghentikannya.

Catatan kecil: banyak job punya satu run tunggal di 12 Ags `14:xx` UTC (21:00 WIB) di luar
polanya. Itu jam kerja migrasi, kemungkinan besar pemicuan manual - bukan bagian dari jadwal.

## Status manifest saat ini

Kedua belas job bertanda "belum terverifikasi": sembilan cadence QStash tidak tersimpan di source,
dan tiga jadwal systemd baru berpindah dari `vercel.json` sehingga jam lamanya tidak lagi bisa
dijadikan bukti. Verifikasi ke sumbernya masing-masing lalu isi manifest - jangan menyalin ulang
jam dari riwayat git.
