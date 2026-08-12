import { describe, expect, it } from 'vitest';
import {
  findMissingQuarters,
  mergeQuarterlyFinancials,
  type QuarterlyFinancialRow,
} from '../earnings-period-merge';

/**
 * Deret di bawah adalah periode SUNGGUHAN yang dikembalikan Yahoo pada 2026-08-12 -
 * termasuk lubangnya. Diuji terhadap bentuk yang benar-benar terjadi.
 */

/** PTBA: earningsChart melompati kuartal Desember 2025. */
const PTBA_CHART = ['2025-06-30', '2025-09-30', '2026-03-31'];
/** PTBA: deret waktu punya Desember, tapi TIDAK punya September. */
const PTBA_SERIES: QuarterlyFinancialRow[] = [
  { periodEnd: '2024-12-31', revenue: 12109035000000, netIncome: 1873380000000, operatingIncome: 1723194000000 },
  { periodEnd: '2025-03-31', revenue: 9958441000000, netIncome: 391479000000, operatingIncome: 318030000000 },
  { periodEnd: '2025-06-30', revenue: 10493950000000, netIncome: 441565000000, operatingIncome: 471661000000 },
  { periodEnd: '2025-12-31', revenue: 11321428000000, netIncome: 1535931000000, operatingIncome: 1545686000000 },
  { periodEnd: '2026-03-31', revenue: 9929722000000, netIncome: 801794000000, operatingIncome: 798320000000 },
];

function chartRows(periods: string[], withFinancials = false) {
  return periods.map((periodEnd) => ({
    periodEnd,
    actualEps: 50,
    revenue: withFinancials ? 1_000 : null,
    netIncome: withFinancials ? 100 : null,
    profitMargin: withFinancials ? 0.1 : null,
  }));
}

const makePeriod = (row: QuarterlyFinancialRow) => ({
  periodEnd: row.periodEnd,
  actualEps: null as number | null,
  revenue: row.revenue,
  netIncome: row.netIncome,
  profitMargin: row.revenue != null && row.revenue > 0 && row.netIncome != null
    ? row.netIncome / row.revenue
    : null,
});

describe('findMissingQuarters', () => {
  it('menemukan kuartal yang benar-benar hilang di deret PTBA', () => {
    // 2025-06-30 -> 2025-09-30 -> 2026-03-31: Desember 2025 tidak ada.
    expect(findMissingQuarters(PTBA_CHART)).toEqual(['2025-12-31']);
  });

  it('deret bersambung -> tidak ada yang dilaporkan hilang', () => {
    expect(findMissingQuarters(['2025-03-31', '2025-06-30', '2025-09-30', '2025-12-31'])).toEqual([]);
  });

  it('hanya melaporkan lubang DI ANTARA, bukan sebelum atau sesudah deret', () => {
    // Data pendek bukan berarti berlubang - kuartal sebelum periode pertama memang
    // tidak diminta, dan melaporkannya sebagai "hilang" akan menakut-nakuti tanpa sebab.
    const out = findMissingQuarters(['2025-06-30', '2025-09-30']);
    expect(out).toEqual([]);
  });

  it('beberapa lubang berturut-turut terdaftar semua', () => {
    expect(findMissingQuarters(['2024-12-31', '2025-12-31'])).toEqual(['2025-03-31', '2025-06-30', '2025-09-30']);
  });

  it('periode yang bulannya bukan akhir kuartal dilewati, bukan dipaksa masuk pola', () => {
    // Tahun buku non-kalender akan menghasilkan daftar palsu kalau dipaksakan.
    expect(findMissingQuarters(['2025-01-31', '2025-04-30'])).toEqual([]);
  });

  it('masukan kosong / satu titik tidak melempar', () => {
    expect(findMissingQuarters([])).toEqual([]);
    expect(findMissingQuarters(['2025-06-30'])).toEqual([]);
    expect(findMissingQuarters(['', 'bukan-tanggal'])).toEqual([]);
  });
});

