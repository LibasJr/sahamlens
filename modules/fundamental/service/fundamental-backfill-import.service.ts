import { ensureSharedSchema } from '@/shared/database/schema.service';
import { pool as defaultPool } from '@/shared/database/postgres.client';
import { ValidationError } from '@/shared/errors/app-error';

export type FundamentalPercentInput = 'percent' | 'decimal';

export interface FundamentalBackfillRow {
  ticker: string;
  observedDate: string;
  per: number | null;
  pbv: number | null;
  roe: number | null;
  der: number | null;
  currentRatio: number | null;
  revenueGrowth: number | null;
  source: string;
}

export interface FundamentalBackfillImportInput {
  csvText: string;
  dryRun?: boolean;
  skipEmptyRows?: boolean;
  percentInput?: FundamentalPercentInput;
  source?: string;
  maxObservedDate?: string;
}

export interface FundamentalBackfillImportResult {
  status: 'OK';
  mode: 'DRY_RUN' | 'INSERT_APPEND_ONLY';
  rawRows: number;
  parsedRows: number;
  skippedEmptyRows: number;
  insertedRows: number;
  skippedExistingRows: number | null;
  tickers: number;
  minObservedDate: string | null;
  maxObservedDate: string | null;
  percentInput: FundamentalPercentInput;
}

interface PoolLike {
  query(text: string, values?: unknown[]): Promise<{ rowCount?: number | null }>;
}

interface ImportDeps {
  pool?: PoolLike;
  ensureSchema?: () => Promise<void>;
}

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const NULLISH = new Set(['', '-', '—', 'na', 'n/a', 'null', 'undefined']);
const DEFAULT_SOURCE = 'admin-ui-point-in-time-import';
const INSERT_BATCH_SIZE = 500;
const MAX_CSV_BYTES = 1_000_000;

const METRIC_ALIASES = [
  ['per', 'pe', 'pe_ratio', 'trailingPE'],
  ['pbv', 'pb', 'pb_ratio', 'priceToBook'],
  ['roe', 'return_on_equity', 'returnOnEquity'],
  ['der', 'debt_to_equity', 'debtToEquity'],
  ['current_ratio', 'currentRatio', 'cr'],
  ['revenue_growth', 'revenueGrowth', 'sales_growth', 'salesGrowth'],
] as const;

function dateKeyUtc(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function assertDateKey(value: string, label: string): void {
  if (!DATE_KEY_RE.test(value)) {
    throw new ValidationError(`${label} harus format YYYY-MM-DD`);
  }
}

function normalizeTicker(value: unknown): string {
  if (typeof value !== 'string') return '';
  const ticker = value.trim().toUpperCase();
  if (!ticker || ticker.startsWith('^')) return '';
  return ticker.includes('.') ? ticker : `${ticker}.JK`;
}

function lowerKeyMap(row: Record<string, unknown>): Map<string, string> {
  const map = new Map<string, string>();
  for (const key of Object.keys(row)) map.set(key.toLowerCase(), key);
  return map;
}

function pick(row: Record<string, unknown>, names: readonly string[]): unknown {
  const lowered = lowerKeyMap(row);
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(row, name)) return row[name];
    const actual = lowered.get(name.toLowerCase());
    if (actual != null) return row[actual];
  }
  return undefined;
}

export function parseAdminFundamentalCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch !== '\r') {
      cell += ch;
    }
  }
  row.push(cell);
  rows.push(row);

  const nonEmpty = rows.filter((items) => items.some((item) => item.trim() !== ''));
  if (!nonEmpty.length) return [];
  const headers = nonEmpty[0].map((header) => header.trim());
  return nonEmpty.slice(1).map((items) => {
    const obj: Record<string, string> = {};
    headers.forEach((header, index) => {
      obj[header] = items[index]?.trim() ?? '';
    });
    return obj;
  });
}

