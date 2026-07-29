import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import YahooFinanceClass from 'yahoo-finance2';

const SECTOR_RULES: Record<string, any> = {
  "Banks - Regional": { pbv: 0.45, ddm: 0.30, per: 0.25, dcf: 0, graham: 0 },
  "Banks": { pbv: 0.45, ddm: 0.30, per: 0.25, dcf: 0, graham: 0 },
  "Financial Services": { pbv: 0.45, ddm: 0.30, per: 0.25, dcf: 0, graham: 0 },
  "Consumer Defensive": { per: 0.40, dcf: 0.30, ddm: 0.15, graham: 0.15, pbv: 0 },
  "Consumer Cyclical": { per: 0.40, dcf: 0.30, ddm: 0.15, graham: 0.15, pbv: 0 },
  "Energy": { pbv: 0.40, ddm: 0.35, per: 0.25, dcf: 0, graham: 0 },
  "Basic Materials": { pbv: 0.40, ddm: 0.35, per: 0.25, dcf: 0, graham: 0 },
  "Real Estate": { pbv: 0.50, per: 0.30, ddm: 0.20, dcf: 0, graham: 0 },
  "Communication Services": { dcf: 0.40, per: 0.30, ddm: 0.30, pbv: 0, graham: 0 },
  "Industrials": { per: 0.35, dcf: 0.35, pbv: 0.15, ddm: 0.15, graham: 0 },
  "Healthcare": { per: 0.40, dcf: 0.30, pbv: 0.20, ddm: 0.10, graham: 0 },
  "DEFAULT": { per: 0.35, dcf: 0.25, pbv: 0.20, ddm: 0.10, graham: 0.10 }
};

const yahooFinance = new (YahooFinanceClass as any)({ suppressNotices: ['yahooSurvey'] });

