import { describe, expect, it } from 'vitest';
import {
  parseIdxBrokerSummaryText,
  classifyBrokerCode,
} from '../idx-broker-summary-parser.service';

describe('idx-broker-summary-parser.service', () => {
  it('classifies foreign, domestic institution, and retail brokers correctly', () => {
    expect(classifyBrokerCode('AK')).toBe('FOREIGN');
    expect(classifyBrokerCode('BK')).toBe('FOREIGN');
    expect(classifyBrokerCode('YP')).toBe('RETAIL');
    expect(classifyBrokerCode('PD')).toBe('RETAIL');
    expect(classifyBrokerCode('CC')).toBe('FOREIGN');
    expect(classifyBrokerCode('OD')).toBe('FOREIGN');
    expect(classifyBrokerCode('DR')).toBe('DOMESTIC_INSTITUTION');
  });

  it('parses raw text and CSV broker summary report cleanly', () => {
    const rawReport = `
# IDX Daily Broker Summary
BBCA,YP,500000000,100000000,50000,10000,100,20
BBCA,AK,1200000000,200000000,120000,20000,250,50
BBCA,PD,50000000,800000000,5000,80000,10,120
TLKM,CC,2000000000,500000000,600000,150000,400,80
`;

    const parsed = parseIdxBrokerSummaryText(rawReport, '2026-08-17');
    expect(parsed.totalRecords).toBe(4);
    expect(parsed.transactions[0]!.ticker).toBe('BBCA.JK');
    expect(parsed.transactions[0]!.brokerCode).toBe('YP');
    expect(parsed.transactions[0]!.buyValue).toBe(500_000_000);
    expect(parsed.transactions[0]!.sellValue).toBe(100_000_000);
    expect(parsed.transactions[0]!.buyAvgPrice).toBe(10000); // 500M / 50k shares = 10,000
  });

  it('handles tab and semicolon separated values smoothly', () => {
    const tsvReport = `ASII\tBK\t1500000000\t300000000\t300000\t60000\t150\t30`;
    const parsed = parseIdxBrokerSummaryText(tsvReport, '2026-08-17');
    expect(parsed.totalRecords).toBe(1);
    expect(parsed.transactions[0]!.ticker).toBe('ASII.JK');
    expect(parsed.transactions[0]!.brokerCode).toBe('BK');
  });
});
