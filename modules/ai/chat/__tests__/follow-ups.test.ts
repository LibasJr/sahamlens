import { describe, expect, it } from 'vitest';
import { FOLLOWUP_MARKER, FollowUpStreamStripper, parseFollowUps, splitFollowUpList } from '../follow-ups';

describe('parseFollowUps (jalur non-streaming)', () => {
  it('memisahkan marker + daftar saran dari jawaban', () => {
    const answer = `ANTM naik karena volume.\n\nDetail teknikalnya oke.\n\n${FOLLOWUP_MARKER} Bagaimana fundamentalnya? | Bandingkan dengan saham sejenis | Kapan ex-dividend?`;
    const { text, followUps } = parseFollowUps(answer);
    expect(text).toBe('ANTM naik karena volume.\n\nDetail teknikalnya oke.');
    expect(followUps).toEqual(['Bagaimana fundamentalnya?', 'Bandingkan dengan saham sejenis', 'Kapan ex-dividend?']);
  });

  it('TIDAK menelan penutup DYOR yang ditempel SETELAH baris marker', () => {
    // Urutan aktual di server: jawaban model (dengan marker) -> withDyor menambah
    // penafian di bawahnya. Penafian bukan saran dan harus tetap ada di teks.
    const answer = `Jawaban inti.\n\n${FOLLOWUP_MARKER} Lanjut fundamental? | Cek grafik`;
    const withDyor = `${answer}\n\n---\n_Semua angka di atas berasal dari data SahamLens..._`;
    const { text, followUps } = parseFollowUps(withDyor);
    expect(followUps).toEqual(['Lanjut fundamental?', 'Cek grafik']);
    expect(text).toContain('Semua angka di atas berasal dari data SahamLens');
    expect(text).toContain('Jawaban inti.');
    expect(text).not.toContain(FOLLOWUP_MARKER);
  });

  it('jawaban tanpa marker tidak berubah dan tidak punya saran', () => {
    const answer = 'Jawaban biasa tanpa marker.';
    const { text, followUps } = parseFollowUps(answer);
    expect(text).toBe(answer);
    expect(followUps).toEqual([]);
  });

  it('membatasi maksimal 3 saran dan membuang entri kosong/terlalu panjang', () => {
    const raw = ' a |  | b | c | d | e ';
    expect(splitFollowUpList(raw)).toEqual(['a', 'b', 'c']);
    expect(splitFollowUpList('x'.repeat(150))).toEqual([]);
  });

  it('membersihkan penanda daftar yang suka ditambah model (angka/bullet)', () => {
    expect(splitFollowUpList('1. Yang pertama | - Yang kedua | • Yang ketiga')).toEqual([
      'Yang pertama',
      'Yang kedua',
      'Yang ketiga',
    ]);
  });
});

describe('FollowUpStreamStripper (jalur streaming)', () => {
  const drainAll = (chunks: string[]) => {
    const stripper = new FollowUpStreamStripper();
    const released = chunks.map((chunk) => stripper.push(chunk)).join('') + stripper.flush();
    return { released, captured: stripper.captured };
  };

  it('marker utuh dalam satu chunk: teksnya ditampilkan, baris marker ditelan', () => {
    const { released, captured } = drainAll(['Jawaban. ' + FOLLOWUP_MARKER + ' Saran A | Saran B\n']);
    expect(released).toBe('Jawaban. ');
    expect(captured).toBe(' Saran A | Saran B');
  });

  it('marker TERPOTONG antar chunk tidak pernah terlihat pengguna', () => {
    // Chunk di sini disimulasikan terpotong di tengah marker - kasus nyata karena
    // provider mengalirkan token, bukan kalimat utuh.
    const { released, captured } = drainAll(['Jawaban. [[', 'FOLLOWUP]] Saran A\nSelesai.']);
    expect(released).not.toContain('[[');
    expect(released).toContain('Jawaban. ');
    expect(released).toContain('Selesai.');
    expect(captured).toBe(' Saran A');
  });

  it('marker di baris tanpa newline sampai akhir stream tetap ditelan penuh', () => {
    const { released, captured } = drainAll(['Jawaban. ' + FOLLOWUP_MARKER + ' Saran A | Saran B']);
    expect(released).toBe('Jawaban. ');
    expect(captured).toBe(' Saran A | Saran B');
  });

  it('[[ biasa (bukan marker, mis. markdown) tetap tampil', () => {
    const { released, captured } = drainAll(['Teks [[umum]] biasa.']);
    expect(released).toBe('Teks [[umum]] biasa.');
    expect(captured).toBeNull();
  });

  it('tanpa marker sama sekali: keluaran identik dengan masukan', () => {
    const chunks = ['Paragraf pertama.\n\n', 'Paragraf kedua dengan angka 620.'];
    const { released, captured } = drainAll(chunks);
    expect(released).toBe(chunks.join(''));
    expect(captured).toBeNull();
  });
});
