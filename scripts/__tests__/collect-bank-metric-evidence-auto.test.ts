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

  it('menginfer period end quarter/half-year/month', () => {
    expect(inferPeriodEnd('2026 Q1 Analyst Meeting')).toBe('2026-03-31');
    expect(inferPeriodEnd('1H26 Corporate Presentation')).toBe('2026-06-30');
    expect(inferPeriodEnd('As of May 2026 (Bank Only)')).toBe('2026-05-31');
  });
});
