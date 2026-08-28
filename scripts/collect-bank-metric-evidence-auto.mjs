#!/usr/bin/env node
/**
 * Automated bank metric evidence collector.
 *
 * Integrity policy:
 * - official issuer domains only (config allowlist);
 * - no search engine / aggregator in production;
 * - observed_date = date SahamLens actually collected the evidence;
 * - PDF text must be machine-readable through pdftotext (no OCR guessing);
 * - ambiguous/multiple values are quarantined, not guessed;
 * - conflicting values for ticker/period/basis/metric are quarantined;
 * - only high-confidence reported values are inserted to bank_metric_evidence;
 * - all accepted values remain DATA_ONLY; no LensScore adoption.
 */

import crypto from 'node:crypto';
import dns from 'node:dns';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import net from 'node:net';
import { fileURLToPath, pathToFileURL } from 'node:url';

dns.setDefaultResultOrder('ipv4first');
net.setDefaultAutoSelectFamily(false);
const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_PATH = path.join(ROOT, 'config', 'bank-fundamental-sources.json');
const TODAY = new Date().toISOString().slice(0, 10);
const RETRYABLE_HTTP = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_FETCH_ATTEMPTS = 4;
const USER_AGENT = 'SahamLensBankEvidenceCollector/1.0 (+https://sahamlens.id)';

const METRIC_SPECS = {
  NIM_PCT: { aliases: ['net interest margin', 'nim'], lo: -20, hi: 50 },
  NPL_GROSS_PCT: { aliases: ['npl gross', 'gross npl', 'non-performing loan ratio', 'non performing loan ratio', 'rasio kredit macet'], lo: 0, hi: 100 },
  NPL_NET_PCT: { aliases: ['npl net', 'net npl'], lo: 0, hi: 100 },
  CASA_PCT: { aliases: ['casa ratio', 'casa', 'current account & savings account', 'current account and savings account'], lo: 0, hi: 100 },
  CAR_PCT: { aliases: ['capital adequacy ratio', 'capital adequancy ratio', 'car', 'kpmm'], lo: 0, hi: 250 },
  LDR_PCT: { aliases: ['loan to deposit ratio', 'loan-to-deposit ratio', 'ldr', 'rasio pinjaman terhadap dpk'], lo: 0, hi: 400 },
  COST_OF_CREDIT_PCT: { aliases: ['cost of credit', 'credit cost', 'credit costs', 'coc'], lo: -20, hi: 100 },
  COST_TO_INCOME_PCT: { aliases: ['cost to income', 'cost-to-income', 'cir'], lo: 0, hi: 400 },
  COVERAGE_RATIO_PCT: { aliases: ['coverage ratio', 'npl coverage', 'loan loss coverage'], lo: 0, hi: 2000 },
};

const MONTHS = {
  jan:1,january:1,januari:1,feb:2,february:2,februari:2,mar:3,march:3,maret:3,apr:4,april:4,
  may:5,mei:5,jun:6,june:6,juni:6,jul:7,july:7,juli:7,aug:8,august:8,agustus:8,sep:9,september:9,
  oct:10,october:10,oktober:10,nov:11,november:11,dec:12,december:12,desember:12,
};

function parseArgs(argv) {
  const out = { confirm:false, tickers:null, maxDocs:null, keepFiles:false, list:false, year:null };
  for (let i=0;i<argv.length;i++) {
    const a=argv[i];
    if(a==='--confirm') out.confirm=true;
    else if(a==='--tickers') out.tickers=String(argv[++i]??'').split(',').map(x=>x.trim().toUpperCase()).filter(Boolean);
    else if(a==='--max-docs') out.maxDocs=Number(argv[++i]);
    else if(a==='--year') out.year=Number(argv[++i]);
    else if(a==='--keep-files') out.keepFiles=true;
    else if(a==='--list') out.list=true;
    else throw new Error(`Argumen tidak dikenal: ${a}`);
  }
  if(out.maxDocs!=null && (!Number.isInteger(out.maxDocs)||out.maxDocs<1||out.maxDocs>50)) throw new Error('--max-docs wajib 1..50');
  if(out.year!=null && (!Number.isInteger(out.year)||out.year<2010||out.year>2100)) throw new Error('--year tidak valid');
  return out;
}

function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
function decodeHtml(s){return String(s).replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>');}
export function htmlToText(html){
  return decodeHtml(String(html??''))
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'\n')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'\n')
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6])\b[^>]*>/gi,'\n')
    .replace(/<[^>]+>/g,' ')
    .replace(/\r/g,'')
    .split('\n').map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean).join('\n');
}

