# SahamLens

Alat riset kuantitatif untuk saham likuid Bursa Efek Indonesia. Skor teknikal, fundamental,
dan arus kepemilikan dihitung dari rumus terbuka — bukan kotak hitam — lalu disajikan sebagai
screener, radar peluang, backtest, dan penjelasan berbahasa alami.

> **Status model.** LensScore dan turunannya berstatus `RESEARCH_ONLY` / `MODEL_UNVALIDATED`.
> Angka di aplikasi ini adalah hasil riset, bukan rekomendasi investasi, dan belum melewati
> gerbang bukti out-of-sample. Lihat `/transparency` di aplikasi dan `docs/audit/`.

## Menjalankan secara lokal

```bash
npm ci
cp .env.example .env.local   # isi minimal DATABASE_URL dan JWT_SECRET_KEY
npm run db:migrate           # skema dimiliki migration, bukan runtime
npm run dev                  # http://localhost:3001
```

Node 22 (`.nvmrc`). PostgreSQL wajib; Redis opsional — tanpa `REDIS_URL` lapisan cache
jatuh ke implementasi in-memory di `shared/cache/redis-local.ts`.

## Verifikasi sebelum deploy

```bash
npm run verify:prod
```

Merangkai seluruh gerbang: audit integritas statis, `typecheck`, `lint`, `test`, dan
production build. Gerbang yang sama dijalankan CI pada setiap pull request
(`.github/workflows/ci.yml`). Delapan skrip `audit:*` berjalan tanpa database, jadi
sebagian besar regresi tertangkap tanpa perlu lingkungan lengkap.

```bash
npm run typecheck
npm run lint
npm test              # vitest
npm run audit:ui      # konsistensi design system, ratchet adopsi
npm run audit:schema  # runtime tidak boleh menyentuh skema
```

## Peta kode

| Direktori | Isi |
|---|---|
| `app/` | Route Next.js App Router — halaman dan 101 route API |
| `modules/` | Logika domain per bidang (technical, fundamental, market, recommendation, …) |
| `shared/` | Infrastruktur lintas domain: database, cache, auth, http, security, logger |
| `components/` | Komponen React; primitif design system ada di `components/ui/` |
| `lib/` | Utilitas sisi klien, i18n, hook |
| `database/migrations/` | Migration bernomor — satu-satunya pemilik skema |
| `scripts/` | Skrip audit, backfill, import, dan sinkronisasi data |
| `docs/` | Dokumentasi operasional (`operations/`), audit (`audit/`), catatan (`notes/`) |

## Aturan yang dijaga otomatis

Beberapa keputusan arsitektur ditegakkan skrip, bukan konvensi lisan. Melanggarnya
menggagalkan CI:

- **Runtime tidak boleh mengubah skema.** `assertDatabaseMigrated()` menolak jalan bila
  migration baseline belum diterapkan; `audit:schema` melarang `CREATE TABLE`/`ALTER TABLE`
  di luar `database/migrations/`.
- **Tidak ada angka finansial karangan.** `audit:zero-dummy` memindai tanda tangan regresi
  data dummy di seluruh berkas sumber produksi.
- **Kontras warna terjaga di dua tema.** `__tests__/color-contrast.test.ts` memeriksa
  seluruh matriks teks/tint/bidang padat, bukan sampel yang kebetulan terlihat.
- **Adopsi design system dan kontrak API hanya boleh membaik.** `audit:ui` menyimpan
  baseline di `config/ui-adoption-baseline.json` dan gagal bila jumlah pola mentah naik.
- **Referensi pasar manual punya tanggal kedaluwarsa.** `audit:manual-market` mengingatkan
  saat daftar yang ditulis tangan melewati `reviewBy`.

## Data

`all.csv` (master 962 emiten IDX) dan `idx_emiten_900.csv` dibaca runtime relatif terhadap
`process.cwd()` — keduanya sengaja tetap di akar repositori. Data historis dan hasil
sinkronisasi ada di `data/`.

## Deployment

**Production: VPS + systemd + Cloudflare Tunnel.** Domain `sahamlens.id`. Deploy berjalan
otomatis lewat GitHub Actions (workflow **Deploy VPS**) setelah CI hijau di `main` - tidak
ada langkah manual. Container `output: 'standalone'` lewat `Dockerfile` tersedia untuk
self-host.

**Vercel: lingkungan standby, non-authoritative.** Ia tidak melayani pengguna dan tidak
boleh menjalankan job terjadwal apa pun (`vercel.json` wajib tanpa blok `crons` -
`npm run audit:cron` menggagalkan build kalau blok itu kembali). Auto-deploy-nya dimatikan
lewat `git.deploymentEnabled: false` supaya tiap pull request tidak menunggu status dari
lingkungan yang tidak menerbitkan apa pun; aktifkan manual kalau memang sedang dibutuhkan.

Selengkapnya di `docs/operations/DEPLOYMENT.md`.

## Lisensi

**Hak cipta © 2026 SahamLens. Seluruh hak dilindungi.**

Repositori ini publik agar rumus dan metodologinya dapat diperiksa — bukan agar kodenya
dipakai ulang. Visibilitas publik BUKAN pemberian lisensi: tanpa izin tertulis, tidak ada
hak untuk memakai, menyalin, memodifikasi, menyebarkan, atau menurunkan karya dari kode ini,
baik untuk keperluan komersial maupun non-komersial.

Selengkapnya di [`LICENSE`](LICENSE).
