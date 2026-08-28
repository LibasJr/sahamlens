import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/shared/database/postgres.client', () => ({
  pool: { query: vi.fn() },
}));
vi.mock('@/shared/cache/redis-cache', () => ({
  pingRedis: vi.fn(),
}));
vi.mock('@/modules/observability/service/data-source-health.service', () => ({
  listDataSourceHealth: vi.fn(),
}));

import { GET } from '../route';
import { pool } from '@/shared/database/postgres.client';
import { pingRedis } from '@/shared/cache/redis-cache';
import { listDataSourceHealth } from '@/modules/observability/service/data-source-health.service';
import type { NextRequest } from 'next/server';

// Request pertama route handler TIDAK boleh opsional (CLAUDE.md §1) - jadi test yang
// butuh memanggilnya membuat Request-nya sendiri, bukan melonggarkan tanda tangannya.
const request = () => new Request('http://localhost/api/health') as unknown as NextRequest;

async function callHealth() {
  const response = await GET(request());
  return { status: response.status, body: await response.json() };
}

beforeEach(() => {
  vi.mocked(pool.query).mockResolvedValue({ rows: [] } as never);
  vi.mocked(listDataSourceHealth).mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

/**
 * Redis di produksi bukan sekadar "cache lebih lambat".
 *
 * `incrWithExpiry()` sengaja TIDAK punya cadangan cache memori (lihat catatannya di
 * shared/cache/redis-cache.ts): tanpa Redis ia mengembalikan `null` dan pemanggilnya
 * fail-open. Jadi Redis mati = kuota harian dan rate limit berhenti berlaku, tanpa
 * gejala. `/api/health` harus MELAPORKANNYA (body.status='degraded', body.degraded)
 * - tapi (revisi 2026-08-26, lihat komentar di route.ts) TIDAK LAGI lewat kode status
 * HTTP. 503 untuk gangguan cache membuat deploy-vps.yml (yang menuntut HTTP 200 persis)
 * gagal walau kode sudah live, dan memaksa setiap konsumen endpoint ini menambal
 * penanganan error satu per satu (JobsMonitorClient, dll). Body tetap membawa sinyal
 * lengkap; yang berubah cuma status code yang dipakai infra untuk "kirim trafik atau
 * tidak" - dan Redis mati bukan alasan untuk berhenti melayani.
 */
describe('GET /api/health - Redis terlihat di body, TIDAK menurunkan kode status HTTP', () => {
  it('produksi tanpa REDIS_URL => 200 tapi status=degraded, bukan 503', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.mocked(pingRedis).mockResolvedValue('not_configured');

    const { status, body } = await callHealth();

    expect(status).toBe(200);
    expect(body.status).toBe('degraded');
    expect(body.degraded).toEqual(['redis:not_configured']);
  });

  it('produksi dengan Redis error => 200 tapi status=degraded', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.mocked(pingRedis).mockResolvedValue('error');

    const { status, body } = await callHealth();

    expect(status).toBe(200);
    expect(body.status).toBe('degraded');
    expect(body.degraded).toEqual(['redis:error']);
  });

  it('produksi dengan Redis ok => 200 ok dan daftar degradasi kosong', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.mocked(pingRedis).mockResolvedValue('ok');

    const { status, body } = await callHealth();

    expect(status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.degraded).toEqual([]);
  });

  it('DI LUAR produksi, Redis kosong TIDAK menurunkan status - dev tanpa Redis itu wajar', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.mocked(pingRedis).mockResolvedValue('not_configured');

    const { status, body } = await callHealth();

    expect(status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.degraded).toEqual([]);
  });
});

