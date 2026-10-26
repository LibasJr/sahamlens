import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
    // 1. SELECT degraded sources
    mockQuery.mockResolvedValueOnce({
      rows: [{ source_id: 'AI_COUNCIL', status: 'DEGRADED', consecutive_failures: 1, last_failure_at: null, detail: {} }],
    });
    // 2. UPDATE data_source_health
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

  it('memulihkan DJPPR_SBN_BENCHMARK_QUOTES bila bukti makro di DB masih SEGAR', async () => {
    const mockQuery = vi.fn();
    // 1. SELECT degraded sources
    mockQuery.mockResolvedValueOnce({
      rows: [{ source_id: 'DJPPR_SBN_BENCHMARK_QUOTES', status: 'DEGRADED', consecutive_failures: 1, last_failure_at: null, detail: {} }],
    });
    // 2. SELECT macro evidence (7 days old)
    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
    mockQuery.mockResolvedValueOnce({
      rows: [{ usable_from_date: sevenDaysAgo, value_pct: 7.18 }],
    });
    // 3. UPDATE data_source_health
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
});
