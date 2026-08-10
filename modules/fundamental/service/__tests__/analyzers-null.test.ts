import { describe, expect, it } from 'vitest';
import { analyze as analyzeCurrentRatio } from '../analyzers/current-ratio-analyzer';
import { analyze as analyzeDer } from '../analyzers/der-analyzer';
import { analyze as analyzeEpsGrowth } from '../analyzers/eps-growth-analyzer';
import { analyze as analyzeNetMargin } from '../analyzers/net-margin-analyzer';
import { analyze as analyzeQuickRatio } from '../analyzers/quick-ratio-analyzer';
import { analyze as analyzeRoa } from '../analyzers/roa-analyzer';
import { analyze as analyzeRoe } from '../analyzers/roe-analyzer';

describe('fundamental analyzers dengan data kosong', () => {
  it.each([
    ['ROE', analyzeRoe],
    ['ROA', analyzeRoa],
    ['DER', analyzeDer],
    ['current ratio', analyzeCurrentRatio],
    ['quick ratio', analyzeQuickRatio],
    ['EPS growth', analyzeEpsGrowth],
    ['net margin', analyzeNetMargin],
  ])('mengembalikan N/A untuk %s bernilai null', (_label, analyze) => {
    const result = analyze({
      financialData: {
        returnOnEquity: null,
        returnOnAssets: null,
        debtToEquity: null,
        currentRatio: null,
        quickRatio: null,
        profitMargins: null,
      },
      defaultKeyStatistics: {
        earningsQuarterlyGrowth: null,
      },
    });

    expect(result.value).toBe('N/A');
    expect(result.confidence).toBe(0);
  });
});
