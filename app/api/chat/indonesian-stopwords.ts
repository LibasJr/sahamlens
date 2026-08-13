/**
 * Kata Indonesia 4 huruf yang BENTROK dengan kode emiten IDX.
 *
 * MASALAH YANG DIPERBAIKI (ditemukan evaluasi jawaban end-to-end, 2026-08-13):
 * `extractMentionedTickers()` meng-uppercase seluruh prompt lalu mencocokkan setiap kata
 * 4 huruf dengan daftar 1.283 emiten. Kata biasa yang kebetulan sama dengan kode emiten
 * karena itu dibaca sebagai kode saham:
 *
 *   "harga emas hari ini berapa?"   -> dibaca sebagai emiten EMAS
 *   "saham Tesla lagi naik gak?"    -> dibaca sebagai emiten NAIK
 *   "saya mau beli saham apa?"      -> dibaca sebagai emiten BELI
 *
 * Akibatnya bukan cuma jawaban meleset. Begitu router mengira ada emiten, seluruh
 * gerbang yang bergantung pada "pertanyaan tingkat pasar" ikut mati - termasuk penolakan
 * jujur untuk aset di luar cakupan. Pertanyaan "harga emas hari ini" berubah menjadi
 * analisis sebuah emiten kecil, padahal jawaban yang benar adalah "emas tidak ada di
 * data SahamLens".
 *
 * CARA KERJA PERBAIKAN: huruf besar-kecil pada teks ASLI dipakai sebagai sinyal. Kode
 * saham yang diketik pengguna hampir selalu huruf besar ("BBCA"), sementara kata biasa
 * ditulis huruf kecil. Jadi:
 *   - ditulis KAPITAL semua -> selalu diterima sebagai kode emiten (termasuk "EMAS",
 *     karena orang yang mengetik EMAS memang memaksudkan emitennya);
 *   - ditulis huruf kecil DAN ada di daftar ini -> bukan kode emiten;
 *   - ditulis huruf kecil dan TIDAK ada di daftar ini -> tetap diterima ("bbca gimana"
 *     harus tetap jalan).
 *
 * MENAMBAH KATA: aman. Konsekuensinya hanya bentuk huruf kecilnya berhenti dibaca
 * sebagai emiten; bentuk kapitalnya tetap bekerja. Yang TIDAK boleh dilakukan adalah
 * memasukkan kata yang lebih sering dimaksud sebagai emiten daripada sebagai kata biasa.
 */
export const INDONESIAN_COMMON_4_LETTER_WORDS: ReadonlySet<string> = new Set([
  // kata kerja & aksi yang sering muncul di pertanyaan saham
  'beli', 'jual', 'naik', 'ikut', 'lihat', 'cari', 'jadi', 'buat', 'pake', 'ambil',
  'tahu', 'mau', 'bisa', 'akan', 'agar', 'ubah', 'raih', 'tuju', 'maju', 'olah',
  // sifat & penilaian
  'baik', 'aman', 'enak', 'kuat', 'muda', 'luas', 'unik', 'utuh', 'erat', 'giat',
  'beda', 'lama', 'baru', 'lain', 'laku', 'rata', 'tiap', 'asal', 'awal', 'wajar',
  // benda & konsep umum
  'emas', 'uang', 'pola', 'guna', 'ikan', 'satu', 'juta', 'hari', 'kali', 'kata',
  'nama', 'mata', 'kaki', 'kaca', 'batu', 'ekor', 'alat', 'arah', 'gaji', 'guru',
  'ilmu', 'kaya', 'kena', 'kita', 'saat', 'sisa', 'toko', 'roda', 'pagi', 'tepi',
  'nilai', 'jaga', 'jauh', 'jika', 'juga', 'maka', 'pula', 'saja', 'sama', 'soal',
  'atau', 'yang', 'dari', 'pada', 'oleh', 'akan', 'anda', 'saya', 'kamu', 'dia',
  'apa', 'ini', 'itu', 'mana', 'gimana', 'kapan', 'siapa', 'nanti', 'tadi', 'dulu',
  'lagi', 'masih', 'sudah', 'belum', 'terus', 'sini', 'situ', 'sana',
  // istilah pasar yang bukan kode emiten
  'lots', 'lot', 'bull', 'bear', 'high', 'open', 'stop', 'loss', 'gain', 'risk',
  'buy', 'sell', 'hold', 'call', 'put', 'best', 'good', 'bad', 'top', 'down',
]);

/** Cek satu token teks asli: apakah ia kata biasa, bukan kode emiten. */
export function isCommonWordNotTicker(rawToken: string): boolean {
  // Ditulis KAPITAL semua = pengguna memang memaksudkan kodenya.
  if (rawToken === rawToken.toUpperCase()) return false;
  return INDONESIAN_COMMON_4_LETTER_WORDS.has(rawToken.toLowerCase());
}
