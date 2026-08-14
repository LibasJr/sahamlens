# Usulan: Kunci ulang fitur setelah trial 1 bulan habis + cegah abuse multi-email

**Status:** DITUNDA sengaja - masih fase user testing, belum diimplementasikan.
**Dicatat:** 2026-08-14, dari diskusi dengan pengguna (bukan laporan bug).

## Latar belakang

Pengguna bertanya: kalau guest sudah login lalu diberi trial 1 bulan, setelah 1 bulan
apakah fiturnya bisa kembali terkunci untuk email itu? Dan apakah ada celah kalau user
daftar pakai email lain untuk dapat trial baru lagi?

## Jawaban ringkas

1. **Kunci ulang setelah trial habis: BISA, dan sebagian infrastrukturnya sudah ada.**
   Sistem `trial_ends_at` per akun sudah ada (`modules/user`, dicek di `proxy.ts` dan
   `checkProAccessLive`). Tinggal set `trial_ends_at = sekarang + 30 hari` saat approve,
   dan begitu lewat, akses otomatis balik ke rule user gratis biasa (BUKAN rule guest -
   karena dia sudah py akun terdaftar).

2. **Celah multi-email: BENAR ADA.** Email gratisan (Gmail dkk) praktis tak terbatas,
   jadi kalau kuncinya cuma email, user tinggal daftar ulang dengan email baru untuk
   dapat trial baru.

## Opsi mitigasi (berlapis, bukan satu kunci "sempurna")

Tidak ada cara yang mustahil-dicurangi (user yang niat banget selalu bisa VPN + email
baru + browser incognito). Tujuannya menaikkan usaha yang dibutuhkan, bukan menutup
100% celah.

| Sinyal | Bertahan dari hapus cookie? | Bertahan dari ganti browser/HP? | Biaya/friksi |
|---|---|---|---|
| Cookie durasi panjang (reuse `shared/auth/anonymous-trial.ts`, sudah ada infrastrukturnya) | ❌ Tidak (hapus "cookies and site data" atau incognito menghapusnya - beda dari hapus "cache" biasa yang TIDAK menghapus cookie) | ❌ Tidak | Sangat murah, tanpa friksi, reuse kode existing |
| Rate-limit pendaftaran per IP (perluas `AUTH_RATE_LIMIT_CONFIG` di `proxy.ts` yang sudah ada untuk login, ke endpoint signup) | ✅ Ya | ✅ Ya (selama IP sama) | Murah, tanpa friksi ke user jujur |
| Verifikasi nomor HP (OTP SMS/WhatsApp) saat klaim trial | ✅ Ya | ✅ Ya | Nambah 1 langkah verifikasi + biaya gateway SMS - opsi PALING KUAT karena nomor HP adalah sumber daya dunia nyata, tidak seperti email/cookie yang gratis & tak terbatas |
| Fingerprint device (canvas/browser fingerprint) | ✅ Ya | ❌ Tidak (beda device = beda fingerprint) | Butuh library tambahan, area abu-abu soal privasi |

## Rekomendasi (saat nanti dikerjakan)

Mulai dari **cookie durasi panjang + rate-limit IP** dulu - murah, reuse kode yang sudah
ada (`anonymous-trial.ts` + `AUTH_RATE_LIMIT_CONFIG`), nyaris tanpa friksi ke user jujur,
dan sudah menghentikan mayoritas kasus casual (user iseng ganti email doang tanpa hapus
cookie/incognito).

**Verifikasi nomor HP** disimpan sebagai kartu cadangan - baru dikerjakan kalau nanti
data menunjukkan abuse-nya memang signifikan (banyak akun trial dari sumber yang sama
lolos lapis cookie+IP). Jangan pasang friksi OTP ke SEMUA user baru dari awal kalau belum
terbukti perlu - itu menaikkan gesekan pendaftaran untuk semua orang demi mencegah
sebagian kecil yang nakal.

## Kapan diangkat lagi

Setelah fase user testing selesai dan pengguna memutuskan model trial 1 bulan ini mau
dipakai permanen - baru diimplementasikan bertahap sesuai urutan rekomendasi di atas.
