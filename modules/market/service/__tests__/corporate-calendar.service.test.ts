import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readKseiCalendarArtifact } from '../corporate-calendar.service';

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });
function artifact(payload: unknown): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ksei-calendar-')); dirs.push(dir);
  const file = path.join(dir, 'ksei-rups.json'); fs.writeFileSync(file, JSON.stringify(payload)); return file;
}

describe('readKseiCalendarArtifact', () => {
  it('mempertahankan event dan provenance primer yang valid', () => {
    const now = new Date('2026-09-05T05:00:00Z');
    const file = artifact({ schemaVersion: 1, source: 'KSEI_OFFICIAL', generatedAt: '2026-09-05T04:00:00Z', status: 'COMPLETE', coverage: { years: [2026], documentsDiscovered: 1, eventsVerified: 1, documentsRejected: 0 }, events: [{ id: 'KSEI:DGWG', symbol: 'DGWG', type: 'RUPSLB', date: '2026-09-28', title: 'RUPSLB DGWG', description: 'Resmi', source: 'KSEI_OFFICIAL', sourceUrl: 'https://web.ksei.co.id/Announcement/Files/test.pdf', verification: 'VERIFIED_PRIMARY_SOURCE' }] });
    const result = readKseiCalendarArtifact(now, file);
    expect(result.coverage.status).toBe('COMPLETE');
    expect(result.events[0]).toMatchObject({ symbol: 'DGWG', date: '2026-09-28', verification: 'VERIFIED_PRIMARY_SOURCE' });
  });
  it('fail closed bila artifact hilang atau schema tidak sah', () => {
    expect(readKseiCalendarArtifact(new Date(), '/does/not/exist').coverage.status).toBe('UNAVAILABLE');
    expect(readKseiCalendarArtifact(new Date(), artifact({ events: [] })).events).toEqual([]);
  });
  it('menandai snapshot lama sebagai STALE tanpa menyamarkannya sebagai lengkap', () => {
    const file = artifact({ schemaVersion: 1, source: 'KSEI_OFFICIAL', generatedAt: '2026-09-01T00:00:00Z', status: 'COMPLETE', coverage: { years: [2026], documentsDiscovered: 0, eventsVerified: 0, documentsRejected: 0 }, events: [] });
    expect(readKseiCalendarArtifact(new Date('2026-09-05T00:00:00Z'), file).coverage.status).toBe('STALE');
  });
});
