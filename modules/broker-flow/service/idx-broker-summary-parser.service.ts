import { pool } from '@/shared/database/postgres.client';
import { getEmitenSymbolSet } from '@/shared/market/emiten-list';
import {
  PUBLIC_BROKER_DAILY_SOURCE,
  brokerDailyIntegrityStatus,
  type BrokerDailyIntegrityStatus,
} from './broker-summary-integrity';

export const KNOWN_FOREIGN_BROKERS = new Set([
  'AK', 'BK', 'CC', 'CS', 'KZ', 'MS', 'RX', 'YU', 'ZP', 'CG', 'DP', 'DB', 'LG', 'ML', 'OD', 'AI', 'BS', 'GW', 'HP', 'FS',
]);

export const KNOWN_RETAIL_BROKERS = new Set([
  'YP', 'PD', 'XC', 'NI', 'XL', 'SQ', 'KK', 'CP', 'GR', 'HD', 'EP', 'AZ', 'BQ',
]);

export type BrokerCategory = 'FOREIGN' | 'RETAIL' | 'UNKNOWN';

export interface BrokerTransactionRaw {
  ticker: string;
  tradeDate: string;
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
  rejectedRecords: number;
  transactions: BrokerTransactionRaw[];
}

export interface TopBrokerItem {
  brokerCode: string;
  brokerCategory: BrokerCategory;
  buyValue: number;
  sellValue: number;
  netValue: number;
  buyVolume: number;
  sellVolume: number;
  netVolume: number;
  avgBuyPrice: number | null;
  avgSellPrice: number | null;
}

interface CompositionBucket {
  buyValue: number;
  sellValue: number;
  netValue: number;
  pct: number;
}

export interface StockBrokerSummaryResult {
  ticker: string;
  tradeDate: string;
  totalTurnover: number;
  totalVolume: number;
  provenance: {
    source: string;
    sourceFile: string | null;
    importedAt: string | null;
    integrityStatus: BrokerDailyIntegrityStatus;
    reconciliationStatus: 'UNRECONCILED';
  };
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
    foreign: CompositionBucket;
    domesticInst: CompositionBucket | null;
    retail: CompositionBucket;
    unknown: CompositionBucket;
    classifiedCoveragePct: number;
    classificationMethod: 'INTERNAL_BROKER_CODE_MAP';
  };
  dominantBrokerPriceAnalysis: {
    dominantBuyerAvgPrice: number | null;
    dominantSellerAvgPrice: number | null;
  };
  retailBehavior: {
    status: 'PANIC_SELLING' | 'FOMO_BUYING' | 'RETAIL_ACCUMULATION' | 'RETAIL_DISTRIBUTION' | 'NEUTRAL' | 'UNAVAILABLE';
    summary: string;
  };
  brokerConcentrationStatus: 'BIG_ACCUMULATION' | 'NORMAL_ACCUMULATION' | 'NEUTRAL' | 'NORMAL_DISTRIBUTION' | 'BIG_DISTRIBUTION';
  brokerConcentrationNarrative: string;
}

/**
 * Klasifikasi ini adalah mapping internal SahamLens, bukan atribut resmi yang datang
 * bersama setiap baris provider. Kode yang belum ada di mapping HARUS UNKNOWN.
 */
export function classifyBrokerCode(code: string): BrokerCategory {
  const upper = code.trim().toUpperCase();
  if (KNOWN_FOREIGN_BROKERS.has(upper)) return 'FOREIGN';
  if (KNOWN_RETAIL_BROKERS.has(upper)) return 'RETAIL';
  return 'UNKNOWN';
}

