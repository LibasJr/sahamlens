# SahamLens Auth Security & Rate-Limit Fix — 2026-08-10

Perubahan:
- POST auth tidak lagi ikut limiter umum 150 request/hari setelah lolos limiter auth khusus.
- Limiter auth khusus tetap aktif: 10 request/menit per endpoint + IP, blok 15 menit jika terlampaui.
- Login selalu memvalidasi password sebelum mengungkap status akun belum terverifikasi.
- OTP verifikasi signup dibatasi 5 kegagalan per email / 15 menit, dengan Redis bila tersedia dan fallback in-memory.
- Session security yang sudah ada dipertahankan: HttpOnly, Secure di production, SameSite=Lax; bcrypt; JWT env secret.

Gejala yang diperbaiki:
- HP dan laptop pada IP publik/Wi-Fi yang sama sama-sama mendapat 429 "Terlalu banyak request. Coba lagi nanti." akibat limiter umum.

Catatan email:
- Validasi format email tidak dapat menjamin mailbox benar-benar ada. Mailbox invalid baru terkonfirmasi oleh SMTP/bounce. Akun tetap tidak aktif sampai OTP berhasil.
