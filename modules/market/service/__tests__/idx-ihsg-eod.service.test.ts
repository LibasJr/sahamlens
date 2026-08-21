import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseIdxIhsgArtifact, readIdxIhsgEod } from '../idx-ihsg-eod.service';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

describe('IDX official IHSG EOD artifact', () => {
  it('validates, deduplicates, and orders real closes', () => {
    expect(parseIdxIhsgArtifact({ history: [
      { date: '2026-08-21', close: 8018.2 },
      { date: 'invalid', close: 9999 },
      { date: '2026-08-20', close: '7990.00' },
      { date: '2026-08-21', close: 8020.1 },
    ] })).toEqual([
      { date: '2026-08-20', close: 7990 },
      { date: '2026-08-21', close: 8020.1 },
    ]);
  });

  it('computes the close-to-close change mathematically', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ihsg-eod-'));
    dirs.push(dir);
    fs.writeFileSync(path.join(dir, 'ihsg.json'), JSON.stringify({ history: [
      { date: '2026-08-20', close: 8000 },
      { date: '2026-08-21', close: 8080 },
    ] }));
    expect(readIdxIhsgEod(dir)).toMatchObject({ price: 8080, changePct: 1, tradeDate: '2026-08-21' });
  });

  it('fails closed without two official observations', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ihsg-eod-'));
    dirs.push(dir);
    fs.writeFileSync(path.join(dir, 'ihsg.json'), JSON.stringify({ history: [{ date: '2026-08-21', close: 8080 }] }));
    expect(readIdxIhsgEod(dir)).toBeNull();
  });
});
