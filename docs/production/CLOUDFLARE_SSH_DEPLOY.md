# Deploy VPS lewat Cloudflare Tunnel (O-2)

Tujuan: menghilangkan ketergantungan deployment pada port-forward SSH di satu WAN. Workflow mendukung dua mode selama migrasi:

1. **Legacy/direct** — `VPS_HOST` + `VPS_PORT`.
2. **Tunnel** — `VPS_CF_SSH_HOST` + `VPS_CF_KNOWN_HOSTS`; workflow memakai `cloudflared access ssh` sebagai `ProxyCommand`.

## Cutover aman

1. Pada tunnel yang sudah menjalankan SahamLens, publish hostname khusus (contoh `ssh.sahamlens.id`) ke service SSH lokal `localhost:22`.
2. Pastikan SSH key deploy yang sama masih terdaftar untuk user `lens`.
3. Buat known-hosts untuk **hostname tunnel** memakai public host key SSH server yang sama. Simpan sebagai secret GitHub `VPS_CF_KNOWN_HOSTS`.
4. Tambahkan secret GitHub `VPS_CF_SSH_HOST=ssh.sahamlens.id`.
5. Jalankan `workflow_dispatch` dan pastikan deploy + smoke test publik sukses.
6. Ulangi satu deploy normal dari trigger CI.
7. **Baru setelah dua deploy sukses**, hapus/disable port-forward SSH publik lama. Jangan menutup jalur lama sebelum jalur tunnel terbukti.

> Catatan: workflow tunnel tidak boleh memerlukan login browser interaktif. Jika Anda menambahkan Cloudflare Access di depan hostname SSH, gunakan metode autentikasi headless yang memang dirancang untuk CI atau pilih arsitektur Zero Trust yang sesuai; jangan menyimpan cookie login personal di GitHub Secrets.

## Kriteria penutupan O-2

O-2 tetap **PARTIAL** selama workflow masih memakai `VPS_HOST` direct. Tandai **CLOSED** hanya setelah deployment produksi terbukti berjalan melalui `VPS_CF_SSH_HOST` dan port-forward SSH WAN lama sudah ditutup.
