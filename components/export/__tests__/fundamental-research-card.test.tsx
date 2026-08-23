import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import FundamentalResearchCard from '../FundamentalResearchCard';
import { desimalId, orAbsent } from '../research-paper';

// Kartu ini diekspor sebagai GAMBAR dan dibagikan ke luar aplikasi. Tidak ada tooltip,
// tidak ada "selengkapnya", tidak ada cara pembaca memeriksa ulang angkanya. Karena itu
// yang dikunci di sini bukan tata letak - melainkan tiga kelas kekeliruan yang semuanya
// pernah benar-benar tercetak di atas payload BBCA 21 Agustus 2026:
//
//   1. nol dari penyedia data tampil sebagai fakta ("Gross Profit Margin 0.00%" untuk bank);
//   2. dua konvensi desimal dalam satu lembar ("Rp 792.55 T" di sebelah "+0,78%");
//   3. satuan dan label mentah lolos ke permukaan ("-0% pp", "DATA_ONLY").
//
// Snapshot BBCA dipakai apa adanya: angka karangan tidak akan memicu satu pun di antaranya.
const BBCA = {
  ticker: 'BBCA.JK',
  stock: { symbol: 'BBCA', name: 'PT Bank Central Asia Tbk', current_price: 6450, change_pct: 0.78 },
  scoring: { totalScore: 54, breakdown: { fundamental: 15, technical: 17, moneyFlow: 22 } },
  fundamentals: {
    marketCap: 792551724417024,
    trailingPE: 13.6612015,
    priceToBook: 2.9298046,
    returnOnEquity: 0.21818,
    profitMargins: 0.53118,
    dividendYield: 0.0591,
    // Yahoo mengirim 0 untuk bank: laba kotor tidak dilaporkan dalam pengertian yang sama,
    // BUKAN berarti marginnya nol.
    grossMargins: 0,
    debtToEquity: null,
  },
  profile: { sector: 'Financial Services', industry: 'Banks - Regional' },
  latestEarningsQuarter: {
    quarter: '2Q2026',
    actualEps: 121,
    estimatedEps: 121.12,
    surprisePct: -0.1,
    status: 'MISS',
  },
  ownership: {
    foreignPct: 29.3085,
    localPct: 13.2416,
    scriplessPct: 42.5501,
    // KSEI bulanan: '1d' dan '7d' pada payload menunjuk basis yang sama dengan '30d'.
    previous: { basisObservedDate: '2026-06-30', actualGapDays: 31, foreignPp: -0.016, localPp: 0.0159 },
    trend: 'DATA_ONLY',
    observedDate: '2026-07-31',
  },
  exportedAt: new Date('2026-08-21T09:14:00Z'),
};

function render(overrides: Record<string, unknown> = {}): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return renderToStaticMarkup(<FundamentalResearchCard {...(BBCA as any)} {...(overrides as any)} />);
}

describe('FundamentalResearchCard', () => {
  it('tidak pernah mencetak penanda kosong mentah', () => {
    const html = render();
    expect(html).not.toContain('N/A');
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('null');
  });

  it('membuang rasio yang nolnya berasal dari penyedia data, bukan dari pengukuran', () => {
    const html = render();
    // GPM 0 untuk bank tidak boleh tampil sama sekali...
    expect(html).not.toContain('Gross Profit Margin');
    // ...sementara nol yang memang terukur tetap tampil: emiten tanpa dividen ber-DY 0%.
    const tanpaDividen = render({ fundamentals: { ...BBCA.fundamentals, dividendYield: 0 } });
    expect(tanpaDividen).toContain('Dividend Yield');
    expect(tanpaDividen).toContain('0,00%');
  });

  it('menghitung rasio yang ditampilkan terhadap yang tersedia', () => {
    // 5 dari 13 kandidat punya angka pada payload ini; GPM yang bernilai 0 bukan salah satunya.
    expect(render()).toContain('5 rasio tersedia dari 13 yang dihitung');
  });

  it('memakai satu konvensi desimal untuk seluruh lembar', () => {
    const html = render();
    expect(html).toContain('Rp 792,55 T');
    expect(html).toContain('13,66x');
    expect(html).toContain('21,82%');
    // Titik hanya boleh muncul sebagai pemisah ribuan.
    expect(html).not.toContain('792.55');
    expect(html).not.toContain('13.66x');
  });

  it('menulis EPS aktual dan estimasi dengan konvensi yang sama', () => {
    expect(render()).toContain('121 / 121,12');
  });

  it('menulis perubahan kepemilikan dalam poin persentase dengan jendela sebenarnya', () => {
    const html = render();
    // Cadence KSEI bulanan: menyebutnya "1 hari" adalah pernyataan yang salah, bukan pembulatan.
    expect(html).toContain('31 hari -0,02 pp');
    expect(html).toContain('31 hari +0,02 pp');
    // Tanpa penjaga batas kiri, "31 hari" ikut tertangkap sebagai "1 hari".
    expect(html).not.toMatch(/(^|[^0-9])1 hari /);
    expect(html).not.toMatch(/(^|[^0-9])7 hari /);
    expect(html).not.toContain('0% pp');
  });

  it('menerjemahkan label tren KSEI, tidak meneruskan enumnya', () => {
    const html = render();
    expect(html).not.toContain('DATA_ONLY');
    expect(html).toContain('Hanya data');
  });

  it('menyebut indikator sebagai indikator, bukan pilar', () => {
    // `expected` dari buildMoatProxy adalah jumlah METRIK di seluruh PILLAR_RULES; kartu
    // pernah menyebutnya "10 pilar" tepat di atas daftar yang memuat empat.
    expect(render()).not.toContain('pilar kuantitatif mendukung');
  });

  it('tetap merender tanpa satu pun blok opsional', () => {
    const html = renderToStaticMarkup(
      <FundamentalResearchCard ticker="XXXX.JK" stock={{ symbol: 'XXXX' }} exportedAt={BBCA.exportedAt} />,
    );
    expect(html).toContain('XXXX');
    expect(html).not.toContain('N/A');
  });
});

describe('research-paper', () => {
  it('desimalId hanya menyentuh titik yang berperan sebagai desimal', () => {
    expect(desimalId('Rp 792.55 T')).toBe('Rp 792,55 T');
    expect(desimalId('13.66x')).toBe('13,66x');
    // Pemisah ribuan dari `rp()` punya tiga digit di belakangnya - tidak boleh ikut berubah.
    expect(desimalId('Rp 6.450')).toBe('Rp 6.450');
    expect(desimalId('Rp 1.234.567')).toBe('Rp 1.234.567');
  });

  it('orAbsent menyamakan ketiga penanda kosong yang beredar di repo', () => {
    expect(orAbsent('N/A')).toBe('–');
    expect(orAbsent('—')).toBe('–');
    expect(orAbsent('-')).toBe('–');
    expect(orAbsent(null)).toBe('–');
  });
});
