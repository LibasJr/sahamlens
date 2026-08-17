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
  brokerComposition: {
    foreign: { buyValue: number; sellValue: number; netValue: number; pct: number };
    domesticInst: { buyValue: number; sellValue: number; netValue: number; pct: number };
    retail: { buyValue: number; sellValue: number; netValue: number; pct: number };
  };
  bandarPriceAnalysis: {
    bandarAvgBuyPrice: number | null;
    bandarAvgSellPrice: number | null;
    estimatedClosingPrice: number | null;
    bandarPriceDiffPct: number | null;
    priceZone: 'DISCOUNT_ZONE' | 'ACCUMULATION_ZONE' | 'MARKUP_ZONE' | 'NEUTRAL';
  };
  retailBehavior: {
    status: 'PANIC_SELLING' | 'FOMO_BUYING' | 'RETAIL_ACCUMULATION' | 'RETAIL_DISTRIBUTION' | 'NEUTRAL';
    summary: string;
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
  const validSymbols = getEmitenSymbolSet();
  const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const transactions: BrokerTransactionRaw[] = [];

  for (const line of lines) {
    const parts = line.includes('\t')
      ? line.split('\t')
      : line.includes(';')
      ? line.split(';')
      : line.split(',');

    if (parts.length < 4) continue;

    const rawTicker = parts[0]?.trim().toUpperCase().replace(/\.JK$/i, '');
    if (!rawTicker || !validSymbols.has(rawTicker)) continue;

    const brokerCode = parts[1]?.trim().toUpperCase();
    if (!brokerCode || brokerCode.length > 8 || !/^[A-Z0-9]+$/.test(brokerCode)) continue;

    const parseNum = (val: string | undefined): number => {
      if (!val) return 0;
      const clean = val.replace(/[^0-9.-]+/g, '');
      const parsed = parseFloat(clean);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const buyValue = parseNum(parts[2]);
    const sellValue = parseNum(parts[3]);
    const buyVolume = parts[4] ? parseNum(parts[4]) : Math.round(buyValue / 1000);
    const sellVolume = parts[5] ? parseNum(parts[5]) : Math.round(sellValue / 1000);
    const buyLot = Math.round(buyVolume / 100);
    const sellLot = Math.round(sellVolume / 100);
    const buyFrequency = parts[6] ? Math.round(parseNum(parts[6])) : undefined;
    const sellFrequency = parts[7] ? Math.round(parseNum(parts[7])) : undefined;

    const buyAvgPrice = buyVolume > 0 ? parseFloat((buyValue / buyVolume).toFixed(2)) : undefined;
    const sellAvgPrice = sellVolume > 0 ? parseFloat((sellValue / sellVolume).toFixed(2)) : undefined;

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
      buyFrequency,
      sellFrequency,
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
    let retailBuyValue = 0;
    let retailSellValue = 0;
    let domInstBuyValue = 0;
    let domInstSellValue = 0;

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
      } else if (category === 'RETAIL') {
        retailBuyValue += buyV;
        retailSellValue += sellV;
      } else {
        domInstBuyValue += buyV;
        domInstSellValue += sellV;
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
    const turnoverBase = Math.max(1, totalTurnover);

    const topBuyers = [...items].filter((i) => i.netValue > 0).sort((a, b) => b.netValue - a.netValue).slice(0, 5);
    const topSellers = [...items].filter((i) => i.netValue < 0).sort((a, b) => a.netValue - b.netValue).slice(0, 5);

    const top1BuySum = topBuyers.slice(0, 1).reduce((s, b) => s + b.netValue, 0);
    const top3BuySum = topBuyers.slice(0, 3).reduce((s, b) => s + b.netValue, 0);
    const top5BuySum = topBuyers.slice(0, 5).reduce((s, b) => s + b.netValue, 0);

    const top1SellSum = Math.abs(topSellers.slice(0, 1).reduce((s, b) => s + b.netValue, 0));
    const top3SellSum = Math.abs(topSellers.slice(0, 3).reduce((s, b) => s + b.netValue, 0));
    const top5SellSum = Math.abs(topSellers.slice(0, 5).reduce((s, b) => s + b.netValue, 0));

    const top1BuyPct = Math.round((top1BuySum / turnoverBase) * 100);
    const top3BuyPct = Math.round((top3BuySum / turnoverBase) * 100);
    const top5BuyPct = Math.round((top5BuySum / turnoverBase) * 100);

    const top1SellPct = Math.round((top1SellSum / turnoverBase) * 100);
    const top3SellPct = Math.round((top3SellSum / turnoverBase) * 100);
    const top5SellPct = Math.round((top5SellSum / turnoverBase) * 100);

    // Bandar Average Price Calculation
    let topBuyerValWeighted = 0;
    let topBuyerVolWeighted = 0;
    for (const b of topBuyers.slice(0, 3)) {
      if (b.avgBuyPrice && b.buyVolume > 0) {
        topBuyerValWeighted += b.avgBuyPrice * b.buyVolume;
        topBuyerVolWeighted += b.buyVolume;
      }
    }
    const bandarAvgBuyPrice = topBuyerVolWeighted > 0 ? Math.round(topBuyerValWeighted / topBuyerVolWeighted) : (topBuyers[0]?.avgBuyPrice ? Math.round(topBuyers[0].avgBuyPrice) : null);

    let topSellerValWeighted = 0;
    let topSellerVolWeighted = 0;
    for (const s of topSellers.slice(0, 3)) {
      if (s.avgSellPrice && s.sellVolume > 0) {
        topSellerValWeighted += s.avgSellPrice * s.sellVolume;
        topSellerVolWeighted += s.sellVolume;
      }
    }
    const bandarAvgSellPrice = topSellerVolWeighted > 0 ? Math.round(topSellerValWeighted / topSellerVolWeighted) : (topSellers[0]?.avgSellPrice ? Math.round(topSellers[0].avgSellPrice) : null);

    const estimatedClosingPrice = bandarAvgBuyPrice && bandarAvgSellPrice
      ? Math.round((bandarAvgBuyPrice + bandarAvgSellPrice) / 2)
      : bandarAvgBuyPrice || bandarAvgSellPrice;

    let bandarPriceDiffPct: number | null = null;
    let priceZone: StockBrokerSummaryResult['bandarPriceAnalysis']['priceZone'] = 'NEUTRAL';

    if (estimatedClosingPrice && bandarAvgBuyPrice) {
      bandarPriceDiffPct = parseFloat((((estimatedClosingPrice - bandarAvgBuyPrice) / bandarAvgBuyPrice) * 100).toFixed(1));
      if (bandarPriceDiffPct <= -1.5) {
        priceZone = 'DISCOUNT_ZONE';
      } else if (bandarPriceDiffPct <= 2.5) {
        priceZone = 'ACCUMULATION_ZONE';
      } else {
        priceZone = 'MARKUP_ZONE';
      }
    }

    // Broker Composition Breakdown
    const foreignTotal = foreignBuyValue + foreignSellValue;
    const retailTotal = retailBuyValue + retailSellValue;
    const domInstTotal = domInstBuyValue + domInstSellValue;
    const allTotal = Math.max(1, foreignTotal + retailTotal + domInstTotal);

    const brokerComposition = {
      foreign: {
        buyValue: foreignBuyValue,
        sellValue: foreignSellValue,
        netValue: foreignBuyValue - foreignSellValue,
        pct: Math.round((foreignTotal / allTotal) * 100),
      },
      domesticInst: {
        buyValue: domInstBuyValue,
        sellValue: domInstSellValue,
        netValue: domInstBuyValue - domInstSellValue,
        pct: Math.round((domInstTotal / allTotal) * 100),
      },
      retail: {
        buyValue: retailBuyValue,
        sellValue: retailSellValue,
        netValue: retailBuyValue - retailSellValue,
        pct: Math.round((retailTotal / allTotal) * 100),
      },
    };

    // Retail Behavior Status
    const retailNet = brokerComposition.retail.netValue;
    let retailStatus: StockBrokerSummaryResult['retailBehavior']['status'] = 'NEUTRAL';
    let retailSummary = 'Aktivitas transaksi ritel terpantau seimbang dengan broker pasar.';

    if (retailNet < -1_000_000_000 && (top3BuyPct >= 25 || brokerComposition.foreign.netValue > 0)) {
      retailStatus = 'PANIC_SELLING';
      retailSummary = 'Ritel melakukan aksi jual bersih (net sell) saat broker institusi/asing melakukan serap akumulasi.';
    } else if (retailNet > 1_000_000_000 && (top3SellPct >= 25 || brokerComposition.foreign.netValue < 0)) {
      retailStatus = 'FOMO_BUYING';
      retailSummary = 'Ritel mendominasi pembelian (net buy) di saat broker besar melakukan distribusi barang.';
    } else if (retailNet < 0) {
      retailStatus = 'RETAIL_DISTRIBUTION';
      retailSummary = 'Arus transaksi broker ritel tercatat net sell moderat.';
    } else if (retailNet > 0) {
      retailStatus = 'RETAIL_ACCUMULATION';
      retailSummary = 'Arus transaksi broker ritel tercatat net buy moderat.';
    }

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
      brokerComposition,
      bandarPriceAnalysis: {
        bandarAvgBuyPrice,
        bandarAvgSellPrice,
        estimatedClosingPrice,
        bandarPriceDiffPct,
        priceZone,
      },
      retailBehavior: {
        status: retailStatus,
        summary: retailSummary,
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
