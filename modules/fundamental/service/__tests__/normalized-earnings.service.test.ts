import { describe, expect, it } from 'vitest';
import {
  fetchNormalizedEarnings,
  NORMALIZED_EARNINGS_MIN_YEARS,
  summarizeAnnualRoe,
} from '../normalized-earnings.service';
import {
  earningsAboveNormalSeverity,
  peakCycleSeverity,
  resolveSectorProfile,
} from '@/modules/sector';

/**
 * Fase 4 #16 - normalized earnings.
 *
 * Deret ROE di bawah adalah angka SUNGGUHAN dari Yahoo (fundamentalsTimeSeries, diambil
 * 2026-08-12), dipakai sebagai fixture supaya perilakunya diuji terhadap bentuk siklus yang
 * benar-benar terjadi, bukan terhadap deret karangan yang kebetulan cocok dengan rumusnya.
 */
const PTBA = [ // batu bara, pasca-puncak 2022
  { fiscalYear: 2022, netIncome: 12567582000000, equity: 28705068000000 },
  { fiscalYear: 2023, netIncome: 6105856000000, equity: 21434538000000 },
  { fiscalYear: 2024, netIncome: 5103720000000, equity: 22505288000000 },
  { fiscalYear: 2025, netIncome: 2929957000000, equity: 22483714000000 },
];

const ANTM = [ // logam, tahun berjalan DI ATAS normalnya sendiri
  { fiscalYear: 2022, netIncome: 3820965000000, equity: 23712043000000 },
  { fiscalYear: 2023, netIncome: 3077646000000, equity: 30643195000000 },
  { fiscalYear: 2024, netIncome: 3647210000000, equity: 31458113000000 },
  { fiscalYear: 2025, netIncome: 7208834000000, equity: 35298207000000 },
];

const BBCA = [ // bank, stabil - kontrol negatif
  { fiscalYear: 2022, netIncome: 40735722000000, equity: 221018606000000 },
  { fiscalYear: 2023, netIncome: 48639122000000, equity: 242356256000000 },
  { fiscalYear: 2024, netIncome: 54836305000000, equity: 262640621000000 },
  { fiscalYear: 2025, netIncome: 57537287000000, equity: 281466478000000 },
];

describe('summarizeAnnualRoe', () => {
  it('menghitung median ROE dari deret PTBA yang sesungguhnya', () => {
    const out = summarizeAnnualRoe(PTBA)!;
    expect(out).not.toBeNull();
    expect(out.years).toBe(4);
    expect(out.firstFiscalYear).toBe(2022);
    expect(out.lastFiscalYear).toBe(2025);
    // ROE per tahun: 43,78 / 28,49 / 22,68 / 13,03. Median = (28,49 + 22,68) / 2.
    expect(out.observations.map((o) => o.roePct)).toEqual([43.78, 28.49, 22.68, 13.03]);
    expect(out.normalizedRoePct).toBeCloseTo(25.59, 2);
  });

  it('MEDIAN, BUKAN RATA-RATA: satu tahun puncak tidak boleh ikut jadi "normal"', () => {
    const out = summarizeAnnualRoe(PTBA)!;
    // Rata-rata terseret naik oleh 2022 (43,78%). Kalau "normal" memakai rata-rata,
    // tahun puncak sebagian menjadi patokan - persis kebalikan dari yang diukur.
    expect(out.meanRoePct).toBeGreaterThan(out.normalizedRoePct);
    expect(out.maxRoePct).toBe(43.78);
    expect(out.minRoePct).toBe(13.03);
  });

  it('kurang dari minimum tahun -> null, bukan median dari dua titik', () => {
    expect(summarizeAnnualRoe(PTBA.slice(0, NORMALIZED_EARNINGS_MIN_YEARS - 1))).toBeNull();
    expect(summarizeAnnualRoe([])).toBeNull();
  });

  it('tahun dengan ekuitas <= 0 dibuang; ROE berpenyebut negatif tidak punya arti', () => {
    const rusak = [...PTBA, { fiscalYear: 2021, netIncome: 1_000, equity: -5_000 }];
    const out = summarizeAnnualRoe(rusak)!;
    expect(out.years).toBe(4);
    expect(out.observations.some((o) => o.fiscalYear === 2021)).toBe(false);
  });

  it('tahun RUGI tetap dipakai - tahun rugi adalah bagian sah dari siklus', () => {
    const denganRugi = [
      { fiscalYear: 2021, netIncome: -2_000_000, equity: 20_000_000 },
      ...PTBA,
    ];
    const out = summarizeAnnualRoe(denganRugi)!;
    expect(out.years).toBe(5);
    expect(out.minRoePct).toBeLessThan(0);
    // Membuang tahun rugi akan menaikkan "normal" justru pada emiten paling siklikal.
    expect(out.normalizedRoePct).toBeLessThan(summarizeAnnualRoe(PTBA)!.normalizedRoePct);
  });

  it('tahun kembar tidak dihitung dua kali', () => {
    const out = summarizeAnnualRoe([...PTBA, PTBA[0]!])!;
    expect(out.years).toBe(4);
  });

  it('data hilang di satu tahun membuat tahun itu keluar, bukan menjadi nol', () => {
    const out = summarizeAnnualRoe([
      ...PTBA,
      { fiscalYear: 2021, netIncome: null, equity: 20_000_000 },
      { fiscalYear: 2020, netIncome: 5_000_000, equity: null },
    ])!;
    expect(out.years).toBe(4);
  });

  it('batas jendela dinyatakan di keluarannya, bukan hanya di komentar', () => {
    expect(summarizeAnnualRoe(PTBA)!.windowNote).toContain('maksimum 5 periode');
  });
});

