import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  hasOpenOrProAccess: vi.fn(),
  isInternalServiceRequest: vi.fn(),
  recordAnalisaHit: vi.fn(),
  peekDailyAnalisaUsed: vi.fn(),
  getUsedSymbolsToday: vi.fn(),
}));

vi.mock('@/modules/user', () => ({
  getSession: mocks.getSession,
  hasOpenOrProAccess: mocks.hasOpenOrProAccess,
}));
vi.mock('@/shared/auth/internal-service', () => ({
  isInternalServiceRequest: mocks.isInternalServiceRequest,
}));
vi.mock('@/lib/serverStats', () => ({ recordAnalisaHit: mocks.recordAnalisaHit }));
vi.mock('@/shared/usage/daily-analisa-quota', () => ({
  getUsedSymbolsToday: mocks.getUsedSymbolsToday,
  peekDailyAnalisaUsed: mocks.peekDailyAnalisaUsed,
  recordDailyAnalisa: vi.fn(),
}));

import { resolveStockAnalysisAccess } from './stock-analysis-access.service';

const request = new Request('https://sahamlens.id/api/stock/BBCA.JK');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isInternalServiceRequest.mockReturnValue(false);
  mocks.hasOpenOrProAccess.mockResolvedValue(true);
});

describe('resolveStockAnalysisAccess guest boundary', () => {
  it('rejects guest before premium access resolution even during testing-open', async () => {
    mocks.getSession.mockResolvedValue(null);

    const result = await resolveStockAnalysisAccess(request, 'BBCA.JK');

    expect(result).toEqual({
      ok: false,
      response: { status: 401, body: { error: 'Sesi tidak valid', code: 'UNAUTHENTICATED' } },
    });
    expect(mocks.hasOpenOrProAccess).not.toHaveBeenCalled();
    expect(mocks.recordAnalisaHit).not.toHaveBeenCalled();
  });
});
