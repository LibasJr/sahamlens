import { describe, expect, it } from 'vitest';
import { buildCompareCsv } from '@/shared/format/compare-export';

describe('buildCompareCsv', () => {
  it('creates an Excel-friendly UTF-8 CSV with prices, rows, winner, and conclusion', () => {
    const csv = buildCompareCsv({
      symbol1: 'BBCA.JK',
      symbol2: 'BBRI.JK',
      price1: 9750,
      price2: 4200,
      generatedAt: new Date('2026-08-28T05:00:00.000Z'),
      rows: [
        {
          label: 'P/E Ratio',
          a: '18,5x',
          b: '12,2x',
          winner: 'BBRI.JK',
          reason: 'Lebih rendah, tetapi tetap perlu konteks pertumbuhan.',
        },
        {
          label: 'Catatan "khusus"',
          a: 'A',
          b: 'B',
          winner: '-',
          reason: 'Baris dengan "quote" harus aman.',
        },
      ],
      conclusion: 'BBRI unggul pada valuasi, bukan rekomendasi transaksi.',
    });

    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"Metrik","BBCA","BBRI","Unggul","Penjelasan"');
    expect(csv).toContain('"Harga Terakhir","Rp 9.750","Rp 4.200"');
    expect(csv).toContain('"P/E Ratio","18,5x","12,2x","BBRI"');
    expect(csv).toContain('"Catatan ""khusus"""');
    expect(csv).toContain('"Baris dengan ""quote"" harus aman."');
    expect(csv).toContain('"Kesimpulan","BBRI unggul pada valuasi, bukan rekomendasi transaksi."');
  });
});
