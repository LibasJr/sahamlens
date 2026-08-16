import { describe, expect, it } from 'vitest';
import { extractLinks, extractMetricCandidates, htmlToText, inferPeriodEnd, reconcileCandidates, resolvePeriod } from '../collect-bank-metric-evidence-auto.mjs';

describe('bank official-source auto collector', () => {
  it('menemukan link dokumen dari HTML tanpa search engine', () => {
    const html = `<a href="/docs/1Q26.pdf">1Q26 Corporate Presentation</a>`;
    expect(extractLinks(html, 'https://bank.example/ir')).toEqual([
      { url: 'https://bank.example/docs/1Q26.pdf', title: '1Q26 Corporate Presentation' },
    ]);
  });

  it('mengambil judul dokumen dari konteks card ketika tombol issuer hanya bertuliskan View', () => {
    const html = `
      <div class="file-row">
        <div class="file-name">1H26 Corporate Presentation</div>
        <div class="file-size">2.87 MB</div>
        <a class="btn" href="/docs/bca-1h26.pdf">View</a>
      </div>`;
    expect(extractLinks(html, 'https://www.bca.co.id/ir')).toEqual([
      { url: 'https://www.bca.co.id/docs/bca-1h26.pdf', title: '1H26 Corporate Presentation' },
    ]);
  });

  it('memprioritaskan aria-label non-generik dibanding teks tombol View', () => {
    const html = `<a aria-label="Financial Report June 2026" href="/docs/jun26.pdf">View</a>`;
    expect(extractLinks(html, 'https://www.bca.co.id/ir')[0]?.title).toBe('Financial Report June 2026');
  });

  it('mengubah HTML snapshot menjadi text dan membaca metric single-value', () => {
    const text = htmlToText(`<h4>Loan to Deposit Ratio (LDR)</h4><div>88.4%</div><h4>Capital Adequacy Ratio</h4><div>18.1%</div>`);
    const rows = extractMetricCandidates(text, { ticker: 'BBNI.JK', periodEnd: '2026-05-31', sourceTitle: 'BNI Investor', sourceUrl: 'https://www.bni.co.id/en-us/investors' });
    expect(rows.find((x: any) => x.metricKey === 'LDR_PCT')?.value).toBe(88.4);
    expect(rows.find((x: any) => x.metricKey === 'CAR_PCT')?.value).toBe(18.1);
  });

  it('tidak menebak bila satu metric punya beberapa angka', () => {
    const rows = extractMetricCandidates('Net Interest Margin 5.1% 5.4% 5.6%', { ticker: 'BBCA.JK', periodEnd: '2026-06-30' });
    const nim = rows.find((x: any) => x.metricKey === 'NIM_PCT');
    expect(nim?.status).toBe('QUARANTINED');
    expect(nim?.reason).toContain('multiple_values');
  });

  it('memilih nilai multi-period hanya bila tag periodenya eksplisit', () => {
    const rows = extractMetricCandidates('Cost of Credit (CoC): 0.83% for 1Q25 and 0.58% for 1Q26', {
      ticker: 'BMRI.JK', periodEnd: '2026-03-31', sourceTitle: '1Q26 Analyst Meeting', sourceUrl: 'https://www.bankmandiri.co.id/example.pdf',
    });
    const coc = rows.find((x: any) => x.metricKey === 'COST_OF_CREDIT_PCT');
    expect(coc?.status).toBe('CANDIDATE');
    expect(coc?.value).toBe(0.58);
    expect(coc?.extractionMethod).toBe('PERIOD_TAGGED_VALUE');
  });


  it('memilih kolom periode dari tabel PDF layout tanpa menebak nilai lain', () => {
    const text = [
      'Key ratios             1Q25       1Q26',
      'Net Interest Margin    5.10%      5.45%',
      'Gross NPL              2.30%      2.10%',
    ].join('\n');
    const rows = extractMetricCandidates(text, {
      ticker: 'BBCA.JK', periodEnd: '2026-03-31', sourceTitle: '1Q26 Presentation', sourceUrl: 'https://www.bca.co.id/example.pdf',
    });
    const nim = rows.find((x: any) => x.metricKey === 'NIM_PCT');
    expect(nim?.status).toBe('CANDIDATE');
    expect(nim?.value).toBe(5.45);
    expect(nim?.extractionMethod).toBe('TABLE_PERIOD_COLUMN_VALUE');
  });

  it('mendukung header bulan singkat pdftotext seperti Mar-25 dan Mar-26', () => {
    const text = [
      '                    Mar-25    Mar-26',
      'Capital Adequacy Ratio  21.10%    22.90%',
    ].join('\n');
    const rows = extractMetricCandidates(text, {
      ticker: 'BBRI.JK', periodEnd: '2026-03-31', sourceTitle: 'March 2026 Key Metrics', sourceUrl: 'https://bri.co.id/example.pdf',
    });
    const car = rows.find((x: any) => x.metricKey === 'CAR_PCT');
    expect(car?.status).toBe('CANDIDATE');
    expect(car?.value).toBe(22.9);
    expect(car?.extractionMethod).toBe('TABLE_PERIOD_COLUMN_VALUE');
  });

  it('tetap quarantine bila jumlah kolom nilai tidak cocok dengan header periode', () => {
    const text = [
      'Key ratios             1Q25       1Q26',
      'Net Interest Margin    5.10%      5.30%      5.45%',
    ].join('\n');
    const rows = extractMetricCandidates(text, { ticker: 'BBCA.JK', periodEnd: '2026-03-31' });
    const nim = rows.find((x: any) => x.metricKey === 'NIM_PCT');
    expect(nim?.status).toBe('QUARANTINED');
    expect(nim?.reason).toContain('multiple_values');
  });

  it('menginfer period end quarter/half-year/month', () => {
    expect(inferPeriodEnd('2026 Q1 Analyst Meeting')).toBe('2026-03-31');
    expect(inferPeriodEnd('1H26 Corporate Presentation')).toBe('2026-06-30');
    expect(inferPeriodEnd('As of May 2026 (Bank Only)')).toBe('2026-05-31');
  });
});