describe('earningsAboveNormalSeverity', () => {
  it('ANTM: ROE berjalan di ATAS normalnya sendiri -> terdeteksi', () => {
    const out = summarizeAnnualRoe(ANTM)!;
    const roeTerkini = out.observations[out.observations.length - 1]!.roePct;
    expect(roeTerkini / out.normalizedRoePct).toBeGreaterThan(1.4);
    expect(earningsAboveNormalSeverity(roeTerkini, out.normalizedRoePct)!).toBeGreaterThan(0);
  });

  it('PTBA: pasca-puncak, ROE JAUH DI BAWAH normal -> tidak dituduh', () => {
    const out = summarizeAnnualRoe(PTBA)!;
    const roeTerkini = out.observations[out.observations.length - 1]!.roePct;
    // Inilah nilai tambahnya di atas tanda tangan PER+ROE: emiten batu bara yang sudah
    // lewat puncaknya tidak lagi dihukum hanya karena ia emiten batu bara.
    expect(earningsAboveNormalSeverity(roeTerkini, out.normalizedRoePct)).toBe(0);
  });

  it('BBCA: laba stabil -> rasio sekitar 1, tidak ada tuduhan', () => {
    const out = summarizeAnnualRoe(BBCA)!;
    const roeTerkini = out.observations[out.observations.length - 1]!.roePct;
    expect(earningsAboveNormalSeverity(roeTerkini, out.normalizedRoePct)).toBe(0);
  });

  it('rasio 2x normal -> keparahan penuh', () => {
    expect(earningsAboveNormalSeverity(40, 20)).toBe(1);
    expect(earningsAboveNormalSeverity(60, 20)).toBe(1);
  });

  it('derau tahunan biasa tidak dihitung sebagai puncak', () => {
    expect(earningsAboveNormalSeverity(21, 20)).toBe(0);
  });

  it('tidak bisa dihitung -> null, supaya pemanggil jatuh ke lapisan dugaan', () => {
    expect(earningsAboveNormalSeverity(null, 20)).toBeNull();
    expect(earningsAboveNormalSeverity(20, null)).toBeNull();
    // Normal <= 0: pembagiannya tidak bermakna dan tandanya bisa terbalik.
    expect(earningsAboveNormalSeverity(20, 0)).toBeNull();
    expect(earningsAboveNormalSeverity(20, -5)).toBeNull();
  });
});

