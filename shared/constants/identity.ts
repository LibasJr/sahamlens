// Id sesi sintetis untuk login admin lewat ADMIN SECRET (cookie admin, bukan akun
// email) - lihat shared/auth/session.ts. Login ini SENGAJA tidak terikat ke satu
// akun: admin_secret cuma menyimpan hash + session_version, tanpa email/user_id.
//
// Konsekuensinya id ini TIDAK punya baris di tabel `users`, jadi setiap fitur yang
// menulis baris ber-foreign-key ke users (portfolios, watchlists, alerts,
// user_auth_events) harus mengecualikannya lebih dulu. Melewatkan pengecekan ini
// bukan menghasilkan data kosong, melainkan error FK yang jadi 500 di API - persis
// yang membuat halaman Akun Demo gagal tampil (insiden 2026-08-24).
//
// File ini SENGAJA tidak mengimpor apa pun, sama seperti cookie-names.ts: dipakai
// dari shared/auth/presence.ts yang justru diimpor oleh session.ts, jadi konstanta
// ini tidak boleh tinggal di session.ts (akan jadi import melingkar).
export const SYNTHETIC_ADMIN_SESSION_ID = '__sahamlens_admin__';

export function isSyntheticAdminSession(userId: string | null | undefined): boolean {
  return userId === SYNTHETIC_ADMIN_SESSION_ID;
}
