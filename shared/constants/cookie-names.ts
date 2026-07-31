// Nama-nama cookie dipusatkan di sini. File ini SENGAJA tidak mengimpor apa pun -
// itu yang membuatnya aman dipakai dari middleware.ts (Edge Runtime), yang tidak
// mendukung modul Node.js seperti `next/headers` atau `pg`. Kalau file ini nanti
// mengimpor sesuatu yang menyeret dependency Node, middleware.ts akan gagal build.

// Cookie sesi JWT utama (HttpOnly, dibuat oleh shared/auth/jwt.ts).
export const SESSION_COOKIE = 'session';

// Cookie admin HttpOnly - satu-satunya yang boleh dipercaya untuk keputusan
// otorisasi (lihat shared/middleware/require-auth.ts). Diset lewat
// modules/user/controller/admin.controller.ts setelah verifikasi ADMIN_SECRET_KEY
// atau Telegram Login Widget.
export const ADMIN_COOKIE = 'sahamlens_admin';
export const ADMIN_COOKIE_VALUE = '1';

// Cookie non-HttpOnly untuk badge UI client-side saja (dibaca document.cookie).
// TIDAK PERNAH dipakai untuk keputusan otorisasi server-side.
export const ADMIN_BADGE_COOKIE = 'saham_admin';
export const ROLE_BADGE_COOKIE = 'role';

// Cookie identitas dari Telegram Login Widget (non-HttpOnly, hanya nama/username).
export const TELEGRAM_USER_COOKIE = 'sahamlens_user';

// Cookie sesi akun Demo/Paper Trading - dipertahankan untuk kompatibilitas mundur
// dengan sistem portofolio yang lama.
export const DEMO_SESSION_COOKIE = 'sahamlens_demo_session';
