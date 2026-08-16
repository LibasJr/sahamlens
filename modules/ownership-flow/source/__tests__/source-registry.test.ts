import { describe, expect, it } from 'vitest';
import {
  canIngest,
  getPrimarySource,
  KSEI_HOLDING_COMPOSITION_ARCHIVE,
  KSEI_REGISTERED_SECURITY,
  OWNERSHIP_SOURCES,
} from '../source-registry';
import type { OwnershipFlowConfig } from '../../config/ownership-flow.config';

// Gerbang fail-closed adalah pengaman terpenting modul ini. Test di bawah menjaga
// agar ia tidak bisa dilewati hanya dengan menyalakan environment variable.

const ENABLED_CONFIG: OwnershipFlowConfig = {
  enabled: true,
  cronEnabled: true,
  ingestionEnabled: true,
  maxConcurrency: 3,
  timeoutMs: 15_000,
  minDelayMs: 250,
  universeLimit: 0,
  cacheTtlSec: 1_800,
};

describe('registry sumber', () => {
  it('snapshot live tetap UNVERIFIED, arsip bulanan sudah VERIFIED', () => {
    // Audit 2026-08-16 membuktikan format arsip Balancepos resmi: TXT pipe-delimited
    // dengan tanggal DD-MMM-YYYY dan kolom Total Local/Foreign. Ini TIDAK memberi
    // izin kepada sumber snapshot live per-ticker yang masih punya kasus placeholder.
    expect(KSEI_REGISTERED_SECURITY.auditStatus).toBe('UNVERIFIED');
    expect(KSEI_HOLDING_COMPOSITION_ARCHIVE.auditStatus).toBe('VERIFIED');
    expect(KSEI_HOLDING_COMPOSITION_ARCHIVE.format).toBe('TXT');
  });

  it('semua sumber memakai HTTPS dan tanpa kredensial di URL', () => {
    for (const source of OWNERSHIP_SOURCES) {
      expect(source.baseUrl.startsWith('https://')).toBe(true);
      expect(source.baseUrl).not.toMatch(/[?&](token|key|session|password)=/i);
      expect(source.baseUrl).not.toContain('@');
    }
  });

  it('arsip bulanan ditandai sebagai seed historis, bukan snapshot harian', () => {
    // Pembeda ini mencegah kesalahan kelas berat: memperlakukan posisi akhir bulan
    // sebagai observasi harian akan menghasilkan delta 1D/7D yang sepenuhnya fiktif.
    expect(KSEI_HOLDING_COMPOSITION_ARCHIVE.usage).toBe('HISTORICAL_SEED');
    expect(KSEI_HOLDING_COMPOSITION_ARCHIVE.cadence).toBe('MONTHLY');
    expect(getPrimarySource().usage).toBe('PRIMARY_SNAPSHOT');
  });

  it('cadence sumber utama belum diklaim harian sebelum dibuktikan', () => {
    expect(KSEI_REGISTERED_SECURITY.cadence).toBe('UNKNOWN');
  });
});

describe('canIngest - gerbang fail-closed', () => {
  it('MENOLAK walaupun semua feature flag menyala, selama sumber UNVERIFIED', () => {
    const gate = canIngest(KSEI_REGISTERED_SECURITY, ENABLED_CONFIG);
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toBe('SOURCE_UNVERIFIED');
  });

  it('menolak ketika modul dimatikan', () => {
    const gate = canIngest(KSEI_REGISTERED_SECURITY, { ...ENABLED_CONFIG, enabled: false });
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toBe('MODULE_DISABLED');
  });

  it('menolak sumber yang ditandai PROHIBITED', () => {
    const gate = canIngest(
      { ...KSEI_REGISTERED_SECURITY, auditStatus: 'PROHIBITED' },
      ENABLED_CONFIG
    );
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toBe('SOURCE_PROHIBITED');
  });

  it('tetap menolak sumber VERIFIED jika ingestion belum dinyalakan operator', () => {
    const gate = canIngest(
      { ...KSEI_REGISTERED_SECURITY, auditStatus: 'VERIFIED' },
      { ...ENABLED_CONFIG, ingestionEnabled: false }
    );
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toBe('INGESTION_DISABLED');
  });

  it('mengizinkan hanya ketika sumber VERIFIED DAN kedua flag menyala', () => {
    const gate = canIngest({ ...KSEI_REGISTERED_SECURITY, auditStatus: 'VERIFIED' }, ENABLED_CONFIG);
    expect(gate.allowed).toBe(true);
    expect(gate.reason).toBe('OK');
  });
});
