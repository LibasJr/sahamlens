# Scheduled Jobs SahamLens

Inventori kanonik berada di `config/scheduled-jobs.json` dan diverifikasi oleh:

```bash
npm run audit:cron
```

## Siapa yang menjadwalkan apa

Production berjalan di VPS sendiri sejak 2026-08-12/13. Seluruh 23 route cron
dijadwalkan oleh systemd di VPS setelah migrasi dari QStash pada 2026-08-21:

| Penjadwal | Jumlah | Cara memanggil | Guard | Sumber jam |
| --- | --- | --- | --- | --- |
| systemd timer di VPS | 23 | `GET` atau `POST` ke `127.0.0.1:3001/api/cron/...` | `Authorization: Bearer <CRON_SECRET>` | unit timer di VPS (`systemctl list-timers`) |
| QStash (Upstash) | 0 | - | - | - |
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
- Sepuluh timer hasil migrasi berada di `deploy/qstash-to-systemd/timers`. Ubah jadwal
  pada unit timer dan manifest dalam commit yang sama agar keduanya tidak drift.
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

### `macro` naik dari 1x/hari jadi tiap jam - disengaja, bukan penjadwal kedua

| Waktu (UTC) | Pola |
| --- | --- |
| 10, 11, 12 Ags - `03:00` | 1x/hari, cocok dengan `0 3 * * 1-5` (jadwal UTC lama) |
| 13 Ags - `02:00` sampai `09:00` | tiap jam, menit 00 |

Sempat dicatat di sini sebagai anomali yang belum dijelaskan. Penyebabnya jadwal baru yang
ditulis saat migrasi: **`0 9-16 * * 1-5` dengan timezone Asia/Jakarta** - 09:00-16:00 WIB, yaitu
02:00-09:00 UTC. Persis pola yang terbaca. Dikonfirmasi langsung dari layar Edit Schedule QStash:
destination `https://sahamlens.id/api/cron/macro`, `Upstash-Method: POST`,
`Upstash-Cron: 0 9-16 * * 1-5` TZ `Asia/Jakarta`.

Dua hal yang ikut terjawab dan sebelumnya cuma bisa diduga:

- **Destination QStash sudah menunjuk `sahamlens.id`**, bukan `sahamlens.vercel.app`. Ini tidak
  bisa dibuktikan dari `job_run_log` - Vercel standby menulis ke Neon yang sama, jadi barisnya
  akan terlihat identik. Hanya layar dashboard yang bisa menjawabnya.
- **Tidak ada penjadwal kedua.** Hitungan 13 Ags pas dengan jadwalnya: `breakout-scan` 84
  (7 jam x 12), `market-pulse` 84, `recommendation-scan` 28, `watchlist-alert` 28, `macro` 8.
  Tidak ada yang melebihi jadwalnya, dan kelebihan adalah satu-satunya gejala yang tidak bisa
  dijelaskan skip.

Pelajaran yang layak disimpan: perbedaan antara "jadwal berubah" dan "ada penjadwal kedua" tidak
bisa dijawab dari tabel run sama sekali, karena keduanya menghasilkan baris yang sama. Yang
membedakan cuma arah simpangannya - kurang berarti skip, lebih berarti ada pemanggil lain.

Catatan kecil: banyak job punya satu run tunggal di 12 Ags `14:xx` UTC (21:00 WIB) di luar
polanya. Itu jam kerja migrasi, kemungkinan besar pemicuan manual - bukan bagian dari jadwal.

## Status manifest saat ini (diperbarui 2026-08-13)

**Kesembilan cadence QStash sudah `known`** - dikonfirmasi satu per satu dari layar Edit Schedule
dashboard, dan ditulis ulang saat migrasi memakai timezone `Asia/Jakarta`, bukan UTC lagi. Semua
destination-nya `https://sahamlens.id/api/cron/...` dengan `Upstash-Method: POST`.

Sisa **tiga**, semuanya systemd:

| Job | Kenapa belum |
| --- | --- |
| `lens-bucket-backtest` | systemd di VPS. Terbaca konsisten 10:00 UTC = 17:00 WIB. |
| `lens-score-optimizer` | systemd di VPS. Mingguan, sampel terlalu sedikit untuk disimpulkan. |
| `broker-summary-scan` | systemd di VPS. Terbaca 12:10 UTC = 19:10 WIB. |

Ketiga job systemd itu masih memakai jam UTC warisan `vercel.json`, sementara sisi QStash sudah
pindah ke WIB. Bukan bug - tapi kalau jam bursa bergeser, tiga job ini tidak ikut bergerak
sendiri sementara sembilan lainnya ikut. Isi dengan `systemctl list-timers` di VPS.

## Catatan lama

Kedua belas job bertanda "belum terverifikasi": sembilan cadence QStash tidak tersimpan di source,
dan tiga jadwal systemd baru berpindah dari `vercel.json` sehingga jam lamanya tidak lagi bisa
dijadikan bukti. Verifikasi ke sumbernya masing-masing lalu isi manifest - jangan menyalin ulang
jam dari riwayat git.
