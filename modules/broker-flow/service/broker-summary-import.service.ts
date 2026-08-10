import { pool } from '@/shared/database/postgres.client';

export const MAX_BROKER_CSV_BYTES = 2 * 1024 * 1024;

export type BrokerImportMode = 'DRY_RUN' | 'INSERT_APPEND_ONLY';

export interface BrokerSummaryImportInput {
  csvText: string;
  mode: 'dry-run' | 'insert';
  source?: string;
  sourceFile?: string | null;
  maxTradeDate?: string;
}

export interface BrokerSummaryImportResult {
  status: 'OK';
  datasetKind?: 'DAILY_CSV' | 'PERIOD_JSON';
  mode: BrokerImportMode;
  parsedRows: number;
  insertedRows: number;
  skippedExistingRows: number | null;
  tickers: number;
  brokers: number;
  minTradeDate: string | null;
  maxTradeDate: string | null;
  netBuyValue: number;
  source: string;
  preview?: BrokerPeriodPreviewRow[];
}

export interface BrokerPeriodPreviewRow {
  brokerCode: string;
  brokerType: string | null;
  buyValue: number;
  sellValue: number;
  netValue: number;
}

export interface BrokerDistributionJsonInput {
  jsonText: string;
  ticker: string;
  mode: 'dry-run' | 'insert';
  source?: string;
  sourceFile?: string | null;
  maxTradeDate?: string;
}

interface BrokerSummaryRow {
  tradeDate: string;
  ticker: string;
  brokerCode: string;
  buyValue: number;
  sellValue: number;
  buyLot: number | null;
  sellLot: number | null;
  buyAvg: number | null;
  sellAvg: number | null;
  source: string;
  sourceFile: string | null;
}

export class BrokerSummaryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BrokerSummaryValidationError';
  }
}

const TICKER_ALIASES = ['ticker', 'symbol', 'code', 'kode', 'stock', 'emiten'];
const DATE_ALIASES = ['trade_date', 'tradedate', 'date', 'tanggal', 'trading_date'];
const BROKER_ALIASES = ['broker_code', 'brokercode', 'broker', 'kode_broker', 'kodebroker'];
const BUY_VALUE_ALIASES = ['buy_value', 'buyvalue', 'buy_val', 'buyval', 'buy'];
const SELL_VALUE_ALIASES = ['sell_value', 'sellvalue', 'sell_val', 'sellval', 'sell'];
const BUY_LOT_ALIASES = ['buy_lot', 'buylot', 'buy_lots', 'buylots'];
const SELL_LOT_ALIASES = ['sell_lot', 'selllot', 'sell_lots', 'selllots'];
const BUY_AVG_ALIASES = ['buy_avg', 'buyavg', 'avg_buy', 'avgbuy', 'buy_average'];
const SELL_AVG_ALIASES = ['sell_avg', 'sellavg', 'avg_sell', 'avgsell', 'sell_average'];

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\ufeff/g, '')
    .replace(/[\s.-]+/g, '_');
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let value = '';
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        value += '"';
        i++;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (ch === ',' && !quoted) {
      out.push(value);
      value = '';
      continue;
    }
    value += ch;
  }
  if (quoted) throw new BrokerSummaryValidationError('CSV tidak valid: tanda kutip tidak ditutup.');
  out.push(value);
  return out;
}

function parseCsv(text: string): Record<string, string>[] {
  const normalized = text.replace(/\r\n?/g, '\n').trim();
  if (!normalized) throw new BrokerSummaryValidationError('CSV kosong.');

  // Gabungkan baris ketika newline berada di dalam quoted field.
  const logical: string[] = [];
  let buf = '';
  let quoted = false;
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i]!;
    if (ch === '"') {
      if (quoted && normalized[i + 1] === '"') {
        buf += '""';
        i++;
        continue;
      }
      quoted = !quoted;
      buf += ch;
      continue;
    }
    if (ch === '\n' && !quoted) {
      if (buf.trim()) logical.push(buf);
      buf = '';
    } else {
      buf += ch;
    }
  }
  if (quoted) throw new BrokerSummaryValidationError('CSV tidak valid: quoted field belum ditutup.');
  if (buf.trim()) logical.push(buf);
  if (logical.length < 2) throw new BrokerSummaryValidationError('CSV harus memiliki header dan minimal 1 baris data.');

  const headers = parseCsvLine(logical[0]!).map(normalizeHeader);
  if (new Set(headers).size !== headers.length) {
    throw new BrokerSummaryValidationError('Header CSV memiliki nama kolom duplikat.');
  }

  return logical.slice(1).filter((line) => line.trim()).map((line, index) => {
    const values = parseCsvLine(line);
    if (values.length !== headers.length) {
      throw new BrokerSummaryValidationError(
        `Baris ${index + 2}: jumlah kolom ${values.length} tidak sama dengan header ${headers.length}.`
      );
    }
    return Object.fromEntries(headers.map((header, i) => [header, values[i]?.trim() ?? '']));
  });
}

