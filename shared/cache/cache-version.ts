// Versi kunci cache untuk payload HASIL HITUNGAN (bukan data mentah).
//
// Kenapa ini ada: perbaikan rumus tidak sampai ke pengguna selama payload lama masih
// hidup di Redis. Terbukti 2026-08-14 - perubahan harian DGWG sudah benar di kode
// (-4,22%) tapi kartu Teknikal masih menampilkan +3,75% karena payload yang disimpan
// SEBELUM deploy baru kedaluwarsa 30 menit kemudian. Untuk jalur stale-fallback
// umurnya bahkan 24 jam. Selama jendela itu aplikasi menyajikan angka yang sudah
// diketahui salah, dan tidak ada cara memaksanya keluar selain menunggu.
//
// Menyisipkan versi ini ke dalam kunci membuat deploy yang mengubah rumus otomatis
// meleset dari entri lama - bukan menghapusnya (Redis membiarkannya kedaluwarsa
// sendiri), melainkan berhenti membacanya.
//
// BUMP NILAI INI setiap kali mengubah cara sebuah angka di payload dihitung.
// Menambahkan field baru tidak perlu bump; mengubah arti field yang sudah ada perlu.
//
// Riwayat:
//   v2 - lilin sesi berjalan ditambahkan ke chart, dan perubahan harian di
//        market-summary/teknikal memakai resolvePreviousClose.
//   v1 - nilai awal saat mekanisme ini dipasang, bersamaan dengan perbaikan
//        penutupan acuan (lihat shared/market/previous-close.ts).
export const COMPUTED_CACHE_VERSION = 'v2';
