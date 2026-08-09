# Admin Session Unification Fix — 2026-08-10

## Gejala
Admin login via `/admin-login` berhasil membuka panel/menu admin, tetapi LensTechnical/Analyzer meminta login lagi.

## Root cause
Jalur admin secret hanya membuat cookie `sahamlens_admin`, sedangkan fitur aplikasi memakai `getSession()` yang sebelumnya hanya membaca cookie `session` user biasa. Sidebar mengenali admin lewat `/api/admin-status`, sehingga UI dan API berbeda pendapat mengenai status login.

## Fix
- `shared/auth/session.ts`: `getSession()` tetap memprioritaskan cookie `session` normal. Jika tidak ada/invalid, ia memverifikasi `sahamlens_admin` menggunakan `verifyAdminToken()` dan mengembalikan session role admin sintetis untuk otorisasi fitur aplikasi.
- Badge cookie non-HttpOnly tidak pernah dipercaya untuk otorisasi.
- `modules/user/controller/auth.controller.ts`: logout sekarang membersihkan cookie session biasa dan seluruh cookie admin, mencegah kondisi UI terlihat logout tetapi admin session masih valid.

## Dampak
Satu login admin berlaku konsisten untuk halaman admin dan fitur Analyzer/Pro yang memakai `getSession()`.
