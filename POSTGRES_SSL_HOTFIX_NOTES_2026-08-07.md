# SahamLens PostgreSQL SSL hotfix

Patch ini hanya menormalkan nilai `sslmode` pada DATABASE_URL saat runtime:

- prefer -> verify-full
- require -> verify-full
- verify-ca -> verify-full

Environment Variable Vercel tidak diubah.
Parameter lain seperti `channel_binding=require` tetap dipertahankan.
Konfigurasi `ssl: { rejectUnauthorized: true }` juga tetap dipertahankan.

Tujuan: menghilangkan warning `pg-connection-string` sambil mempertahankan
verifikasi TLS yang ketat.
