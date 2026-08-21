import { describe, expect, it } from 'vitest';
import { applyOfficialIhsgClose } from '../market-pulse.service';

const yahoo = (date: string) => [{
  name: 'IHSG', price: 8000, changePct: -0.2,
  sourceTimestamp: `${date}T08:45:00.000Z`, source: 'YAHOO_CHART' as const,
}];

describe('Market Pulse official IHSG close', () => {
  it('uses the official BEI close for the same trading date', () => {
    const result = applyOfficialIhsgClose(yahoo('2026-08-21'), {
      price: 8050, changePct: 0.5, tradeDate: '2026-08-21',
      sourceTimestamp: '2026-08-21T09:00:00.000Z', source: 'IDX_OFFICIAL_INDEX_SUMMARY',
    });
    expect(result[0]).toMatchObject({ price: 8050, changePct: 0.5, source: 'IDX_OFFICIAL_INDEX_SUMMARY' });
  });

  it('never overwrites a newer Yahoo session with an older BEI artifact', () => {
    expect(applyOfficialIhsgClose(yahoo('2026-08-22'), {
      price: 8050, changePct: 0.5, tradeDate: '2026-08-21',
      sourceTimestamp: '2026-08-21T09:00:00.000Z', source: 'IDX_OFFICIAL_INDEX_SUMMARY',
    })[0]).toMatchObject({ price: 8000, source: 'YAHOO_CHART' });
  });
});
