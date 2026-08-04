import { describe, it, expect } from 'vitest';
import { buildExportFileName } from '../export-filename';

describe('buildExportFileName', () => {
  it('builds fundamental filename with cleaned ticker and ISO date', () => {
    const date = new Date('2026-08-05T10:00:00Z');
    expect(buildExportFileName('Fundamental', 'TLKM.JK', date)).toBe('SahamLens_Fundamental_TLKM_2026-08-05.png');
  });

  it('builds technical filename', () => {
    const date = new Date('2026-08-05T10:00:00Z');
    expect(buildExportFileName('Technical', 'bbca', date)).toBe('SahamLens_Technical_BBCA_2026-08-05.png');
  });

  it('strips .JK suffix and uppercases ticker regardless of input casing', () => {
    const date = new Date('2026-01-01T00:00:00Z');
    expect(buildExportFileName('Fundamental', 'gotO.jk'.toUpperCase().replace('.JK', '') + '.JK', date)).toBe('SahamLens_Fundamental_GOTO_2026-01-01.png');
  });
});