describe('mergeQuarterlyFinancials', () => {
  it('PTBA: 3 kuartal jadi 6 - lubang kedua sumber saling menambal', () => {
    const out = mergeQuarterlyFinancials(chartRows(PTBA_CHART), PTBA_SERIES, makePeriod);
    expect(out.periods.map((p) => p.periodEnd)).toEqual([
      '2024-12-31', '2025-03-31', '2025-06-30', '2025-09-30', '2025-12-31', '2026-03-31',
    ]);
    expect(out.addedFromTimeSeries).toBe(3);
  });

  it('mengisi angka keuangan yang kosong, TANPA menimpa yang sudah ada', () => {
    const base = chartRows(['2025-06-30'], true);
    base[0]!.revenue = 999; // nilai dari earningsChart
    const out = mergeQuarterlyFinancials(base, PTBA_SERIES, makePeriod);
    const juni = out.periods.find((p) => p.periodEnd === '2025-06-30')!;
    // Tidak ditimpa: earningsChart satu-satunya sumber EPS, dan menukar sumber di tengah
    // deret tanpa penanda adalah cara termudah membuat dua angka bercampur diam-diam.
    expect(juni.revenue).toBe(999);
  });

  it('mengisi yang null dan menghitungnya sebagai terisi', () => {
    const base = chartRows(['2025-06-30'], false);
    const out = mergeQuarterlyFinancials(base, PTBA_SERIES, makePeriod);
    const juni = out.periods.find((p) => p.periodEnd === '2025-06-30')!;
    expect(juni.revenue).toBe(10493950000000);
    expect(juni.netIncome).toBe(441565000000);
    expect(juni.profitMargin).toBeCloseTo(441565000000 / 10493950000000, 10);
    expect(out.filledFromTimeSeries).toBe(1);
  });

  it('EPS dari earningsChart tetap utuh - deret waktu tidak punya EPS', () => {
    const out = mergeQuarterlyFinancials(chartRows(PTBA_CHART), PTBA_SERIES, makePeriod);
    const sep = out.periods.find((p) => p.periodEnd === '2025-09-30')!;
    expect(sep.actualEps).toBe(50);
    // Periode yang hanya ada di deret waktu memang tidak punya EPS - null, bukan 0.
    const des = out.periods.find((p) => p.periodEnd === '2025-12-31')!;
    expect(des.actualEps).toBeNull();
  });

  it('setelah digabung, lubang PTBA hilang - dan itu memang terjadi di data nyata', () => {
    const sebelum = findMissingQuarters(PTBA_CHART);
    const out = mergeQuarterlyFinancials(chartRows(PTBA_CHART), PTBA_SERIES, makePeriod);
    expect(sebelum).toEqual(['2025-12-31']);
    expect(out.missingQuarters).toEqual([]);
  });

  it('lubang yang TETAP ada setelah digabung tetap dilaporkan', () => {
    const out = mergeQuarterlyFinancials(
      chartRows(['2024-12-31']),
      [{ periodEnd: '2025-12-31', revenue: 10, netIncome: 1, operatingIncome: 1 }],
      makePeriod,
    );
    expect(out.missingQuarters).toEqual(['2025-03-31', '2025-06-30', '2025-09-30']);
  });

  it('hasilnya selalu urut naik menurut tanggal', () => {
    const out = mergeQuarterlyFinancials(chartRows([...PTBA_CHART].reverse()), PTBA_SERIES, makePeriod);
    const tanggal = out.periods.map((p) => p.periodEnd);
    expect([...tanggal].sort()).toEqual(tanggal);
  });

  it('deret waktu kosong tidak mengubah apa pun', () => {
    const out = mergeQuarterlyFinancials(chartRows(PTBA_CHART), [], makePeriod);
    expect(out.periods).toHaveLength(3);
    expect(out.addedFromTimeSeries).toBe(0);
    expect(out.filledFromTimeSeries).toBe(0);
  });

  it('pendapatan nol tidak menghasilkan margin tak terhingga', () => {
    const out = mergeQuarterlyFinancials(
      chartRows(['2025-06-30'], false),
      [{ periodEnd: '2025-06-30', revenue: 0, netIncome: 500, operatingIncome: 0 }],
      makePeriod,
    );
    expect(out.periods[0]!.profitMargin).toBeNull();
  });
});
