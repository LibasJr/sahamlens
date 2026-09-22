/**
 * Saran pertanyaan lanjutan (operator, 2026-09-22): model diminta menutup jawaban
 * dengan marker [[FOLLOWUP]] yang berisi 2-3 saran pertanyaan berikutnya dipisah `|`.
 * Server mem-parse, MEMBUANG marker dari teks yang ditampilkan, lalu mengirim daftar
 * terpisah ke klien untuk dirender sebagai chip yang bisa diklik.
 *
 * KENAPA MARKER, BUKAN FIELD JSON TERPISAH. Jawaban mengalir lewat satu jalur teks
 * (streaming + jalur JSON) yang sudah punya gerbang verifikasi angka; menyisipkan
 * saluran kedua berarti mengubah kontrak provider di banyak tempat. Marker di akhir
 * jawaban adalah satu titik parse, mudah diuji, dan aman dihapus - model yang lupa
 * menulis marker tidak merusak apa pun (fallback: chip tidak tampil).
 */

export const FOLLOWUP_MARKER = '[[FOLLOWUP]]';
const FOLLOWUP_MARKER_RE = /\[\[FOLLOWUP\]\]/;
const MAX_FOLLOW_UPS = 3;

/** Pecah isi baris marker jadi daftar pertanyaan bersih. */
export function splitFollowUpList(raw: string): string[] {
  return raw
    .split('|')
    .map((item) => item.replace(/^[\s\-•*\d.)]+/, '').trim())
    .filter((item) => item.length > 0 && item.length <= 120)
    .slice(0, MAX_FOLLOW_UPS);
}

/**
 * Jalur non-streaming: pisahkan marker dari jawaban utuh. Marker harus berada di
 * barisnya sendiri (atau mengakhiri baris terakhir jawaban inti) - teks SETELAH
 * baris marker (mis. penutup DYOR yang ditempel server) tidak ikut jadi saran.
 */
export function parseFollowUps(answer: string): { text: string; followUps: string[] } {
  const match = FOLLOWUP_MARKER_RE.exec(answer);
  if (!match) return { text: answer, followUps: [] };

  const start = match.index;
  const lineEnd = answer.indexOf('\n', start);
  const rawList = lineEnd === -1 ? answer.slice(start + FOLLOWUP_MARKER.length) : answer.slice(start + FOLLOWUP_MARKER.length, lineEnd);
  const text = (answer.slice(0, start) + (lineEnd === -1 ? '' : answer.slice(lineEnd))).replace(/\n{3,}/g, '\n\n').trimEnd();
  return { text, followUps: splitFollowUpList(rawList) };
}

/**
 * Jalur streaming: teks dilepas per satuan ke pengguna SEBELUM jawaban selesai,
 * jadi marker bisa tampil sebagian di layar kalau tidak ditahan. Stripper ini
 * menahan bagian ekor yang berpotensi menjadi awal marker (maksimal 12 karakter),
 * menelan baris marker penuh (isi saran tidak boleh terlihat mengalir), dan
 * melepas semua teks lain apa adanya.
 */
export class FollowUpStreamStripper {
  private buffer = '';
  private inMarkerLine = false;
  private capturedRaw: string | null = null;

  /** Kembalikan teks yang AMAN ditampilkan dari chunk ini (boleh string kosong). */
  push(chunk: string): string {
    this.buffer += chunk;
    return this.drain();
  }

  /** Panggil sekali di akhir stream - melepas sisa teks yang masih ditahan. */
  flush(): string {
    if (this.inMarkerLine) {
      // Baris marker belum ditutup newline sampai stream selesai - isinya tetap
      // ditelan (tidak boleh tampil), dan dijadikan kandidat saran.
      this.capturedRaw = this.buffer;
      this.buffer = '';
      this.inMarkerLine = false;
      return '';
    }
    const rest = this.buffer;
    this.buffer = '';
    return rest;
  }

  /** Isi mentah baris setelah marker (untuk di-parse jadi daftar saran). */
  get captured(): string | null {
    return this.capturedRaw;
  }

  private drain(): string {
    let out = '';
    for (;;) {
      if (this.inMarkerLine) {
        const lineEnd = this.buffer.indexOf('\n');
        if (lineEnd === -1) return out; // baris marker belum selesai - tahan semuanya
        this.capturedRaw = this.buffer.slice(0, lineEnd);
        this.buffer = this.buffer.slice(lineEnd + 1);
        this.inMarkerLine = false;
        continue;
      }
      const open = this.buffer.indexOf('[[');
      if (open === -1) {
        out += this.buffer;
        this.buffer = '';
        return out;
      }
      out += this.buffer.slice(0, open);
      this.buffer = this.buffer.slice(open);
      if (this.buffer.startsWith(FOLLOWUP_MARKER)) {
        this.inMarkerLine = true;
        this.buffer = this.buffer.slice(FOLLOWUP_MARKER.length);
        continue;
      }
      if (isPrefixOfMarker(this.buffer)) {
        // Bisa jadi awal marker yang terpotong antar chunk - tahan dulu.
        return out;
      }
      // '[[' biasa (bukan marker) - lepas satu karakter, lanjut memindai.
      out += this.buffer[0];
      this.buffer = this.buffer.slice(1);
    }
  }
}

function isPrefixOfMarker(text: string): boolean {
  return FOLLOWUP_MARKER.startsWith(text);
}
