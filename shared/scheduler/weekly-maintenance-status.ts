import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const TIMER_UNIT = 'sahamlens-weekly-maintenance.timer';
const SERVICE_UNIT = 'sahamlens-weekly-maintenance.service';
const DEFAULT_REPORT_ROOT = '/opt/sahamlens/maintenance/reports/weekly-maintenance';

type StepStatus = 'PASS' | 'WARN' | 'FAIL' | 'SKIP';
type Verdict = 'PASS' | 'WARN' | 'FAIL';

export interface WeeklyMaintenanceStep {
  id: string;
  stage: string;
  label: string;
  status: StepStatus;
  summary: string;
  durationMs: number;
}

export interface WeeklyMaintenanceReportSummary {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  verdict: Verdict;
  counts: Record<StepStatus, number>;
  stages: string[];
  commit: string | null;
  steps: WeeklyMaintenanceStep[];
}

export interface WeeklyMaintenanceStatus {
  unit: typeof TIMER_UNIT;
  scheduleLabel: string;
  timerActive: boolean;
  timerEnabled: boolean;
  serviceRunning: boolean;
  serviceResult: string | null;
  nextRunAt: string | null;
  lastReport: WeeklyMaintenanceReportSummary | null;
  diagnostics: Array<'SYSTEMD_UNAVAILABLE' | 'REPORT_UNAVAILABLE'>;
}

type CommandRunner = (args: string[]) => Promise<string>;

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function string(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function finiteNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function status(value: unknown): StepStatus | null {
  return value === 'PASS' || value === 'WARN' || value === 'FAIL' || value === 'SKIP' ? value : null;
}

function verdict(value: unknown): Verdict | null {
  return value === 'PASS' || value === 'WARN' || value === 'FAIL' ? value : null;
}

export function parseSystemdProperties(raw: string): Record<string, string> {
  return Object.fromEntries(raw.split(/\r?\n/).flatMap((line) => {
    const separator = line.indexOf('=');
    if (separator < 1) return [];
    return [[line.slice(0, separator), line.slice(separator + 1)]];
  }));
}

export function parseNextRunAt(raw: string): string | null {
  try {
    const rows = JSON.parse(raw);
    if (!Array.isArray(rows)) return null;
    const row = rows.find((entry) => object(entry)?.unit === TIMER_UNIT);
    const nextMicros = finiteNumber(object(row)?.next);
    if (nextMicros <= 0) return null;
    return new Date(nextMicros / 1_000).toISOString();
  } catch {
    return null;
  }
}

export function summarizeWeeklyReport(raw: unknown): WeeklyMaintenanceReportSummary | null {
  const report = object(raw);
  if (!report) return null;
  const reportVerdict = verdict(report.verdict);
  const startedAt = string(report.startedAt);
  const finishedAt = string(report.finishedAt);
  const countObject = object(report.counts);
  if (!reportVerdict || !startedAt || !finishedAt || !countObject) return null;

  const steps = Array.isArray(report.steps) ? report.steps.flatMap((entry): WeeklyMaintenanceStep[] => {
    const step = object(entry);
    const stepStatus = status(step?.status);
    const id = string(step?.id);
    const stage = string(step?.stage);
    const label = string(step?.label);
    const summary = string(step?.summary);
    if (!stepStatus || !id || !stage || !label || !summary) return [];
    return [{ id, stage, label, status: stepStatus, summary, durationMs: finiteNumber(step?.durationMs) }];
  }) : [];

  return {
    startedAt,
    finishedAt,
    durationMs: finiteNumber(report.durationMs),
    verdict: reportVerdict,
    counts: {
      PASS: finiteNumber(countObject.PASS),
      WARN: finiteNumber(countObject.WARN),
      FAIL: finiteNumber(countObject.FAIL),
      SKIP: finiteNumber(countObject.SKIP),
    },
    stages: Array.isArray(report.stages) ? report.stages.flatMap((value) => string(value) ?? []) : [],
    commit: string(report.commit),
    // Detail dan path log sengaja tidak keluar dari server. Ringkasan ini cukup untuk
    // diagnosis admin tanpa berisiko membocorkan response endpoint atau environment.
    steps,
  };
}

async function readLatestReport(reportRoot: string): Promise<WeeklyMaintenanceReportSummary | null> {
  const entries = await readdir(reportRoot, { withFileTypes: true });
  const newest = entries
    .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .at(-1);
  if (!newest) return null;
  const raw = JSON.parse(await readFile(`${reportRoot}/${newest}/report.json`, 'utf8'));
  return summarizeWeeklyReport(raw);
}

async function systemctl(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('/usr/bin/systemctl', args, {
    timeout: 3_000,
    maxBuffer: 128 * 1024,
    encoding: 'utf8',
  });
  return stdout;
}

export async function getWeeklyMaintenanceStatus(options: {
  runSystemctl?: CommandRunner;
  reportRoot?: string;
} = {}): Promise<WeeklyMaintenanceStatus> {
  const run = options.runSystemctl ?? systemctl;
  const reportRoot = options.reportRoot ?? DEFAULT_REPORT_ROOT;
  const diagnostics: WeeklyMaintenanceStatus['diagnostics'] = [];

  const [timerList, timerProperties, serviceProperties, reportResult] = await Promise.allSettled([
    run(['list-timers', TIMER_UNIT, '--all', '--output=json', '--no-pager']),
    run(['show', TIMER_UNIT, '-p', 'ActiveState', '-p', 'UnitFileState', '--no-pager']),
    run(['show', SERVICE_UNIT, '-p', 'ActiveState', '-p', 'Result', '--no-pager']),
    readLatestReport(reportRoot),
  ]);

  if (timerList.status === 'rejected' || timerProperties.status === 'rejected' || serviceProperties.status === 'rejected') {
    diagnostics.push('SYSTEMD_UNAVAILABLE');
  }
  if (reportResult.status === 'rejected') diagnostics.push('REPORT_UNAVAILABLE');

  const timer = timerProperties.status === 'fulfilled' ? parseSystemdProperties(timerProperties.value) : {};
  const service = serviceProperties.status === 'fulfilled' ? parseSystemdProperties(serviceProperties.value) : {};

  return {
    unit: TIMER_UNIT,
    scheduleLabel: 'Minggu 03:30 WIB + jeda acak maksimal 10 menit',
    timerActive: timer.ActiveState === 'active',
    timerEnabled: timer.UnitFileState === 'enabled',
    serviceRunning: service.ActiveState === 'active',
    serviceResult: service.Result || null,
    nextRunAt: timerList.status === 'fulfilled' ? parseNextRunAt(timerList.value) : null,
    lastReport: reportResult.status === 'fulfilled' ? reportResult.value : null,
    diagnostics,
  };
}
