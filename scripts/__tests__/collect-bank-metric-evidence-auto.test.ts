import { describe, expect, it } from 'vitest';
import { extractLinks, extractMetricCandidates, htmlToText, inferPeriodEnd } from '../collect-bank-metric-evidence-auto.mjs';

describe('bank official-source auto collector', () => {
  it('menemukan link dokumen dari HTML tanpa search engine', () => {
    const html = `<a href="/docs/1Q26.pdf">1Q26 Corporate Presentation</a>`;
    expect(extractLinks(html, 'https://bank.example/ir')).toEqual([
      { url: 'https://bank.example/docs/1Q26.pdf', title: '1Q26 Corporate Presentation' },
    ]);
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

  it('memisahkan LDR dari flattened multi-chart dan tidak salah membaca Net NPL Formation sebagai NPL Net ratio', () => {
    const text = 'Bank-Only Loan-to-Deposit Ratio(a) Trend Bank-Only Net NPL Formation(b) and Loan-at-Risk Ratio Trend LDR (Bank-Only) Net NPL Formation (Bank-Only) LaR Ratio (Bank-Only) 98,0% 7,37%';
    const rows = extractMetricCandidates(text, {
      ticker: 'BMRI.JK', periodEnd: '2026-06-30', sourceTitle: 'Official presentation', sourceUrl: 'https://www.bankmandiri.co.id/example.pdf',
    });
    const ldr = rows.find((x: any) => x.metricKey === 'LDR_PCT');
    const nplNet = rows.find((x: any) => x.metricKey === 'NPL_NET_PCT');
    expect(ldr?.status).toBe('CANDIDATE');
    expect(ldr?.value).toBe(98);
    expect(ldr?.basis).toBe('BANK_ONLY');
    expect(ldr?.extractionMethod).toBe('FLATTENED_TREND_LDR_FIRST_SERIES');
    expect(nplNet).toBeUndefined();
  });

});
