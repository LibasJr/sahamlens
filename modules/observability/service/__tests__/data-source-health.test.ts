import { describe, expect, it } from 'vitest';
import { buildHealthUpsert, DOWN_AFTER_CONSECUTIVE_FAILURES } from '../data-source-health.sql';

const dasar = { sourceId: 'UJI_SUMBER', ok: true } as const;

describe('buildHealthUpsert', () => {
  it('semua placeholder $n terpakai tepat seurutan dengan nilai', () => {
    const { text, values } = buildHealthUpsert(dasar);
    const dipakai = [...text.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]));
    const unik = [...new Set(dipakai)].sort((a, b) => a - b);
    // Regresi bug 42P18: parameter tak terpakai = Postgres tak bisa menyimpulkan tipe.
    expect(unik).toEqual(values.map((_, i) => i + 1));
    expect(new Set(dipakai).size).toBe(unik.length);
  });

  it('menolak bila ada placeholder di luar jumlah nilai', () => {
    const { text, values } = buildHealthUpsert(dasar);
    const tertinggi = Math.max(...[...text.matchAll(/\$(\d+)/g)].map((m) => Number(m[1])));
    expect(tertinggi).toBe(values.length);
  });

  it('membawa bendera ok sebagai boolean di posisi kedua', () => {
    expect(buildHealthUpsert({ ...dasar, ok: false }).values[1]).toBe(false);
    expect(buildHealthUpsert({ ...dasar, ok: true }).values[1]).toBe(true);
  });

  it('mengisi bawaan null dan detail kosong tanpa undefined', () => {
    const { values } = buildHealthUpsert(dasar);
    expect(values[2]).toBeNull();
    expect(values[3]).toBeNull();
    expect(values[4]).toBe('{}');
    expect(values[5]).toBe(DOWN_AFTER_CONSECUTIVE_FAILURES);
    expect(values.some((v) => v === undefined)).toBe(false);
  });

  it('meneruskan latensi, tanggal observasi, dan detail apa adanya', () => {
    const { values } = buildHealthUpsert({
      sourceId: 'UJI_SUMBER',
      ok: true,
      latencyMs: 321,
      dataObservedAt: '2026-09-18',
      detail: { status: 'SUCCESS', evidenceId: 16 },
    });
    expect(values[2]).toBe(321);
    expect(values[3]).toBe('2026-09-18');
    expect(JSON.parse(String(values[4]))).toEqual({ status: 'SUCCESS', evidenceId: 16 });
  });

  it('memakai now() untuk cap waktu dan memperbarui baris yang sudah ada', () => {
    const { text } = buildHealthUpsert(dasar);
    expect(text).toContain('ON CONFLICT(source_id) DO UPDATE SET');
    expect(text).toContain('updated_at=now()');
    expect(text).not.toContain('$7');
  });
});