import type { BankFundamentalSnapshot, BankMetricEvidence, BankMetricKey } from '../repository/bank-fundamental.repository';

const REQUIRED_RESEARCH_METRICS: BankMetricKey[] = [
  'NIM_PCT','NPL_GROSS_PCT','CASA_PCT','CAR_PCT','LDR_PCT','COST_OF_CREDIT_PCT',
];

export interface BankFundamentalQuality {
  status: 'NO_DATA' | 'PARTIAL' | 'GOOD_COVERAGE';
  scoreEligible: false;
  coveragePct: number;
  presentMetrics: BankMetricKey[];
  missingResearchMetrics: BankMetricKey[];
  reportedCount: number;
  derivedCount: number;
  sourceTiers: string[];
  bases: string[];
  mixedBasis: boolean;
  pitSafe: boolean;
  warnings: string[];
}

export function assessBankFundamentalQuality(snapshot: BankFundamentalSnapshot | null): BankFundamentalQuality {
  if (!snapshot) {
    return { status:'NO_DATA',scoreEligible:false,coveragePct:0,presentMetrics:[],missingResearchMetrics:[...REQUIRED_RESEARCH_METRICS],reportedCount:0,derivedCount:0,sourceTiers:[],bases:[],mixedBasis:false,pitSafe:false,warnings:['Belum ada bank-specific evidence terverifikasi.'] };
  }
  const evidence: BankMetricEvidence[] = snapshot.evidence ?? [];
  const present = evidence.length
    ? [...new Set(evidence.map(x=>x.metricKey))]
    : ([
        snapshot.nimPct!=null?'NIM_PCT':null, snapshot.nplGrossPct!=null?'NPL_GROSS_PCT':null,
        snapshot.nplNetPct!=null?'NPL_NET_PCT':null, snapshot.casaPct!=null?'CASA_PCT':null,
        snapshot.carPct!=null?'CAR_PCT':null, snapshot.ldrPct!=null?'LDR_PCT':null,
        snapshot.costOfCreditPct!=null?'COST_OF_CREDIT_PCT':null, snapshot.costToIncomePct!=null?'COST_TO_INCOME_PCT':null,
        snapshot.coverageRatioPct!=null?'COVERAGE_RATIO_PCT':null, snapshot.ppopIdr!=null?'PPOP_IDR':null,
      ].filter(Boolean) as BankMetricKey[]);
  const missing = REQUIRED_RESEARCH_METRICS.filter(k=>!present.includes(k));
  const coveragePct = Math.round((present.length / 10) * 100);
  const reportedCount=evidence.filter(x=>x.evidenceType==='REPORTED').length;
  const derivedCount=evidence.filter(x=>x.evidenceType==='DERIVED').length;
  const sourceTiers=[...new Set(evidence.map(x=>x.sourceTier))];
  const bases=[...new Set(evidence.map(x=>x.basis))];
  const mixedBasis=bases.length>1 || bases.includes('DISCLOSED_UNSPECIFIED');
  const pitSafe = evidence.length > 0 && evidence.every(x => x.observedDate >= x.periodEnd && (!x.publishedAt || x.observedDate >= x.publishedAt.slice(0,10)));
  const warnings:string[]=[];
  if(missing.length) warnings.push(`Research metrics belum lengkap: ${missing.join(', ')}.`);
  if(mixedBasis) warnings.push('Basis disclosure campuran/tidak eksplisit; jangan agregasikan menjadi score tanpa normalisasi basis.');
  if(derivedCount>0) warnings.push(`${derivedCount} evidence merupakan DERIVED; bedakan dari angka REPORTED.`);
  if(!pitSafe) warnings.push('PIT guard belum terpenuhi untuk seluruh evidence.');
  warnings.push('Bank-specific metrics masih DATA_ONLY dan tidak mengubah LensScore.');
  return {
    status: present.length>=6 && !mixedBasis && pitSafe ? 'GOOD_COVERAGE' : 'PARTIAL',
    scoreEligible:false,coveragePct,presentMetrics:present,missingResearchMetrics:missing,
    reportedCount,derivedCount,sourceTiers,bases,mixedBasis,pitSafe,warnings,
  };
}
