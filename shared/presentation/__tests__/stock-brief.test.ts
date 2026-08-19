import { describe, expect, it } from 'vitest';
import { susunTemuanDimensi } from '../stock-brief';

/**
 * Blok "Yang penting dari [ticker]" adalah hal PERTAMA yang dibaca pengguna di halaman
 * emiten. Kalau ia salah membaca `dimensions`, yang muncul bukan error - melainkan
 * kalimat yang terlihat meyakinkan dan menyatakan arah yang keliru. Test ini menjaga
 * tiga hal yang membuat perbedaan itu.
 */

const dimensi = (over: Partial<Record<string, unknown>> = {}) => ({
  dimension: 'TREND',
  weight: 35,
  direction: 'BULLISH',
  votedAnalyzers: 3,
  analyzers: ['EMA Cross', 'MACD'],
  ...over,
});

describe('temuan dimensi', () => {
  it('membuang dimensi tanpa analyzer berarah - itu bukan "netral"', () => {
    // votedAnalyzers 0 berarti tidak ada yang bisa dikatakan. Menampilkannya sebagai
    // "netral" menyamakan ketiadaan data dengan analyzer yang saling bertentangan.
    const hasil = susunTemuanDimensi([
      dimensi({ dimension: 'FLOW', votedAnalyzers: 0, direction: 'NEUTRAL' }),
      dimensi(),
    ]);
    expect(hasil).toHaveLength(1);
    expect(hasil[0].judul).toBe('Tren menguat');
  });

  it('mengurutkan menurut bobot dimensi, bukan urutan datang dari API', () => {
    const hasil = susunTemuanDimensi([
      dimensi({ dimension: 'VOLATILITY', weight: 5 }),
      dimensi({ dimension: 'TREND', weight: 35 }),
      dimensi({ dimension: 'MOMENTUM', weight: 25 }),
    ]);
    expect(hasil.map((t) => t.judul)).toEqual(['Tren menguat', 'Momentum membaik', 'Volatilitas mereda']);
  });

  it('tidak pernah lebih dari lima temuan', () => {
    const banyak = Array.from({ length: 9 }, (_, i) => dimensi({ dimension: `X${i}`, weight: 9 - i }));
    expect(susunTemuanDimensi(banyak)).toHaveLength(5);
  });

  it('tidak mengubah larik masukan', () => {
    const masukan = [dimensi({ weight: 5 }), dimensi({ weight: 35 })];
    const salinan = JSON.parse(JSON.stringify(masukan));
    susunTemuanDimensi(masukan);
    expect(masukan).toEqual(salinan);
  });

  it('arah dipetakan apa adanya, termasuk NEUTRAL', () => {
    expect(susunTemuanDimensi([dimensi({ direction: 'BEARISH' })])[0]).toMatchObject({
      arah: 'BEARISH',
      judul: 'Tren melemah',
    });
    expect(susunTemuanDimensi([dimensi({ direction: 'NEUTRAL' })])[0]).toMatchObject({
      arah: 'NEUTRAL',
      judul: 'Tren belum satu arah',
    });
    // Nilai arah yang tidak dikenali TIDAK boleh jatuh ke BULLISH.
    expect(susunTemuanDimensi([dimensi({ direction: 'ENTAH' })])[0].arah).toBe('NEUTRAL');
  });

  it('bukti menyebut analyzer yang memilih dan bobotnya', () => {
    const [temuan] = susunTemuanDimensi([dimensi({ analyzers: ['EMA Cross', 'MACD'], votedAnalyzers: 2, weight: 35 })]);
    expect(temuan.bukti).toContain('EMA Cross');
    expect(temuan.bukti).toContain('MACD');
    expect(temuan.bukti).toContain('2 analyzer berarah');
    expect(temuan.bukti).toContain('35%');
  });

  it('tetap aman saat daftar analyzer hilang atau bukan string', () => {
    const [temuan] = susunTemuanDimensi([dimensi({ analyzers: [null, 42, 'RSI'] })]);
    expect(temuan.bukti).toContain('RSI');
    expect(temuan.bukti).not.toContain('42');
    expect(() => susunTemuanDimensi([dimensi({ analyzers: undefined })])).not.toThrow();
  });

  it('dimensi yang belum punya salinan bahasa tetap terbaca', () => {
    const [temuan] = susunTemuanDimensi([dimensi({ dimension: 'LIKUIDITAS' })]);
    expect(temuan.judul).toBe('LIKUIDITAS positif');
  });
});
