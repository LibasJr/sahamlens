// Nama-nama cookie dipusatkan di sini. File ini SENGAJA tidak mengimpor apa pun -
// itu yang membuatnya aman dipakai dari middleware.ts (Edge Runtime), yang tidak
// mendukung modul Node.js seperti `next/headers` atau `pg`. Kalau file ini nanti
// mengimpor sesuatu yang menyeret dependency Node, middleware.ts akan gagal build.

// Cookie sesi JWT utama (HttpOnly, dibuat oleh shared/auth/jwt.ts).
export const SESSION_COOKIE = 'session';

// Cookie admin HttpOnly. Diset lewat modules/user/controller/admin.controller.ts
// setelah verifikasi password admin (hash di database ATAU ADMIN_SECRET_KEY env var
// sebagai jalur darurat). Login via Telegram Login Widget sudah tidak ada lagi.
//
// ISINYA WAJIB JWT bertanda tangan - lihat shared/auth/admin-token.ts, dan verifikasi
// SELALU lewat verifyAdminToken(). Jangan pernah membandingkan cookie ini dengan
// konstanta: nilainya dulu literal '1', dan karena HttpOnly tidak mencegah klien
// MENGIRIM cookie (hanya mencegah JS membacanya), satu curl sudah cukup untuk masuk
// panel admin tanpa login.
export const ADMIN_COOKIE = 'sahamlens_admin';

// Cookie non-HttpOnly untuk badge UI client-side saja (dibaca document.cookie).
// TIDAK PERNAH dipakai untuk keputusan otorisasi server-side.
export const ADMIN_BADGE_COOKIE = 'saham_admin';
export const ROLE_BADGE_COOKIE = 'role';

// Cookie identitas dari Telegram Login Widget (non-HttpOnly, hanya nama/username).
export const TELEGRAM_USER_COOKIE = 'sahamlens_user';

// Cookie sesi akun Demo/Paper Trading - dipertahankan untuk kompatibilitas mundur
// dengan sistem portofolio yang lama.
export const DEMO_SESSION_COOKIE = 'sahamlens_demo_session';

// Cookie trial 7 hari untuk pengunjung TANPA akun (HttpOnly, ditandatangani -
// lihat shared/auth/anonymous-trial.ts). Beda dari SESSION_COOKIE (itu untuk akun
// yang sudah login) - cookie ini murni penanda "kapan pertama kali dilihat".
export const ANON_TRIAL_COOKIE = 'sahamlens_anon_trial';
