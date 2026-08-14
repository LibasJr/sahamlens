/**
 * Verifikasi angka jawaban terhadap Data Terverifikasi Server.
 *
 * KENAPA INI ADA. Sistem prompt LensAI sudah memuat 25 aturan, dan lima di antaranya
 * (#10, #14, #16, #21, #22) lahir dari kejadian yang sama persis: model mengisi angka
 * yang tidak ada di data. Setiap kali itu terjadi, jawabannya adalah menambah satu
 * aturan lagi. Pendekatan itu punya batas - aturan melarang, tapi tidak memeriksa, dan
 * satu-satunya yang tahu apakah larangan itu dipatuhi adalah pengguna yang kebetulan
 * memergokinya lewat screenshot.
 *
 * Lapisan ini memeriksa. Ia tidak menggantikan aturan prompt; ia menangkap sisanya.
 *
 * YANG DIPERIKSA, dan kenapa hanya itu. Memeriksa SEMUA angka akan salah tuduh terus:
 * model wajar menulis "3 dari 5 sektor", "20 hari bursa", tahun, atau nomor urut, dan
 * angka-angka itu memang tidak ada di blok data. Yang diperiksa karena itu hanya angka
 * yang bentuknya seperti KLAIM DATA:
 *   - punya bagian desimal (12,34 / 12.34) - harga, rasio, persentase hasil hitungan; atau
 *   - besar (>= 1.000) - level indeks, harga saham, nilai transaksi.
 * Angka bulat kecil sengaja dilewat: itu wilayah hitungan/urutan, bukan klaim data.
 *
 * TOLERANSI PEMBULATAN. Blok data menulis "62.34" sementara model menulis "62,3" - itu
 * pembulatan yang sah, bukan karangan. Pencocokan karena itu dilakukan atas nilai
 * numerik dengan toleransi relatif kecil, bukan atas string.
 *
 * ANGKA MILIK PENGGUNA. Kalau pengguna sendiri menulis "anggap PER 5", angka itu sah
 * muncul di jawaban meski tidak ada di blok server. Prompt dan riwayat karena itu ikut
 * jadi sumber yang diterima.
 */

export interface NumberVerification {
  ok: boolean;
  /** Angka di jawaban yang tidak bisa ditelusuri ke sumber mana pun. */
  unverified: string[];
  /** Berapa angka yang benar-benar diperiksa - dipakai untuk telemetri, bukan keputusan. */
  checked: number;
}

/** Toleransi relatif untuk pembulatan (0,5%). Cukup untuk 62.34 -> 62,3, terlalu ketat untuk tebakan. */
const RELATIVE_TOLERANCE = 0.005;

/**
 * Angka dengan pemisah ribuan dan/atau desimal, dalam dua konvensi sekaligus.
 * Blok data memakai keduanya: `toFixed()` menghasilkan "1234.56" (titik desimal)
 * sementara `toLocaleString('id-ID')` menghasilkan "1.234.567" (titik ribuan).
 */
const NUMBER_PATTERN = /-?\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?|-?\d+[.,]\d+|-?\d{4,}/g;

/**
 * Ubah teks angka jadi nilai. Menangani "1.234,56" (id-ID) dan "1,234.56" (en-US)
 * dengan menebak pemisah desimal dari posisi pemisah TERAKHIR.
 */
