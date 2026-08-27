import { describe, expect, it } from 'vitest';
import { parseLooseNumber, verifyAnswerNumbers, verifyStructuredEvidence } from '../verify-numbers';

/**
 * Lapisan ini menuduh model mengarang, jadi ambang salah-tuduhnya harus rendah:
 * satu peringatan palsu yang muncul di jawaban benar akan membuat pengguna berhenti
 * mempercayai peringatan itu sama sekali. Karena itu blok "tidak boleh salah tuduh"
 * di bawah sama pentingnya dengan blok "harus menangkap".
 */

const DATA_BLOCK = `
## Data Terverifikasi Server (OTORITATIF):
- Harga terakhir: 9750.00
- RSI 14: 62.34
- Perubahan: -1.52 poin (-1.52%)
- Nilai transaksi: 1.234.567.890
`;

describe('parseLooseNumber menangani dua konvensi angka sekaligus', () => {
  it.each([
    ['9750.00', 9750],
    ['62.34', 62.34],
    ['-1.52', -1.52],
    ['1.234.567', 1234567],
    ['1.234,56', 1234.56],
    ['1,234.56', 1234.56],
  ])('%s -> %s', (raw, expected) => {
    expect(parseLooseNumber(raw)).toBeCloseTo(expected, 4);
  });

  it('tiga digit setelah pemisah terakhir dibaca sebagai ribuan, bukan desimal', () => {
    // toLocaleString('id-ID') menghasilkan bentuk ini di blok data - salah baca di sini
    // membuat nilai transaksi miliaran dikira angka satuan.
    expect(parseLooseNumber('1.234')).toBe(1234);
  });
});

describe('menangkap angka yang tidak ada di data', () => {
  it('menandai harga karangan', () => {
    const result = verifyAnswerNumbers('Harganya sekarang di 8250.00 dan menarik.', [DATA_BLOCK]);
    expect(result.ok).toBe(false);
    expect(result.unverified).toContain('8250.00');
  });

  it('menandai persentase karangan - kasus nyata yang memicu aturan #21', () => {
    // Kejadian aslinya: model menjawab "turun sekitar 0,25%" sementara header aplikasi
    // menampilkan -1,52% dari sumber yang sama.
    const result = verifyAnswerNumbers('IHSG turun sekitar 0,25% hari ini.', [DATA_BLOCK]);
    expect(result.ok).toBe(false);
  });
});

describe('tidak boleh salah tuduh', () => {
  it('menerima angka yang sama persis dari data', () => {
    const result = verifyAnswerNumbers('RSI-nya 62.34 dan harga 9750.00.', [DATA_BLOCK]);
    expect(result.ok).toBe(true);
  });

  it('menerima pembulatan yang wajar', () => {
    const result = verifyAnswerNumbers('RSI-nya sekitar 62,3.', [DATA_BLOCK]);
    expect(result.ok).toBe(true);
  });

  it('menerima nilai transaksi berformat Indonesia', () => {
    const result = verifyAnswerNumbers('Nilai transaksinya 1.234.567.890.', [DATA_BLOCK]);
    expect(result.ok).toBe(true);
  });

  it('mengabaikan angka bulat kecil - itu hitungan/urutan, bukan klaim data', () => {
    const result = verifyAnswerNumbers('Ada 3 dari 5 indikator yang bullish, horizon 20 hari.', [DATA_BLOCK]);
    expect(result.ok).toBe(true);
  });

  it('mengabaikan tahun', () => {
    const result = verifyAnswerNumbers('Data ini sejak 2025 sampai 2026.', [DATA_BLOCK]);
    expect(result.ok).toBe(true);
  });

  it('menerima angka yang ditulis pengguna sendiri di pertanyaannya', () => {
    // "anggap PER-nya 7,5" - angka milik pengguna, sah dipakai dalam jawaban.
    const result = verifyAnswerNumbers('Kalau PER 7,5 seperti yang kamu sebut, maka...', [
      DATA_BLOCK,
      'anggap PER-nya 7,5 ya',
    ]);
    expect(result.ok).toBe(true);
  });

  it('menerima angka tanpa tanda minus saat arah dibawa kata', () => {
    // Blok data menulis "-1.52"; model menjawab "melemah 1,52%". Itu benar - arah
    // dibawa kata "melemah", dan begitulah bahasa Indonesia yang wajar. Pencocokan
    // peka tanda dulu menuduhnya mengarang.
    const result = verifyAnswerNumbers('IHSG melemah 1,52% hari ini.', [DATA_BLOCK]);
    expect(result.ok).toBe(true);
  });

  it('BATAS YANG DIAKUI: kesalahan arah tidak terdeteksi lapisan ini', () => {
    // "menguat" padahal data bilang turun akan lolos - pemeriksa ini melihat digit,
    // bukan makna kalimat. Arah dijaga blok data ("Arah: TURUN") dan aturan #21 di
    // system prompt. Ditulis sebagai test supaya batasnya tidak terlupakan dan tidak
    // ada yang mengira lapisan ini menjamin lebih dari yang bisa dijaminnya.
    const result = verifyAnswerNumbers('IHSG menguat 1,52% hari ini.', [DATA_BLOCK]);
    expect(result.ok).toBe(true);
  });

  it('tidak memeriksa apa pun kalau jawabannya memang tanpa angka', () => {
    const result = verifyAnswerNumbers('Datanya belum tersedia, jadi saya belum bisa menyimpulkan.', [DATA_BLOCK]);
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(0);
  });
});

describe('structured evidence acceptance cases', () => {
  it('menandai wrong price ketika jawaban mengklaim harga yang sumber sebut tidak tersedia', () => {
    const result = verifyStructuredEvidence('Harga terakhir saham ini 8250 dan masih layak dipantau.', [
      'Harga terakhir: tidak tersedia',
    ]);
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.kind)).toContain('WRONG_PRICE');
  });

  it('menandai stale price ketika data stale dibingkai sebagai live/current', () => {
    const result = verifyStructuredEvidence('Harga live/current sekarang masih kuat.', [
      'price_stale: true\nmarket_status: closed',
    ]);
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.kind)).toContain('STALE_PRICE');
  });

  it('menandai wrong period ketika periode jawaban tidak ada di sumber', () => {
    const result = verifyStructuredEvidence('Untuk periode 2026-06-30, labanya membaik.', [
      'period_end: 2026-03-31\nNet income: 1200000',
    ]);
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.kind)).toContain('WRONG_PERIOD');
  });

  it('menandai hallucinated metric ketika metrik tidak ada di sumber', () => {
    const result = verifyStructuredEvidence('PER emiten ini masih murah.', [
      'PBV: 1.2\nROE: 14%',
    ]);
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.kind)).toContain('HALLUCINATED_METRIC');
  });

  it('menandai unsupported recommendation ketika rekomendasi actionable tidak didukung', () => {
    const result = verifyStructuredEvidence('Rekomendasi saya: beli sekarang.', [
      'decision.advisory=false\nrecommendation_supported: false',
    ]);
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.kind)).toContain('UNSUPPORTED_RECOMMENDATION');
  });

  it('menandai conflicting sources ketika konflik sumber tidak disebutkan di jawaban', () => {
    const result = verifyStructuredEvidence('Kesimpulannya stabil dan datanya jelas.', [
      'conflicting_sources: true\nIDX dan provider lain berbeda',
    ]);
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.kind)).toContain('CONFLICTING_SOURCES');
  });
});
