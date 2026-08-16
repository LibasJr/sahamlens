import { describe, expect, it } from 'vitest';
import { assessBankFundamentalQuality } from '../bank-fundamental-quality.service';
import type { BankFundamentalSnapshot } from '../../repository/bank-fundamental.repository';

function snapshot(): BankFundamentalSnapshot {
  return {
    ticker:'BBNI.JK',observedDate:'2026-08-16',periodEnd:'2026-03-31',publishedAt:'2026-04-29T02:43:00.000Z',
    nimPct:null,nplGrossPct:1.9,nplNetPct:null,casaPct:null,carPct:18.5,ldrPct:83.5,costOfCreditPct:1.1,costToIncomePct:null,coverageRatioPct:null,ppopIdr:9_300_000_000_000,
    source:'MULTI_SOURCE_BANK_EVIDENCE',sourceUrl:'https://example.com',evidenceMode:'METRIC_EVIDENCE',
    evidence:[
      {metricKey:'NPL_GROSS_PCT',value:1.9,unit:'PCT',basis:'BANK_ONLY',evidenceType:'REPORTED',observedDate:'2026-08-16',periodEnd:'2026-03-31',publishedAt:'2026-04-29T02:43:00.000Z',sourceDocumentDate:'2026-04-29',sourceTier:'ISSUER_IR',sourceTitle:'Official IR',sourceUrl:'https://example.com',notes:null,evidenceFingerprint:'a'},
      {metricKey:'LDR_PCT',value:83.5,unit:'PCT',basis:'BANK_ONLY',evidenceType:'REPORTED',observedDate:'2026-08-16',periodEnd:'2026-03-31',publishedAt:'2026-04-29T02:43:00.000Z',sourceDocumentDate:'2026-04-29',sourceTier:'ISSUER_IR',sourceTitle:'Official IR',sourceUrl:'https://example.com',notes:null,evidenceFingerprint:'b'},
      {metricKey:'CAR_PCT',value:18.5,unit:'PCT',basis:'BANK_ONLY',evidenceType:'REPORTED',observedDate:'2026-08-16',periodEnd:'2026-03-31',publishedAt:'2026-04-29T02:43:00.000Z',sourceDocumentDate:'2026-04-29',sourceTier:'ISSUER_IR',sourceTitle:'Official IR',sourceUrl:'https://example.com',notes:null,evidenceFingerprint:'c'},
      {metricKey:'COST_OF_CREDIT_PCT',value:1.1,unit:'PCT',basis:'BANK_ONLY',evidenceType:'REPORTED',observedDate:'2026-08-16',periodEnd:'2026-03-31',publishedAt:'2026-04-29T02:43:00.000Z',sourceDocumentDate:'2026-04-29',sourceTier:'ISSUER_IR',sourceTitle:'Official IR',sourceUrl:'https://example.com',notes:null,evidenceFingerprint:'d'},
    ],
  };
}

describe('assessBankFundamentalQuality',()=>{
  it('tetap DATA_ONLY/scoreEligible false walaupun evidence valid',()=>{
    const q=assessBankFundamentalQuality(snapshot());
    expect(q.scoreEligible).toBe(false);
    expect(q.pitSafe).toBe(true);
    expect(q.status).toBe('PARTIAL');
    expect(q.presentMetrics).toContain('NPL_GROSS_PCT');
  });
  it('menandai basis disclosure tidak eksplisit sebagai mixedBasis',()=>{
    const s=snapshot(); s.evidence[0].basis='DISCLOSED_UNSPECIFIED';
    const q=assessBankFundamentalQuality(s);
    expect(q.mixedBasis).toBe(true);
    expect(q.warnings.join(' ')).toContain('Basis disclosure');
  });
});