function parseNullableNumber(value: unknown, label: string): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const raw = String(value).trim();
  if (NULLISH.has(raw.toLowerCase())) return null;
  let normalized = raw.replace(/\s+/g, '').replace(/%$/, '');
  if (normalized.includes(',') && normalized.includes('.')) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else if (normalized.includes(',')) {
    normalized = normalized.replace(',', '.');
  }
  const n = Number(normalized);
  if (!Number.isFinite(n)) {
    throw new ValidationError(`${label} bukan angka valid: ${JSON.stringify(value)}`);
  }
  return n;
}

function maybePercent(value: number | null, mode: FundamentalPercentInput): number | null {
  if (value == null) return null;
  return mode === 'decimal' ? value * 100 : value;
}

function roundOrNull(value: number | null, digits = 6): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function rowHasAnyMetric(row: Record<string, unknown>): boolean {
  return METRIC_ALIASES.some((aliases) => {
    const value = pick(row, aliases);
    if (value == null) return false;
    if (typeof value === 'number') return Number.isFinite(value);
    return !NULLISH.has(String(value).trim().toLowerCase());
  });
}

function normalizeRow(
  row: Record<string, unknown>,
  lineNumber: number,
  options: Required<Pick<FundamentalBackfillImportInput, 'percentInput' | 'source' | 'maxObservedDate'>>
): FundamentalBackfillRow {
  const ticker = normalizeTicker(pick(row, ['ticker', 'symbol', 'code', 'kode']));
  if (!ticker) throw new ValidationError(`Baris ${lineNumber}: ticker kosong/tidak valid`);

  const observedDate = String(
    pick(row, ['observed_date', 'observedDate', 'as_of', 'asOf', 'known_date', 'knownDate', 'publication_date', 'publicationDate'])
      ?? ''
  ).slice(0, 10);
  assertDateKey(observedDate, `Baris ${lineNumber} observed_date`);
  if (observedDate > options.maxObservedDate) {
    throw new ValidationError(`Baris ${lineNumber}: observed_date ${observedDate} ada di masa depan`);
  }

  const per = parseNullableNumber(pick(row, METRIC_ALIASES[0]), `Baris ${lineNumber} per`);
  const pbv = parseNullableNumber(pick(row, METRIC_ALIASES[1]), `Baris ${lineNumber} pbv`);
  const roeRaw = parseNullableNumber(pick(row, METRIC_ALIASES[2]), `Baris ${lineNumber} roe`);
  const der = parseNullableNumber(pick(row, METRIC_ALIASES[3]), `Baris ${lineNumber} der`);
  const currentRatio = parseNullableNumber(pick(row, METRIC_ALIASES[4]), `Baris ${lineNumber} current_ratio`);
  const revenueGrowthRaw = parseNullableNumber(pick(row, METRIC_ALIASES[5]), `Baris ${lineNumber} revenue_growth`);
  const source = String(pick(row, ['source', 'sumber']) ?? options.source).trim() || options.source;

  const result: FundamentalBackfillRow = {
    ticker,
    observedDate,
    per: roundOrNull(per),
    pbv: roundOrNull(pbv),
    roe: roundOrNull(maybePercent(roeRaw, options.percentInput)),
    der: roundOrNull(der),
    currentRatio: roundOrNull(currentRatio),
    revenueGrowth: roundOrNull(maybePercent(revenueGrowthRaw, options.percentInput)),
    source,
  };

  const hasMetric = ['per', 'pbv', 'roe', 'der', 'currentRatio', 'revenueGrowth']
    .some((key) => result[key as keyof FundamentalBackfillRow] != null);
  if (!hasMetric) {
    throw new ValidationError(`Baris ${lineNumber}: minimal satu metrik fundamental harus terisi`);
  }
  return result;
}