describe('peakCycleSeverity dengan lapisan terukur', () => {
  const energi = resolveSectorProfile('Energy', 'Thermal Coal');
  const bank = resolveSectorProfile('Financial Services', 'Banks - Regional');

  it('lapisan terukur bisa menuduh walaupun PER tidak murah', () => {
    // PER 15 -> tanda tangan PER+ROE memberi 0. Tetapi ROE 40 vs normal 20 adalah dua kali
    // daya laba normalnya sendiri, dan itu tidak bisa disimpulkan dari PER dan ROE saja.
    expect(peakCycleSeverity(energi, 15, 40)).toBe(0);
    expect(peakCycleSeverity(energi, 15, 40, 20)).toBe(1);
  });

  it('MAX, bukan pengganti: lapisan dugaan tetap berlaku saat lapisan terukur diam', () => {
    // Seluruh jendela 4 tahun berisi tahun boom -> normal ikut tinggi -> rasio tampak wajar.
    // Tanda tangan PER murah + ROE tinggi tetap menangkapnya.
    const denganNormalTinggi = peakCycleSeverity(energi, 4, 32, 32);
    expect(earningsAboveNormalSeverity(32, 32)).toBe(0);
    expect(denganNormalTinggi).toBe(1);
  });

  it('tanpa data normalized, hasilnya sama persis dengan sebelum fitur ini ada', () => {
    for (const [per, roe] of [[8, 25], [4, 32], [12, 40], [6, 28]] as const) {
      expect(peakCycleSeverity(energi, per, roe, null)).toBe(peakCycleSeverity(energi, per, roe));
    }
  });

  it('sektor non-siklikal tetap tidak pernah dituduh, berapa pun rasionya', () => {
    expect(peakCycleSeverity(bank, 5, 40, 10)).toBe(0);
  });
});

describe('fetchNormalizedEarnings', () => {
  const financials = PTBA.map((r) => ({
    date: new Date(Date.UTC(r.fiscalYear, 11, 31)),
    netIncomeCommonStockholders: r.netIncome,
  }));
  const balanceSheet = PTBA.map((r) => ({
    date: new Date(Date.UTC(r.fiscalYear, 11, 31)),
    stockholdersEquity: r.equity,
  }));

  it('menggabungkan laba dan ekuitas per TAHUN BUKU, bukan per indeks array', () => {
    // Neraca punya satu periode lebih banyak daripada laporan laba rugi - itu benar-benar
    // terjadi (BBCA: 5 vs 4). Penggabungan berbasis indeks akan menggeser seluruh deret.
    const neracaLebihPanjang = [
      { date: new Date(Date.UTC(2021, 11, 31)), stockholdersEquity: 99_000_000 },
      ...balanceSheet,
    ];
    return fetchNormalizedEarnings('PTBA', {
      fetchFinancials: async () => financials,
      fetchBalanceSheet: async () => neracaLebihPanjang,
      cacheGet: async () => null,
      cacheSet: async () => undefined,
    }).then((out) => {
      expect(out!.observations.map((o) => o.roePct)).toEqual([43.78, 28.49, 22.68, 13.03]);
    });
  });

  it('kegagalan jaringan menghasilkan null, bukan lemparan', async () => {
    const out = await fetchNormalizedEarnings('PTBA', {
      fetchFinancials: async () => { throw new Error('yahoo down'); },
      fetchBalanceSheet: async () => balanceSheet,
      cacheGet: async () => null,
      cacheSet: async () => undefined,
    });
    expect(out).toBeNull();
  });

  it('hasil null ikut di-cache supaya emiten tanpa data tidak dipanggil berulang', async () => {
    const disimpan: unknown[] = [];
    await fetchNormalizedEarnings('XXXX', {
      fetchFinancials: async () => financials.slice(0, 2),
      fetchBalanceSheet: async () => balanceSheet.slice(0, 2),
      cacheGet: async () => null,
      cacheSet: async (_key: string, value: unknown) => { disimpan.push(value); },
    });
    expect(disimpan).toEqual([null]);
  });

  it('cache hit tidak memanggil Yahoo sama sekali', async () => {
    let dipanggil = 0;
    const tersimpan = summarizeAnnualRoe(PTBA);
    const out = await fetchNormalizedEarnings('PTBA', {
      fetchFinancials: async () => { dipanggil++; return financials; },
      fetchBalanceSheet: async () => { dipanggil++; return balanceSheet; },
      cacheGet: async () => tersimpan as never,
      cacheSet: async () => undefined,
    });
    expect(dipanggil).toBe(0);
    expect(out!.normalizedRoePct).toBeCloseTo(25.59, 2);
  });

  it('ticker tanpa sufiks dinormalkan ke .JK', async () => {
    const kunci: string[] = [];
    await fetchNormalizedEarnings('ptba', {
      fetchFinancials: async (t) => { kunci.push(t); return financials; },
      fetchBalanceSheet: async (t) => { kunci.push(t); return balanceSheet; },
      cacheGet: async () => null,
      cacheSet: async () => undefined,
    });
    expect(kunci).toEqual(['PTBA.JK', 'PTBA.JK']);
  });
});
