/**
 * Jawaban untuk pertanyaan di luar ranah SahamLens - dibuat DI SERVER, tanpa memanggil AI.
 *
 * Kenapa tidak diserahkan ke model dengan satu aturan tambahan di system prompt:
 * untuk pertanyaan seperti "harga emas hari ini berapa" atau "prediksi bitcoin", model
 * PUNYA jawaban dari data latihnya. Aturan prompt hanya melarang; ia tidak menghapus
 * jawaban itu, dan sudah terbukti berkali-kali di aplikasi ini bahwa larangan prompt
 * kalah oleh dorongan model untuk membantu (rule #10, #14, #16, #21, #22 di
 * build-system-prompt.ts semuanya lahir dari kejadian seperti itu).
 *
 * Menolak lewat kode menghilangkan seluruh kelas kegagalan itu: kalau tidak ada
 * panggilan AI, tidak ada angka yang bisa dikarang. Nadanya tetap ramah dan selalu
 * menawarkan yang memang bisa dikerjakan - menolak bukan berarti membuat pengguna
 * merasa salah bertanya.
 */
export type OutOfScopeReason = 'NON_MARKET' | 'OUT_OF_COVERAGE';

const NON_MARKET =
  'Pertanyaan itu di luar hal yang saya kerjakan - saya asisten analisis saham IDX di SahamLens, ' +
  'jadi saya tidak punya sumber yang bisa dipertanggungjawabkan untuk menjawabnya, dan saya lebih ' +
  'baik bilang tidak tahu daripada mengarang. Kalau soal saham Indonesia, IHSG, sektor, atau fitur ' +
  'SahamLens, silakan - itu bagian saya.';

const OUT_OF_COVERAGE =
  'Itu pertanyaan keuangan yang wajar, tapi datanya tidak ada di SahamLens: aplikasi ini hanya ' +
  'memuat saham yang tercatat di Bursa Efek Indonesia. Saya tidak akan menebak angkanya dari ingatan. ' +
  'Kalau mau, saya bisa bantu untuk emiten IDX - sebutkan kodenya, atau tanya kondisi IHSG dan sektor hari ini.';

export function outOfScopeResponse(reason: OutOfScopeReason | undefined): string {
  return reason === 'OUT_OF_COVERAGE' ? OUT_OF_COVERAGE : NON_MARKET;
}