export function parseLooseNumber(raw: string): number | null {
  const text = raw.trim();
  if (!/\d/.test(text)) return null;

  const lastDot = text.lastIndexOf('.');
  const lastComma = text.lastIndexOf(',');
  let normalized: string;

  if (lastDot === -1 && lastComma === -1) {
    normalized = text;
  } else {
    const decimalSep = lastDot > lastComma ? '.' : ',';
    const thousandSep = decimalSep === '.' ? ',' : '.';
    const tail = text.slice(text.lastIndexOf(decimalSep) + 1);
    // Tiga digit tepat setelah pemisah terakhir = itu pemisah RIBUAN, bukan desimal
    // ("1.234" adalah seribu dua ratus, bukan 1,234). Kasus ini nyata di blok data
    // karena toLocaleString('id-ID') dipakai untuk nilai transaksi.
    const lastIsThousand = /^\d{3}$/.test(tail);
    normalized = lastIsThousand
      ? text.split(/[.,]/).join('')
      : text.split(thousandSep).join('').replace(decimalSep, '.');
  }

  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function collectNumbers(text: string): Array<{ raw: string; value: number }> {
  // `match` (bukan `matchAll`): tsconfig menargetkan ES5, jadi iterator hasil matchAll
  // tidak bisa di-spread tanpa downlevelIteration.
  const matches = text.match(NUMBER_PATTERN) ?? [];
  const out: Array<{ raw: string; value: number }> = [];
  for (const raw of matches) {
    const value = parseLooseNumber(raw);
    if (value !== null) out.push({ raw, value });
  }
  return out;
}

/** Angka yang bentuknya seperti klaim data - lihat catatan di kepala file. */
function isClaimLike(raw: string, value: number): boolean {
  const magnitude = Math.abs(value);
  // Tahun (1900-2100) sering muncul sebagai konteks periode, bukan klaim angka pasar.
  if (Number.isInteger(value) && magnitude >= 1900 && magnitude <= 2100) return false;
  const hasDecimal = /[.,]\d{1,2}$/.test(raw);
  return hasDecimal || magnitude >= 1000;
}

/**
 * Pencocokan memakai NILAI MUTLAK - tanda plus/minus diabaikan.
 *
 * KENAPA (ditemukan test gerbang streaming, 2026-08-13): blok data menulis
 * "Perubahan: -1.52 poin (-1.52%)", dan model menjawab "IHSG melemah 1,52%". Itu
 * jawaban yang BENAR - arahnya dibawa oleh kata "melemah", bukan oleh tanda minus,
 * dan begitulah bahasa Indonesia yang wajar. Pencocokan yang peka tanda menuduhnya
 * mengarang.
 *
 * BATAS YANG DIAKUI: lapisan ini karena itu TIDAK bisa menangkap kesalahan ARAH -
 * "menguat 1,52%" padahal data bilang turun akan lolos di sini. Itu memang bukan
 * pekerjaan pemeriksa angka: ia melihat digit, bukan makna kalimat. Arah dijaga di
 * tempat lain - blok data mengirim baris "Arah: TURUN" eksplisit, dan aturan #21 di
 * system prompt melarang menyusun angka pergerakan sendiri. Menuduh berdasarkan tanda
 * hanya akan menghasilkan peringatan palsu pada jawaban yang benar, dan peringatan
 * palsu membuat pengguna berhenti mempercayai peringatan yang asli.
 */
function matchesAny(value: number, sources: number[]): boolean {
  const target = Math.abs(value);
  return sources.some((source) => {
    const candidate = Math.abs(source);
    if (candidate === target) return true;
    const scale = Math.max(candidate, target, 1);
    return Math.abs(candidate - target) / scale <= RELATIVE_TOLERANCE;
  });
}

/**
 * Periksa jawaban terhadap data yang benar-benar dikirim ke model.
 *
 * @param answer teks jawaban model
 * @param sources teks sumber yang sah (blok terverifikasi, prompt pengguna, riwayat)
 */
export function verifyAnswerNumbers(answer: string, sources: string[]): NumberVerification {
  const allowed = sources.flatMap((source) => collectNumbers(source).map((n) => n.value));
  const candidates = collectNumbers(answer).filter(({ raw, value }) => isClaimLike(raw, value));

  const unverified: string[] = [];
  for (const candidate of candidates) {
    if (matchesAny(candidate.value, allowed)) continue;
    // Persentase sering ditulis sebagai selisih dua angka sumber ("naik dari 60 ke 62,3
    // berarti 2,3"). Selisih dan rasio sederhana antar-sumber karena itu ikut diterima,
    // supaya penjelasan yang benar tidak tertuduh mengarang.
    const derived = allowed.some((a) => allowed.some((b) => matchesAny(candidate.value, [a - b, (a / (b || 1)) * 100 - 100])));
    if (!derived) unverified.push(candidate.raw);
  }

  return {
    ok: unverified.length === 0,
    unverified: unverified.filter((value, index) => unverified.indexOf(value) === index).slice(0, 8),
    checked: candidates.length,
  };
}

/**
 * Catatan yang ditempelkan kalau setelah satu kali perbaikan masih ada angka yang
 * tidak tertelusur.
 *
 * Sengaja TIDAK menghapus atau menyunting jawaban model: menyunting angka di tengah
 * kalimat bisa menghasilkan kalimat yang salah secara tata bahasa maupun makna. Yang
 * benar adalah menyatakan ketidakpastiannya kepada pengguna, dan membiarkan mereka
 * memutuskan - itu pun jauh lebih jujur daripada diam.
 */
export function unverifiedNumbersNotice(unverified: string[]): string {
  return (
    `\n\n---\n_Catatan: angka ${unverified.join(', ')} di atas tidak dapat saya telusuri ke data server ` +
    'SahamLens, jadi mohon jangan dipakai sebagai acuan sebelum dicek di halaman terkait._'
  );
}
