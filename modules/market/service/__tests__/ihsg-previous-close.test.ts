import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { correctIhsgPreviousClose } from '../live-price.service';
import { parseIdxIhsgArtifact } from '../idx-ihsg-eod.service';

// Insiden 2026-09-23: banner -1% saat IHSG live +0,64% - Yahoo previousClose basi
// (menunjuk tutup 21 Sep 6384,73 padahal 22 Sep sudah tutup 6277,04 di artefak BEI).

let tmpDir: string | null = null;

function writeEodArtifact(rows: { date: string; close: number }[]): string {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ihsg-eod-'));
  fs.writeFileSync(path.join(tmpDir, 'ihsg.json'), JSON.stringify({ history: rows }));
  return tmpDir;
}

afterEach(() => {
  if (tmpDir) { fs.rmSync(tmpDir, { recursive: true, force: true }); tmpDir = null; }
});

describe('correctIhsgPreviousClose (^JKSE)', () => {
  it('mengoreksi previousClose Yahoo basi ke close resmi artefak BEI terbaru', () => {
    writeEodArtifact([
      { date: '2026-09-18', close: 6441.159 },
      { date: '2026-09-21', close: 6384.726 },
      { date: '2026-09-22', close: 6277.044 },
    ]);
    // Bar harian Yahoo: [..., 18 Sep, 21 Sep] - 22 Sep tidak ada di Yahoo.
    // prev bar = 21 Sep (timestamps epoch 09:15 WIB), artefak 22 Sep lebih baru.
    const ts21 = Date.UTC(2026, 8, 21, 2, 15) / 1000;
    const ts18 = Date.UTC(2026, 8, 18, 2, 15) / 1000;
    const out = correctIhsgPreviousClose('^JKSE', [ts18, ts21], 6384.726, tmpDir!);
    expect(out.source).toBe('IDX_OFFICIAL_INDEX_SUMMARY');
    expect(out.previousClose).toBe(6277.044);
  });

  it('tidak mengoreksi bila artefak sudah tertinggal dari Yahoo (sync lambat)', () => {
    writeEodArtifact([
      { date: '2026-09-18', close: 6441.159 },
    ]);
    const ts21 = Date.UTC(2026, 8, 21, 2, 15) / 1000;
    const ts18 = Date.UTC(2026, 8, 18, 2, 15) / 1000;
    const out = correctIhsgPreviousClose('^JKSE', [ts18, ts21], 6384.726, tmpDir!);
    expect(out.source).toBe('YAHOO');
    expect(out.previousClose).toBe(6384.726);
  });

  it('tidak menyentuh ticker selain ^JKSE', () => {
    const out = correctIhsgPreviousClose('BBCA.JK', [1, 2], 8000, '/nonexistent/ihsg.json');
    expect(out.source).toBe('YAHOO');
    expect(out.previousClose).toBe(8000);
  });

  it('parseIdxIhsgArtifact tetap lolos penjaga jumlah baris (gerbang pemindai)', () => {
    const rows = parseIdxIhsgArtifact({ history: [
      { date: '2026-09-22', close: '6277.044' },
      { date: 'invalid', close: 100 },
      { date: '2026-09-21', close: 6384.726 },
    ] });
    expect(rows.length).toBe(2);
    expect(rows[0].date).toBe('2026-09-21');
  });
});
