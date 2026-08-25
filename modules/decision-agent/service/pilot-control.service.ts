import crypto from 'node:crypto';
import { pool } from '@/shared/database/postgres.client';
import { ensureSharedSchema } from '@/shared/database/schema.service';
import { ConflictError, ValidationError } from '@/shared/errors/app-error';
import { DECISION_AGENT_VERSION } from '../types/decision-agent.types';

const ACCOUNT_ID = 'internal-paper';
const STOCKBIT_COST_SOURCE = 'https://help.stockbit.com/id/article/apa-itu-biaya-bea-materai-p08y2z/';

function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;
    if (char === '"' && quoted && text[i + 1] === '"') { cell += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(cell.trim()); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell.trim()); cell = '';
      if (row.some(Boolean)) rows.push(row); row = [];
    } else cell += char;
  }
  row.push(cell.trim()); if (row.some(Boolean)) rows.push(row);
  return rows;
}

function objectRows(text: string): Array<Record<string, string>> {
  const rows = csvRows(text);
  if (rows.length < 2) throw new ValidationError('CSV harus memiliki header dan sedikitnya satu baris data');
  const headers = rows[0]!.map((value) => value.toLowerCase().replace(/^\ufeff/, '').replace(/[\s-]+/g, '_'));
  return rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

function decimal(value: string): number | null {
  const raw = value.replace(/\s/g, '').replace(/^Rp/i, '');
  let normalized = raw;
  if (/^-?\d{1,3}([.,]\d{3})+$/.test(raw)) normalized = raw.replace(/[.,]/g, '');
  else if (raw.includes(',') && raw.includes('.')) {
    const decimalSeparator = raw.lastIndexOf(',') > raw.lastIndexOf('.') ? ',' : '.';
    const groupingSeparator = decimalSeparator === ',' ? '.' : ',';
    normalized = raw.replaceAll(groupingSeparator, '').replace(decimalSeparator, '.');
  } else if (raw.includes(',')) normalized = raw.replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function freezePilotProtocol(): Promise<void> {
  await ensureSharedSchema();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(`SELECT id FROM decision_agent_pilot_protocols WHERE account_id=$1 AND status='ACTIVE'`, [ACCOUNT_ID]);
    if (existing.rows[0]) throw new ConflictError('Protokol pilot 90 hari sudah dibekukan');
    const account = (await client.query(`SELECT * FROM decision_agent_paper_accounts WHERE id=$1 FOR UPDATE`, [ACCOUNT_ID])).rows[0];
    if (!account) throw new ConflictError('Konfigurasi akun paper belum tersedia');
    const required = ['max_total_exposure_pct','max_sector_exposure_pct','max_positions_per_sector','max_adv_participation_pct','max_drawdown_pct','buy_fee_pct','sell_fee_pct','slippage_bps'];
    if (required.some((key) => account[key] == null)) throw new ConflictError('Kebijakan akun paper belum lengkap');
    const snapshot = {
      initialCash: Number(account.initial_cash), riskBudgetPct: Number(account.risk_budget_pct),
      maxPositionPct: Number(account.max_position_pct), maxOpenPositions: Number(account.max_open_positions),
      maxTotalExposurePct: Number(account.max_total_exposure_pct), maxSectorExposurePct: Number(account.max_sector_exposure_pct),
      maxPositionsPerSector: Number(account.max_positions_per_sector), maxAdvParticipationPct: Number(account.max_adv_participation_pct),
      maxDrawdownPct: Number(account.max_drawdown_pct), buyFeePct: Number(account.buy_fee_pct),
      sellFeePct: Number(account.sell_fee_pct), slippageBps: Number(account.slippage_bps),
      broker: 'STOCKBIT', liveExecution: 'LOCKED', sectorSource: 'IDX_IC', approval: 'MANUAL',
    };
    await client.query(
      `INSERT INTO decision_agent_pilot_protocols
       (id,account_id,status,started_at,ends_at,frozen_at,engine_version,policy_snapshot)
       VALUES ($1,$2,'ACTIVE',NOW(),NOW()+INTERVAL '90 days',NOW(),$3,$4::jsonb)`,
      [crypto.randomUUID(), ACCOUNT_ID, DECISION_AGENT_VERSION, JSON.stringify(snapshot)],
    );
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

export async function importIdxIcCsv(input: { csvText: string; sourceUrl: string; sourceAsOf: string }): Promise<number> {
  await ensureSharedSchema();
  const rows = objectRows(input.csvText);
  const hash = crypto.createHash('sha256').update(input.csvText).digest('hex');
  const parsed = rows.map((row, index) => {
    const ticker = (row.ticker || row.kode || row.kode_saham || '').toUpperCase().replace(/\.JK$/, '');
    const sector = row.sector_name || row.sektor || row.sector || '';
    if (!/^[A-Z0-9]{4,6}$/.test(ticker) || !sector) throw new ValidationError(`IDX-IC CSV baris ${index + 2} tidak valid`);
    return { ticker, sector, sectorCode: row.sector_code || row.kode_sektor || null, subsector: row.subsector_name || row.subsektor || null, industry: row.industry_name || row.industri || null, subindustry: row.subindustry_name || row.sub_industri || null };
  });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const row of parsed) await client.query(
      `INSERT INTO idx_ic_classifications
       (ticker,sector_code,sector_name,subsector_name,industry_name,subindustry_name,source_name,source_url,source_as_of,source_file_sha256)
       VALUES ($1,$2,$3,$4,$5,$6,'IDX',$7,$8,$9)
       ON CONFLICT(ticker) DO UPDATE SET sector_code=EXCLUDED.sector_code,sector_name=EXCLUDED.sector_name,
       subsector_name=EXCLUDED.subsector_name,industry_name=EXCLUDED.industry_name,subindustry_name=EXCLUDED.subindustry_name,
       source_url=EXCLUDED.source_url,source_as_of=EXCLUDED.source_as_of,source_file_sha256=EXCLUDED.source_file_sha256,imported_at=NOW()`,
      [row.ticker,row.sectorCode,row.sector,row.subsector,row.industry,row.subindustry,input.sourceUrl,input.sourceAsOf,hash],
    );
    await client.query('COMMIT'); return parsed.length;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

export async function importStockbitCsv(input: { csvText: string; filename: string; sourceType: 'TRANSACTION_HISTORY' | 'E_STATEMENT' }): Promise<{ rows: number; matched: number; costs: number }> {
  await ensureSharedSchema();
  const rawRows = objectRows(input.csvText);
  const hash = crypto.createHash('sha256').update(input.csvText).digest('hex');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if ((await client.query(`SELECT 1 FROM decision_agent_broker_imports WHERE source_sha256=$1`, [hash])).rows[0]) throw new ConflictError('File Stockbit yang sama sudah pernah diimpor');
    const importId = crypto.randomUUID();
    const transactions: Array<{date:string;ticker:string;side:'BUY'|'SELL';lots:number;price:number;gross:number;fee:number|null;sourceRow:number}> = [];
    const costs: Array<{date:string;type:'STAMP_DUTY'|'DATAFEED'|'BROKER_ADJUSTMENT';amount:number;sourceRow:number}> = [];
    rawRows.forEach((row, index) => {
      const recordType = (row.record_type || 'TRANSACTION').toUpperCase();
      const date = row.trade_date || row.tanggal || row.date || '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ValidationError(`Tanggal ISO YYYY-MM-DD wajib pada baris ${index + 2}`);
      if (recordType === 'COST') {
        const type = (row.cost_type || '').toUpperCase(); const amount = decimal(row.amount || row.nilai || '');
        if (!['STAMP_DUTY','DATAFEED','BROKER_ADJUSTMENT'].includes(type) || amount == null || amount <= 0) throw new ValidationError(`Biaya tidak valid pada baris ${index + 2}`);
        costs.push({ date, type: type as typeof costs[number]['type'], amount, sourceRow:index+2 }); return;
      }
      const ticker = (row.ticker || row.kode_saham || row.stock || '').toUpperCase().replace(/\.JK$/, '');
      const sideText = (row.side || row.buy_sell || row.jual_beli || '').toUpperCase();
      const side = sideText === 'BUY' || sideText === 'BELI' ? 'BUY' : sideText === 'SELL' || sideText === 'JUAL' ? 'SELL' : null;
      const lots = decimal(row.lots || row.lot || ''); const price = decimal(row.price || row.harga || '');
      const gross = decimal(row.gross_value || row.nilai_transaksi || row.value || ''); const fee = decimal(row.fee_value || row.fee || '');
      if (!/^[A-Z0-9]{4,6}$/.test(ticker) || !side || lots == null || lots <= 0 || !Number.isInteger(lots) || price == null || price <= 0 || gross == null || gross <= 0) throw new ValidationError(`Transaksi tidak valid pada baris ${index + 2}`);
      transactions.push({ date,ticker,side,lots,price,gross,fee: fee != null && fee >= 0 ? fee : null,sourceRow:index+2 });
    });
    const dates = [...transactions.map((row)=>row.date),...costs.map((row)=>row.date)].sort();
    await client.query(`INSERT INTO decision_agent_broker_imports (id,broker,source_type,source_filename,source_sha256,period_start,period_end,row_count) VALUES ($1,'STOCKBIT',$2,$3,$4,$5,$6,$7)`, [importId,input.sourceType,input.filename,hash,dates[0]??null,dates.at(-1)??null,rawRows.length]);
    let matched = 0;
    for (const row of transactions) {
      const match = (await client.query(`SELECT id FROM decision_agent_orders WHERE ticker=$1 AND side=$2 AND status='EXECUTED' AND (executed_at AT TIME ZONE 'Asia/Jakarta')::date=$3::date AND lots=$4 AND ABS(fill_price-$5)<=0.0001 ORDER BY executed_at LIMIT 1`, [row.ticker,row.side,row.date,row.lots,row.price])).rows[0];
      if (match) matched += 1;
      await client.query(`INSERT INTO decision_agent_broker_transactions (id,import_id,trade_date,ticker,side,lots,price,gross_value,fee_value,source_row,reconciliation_status,matched_order_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [crypto.randomUUID(),importId,row.date,row.ticker,row.side,row.lots,row.price,row.gross,row.fee,row.sourceRow,match?'MATCHED':'UNMATCHED',match?.id??null]);
    }
    for (const row of costs) await client.query(`INSERT INTO decision_agent_paper_costs (id,account_id,cost_type,amount,observed_date,source_type,source_reference,import_id) VALUES ($1,$2,$3,$4,$5,'BROKER_IMPORT',$6,$7)`, [crypto.randomUUID(),ACCOUNT_ID,row.type,row.amount,row.date,`${input.filename}:row:${row.sourceRow}`,importId]);
    const totalCost = costs.reduce((sum, row) => sum + row.amount, 0);
    if (totalCost > 0) {
      const updated = await client.query(`UPDATE decision_agent_paper_accounts SET cash=cash-$2,updated_at=NOW() WHERE id=$1 AND cash >= $2 RETURNING cash`, [ACCOUNT_ID,totalCost]);
      if (!updated.rows[0]) throw new ConflictError('Kas paper tidak cukup untuk biaya aktual pada file broker');
      await client.query(`INSERT INTO decision_agent_paper_nav_snapshots (id,account_id,nav,cash,positions_value,source,observed_at)
        SELECT $1,a.id,a.cash+COALESCE(SUM(p.lots*100*p.last_price),0),a.cash,COALESCE(SUM(p.lots*100*p.last_price),0),'RECONCILIATION',NOW()
        FROM decision_agent_paper_accounts a LEFT JOIN decision_agent_paper_positions p ON p.account_id=a.id AND p.lots>0
        WHERE a.id=$2 GROUP BY a.id,a.cash`, [crypto.randomUUID(),ACCOUNT_ID]);
    }
    await client.query('COMMIT'); return { rows: transactions.length, matched, costs: costs.length };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

export { STOCKBIT_COST_SOURCE };