function pick(row: Record<string, string>, aliases: string[]): string {
  for (const alias of aliases) {
    const key = normalizeHeader(alias);
    if (row[key] != null && row[key] !== '') return row[key]!;
  }
  return '';
}

function normalizeTicker(raw: string): string {
  const ticker = raw.trim().toUpperCase().replace(/\s+/g, '');
  if (!ticker || ticker.startsWith('^')) return '';
  const normalized = ticker.endsWith('.JK') ? ticker : `${ticker}.JK`;
  return /^[A-Z0-9]{1,12}\.JK$/.test(normalized) ? normalized : '';
}

function normalizeBrokerCode(raw: string): string {
  const code = raw.trim().toUpperCase().replace(/\s+/g, '');
  return /^[A-Z0-9]{2,8}$/.test(code) ? code : '';
}

function assertDateKey(value: string, label: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new BrokerSummaryValidationError(`${label}: gunakan format YYYY-MM-DD.`);
  }
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m! - 1 || dt.getUTCDate() !== d) {
    throw new BrokerSummaryValidationError(`${label}: tanggal kalender tidak valid.`);
  }
}

function parseLocalizedNumber(raw: string, label: string, nullable = false): number | null {
  let value = raw.trim();
  if (!value) {
    if (nullable) return null;
    return 0;
  }

  value = value.replace(/\s+/g, '').replace(/^rp/i, '').replace(/idr$/i, '');
  let multiplier = 1;
  const suffix = value.match(/([KMBT])$/i)?.[1]?.toUpperCase();
  if (suffix) {
    multiplier = suffix === 'K' ? 1e3 : suffix === 'M' ? 1e6 : suffix === 'B' ? 1e9 : 1e12;
    value = value.slice(0, -1);
  }

  // 1.234.567,89 -> 1234567.89 ; 1,234,567.89 -> 1234567.89
  const lastDot = value.lastIndexOf('.');
  const lastComma = value.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    const decimalSep = lastDot > lastComma ? '.' : ',';
    const thousandsSep = decimalSep === '.' ? ',' : '.';
    value = value.split(thousandsSep).join('').replace(decimalSep, '.');
  } else if (lastComma >= 0) {
    const decimals = value.length - lastComma - 1;
    if (decimals <= 2 || suffix) value = value.replace(',', '.');
    else value = value.replace(/,/g, '');
  } else if (lastDot >= 0) {
    const decimals = value.length - lastDot - 1;
    if (decimals > 2 && !suffix) value = value.replace(/\./g, '');
  }

  value = value.replace(/[^0-9+-.]/g, '');
  const parsed = Number(value) * multiplier;
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new BrokerSummaryValidationError(`${label}: angka tidak valid "${raw}".`);
  }
  return parsed;
}

