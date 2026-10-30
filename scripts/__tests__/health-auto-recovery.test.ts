import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';

let currentMockClient: any = null;

vi.mock('pg', () => {
  return {
    Client: class {
      constructor() {
        return currentMockClient;
      }
    },
    default: {
      Client: class {
        constructor() {
          return currentMockClient;
        }
      },
    },
  };
});

import { runAutoRecovery } from '../health-auto-recovery.mjs';

describe('runAutoRecovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentMockClient = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('mengembalikan status OK jika /api/health sudah ok', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const logMessages: string[] = [];
    const result = await runAutoRecovery({
      origin: 'http://mock-origin',
      logger: (msg: string) => logMessages.push(msg),
    });

    expect(result.status).toBe('OK');
    expect(result.recovered).toEqual([]);
    expect(logMessages).toContain('[auto-recovery] /api/health sehat (status=ok). Tidak ada tindakan diperlukan.');
  });

  it('memulihkan AI_COUNCIL bila probe chat berhasil', async () => {
    const mockQuery = vi.fn();
    mockQuery.mockResolvedValueOnce({
      rows: [{ source_id: 'AI_COUNCIL', status: 'DEGRADED', consecutive_failures: 1, last_failure_at: null, detail: {} }],
    });
    mockQuery.mockResolvedValueOnce({ rowCount: 1 });

    currentMockClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      query: mockQuery,
      end: vi.fn().mockResolvedValue(undefined),
    };

    let healthCallCount = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/api/health')) {
        healthCallCount++;
        return {
          ok: true,
          json: async () => ({ status: healthCallCount === 1 ? 'degraded' : 'ok' }),
        };
      }
      if (url.includes('/api/chat')) {
        return {
          ok: true,
          json: async () => ({ role: 'assistant', content: 'Halo' }),
        };
      }
      return { ok: false };
    });
    vi.stubGlobal('fetch', fetchMock);

    const logMessages: string[] = [];
    const result = await runAutoRecovery({
      origin: 'http://mock-origin',
      databaseUrl: 'postgres://localhost/mock',
      logger: (msg: string) => logMessages.push(msg),
    });

    expect(result.status).toBe('ok');
    expect(result.recovered).toContain('AI_COUNCIL');
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE data_source_health'),
      ['AI_COUNCIL'],
    );
  });

  it('memulihkan YAHOO_CHART bila direct Yahoo probe berhasil', async () => {
    const mockQuery = vi.fn();
    mockQuery.mockResolvedValueOnce({
      rows: [{ source_id: 'YAHOO_CHART', status: 'DEGRADED', consecutive_failures: 1, last_failure_at: null, detail: {} }],
    });
    mockQuery.mockResolvedValueOnce({ rowCount: 1 });

    currentMockClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      query: mockQuery,
      end: vi.fn().mockResolvedValue(undefined),
    };

    let healthCallCount = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/api/health')) {
        healthCallCount++;
        return {
          ok: true,
          json: async () => ({ status: healthCallCount === 1 ? 'degraded' : 'ok' }),
        };
      }
      if (url.includes('yahoo.com')) {
        return {
          ok: true,
          json: async () => ({
            chart: { result: [{ meta: { regularMarketPrice: 5000 } }] },
          }),
        };
      }
      return { ok: false };
    });
    vi.stubGlobal('fetch', fetchMock);

    const logMessages: string[] = [];
    const result = await runAutoRecovery({
      origin: 'http://mock-origin',
      databaseUrl: 'postgres://localhost/mock',
      logger: (msg: string) => logMessages.push(msg),
    });

    expect(result.status).toBe('ok');
    expect(result.recovered).toContain('YAHOO_CHART');
  });

  it('memulihkan DJPPR_SBN_BENCHMARK_QUOTES bila bukti makro di DB masih SEGAR', async () => {
    const mockQuery = vi.fn();
    mockQuery.mockResolvedValueOnce({
      rows: [{ source_id: 'DJPPR_SBN_BENCHMARK_QUOTES', status: 'DEGRADED', consecutive_failures: 1, last_failure_at: null, detail: {} }],
    });
    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
    mockQuery.mockResolvedValueOnce({
      rows: [{ usable_from_date: sevenDaysAgo, value_pct: 7.18 }],
    });
    mockQuery.mockResolvedValueOnce({ rowCount: 1 });

    currentMockClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      query: mockQuery,
      end: vi.fn().mockResolvedValue(undefined),
    };

    let healthCallCount = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/api/health')) {
        healthCallCount++;
        return {
          ok: true,
          json: async () => ({ status: healthCallCount === 1 ? 'degraded' : 'ok' }),
        };
      }
      return { ok: false };
    });
    vi.stubGlobal('fetch', fetchMock);

    const logMessages: string[] = [];
    const result = await runAutoRecovery({
      origin: 'http://mock-origin',
      databaseUrl: 'postgres://localhost/mock',
      logger: (msg: string) => logMessages.push(msg),
    });

    expect(result.status).toBe('ok');
    expect(result.recovered).toContain('DJPPR_SBN_BENCHMARK_QUOTES');
  });

  it('memulihkan IDX_TRADING_INFO_SS bila artefak lokal foreign-flow masih SEGAR', async () => {
    const mockQuery = vi.fn();
    mockQuery.mockResolvedValueOnce({
      rows: [{ source_id: 'IDX_TRADING_INFO_SS', status: 'DOWN', consecutive_failures: 5000, last_failure_at: null, detail: {} }],
    });
    mockQuery.mockResolvedValueOnce({ rowCount: 1 });

    currentMockClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      query: mockQuery,
      end: vi.fn().mockResolvedValue(undefined),
    };

    const existsSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    const today = new Date().toISOString().slice(0, 10);
    const readSpy = vi.spyOn(fs, 'readFileSync').mockReturnValue(
      JSON.stringify({ data: [{ date: today, close: 5000 }] }) as any,
    );

    let healthCallCount = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/api/health')) {
        healthCallCount++;
        return {
          ok: true,
          json: async () => ({ status: healthCallCount === 1 ? 'degraded' : 'ok' }),
        };
      }
      return { ok: false };
    });
    vi.stubGlobal('fetch', fetchMock);

    const logMessages: string[] = [];
    const result = await runAutoRecovery({
      origin: 'http://mock-origin',
      databaseUrl: 'postgres://localhost/mock',
      logger: (msg: string) => logMessages.push(msg),
    });

    expect(result.status).toBe('ok');
    expect(result.recovered).toContain('IDX_TRADING_INFO_SS');

    existsSpy.mockRestore();
    readSpy.mockRestore();
  });

  it('membersihkan transient RSS timeout bila kegagalan >5m lalu', async () => {
    const mockQuery = vi.fn();
    const tenMinutesAgo = new Date(Date.now() - 10 * 60_000).toISOString();
    mockQuery.mockResolvedValueOnce({
      rows: [{ source_id: 'RSS_KATADATA_CO_ID', status: 'DEGRADED', consecutive_failures: 1, last_failure_at: tenMinutesAgo, detail: {} }],
    });
    mockQuery.mockResolvedValueOnce({ rowCount: 1 });

    currentMockClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      query: mockQuery,
      end: vi.fn().mockResolvedValue(undefined),
    };

    let healthCallCount = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/api/health')) {
        healthCallCount++;
        return {
          ok: true,
          json: async () => ({ status: healthCallCount === 1 ? 'degraded' : 'ok' }),
        };
      }
      return { ok: false };
    });
    vi.stubGlobal('fetch', fetchMock);

    const logMessages: string[] = [];
    const result = await runAutoRecovery({
      origin: 'http://mock-origin',
      databaseUrl: 'postgres://localhost/mock',
      logger: (msg: string) => logMessages.push(msg),
    });

    expect(result.status).toBe('ok');
    expect(result.recovered).toContain('RSS_KATADATA_CO_ID');
  });
});