export async function GET(
  request: Request,
  { params }: { params: { ticker: string } }
) {
  try {
    let ticker = params.ticker.toUpperCase();
    if (!ticker.includes('.')) {
      ticker = `${ticker}.JK`;
    }

    const quoteSummary = await yahooFinance.quoteSummary(ticker, {
      modules: ['assetProfile', 'defaultKeyStatistics', 'financialData', 'summaryDetail', 'price']
    });

    if (!quoteSummary) {
      return NextResponse.json({ error: 'No data found' }, { status: 404 });
    }

    const price = quoteSummary.price?.regularMarketPrice || 0;
    const eps = quoteSummary.defaultKeyStatistics?.trailingEps || 0;
    const bvps = quoteSummary.defaultKeyStatistics?.bookValue || 0;
    const roe = (quoteSummary.financialData?.returnOnEquity || 0) * 100;
    const dps = quoteSummary.summaryDetail?.dividendRate || 0;
    
    // Fetch NIM if available
    let nim = 0.055; // default bank
    if (quoteSummary.financialData?.profitMargins) {
      // Sometimes NIM is stored in profitMargins for banks
      nim = quoteSummary.financialData.profitMargins;
    }
    
    // Fallback FCF
    let fcf = quoteSummary.financialData?.freeCashflow || null;
    let shares = quoteSummary.defaultKeyStatistics?.sharesOutstanding || 1;
    let fcf_per_share = fcf ? fcf / shares : null;

    const sector = quoteSummary.assetProfile?.sector || '';
    const isBank = sector.toLowerCase().includes('bank') || sector.toLowerCase().includes('financial');

    if (isBank) {
      fcf_per_share = null;
    }

    const methods: any = {};
    let validFairValues: number[] = [];
    
    let intrinsic_pbv = 0;
    let intrinsic_per = 0;
    let intrinsic_ddm = 0;
    let intrinsic_graham = 0;
    let intrinsic_dcf = 0;

    // 1. Graham Number
    if (eps > 0 && bvps > 0) {
      intrinsic_graham = Math.sqrt(22.5 * eps * bvps);
      if (!isBank) {
        methods.graham = {
          name: 'Graham Number',
          value: intrinsic_graham,
          color: '#f59e0b' // yellow
        };
        validFairValues.push(intrinsic_graham);
      }
    }

    // 2. PBV Fair
    if (roe > 0 && bvps > 0) {
      if (isBank) {
        // FIX: Bank PBV Fair
        let calcBvps = price > 0 && (quoteSummary.defaultKeyStatistics?.priceToBook || 0) > 0 
          ? price / quoteSummary.defaultKeyStatistics.priceToBook 
          : bvps;
        
        let pbvWajar = (roe / 12) * 1.4; // Premium 40% for CASA
        if (roe > 20) {
          pbvWajar = (roe / 11) * 1.3; // Specific rule for high ROE banks
        }
        pbvWajar = Math.max(2.5, Math.min(pbvWajar, 3.2)); // Clamp 2.5 - 3.2 for banks
        intrinsic_pbv = pbvWajar * calcBvps;
      } else {
        let pbvWajar = (roe / 12) * 0.85;
        intrinsic_pbv = pbvWajar * bvps;
      }
      
      if (intrinsic_pbv > 0) {
        methods.pbv = {
          name: 'PBV Fair',
          value: intrinsic_pbv,
          color: '#10b981' // emerald
        };
        if (!isBank) validFairValues.push(intrinsic_pbv);
      }
    }

    // 3. DDM
    if (dps > 0) {
      if (isBank) {
        // FIX DDM Bank: Max growth 5%
        let discountRate = roe > 20 ? 0.105 : 0.12;
        intrinsic_ddm = (dps * 1.05) / (discountRate - 0.05);
      } else {
        // Growth 5% (bukan 8%) - konsisten dengan asumsi DCF & DDM bank di atas.
        // g=8% vs r=12% bikin pembagi cuma 0.04 -> DPS di-leverage ~27x, fair value meledak untuk saham dividen tinggi.
        intrinsic_ddm = (dps * 1.05) / (0.12 - 0.05);
      }
      methods.ddm = {
        name: 'DDM (Dividend)',
        value: intrinsic_ddm,
        color: '#3b82f6' // blue
      };
      if (!isBank) validFairValues.push(intrinsic_ddm);
    }

    // 4. PER Fair
    if (eps > 0) {
      // FIX PER FAIR: Use 14.5 for banks, 15 for others
      const defaultPER = isBank ? 14.5 : 15;
      intrinsic_per = eps * defaultPER;
      methods.per = {
        name: 'PER Fair',
        value: intrinsic_per,
        color: '#8b5cf6' // purple
      };
      if (!isBank) validFairValues.push(intrinsic_per);
    }

    // 5. DCF
    if (!isBank && fcf_per_share && fcf_per_share > 0) {
      intrinsic_dcf = (fcf_per_share * 1.05) / (0.12 - 0.05);
      methods.dcf = {
        name: 'DCF (FCF)',
        value: intrinsic_dcf,
        color: '#ec4899' // pink
      };
      validFairValues.push(intrinsic_dcf);
    }

    // Calculate Fair Value with Sector Router
    let rule = SECTOR_RULES[sector] || SECTOR_RULES["DEFAULT"];
    
    // Check if sector matches any key dynamically
    for (const key in SECTOR_RULES) {
      if (sector.toLowerCase().includes(key.toLowerCase())) {
        rule = SECTOR_RULES[key];
        break;
      }
    }

    let activeWeights: any = {};
    let totalWeightUsed = 0;
    
    // Collect active methods based on what successfully computed > 0
    if (intrinsic_pbv > 0 && rule.pbv > 0) { activeWeights.pbv = rule.pbv; totalWeightUsed += rule.pbv; }
    if (intrinsic_ddm > 0 && rule.ddm > 0) { activeWeights.ddm = rule.ddm; totalWeightUsed += rule.ddm; }
    if (intrinsic_per > 0 && rule.per > 0) { activeWeights.per = rule.per; totalWeightUsed += rule.per; }
    if (intrinsic_dcf > 0 && rule.dcf > 0) { activeWeights.dcf = rule.dcf; totalWeightUsed += rule.dcf; }
    if (intrinsic_graham > 0 && rule.graham > 0) { activeWeights.graham = rule.graham; totalWeightUsed += rule.graham; }

    // Redistribute weights if total < 1 (e.g. DDM was 0 because no dividend)
    if (totalWeightUsed > 0 && totalWeightUsed < 1) {
      const multiplier = 1 / totalWeightUsed;
      for (const k in activeWeights) {
        activeWeights[k] = activeWeights[k] * multiplier;
      }
    }

    let fair_value = 0;
    if (totalWeightUsed > 0) {
      fair_value = 
        (intrinsic_pbv * (activeWeights.pbv || 0)) + 
        (intrinsic_ddm * (activeWeights.ddm || 0)) + 
        (intrinsic_per * (activeWeights.per || 0)) + 
        (intrinsic_dcf * (activeWeights.dcf || 0)) + 
        (intrinsic_graham * (activeWeights.graham || 0));
    } else {
      // Fallback to median if nothing matched weights (rare fallback)
      if (validFairValues.length > 0) {
        validFairValues.sort((a, b) => a - b);
        const mid = Math.floor(validFairValues.length / 2);
        fair_value = validFairValues.length % 2 !== 0 
          ? validFairValues[mid] 
          : (validFairValues[mid - 1] + validFairValues[mid]) / 2;
      }
    }

    // Calculate MOS
    let mos = 0;
    if (fair_value > 0 && price > 0) {
      mos = ((fair_value - price) / fair_value) * 100;
    }

    return NextResponse.json({
      simbol: ticker,
      sektor: sector,
      harga: price,
      eps,
      bvps,
      roe,
      dps,
      fcf_per_share,
      methods,
      fair_value,
      mos,
      applied_rule: activeWeights
    });

  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
