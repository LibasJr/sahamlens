import { describe, expect, it } from 'vitest';
import { createStreamGate } from '../stream-gate';

const DATA = `
- Level terakhir: 7250.50
- Perubahan: -1.52 poin (-1.52%)
- RSI 14 IHSG: 62.34
`;

/** Bantu simulasi aliran: potongan kecil-kecil seperti token model sungguhan. */
function feed(gate: ReturnType<typeof createStreamGate>, text: string, chunkSize = 7) {
  let released = '';
  let blocked = false;
  for (let i = 0; i < text.length; i += chunkSize) {
    const result = gate.push(text.slice(i, i + chunkSize));
    released += result.release;
    if (result.blocked) blocked = true;
  }
  const tail = gate.flush();
  released += tail.release;
  return { released, blocked: blocked || tail.blocked };
}

describe('teks yang angkanya benar dilepas bertahap', () => {
  it('melepas paragraf begitu utuh, tidak menunggu jawaban selesai', () => {
    const gate = createStreamGate([DATA]);
    const first = gate.push('IHSG melemah 1,52% hari ini.\n\n');
    // Inti Opsi C: paragraf pertama sudah boleh tampil padahal jawaban belum selesai.
    expect(first.release).toContain('1,52%');
    expect(first.blocked).toBe(false);
  });

  it('seluruh isi tersampaikan utuh saat aliran selesai', () => {
    const gate = createStreamGate([DATA]);
    const text = 'IHSG melemah 1,52%.\n\nRSI-nya 62,34 - masih netral.\n\nBreadth-nya negatif.';
    const { released, blocked } = feed(gate, text);
    expect(blocked).toBe(false);
    expect(released).toBe(text);
  });

  it('paragraf panjang tanpa baris kosong tetap mengalir per kalimat', () => {
    // Tanpa aturan ini, satu paragraf panjang membuat streaming diam-diam merosot
    // menjadi "tunggu sampai selesai" - persis yang ingin dihindari.
    const gate = createStreamGate([DATA]);
    const long =
      'IHSG melemah 1,52% pada perdagangan hari ini dan pelemahannya cukup merata di berbagai sektor. ' +
      'Level terakhirnya 7250,50 setelah sempat tertekan lebih dalam pada sesi pertama perdagangan. ' +
      'RSI-nya 62,34 sehingga belum masuk wilayah jenuh jual.';
    let releasedBeforeEnd = '';
    for (let i = 0; i < long.length; i += 20) {
      releasedBeforeEnd += gate.push(long.slice(i, i + 20)).release;
    }
    expect(releasedBeforeEnd.length).toBeGreaterThan(0);
    expect(releasedBeforeEnd + gate.flush().release).toBe(long);
  });
});

describe('angka karangan tidak pernah sampai ke layar', () => {
  it('menahan paragraf yang memuat angka tak tertelusur', () => {
    const gate = createStreamGate([DATA]);
    const result = gate.push('IHSG turun sekitar 0,25% hari ini.\n\n');
    // Kejadian nyata yang melahirkan aturan #21: model menulis -0,25% sementara data
    // server bilang -1,52%.
    expect(result.release).toBe('');
    expect(result.blocked).toBe(true);
    expect(result.verification?.unverified).toContain('0,25');
  });

  it('setelah tertahan, tidak ada teks lanjutan yang bocor', () => {
    const gate = createStreamGate([DATA]);
    gate.push('IHSG turun sekitar 0,25%.\n\n');
    const after = gate.push('Sektor energi memimpin pelemahan.\n\n');
    expect(after.release).toBe('');
    expect(gate.isBlocked).toBe(true);
  });

  it('angka salah di AKHIR jawaban ikut tertahan lewat flush', () => {
    const gate = createStreamGate([DATA]);
    const { released, blocked } = feed(gate, 'Ringkasannya: IHSG di 9999,99.');
    expect(blocked).toBe(true);
    expect(released).toBe('');
  });
});

describe('tidak memotong di tengah angka', () => {
  it('titik pemisah ribuan tidak dianggap akhir kalimat', () => {
    // "7.250" mengandung titik; kalau dipotong di sana, verifikasi melihat "7" dan
    // menuduh angka yang sebenarnya benar.
    const gate = createStreamGate(['- Level terakhir: 7250.50']);
    const long = `Level indeks hari ini tercatat di angka 7.250 setelah pergerakan yang relatif tenang sepanjang sesi perdagangan pertama dan kedua di bursa. Angka itu masih di atas rata-rata pekan lalu.`;
    const { released, blocked } = feed(gate, long, 5);
    expect(blocked).toBe(false);
    expect(released).toBe(long);
  });
});
