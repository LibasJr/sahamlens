import { describe, expect, it } from 'vitest';
import { barAtForwardTradingOffset, barAtTradingOffset } from '../history-return-utils';

// REGRESI C-03 (audit kuantitatif 2026-08-11): bar entry backtest tidak boleh jatuh pada
// atau sebelum tanggal sinyal.
//
// Mekanisme kebocoran lamanya halus. `barAtTradingOffset(byDate, calendar, i, 1)` punya
// toleransi DUA ARAH, sehingga urutan probe-nya
//     i+1 -> i -> i+2 -> i-1 -> i+3
// dan probe kedua adalah tanggal sinyal itu sendiri - bar yang SELALU ada di `byDate`,
// karena sinyalnya lahir dari bar itu. Jadi cukup satu hari bursa yang bolong untuk ticker
// tersebut (suspensi, hari scan terlewat, baris yang dibuang gerbang likuiditas) dan entry
// mundur ke bar tanggal sinyal: return dihitung dari open hari itu, sebelum close yang
// melahirkan sinyalnya diketahui.

const CALENDAR = ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09'];
const SIGNAL_INDEX = 2; // 2026-01-07
const SIGNAL_DATE = CALENDAR[SIGNAL_INDEX]!;

const mapOf = (dates: string[]) => new Map(dates.map((d) => [d, { date: d }]));

describe('barAtForwardTradingOffset - entry tidak pernah mundur', () => {
  it('memilih bar bursa berikutnya saat histori ticker lengkap', () => {
    const entry = barAtForwardTradingOffset(mapOf(CALENDAR), CALENDAR, SIGNAL_INDEX, 1);
    expect(entry?.date).toBe('2026-01-08');
  });

  it('menggeser MAJU saat H+1 tidak ada, bukan mundur ke tanggal sinyal', () => {
    // H+1 (08) hilang; H+2 (09) ada.
    const entry = barAtForwardTradingOffset(
      mapOf(['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-09']),
      CALENDAR, SIGNAL_INDEX, 1
    );
    expect(entry?.date).toBe('2026-01-09');
  });

  it('mengembalikan null - BUKAN bar tanggal sinyal - saat tidak ada bar maju', () => {
    const byDate = mapOf(['2026-01-05', '2026-01-06', '2026-01-07']);
    expect(barAtForwardTradingOffset(byDate, CALENDAR, SIGNAL_INDEX, 1)).toBeNull();
  });

  it('tidak pernah mengembalikan bar sebelum tanggal sinyal', () => {
    const byDate = mapOf(['2026-01-06']);
    expect(barAtForwardTradingOffset(byDate, CALENDAR, SIGNAL_INDEX, 1)).toBeNull();
  });

  it('offset nol/negatif ditolak - fungsi ini hanya untuk maju', () => {
    const byDate = mapOf(CALENDAR);
    expect(barAtForwardTradingOffset(byDate, CALENDAR, SIGNAL_INDEX, 0)).toBeNull();
    expect(barAtForwardTradingOffset(byDate, CALENDAR, SIGNAL_INDEX, -1)).toBeNull();
  });

  it('hasilnya selalu lebih baru dari tanggal sinyal, apa pun bentuk histori', () => {
    // Seluruh 2^5 kombinasi ketersediaan bar - tidak satu pun boleh menghasilkan entry
    // pada atau sebelum tanggal sinyal.
    for (let mask = 0; mask < 32; mask++) {
      const dates = CALENDAR.filter((_, i) => (mask >> i) & 1);
      const entry = barAtForwardTradingOffset(mapOf(dates), CALENDAR, SIGNAL_INDEX, 1);
      if (entry) expect(entry.date > SIGNAL_DATE).toBe(true);
    }
  });
});

describe('barAtTradingOffset - toleransi dua arah tetap ada untuk bar EXIT', () => {
  it('masih boleh mundur, dan itu sebabnya ia TIDAK dipakai untuk entry', () => {
    // Perilaku ini sengaja dipertahankan untuk exit T+5/T+20 (horizon efektif 18-22 hari
    // bursa). Test ini mendokumentasikan bahwa perbedaannya nyata, supaya tidak ada yang
    // mengira kedua fungsi bisa saling menggantikan.
    const byDate = mapOf(['2026-01-05', '2026-01-06', '2026-01-07']);
    const entry = barAtTradingOffset(byDate, CALENDAR, SIGNAL_INDEX, 1);
    expect(entry?.date).toBe(SIGNAL_DATE);
    expect(barAtForwardTradingOffset(byDate, CALENDAR, SIGNAL_INDEX, 1)).toBeNull();
  });
});
