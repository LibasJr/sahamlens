import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildSourceUrl,
  getOwnershipUniverse,
  runOwnershipFlowIngestion,
  toShortCode,
} from '../ownership-flow-ingest.service';
import { getPrimarySource } from '../../source/source-registry';

// CATATAN PENTING TENTANG TEST INI:
// Seluruh test di bawah berjalan dengan sumber berstatus UNVERIFIED (keadaan
// sebenarnya saat ini), jadi ingestion berhenti di gerbang SEBELUM menyentuh
// jaringan maupun database. Justru itu yang diuji: fail-closed bukan sekadar
// "tidak menyimpan hasil", melainkan "tidak mengambil apa pun sejak awal".

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe('universe', () => {
  it('memakai universe kanonik SahamLens, bukan daftar baru', () => {
    const universe = getOwnershipUniverse();
    expect(universe.length).toBeGreaterThan(100);
    // Seluruh ticker sudah ternormalisasi ke konvensi internal.
    expect(universe.every((t) => t.endsWith('.JK'))).toBe(true);
    expect(universe).toContain('BBRI.JK');
  });

  it('tidak memuat duplikat', () => {
    const universe = getOwnershipUniverse();
    expect(new Set(universe).size).toBe(universe.length);
  });

  it('menghormati batas jumlah', () => {
    expect(getOwnershipUniverse(5)).toHaveLength(5);
  });
});

describe('buildSourceUrl', () => {
  it('membangun URL per emiten tanpa kredensial apa pun', () => {
    const url = buildSourceUrl(getPrimarySource(), 'BBRI.JK');
    expect(url).toContain('/BBRI');
    expect(url.startsWith('https://')).toBe(true);
    expect(url).not.toMatch(/token|session|cookie|password/i);
  });

  it('membuang sufiks .JK untuk kode pendek sumber', () => {
    expect(toShortCode('BBRI.JK')).toBe('BBRI');
    expect(toShortCode('BBRI')).toBe('BBRI');
  });
});

describe('runOwnershipFlowIngestion - fail-closed', () => {
  it('BLOCKED dan TIDAK melakukan satu pun request saat sumber belum terverifikasi', async () => {
    process.env.OWNERSHIP_FLOW_ENABLED = 'true';
    process.env.OWNERSHIP_FLOW_INGESTION_ENABLED = 'true';

    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const result = await runOwnershipFlowIngestion({ limit: 3 });

    expect(result.status).toBe('BLOCKED');
    expect(result.gate.reason).toBe('SOURCE_UNVERIFIED');
    expect(result.sourceAuditStatus).toBe('UNVERIFIED');
    // Nol trafik ke sumber, nol baris ditulis.
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.inserted).toBe(0);
    expect(result.attempted).toBe(0);
  });

  it('BLOCKED juga ketika modul dimatikan seluruhnya', async () => {
    process.env.OWNERSHIP_FLOW_ENABLED = 'false';
    const result = await runOwnershipFlowIngestion({ limit: 3 });
    expect(result.status).toBe('BLOCKED');
    expect(result.gate.reason).toBe('MODULE_DISABLED');
  });

  it('tidak pernah mengarang baris hasil - succeeded selalu 0 saat diblokir', async () => {
    process.env.OWNERSHIP_FLOW_ENABLED = 'true';
    const result = await runOwnershipFlowIngestion({ limit: 3 });
    expect(result.succeeded).toBe(0);
    expect(result.observedDates).toEqual([]);
    expect(result.failures).toEqual([]);
  });
});