function todayWib(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function rowFromCsv(
  row: Record<string, string>,
  line: number,
  source: string,
  sourceFile: string | null,
  maxTradeDate: string,
): BrokerSummaryRow {
  const ticker = normalizeTicker(pick(row, TICKER_ALIASES));
  if (!ticker) throw new BrokerSummaryValidationError(`Baris ${line}: ticker kosong/tidak valid.`);

  const tradeDate = pick(row, DATE_ALIASES).slice(0, 10);
  assertDateKey(tradeDate, `Baris ${line} trade_date`);
  if (tradeDate > maxTradeDate) {
    throw new BrokerSummaryValidationError(`Baris ${line}: trade_date ${tradeDate} ada di masa depan.`);
  }

  const brokerCode = normalizeBrokerCode(pick(row, BROKER_ALIASES));
  if (!brokerCode) throw new BrokerSummaryValidationError(`Baris ${line}: broker_code kosong/tidak valid.`);

  const buyValue = parseLocalizedNumber(pick(row, BUY_VALUE_ALIASES), `Baris ${line} buy_value`) ?? 0;
  const sellValue = parseLocalizedNumber(pick(row, SELL_VALUE_ALIASES), `Baris ${line} sell_value`) ?? 0;
  const buyLot = parseLocalizedNumber(pick(row, BUY_LOT_ALIASES), `Baris ${line} buy_lot`, true);
  const sellLot = parseLocalizedNumber(pick(row, SELL_LOT_ALIASES), `Baris ${line} sell_lot`, true);
  const buyAvg = parseLocalizedNumber(pick(row, BUY_AVG_ALIASES), `Baris ${line} buy_avg`, true);
  const sellAvg = parseLocalizedNumber(pick(row, SELL_AVG_ALIASES), `Baris ${line} sell_avg`, true);

  if (buyValue === 0 && sellValue === 0 && buyLot == null && sellLot == null) {
    throw new BrokerSummaryValidationError(
      `Baris ${line}: tidak ada aktivitas broker yang dapat disimpan (buy/sell value dan lot kosong/0).`
    );
  }

  if (buyLot != null && !Number.isInteger(buyLot)) {
    throw new BrokerSummaryValidationError(`Baris ${line}: buy_lot harus bilangan bulat.`);
  }
  if (sellLot != null && !Number.isInteger(sellLot)) {
    throw new BrokerSummaryValidationError(`Baris ${line}: sell_lot harus bilangan bulat.`);
  }

  return {
    tradeDate,
    ticker,
    brokerCode,
    buyValue,
    sellValue,
    buyLot,
    sellLot,
    buyAvg,
    sellAvg,
    source,
    sourceFile,
  };
}

async function ensureSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS broker_summary_daily (
      id BIGSERIAL PRIMARY KEY,
      trade_date DATE NOT NULL,
      ticker TEXT NOT NULL,
      broker_code VARCHAR(8) NOT NULL,
      buy_value NUMERIC(24,2) NOT NULL DEFAULT 0,
      sell_value NUMERIC(24,2) NOT NULL DEFAULT 0,
      buy_lot BIGINT,
      sell_lot BIGINT,
      buy_avg NUMERIC(18,4),
      sell_avg NUMERIC(18,4),
      source TEXT NOT NULL,
      source_file TEXT,
      imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT broker_summary_daily_unique UNIQUE (trade_date, ticker, broker_code, source)
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS broker_summary_daily_ticker_date_idx
    ON broker_summary_daily (ticker, trade_date DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS broker_summary_daily_broker_date_idx
    ON broker_summary_daily (broker_code, trade_date DESC)
  `);
}

function sanitizeSource(value?: string): string {
  const source = (value || 'STOCKBIT_MANUAL').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '_');
  if (!source || source.length > 64) throw new BrokerSummaryValidationError('source tidak valid.');
  return source;
}

function sanitizeSourceFile(value?: string | null): string | null {
  if (!value) return null;
  const name = value.trim().slice(0, 180);
  return name || null;
}

export async function importBrokerSummaryCsv(
  input: BrokerSummaryImportInput,
): Promise<BrokerSummaryImportResult> {
  if (Buffer.byteLength(input.csvText ?? '', 'utf8') > MAX_BROKER_CSV_BYTES) {
    throw new BrokerSummaryValidationError('CSV melebihi batas 2 MB. Pecah menjadi beberapa file.');
  }
  if (input.mode !== 'dry-run' && input.mode !== 'insert') {
    throw new BrokerSummaryValidationError('mode harus dry-run atau insert.');
  }

  const source = sanitizeSource(input.source);
  const sourceFile = sanitizeSourceFile(input.sourceFile);
  const maxTradeDate = input.maxTradeDate || todayWib();
  assertDateKey(maxTradeDate, 'maxTradeDate');

  const parsed = parseCsv(input.csvText);
  if (parsed.length > 50_000) {
    throw new BrokerSummaryValidationError('Maksimal 50.000 baris per upload.');
  }

  const rows = parsed.map((row, i) => rowFromCsv(row, i + 2, source, sourceFile, maxTradeDate));

  // Duplicate di file yang sama adalah error, bukan diam-diam dibuang.
  const seen = new Set<string>();
  for (const row of rows) {
    const key = `${row.tradeDate}|${row.ticker}|${row.brokerCode}|${row.source}`;
    if (seen.has(key)) {
      throw new BrokerSummaryValidationError(
        `Duplikat di file: ${row.tradeDate} ${row.ticker} broker ${row.brokerCode} source ${row.source}.`
      );
    }
    seen.add(key);
  }

  const tickers = new Set(rows.map((r) => r.ticker)).size;
  const brokers = new Set(rows.map((r) => r.brokerCode)).size;
  const dates = rows.map((r) => r.tradeDate).sort();
  const netBuyValue = rows.reduce((sum, r) => sum + r.buyValue - r.sellValue, 0);

  if (input.mode === 'dry-run') {
    return {
      status: 'OK',
      mode: 'DRY_RUN',
      datasetKind: 'DAILY_CSV',
      parsedRows: rows.length,
      insertedRows: 0,
      skippedExistingRows: null,
      tickers,
      brokers,
      minTradeDate: dates[0] ?? null,
      maxTradeDate: dates[dates.length - 1] ?? null,
      netBuyValue,
      source,
    };
  }

  await ensureSchema();
  const client = await pool.connect();
  let insertedRows = 0;
  try {
    await client.query('BEGIN');

    for (const row of rows) {
      const result = await client.query(
        `
          INSERT INTO broker_summary_daily (
            trade_date, ticker, broker_code,
            buy_value, sell_value, buy_lot, sell_lot,
            buy_avg, sell_avg, source, source_file
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
          ON CONFLICT (trade_date, ticker, broker_code, source) DO NOTHING
          RETURNING id
        `,
        [
          row.tradeDate, row.ticker, row.brokerCode,
          row.buyValue, row.sellValue, row.buyLot, row.sellLot,
          row.buyAvg, row.sellAvg, row.source, row.sourceFile,
        ],
      );
      insertedRows += result.rowCount ?? 0;
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return {
    status: 'OK',
    mode: 'INSERT_APPEND_ONLY',
    datasetKind: 'DAILY_CSV',
    parsedRows: rows.length,
    insertedRows,
    skippedExistingRows: rows.length - insertedRows,
    tickers,
    brokers,
    minTradeDate: dates[0] ?? null,
    maxTradeDate: dates[dates.length - 1] ?? null,
    netBuyValue,
    source,
  };
}


interface StockbitBrokerNode {
  detail?: {
    code?: unknown;
    type?: unknown;
    amount?: unknown;
  };
}

interface BrokerPeriodRow {
  startDate: string;
  endDate: string;
  asOfDate: string;
  ticker: string;
  brokerCode: string;
  brokerType: string | null;
  buyValue: number;
  sellValue: number;
  source: string;
  sourceFile: string | null;
}

function finiteNonNegativeAmount(value: unknown, label: string): number {
  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new BrokerSummaryValidationError(`${label}: amount tidak valid.`);
  }
  return amount;
}

function parseStockbitBrokerDistribution(
  jsonText: string,
  tickerRaw: string,
  source: string,
  sourceFile: string | null,
  maxTradeDate: string,
): BrokerPeriodRow[] {
  if (!jsonText.trim()) throw new BrokerSummaryValidationError('JSON Broker Distribution kosong.');

  let root: any;
  try {
    root = JSON.parse(jsonText);
  } catch {
    throw new BrokerSummaryValidationError('JSON tidak valid. Salin hanya isi Response JSON Broker Distribution.');
  }

  const data = root?.data;
  const byValue = data?.by_value;
  if (!data || !byValue || !Array.isArray(byValue.top_broker_buy) || !Array.isArray(byValue.top_broker_sell)) {
    throw new BrokerSummaryValidationError(
      'Format bukan Broker Distribution Stockbit yang dikenali (butuh data.by_value.top_broker_buy/top_broker_sell).'
    );
  }

  const ticker = normalizeTicker(tickerRaw);
  if (!ticker) throw new BrokerSummaryValidationError('Ticker wajib diisi dan harus valid, contoh BBRI.');

  const startDate = String(data.start_date ?? '').slice(0, 10);
  const endDate = String(data.end_date ?? '').slice(0, 10);
  const asOfDate = String(data.date_info ?? endDate).slice(0, 10);
  assertDateKey(startDate, 'start_date');
  assertDateKey(endDate, 'end_date');
  assertDateKey(asOfDate, 'date_info');
  if (startDate > endDate) throw new BrokerSummaryValidationError('start_date tidak boleh sesudah end_date.');
  if (endDate > maxTradeDate || asOfDate > maxTradeDate) {
    throw new BrokerSummaryValidationError('Tanggal Broker Distribution berada di masa depan.');
  }

  const map = new Map<string, BrokerPeriodRow>();
  const absorb = (nodes: StockbitBrokerNode[], side: 'buy' | 'sell') => {
    nodes.forEach((node, index) => {
      const code = normalizeBrokerCode(String(node?.detail?.code ?? ''));
      if (!code) throw new BrokerSummaryValidationError(`${side}[${index}]: kode broker tidak valid.`);
      const amount = finiteNonNegativeAmount(node?.detail?.amount, `${side}[${index}] ${code}`);
      const rawType = typeof node?.detail?.type === 'string' ? node.detail.type.trim() : '';
      const brokerType = rawType ? rawType.slice(0, 32) : null;
      const current = map.get(code) ?? {
        startDate, endDate, asOfDate, ticker, brokerCode: code, brokerType,
        buyValue: 0, sellValue: 0, source, sourceFile,
      };
      if (!current.brokerType && brokerType) current.brokerType = brokerType;
      if (side === 'buy') current.buyValue = amount;
      else current.sellValue = amount;
      map.set(code, current);
    });
  };

  absorb(byValue.top_broker_buy, 'buy');
  absorb(byValue.top_broker_sell, 'sell');

  const rows = Array.from(map.values());
  if (!rows.length) throw new BrokerSummaryValidationError('Broker Distribution tidak berisi broker yang dapat diimpor.');
  return rows;
}

async function ensurePeriodSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS broker_summary_period (
      id BIGSERIAL PRIMARY KEY,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      as_of_date DATE NOT NULL,
      ticker TEXT NOT NULL,
      broker_code VARCHAR(8) NOT NULL,
      broker_type VARCHAR(32),
      buy_value NUMERIC(24,2) NOT NULL DEFAULT 0,
      sell_value NUMERIC(24,2) NOT NULL DEFAULT 0,
      net_value NUMERIC(24,2) NOT NULL DEFAULT 0,
      source TEXT NOT NULL,
      source_file TEXT,
      imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT broker_summary_period_unique UNIQUE (start_date, end_date, ticker, broker_code, source)
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS broker_summary_period_ticker_date_idx
    ON broker_summary_period (ticker, end_date DESC, start_date DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS broker_summary_period_broker_date_idx
    ON broker_summary_period (broker_code, end_date DESC)
  `);
}

export async function importBrokerDistributionJson(
  input: BrokerDistributionJsonInput,
): Promise<BrokerSummaryImportResult> {
  if (Buffer.byteLength(input.jsonText ?? '', 'utf8') > MAX_BROKER_CSV_BYTES) {
    throw new BrokerSummaryValidationError('JSON melebihi batas 2 MB.');
  }
  if (input.mode !== 'dry-run' && input.mode !== 'insert') {
    throw new BrokerSummaryValidationError('mode harus dry-run atau insert.');
  }

  const source = sanitizeSource(input.source || 'STOCKBIT_MANUAL_JSON');
  const sourceFile = sanitizeSourceFile(input.sourceFile);
  const maxTradeDate = input.maxTradeDate || todayWib();
  assertDateKey(maxTradeDate, 'maxTradeDate');

  const rows = parseStockbitBrokerDistribution(
    input.jsonText,
    input.ticker,
    source,
    sourceFile,
    maxTradeDate,
  );
  const first = rows[0]!;
  const netBuyValue = rows.reduce((sum, r) => sum + r.buyValue - r.sellValue, 0);
  const preview = rows
    .map((r) => ({
      brokerCode: r.brokerCode,
      brokerType: r.brokerType,
      buyValue: r.buyValue,
      sellValue: r.sellValue,
      netValue: r.buyValue - r.sellValue,
    }))
    .sort((a, b) => Math.abs(b.netValue) - Math.abs(a.netValue))
    .slice(0, 12);

  const base: Omit<BrokerSummaryImportResult, 'mode' | 'insertedRows' | 'skippedExistingRows'> = {
    status: 'OK',
    datasetKind: 'PERIOD_JSON',
    parsedRows: rows.length,
    tickers: 1,
    brokers: rows.length,
    minTradeDate: first.startDate,
    maxTradeDate: first.endDate,
    netBuyValue,
    source,
    preview,
  };

  if (input.mode === 'dry-run') {
    return { ...base, mode: 'DRY_RUN', insertedRows: 0, skippedExistingRows: null };
  }

  await ensurePeriodSchema();
  const client = await pool.connect();
  let insertedRows = 0;
  try {
    await client.query('BEGIN');
    for (const row of rows) {
      const result = await client.query(
        `
          INSERT INTO broker_summary_period (
            start_date, end_date, as_of_date, ticker, broker_code, broker_type,
            buy_value, sell_value, net_value, source, source_file
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
          ON CONFLICT (start_date, end_date, ticker, broker_code, source) DO NOTHING
          RETURNING id
        `,
        [
          row.startDate, row.endDate, row.asOfDate, row.ticker, row.brokerCode, row.brokerType,
          row.buyValue, row.sellValue, row.buyValue - row.sellValue, row.source, row.sourceFile,
        ],
      );
      insertedRows += result.rowCount ?? 0;
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return {
    ...base,
    mode: 'INSERT_APPEND_ONLY',
    insertedRows,
    skippedExistingRows: rows.length - insertedRows,
  };
}
