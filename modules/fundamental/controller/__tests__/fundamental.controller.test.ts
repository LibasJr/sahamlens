import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/cache/redis-cache', () => ({ getOrCompute: vi.fn() }));
vi.mock('../../service/pit-fundamental-analysis.service', () => ({ buildPitFundamentalAnalysis: vi.fn() }));
vi.mock('../../service/current-fundamental-analysis.service', () => ({ computeCurrentFundamentalAnalysis: vi.fn() }));

import { handleGetFundamental } from '../fundamental.controller';
import { getOrCompute } from '@/shared/cache/redis-cache';
import { buildPitFundamentalAnalysis } from '../../service/pit-fundamental-analysis.service';

describe('handleGetFundamental', () => {
  beforeEach(() => vi.clearAllMocks());

  it('validates PIT date format before repository work', async () => {
    const result = await handleGetFundamental(
      new Request('http://localhost/api/fundamental/BBCA.JK?as_of=19-08-2026'),
      'BBCA.JK',
    );
    expect(result.status).toBe(400);
    expect(buildPitFundamentalAnalysis).not.toHaveBeenCalled();
  });

  it('returns explicit PIT unavailable contract instead of falling back to current data', async () => {
    vi.mocked(buildPitFundamentalAnalysis).mockResolvedValue(null);
    const result = await handleGetFundamental(
      new Request('http://localhost/api/fundamental/BBCA.JK?as_of=2020-01-01'),
      'BBCA.JK',
    );
    expect(result.status).toBe(404);
    expect(result.body).toEqual(expect.objectContaining({ mode: 'PIT', available: false, requested_as_of: '2020-01-01' }));
    expect(getOrCompute).not.toHaveBeenCalled();
  });

  it('keeps current mode behind the shared computed cache', async () => {
    vi.mocked(getOrCompute).mockResolvedValue({ ticker: 'BBCA.JK', price: 9000 } as any);
    const result = await handleGetFundamental(new Request('http://localhost/api/fundamental/BBCA.JK'), 'BBCA.JK');
    expect(result.status).toBe(200);
    expect(getOrCompute).toHaveBeenCalledOnce();
  });

  it('maps current source not-found to 404', async () => {
    vi.mocked(getOrCompute).mockResolvedValue({ notFound: true } as any);
    const result = await handleGetFundamental(new Request('http://localhost/api/fundamental/BBCA.JK'), 'BBCA.JK');
    expect(result.status).toBe(404);
  });
});
