# Deployment SahamLens

Dokumen ini adalah runbook aktif. Riwayat lama dipindahkan ke `docs/archive/operations/DEPLOYMENT_HISTORY_2026-08.md`.

## Production source of truth

- Production: VPS sendiri, domain `sahamlens.id`.
- Runtime: systemd service `sahamlens` + Cloudflare Tunnel.
- Checkout production: `/opt/sahamlens/app`, branch `main`.
- Environment production: `/opt/sahamlens/app/.env.production` di VPS.
- Vercel: standby/non-authoritative; tidak melayani pengguna dan tidak boleh menjalankan cron.

## Jalur deploy normal

Deploy normal selalu lewat GitHub Actions, bukan `git pull` manual di VPS.

1. Buat PR.
2. Tunggu CI hijau.
3. Merge ke `main`.
4. Workflow **Deploy VPS** menjalankan deploy ke VPS.
5. Verifikasi produksi dari service restart/build id, bukan hanya status workflow.

## Verifikasi sebelum merge/deploy

Dari worktree non-production:

```bash
npm run preflight
npm run verify:prod
```

`verify:prod` menjalankan audit statis, typecheck, lint, test, production build, dan bundle audit. Jangan jalankan dari `/opt/sahamlens/app` kecuali memang sengaja siap me-restart service, karena build menulis `.next/` yang sama dengan proses production.

## Verifikasi produksi setelah deploy

Di VPS:

```bash
systemctl show sahamlens --property=ActiveEnterTimestamp,NRestarts
curl -s http://127.0.0.1:3001/ | grep -o '"buildId":"[^"]*"'
cat /opt/sahamlens/app/.next/BUILD_ID
cat /opt/sahamlens/deployed-sha
```

Workflow hijau bukan bukti service sudah berpindah versi. Bukti minimal: service restart baru, `BUILD_ID` yang disajikan cocok dengan `.next/BUILD_ID`, dan `/opt/sahamlens/deployed-sha` sesuai commit yang dimaksud.

## Env var production

Menambah env var di kode/`.env.example` tidak otomatis mengubah production.

1. Tulis env var ke `/opt/sahamlens/app/.env.production`.
2. Restart service:

```bash
sudo systemctl restart sahamlens
```

Jangan menaruh rahasia di dokumen, issue, PR, atau log. Tulis nama variabelnya saja.

## Cron dan job terjadwal

Sumber jadwal aktif:

- QStash untuk route `/api/cron/*` yang tercatat di `config/scheduled-jobs.json`.
- systemd timer di VPS untuk job host-level seperti intraday collect, uptime monitor, dan weekly maintenance.

Aturan:

- Jangan mengembalikan blok `crons` ke `vercel.json`.
- Route cron baru harus didaftarkan ke jadwal yang benar dan dicatat di manifest terkait.
- Jalankan `npm run audit:cron` setelah perubahan jadwal/route cron.

## Migration database

Skema hanya boleh berubah lewat `database/migrations/`.

```bash
npm run db:migrate:check
npm run db:migrate
```

Runtime tidak boleh membuat/mengubah tabel. `npm run audit:schema` menjaga aturan ini.

## Rollback darurat

Gunakan jalur deploy VPS yang ada, dengan commit target yang jelas. Jangan melakukan edit manual di checkout production kecuali incident response eksplisit membutuhkan itu.

Checklist singkat:

1. Catat commit buruk dan commit target rollback.
2. Jalankan deploy/rollback melalui mekanisme VPS yang tercatat di `deploy/vps-app/`.
3. Verifikasi service restart, health check, `BUILD_ID`, dan `/opt/sahamlens/deployed-sha`.
4. Catat hasil incident di dokumen/issue yang sesuai tanpa memasukkan rahasia.

## Transparency behavior

- Public transparency tersedia di `/transparency` untuk status model, disclosure, dan klaim yang aman dibuka publik.
- Admin transparency berada di area admin dan dilindungi autentikasi/admin guard.
- Jangan mendokumentasikan halaman admin transparency sebagai endpoint publik.

## Referensi tambahan

- `README.md` — ringkasan repo dan gerbang verifikasi.
- `CLAUDE.md` — jebakan operasional yang pernah menjatuhkan build/deploy.
- `docs/architecture/model-validation.md` — status evidence/model validation.
- `docs/decisions/ADR-002-transparency-access.md` — keputusan public/admin transparency split.
- `deploy/vps-app/` — artefak deploy VPS.
- `docs/archive/operations/DEPLOYMENT_HISTORY_2026-08.md` — riwayat perubahan lama.
