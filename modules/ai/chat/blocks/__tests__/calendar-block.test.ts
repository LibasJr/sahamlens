import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calendarBlock } from '../emiten-blocks';
import * as redisCache from '@/shared/cache/redis-cache';

vi.mock('@/shared/cache/redis-cache', () => ({
  cacheGet: vi.fn(),
}));

describe('calendarBlock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mengembalikan pesan cache kosong bila cache null atau kosong', async () => {
    vi.mocked(redisCache.cacheGet).mockResolvedValue(null);
    const result = await calendarBlock([]);
    expect(result).toContain('cache kalender sedang kosong');
  });

  it('mengurai struktur cache { events: { dateKey: [...] }, coverage: {...} } dengan benar', async () => {
    const mockData = {
      events: {
        '2026-09-28': [
          { symbol: 'DGWG', type: 'RUPSLB', title: 'RUPSLB DGWG', timeWib: '10:00' },
          { symbol: 'TNCA', type: 'RUPSLB', title: 'RUPSLB TNCA' },
        ],
        '2026-09-29': [
          { symbol: 'ISAT', type: 'RUPSLB', title: 'RUPSLB ISAT', timeWib: '14:00' },
        ],
      },
      coverage: { ksei: { status: 'COMPLETE' } },
    };
    vi.mocked(redisCache.cacheGet).mockResolvedValue(mockData);

    const result = await calendarBlock([]);
    expect(result).toContain('Agenda korporasi');
    expect(result).toContain('2026-09-28 | DGWG | RUPSLB | RUPSLB DGWG (10:00 WIB)');
    expect(result).toContain('2026-09-28 | TNCA | RUPSLB | RUPSLB TNCA');
    expect(result).toContain('2026-09-29 | ISAT | RUPSLB | RUPSLB ISAT (14:00 WIB)');
  });

  it('menyaring emiten spesifik bila tickers disediakan', async () => {
    const mockData = {
      events: {
        '2026-09-28': [
          { symbol: 'DGWG', type: 'RUPSLB', title: 'RUPSLB DGWG' },
          { symbol: 'TNCA', type: 'RUPSLB', title: 'RUPSLB TNCA' },
        ],
        '2026-09-29': [
          { symbol: 'ISAT', type: 'RUPSLB', title: 'RUPSLB ISAT' },
        ],
      },
    };
    vi.mocked(redisCache.cacheGet).mockResolvedValue(mockData);

    const result = await calendarBlock(['ISAT']);
    expect(result).toContain('ISAT');
    expect(result).not.toContain('DGWG');
    expect(result).not.toContain('TNCA');
  });

  it('memberikan pesan jujur bila ticker yang dicari tidak punya agenda', async () => {
    const mockData = {
      events: {
        '2026-09-28': [{ symbol: 'DGWG', type: 'RUPSLB', title: 'RUPSLB DGWG' }],
      },
    };
    vi.mocked(redisCache.cacheGet).mockResolvedValue(mockData);

    const result = await calendarBlock(['BBCA']);
    expect(result).toContain('tidak ada agenda tercatat untuk BBCA');
  });
});
