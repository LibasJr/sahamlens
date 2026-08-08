import { beforeEach, describe, expect, it, vi } from 'vitest';

const asOfMock = vi.fn();
const historyMock = vi.fn();

vi.mock('@/modules/fundamental/repository/fundamental-history.repository', () => ({
  asOf: asOfMock,
}));

vi.mock('@/modules/technical/service/yahoo-history.service', () => ({
  fetchYahooHistory: historyMock,
}));

import { buildChatVerifiedData } from '../chat-data-router';

function pit(ticker: string, observedDate: string, periodEnd: string, per: number) {
  return {
    ticker,
    observedDate,
    periodEnd,
    per,
    pbv: 1,
    roe: 10,
    der: 0.5,
    currentRatio: 1.5,
    revenueGrowth: 5,
  };
}

const baseDate = {
  mode: 'HISTORICAL' as const,
  requestedAsOf: '2025-04-30',
  invalidDate: null,
  incompleteDate: null,
  source: 'explicit' as const,
};

beforeEach(() => {
  asOfMock.mockReset();
  historyMock.mockReset();
});

describe('historical PIT fail-closed router', () => {
  it.each(['ADRO', 'BREN'])('%s boundary: 2025-04-29 tidak memakai Q1 observed 2025-04-30', async (ticker) => {
    asOfMock.mockImplementation(async (_symbol: string, date: string) =>
      date === '2025-04-29'
        ? pit(`${ticker}.JK`, '2025-03-03', '2024-12-31', 10)
        : pit(`${ticker}.JK`, '2025-04-30', '2025-03-31', 20),
    );

    const result = await buildChatVerifiedData({
      intent: 'FUNDAMENTAL_HISTORICAL',
      compareScope: 'FUNDAMENTAL',
      requestedMetrics: [],
      tickers: [ticker],
      date: { ...baseDate, requestedAsOf: '2025-04-29' },
      prompt: `${ticker} per 29 April 2025`,
    });

    expect(result.verifiedBlock).toContain('period_end: 2024-12-31');
    expect(result.verifiedBlock).not.toContain('period_end: 2025-03-31');
    expect(historyMock).not.toHaveBeenCalled();
  });

  it.each(['ADRO', 'BREN'])('%s boundary: 2025-04-30 boleh memakai Q1 observed 2025-04-30', async (ticker) => {
    asOfMock.mockResolvedValue(pit(`${ticker}.JK`, '2025-04-30', '2025-03-31', ticker === 'ADRO' ? 44.66 : 1422.76));

    const result = await buildChatVerifiedData({
      intent: 'FUNDAMENTAL_HISTORICAL',
      compareScope: 'FUNDAMENTAL',
      requestedMetrics: [],
      tickers: [ticker],
      date: baseDate,
      prompt: `${ticker} per 30 April 2025`,
    });

    expect(result.verifiedBlock).toContain('observed_date: 2025-04-30');
    expect(result.verifiedBlock).toContain('period_end: 2025-03-31');
    expect(historyMock).not.toHaveBeenCalled();
  });

  it('tidak fallback current ketika PIT tidak tersedia', async () => {
    asOfMock.mockResolvedValue(null);
    const result = await buildChatVerifiedData({
      intent: 'FUNDAMENTAL_HISTORICAL',
      compareScope: 'FUNDAMENTAL',
      requestedMetrics: [],
      tickers: ['DGWG'],
      date: baseDate,
      prompt: 'DGWG per 30 April 2025',
    });
    expect(result.directResponse).toContain('tidak akan menggantinya dengan data saat ini');
    expect(result.dataError).toBe('HISTORICAL_PIT_UNAVAILABLE');
    expect(historyMock).not.toHaveBeenCalled();
  });

  it('historical technical fail closed tanpa fetch harga current', async () => {
    const result = await buildChatVerifiedData({
      intent: 'TECHNICAL_HISTORICAL',
      compareScope: 'TECHNICAL',
      requestedMetrics: ['rsi'],
      tickers: ['BBCA'],
      date: baseDate,
      prompt: 'RSI BBCA per 30 April 2025',
    });
    expect(result.directResponse).toContain('technical point-in-time historical');
    expect(historyMock).not.toHaveBeenCalled();
    expect(asOfMock).not.toHaveBeenCalled();
  });

  it('historical market fail closed tanpa fetch level IHSG current', async () => {
    const result = await buildChatVerifiedData({
      intent: 'MARKET_GENERAL',
      compareScope: 'GENERAL',
      requestedMetrics: [],
      tickers: [],
      date: baseDate,
      prompt: 'IHSG per 30 April 2025 gimana?',
    });
    expect(result.directResponse).toContain('tidak akan menggantinya dengan level IHSG atau indikator current');
    expect(result.dataError).toBe('HISTORICAL_MARKET_UNAVAILABLE');
    expect(historyMock).not.toHaveBeenCalled();
    expect(asOfMock).not.toHaveBeenCalled();
  });
});
