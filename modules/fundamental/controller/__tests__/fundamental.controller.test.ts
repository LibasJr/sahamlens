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

  it('adds the standard envelope to PIT success while preserving legacy fields', async () => {
    const pitPayload = {
      ticker: 'BBCA.JK',
      mode: 'PIT',
      requested_as_of: '2020-01-01',
      available: true,
      price: null,
    };
    vi.mocked(buildPitFundamentalAnalysis).mockResolvedValue(pitPayload as any);

    const result = await handleGetFundamental(
      new Request('http://localhost/api/fundamental/BBCA.JK?as_of=2020-01-01'),
      'BBCA.JK',
    );
    const body = result.body as any;

    expect(result.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data).toEqual(pitPayload);
    expect(body.meta).toEqual(expect.objectContaining({
      dataAsOf: '2020-01-01',
      source: 'fundamental-history-pit',
    }));
    expect(body.ticker).toBe('BBCA.JK');
    expect(body.mode).toBe('PIT');
    expect(body.available).toBe(true);
  });

  it('keeps current mode behind the shared computed cache', async () => {
    vi.mocked(getOrCompute).mockResolvedValue({ ticker: 'BBCA.JK', price: 9000 } as any);
    const result = await handleGetFundamental(new Request('http://localhost/api/fundamental/BBCA.JK'), 'BBCA.JK');
    expect(result.status).toBe(200);
    expect(getOrCompute).toHaveBeenCalledOnce();
  });

  it('adds the standard envelope to current success while preserving legacy fields', async () => {
    const currentPayload = { ticker: 'BBCA.JK', price: 9000, consensus: 'FAIR' };
    vi.mocked(getOrCompute).mockResolvedValue(currentPayload as any);

    const result = await handleGetFundamental(
      new Request('http://localhost/api/fundamental/BBCA.JK'),
      'BBCA.JK',
    );
    const body = result.body as any;

    expect(result.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data).toEqual(currentPayload);
    expect(body.meta).toEqual(expect.objectContaining({
      source: 'current-fundamental-computed-cache',
    }));
    expect(body.ticker).toBe('BBCA.JK');
    expect(body.price).toBe(9000);
    expect(body.consensus).toBe('FAIR');
  });

  it('maps current source not-found to 404', async () => {
    vi.mocked(getOrCompute).mockResolvedValue({ notFound: true } as any);
    const result = await handleGetFundamental(new Request('http://localhost/api/fundamental/BBCA.JK'), 'BBCA.JK');
    expect(result.status).toBe(404);
  });
});
