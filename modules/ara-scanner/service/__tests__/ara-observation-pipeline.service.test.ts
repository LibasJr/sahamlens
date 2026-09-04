import { describe, expect, it } from 'vitest';
import { buildAraObservation, idxTickSize, researchAraLimit, type AraMarketBar } from '../../index';

function bar(time:string, close:number, volume=1_000_000):AraMarketBar{return{time,open:close-1,high:close+2,low:close-2,close,volume}}
const daily=Array.from({length:21},(_,i)=>bar(new Date(Date.UTC(2026,7,1+i)).toISOString(),100+i,1_000_000));
const intra=[bar('2026-08-24T02:00:00Z',123,100_000),bar('2026-08-24T02:05:00Z',124,120_000),bar('2026-08-24T02:10:00Z',125,140_000),bar('2026-08-24T02:15:00Z',126,160_000)];

describe('ARA observation pipeline',()=>{
 it('mengunci fraksi harga dan batas riset regular-board',()=>{
  expect([199,200,499,500,1999,2000,4999,5000].map(idxTickSize)).toEqual([1,2,2,5,5,10,10,25]);
  expect(researchAraLimit(100)).toBe(135);
  expect(researchAraLimit(1000)).toBe(1250);
  expect(researchAraLimit(6000)).toBe(7200);
 });
 it('membentuk observasi nyata tetapi selalu NO_ACTION selama blocker resmi ada',()=>{
  const r=buildAraObservation({ticker:'TEST.JK',daily,intraday:intra,benchmarkDaily:daily,source:'Yahoo chart',fetchedAt:'2026-08-24T02:16:00Z'});
  expect(r).toMatchObject({status:'OBSERVATION_ONLY',action:'NO_ACTION',previousClose:119,lastPrice:126,nearAra:false});
  expect(r.diagnostics.availableWeight).toBe(0.8);
  expect(r.blockers).toContain('ORDER_BOOK_NOT_AVAILABLE');
  expect(r.blockers).toContain('OFFICIAL_TRADING_RESTRICTIONS_NOT_AVAILABLE');
 });
 it('menolak bar tidak valid dan histori kurang',()=>{
  expect(()=>buildAraObservation({ticker:'X.JK',daily:daily.slice(0,3),intraday:intra,source:'x',fetchedAt:'2026-08-24T02:16:00Z'})).toThrow('21 bar');
 });
});
