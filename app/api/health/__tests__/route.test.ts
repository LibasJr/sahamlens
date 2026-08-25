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
 * gejala. Sebelum perbaikan ini `/api/health` tetap membalas 200 "ok" untuk keadaan itu,
 * dan halaman /status ikut melaporkannya sehat.
 */
describe('GET /api/health - Redis ikut menentukan sehat, hanya di produksi', () => {
  it('produksi tanpa REDIS_URL => 503 degraded, bukan 200 ok', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.mocked(pingRedis).mockResolvedValue('not_configured');

    const { status, body } = await callHealth();

    expect(status).toBe(503);
    expect(body.status).toBe('degraded');
    expect(body.degraded).toEqual(['redis:not_configured']);
  });

  it('produksi dengan Redis error => 503 degraded', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.mocked(pingRedis).mockResolvedValue('error');

    const { status, body } = await callHealth();

    expect(status).toBe(503);
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

describe('GET /api/health - database tetap penentu utama', () => {
  it('database mati => 503, dan alasannya disebut', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.mocked(pool.query).mockRejectedValue(new Error('connection refused'));
    vi.mocked(pingRedis).mockResolvedValue('ok');

    const { status, body } = await callHealth();

    expect(status).toBe(503);
    expect(body.checks.database).toBe('error');
    expect(body.degraded).toEqual(['database']);
  });

  it('database DAN Redis mati => keduanya dilaporkan, bukan cuma yang pertama', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.mocked(pool.query).mockRejectedValue(new Error('connection refused'));
    vi.mocked(pingRedis).mockResolvedValue('error');

    const { body } = await callHealth();

    expect(body.degraded).toEqual(['database', 'redis:error']);
  });

  it('telemetry sumber data yang gagal diambil tidak ikut menggagalkan health', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.mocked(pingRedis).mockResolvedValue('ok');
    vi.mocked(listDataSourceHealth).mockRejectedValue(new Error('tabel belum dimigrasi'));

    const { status, body } = await callHealth();

    expect(status).toBe(200);
    expect(body.sources.items).toEqual([]);
  });
});
