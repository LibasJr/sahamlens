# Perawatan mingguan SahamLens

Satu timer systemd, Minggu 03:30 WIB, menjalankan `scripts/weekly-maintenance.mjs`:
menyegarkan data yang lambat berubah, memeriksa keamanan dependency, lalu menjalankan
gerbang produksi penuh — dan menulis laporan.

**Job ini hanya melapor.** Tidak ada `npm audit fix`, migrasi database, atau commit
otomatis. Jam 03:30 tidak ada yang menunggu untuk mengoreksi kalau langkah otomatis salah;
temuannya dibaca manusia Senin pagi dan diperbaiki lewat PR biasa.

## Kenapa ia punya worktree sendiri

`WorkingDirectory` job ini adalah `/opt/sahamlens/maintenance`, bukan `/opt/sahamlens/app`.

Rantai `verify:prod` memuat `next build`, dan build di checkout produksi menimpa `.next/`
yang sedang dibaca proses `next start` yang melayani pengguna: `BUILD_ID` berganti di disk
sementara proses lama masih memegang manifest lama, jadi permintaan chunk berhash lama
membalas 404 sampai servisnya di-restart (CLAUDE.md §7, dan `scripts/guard-production-checkout.mjs`
sudah menolaknya di depan).

Stage `sync` menyegarkan worktree itu ke `origin/main` sebelum mengaudit — tanpa itu, tiap
minggu yang diperiksa adalah kode yang makin basi. Runner menolak stage `sync` dan `quality`
kalau mendapati dirinya berjalan di dalam checkout produksi.

## Stage

| Stage | Isi | Kenapa |
| --- | --- | --- |
| `sync` | `git fetch` + `checkout --detach origin/main` + `git clean` + `npm ci` | Mengaudit kode yang benar-benar dijalankan produksi, bukan salinan basi |
| `data` | Panggil endpoint cron di `config/weekly-maintenance.json` (method per job) + `npm run audit:integrity` | Sebagian besar jadwal harian hanya Senin–Jumat; tarikan akhir pekan menutup hari yang gagal tanpa menunggu Senin |
| `security` | `npm audit --omit=dev`, deteksi berkas `.env` ter-commit, cek izin berkas `.env` | CVE dependency dan secret bocor tidak akan muncul sendiri di log aplikasi |
| `quality` | `npm run verify:prod` dengan env bersih | Gerbang yang sama dengan CI: 12 audit + typecheck + lint + test + build + bundle budget |
| `deps` | `npm outdated` | Dependency yang tertinggal jauh baru terasa saat terpaksa upgrade darurat |

Stage `quality` sengaja **memanggil `verify:prod`, bukan menyalin daftar audit ke dalam
runner.** Daftar yang disalin akan drift dari `verify:prod` dalam hitungan minggu, dan
gerbang yang drift lulus tanpa memeriksa apa pun (CLAUDE.md §2).

## Pasang

```bash
cd /opt/sahamlens/app
bash deploy/weekly-maintenance/install.sh
```

`install.sh` membuat worktree `/opt/sahamlens/maintenance` kalau belum ada, menjalankan
`npm ci` di sana, lalu memasang unit. Aman diulang.

Coba sekali tanpa menunggu jadwal:

```bash
sudo systemctl start sahamlens-weekly-maintenance.service
journalctl -u sahamlens-weekly-maintenance.service -f
```

## Baca hasilnya

```bash
ls -t /opt/sahamlens/maintenance/reports/weekly-maintenance | head -3
cat /opt/sahamlens/maintenance/reports/weekly-maintenance/<stempel>/report.md
```

`report.md` berisi tabel status per langkah lalu bagian "Yang perlu ditindak"; `report.json`
bentuk mesinnya; `logs/` keluaran mentah tiap langkah. Laporan lama dibuang otomatis,
tersisa `keepReports` (default 12 minggu).

Verdict `FAIL` membuat service exit 1 — kelihatan merah di `systemctl status`.

## Jalankan manual

```bash
npm run maintain:weekly:dry      # lihat rencananya, tidak menyentuh apa pun
npm run maintain:weekly:audit    # audit saja, tanpa menembak endpoint data
node --env-file=/opt/sahamlens/app/.env.production scripts/weekly-maintenance.mjs --only=security
```

Opsi: `--only=`/`--skip=` (`sync,data,security,quality,deps`), `--sync`, `--no-data`,
`--dry-run`, `--json`, `--base-url=`, `--config=`, `--keep=`, `--fail-on=warn`.

## Jebakan

- **`--sync` menjalankan `git checkout --detach --force` dan `git clean -xdf`** di worktree
  perawatan. Jangan menyimpan pekerjaan di `/opt/sahamlens/maintenance`; direktori itu
  disposable menurut desain.
- **Butuh `CRON_SECRET`.** Tanpa itu stage `data` sengaja FAIL, bukan diam-diam hijau.
  Service memuatnya lewat `EnvironmentFile=/opt/sahamlens/app/.env.production`.
- **Butuh devDependency terpasang.** Kalau laporan memuat exit 127, `node_modules` di
  worktree tidak lengkap — jalankan `npm ci` di sana.
- **Stage `quality` sengaja tidak mewarisi `.env.production`.** Service memuatnya lewat
  `EnvironmentFile` karena stage `data` butuh `CRON_SECRET`, tapi env yang sama di dalam
  `npm test` mengubah hasil tes: 23 Agustus 2026 `REDIS_URL` yang terwarisi membuat cache
  produksi menjawab lebih dulu, jadi `vi.mock('@/modules/news')` tidak pernah terpanggil dan
  dua regresi chat gagal — untuk commit yang CI-nya hijau. Yang lolos ke gerbang cuma daftar
  putih `QUALITY_ENV_KEEP` di runner; menambah kunci aplikasi ke sana membuat tesnya merah.
- **Tiap endpoint punya `"method"` sendiri di config.** Route `/api/cron` terbagi antara
  `GET` dan `POST`; method yang salah membalas 405 dan terbaca seolah endpointnya rusak.
  Runner menolak di depan kalau method-nya tidak di-export route-nya, dan tesnya mengunci
  pasangan itu di CI.
- **Jangan daftarkan job ini ke `config/scheduled-jobs.json`.** Manifest itu khusus route
  `/api/cron/*`; `npm run audit:cron` akan gagal karena tidak ada route pasangannya.
- **Job dilewati guard konkurensi dilaporkan WARN, bukan PASS** — datanya belum tentu segar.
