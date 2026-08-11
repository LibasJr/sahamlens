import { describe, expect, it } from 'vitest';
import { buildMoatDurability, MIN_YEARS_FOR_DURABILITY } from '../moat-durability.service';
import { summarizeAnnualRoe } from '../normalized-earnings.service';

/**
 * Ketahanan moat. Deret di bawah adalah angka SUNGGUHAN dari Yahoo (fundamentalsTimeSeries,
 * 2026-08-12) - diuji terhadap bentuk yang benar-benar terjadi, bukan deret karangan yang
 * kebetulan cocok dengan rumusnya.
 */

/** PTBA - batu bara. ROE 43,8 -> 28,5 -> 22,7 -> 13,0. Contoh kanonik "bagus karena siklus". */
const PTBA = [
  { fiscalYear: 2022, netIncome: 12567582000000, equity: 28705068000000, revenue: 42648590000000, operatingIncome: 14563089000000 },
  { fiscalYear: 2023, netIncome: 6105856000000, equity: 21434538000000, revenue: 38488867000000, operatingIncome: 6731359000000 },
  { fiscalYear: 2024, netIncome: 5103720000000, equity: 22505288000000, revenue: 42764968000000, operatingIncome: 5225604000000 },
  { fiscalYear: 2025, netIncome: 2929957000000, equity: 22483714000000, revenue: 42651724000000, operatingIncome: 2947327000000 },
];

/** BBCA - bank. ROE 18,4 / 20,1 / 20,9 / 20,4. Stabil, dan tanpa laba operasi. */
const BBCA = [
  { fiscalYear: 2022, netIncome: 40735722000000, equity: 221018606000000, revenue: 89523508000000, operatingIncome: null },
  { fiscalYear: 2023, netIncome: 48639122000000, equity: 242356256000000, revenue: 100485975000000, operatingIncome: null },
  { fiscalYear: 2024, netIncome: 54836305000000, equity: 262640621000000, revenue: 108796625000000, operatingIncome: null },
  { fiscalYear: 2025, netIncome: 57537287000000, equity: 281466478000000, revenue: 114319648000000, operatingIncome: null },
];

const COE_BANK = 12.42;
const COE_ENERGI = 13.5;

describe('buildMoatDurability', () => {
  it('BBCA: imbal hasil bertahan di atas biaya modal -> TAHAN', () => {
    const out = buildMoatDurability(summarizeAnnualRoe(BBCA), COE_BANK);
    expect(out.years).toBe(4);
    expect(out.yearsAboveCostOfEquity).toBe(4);
    expect(out.status).toBe('TAHAN');
  });

  it('BANK: margin operasi TIDAK BERLAKU, bukan dinilai buruk', () => {
    const out = buildMoatDurability(summarizeAnnualRoe(BBCA), COE_BANK);
    const margin = out.checks.find((c) => c.key === 'margin_stability')!;
    // Disiplin yang sama dengan DER untuk bank: ketiadaan makna bukan kabar buruk.
    expect(margin.verdict).toBe('NOT_APPLICABLE');
    expect(out.operatingMarginStdDevPct).toBeNull();
    // Dan itu tidak boleh menyeret status gabungan ke bawah.
    expect(out.status).toBe('TAHAN');
  });

  it('PTBA: keunggulannya tergerus - inilah yang tidak terlihat dari snapshot', () => {
    const out = buildMoatDurability(summarizeAnnualRoe(PTBA), COE_ENERGI);
    expect(out.earlyRoePct).toBeGreaterThan(out.lateRoePct!);
    expect(out.roeChangePct!).toBeLessThan(-30);
    const tren = out.checks.find((c) => c.key === 'roe_trend')!;
    expect(tren.verdict).toBe('CAUTION');
    expect(out.status).not.toBe('TAHAN');
  });

  it('PTBA: margin operasi berayun lebar -> tidak stabil', () => {
    const out = buildMoatDurability(summarizeAnnualRoe(PTBA), COE_ENERGI);
    // 34% (2022) sampai 7% (2025) - simpangannya jauh di atas ambang.
    expect(out.operatingMarginStdDevPct!).toBeGreaterThan(5);
    expect(out.checks.find((c) => c.key === 'margin_stability')!.verdict).toBe('CAUTION');
  });

  it('AMBANGNYA per emiten: biaya ekuitas lebih tinggi = mistar lebih tinggi', () => {
    const rendah = buildMoatDurability(summarizeAnnualRoe(PTBA), 10);
    const tinggi = buildMoatDurability(summarizeAnnualRoe(PTBA), 25);
    expect(rendah.yearsAboveCostOfEquity).toBeGreaterThan(tinggi.yearsAboveCostOfEquity);
  });

  it('tahun kurang dari minimum -> DATA TERBATAS, bukan vonis', () => {
    const out = buildMoatDurability(summarizeAnnualRoe(PTBA.slice(0, MIN_YEARS_FOR_DURABILITY - 1)), COE_BANK);
    expect(out.status).toBe('DATA TERBATAS');
    expect(out.checks).toEqual([]);
    expect(out.conclusion).toContain('menebak lebih buruk');
  });

  it('biaya ekuitas tak terhitung -> tidak dinilai, BUKAN dinilai rendah', () => {
    for (const coe of [null, 0, -3, Number.NaN]) {
      const out = buildMoatDurability(summarizeAnnualRoe(BBCA), coe);
      expect(out.status).toBe('DATA TERBATAS');
      expect(out.conclusion).toContain('tidak dinilai');
    }
  });

  it('earnings null tidak melempar', () => {
    expect(buildMoatDurability(null, COE_BANK).status).toBe('DATA TERBATAS');
  });

  it('setiap check menyebut ANGKANYA, bukan cuma lulus/tidak', () => {
    const out = buildMoatDurability(summarizeAnnualRoe(PTBA), COE_ENERGI);
    for (const check of out.checks) {
      expect(check.detail.length).toBeGreaterThan(20);
      expect(/\d/.test(check.detail)).toBe(true);
    }
  });

  it('KONTRAS: dua emiten dengan ROE terkini mirip bisa berbeda ketahanannya', () => {
    // Inti seluruh pilar ini. PTBA 2025 ROE 13,0%, dan sebuah emiten datar di 13% -
    // snapshot menilai keduanya sama; ketahanan membedakannya.
    const datar = [2022, 2023, 2024, 2025].map((fiscalYear) => ({
      fiscalYear, netIncome: 1_300_000, equity: 10_000_000,
      revenue: 5_000_000, operatingIncome: 900_000,
    }));
    const seriPtba = summarizeAnnualRoe(PTBA)!;
    const seriDatar = summarizeAnnualRoe(datar)!;
    // Yang dilihat halaman moat versi snapshot: ROE TAHUN TERAKHIR. Keduanya ~13%.
    const roeTerakhir = (x: typeof seriPtba) => x.observations[x.observations.length - 1]!.roePct;
    expect(roeTerakhir(seriPtba)).toBeCloseTo(roeTerakhir(seriDatar), 0);

    // Ketahanan memisahkan keduanya: satu sedang meluncur turun, satu memang segitu.
    const a = buildMoatDurability(seriPtba, 12);
    const b = buildMoatDurability(seriDatar, 12);
    expect(a.status).not.toBe(b.status);
    expect(b.status).toBe('TAHAN');
    expect(a.roeChangePct!).toBeLessThan(0);
    expect(b.roeChangePct!).toBe(0);
  });
});
