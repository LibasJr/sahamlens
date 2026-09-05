import { ARA_SCANNER_POLICY } from '../config/ara-scanner-policy';

export interface AraMarketBar { time: string; open: number; high: number; low: number; close: number; volume: number }
export interface AraObservationInput {
  ticker: string;
  daily: AraMarketBar[];
  intraday: AraMarketBar[];
  benchmarkDaily?: AraMarketBar[];
  source: string;
  fetchedAt: string;
}
export interface AraObservation {
  ticker: string;
  status: 'OBSERVATION_ONLY';
  action: 'NO_ACTION';
  source: string;
  observedAt: string;
  previousClose: number;
  lastPrice: number;
  araLimit: number;
  distanceToAraPct: number;
  nearAra: boolean;
  components: { V: number | null; C: number | null; B: number | null; R: number | null; T: number | null; RS: number | null; S: null; K: null };
  diagnostics: { persistenceBars: number; volumeRatio: number | null; upperWickRatio: number | null; exhaustion: boolean; availableWeight: number };
  blockers: string[];
  /** Bukan blocker: di luar cakupan SahamLens secara desain. */
  outOfScope: string[];
  /** Wajib dinilai Agent Speed + manusia di platform broker sebelum eksekusi. */
  executionLayerChecksRequired: readonly string[];
}

function finitePositive(v: unknown): v is number { return typeof v === 'number' && Number.isFinite(v) && v > 0 }
function clip(v: number): number { return Math.max(0, Math.min(1, v)) }

/** IDX regular-board tick size. This does not claim the security is eligible for
 * regular-board ARA; trading-board/restriction verification remains a blocker. */
export function idxTickSize(price: number): number {
  if (price < 200) return 1;
  if (price < 500) return 2;
  if (price < 2_000) return 5;
  if (price < 5_000) return 10;
  return 25;
}

function floorToTick(price: number): number {
  const tick = idxTickSize(price);
  return Math.floor((price + 1e-9) / tick) * tick;
}

/** Research-only regular-board ARA bands. Never used for execution until a
 * versioned official-rule feed verifies board/status and the active rule set. */
export function researchAraLimit(previousClose: number): number {
  if (!finitePositive(previousClose)) throw new RangeError('previousClose wajib positif');
  const pct = previousClose <= 200 ? 0.35 : previousClose <= 5_000 ? 0.25 : 0.20;
  return floorToTick(previousClose * (1 + pct));
}

function validBar(b: AraMarketBar): boolean {
  return Number.isFinite(Date.parse(b.time)) && [b.open,b.high,b.low,b.close].every(finitePositive)
    && Number.isFinite(b.volume) && b.volume >= 0 && b.high >= Math.max(b.open,b.close) && b.low <= Math.min(b.open,b.close);
}
function returnPct(bars: AraMarketBar[], periods: number): number | null {
  if (bars.length <= periods) return null;
  const a=bars[bars.length-1-periods]?.close, z=bars[bars.length-1]?.close;
  return finitePositive(a)&&finitePositive(z) ? (z/a-1)*100 : null;
}

export function buildAraObservation(input: AraObservationInput): AraObservation {
  if (!input.daily.every(validBar) || !input.intraday.every(validBar)) throw new RangeError('Bar pasar tidak valid');
  if (input.daily.length < 21 || input.intraday.length < 2) throw new RangeError('Butuh minimal 21 bar harian dan 2 bar intraday');
  const daily=input.daily.slice().sort((a,b)=>Date.parse(a.time)-Date.parse(b.time));
  const intra=input.intraday.slice().sort((a,b)=>Date.parse(a.time)-Date.parse(b.time));
  const prev=daily[daily.length-2].close, latest=intra[intra.length-1], limit=researchAraLimit(prev);
  const avgVol=daily.slice(-21,-1).reduce((s,b)=>s+b.volume,0)/20;
  const elapsedBars=intra.length;
  const expectedFraction=clip(elapsedBars/72);
  const volumeRatio=avgVol>0&&expectedFraction>0 ? intra.reduce((s,b)=>s+b.volume,0)/(avgVol*expectedFraction) : null;
  const range=latest.high-latest.low;
  const closeLocation=range>0 ? clip((latest.close-latest.low)/range) : null;
  const upperWickRatio=range>0 ? clip((latest.high-Math.max(latest.open,latest.close))/range) : null;
  const threshold=prev*1.02;
  let persistenceBars=0; for(let i=intra.length-1;i>=0&&intra[i].close>=threshold;i--) persistenceBars++;
  const trAvg=daily.slice(-15,-1).reduce((s,b,i,a)=>s+Math.max(b.high-b.low,Math.abs(b.high-(daily[daily.length-16+i]?.close??b.close)),Math.abs(b.low-(daily[daily.length-16+i]?.close??b.close))),0)/14;
  const todayRange=Math.max(...intra.map(b=>b.high))-Math.min(...intra.map(b=>b.low));
  const stock5=returnPct(daily,5), bench5=input.benchmarkDaily?returnPct(input.benchmarkDaily,5):null;
  const components={
    V: volumeRatio==null?null:clip((volumeRatio-0.5)/1.5), C: closeLocation,
    B: clip(persistenceBars/4), R: trAvg>0?clip(todayRange/trAvg/2):null,
    T: volumeRatio==null?null:clip((volumeRatio-0.5)/1.5),
    RS: stock5==null||bench5==null?null:clip(0.5+(stock5-bench5)/20), S:null, K:null,
  };
  const weights=Object.fromEntries(ARA_SCANNER_POLICY.formula.components.map(x=>[x.key,x.weight]));
  const availableWeight=Object.entries(components).reduce((s,[k,v])=>s+(v==null?0:Number(weights[k]??0)),0);
  const exhaustion=(upperWickRatio??0)>=0.35 || (persistenceBars===0&&latest.high>=threshold);
  return {ticker:input.ticker,status:'OBSERVATION_ONLY',action:'NO_ACTION',source:input.source,observedAt:latest.time,
    previousClose:prev,lastPrice:latest.close,araLimit:limit,distanceToAraPct:(limit/latest.close-1)*100,nearAra:latest.close>=limit*0.95,
    components,diagnostics:{persistenceBars,volumeRatio,upperWickRatio,exhaustion,availableWeight:Math.round(availableWeight*100)/100},
    blockers:['OFFICIAL_TRADING_RESTRICTIONS_NOT_AVAILABLE','PRICE_CROSS_CHECK_NOT_AVAILABLE','CATALYST_NOT_VERIFIED'],
    // Bukan blocker: SahamLens adalah lapisan analisa, bukan venue eksekusi.
    outOfScope:['ORDER_BOOK_DEPTH','SPREAD','SLIPPAGE'],
    executionLayerChecksRequired:ARA_SCANNER_POLICY.investabilityChecks.executionLayer};
}
