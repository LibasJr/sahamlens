import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { LENS_SCORE_WEIGHTS, LENS_SCORE_TOTAL_WEIGHT } from '@/shared/constants/lens-score-weights';
import { SCORE_VERSION, SIGNAL_VERSION, VALUATION_VERSION, DATA_SNAPSHOT_VERSION } from '@/modules/lens-radar/constants/model-version';
import { PRODUCT_VALIDATION_STATUS, MIN_VALIDATION_DAYS } from '@/modules/lens-radar/constants/research-status';
import { LENS_RADAR_OOS_PROTOCOL_VERSION, LENS_RADAR_OOS_FREEZE_DATE } from '@/modules/lens-radar/service/walk-forward-validation.service';

// Test REGRESI: modul Intraday Validation Lab tidak boleh mengubah apa pun milik
// jalur LensScore T+20. Yang dijaga di sini bukan "kodenya rapi", melainkan bahwa
// angka produksi dan batas modul benar-benar tidak bergeser.

const ROOT = path.resolve(__dirname, '../../..');

function readAllTsFiles(dir: string): Array<{ file: string; content: string }> {
  const out: Array<{ file: string; content: string }> = [];
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop()!;
    if (!fs.existsSync(current)) continue;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.next') continue;
        stack.push(full);
      } else if (/\.tsx?$/.test(entry.name)) {
        out.push({ file: path.relative(ROOT, full), content: fs.readFileSync(full, 'utf8') });
      }
    }
  }
  return out;
}

describe('bobot produksi tidak berubah', () => {
  it('Teknikal 40 + Fundamental 30 + Flow 30 = 100', () => {
    expect(LENS_SCORE_WEIGHTS).toEqual({ technical: 40, fundamental: 30, flow: 30 });
    expect(LENS_SCORE_TOTAL_WEIGHT).toBe(100);
  });
});

describe('versi & konstanta LensScore T+20 tidak berubah', () => {
  it('versi model produksi tetap', () => {
    expect(SCORE_VERSION).toBe('lens-score-v1.6.1');
    expect(VALUATION_VERSION).toBe('valuation-v1.3.0');
    expect(SIGNAL_VERSION).toBe('lens-radar-signal-v1.3.0');
    expect(DATA_SNAPSHOT_VERSION).toBe('lens-radar-history-v1.3.0');
  });

  it('status riset dan protokol OOS T+20 tetap', () => {
    expect(PRODUCT_VALIDATION_STATUS).toBe('RESEARCH_ONLY');
    expect(MIN_VALIDATION_DAYS).toBe(90);
    expect(LENS_RADAR_OOS_PROTOCOL_VERSION).toBe('oos-v1.1');
    expect(LENS_RADAR_OOS_FREEZE_DATE).toBe('2026-08-12');
  });
});

describe('pemisahan modul', () => {
  const lensRadarFiles = readAllTsFiles(path.join(ROOT, 'modules/lens-radar'));
  const recommendationFiles = readAllTsFiles(path.join(ROOT, 'modules/recommendation'));
  const technicalFiles = readAllTsFiles(path.join(ROOT, 'modules/technical'));

  it('tidak ada file LensScore T+20 yang mengimpor modul intraday', () => {
    const offenders = [...lensRadarFiles, ...recommendationFiles, ...technicalFiles].filter((f) =>
      /from\s+['"](@\/)?modules\/intraday/.test(f.content)
    );
    expect(offenders.map((f) => f.file)).toEqual([]);
  });

  it('modul intraday tidak mengimpor bobot/ambang produksi', () => {
    const intradayFiles = readAllTsFiles(path.join(ROOT, 'modules/intraday'));
    const offenders = intradayFiles.filter(
      (f) => !f.file.includes('__tests__') && /lens-score-weights|decision-thresholds/.test(f.content)
    );
    expect(offenders.map((f) => f.file)).toEqual([]);
  });

  it('runtime schema facade tidak lagi menjalankan DDL; schema dimiliki numbered migration', () => {
    const shared = fs.readFileSync(path.join(ROOT, 'shared/database/schema.service.ts'), 'utf8');
    const intraday = fs.readFileSync(path.join(ROOT, 'modules/intraday/service/intraday-schema.service.ts'), 'utf8');
    expect(shared).not.toMatch(/CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE/i);
    expect(intraday).not.toMatch(/CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE/i);
    expect(shared).toMatch(/assertDatabaseMigrated/);
    expect(intraday).toMatch(/assertDatabaseMigrated/);
  });

  it('baseline migration tetap memuat tabel T+20 dan tabel Intraday secara eksplisit', () => {
    const migration = fs.readFileSync(path.join(ROOT, 'database/migrations/000_runtime_schema_baseline.sql'), 'utf8');
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS lens_radar_history/);
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS lens_bucket_stats/);
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS lens_weight_proposals/);
    const createdIntraday = Array.from(migration.matchAll(/CREATE TABLE IF NOT EXISTS (intraday_\w+)/g)).map((m) => m[1]!);
    expect(createdIntraday.length).toBeGreaterThan(0);
    for (const table of createdIntraday) expect(table.startsWith('intraday_')).toBe(true);
  });

  it('repository intraday hanya MEMBACA tabel milik modul lain', () => {
    const repo = fs.readFileSync(path.join(ROOT, 'modules/intraday/repository/intraday.repository.ts'), 'utf8');
    // `DO UPDATE SET` di klausa ON CONFLICT bukan target tulisan tersendiri - ia
    // menulis ke tabel yang sama dengan INSERT-nya, jadi dikecualikan di sini.
    const writes = Array.from(repo.matchAll(/(?:INSERT INTO|(?<!DO )UPDATE)\s+(\w+)/g)).map((m) => m[1]!);
    expect(writes.length).toBeGreaterThan(0);
    for (const table of writes) expect(table.startsWith('intraday_')).toBe(true);
    // fundamental_history dipakai, tapi hanya di dalam SELECT.
    expect(repo).toMatch(/FROM fundamental_history/);
    expect(repo).not.toMatch(/(?:INSERT INTO|UPDATE|DELETE FROM)\s+fundamental_history/);
  });

  it('route admin/API T+20 lama masih ada dan tidak disentuh modul ini', () => {
    for (const file of [
      'app/api/admin/calibration/route.ts',
      'app/api/admin/tpcl-validation/route.ts',
      'app/admin/calibration/page.tsx',
      'app/admin/tpcl-validation/page.tsx',
    ]) {
      const content = fs.readFileSync(path.join(ROOT, file), 'utf8');
      expect(content).not.toMatch(/intraday/i);
    }
  });
});
