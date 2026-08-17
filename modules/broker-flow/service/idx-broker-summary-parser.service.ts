import { pool } from '@/shared/database/postgres.client';
import { getEmitenSymbolSet } from '@/shared/market/emiten-list';

export const KNOWN_FOREIGN_BROKERS = new Set([
  'AK', 'BK', 'CC', 'CS', 'KZ', 'MS', 'RX', 'YU', 'ZP', 'CG', 'DP', 'DB', 'LG', 'ML', 'OD', 'AI', 'BS', 'GW', 'HP', 'FS',
]);

export const KNOWN_RETAIL_BROKERS = new Set([
  'YP', 'PD', 'XC', 'NI', 'XL', 'SQ', 'KK', 'CP', 'GR', 'HD', 'EP', 'AZ', 'BQ',
]);

export interface BrokerTransactionRaw {
  ticker: string;
  tradeDate: string; // YYYY-MM-DD
  brokerCode: string;
  buyValue: number;
  sellValue: number;
  buyVolume: number;
  sellVolume: number;
  buyFrequency?: number;
  sellFrequency?: number;
  buyLot?: number;
  sellLot?: number;
  buyAvgPrice?: number;
  sellAvgPrice?: number;
  source?: string;
  sourceFile?: string;
}

export interface ParsedBrokerSummaryReport {
  tradeDate: string;
  source: string;
  totalRecords: number;
  transactions: BrokerTransactionRaw[];
}

export interface TopBrokerItem {
  brokerCode: string;
  brokerCategory: 'FOREIGN' | 'DOMESTIC_INSTITUTION' | 'RETAIL';
  buyValue: number;
  sellValue: number;
  netValue: number;
  buyVolume: number;
  sellVolume: number;
  netVolume: number;
  avgBuyPrice: number | null;
  avgSellPrice: number | null;
}

export interface StockBrokerSummaryResult {
  ticker: string;
  tradeDate: string;
  totalTurnover: number;
  totalVolume: number;
  topBuyers: TopBrokerItem[];
  topSellers: TopBrokerItem[];
  concentration: {
    top1BuyPct: number;
    top3BuyPct: number;
    top5BuyPct: number;
    top1SellPct: number;
    top3SellPct: number;
    top5SellPct: number;
  };
  foreignSummary: {
    foreignBuyValue: number;
    foreignSellValue: number;
    foreignNetValue: number;
  };
  bandarmologyStatus: 'BIG_ACCUMULATION' | 'NORMAL_ACCUMULATION' | 'NEUTRAL' | 'NORMAL_DISTRIBUTION' | 'BIG_DISTRIBUTION';
  bandarmologyNarrative: string;
}

/**
 * Classify broker category (Foreign, Domestic Institutional, Retail).
 */
export function classifyBrokerCode(code: string): 'FOREIGN' | 'DOMESTIC_INSTITUTION' | 'RETAIL' {
  const upper = code.trim().toUpperCase();
  if (KNOWN_FOREIGN_BROKERS.has(upper)) return 'FOREIGN';
  if (KNOWN_RETAIL_BROKERS.has(upper)) return 'RETAIL';
  return 'DOMESTIC_INSTITUTION';
}

/**
 * Parse text or CSV content of an IDX End-of-Day Daily Trading/Broker Summary.
 */
export function parseIdxBrokerSummaryText(
  content: string,
  tradeDate: string,
  source = 'IDX_EOD_REPORT'
): ParsedBrokerSummaryReport {
  const lines = content.split(/\r?\n/);
  const transactions: BrokerTransactionRaw[] = [];
  const validSymbols = getEmitenSymbolSet();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line || line.startsWith('#') || line.toLowerCase().startsWith('ticker') || line.toLowerCase().startsWith('trade_date')) continue;

    const parts = line.includes('\t')
      ? line.split('\t')
      : line.includes(';')
      ? line.split(';')
      : line.split(',');

    if (parts.length < 5) continue;

    // Handle formats: [ticker, broker, buyVal, sellVal, ...] or [date, ticker, broker, buyVal, sellVal, ...]
    let rawTicker = parts[0]?.trim().toUpperCase().replace(/\.JK$/i, '');
    let brokerCode = parts[1]?.trim().toUpperCase();
    let buyIdx = 2;
    let sellIdx = 3;
    let buyVolIdx = 4;
    let sellVolIdx = 5;

    if (/^\d{4}-\d{2}-\d{2}$/.test(rawTicker)) {
      rawTicker = parts[1]?.trim().toUpperCase().replace(/\.JK$/i, '');
      brokerCode = parts[2]?.trim().toUpperCase();
      buyIdx = 3;
      sellIdx = 4;
      buyVolIdx = 5;
      sellVolIdx = 6;
    }

    if (!rawTicker || !brokerCode || brokerCode.length > 4) continue;
    if (validSymbols.size > 0 && !validSymbols.has(rawTicker)) continue;

    const buyValue = Math.max(0, parseFloat(parts[buyIdx]?.replace(/[^0-9.-]/g, '') || '0') || 0);
    const sellValue = Math.max(0, parseFloat(parts[sellIdx]?.replace(/[^0-9.-]/g, '') || '0') || 0);
    const buyVolume = Math.max(0, parseFloat(parts[buyVolIdx]?.replace(/[^0-9.-]/g, '') || '0') || 0);
    const sellVolume = Math.max(0, parseFloat(parts[sellVolIdx]?.replace(/[^0-9.-]/g, '') || '0') || 0);

    if (buyValue === 0 && sellValue === 0 && buyVolume === 0 && sellVolume === 0) continue;

    const buyLot = Math.round(buyVolume / 100);
    const sellLot = Math.round(sellVolume / 100);
    const buyAvgPrice = buyVolume > 0 && buyValue > 0 ? Math.round(buyValue / (buyVolume * 100)) : undefined;
    const sellAvgPrice = sellVolume > 0 && sellValue > 0 ? Math.round(sellValue / (sellVolume * 100)) : undefined;

    transactions.push({
      ticker: `${rawTicker}.JK`,
      tradeDate,
      brokerCode,
      buyValue,
      sellValue,
      buyVolume,
      sellVolume,
      buyLot,
      sellLot,
      buyAvgPrice,
      sellAvgPrice,
      source,
    });
  }

  return {
    tradeDate,
    source,
    totalRecords: transactions.length,
    transactions,
  };
}

