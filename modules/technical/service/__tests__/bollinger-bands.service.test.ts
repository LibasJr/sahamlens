import { describe, expect, it } from 'vitest';
import { calculateBollingerBands, BOLLINGER_PERIOD } from '../bollinger-bands';

// 25 harga sintetis (gelombang sinus + tren naik) - nilai acuan dihitung lewat
// implementasi KEDUA yang ditulis terpisah, lihat scratchpad/verify-indicators.mjs
// pada sesi pengembangan fitur ini.
const closes25 = [
  1000, 1018.829419696158, 1022.1859485365136, 1008.8224001611974, 992.8639500938415,
  990.8215145067372, 1006.4116900360215, 1027.1397319743758, 1035.7871649324675,
  1026.2423697048353, 1009.1195777822126, 1002.0001958689859, 1013.2685416399913,
  1034.4033407365328, 1047.8121471138975, 1043.0057568031425, 1026.2419336666987,
  1014.7720501624088, 1020.9802550645664, 1040.997544193259, 1058.2589050145525,
  1058.7331127707212, 1043.8229738141918, 1029.0755919164967, 1029.8884327598676,
];

describe('calculateBollingerBands - GOLDEN (nilai acuan dari implementasi independen)', () => {
  it('25 harga, k=2 -> middle/upper/lower/percentB cocok dengan acuan', () => {
    const price = closes25[closes25.length - 1]!;
    const result = calculateBollingerBands(closes25, price);
    expect(result).not.toBeNull();
    expect(result!.middle).toBeCloseTo(1027.9391415230982, 6);
    expect(result!.upper).toBeCloseTo(1063.5266684477688, 6);
    expect(result!.lower).toBeCloseTo(992.3516145984278, 6);
    expect(result!.bandwidthPct).toBeCloseTo(6.924053280419002, 6);
    expect(result!.percentB).toBeCloseTo(0.527387281517137, 6);
  });
});

describe('calculateBollingerBands - standar deviasi POPULASI, bukan sampel', () => {
  it('deret konstan -> stddev = 0 -> upper = middle = lower, dan %B null (BUKAN 0,5)', () => {
    const flat = Array.from({ length: BOLLINGER_PERIOD }, () => 1000);
    const result = calculateBollingerBands(flat, 1000);
    expect(result!.upper).toBeCloseTo(1000, 8);
    expect(result!.lower).toBeCloseTo(1000, 8);
    // bandwidthPct = 0 adalah PENGUKURAN NYATA (lebarnya memang nol) - tetap dilaporkan.
    expect(result!.bandwidthPct).toBeCloseTo(0, 8);
    // %B = posisi relatif di dalam band yang tidak punya lebar -> pembagian nol, tidak
    // terdefinisi. FAIL-CLOSED, bukan 0,5 ("titik tengah") yang tidak bisa dibedakan
    // dari harga yang memang benar-benar di tengah band (kelas temuan C-7).
    expect(result!.percentB).toBeNull();
  });

  it('dua nilai bergantian (mudah dihitung tangan): mean=15, populasi stddev=5, bukan sampel stddev=~5.29', () => {
    // [10,20,10,20,...] period=20: mean=15, variance populasi = ((5^2)*20)/20 = 25, sd=5.
    // Kalau salah pakai pembagi n-1 (sampel), sd akan jadi sqrt(25*20/19)=~5.13, upper beda.
    const values = Array.from({ length: BOLLINGER_PERIOD }, (_, i) => (i % 2 === 0 ? 10 : 20));
    const result = calculateBollingerBands(values, 15, BOLLINGER_PERIOD, 2);
    expect(result!.middle).toBeCloseTo(15, 6);
    expect(result!.upper).toBeCloseTo(15 + 2 * 5, 6); // = 25
    expect(result!.lower).toBeCloseTo(15 - 2 * 5, 6); // = 5
  });
});

describe('calculateBollingerBands - guard', () => {
  it('closes kurang dari period -> null', () => {
    expect(calculateBollingerBands(Array(BOLLINGER_PERIOD - 1).fill(1000), 1000)).toBeNull();
  });

  it('currentPrice tidak valid -> null', () => {
    const closes = Array.from({ length: BOLLINGER_PERIOD }, () => 1000);
    expect(calculateBollingerBands(closes, 0)).toBeNull();
    expect(calculateBollingerBands(closes, NaN)).toBeNull();
  });

  it('harga di atas upper band -> percentB > 1; di bawah lower band (tapi tetap positif) -> percentB < 0', () => {
    // Band dari deret ini: middle=15, upper=25, lower=5 (lihat test di atas).
    const closes = Array.from({ length: BOLLINGER_PERIOD }, (_, i) => (i % 2 === 0 ? 10 : 20));
    const above = calculateBollingerBands(closes, 100, BOLLINGER_PERIOD, 2);
    const below = calculateBollingerBands(closes, 1, BOLLINGER_PERIOD, 2);
    expect(above!.percentB).toBeGreaterThan(1);
    expect(below!.percentB).toBeLessThan(0);
  });
});