function parseNonNegativeNumber(value: string | undefined): number | null {
  if (value == null || value.trim() === '') return null;
  const clean = value.replace(/[^0-9.-]+/g, '');
  const parsed = Number(clean);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * Parser report manual. Fail-closed: buy/sell value DAN buy/sell volume wajib ada.
 * Tidak ada lagi estimasi volume dari `value / 1000` ketika kolom volume hilang.
 *
 * Default source sengaja UNVERIFIED supaya hasil parser tidak dapat menyamar sebagai
 * feed resmi hanya karena caller lupa memberikan provenance.
 */
export function parseIdxBrokerSummaryText(
  content: string,
  tradeDate: string,
  source = 'UNVERIFIED_MANUAL_REPORT',
): ParsedBrokerSummaryReport {
  const validSymbols = getEmitenSymbolSet();
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const transactions: BrokerTransactionRaw[] = [];
  let rejectedRecords = 0;

  for (const line of lines) {
    const parts = line.includes('\t') ? line.split('\t') : line.includes(';') ? line.split(';') : line.split(',');
    if (parts.length < 6) {
      rejectedRecords += 1;
      continue;
    }

    const rawTicker = parts[0]?.trim().toUpperCase().replace(/\.JK$/i, '');
    if (!rawTicker || !validSymbols.has(rawTicker)) continue;

    const brokerCode = parts[1]?.trim().toUpperCase();
    if (!brokerCode || brokerCode.length > 8 || !/^[A-Z0-9]+$/.test(brokerCode)) {
      rejectedRecords += 1;
      continue;
    }

    const buyValue = parseNonNegativeNumber(parts[2]);
    const sellValue = parseNonNegativeNumber(parts[3]);
    const buyVolume = parseNonNegativeNumber(parts[4]);
    const sellVolume = parseNonNegativeNumber(parts[5]);
    if (buyValue == null || sellValue == null || buyVolume == null || sellVolume == null) {
      rejectedRecords += 1;
      continue;
    }

    const buyFrequencyRaw = parseNonNegativeNumber(parts[6]);
    const sellFrequencyRaw = parseNonNegativeNumber(parts[7]);
    const buyFrequency = buyFrequencyRaw == null ? undefined : Math.round(buyFrequencyRaw);
    const sellFrequency = sellFrequencyRaw == null ? undefined : Math.round(sellFrequencyRaw);
    const buyLot = Math.round(buyVolume / 100);
    const sellLot = Math.round(sellVolume / 100);
    const buyAvgPrice = buyVolume > 0 ? Number((buyValue / buyVolume).toFixed(2)) : undefined;
    const sellAvgPrice = sellVolume > 0 ? Number((sellValue / sellVolume).toFixed(2)) : undefined;

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

  return { tradeDate, source, totalRecords: transactions.length, rejectedRecords, transactions };
}

function finiteDbNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function weightedAveragePrice(items: TopBrokerItem[], side: 'BUY' | 'SELL'): number | null {
  let weighted = 0;
  let volume = 0;
  for (const item of items.slice(0, 3)) {
    const avg = side === 'BUY' ? item.avgBuyPrice : item.avgSellPrice;
    const vol = side === 'BUY' ? item.buyVolume : item.sellVolume;
    if (avg != null && avg > 0 && vol > 0) {
      weighted += avg * vol;
      volume += vol;
    }
  }
  return volume > 0 ? Math.round(weighted / volume) : null;
}

function bucket(buyValue: number, sellValue: number, total: number): CompositionBucket {
  const turnover = buyValue + sellValue;
  return {
    buyValue,
    sellValue,
    netValue: buyValue - sellValue,
    pct: total > 0 ? Math.round((turnover / total) * 100) : 0,
  };
}

/**
 * Compute Broker Summary hanya dari source harian yang provenance-nya diketahui.
 * `IDX_EOD_REPORT` sengaja diblok karena source label itu pernah tercemar data sintetis.
 */
export async function computeStockBrokerSummary(
  rawTicker: string,
  targetDate?: string,
): Promise<StockBrokerSummaryResult | null> {
  const code = rawTicker.trim().toUpperCase().replace(/\.JK$/i, '');
  if (!/^[A-Z0-9]{1,12}$/.test(code)) return null;
  const ticker = `${code}.JK`;
  const source = PUBLIC_BROKER_DAILY_SOURCE;
  const integrityStatus = brokerDailyIntegrityStatus(source);
  if (!integrityStatus) return null;

  try {
    const dateQuery = targetDate
      ? targetDate
      : (
          await pool.query(
            `SELECT trade_date
             FROM broker_summary_daily
             WHERE ticker = $1 AND source = $2
             ORDER BY trade_date DESC
             LIMIT 1`,
            [ticker, source],
          )
        ).rows[0]?.trade_date;

    if (!dateQuery) return null;
    const formattedDate = dateQuery instanceof Date ? dateQuery.toISOString().slice(0, 10) : String(dateQuery).slice(0, 10);

    const rowsRes = await pool.query(
      `SELECT broker_code, buy_value, sell_value, buy_volume, sell_volume,
              buy_avg, sell_avg, source, source_file, imported_at
       FROM broker_summary_daily
       WHERE ticker = $1 AND trade_date = $2::date AND source = $3
       ORDER BY ABS(buy_value - sell_value) DESC`,
      [ticker, formattedDate, source],
    );
    if (!rowsRes.rows.length) return null;

    let totalTurnoverDoubleCounted = 0;
    let totalVolumeDoubleCounted = 0;
    let foreignBuyValue = 0;
    let foreignSellValue = 0;
    let retailBuyValue = 0;
    let retailSellValue = 0;
    let unknownBuyValue = 0;
    let unknownSellValue = 0;

    const items: TopBrokerItem[] = [];
    for (const row of rowsRes.rows) {
      const buyValue = finiteDbNumber(row.buy_value);
      const sellValue = finiteDbNumber(row.sell_value);
      const buyVolume = finiteDbNumber(row.buy_volume);
      const sellVolume = finiteDbNumber(row.sell_volume);
      if (buyValue == null || sellValue == null || buyVolume == null || sellVolume == null) continue;

      const brokerCode = String(row.broker_code ?? '').trim().toUpperCase();
      if (!brokerCode) continue;
      const category = classifyBrokerCode(brokerCode);
      totalTurnoverDoubleCounted += buyValue + sellValue;
      totalVolumeDoubleCounted += buyVolume + sellVolume;

      if (category === 'FOREIGN') {
        foreignBuyValue += buyValue;
        foreignSellValue += sellValue;
      } else if (category === 'RETAIL') {
        retailBuyValue += buyValue;
        retailSellValue += sellValue;
      } else {
        unknownBuyValue += buyValue;
        unknownSellValue += sellValue;
      }

      items.push({
        brokerCode,
        brokerCategory: category,
        buyValue,
        sellValue,
        netValue: buyValue - sellValue,
        buyVolume,
        sellVolume,
        netVolume: buyVolume - sellVolume,
        avgBuyPrice: finiteDbNumber(row.buy_avg),
        avgSellPrice: finiteDbNumber(row.sell_avg),
      });
    }

    if (!items.length) return null;

    const totalTurnover = totalTurnoverDoubleCounted / 2;
    const totalVolume = totalVolumeDoubleCounted / 2;
    const turnoverBase = totalTurnover > 0 ? totalTurnover : null;
    const topBuyers = [...items].filter((item) => item.netValue > 0).sort((a, b) => b.netValue - a.netValue).slice(0, 5);
    const topSellers = [...items].filter((item) => item.netValue < 0).sort((a, b) => a.netValue - b.netValue).slice(0, 5);

    const buyPct = (count: number) => turnoverBase == null ? 0 : Math.round((topBuyers.slice(0, count).reduce((sum, item) => sum + item.netValue, 0) / turnoverBase) * 100);
    const sellPct = (count: number) => turnoverBase == null ? 0 : Math.round((Math.abs(topSellers.slice(0, count).reduce((sum, item) => sum + item.netValue, 0)) / turnoverBase) * 100);
    const concentration = {
      top1BuyPct: buyPct(1), top3BuyPct: buyPct(3), top5BuyPct: buyPct(5),
      top1SellPct: sellPct(1), top3SellPct: sellPct(3), top5SellPct: sellPct(5),
    };

    const foreignTotal = foreignBuyValue + foreignSellValue;
    const retailTotal = retailBuyValue + retailSellValue;
    const unknownTotal = unknownBuyValue + unknownSellValue;
    const allTotal = foreignTotal + retailTotal + unknownTotal;
    const classifiedTotal = foreignTotal + retailTotal;

    const brokerComposition = {
      foreign: bucket(foreignBuyValue, foreignSellValue, allTotal),
      // Belum ada mapping institusi domestik yang tervalidasi. Null lebih jujur daripada 0%.
      domesticInst: null,
      retail: bucket(retailBuyValue, retailSellValue, allTotal),
      unknown: bucket(unknownBuyValue, unknownSellValue, allTotal),
      classifiedCoveragePct: allTotal > 0 ? Math.round((classifiedTotal / allTotal) * 100) : 0,
      classificationMethod: 'INTERNAL_BROKER_CODE_MAP' as const,
    };

    const retailNet = brokerComposition.retail.netValue;
    let retailStatus: StockBrokerSummaryResult['retailBehavior']['status'] = 'UNAVAILABLE';
    let retailSummary = 'Klasifikasi pelaku belum memiliki cakupan yang cukup untuk menyimpulkan perilaku ritel.';
    if (brokerComposition.classifiedCoveragePct >= 80) {
      retailStatus = 'NEUTRAL';
      retailSummary = 'Berdasarkan klasifikasi broker internal SahamLens, arus ritel relatif seimbang.';
      if (retailNet < -1_000_000_000 && (concentration.top3BuyPct >= 25 || brokerComposition.foreign.netValue > 0)) {
        retailStatus = 'PANIC_SELLING';
        retailSummary = 'Berdasarkan klasifikasi internal, broker yang dipetakan sebagai ritel tercatat net sell saat broker dominan menyerap pembelian.';
      } else if (retailNet > 1_000_000_000 && (concentration.top3SellPct >= 25 || brokerComposition.foreign.netValue < 0)) {
        retailStatus = 'FOMO_BUYING';
        retailSummary = 'Berdasarkan klasifikasi internal, broker yang dipetakan sebagai ritel tercatat net buy saat broker dominan melakukan penjualan.';
      } else if (retailNet < 0) {
        retailStatus = 'RETAIL_DISTRIBUTION';
        retailSummary = 'Berdasarkan klasifikasi internal, broker yang dipetakan sebagai ritel tercatat net sell moderat.';
      } else if (retailNet > 0) {
        retailStatus = 'RETAIL_ACCUMULATION';
        retailSummary = 'Berdasarkan klasifikasi internal, broker yang dipetakan sebagai ritel tercatat net buy moderat.';
      }
    }

    let brokerConcentrationStatus: StockBrokerSummaryResult['brokerConcentrationStatus'] = 'NEUTRAL';
    let brokerConcentrationNarrative = 'Arus broker relatif seimbang tanpa konsentrasi net dominan.';
    if (concentration.top3BuyPct >= 40) {
      brokerConcentrationStatus = 'BIG_ACCUMULATION';
      brokerConcentrationNarrative = `Konsentrasi net buy tinggi: tiga broker teratas (${topBuyers.slice(0, 3).map((item) => item.brokerCode).join(', ')}) mencakup ${concentration.top3BuyPct}% dari turnover.`;
    } else if (concentration.top3BuyPct >= 20) {
      brokerConcentrationStatus = 'NORMAL_ACCUMULATION';
      brokerConcentrationNarrative = `Konsentrasi net buy moderat pada broker ${topBuyers.slice(0, 3).map((item) => item.brokerCode).join(', ')}.`;
    } else if (concentration.top3SellPct >= 40) {
      brokerConcentrationStatus = 'BIG_DISTRIBUTION';
      brokerConcentrationNarrative = `Konsentrasi net sell tinggi: tiga broker teratas (${topSellers.slice(0, 3).map((item) => item.brokerCode).join(', ')}) mencakup ${concentration.top3SellPct}% dari turnover.`;
    } else if (concentration.top3SellPct >= 20) {
      brokerConcentrationStatus = 'NORMAL_DISTRIBUTION';
      brokerConcentrationNarrative = `Konsentrasi net sell moderat pada broker ${topSellers.slice(0, 3).map((item) => item.brokerCode).join(', ')}.`;
    }

    const provenanceRow = rowsRes.rows[0];
    return {
      ticker,
      tradeDate: formattedDate,
      totalTurnover,
      totalVolume,
      provenance: {
        source,
        sourceFile: typeof provenanceRow?.source_file === 'string' ? provenanceRow.source_file : null,
        importedAt: provenanceRow?.imported_at ? new Date(provenanceRow.imported_at).toISOString() : null,
        integrityStatus,
        reconciliationStatus: 'UNRECONCILED',
      },
      topBuyers,
      topSellers,
      concentration,
      foreignSummary: {
        foreignBuyValue,
        foreignSellValue,
        foreignNetValue: foreignBuyValue - foreignSellValue,
      },
      brokerComposition,
      dominantBrokerPriceAnalysis: {
        dominantBuyerAvgPrice: weightedAveragePrice(topBuyers, 'BUY'),
        dominantSellerAvgPrice: weightedAveragePrice(topSellers, 'SELL'),
      },
      retailBehavior: { status: retailStatus, summary: retailSummary },
      brokerConcentrationStatus,
      brokerConcentrationNarrative,
    };
  } catch (error: any) {
    if (error?.code === '42P01') return null;
    console.error('[computeStockBrokerSummary] query failed', error);
    return null;
  }
}