/**
 * Persist parsed broker transactions into PostgreSQL `broker_summary_daily`.
 */
export async function saveBrokerTransactionsToDb(transactions: BrokerTransactionRaw[]): Promise<number> {
  if (!transactions.length) return 0;

  const client = await pool.connect();
  let inserted = 0;

  try {
    await client.query('BEGIN');

    for (const tx of transactions) {
      const source = tx.source || 'IDX_EOD_REPORT';
      const buyLot = tx.buyLot ?? Math.round(tx.buyVolume / 100);
      const sellLot = tx.sellLot ?? Math.round(tx.sellVolume / 100);

      await client.query(
        `INSERT INTO broker_summary_daily (
          trade_date, ticker, broker_code,
          buy_value, sell_value, buy_volume, sell_volume, buy_frequency, sell_frequency,
          buy_lot, sell_lot, buy_avg, sell_avg, source, source_file, imported_at
        ) VALUES (
          $1::date, $2, $3,
          $4, $5, $6, $7, $8, $9,
          $10, $11, $12, $13, $14, $15, NOW()
        )
        ON CONFLICT (trade_date, ticker, broker_code, source)
        DO UPDATE SET
          buy_value = EXCLUDED.buy_value,
          sell_value = EXCLUDED.sell_value,
          buy_volume = EXCLUDED.buy_volume,
          sell_volume = EXCLUDED.sell_volume,
          buy_frequency = EXCLUDED.buy_frequency,
          sell_frequency = EXCLUDED.sell_frequency,
          buy_lot = EXCLUDED.buy_lot,
          sell_lot = EXCLUDED.sell_lot,
          buy_avg = EXCLUDED.buy_avg,
          sell_avg = EXCLUDED.sell_avg,
          imported_at = NOW()`,
        [
          tx.tradeDate,
          tx.ticker,
          tx.brokerCode,
          tx.buyValue,
          tx.sellValue,
          tx.buyVolume,
          tx.sellVolume,
          tx.buyFrequency ?? null,
          tx.sellFrequency ?? null,
          buyLot,
          sellLot,
          tx.buyAvgPrice ?? null,
          tx.sellAvgPrice ?? null,
          source,
          tx.sourceFile ?? null,
        ]
      );
      inserted++;
    }

    await client.query('COMMIT');
    return inserted;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Compute institutional Bandarmology metrics for a given stock and date.
 */
export async function computeStockBrokerSummary(
  rawTicker: string,
  targetDate?: string
): Promise<StockBrokerSummaryResult | null> {
  const ticker = rawTicker.trim().toUpperCase().includes('.JK') ? rawTicker.trim().toUpperCase() : `${rawTicker.trim().toUpperCase()}.JK`;

  try {
    const dateQuery = targetDate
      ? targetDate
      : (
          await pool.query(
            'SELECT trade_date FROM broker_summary_daily WHERE ticker = $1 ORDER BY trade_date DESC LIMIT 1',
            [ticker]
          )
        ).rows[0]?.trade_date;

    if (!dateQuery) return null;

    const formattedDate = dateQuery instanceof Date ? dateQuery.toISOString().slice(0, 10) : String(dateQuery).slice(0, 10);

    const rowsRes = await pool.query(
      `SELECT
        broker_code, buy_value, sell_value, buy_volume, sell_volume,
        buy_avg, sell_avg
      FROM broker_summary_daily
      WHERE ticker = $1 AND trade_date = $2::date
      ORDER BY ABS(buy_value - sell_value) DESC`,
      [ticker, formattedDate]
    );

    if (!rowsRes.rows.length) return null;

    let totalTurnover = 0;
    let totalVolume = 0;
    let foreignBuyValue = 0;
    let foreignSellValue = 0;

    const items: TopBrokerItem[] = rowsRes.rows.map((r: any) => {
      const bCode = String(r.broker_code);
      const buyV = parseFloat(r.buy_value) || 0;
      const sellV = parseFloat(r.sell_value) || 0;
      const buyVol = parseFloat(r.buy_volume) || 0;
      const sellVol = parseFloat(r.sell_volume) || 0;
      const netV = buyV - sellV;
      const netVol = buyVol - sellVol;
      const category = classifyBrokerCode(bCode);

      totalTurnover += buyV + sellV;
      totalVolume += buyVol + sellVol;

      if (category === 'FOREIGN') {
        foreignBuyValue += buyV;
        foreignSellValue += sellV;
      }

      return {
        brokerCode: bCode,
        brokerCategory: category,
        buyValue: buyV,
        sellValue: sellV,
        netValue: netV,
        buyVolume: buyVol,
        sellVolume: sellVol,
        netVolume: netVol,
        avgBuyPrice: r.buy_avg ? parseFloat(r.buy_avg) : null,
        avgSellPrice: r.sell_avg ? parseFloat(r.sell_avg) : null,
      };
    });

    totalTurnover = totalTurnover / 2;
    totalVolume = totalVolume / 2;

    const topBuyers = [...items].filter((i) => i.netValue > 0).sort((a, b) => b.netValue - a.netValue).slice(0, 5);
    const topSellers = [...items].filter((i) => i.netValue < 0).sort((a, b) => a.netValue - b.netValue).slice(0, 5);

    const top1BuySum = topBuyers.slice(0, 1).reduce((s, b) => s + b.netValue, 0);
    const top3BuySum = topBuyers.slice(0, 3).reduce((s, b) => s + b.netValue, 0);
    const top5BuySum = topBuyers.slice(0, 5).reduce((s, b) => s + b.netValue, 0);

    const top1SellSum = Math.abs(topSellers.slice(0, 1).reduce((s, b) => s + b.netValue, 0));
    const top3SellSum = Math.abs(topSellers.slice(0, 3).reduce((s, b) => s + b.netValue, 0));
    const top5SellSum = Math.abs(topSellers.slice(0, 5).reduce((s, b) => s + b.netValue, 0));

    const turnoverBase = Math.max(1, totalTurnover);
    const top1BuyPct = Math.round((top1BuySum / turnoverBase) * 100);
    const top3BuyPct = Math.round((top3BuySum / turnoverBase) * 100);
    const top5BuyPct = Math.round((top5BuySum / turnoverBase) * 100);

    const top1SellPct = Math.round((top1SellSum / turnoverBase) * 100);
    const top3SellPct = Math.round((top3SellSum / turnoverBase) * 100);
    const top5SellPct = Math.round((top5SellSum / turnoverBase) * 100);

    let bandarmologyStatus: StockBrokerSummaryResult['bandarmologyStatus'] = 'NEUTRAL';
    let narrative = 'Aktivitas transaksi relatif seimbang antara pembeli dan penjual tanpa konsentrasi dominan.';

    if (top3BuyPct >= 40) {
      bandarmologyStatus = 'BIG_ACCUMULATION';
      narrative = `Akumulasi masif terdeteksi: Top 3 Broker (${topBuyers.map((b) => b.brokerCode).join(', ')}) menyerap ${top3BuyPct}% dari total nilai transaksi.`;
    } else if (top3BuyPct >= 20) {
      bandarmologyStatus = 'NORMAL_ACCUMULATION';
      narrative = `Akumulasi moderat oleh broker utama (${topBuyers.slice(0, 3).map((b) => b.brokerCode).join(', ')}).`;
    } else if (top3SellPct >= 40) {
      bandarmologyStatus = 'BIG_DISTRIBUTION';
      narrative = `Distribusi masif terdeteksi: Top 3 Broker (${topSellers.map((b) => b.brokerCode).join(', ')}) melepas ${top3SellPct}% dari total nilai transaksi.`;
    } else if (top3SellPct >= 20) {
      bandarmologyStatus = 'NORMAL_DISTRIBUTION';
      narrative = `Distribusi terdeteksi oleh broker penjual (${topSellers.slice(0, 3).map((b) => b.brokerCode).join(', ')}).`;
    }

    return {
      ticker,
      tradeDate: formattedDate,
      totalTurnover,
      totalVolume,
      topBuyers,
      topSellers,
      concentration: {
        top1BuyPct,
        top3BuyPct,
        top5BuyPct,
        top1SellPct,
        top3SellPct,
        top5SellPct,
      },
      foreignSummary: {
        foreignBuyValue,
        foreignSellValue,
        foreignNetValue: foreignBuyValue - foreignSellValue,
      },
      bandarmologyStatus,
      bandarmologyNarrative: narrative,
    };
  } catch (err: any) {
    if (err?.code === '42P01') return null;
    console.error('[computeStockBrokerSummary] query failed', err);
    return null;
  }
}
