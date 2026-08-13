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

## Status manifest saat ini

Kedua belas job bertanda "belum terverifikasi": sembilan cadence QStash tidak tersimpan di source,
dan tiga jadwal systemd baru berpindah dari `vercel.json` sehingga jam lamanya tidak lagi bisa
dijadikan bukti. Verifikasi ke sumbernya masing-masing lalu isi manifest - jangan menyalin ulang
jam dari riwayat git.
