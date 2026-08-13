import { verifyAnswerNumbers, type NumberVerification } from './verify-numbers';

/**
 * Gerbang pelepasan teks streaming: teks hanya sampai ke layar SETELAH angkanya lolos
 * verifikasi.
 *
 * MASALAH YANG DIPECAHKAN. Streaming polos mengalirkan token apa adanya, jadi angka
 * karangan terbaca pengguna pada detik pertama dan koreksi apa pun datang terlambat -
 * catatan di bawah jawaban tidak menghapus angka yang sudah masuk kepala. Itu akan
 * membuka kembali persis kelas bug yang melahirkan aturan #21 di system prompt, hanya
 * dengan catatan kaki.
 *
 * YANG MEMUNGKINKAN JALAN TENGAH: verifikasi angka di repo ini deterministik dan tidak
 * memanggil AI (lihat verify-numbers.ts). Biayanya mikrodetik, bukan detik. Jadi teks
 * tidak perlu ditahan sampai jawaban selesai - cukup sampai satu SATUAN UTUH yang
 * angkanya sudah lengkap, lalu diperiksa dan dilepas.
 *
 * SATUAN PELEPASAN. Paragraf (`\n\n`) adalah satuan utama. Tapi model kadang menulis
 * satu paragraf panjang tanpa baris kosong sama sekali - kalau hanya paragraf yang
 * dipakai, streaming-nya diam-diam merosot jadi "tunggu sampai selesai". Karena itu
 * kalimat yang sudah melewati ambang panjang juga boleh dilepas. Yang TIDAK pernah
 * dilepas adalah potongan di tengah kalimat: "RSI-nya 62" bisa saja lanjutan dari
 * "62,34" yang belum utuh, dan memverifikasi angka setengah jadi hanya menghasilkan
 * tuduhan palsu.
 */

/** Panjang minimum sebelum akhir kalimat dianggap titik pelepasan yang layak. */
const MIN_SENTENCE_FLUSH_CHARS = 180;

export interface StreamGateResult {
  /** Teks yang boleh dikirim ke pengguna sekarang. String kosong = belum ada. */
  release: string;
  /** true kalau satuan ini memuat angka yang tidak tertelusur - aliran harus dihentikan. */
  blocked: boolean;
  /** Hasil verifikasi satuan yang baru saja diperiksa, kalau memang ada yang diperiksa. */
  verification: NumberVerification | null;
}

const EMPTY: StreamGateResult = { release: '', blocked: false, verification: null };

/**
 * @param sources teks sumber yang sah (blok data terverifikasi, prompt, riwayat) -
 *                sama persis dengan yang dipakai verifikasi jawaban utuh.
 */
export function createStreamGate(sources: string[]) {
  let pending = '';
  let blocked = false;

  /** Cari batas satuan yang aman untuk dilepas. Return panjang potong, atau 0. */
  function cutLength(buffer: string): number {
    const paragraphEnd = buffer.indexOf('\n\n');
    if (paragraphEnd !== -1) return paragraphEnd + 2;

    if (buffer.length < MIN_SENTENCE_FLUSH_CHARS) return 0;

    // Akhir kalimat = tanda baca penutup DIIKUTI spasi/baris baru. Menuntut pemisah
    // setelahnya penting: titik juga dipakai sebagai pemisah ribuan ("1.234"), dan
    // memotong di sana akan membelah angka jadi dua potongan yang salah dibaca.
    const match = /[.!?](\s)/g;
    let lastSafe = 0;
    let found: RegExpExecArray | null;
    while ((found = match.exec(buffer)) !== null) {
      lastSafe = found.index + 1;
    }
    return lastSafe >= MIN_SENTENCE_FLUSH_CHARS ? lastSafe : 0;
  }

  return {
    /** Masukkan potongan dari provider. Kembalikan apa yang boleh tampil sekarang. */
    push(delta: string): StreamGateResult {
      if (blocked) return EMPTY;
      pending += delta;

      const cut = cutLength(pending);
      if (cut === 0) return EMPTY;

      const unit = pending.slice(0, cut);
      const verification = verifyAnswerNumbers(unit, sources);

      if (!verification.ok) {
        // Satuan ini TIDAK dilepas. Sisa buffer sengaja dibiarkan utuh: pemanggil akan
        // membuang seluruh jawaban ini dan menggantinya dengan hasil perbaikan.
        blocked = true;
        return { release: '', blocked: true, verification };
      }

      pending = pending.slice(cut);
      return { release: unit, blocked: false, verification };
    },

    /** Dipanggil saat aliran selesai - memeriksa sisa yang belum sempat dilepas. */
    flush(): StreamGateResult {
      if (blocked || !pending.trim()) {
        pending = '';
        return EMPTY;
      }
      const unit = pending;
      pending = '';
      const verification = verifyAnswerNumbers(unit, sources);
      if (!verification.ok) {
        blocked = true;
        return { release: '', blocked: true, verification };
      }
      return { release: unit, blocked: false, verification };
    },

    get isBlocked() {
      return blocked;
    },
  };
}
