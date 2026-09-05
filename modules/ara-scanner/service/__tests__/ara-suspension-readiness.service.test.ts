import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  probeOfficialSuspensionArtifact,
  resolveTickerSuspension,
  type SuspensionArtifactProbe,
} from '../ara-suspension-readiness.service';
import { resolveTradingRestrictionsInput } from '../ara-uma-readiness.service';

const NOW = new Date('2026-09-05T05:00:00.000Z');
const dirs: string[] = [];

function artifact(overrides: Record<string, unknown> = {}) {
  return {
    updatedAt: '2026-09-05T04:00:00.000Z',
    source: 'IDX_OFFICIAL_API',
    coverageFrom: '2026-05-12',
    coverageTo: '2026-09-03',
    count: 2,
    unresolvedCount: 1,
    tickerCount: 2,
    suspendedTickers: ['WIKA'],
    statuses: {
      WIKA: {
        status: 'SUSPENDED', asOf: '2026-08-20', occurredAt: '2026-08-20T09:00:00',
        certain: true, uncertainDirection: null,
      },
      ADHI: {
        status: 'ACTIVE', asOf: '2026-08-25', occurredAt: '2026-08-25T10:00:00',
        certain: true, uncertainDirection: null,
      },
    },
    unresolved: [{ occurredAt: '2026-07-30T10:54:18', infoType: 'UPT' }],
    ...overrides,
  };
}

function write(value: unknown): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ara-susp-'));
  dirs.push(dir);
  const file = path.join(dir, 'suspension-index.json');
  fs.writeFileSync(file, JSON.stringify(value));
  return file;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('probeOfficialSuspensionArtifact', () => {
  it('menerima artefak resmi yang konsisten dan segar', () => {
    const probe = probeOfficialSuspensionArtifact(write(artifact()), NOW);
    expect(probe).toMatchObject({
      verified: true,
      status: 'PARTIAL',
      source: 'IDX_OFFICIAL_API GetSuspension via data/idx-suspension',
      suspendedCount: 1,
      tickerCount: 2,
      unresolvedCount: 1,
      marketWideSuspendUncertainty: false,
    });
  });

  it('fail-closed untuk file hilang, JSON rusak, dan provenance asing', () => {
    expect(probeOfficialSuspensionArtifact('/tidak/ada.json', NOW).status).toBe('MISSING');
    expect(probeOfficialSuspensionArtifact(write('{rusak'), NOW).status).toBe('MISSING');
    expect(probeOfficialSuspensionArtifact(
      write(artifact({ source: 'INDEX_ALPHA_API' })), NOW,
    ).status).toBe('MISSING');
  });

  it('menolak suspendedTickers yang tidak cocok dengan peta status', () => {
    const bohong = artifact({ suspendedTickers: ['WIKA', 'ADHI'] });
    expect(probeOfficialSuspensionArtifact(write(bohong), NOW).status).toBe('MISSING');
  });

  it('menandai STALE tanpa membuang provenance', () => {
    const probe = probeOfficialSuspensionArtifact(
      write(artifact({ updatedAt: '2026-09-01T00:00:00.000Z' })), NOW,
    );
    expect(probe).toMatchObject({ verified: false, status: 'STALE' });
    expect(probe.source).toContain('IDX_OFFICIAL_API');
  });

  it('mendeteksi ketidakpastian seluruh pasar dari baris SPT yang belum terurai', () => {
    const probe = probeOfficialSuspensionArtifact(
      write(artifact({ unresolved: [{ occurredAt: '2026-09-01T10:00:00', infoType: 'SPT' }] })),
      NOW,
    );
    expect(probe.marketWideSuspendUncertainty).toBe(true);
  });
});

describe('resolveTickerSuspension', () => {
  const statuses = artifact().statuses as never;

  it('menolak emiten yang sedang disuspensi', () => {
    const probe = probeOfficialSuspensionArtifact(write(artifact()), NOW);
    expect(resolveTickerSuspension('WIKA', probe, statuses)).toMatchObject({
      verdict: 'SUSPENDED', tradable: false,
    });
  });

  it('meloloskan emiten aktif ketika tidak ada SPT yang menggantung', () => {
    const probe = probeOfficialSuspensionArtifact(write(artifact()), NOW);
    expect(resolveTickerSuspension('ADHI', probe, statuses)).toMatchObject({
      verdict: 'ACTIVE', tradable: true, certain: true,
    });
  });

  it('TIDAK menyatakan emiten tanpa catatan sebagai aman saat ada SPT belum terurai', () => {
    // Baris '>1 Kode' bisa menyangkut emiten yang tidak pernah muncul di peta status.
    // Ini kasus paling mudah dilewatkan dan paling berbahaya.
    const probe = probeOfficialSuspensionArtifact(
      write(artifact({ unresolved: [{ occurredAt: '2026-09-01T10:00:00', infoType: 'SPT' }] })),
      NOW,
    );
    const hasil = resolveTickerSuspension('TRIN', probe, statuses);
    expect(hasil).toMatchObject({ verdict: 'NO_RECORD', certain: false, tradable: false });
    expect(hasil.reason).toContain('>1 Kode');

    // Emiten aktif pun ikut fail-closed dalam kondisi yang sama.
    expect(resolveTickerSuspension('ADHI', probe, statuses)).toMatchObject({
      verdict: 'ACTIVE', tradable: false,
    });
  });

  it('fail-closed total kalau feed tidak terverifikasi', () => {
    const rusak = probeOfficialSuspensionArtifact('/tidak/ada.json', NOW);
    expect(resolveTickerSuspension('ADHI', rusak, null)).toMatchObject({
      verdict: 'UNKNOWN', tradable: false, certain: false,
    });
  });
});

describe('resolveTradingRestrictionsInput (UMA + suspensi)', () => {
  const uma = {
    verified: true, status: 'PARTIAL' as const,
    source: 'IDX_OFFICIAL_API GetUMA via data/idx-uma',
    observedAt: '2026-09-05T04:00:00.000Z',
    count: 136, tickerCount: 127,
    coverageFrom: '2026-05-08', coverageTo: '2026-09-03',
    detail: 'ok',
  };

  it('tetap PARTIAL walau dua feed terverifikasi, karena aksi korporasi belum ada', () => {
    const susp = probeOfficialSuspensionArtifact(write(artifact()), NOW);
    const input = resolveTradingRestrictionsInput(uma, susp);
    expect(input.status).toBe('PARTIAL');
    expect(input.detail).toContain('aksi korporasi');
    expect(input.source).toContain('GetSuspension');
  });

  it('turun ke mata rantai terlemah kalau salah satu feed gagal', () => {
    const hilang: SuspensionArtifactProbe = probeOfficialSuspensionArtifact('/tidak/ada.json', NOW);
    expect(resolveTradingRestrictionsInput(uma, hilang).status).toBe('MISSING');

    const basi = probeOfficialSuspensionArtifact(
      write(artifact({ updatedAt: '2026-09-01T00:00:00.000Z' })), NOW,
    );
    expect(resolveTradingRestrictionsInput(uma, basi).status).toBe('STALE');
  });
});
