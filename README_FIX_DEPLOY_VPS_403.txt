SAHAMLENS - FIX DEPLOY VPS HTTP 403
====================================

Masalah:
GitHub Actions "Deploy VPS" berhasil melakukan deploy ke VPS,
tetapi step terakhir "Smoke test publik setelah deploy" gagal:

    Error: /api/health HTTP 403

Tujuan patch:
- TIDAK membuka /api/health ke publik.
- TIDAK mengubah SSH, GitHub Secrets, atau proses deploy VPS.
- HANYA mengganti step smoke test publik agar memeriksa:
      https://sahamlens.id/
- Memakai retry 5x agar deployment tidak gagal karena startup/transien singkat.
- Membuat backup workflow sebelum perubahan.

CARA PAKAI
----------
1. Extract isi ZIP ini ke folder utama repository SahamLens
   (folder yang berisi package.json dan .github).

2. Double-click:
      APPLY_FIX_DEPLOY_VPS_403.cmd

   Atau dari PowerShell:
      .\FIX_DEPLOY_VPS_403.ps1

3. Setelah muncul "PATCH BERHASIL", cek:
      git diff -- .github/workflows/

4. Commit:
      git add .github/workflows/
      git commit -m "fix: avoid protected health endpoint in public smoke test"
      git push

Backup otomatis:
Workflow lama disimpan sebagai:
    deploy-vps.yml.bak-before-403-fix
atau
    deploy-vps.yaml.bak-before-403-fix

Catatan:
File backup tidak perlu ikut di-commit.

Patch ini sengaja tidak mengganti seluruh deploy-vps.yml supaya
konfigurasi SSH/secrets/deploy SahamLens yang sekarang sudah berhasil
tidak tertimpa.