function safeUrl(raw, base){try{return new URL(decodeHtml(raw),base).toString();}catch{return null;}}
function hostAllowed(url, domains){try{const h=new URL(url).hostname.toLowerCase();return domains.some(d=>h===d||h.endsWith(`.${d}`));}catch{return false;}}

export function extractLinks(html, baseUrl){
  const out=[]; const seen=new Set(); const text=String(html??'');
  const re=/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for(const m of text.matchAll(re)){
    const url=safeUrl(m[1],baseUrl); if(!url||seen.has(url)) continue;
    seen.add(url); out.push({url,title:htmlToText(m[2]).slice(0,300)});
  }
  const bare=/(https?:\/\/[^\s"'<>]+(?:\.pdf(?:\?[^\s"'<>]*)?|\/api\/files\/\?[^\s"'<>]+))/gi;
  for(const m of text.matchAll(bare)){
    const url=safeUrl(m[1],baseUrl); if(!url||seen.has(url)) continue;
    seen.add(url); out.push({url,title:path.basename(new URL(url).pathname)});
  }
  return out;
}

function scoreDocument(link, cfg, year){
  const s=`${link.title} ${link.url}`.toLowerCase(); let score=0;
  for(const k of cfg.documentKeywords??[]) if(s.includes(String(k).toLowerCase())) score+=6;
  if(/\.pdf(?:\?|$)/i.test(link.url)||/\/api\/files\/\?/i.test(link.url)||/\/documents\//i.test(link.url)) score+=10;
  if(year && s.includes(String(year))) score+=8;
  if(/\b(q1|q2|q3|q4|1q|2q|3q|4q|1h|9m|fy)\s*\d{2,4}\b/i.test(s)) score+=8;
  if(/annual report|sustainability|gms|agm|dividend|bond|obligasi/i.test(s)) score-=15;
  return score;
}

function lastDayIso(year,month){return new Date(Date.UTC(year,month,0)).toISOString().slice(0,10);}
function normalizeYear(y){const n=Number(y); return n<100 ? (n>=70?1900+n:2000+n) : n;}
export function inferPeriodEnd(text){
  const s=String(text??'');
  const monthRe=new RegExp(`(?:as\\s+of|per|period(?:\\s+ending)?|as\\s+at)?\\s*(${Object.keys(MONTHS).join('|')})[\\s,.-]+(20\\d{2})`,'i');
  const mm=s.match(monthRe); if(mm) return lastDayIso(Number(mm[2]),MONTHS[mm[1].toLowerCase()]);
  const q=s.match(/\b(?:q([1-4])\s*[-/]?\s*(20\d{2})|([1-4])q\s*[-/]?\s*(\d{2,4})|(20\d{2})\s*[-/]?\s*q([1-4]))\b/i);
  if(q){const quarter=Number(q[1]??q[3]??q[6]); const y=normalizeYear(q[2]??q[4]??q[5]); return lastDayIso(y,quarter*3);}
  const h=s.match(/\b1h\s*[-/]?\s*(\d{2,4})\b/i); if(h) return lastDayIso(normalizeYear(h[1]),6);
  const m9=s.match(/\b9m\s*[-/]?\s*(\d{2,4})\b/i); if(m9) return lastDayIso(normalizeYear(m9[1]),9);
  const fy=s.match(/\bfy\s*[-/]?\s*(\d{2,4})\b/i); if(fy) return lastDayIso(normalizeYear(fy[1]),12);
  const d=s.match(/\b(20\d{2})[-/.](0?[1-9]|1[0-2])[-/.]([0-3]?\d)\b/); if(d) return `${d[1]}-${String(d[2]).padStart(2,'0')}-${String(d[3]).padStart(2,'0')}`;
  return null;
}

function parsePctValues(s){
  const vals=[]; for(const m of String(s).matchAll(/(-?\d{1,3}(?:[.,]\d{1,4})?)\s*%/g)){const v=Number(m[1].replace(',','.'));if(Number.isFinite(v)) vals.push(v);} return vals;
}
function parsePctSpans(s){
  const out=[];
  for(const m of String(s??'').matchAll(/(-?\d{1,3}(?:[.,]\d{1,4})?)\s*%/g)){
    const value=Number(m[1].replace(',','.'));
    if(Number.isFinite(value)) out.push({value,start:m.index??0,end:(m.index??0)+m[0].length});
  }
  return out;
}
function periodEndFromHeaderToken(token){
  const direct=inferPeriodEnd(token); if(direct) return direct;
  const m=String(token??'').match(/^([A-Za-z]+)[\s./-]+(\d{2})$/i);
  if(m&&MONTHS[m[1].toLowerCase()]) return lastDayIso(normalizeYear(m[2]),MONTHS[m[1].toLowerCase()]);
  return null;
}
function extractPeriodHeaderSpans(line){
  const text=String(line??''); const found=[];
  const patterns=[
    /\b(?:[1-4]Q|Q[1-4])\s*[-/]?\s*\d{2,4}\b/gi,
    /\b(?:1H|9M|FY)\s*[-/]?\s*\d{2,4}\b/gi,
    /\b(?:jan(?:uary|uari)?|feb(?:ruary|ruari)?|mar(?:ch|et)?|apr(?:il)?|may|mei|jun(?:e|i)?|jul(?:y|i)?|aug(?:ust)?|agustus|sep(?:tember)?|oct(?:ober)?|oktober|nov(?:ember)?|dec(?:ember)?|desember)[\s./-]+\d{2,4}\b/gi,
  ];
  for(const re of patterns){
    for(const m of text.matchAll(re)){
      const periodEnd=periodEndFromHeaderToken(m[0]); if(!periodEnd) continue;
      const start=m.index??0; const end=start+m[0].length;
      if(found.some(x=>x.start===start&&x.end===end)) continue;
      found.push({periodEnd,label:m[0],start,end});
    }
  }
  return found.sort((a,b)=>a.start-b.start);
}
function tablePeriodColumnValue(rawLines,valueLineIndex,periodEnd){
  if(!periodEnd) return null;
  const values=parsePctSpans(rawLines[valueLineIndex]??'');
  if(values.length<2) return null;
  for(let distance=1;distance<=8;distance++){
    const headerIndex=valueLineIndex-distance; if(headerIndex<0) break;
    const periods=extractPeriodHeaderSpans(rawLines[headerIndex]??'');
    if(periods.length<2||periods.length!==values.length) continue;
    const matches=periods.map((x,idx)=>x.periodEnd===periodEnd?idx:-1).filter(idx=>idx>=0);
    if(matches.length!==1) continue;
    const idx=matches[0];
    return {value:values[idx].value,header:String(rawLines[headerIndex]??'').trim(),periodLabel:periods[idx].label,distance};
  }
  return null;
}
function containsAlias(line,aliases){const l=line.toLowerCase(); return aliases.some(a=>{const aa=a.toLowerCase(); if(aa.length<=3) return new RegExp(`(?:^|[^a-z])${aa.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?:[^a-z]|$)`,'i').test(l); return l.includes(aa);});}

function excludedMetricContext(metricKey, text){
  const s=String(text??'').toLowerCase();
  // Net NPL Formation is a flow / formation metric, not the Net NPL ratio.
  if(metricKey==='NPL_NET_PCT' && /(?:net\s+npl|npl\s+net)\s+formation/.test(s)) return true;
  return false;
}

function flattenedTrendSeriesValue(metricKey, text){
  const s=String(text??'').replace(/\s+/g,' ').trim();
  if(metricKey!=='LDR_PCT') return null;
  // Some issuer PDFs contain two charts side by side. pdftotext flattens the
  // chart titles/series labels first and their headline values afterwards.
  // Resolve only the narrowly identifiable LDR-first layout; never generalize
  // this ordering heuristic to other metrics.
  const structure=/loan[-\s]to[-\s]deposit ratio[^%]{0,180}?trend[^%]{0,240}?net npl formation[^%]{0,180}?loan[-\s]at[-\s]risk ratio trend[^%]{0,220}?ldr\s*\(bank[-\s]only\)[^%]{0,180}?net npl formation\s*\(bank[-\s]only\)[^%]{0,180}?lar ratio\s*\(bank[-\s]only\)/i;
  if(!structure.test(s)) return null;
  const values=parsePctValues(s);
  if(values.length<2) return null;
  const value=values[0];
  if(!Number.isFinite(value)) return null;
  return {value, method:'FLATTENED_TREND_LDR_FIRST_SERIES'};
}
function badContext(s){return /industry|peer|guidance|target|forecast|consensus|estimate|average|avg\.|5y|10y/i.test(s);}
function inferBasis(s){if(/bank[-\s]*only|bank[-\s]*entity|individual|individu/i.test(s)) return 'BANK_ONLY';if(/consolidated|konsolidas/i.test(s)) return 'CONSOLIDATED';return 'DISCLOSED_UNSPECIFIED';}
function escapeRegex(s){return String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
function periodTokens(periodEnd){
  const m=String(periodEnd??'').match(/^(20\d{2})-(0[1-9]|1[0-2])-([0-3]\d)$/); if(!m) return [];
  const year=Number(m[1]), month=Number(m[2]), yy=String(year).slice(-2);
  if(month===3) return [`1Q${yy}`,`Q1 ${year}`,`Q1-${year}`,`March ${year}`,`Maret ${year}`,`Mar-${yy}`];
  if(month===6) return [`2Q${yy}`,`Q2 ${year}`,`Q2-${year}`,`1H${yy}`,`1H ${year}`,`June ${year}`,`Juni ${year}`,`Jun-${yy}`];
  if(month===9) return [`3Q${yy}`,`Q3 ${year}`,`Q3-${year}`,`9M${yy}`,`9M ${year}`,`September ${year}`,`Sep-${yy}`];
  if(month===12) return [`4Q${yy}`,`Q4 ${year}`,`Q4-${year}`,`FY${yy}`,`FY ${year}`,`December ${year}`,`Desember ${year}`,`Dec-${yy}`];
  return [];
}
function periodTaggedValue(s,periodEnd){
  const text=String(s??''); const found=[];
  for(const token of periodTokens(periodEnd)){
    const t=escapeRegex(token).replace(/\\ /g,'\\s*');
    const after=new RegExp(`(-?\\d{1,3}(?:[.,]\\d{1,4})?)\\s*%\\s*(?:for|at|as\\s+of|per|in)?\\s*${t}(?:\\b|$)`,'ig');
    const before=new RegExp(`${t}(?:\\b|$)[^%\\n]{0,40}?(-?\\d{1,3}(?:[.,]\\d{1,4})?)\\s*%`,'ig');
    for(const re of [after,before]) for(const m of text.matchAll(re)){const v=Number(m[1].replace(',','.'));if(Number.isFinite(v))found.push(v);}
  }
  const uniq=[...new Set(found.map(v=>Number(v.toFixed(6))))]; return uniq.length===1?uniq[0]:null;
}

/**
 * @typedef {Object} MetricExtractionOptions
 * @property {string} [ticker]
 * @property {string} [sourceTitle]
 * @property {string} [sourceUrl]
 * @property {string|null} [periodEnd]
 * @property {string} [defaultBasis]
 */

/**
 * @param {string} text
 * @param {MetricExtractionOptions} [options]
 */
export function extractMetricCandidates(text, options={}){
  const {ticker='TEST.JK',sourceTitle='fixture',sourceUrl='https://example.invalid',periodEnd=null,defaultBasis='DISCLOSED_UNSPECIFIED'}=options;
  const rawLines=String(text??'').replace(/\r/g,'').split('\n').map(x=>x.replace(/\t/g,'    ').replace(/\s+$/g,'')).filter(x=>x.trim().length>0);
  const lines=rawLines.map(x=>x.replace(/\s+/g,' ').trim());
  const out=[];
  for(const [metricKey,spec] of Object.entries(METRIC_SPECS)){
    for(let i=0;i<lines.length;i++){
      const line=lines[i]; if(!containsAlias(line,spec.aliases)) continue;
      if(excludedMetricContext(metricKey,line)) continue;
      const local=[line,lines[i+1]??'',lines[i+2]??''].filter(Boolean);
      const oneLine=parsePctValues(line);
      const next=parsePctValues(lines[i+1]??'');
      let values=[]; let method=''; let confidence=0; let periodTagged=false; let tableResolved=null;
      if(oneLine.length===1){values=oneLine;method='EXACT_LABEL_SINGLE_VALUE';confidence=0.99;}
      else if(oneLine.length===0&&next.length===1){values=next;method='LABEL_NEXT_LINE_SINGLE_VALUE';confidence=0.97;}
      else {
        const excerpt=local.join(' '); const excerptVals=parsePctValues(excerpt);
        if(excerptVals.length===1){values=excerptVals;method='LOCAL_WINDOW_SINGLE_VALUE';confidence=0.94;}
        else if(excerptVals.length>1){
          const tagged=periodTaggedValue(excerpt,periodEnd);
          if(tagged!=null&&!badContext(line)){values=[tagged];method='PERIOD_TAGGED_VALUE';confidence=0.985;periodTagged=true;}
          else {
            const valueLineIndex=oneLine.length>1?i:(oneLine.length===0&&next.length>1?i+1:i);
            tableResolved=tablePeriodColumnValue(rawLines,valueLineIndex,periodEnd);
            if(tableResolved&&!badContext(line)){
              values=[tableResolved.value]; method='TABLE_PERIOD_COLUMN_VALUE'; confidence=0.98; periodTagged=true;
            } else {
              const trendResolved=flattenedTrendSeriesValue(metricKey,excerpt);
              if(trendResolved&&!badContext(line)){
                values=[trendResolved.value]; method=trendResolved.method; confidence=0.975;
              } else {
                out.push({ticker,periodEnd,metricKey,value:null,unit:'PCT',basis:(inferBasis(excerpt)==='DISCLOSED_UNSPECIFIED'?defaultBasis:inferBasis(excerpt)),confidence:0,extractionMethod:'AMBIGUOUS_MULTIPLE_VALUES',sourceTitle,sourceUrl,rawExcerpt:excerpt,status:'QUARANTINED',reason:`multiple_values:${excerptVals.join(',')}`});
                break;
              }
            }
          }
        } else continue;
      }
      const value=values[0];
      const context=[tableResolved?.header??'',lines[i-1]??'',...local].filter(Boolean).join(' | ');
      if((periodTagged?badContext(line):badContext(context))){
        out.push({ticker,periodEnd,metricKey,value,unit:'PCT',basis:(inferBasis(context)==='DISCLOSED_UNSPECIFIED'?defaultBasis:inferBasis(context)),confidence:0.2,extractionMethod:method,sourceTitle,sourceUrl,rawExcerpt:context,status:'QUARANTINED',reason:'forecast_or_peer_context'}); break;
      }
      if(value<spec.lo||value>spec.hi){
        out.push({ticker,periodEnd,metricKey,value,unit:'PCT',basis:(inferBasis(context)==='DISCLOSED_UNSPECIFIED'?defaultBasis:inferBasis(context)),confidence:0,extractionMethod:method,sourceTitle,sourceUrl,rawExcerpt:context,status:'QUARANTINED',reason:`outside_guardrail:${spec.lo}..${spec.hi}`}); break;
      }
      out.push({ticker,periodEnd,metricKey,value,unit:'PCT',basis:(inferBasis(context)==='DISCLOSED_UNSPECIFIED'?defaultBasis:inferBasis(context)),confidence,extractionMethod:method,sourceTitle,sourceUrl,rawExcerpt:context,status:'CANDIDATE',reason:null}); break;
    }
  }
  return out;
}

function fingerprint(r){return crypto.createHash('sha256').update([r.ticker,r.periodEnd,r.observedDate,r.metricKey,String(r.value),r.unit,r.basis,'REPORTED','ISSUER_IR',r.sourceTitle,r.sourceUrl,r.rawExcerpt??''].join('|')).digest('hex');}
function runId(){return `bank-auto-${new Date().toISOString().replace(/[-:.TZ]/g,'').slice(0,14)}-${crypto.randomBytes(4).toString('hex')}`;}

async function fetchWithRetry(url,{asBuffer=false}={}){
  let lastErr=null;
  for(let attempt=1;attempt<=MAX_FETCH_ATTEMPTS;attempt++){
    const ctrl=new AbortController(); const t=setTimeout(()=>ctrl.abort(),25_000);
    try{
      const res=await fetch(url,{headers:{'user-agent':USER_AGENT,'accept':asBuffer?'application/pdf,application/octet-stream,*/*':'text/html,application/xhtml+xml,*/*'},redirect:'follow',signal:ctrl.signal});
      if(!res.ok){if(RETRYABLE_HTTP.has(res.status)&&attempt<MAX_FETCH_ATTEMPTS){await sleep(attempt*1500);continue;} throw new Error(`HTTP ${res.status} ${url}`);}
      const finalUrl=res.url||url;
      return {finalUrl,contentType:res.headers.get('content-type')??'',body:asBuffer?Buffer.from(await res.arrayBuffer()):await res.text()};
    }catch(e){lastErr=e;if(attempt<MAX_FETCH_ATTEMPTS){await sleep(attempt*1500);continue;}throw e;}finally{clearTimeout(t);}
  }
  throw lastErr??new Error(`fetch gagal ${url}`);
}

async function pdfToText(buffer,tmpDir,name){
  const pdf=path.join(tmpDir,`${name}.pdf`), txt=path.join(tmpDir,`${name}.txt`); await fs.writeFile(pdf,buffer);
  try{await execFileAsync('pdftotext',['-layout','-enc','UTF-8',pdf,txt],{timeout:60_000,maxBuffer:4*1024*1024});}
  catch(e){if(e?.code==='ENOENT') throw new Error('pdftotext tidak ditemukan. Install: sudo apt-get install -y poppler-utils'); throw e;}
  const out=await fs.readFile(txt,'utf8'); if(out.replace(/\s/g,'').length<100) throw new Error('PDF tidak menghasilkan text layer yang cukup; OCR sengaja tidak dilakukan'); return out;
}

async function discoverForBank(ticker,cfg,{year,maxDocs}){
  const docs=[]; const pageSeen=new Set(); let pagesChecked=0;
  const queue=(cfg.seedPages??[]).map(x=>({...x,depth:0}));
  while(queue.length){
    const seed=queue.shift(); if(pageSeen.has(seed.url)) continue; pageSeen.add(seed.url); pagesChecked++;
    const fetched=await fetchWithRetry(seed.url); if(!hostAllowed(fetched.finalUrl,cfg.domains)) throw new Error(`${ticker}: redirect keluar domain resmi: ${fetched.finalUrl}`);
    const titleMatch=String(fetched.body).match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title=(titleMatch?htmlToText(titleMatch[1]):htmlToText(fetched.body).split('\n')[0]||seed.url).slice(0,240);
    if(seed.kind==='HTML_METRICS') docs.push({url:fetched.finalUrl,title,kind:'HTML',html:fetched.body,score:50});
    const links=extractLinks(fetched.body,fetched.finalUrl).filter(x=>hostAllowed(x.url,cfg.domains));
    for(const link of links){
      const score=scoreDocument(link,cfg,year);
      const isPdf=/\.pdf(?:\?|$)/i.test(link.url)||/\/api\/files\/\?/i.test(link.url)||/\/documents\/.*\.pdf/i.test(link.url);
      if(isPdf&&score>0) docs.push({...link,kind:'PDF',score});
      else if(seed.depth<1&&score>=10&&!pageSeen.has(link.url)) queue.push({url:link.url,kind:'DOCUMENT_LIST',depth:seed.depth+1});
    }
  }
  const unique=[]; const seen=new Set();
  for(const d of docs.sort((a,b)=>b.score-a.score)){if(seen.has(d.url))continue;seen.add(d.url);unique.push(d);if(unique.length>=maxDocs)break;}
  return {docs:unique,pagesChecked};
}

function resolvePeriod(docTitle,text,kind='PDF'){
  const fromTitle=inferPeriodEnd(docTitle); if(fromTitle) return fromTitle;
  if(kind==='HTML'){
    // Live investor pages contain many historical/news dates. Only accept an
    // explicit snapshot phrase instead of grabbing an arbitrary month/year.
    const s=String(text??'');
    const explicit=s.match(/(?:as\s+of|as\s+at|per|period\s+ending)\s+([A-Za-z]+)[\s,.-]+(20\d{2})/i);
    if(explicit) return inferPeriodEnd(`As of ${explicit[1]} ${explicit[2]}`);
    return null;
  }
  return inferPeriodEnd(String(text));
}

function inferDocumentBasis(text){
  const s=String(text??'');
  if(/(?:as\s+of|per)[^\n]{0,80}(?:bank\s*only|bank\s*entity|individual|individu)/i.test(s)) return 'BANK_ONLY';
  if(/(?:as\s+of|per)[^\n]{0,80}(?:consolidated|konsolidas)/i.test(s)) return 'CONSOLIDATED';
  return 'DISCLOSED_UNSPECIFIED';
}

function reconcileCandidates(candidates){
  const grouped=new Map();
  // One automated evidence value per ticker/period/metric. If BANK_ONLY and
  // CONSOLIDATED disagree, the collector must not silently choose one.
  for(const c of candidates){if(c.status!=='CANDIDATE'||c.value==null||!c.periodEnd) continue; const key=[c.ticker,c.periodEnd,c.metricKey].join('|'); const arr=grouped.get(key)??[];arr.push(c);grouped.set(key,arr);}
  const accepted=[]; const quarantine=candidates.filter(c=>c.status==='QUARANTINED'||!c.periodEnd).map(c=>({...c,status:'QUARANTINED',reason:c.reason??(!c.periodEnd?'period_end_unresolved':'quarantined')}));
  const basisPriority={BANK_ONLY:3,CONSOLIDATED:3,DISCLOSED_UNSPECIFIED:1};
  for(const arr of grouped.values()){
    const values=[...new Set(arr.map(x=>Number(x.value).toFixed(4)))];
    if(values.length>1){for(const x of arr) quarantine.push({...x,status:'QUARANTINED',reason:`conflicting_official_values:${values.join('/')}`});continue;}
    const best=[...arr].sort((a,b)=>(basisPriority[b.basis]??0)-(basisPriority[a.basis]??0)||b.confidence-a.confidence)[0];
    if(best.confidence<0.94){quarantine.push({...best,status:'QUARANTINED',reason:'confidence_below_threshold'});continue;}
    accepted.push(best);
  }
  return {accepted,quarantine};
}

async function dbClient(){if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL wajib untuk --confirm'); const pg=await import('pg'); const Client=pg.Client??pg.default?.Client; return new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:15_000});}

async function persistRun({runId:id,accepted,quarantine,summary,tickers,confirm}){
  const db=await dbClient(); await db.connect();
  try{
    await db.query('BEGIN');
    await db.query(`INSERT INTO bank_metric_collection_runs(run_id,mode,status,tickers,source_pages_checked,documents_discovered,documents_parsed,evidence_candidates,detail)
      VALUES($1,$2,'RUNNING',$3,$4,$5,$6,$7,$8::jsonb)`,[id,confirm?'CONFIRM':'DRY_RUN',tickers,summary.pagesChecked,summary.docsDiscovered,summary.docsParsed,accepted.length+quarantine.length,JSON.stringify({collectorVersion:2, parserPolicy:'period-column deterministic; ambiguous/conflict/forecast/guardrail remain quarantined'})]);
    let inserted=0,existing=0;
    for(const r of accepted){
      const observedDate=TODAY;
      // Idempotency across collection days: observed_date is intentionally TODAY,
      // so fingerprint alone would change tomorrow. Reuse an existing evidence row
      // when the official source/value/basis is identical.
      const prior=await db.query(`SELECT evidence_fingerprint
        FROM bank_metric_evidence
        WHERE ticker=$1 AND period_end=$2::date AND metric_key=$3
          AND value=$4::numeric AND unit=$5 AND basis=$6
          AND evidence_type='REPORTED' AND source_tier='ISSUER_IR' AND source_url=$7
        ORDER BY observed_date ASC, created_at ASC LIMIT 1`,[r.ticker,r.periodEnd,r.metricKey,r.value,r.unit,r.basis,r.sourceUrl]);
      let fp=prior.rows[0]?.evidence_fingerprint?String(prior.rows[0].evidence_fingerprint):fingerprint({...r,observedDate});
      let status='EXISTING';
      if(prior.rows.length===0){
        const q=await db.query(`INSERT INTO bank_metric_evidence
          (ticker,period_end,observed_date,published_at,source_document_date,metric_key,value,unit,basis,evidence_type,source_tier,source_title,source_url,notes,evidence_fingerprint)
          VALUES($1,$2,$3,NULL,NULL,$4,$5,$6,$7,'REPORTED','ISSUER_IR',$8,$9,$10,$11)
          ON CONFLICT(evidence_fingerprint) DO NOTHING`,[r.ticker,r.periodEnd,observedDate,r.metricKey,r.value,r.unit,r.basis,r.sourceTitle,r.sourceUrl,`AUTO_COLLECTED:${r.extractionMethod}; confidence=${r.confidence}; observed_date adalah tanggal collector melihat evidence.`,fp]);
        status=(q.rowCount??0)===1?'INGESTED':'EXISTING';
      }
      if(status==='INGESTED')inserted++;else existing++;
      await db.query(`INSERT INTO bank_metric_collection_candidates(run_id,ticker,period_end,observed_date,metric_key,value,unit,basis,confidence,extraction_method,status,source_title,source_url,source_tier,raw_excerpt,evidence_fingerprint)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'ISSUER_IR',$14,$15)`,[id,r.ticker,r.periodEnd,observedDate,r.metricKey,r.value,r.unit,r.basis,r.confidence,r.extractionMethod,status,r.sourceTitle,r.sourceUrl,r.rawExcerpt,fp]);
    }
    for(const r of quarantine){await db.query(`INSERT INTO bank_metric_collection_candidates(run_id,ticker,period_end,observed_date,metric_key,value,unit,basis,confidence,extraction_method,status,reason,source_title,source_url,source_tier,raw_excerpt)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'QUARANTINED',$11,$12,$13,'ISSUER_IR',$14)`,[id,r.ticker,r.periodEnd,TODAY,r.metricKey,r.value,r.unit,r.basis,r.confidence,r.extractionMethod,r.reason,r.sourceTitle,r.sourceUrl,r.rawExcerpt]);}
    const status=quarantine.length || (summary.sourceErrors?.length ?? 0) ? 'PARTIAL':'SUCCESS';
    await db.query(`UPDATE bank_metric_collection_runs SET status=$2,evidence_inserted=$3,evidence_existing=$4,quarantined=$5,finished_at=now(),detail=$6::jsonb WHERE run_id=$1`,[id,status,inserted,existing,quarantine.length,JSON.stringify({...summary,accepted:accepted.length})]);
    await db.query('COMMIT'); return {inserted,existing,status};
  }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{await db.end().catch(()=>{});}
}

async function main(){
  const args=parseArgs(process.argv.slice(2)); const cfg=JSON.parse(await fs.readFile(CONFIG_PATH,'utf8')); const all=Object.keys(cfg.banks); const tickers=args.tickers?.length?args.tickers:all; for(const t of tickers)if(!cfg.banks[t])throw new Error(`Ticker belum punya official-source registry: ${t}`);
  const year=args.year??new Date().getUTCFullYear(); const maxDocs=args.maxDocs??Number(cfg.policy?.defaultMaxDocumentsPerTicker??12); const tmpDir=await fs.mkdtemp(path.join(os.tmpdir(),'sahamlens-bank-auto-')); const allCandidates=[]; const sourceErrors=[]; let pagesChecked=0,docsDiscovered=0,docsParsed=0;
  console.log('Bank Fundamental Official-Source Auto Collector'); console.log(`Mode      : ${args.confirm?'CONFIRM':'DRY RUN'}`); console.log(`Ticker    : ${tickers.join(', ')}`); console.log(`Year      : ${year}`); console.log('Policy    : OFFICIAL DOMAIN ONLY / DATA_ONLY / ambiguous => quarantine');
  try{
    for(const ticker of tickers){
      const bank=cfg.banks[ticker]; console.log(`\n=== ${ticker} ===`);
      try {
        const discovered=await discoverForBank(ticker,bank,{year,maxDocs}); pagesChecked+=discovered.pagesChecked; docsDiscovered+=discovered.docs.length;
        console.log(`source pages checked: ${discovered.pagesChecked}; documents selected: ${discovered.docs.length}`);
        if(args.list){for(const d of discovered.docs)console.log(`  ${d.kind.padEnd(4)} score=${String(d.score).padStart(2)} ${d.title} :: ${d.url}`);continue;}
        let idx=0;
        for(const doc of discovered.docs){idx++; try{
          let text,finalUrl=doc.url;
          if(doc.kind==='HTML'){text=htmlToText(doc.html);}
          else {const f=await fetchWithRetry(doc.url,{asBuffer:true}); finalUrl=f.finalUrl; if(!hostAllowed(finalUrl,bank.domains))throw new Error(`redirect keluar domain resmi: ${finalUrl}`); text=await pdfToText(f.body,tmpDir,`${ticker.replace('.JK','')}-${idx}`);}
          docsParsed++; const periodEnd=resolvePeriod(doc.title,text,doc.kind); const cands=extractMetricCandidates(text,{ticker,sourceTitle:doc.title||finalUrl,sourceUrl:finalUrl,periodEnd,defaultBasis:inferDocumentBasis(text)}); allCandidates.push(...cands);
          console.log(`  parsed ${doc.title.slice(0,70)} -> period=${periodEnd??'UNRESOLVED'} candidates=${cands.length}`);
        }catch(e){console.warn(`  WARN skip ${doc.title}: ${e instanceof Error?e.message:String(e)}`);}
        }
      } catch (e) {
        const error=e instanceof Error?e.message:String(e);
        sourceErrors.push({ticker,error});
        console.warn(`  SOURCE ERROR ${ticker}: ${error}`);
      }
    }
    if(args.list){console.log('\nLIST ONLY - tidak ada parse/DB write.');return;}
    const {accepted,quarantine}=reconcileCandidates(allCandidates);
    const summary={pagesChecked,docsDiscovered,docsParsed,sourceErrors};
    console.log('\n=== QUALITY SUMMARY ==='); console.log(`Docs discovered : ${docsDiscovered}`); console.log(`Docs parsed     : ${docsParsed}`); console.log(`Accepted        : ${accepted.length}`); console.log(`Quarantined     : ${quarantine.length}`); console.log(`Source errors   : ${sourceErrors.length}`);
    for(const r of accepted) console.log(`  ACCEPT ${r.ticker} ${r.periodEnd} ${r.metricKey}=${r.value}% basis=${r.basis} conf=${r.confidence} source=${r.sourceTitle}`);
    for(const r of quarantine.slice(0,20)) console.log(`  HOLD   ${r.ticker} ${r.periodEnd??'NO_PERIOD'} ${r.metricKey} reason=${r.reason}`);
    if(!args.confirm){console.log('\nDRY RUN - database tidak ditulis. Tambahkan --confirm hanya setelah quality summary masuk akal.'); const marker={status:'DRY_RUN',accepted:accepted.length,quarantined:quarantine.length,...summary}; console.log(`SAHAMLENS_BANK_COLLECT_RESULT=${JSON.stringify(marker)}`);return;}
    const id=runId(); const persisted=await persistRun({runId:id,accepted,quarantine,summary,tickers,confirm:true}); const marker={status:persisted.status,runId:id,inserted:persisted.inserted,existing:persisted.existing,accepted:accepted.length,quarantined:quarantine.length,...summary}; console.log(`\nDB: ${persisted.inserted} evidence baru, ${persisted.existing} sudah ada, ${quarantine.length} quarantine.`); console.log('LensScore tetap OFF untuk bank-specific evidence.'); console.log(`SAHAMLENS_BANK_COLLECT_RESULT=${JSON.stringify(marker)}`);
  }finally{if(args.keepFiles)console.log(`Temp files dipertahankan: ${tmpDir}`);else await fs.rm(tmpDir,{recursive:true,force:true}).catch(()=>{});}
}

const isCli = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if(isCli){main().catch(e=>{console.error(`BANK-AUTO-COLLECTOR GAGAL: ${e instanceof Error?e.stack??e.message:String(e)}`);process.exitCode=1;});}
