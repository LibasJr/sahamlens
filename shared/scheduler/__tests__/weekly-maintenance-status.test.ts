import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  getWeeklyMaintenanceStatus,
  parseNextRunAt,
  parseSystemdProperties,
  summarizeWeeklyReport,
} from '../weekly-maintenance-status';

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('weekly maintenance status', () => {
  it('membaca timestamp mikrodetik systemd menjadi ISO', () => {
    const next = Date.parse('2026-08-30T03:37:48+07:00');
    const raw = JSON.stringify([{ unit: 'sahamlens-weekly-maintenance.timer', next: next * 1_000 }]);
    expect(parseNextRunAt(raw)).toBe('2026-08-29T20:37:48.000Z');
    expect(parseNextRunAt('bukan-json')).toBeNull();
  });

  it('membaca properti systemd tanpa meneruskan baris rusak', () => {
    expect(parseSystemdProperties('ActiveState=active\nUnitFileState=enabled\nrusak')).toEqual({
      ActiveState: 'active',
      UnitFileState: 'enabled',
    });
  });

  it('meringkas laporan tanpa membuka detail dan path log mentah', () => {
    const summary = summarizeWeeklyReport({
      startedAt: '2026-08-23T14:38:24.602Z',
      finishedAt: '2026-08-23T14:42:40.719Z',
      durationMs: 256_117,
      verdict: 'WARN',
      counts: { PASS: 16, WARN: 1, FAIL: 0, SKIP: 0 },
      stages: ['sync', 'data', 'security'],
      commit: '8e9a608',
      steps: [{
        id: 'outdated', stage: 'deps', label: 'dependency tertinggal', status: 'WARN',
        summary: 'pembaruan tersedia', durationMs: 1_586,
        detail: 'detail internal tidak boleh keluar', logFile: 'logs/deps.log',
      }],
    });

    expect(summary?.verdict).toBe('WARN');
    expect(summary?.counts).toEqual({ PASS: 16, WARN: 1, FAIL: 0, SKIP: 0 });
    expect(summary?.steps[0]).toEqual({
      id: 'outdated', stage: 'deps', label: 'dependency tertinggal', status: 'WARN',
      summary: 'pembaruan tersedia', durationMs: 1_586,
    });
    expect(summary?.steps[0]).not.toHaveProperty('detail');
    expect(summary?.steps[0]).not.toHaveProperty('logFile');
  });

  it('menggabungkan status timer aktual dengan laporan terbaru', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'weekly-maintenance-status-'));
    tempRoots.push(root);
    const reportDir = path.join(root, '2026-08-23T14-38-24');
    await mkdir(reportDir);
    await writeFile(path.join(reportDir, 'report.json'), JSON.stringify({
      startedAt: '2026-08-23T14:38:24.602Z', finishedAt: '2026-08-23T14:42:40.719Z',
      durationMs: 256_117, verdict: 'PASS', counts: { PASS: 1, WARN: 0, FAIL: 0, SKIP: 0 },
      stages: ['quality'], commit: 'abc1234',
      steps: [{ id: 'verify', stage: 'quality', label: 'verify production', status: 'PASS', summary: 'bersih', durationMs: 100 }],
    }));
    const next = Date.parse('2026-08-30T03:37:48+07:00');
    const runSystemctl = vi.fn(async (args: string[]) => {
      if (args[0] === 'list-timers') return JSON.stringify([{ unit: 'sahamlens-weekly-maintenance.timer', next: next * 1_000 }]);
      if (args[1]?.endsWith('.timer')) return 'ActiveState=active\nUnitFileState=enabled\n';
      return 'ActiveState=inactive\nResult=success\n';
    });

    const result = await getWeeklyMaintenanceStatus({ runSystemctl, reportRoot: root });

    expect(result.timerActive).toBe(true);
    expect(result.timerEnabled).toBe(true);
    expect(result.serviceRunning).toBe(false);
    expect(result.serviceResult).toBe('success');
    expect(result.nextRunAt).toBe('2026-08-29T20:37:48.000Z');
    expect(result.lastReport?.commit).toBe('abc1234');
    expect(result.diagnostics).toEqual([]);
  });

  it('fail-soft ketika systemd dan laporan tidak tersedia', async () => {
    const runSystemctl = vi.fn(async () => { throw new Error('unavailable'); });
    const result = await getWeeklyMaintenanceStatus({
      runSystemctl,
      reportRoot: '/path/yang/tidak/tersedia',
    });

    expect(result.timerActive).toBe(false);
    expect(result.nextRunAt).toBeNull();
    expect(result.lastReport).toBeNull();
    expect(result.diagnostics).toEqual(['SYSTEMD_UNAVAILABLE', 'REPORT_UNAVAILABLE']);
  });
});