export function parseFundamentalBackfillRows(
  csvText: string,
  input: Pick<FundamentalBackfillImportInput, 'skipEmptyRows' | 'percentInput' | 'source' | 'maxObservedDate'>
): { rows: FundamentalBackfillRow[]; rawRows: number; skippedEmptyRows: number } {
  const options = {
    skipEmptyRows: Boolean(input.skipEmptyRows),
    percentInput: input.percentInput ?? 'percent',
    source: input.source?.trim() || DEFAULT_SOURCE,
    maxObservedDate: input.maxObservedDate ?? dateKeyUtc(new Date()),
  } satisfies Required<Pick<FundamentalBackfillImportInput, 'skipEmptyRows' | 'percentInput' | 'source' | 'maxObservedDate'>>;
  const rawRows = parseAdminFundamentalCsv(csvText);
  const rows: FundamentalBackfillRow[] = [];
  let skippedEmptyRows = 0;

  rawRows.forEach((row, index) => {
    if (options.skipEmptyRows && !rowHasAnyMetric(row)) {
      skippedEmptyRows++;
      return;
    }
    rows.push(normalizeRow(row, index + 2, options));
  });

  return { rows, rawRows: rawRows.length, skippedEmptyRows };
}

export function buildFundamentalBackfillInsert(rows: FundamentalBackfillRow[]): { text: string; params: unknown[] } | null {
  if (!rows.length) return null;
  const params: unknown[] = [];
  const tuples = rows.map((row) => {
    const base = params.length;
    params.push(
      row.ticker,
      row.observedDate,
      row.per,
      row.pbv,
      row.roe,
      row.der,
      row.currentRatio,
      row.revenueGrowth,
      row.source
    );
    return `($${base + 1}, $${base + 2}::date, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9})`;
  });

  return {
    text: `
      INSERT INTO fundamental_history
        (ticker, observed_date, per, pbv, roe, der, current_ratio, revenue_growth, source)
      VALUES ${tuples.join(', ')}
      ON CONFLICT (ticker, observed_date) DO NOTHING
    `,
    params,
  };
}

async function insertRows(pool: PoolLike, rows: FundamentalBackfillRow[]): Promise<number> {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
    const query = buildFundamentalBackfillInsert(rows.slice(i, i + INSERT_BATCH_SIZE));
    if (!query) continue;
    const result = await pool.query(query.text, query.params);
    inserted += result.rowCount ?? 0;
  }
  return inserted;
}

export async function runFundamentalBackfillImport(
  input: FundamentalBackfillImportInput,
  deps: ImportDeps = {}
): Promise<FundamentalBackfillImportResult> {
  const csvText = typeof input.csvText === 'string' ? input.csvText : '';
  if (!csvText.trim()) throw new ValidationError('CSV kosong');
  if (Buffer.byteLength(csvText, 'utf8') > MAX_CSV_BYTES) {
    throw new ValidationError('CSV terlalu besar; maksimal 1 MB per import admin');
  }
  const percentInput = input.percentInput ?? 'percent';
  if (percentInput !== 'percent' && percentInput !== 'decimal') {
    throw new ValidationError('percentInput hanya boleh percent atau decimal');
  }

  const parsed = parseFundamentalBackfillRows(csvText, {
    skipEmptyRows: input.skipEmptyRows,
    percentInput,
    source: input.source,
    maxObservedDate: input.maxObservedDate,
  });

  let insertedRows = 0;
  if (!input.dryRun) {
    await (deps.ensureSchema ?? ensureSharedSchema)();
    insertedRows = await insertRows(deps.pool ?? defaultPool, parsed.rows);
  }

  const dates = Array.from(new Set(parsed.rows.map((row) => row.observedDate))).sort();
  return {
    status: 'OK',
    mode: input.dryRun ? 'DRY_RUN' : 'INSERT_APPEND_ONLY',
    rawRows: parsed.rawRows,
    parsedRows: parsed.rows.length,
    skippedEmptyRows: parsed.skippedEmptyRows,
    insertedRows,
    skippedExistingRows: input.dryRun ? null : Math.max(0, parsed.rows.length - insertedRows),
    tickers: new Set(parsed.rows.map((row) => row.ticker)).size,
    minObservedDate: dates[0] ?? null,
    maxObservedDate: dates[dates.length - 1] ?? null,
    percentInput,
  };
}