it('BBCA Q1 comparison row resolves current value only when deltas reconcile', () => {
  const text = 'CAR 26.6% 29.8% 27.0% 0.4% -2.8% CASA to Total Funding 82.9% 84.6% 85.2% 2.3% 0.6% LDR 76.1% 76.8% 74.1% -2.0% -2.7%';
  const rows = extractMetricCandidates(text, { ticker: 'BBCA.JK', periodEnd: '2026-03-31', sourceTitle: '1Q26 Corporate Presentation' });
  expect(rows.find((x: any) => x.metricKey === 'CAR_PCT')?.value).toBe(27);
  expect(rows.find((x: any) => x.metricKey === 'CAR_PCT')?.extractionMethod).toBe('BBCA_3_PERIOD_COMPARISON_WITH_DELTAS');
  expect(rows.find((x: any) => x.metricKey === 'CASA_PCT')?.value).toBe(85.2);
  expect(rows.find((x: any) => x.metricKey === 'LDR_PCT')?.value).toBe(74.1);
});

it('BBCA 1H comparison row resolves first current value from auditable delta triple', () => {
  const text = 'CAR 28.4% 26.8% -1.6% 27.0% 26.8% -0.2% CASA to Total Funding 83.4% 85.2% 1.8% 85.2% 85.2% 0.0% LDR 78.0% 78.7% 0.7% 74.1% 8.7% 4.6%';
  const rows = extractMetricCandidates(text, { ticker: 'BBCA.JK', periodEnd: '2026-06-30', sourceTitle: '1H26 Corporate Presentation' });
  expect(rows.find((x: any) => x.metricKey === 'CAR_PCT')?.value).toBe(26.8);
  expect(rows.find((x: any) => x.metricKey === 'CASA_PCT')?.value).toBe(85.2);
  expect(rows.find((x: any) => x.metricKey === 'LDR_PCT')?.value).toBe(78.7);
});

it('BBCA Q1 cost-to-income and NPL coverage comparison rows resolve current values', () => {
  const text = [
    'Cost to Income 28.5% 35.9% 27.3% -1.2% -8.6% ROA 4.3% 3.6% 4.1% -0.2% 0.5%',
    'NPL Coverage 180.1% 183.8% 174.6% -5.5% -9.2% LAR 6.0% 4.8% 5.1% -0.9% 0.3%',
  ].join('\n');
  const rows = extractMetricCandidates(text, { ticker: 'BBCA.JK', periodEnd: '2026-03-31', sourceTitle: '1Q26 Corporate Presentation' });
  expect(rows.find((x: any) => x.metricKey === 'COST_TO_INCOME_PCT')?.value).toBe(27.3);
  expect(rows.find((x: any) => x.metricKey === 'COVERAGE_RATIO_PCT')?.value).toBe(174.6);
});

