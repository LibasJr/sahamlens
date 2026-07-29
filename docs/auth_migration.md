# Catatan Migrasi Sistem Autentikasi (Juli 2026)

## 1. Perubahan Utama (Dari Cookie Biasa ke JWT)
Sistem autentikasi web ini baru saja dimigrasikan dari mekanisme penyimpanan sesi sederhana (berbasis file & plaintext cookie) menjadi **JWT (JSON Web Token)** yang jauh lebih aman menggunakan library `jose`.

- **Library JWT**: `jose` (mendukung Edge Runtime di Next.js Middleware).
- **Secret Key**: Menggunakan variabel `JWT_SECRET` (tersedia di `.env.local`).
- **File Core JWT**: `lib/session.ts` (berisi fungsi `encrypt`, `decrypt`, dan `getSession`).

## 2. Middleware & Proteksi Rute
- **File**: `middleware.ts`
- **Fungsi**: Membaca cookie `session` dan memvalidasi JWT.
- **Rute Terproteksi**: `/dashboard` (harus login), dan API `/api/stock/*`, `/api/fundamental/*` (hanya bisa diakses jika terautentikasi dan akan kena rate limit 5x untuk user Free).

## 3. Integrasi Email SMTP (Nodemailer)
Fitur OTP Pendaftaran dan Lupa Password kini sudah menggunakan email sungguhan.
- **Library**: `nodemailer`
- **Konfigurasi Lingkungan**:
  - `SMTP_USER` (misalnya: sabil873@gmail.com)
  - `SMTP_PASS` (App Password dari Google)
- **Implementasi**:
  - Pendaftaran: `/api/auth/signup/route.ts` (mengirimkan OTP 6 digit ke email).
  - Lupa Password: `/api/auth/forgot-password/route.ts` (mengirim link reset password unik).

## 4. Perubahan API Endpoint
Semua API endpoint yang sebelumnya membaca `getDemoSession` dari `lib/auth.ts` telah diubah untuk membaca `getSession` dari `lib/session.ts`. 
Termasuk:
- `/api/portfolio/route.ts`
- `/api/portfolio/buy/route.ts`
- `/api/portfolio/sell/route.ts`
*(Perhatian untuk AI selanjutnya: Jika menambahkan endpoint API baru yang membutuhkan user terotentikasi, WAJIB menggunakan `await getSession()` dari `lib/session.ts`)*.

## 5. UI/UX Terkini
- **Remember Me**: Ditambahkan di `/login/page.tsx`. Menggunakan `localStorage('saham_remember_email')` untuk menyimpan history input email, dan mengatur sesi JWT (cookie `maxAge`) hingga 30 hari.
- **Password Visibility**: Seluruh form input password (Login, Signup, Reset Password) sudah dilengkapi dengan tombol icon mata (Eye/EyeOff) untuk memunculkan/menyembunyikan teks.
- **Tanpa Placeholder**: Kolom password dibiarkan kosong natural, menghapus placeholder titik-titik (`••••••••`) untuk menghindari kebingungan user.