describe('GET /api/health - database satu-satunya alasan 503', () => {
  it('database mati => 503, dan alasannya disebut', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.mocked(pool.query).mockRejectedValue(new Error('connection refused'));
    vi.mocked(pingRedis).mockResolvedValue('ok');

    const { status, body } = await callHealth();

    expect(status).toBe(503);
    expect(body.checks.database).toBe('error');
    expect(body.degraded).toEqual(['database']);
  });

  it('database DAN Redis mati => keduanya dilaporkan, bukan cuma yang pertama, tetap 503 (dari database)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.mocked(pool.query).mockRejectedValue(new Error('connection refused'));
    vi.mocked(pingRedis).mockResolvedValue('error');

    const { status, body } = await callHealth();

    expect(status).toBe(503);
    expect(body.degraded).toEqual(['database', 'redis:error']);
  });

  it('database ok TAPI Redis mati => 200, bukan 503 - inilah kontrak yang direvisi', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.mocked(pingRedis).mockResolvedValue('error');

    const { status, body } = await callHealth();

    expect(status).toBe(200);
    expect(body.checks.database).toBe('ok');
    expect(body.status).toBe('degraded');
  });

  it('telemetry sumber data yang gagal diambil tidak ikut menggagalkan health', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.mocked(pingRedis).mockResolvedValue('ok');
    vi.mocked(listDataSourceHealth).mockRejectedValue(new Error('tabel belum dimigrasi'));

    const { status, body } = await callHealth();

    expect(status).toBe(200);
    expect(body.sources.items).toEqual([]);
  });

  it('data source DOWN membuat body degraded tanpa memblokir traffic', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.mocked(pingRedis).mockResolvedValue('ok');
    vi.mocked(listDataSourceHealth).mockResolvedValue([
      {
        sourceId: 'yahoo-chart',
        status: 'DOWN',
        lastSuccessAt: null,
        lastFailureAt: '2026-08-27T02:00:00.000Z',
        lastLatencyMs: null,
        consecutiveFailures: 3,
        dataObservedAt: null,
        detail: {},
        updatedAt: '2026-08-27T02:01:00.000Z',
      },
    ]);

    const { status, body } = await callHealth();

    expect(status).toBe(200);
    expect(body.status).toBe('degraded');
    expect(body.degraded).toContain('data_source:1');
    expect(body.operationalReadiness).toEqual(expect.objectContaining({
      servingTraffic: true,
      deployBlocking: false,
      dataSourceDegraded: true,
      dataSourceDegradedCount: 1,
      dataSourceDown: true,
      dataSourceDownCount: 1,
      dataSourceWarningCount: 0,
    }));
    expect(body.sources.down).toEqual(['yahoo-chart']);
    expect(body.sources.warnings).toEqual([]);
  });

  it('sumber IDX deprecated tetap terlihat, tetapi tidak menggagalkan readiness', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.mocked(pingRedis).mockResolvedValue('ok');
    vi.mocked(listDataSourceHealth).mockResolvedValue([
      {
        sourceId: 'IDX_PUBLIC_STOCK_SUMMARY',
        status: 'DEGRADED',
        lastSuccessAt: null,
        lastFailureAt: '2026-08-27T02:00:00.000Z',
        lastLatencyMs: null,
        consecutiveFailures: 1,
        dataObservedAt: null,
        detail: { status: 403 },
        updatedAt: '2026-08-27T02:01:00.000Z',
      },
    ]);

    const { status, body } = await callHealth();

    expect(status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.degraded).toEqual([]);
    expect(body.operationalReadiness).toEqual(expect.objectContaining({
      servingTraffic: true,
      deployBlocking: false,
      dataSourceDegraded: false,
      dataSourceDegradedCount: 0,
      dataSourceDown: false,
      dataSourceDownCount: 0,
      dataSourceWarningCount: 0,
    }));
    expect(body.sources.down).toEqual([]);
    expect(body.sources.warnings).toEqual([]);
    expect(body.sources.items).toHaveLength(1);
    expect(body.sources.items[0].sourceId).toBe('IDX_PUBLIC_STOCK_SUMMARY');
  });

  it('sumber aktif DEGRADED tetap menjadi warning', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.mocked(pingRedis).mockResolvedValue('ok');
    vi.mocked(listDataSourceHealth).mockResolvedValue([
      {
        sourceId: 'IDX_TRADING_INFO_SS_ARTIFACT',
        status: 'DEGRADED',
        lastSuccessAt: null,
        lastFailureAt: '2026-08-27T02:00:00.000Z',
        lastLatencyMs: null,
        consecutiveFailures: 1,
        dataObservedAt: null,
        detail: {},
        updatedAt: '2026-08-27T02:01:00.000Z',
      },
    ]);

    const { status, body } = await callHealth();

    expect(status).toBe(200);
    expect(body.status).toBe('degraded');
    expect(body.degraded).toEqual(['data_source:1']);
    expect(body.sources.warnings).toEqual(['IDX_TRADING_INFO_SS_ARTIFACT']);
  });
});