it('BBCA 1H flow ratios select period-to-date value from first validated comparison triple', () => {
  const text = [
    'CoC (gross) 0.5% 0.5% 0.0% 0.6% 0.4% -0.2% CoC (after recovery) 0.4% 0.3% -0.1% 0.4% 0.2% -0.2% Cost to Income 29.1% 29.3% 0.2% 27.3% 31.7% 4.4%',
  ].join('\n');
  const rows = extractMetricCandidates(text, { ticker: 'BBCA.JK', periodEnd: '2026-06-30', sourceTitle: '1H26 Corporate Presentation' });
  expect(rows.find((x: any) => x.metricKey === 'COST_OF_CREDIT_PCT')?.value).toBe(0.5);
  expect(rows.find((x: any) => x.metricKey === 'COST_TO_INCOME_PCT')?.value).toBe(29.3);
});

it('does not treat CASA growth as CASA ratio and does not treat banking-sector Loan Yield chart as NIM', () => {
  const text = [
    'Strong CASA growth of 13.1% YoY, loans rose 7.7% Consolidated (Rp tn)',
    'Banking sector saw weaker NIM 9.05% 8.94% 8.71% 8.53% 8.63% Loan Yield',
  ].join('\n');
  const rows = extractMetricCandidates(text, { ticker: 'BBCA.JK', periodEnd: '2026-06-30', sourceTitle: '1H26 Corporate Presentation' });
  expect(rows.find((x: any) => x.metricKey === 'CASA_PCT')).toBeUndefined();
  const nim = rows.find((x: any) => x.metricKey === 'NIM_PCT');
  expect(nim?.status).toBe('QUARANTINED');
  expect(nim?.reason).toBe('forecast_or_peer_context');
});

it('later deterministic BBCA row can supersede earlier ambiguous same-metric chart within one document', () => {
  const text = [
    'CASA 84.3% 83.7% LDR 14.0% 12.9% 13.7% 83.2% 13.0% YtD: -0.3% YoY: -2.9%',
    'CAR 26.6% 29.8% 27.0% 0.4% -2.8% CASA to Total Funding 82.9% 84.6% 85.2% 2.3% 0.6% LDR 76.1% 76.8% 74.1% -2.0% -2.7%',
  ].join('\n');
  const rows = extractMetricCandidates(text, { ticker: 'BBCA.JK', periodEnd: '2026-03-31', sourceTitle: '1Q26 Corporate Presentation' });
  const casaRows = rows.filter((x: any) => x.metricKey === 'CASA_PCT');
  expect(casaRows.some((x: any) => x.status === 'CANDIDATE' && x.value === 85.2)).toBe(true);
  expect(casaRows.some((x: any) => x.status === 'QUARANTINED')).toBe(false);
});


it('memprioritaskan reporting period di body daripada bulan publikasi', () => {
  expect(resolvePeriod('View', 'BCA Corporate Presentation July 2026 - 1H26 Performance', 'PDF')).toBe('2026-06-30');
  expect(resolvePeriod('View', 'Published April 2026 - 1Q26 Financial Highlights', 'PDF')).toBe('2026-03-31');
});

it('tidak menganggap BANK_ONLY dan CONSOLIDATED sebagai conflicting official values', () => {
  const base = {
    ticker: 'BBCA.JK', periodEnd: '2026-06-30', metricKey: 'CAR_PCT', unit: 'PCT',
    confidence: 0.99, extractionMethod: 'fixture', sourceTitle: '1H26', sourceUrl: 'https://www.bca.co.id/1h26.pdf',
    rawExcerpt: 'fixture', status: 'CANDIDATE', reason: null,
  };
  const { accepted, quarantine } = reconcileCandidates([
    { ...base, value: 26.8, basis: 'BANK_ONLY' },
    { ...base, value: 28.1, basis: 'CONSOLIDATED' },
  ] as any[]);
  expect(accepted).toHaveLength(2);
  expect(quarantine.filter((x: any) => String(x.reason ?? '').startsWith('conflicting_official_values'))).toHaveLength(0);
});
