# Pemulihan akses admin SahamLens

## Tujuan dan batasan

Runbook ini memulihkan akses operator ke area admin jika credential utama hilang atau diduga bocor. Ini **bukan** cara bypass autentikasi, bukan cara membuat JWT manual, dan tidak menggantikan rotasi secret setelah insiden.

Normal operation memakai hash bcrypt di `admin_secret` dan token yang ditandatangani oleh `ADMIN_JWT_SECRET` terpisah. `ADMIN_BREAK_GLASS_ENABLED` harus tetap tidak diset atau selain `true`. Saat DB tidak tersedia, area admin sengaja fail-closed.

Jangan menaruh password, JWT, nilai environment, `DATABASE_URL`, dump tabel, atau backup credential di Git, chat, ticket, log, browser notes, atau spreadsheet.

## Dual custody offline

Simpan dua **recovery envelope** fisik/offline yang identik dan tersegel, masing-masing dipegang custodian berbeda. Nilai credential tidak boleh berada pada manifest atau repository.

Setiap envelope berisi:

1. URL admin produksi dan identitas sistem (`sahamlens.id`, VPS produksi).
2. Lokasi runbook ini dan langkah verifikasi pasca-pemulihan.
3. Cara menghubungi custodian kedua serta escalation owner.
4. Referensi ke secret manager/offline vault yang disetujui perusahaan — tanpa menyalin nilainya.
5. Tanggal pembuatan, tanggal review berikutnya, dan fingerprint/non-secret identifier envelope.

Simpan manifest non-secret dengan permission `0600` di host operator:

```bash
sudo install -d -m 0700 /etc/sahamlens/admin-recovery
sudo install -m 0600 /dev/null /etc/sahamlens/admin-recovery/manifest.json
```

Gunakan template `deploy/admin-recovery/manifest.example.json`; hanya isi label custodian, escalation owner, lokasi envelope, dan jadwal review. Jangan menambahkan nilai secret.

## Pemeliharaan terjadwal

- **Setiap 90 hari:** kedua custodian mengonfirmasi envelope masih dapat diakses, lokasi masih benar, dan contact escalation valid. Jalankan `node scripts/audit-admin-recovery.mjs` di VPS.
- **Setelah rotasi credential, perubahan custodian, atau insiden:** perbarui envelope dan manifest pada hari yang sama, lalu lakukan drill terkontrol.
- **Setiap drill:** catat tanggal, pelaksana, hasil, dan nomor tiket internal di manifest. Tidak boleh menyimpan password, token, atau URL database.

## Kehilangan akses tanpa indikasi kebocoran

Prasyarat: akses console/SSH VPS resmi dan akses database operator yang memang telah diotorisasi.

1. Kedua custodian menyetujui pemulihan dan mencatat waktu/tiket insiden.
2. Dari checkout produksi, gunakan skrip resmi `scripts/reset-admin-password.mjs` dengan password baru yang diberikan **melalui secret manager atau channel offline**, bukan shell history/chat.
3. Skrip menaikkan `admin_secret.session_version`; seluruh cookie admin lama otomatis tidak berlaku.
4. Jalankan restart service melalui prosedur operasi yang disetujui.
5. Login hanya pada `/admin-login`; verifikasi `/api/admin/status` sebagai admin dan cek audit event `CHANGE_SECRET` serta `LOGIN`.
6. Buat dua envelope baru, perbarui manifest, dan hancurkan envelope lama sesuai kebijakan perusahaan.

## Dugaan credential bocor

Perlakukan sebagai insiden keamanan, bukan pemulihan rutin.

1. Segera catat waktu deteksi, sumber indikasi, dan scope; jangan mengirim credential dalam laporan.
2. Rotasi admin secret memakai skrip resmi sehingga seluruh sesi lama tercabut.
3. Rotasi `ADMIN_JWT_SECRET` lewat jalur perubahan environment yang disetujui, lalu restart service sesuai prosedur produksi.
4. Review `admin_audit_events` untuk `LOGIN`, `LOGIN_FAILED`, `CHANGE_SECRET`, dan aksi istimewa dalam jendela insiden.
5. Tinjau akses SSH/VPS dan secret manager; cabut akses personel yang tidak lagi berwenang.
6. Jalankan `node scripts/audit-admin-recovery.mjs` dan dokumentasikan hasil non-secret pada tiket internal.
7. Setelah containment, terbitkan envelope baru untuk dua custodian dan lakukan drill.

## Larangan

- Jangan mengaktifkan `ADMIN_BREAK_GLASS_ENABLED=true` sebagai fallback permanen.
- Jangan membuat atau membagikan admin JWT manual.
- Jangan menggunakan `ADMIN_SECRET_KEY` sebagai password kedua saat operasi normal.
- Jangan menaruh credential pada env backup yang tidak dilindungi, repository, file manifest, atau output CI.
- Jangan menjalankan reset credential dari worktree atau host yang tidak sah.

## Bukti minimum selesai

Pemulihan/drill hanya dinyatakan selesai bila semua berikut ada:

- `node scripts/audit-admin-recovery.mjs` lulus.
- Dua custodian dan escalation owner tercatat di manifest non-secret.
- `ADMIN_BREAK_GLASS_ENABLED` tetap nonaktif.
- Secret database admin memiliki satu row dan session version meningkat setelah rotasi/drill yang melibatkan reset.
- Login baru berhasil, sesi lama tidak berlaku, dan audit event tercatat.
- Tidak ada secret pada ticket, chat, log, commit, atau artifact CI.
