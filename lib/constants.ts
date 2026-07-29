export const WA_NUMBER = '6285204566153';

// Nama cookie HttpOnly admin. Ditaruh di sini (bukan lib/auth.ts) karena file ini tidak
// mengimpor apa pun - aman dipakai dari middleware.ts (Edge Runtime) tanpa menyeret modul
// `next/headers` yang tidak didukung di sana.
export const ADMIN_COOKIE = 'sahamlens_admin';
export const ADMIN_COOKIE_VALUE = '1';
