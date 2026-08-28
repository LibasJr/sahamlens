import { describe, expect, it } from 'vitest';
import { reconcileClose } from '../service/close-reconciliation.service';
import { parseIdxStockSummary, parseIdxTradingInfoArtifact } from '../service/idx-close-source.service';

const base = { ticker: 'BBCA.JK', tradeDate: '2026-08-14', observedAt: '2026-08-14T09:00:00Z', source: 'X' };

describe('market close reconciliation', () => {
  it('requires exact same-date close to declare MATCH', () => {
    expect(reconcileClose({ ...base, close: 9125 }, { ...base, close: 9125 }, 'r1', base.ticker, base.tradeDate).status).toBe('MATCH');
    const mismatch = reconcileClose({ ...base, close: 9125 }, { ...base, close: 9100 }, 'r1', base.ticker, base.tradeDate);
    expect(mismatch.status).toBe('MISMATCH');
    expect(mismatch.diffAbs).toBe(25);
    expect(reconcileClose({ ...base, close: 9125 }, null, 'r1', base.ticker, base.tradeDate).status).toBe('PRIMARY_ONLY');
    expect(reconcileClose(null, { ...base, close: 9125 }, 'r1', base.ticker, base.tradeDate).status).toBe('SECONDARY_ONLY');
    expect(reconcileClose(null, null, 'r1', base.ticker, base.tradeDate).status).toBe('NO_DATA');
  });

  it('parses common IDX Stock Summary response fields without inventing missing rows', () => {
    const rows = parseIdxStockSummary({ data: [{ StockCode: 'BBCA', Close: 9125 }, { StockCode: 'BAD', Close: null }] }, '2026-08-14');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ ticker: 'BBCA.JK', close: 9125, tradeDate: '2026-08-14' });
  });

  it('parses official IDX TradingInfoSS artifacts as close observations', () => {
    const rows = parseIdxTradingInfoArtifact({
      source: 'IDX_OFFICIAL_API',
      history: [
        { date: '2026-08-14', close: 9125 },
        { date: '2026-08-15', close: null },
        { date: 'bad-date', close: 9100 },
      ],
    }, 'BBCA');

    expect(rows).toEqual([{
      ticker: 'BBCA.JK',
      tradeDate: '2026-08-14',
      close: 9125,
      observedAt: '2026-08-14T16:00:00+07:00',
      source: 'IDX_TRADING_INFO_SS_ARTIFACT',
    }]);
  });
});
