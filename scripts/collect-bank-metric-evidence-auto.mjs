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
export function jakartaDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(value);
  const get = (type) => parts.find((x) => x.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
const OBSERVED_DATE = jakartaDate();
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
export function canonicalSourceUrl(raw){
  try{
    const u=new URL(String(raw));
    u.hash='';
    for(const key of ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','fbclid','gclid']) u.searchParams.delete(key);
    u.searchParams.sort();
    return u.toString();
  }catch{return String(raw??'');}
}

function isGenericDocumentLinkTitle(title){
  const t=String(title??'').replace(/\s+/g,' ').trim();
  return !t || /^(?:view|download|open|lihat|unduh|pdf|document|file|detail|read more|selengkapnya)$/i.test(t);
}

function cleanContextDocumentTitle(value){
  let t=String(value??'').replace(/\s+/g,' ').trim();
  if(!t) return '';
  t=t.replace(/\s*[|•·-]\s*\d+(?:[.,]\d+)?\s*(?:KB|MB|GB)\b.*$/i,'').trim();
  t=t.replace(/\s*[|•·-]\s*(?:select|view|download|open|lihat|unduh)\s*$/i,'').trim();
  return t.slice(0,300);
}

function contextualDocumentTitle(html, anchorStart, anchorAttrs, anchorInner, url){
  const inner=cleanContextDocumentTitle(htmlToText(anchorInner));
  if(!isGenericDocumentLinkTitle(inner)) return inner;

  const attrs=String(anchorAttrs??'');
  const attrCandidates=[];
  for(const name of ['aria-label','title','data-title','data-name','data-file-name','download']){
    const re=new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`,'i');
    const m=attrs.match(re);
    if(m?.[1]) attrCandidates.push(cleanContextDocumentTitle(decodeHtml(m[1])));
  }
  for(const candidate of attrCandidates){
    if(!isGenericDocumentLinkTitle(candidate) && candidate.length>=4) return candidate;
  }

  // BCA and several issuer IR pages use a generic button text (for example
  // "View") while the actual report name lives in the surrounding card/row.
  // Inspect only the local DOM text before the anchor and require document or
  // period cues; this avoids inheriting unrelated page headings/navigation.
  const start=Math.max(0,Number(anchorStart??0)-2200);
  const localHtml=String(html??'').slice(start,Number(anchorStart??0));
  const lines=htmlToText(localHtml).split('\n').map(cleanContextDocumentTitle).filter(Boolean);
  const positive=/(?:corporate\s+presentation|financial\s+(?:report|statement)|capital\s+and\s+risk\s+exposure|risk\s+exposure|analyst\s+meeting|quarterly|unaudited|audited|published\s+financial|\b(?:[1-4]q|q[1-4]|1h|9m|fy)\s*[-/]?\s*\d{2,4}\b|\b20\d{2}\b)/i;
  const reject=/^(?:file name|file size|select|filter|year|apply|reset filter|download clear|total file(?: size)?)$/i;
  for(let i=lines.length-1;i>=0;i--){
    const candidate=lines[i];
    if(candidate.length<4||candidate.length>300||reject.test(candidate)||isGenericDocumentLinkTitle(candidate)) continue;
    if(positive.test(candidate)) return candidate;
  }

  try{
    const u=new URL(url);
    const fromUrl=cleanContextDocumentTitle(decodeURIComponent(path.basename(u.pathname)));
    if(fromUrl&&!isGenericDocumentLinkTitle(fromUrl)) return fromUrl;
  }catch{}
  return inner||'Official document';
}

export function extractLinks(html, baseUrl){
  const out=[]; const seen=new Set(); const text=String(html??'');
  const re=/<a\b([^>]*)href\s*=\s*["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi;
  for(const m of text.matchAll(re)){
    const url=safeUrl(m[2],baseUrl); if(!url||seen.has(url)) continue;
    const attrs=`${m[1]??''} ${m[3]??''}`;
    const title=contextualDocumentTitle(text,m.index??0,attrs,m[4],url);
    seen.add(url); out.push({url,title});
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
  const vals=[]; for(const m of String(s).matchAll(/(-?(?:\d{1,4}(?:[.,]\d{1,4})?|[.,]\d{1,4}))\s*%/g)){const v=Number(m[1].replace(',','.'));if(Number.isFinite(v)) vals.push(v);} return vals;
}
function parsePctSpans(s){
  const out=[];
  for(const m of String(s??'').matchAll(/(-?(?:\d{1,4}(?:[.,]\d{1,4})?|[.,]\d{1,4}))\s*%/g)){
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

function excludedMetricReason(metricKey, text){
  const s=String(text??'').toLowerCase();
  // Net NPL Formation is a flow / formation metric, not the Net NPL ratio.
  if(metricKey==='NPL_NET_PCT' && /(?:net\s+npl|npl\s+net)\s+formation/.test(s)) return 'metric_definition_mismatch:npl_formation';
  // "CASA growth" is deposit growth, not the CASA-to-funding ratio.
  if(metricKey==='CASA_PCT' && /(?:strong\s+)?casa\s+growth|growth\s+(?:of\s+)?casa/.test(s)) return 'metric_definition_mismatch:casa_growth';
  // Canonical CoC in SahamLens is the gross/disclosed CoC. "after recovery"
  // is a different definition and must never silently overwrite gross CoC.
  if(metricKey==='COST_OF_CREDIT_PCT' && /(?:coc|cost of credit|credit cost)[^\n]{0,40}after recovery/.test(s) && !/(?:coc|cost of credit|credit cost)[^\n]{0,25}gross/.test(s)) return 'metric_definition_mismatch:coc_after_recovery';
  // LAR coverage is not NPL coverage. A generic coverage alias must never
  // convert the Loan-at-Risk coverage series into NPL coverage evidence.
  if(metricKey==='COVERAGE_RATIO_PCT' && /\blar\s+coverage\b/.test(s) && !/\bnpl\s+coverage\b/.test(s)) return 'metric_definition_mismatch:lar_coverage';
  return null;
}
function excludedMetricContext(metricKey,text){return excludedMetricReason(metricKey,text)!=null;}

const SEGMENT_BOUNDARIES = [
  'casa to total funding','casa ratio','casa','loan to deposit ratio','loan-to-deposit ratio','ldr',
  'capital adequacy ratio','car','cost to income','cost-to-income','cir','npl coverage','coverage ratio',
  'lar coverage','lar','roa','roe','loan yield','net npl formation','gross npl','npl gross','npl net','net npl',
  'cost of credit','credit cost','coc (after recovery)','coc (gross)','nim','net interest margin',
];

function aliasIndex(text, alias, from=0){
  const hay=String(text??'').toLowerCase(); const needle=String(alias??'').toLowerCase();
  if(!needle) return -1;
  if(needle.length<=3){
    const re=new RegExp(`(?:^|[^a-z])(${escapeRegex(needle)})(?=[^a-z]|$)`,'ig');
    re.lastIndex=from; const m=re.exec(hay); return m?m.index+m[0].toLowerCase().indexOf(needle):-1;
  }
  return hay.indexOf(needle,from);
}

function metricSegment(text, metricKey){
  const line=String(text??''); const spec=METRIC_SPECS[metricKey]; if(!spec) return line;
  const starts=spec.aliases.map(a=>({a,idx:aliasIndex(line,a)})).filter(x=>x.idx>=0).sort((a,b)=>a.idx-b.idx);
  if(!starts.length) return line;
  const start=starts[0].idx;
  let end=line.length;
  for(const boundary of SEGMENT_BOUNDARIES){
    // For CoC, a second sub-definition (after recovery) is a real boundary.
    let searchFrom=start+1;
    let idx=aliasIndex(line,boundary,searchFrom);
    if(idx<0) continue;
    if(idx===start) continue;
    if(idx<end) end=idx;
  }
  return line.slice(start,end).trim();
}

function approxDelta(current, previous, delta, tolerance=0.16){
  return Number.isFinite(current)&&Number.isFinite(previous)&&Number.isFinite(delta)&&Math.abs((current-previous)-delta)<=tolerance;
}

function bbcaComparisonRowValue(metricKey, text, {ticker,periodEnd}={}){
  if(String(ticker??'').toUpperCase()!=='BBCA.JK') return null;
  const segment=metricSegment(text,metricKey);
  const values=parsePctValues(segment);
  if(values.length===5){
    // BCA 1Q comparison rows: prior-year, prior-quarter/year-end, current, YoY delta, QoQ delta.
    // Example CAR: 26.6 29.8 27.0 +0.4 -2.8 => current 27.0.
    if(approxDelta(values[2],values[0],values[3])&&approxDelta(values[2],values[1],values[4])){
      return {value:values[2],method:'BBCA_3_PERIOD_COMPARISON_WITH_DELTAS',segment};
    }
  }
  if(values.length===6){
    // BCA half-year/period rows are often two comparison triples:
    // prior/current/delta + prior/current/delta. The first triple is the
    // period-to-date/current-report comparison and therefore the auditable
    // value for the report period. We only resolve when that arithmetic holds.
    if(approxDelta(values[1],values[0],values[2])){
      const month=Number(String(periodEnd??'').slice(5,7));
      if([6,9,12].includes(month) || approxDelta(values[4],values[3],values[5])){
        return {value:values[1],method:'BBCA_DUAL_COMPARISON_TRIPLE',segment};
      }
    }
  }
  return null;
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
function badContext(s){return /industry|banking\s+sector|sector\s+saw|peer|guidance|target|forecast|consensus|estimate|average|avg\.|5y|10y/i.test(s);}
export function inferBasis(s){
  const text=String(s??'');
  const bank=/bank[-\s]*only|bank[-\s]*entity|individual|individu/i.test(text);
  const consolidated=/consolidated|konsolidas/i.test(text);
  if(bank&&consolidated) return 'DISCLOSED_UNSPECIFIED';
  if(bank) return 'BANK_ONLY';
  if(consolidated) return 'CONSOLIDATED';
  return 'DISCLOSED_UNSPECIFIED';
}
function inferMetricBasis(lines,index,context,defaultBasis='DISCLOSED_UNSPECIFIED'){
  const snippets=[context,lines[index]??'',lines[index-1]??'',lines[index-2]??'',lines[index-3]??'',lines[index+1]??''].filter(Boolean);
  const explicit=new Set(snippets.map(inferBasis).filter((x)=>x!=='DISCLOSED_UNSPECIFIED'));
  if(explicit.size===1) return [...explicit][0];
  if(explicit.size>1) return 'DISCLOSED_UNSPECIFIED';
  return defaultBasis;
}
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
    const after=new RegExp(`(-?(?:\\d{1,4}(?:[.,]\\d{1,4})?|[.,]\\d{1,4}))\\s*%\\s*(?:for|at|as\\s+of|per|in)?\\s*${t}(?:\\b|$)`,'ig');
    const before=new RegExp(`${t}(?:\\b|$)[^%\\n]{0,40}?(-?(?:\\d{1,4}(?:[.,]\\d{1,4})?|[.,]\\d{1,4}))\\s*%`,'ig');
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
  const canonicalUrl=canonicalSourceUrl(sourceUrl);
  const rawLines=String(text??'').replace(/\r/g,'').split('\n').map(x=>x.replace(/\t/g,'    ').replace(/\s+$/g,'')).filter(x=>x.trim().length>0);
  const lines=rawLines.map(x=>x.replace(/\s+/g,' ').trim());
  const out=[];
  for(const [metricKey,spec] of Object.entries(METRIC_SPECS)){
    const metricCandidates=[]; const fallbacks=[];
    for(let i=0;i<lines.length;i++){
      const line=lines[i]; if(!containsAlias(line,spec.aliases)) continue;
      const excludedReason=excludedMetricReason(metricKey,line);
      if(excludedReason){
        fallbacks.push({ticker,periodEnd,metricKey,value:null,unit:'PCT',basis:inferMetricBasis(lines,i,line,defaultBasis),confidence:0,extractionMethod:'SEMANTIC_DEFINITION_GUARD',sourceTitle,sourceUrl:canonicalUrl,rawExcerpt:line,status:'QUARANTINED',reason:excludedReason});
        continue;
      }
      if(badContext(line)){
        fallbacks.push({ticker,periodEnd,metricKey,value:null,unit:'PCT',basis:inferMetricBasis(lines,i,line,defaultBasis),confidence:0,extractionMethod:'SEMANTIC_CONTEXT_GUARD',sourceTitle,sourceUrl:canonicalUrl,rawExcerpt:line,status:'QUARANTINED',reason:'forecast_or_peer_context'});
        continue;
      }
      const local=[line,lines[i+1]??'',lines[i+2]??''].filter(Boolean);
      const oneLine=parsePctValues(line);
      const next=parsePctValues(lines[i+1]??'');
      let values=[]; let method=''; let confidence=0; let periodTagged=false; let tableResolved=null; let resolvedExcerpt=null;

      const bcaResolved=bbcaComparisonRowValue(metricKey,line,{ticker,periodEnd});
      if(bcaResolved&&!badContext(line)){
        values=[bcaResolved.value]; method=bcaResolved.method; confidence=0.992; resolvedExcerpt=bcaResolved.segment;
      } else if(oneLine.length===1){values=oneLine;method='EXACT_LABEL_SINGLE_VALUE';confidence=0.99;}
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
                fallbacks.push({ticker,periodEnd,metricKey,value:null,unit:'PCT',basis:inferMetricBasis(lines,i,excerpt,defaultBasis),confidence:0,extractionMethod:'AMBIGUOUS_MULTIPLE_VALUES',sourceTitle,sourceUrl:canonicalUrl,rawExcerpt:excerpt,status:'QUARANTINED',reason:`multiple_values:${excerptVals.join(',')}`});
                continue;
              }
            }
          }
        } else continue;
      }
      const value=values[0];
      const context=[tableResolved?.header??'',lines[i-1]??'',resolvedExcerpt??'',...local].filter(Boolean).join(' | ');
      if((periodTagged?badContext(line):badContext(context))){
        fallbacks.push({ticker,periodEnd,metricKey,value,unit:'PCT',basis:inferMetricBasis(lines,i,context,defaultBasis),confidence:0.2,extractionMethod:method,sourceTitle,sourceUrl:canonicalUrl,rawExcerpt:context,status:'QUARANTINED',reason:'forecast_or_peer_context'}); continue;
      }
      if(value<spec.lo||value>spec.hi){
        fallbacks.push({ticker,periodEnd,metricKey,value,unit:'PCT',basis:inferMetricBasis(lines,i,context,defaultBasis),confidence:0,extractionMethod:method,sourceTitle,sourceUrl:canonicalUrl,rawExcerpt:context,status:'QUARANTINED',reason:`outside_guardrail:${spec.lo}..${spec.hi}`}); continue;
      }
      metricCandidates.push({ticker,periodEnd,metricKey,value,unit:'PCT',basis:inferMetricBasis(lines,i,context,defaultBasis),confidence,extractionMethod:method,sourceTitle,sourceUrl:canonicalUrl,rawExcerpt:resolvedExcerpt??context,status:'CANDIDATE',reason:null});
    }
    // Do not let an early ambiguous chart suppress a later deterministic table
    // in the same official document. Emit deterministic candidates when any
    // exist; otherwise retain one representative quarantine row for audit.
    if(metricCandidates.length) out.push(...metricCandidates);
    else if(fallbacks.length){
      const priority={forecast_or_peer_context:4,period_end_unresolved:3,conflicting_metric_definition:3};
      fallbacks.sort((a,b)=>(priority[b.reason]??0)-(priority[a.reason]??0));
      out.push(fallbacks[0]);
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
  if(!Buffer.isBuffer(buffer)||buffer.length<5||buffer.subarray(0,5).toString('ascii')!=='%PDF-') throw new Error('respons dokumen bukan PDF valid');
  if(buffer.length>50*1024*1024) throw new Error('PDF >50MB ditolak oleh collector guardrail');
  const pdf=path.join(tmpDir,`${name}.pdf`), txt=path.join(tmpDir,`${name}.txt`); await fs.writeFile(pdf,buffer);
  try{await execFileAsync('pdftotext',['-layout','-enc','UTF-8',pdf,txt],{timeout:60_000,maxBuffer:4*1024*1024});}
  catch(e){if(e?.code==='ENOENT') throw new Error('pdftotext tidak ditemukan. Install: sudo apt-get install -y poppler-utils'); throw e;}
  const out=await fs.readFile(txt,'utf8'); if(out.replace(/\s/g,'').length<100) throw new Error('PDF tidak menghasilkan text layer yang cukup; OCR sengaja tidak dilakukan'); return out;
}

function explicitReportingYear(text){
  const period=inferStructuredReportingPeriod(text); return period?periodYear(period):null;
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
      const explicitYear=explicitReportingYear(`${link.title} ${link.url}`);
      if(explicitYear && explicitYear!==year) continue;
      const score=scoreDocument(link,cfg,year);
      const isPdf=/\.pdf(?:\?|$)/i.test(link.url)||/\/api\/files\/\?/i.test(link.url)||/\/documents\/.*\.pdf/i.test(link.url);
      if(isPdf&&score>0) docs.push({...link,kind:'PDF',score});
      else if(seed.depth<1&&score>=10&&!pageSeen.has(link.url)) queue.push({url:link.url,kind:'DOCUMENT_LIST',depth:seed.depth+1});
    }
  }
  const unique=[]; const seen=new Set();
  // Generic IR buttons may hide the reporting year until the PDF is opened.
  // Overscan a bounded candidate set so old reports do not consume the whole
  // --max-docs budget before the body-year gate runs.
  const candidateLimit=Math.min(50,Math.max(maxDocs,maxDocs*2));
  for(const d of docs.sort((a,b)=>b.score-a.score)){const key=canonicalSourceUrl(d.url);if(seen.has(key))continue;seen.add(key);unique.push({...d,url:key});if(unique.length>=candidateLimit)break;}
  return {docs:unique,pagesChecked};
}

function structuredReportingPeriodCandidates(text){
  const s=String(text??'').slice(0,40000);
  const found=[];
  const add=(raw,index)=>{
    const period=inferPeriodEnd(raw); if(!period) return;
    const context=s.slice(Math.max(0,index-90),Math.min(s.length,index+raw.length+90));
    if(/target|guidance|forecast|consensus|estimate|outlook|projection/i.test(context)) return;
    let score=10;
    if(/corporate\s+presentation|analyst\s+meeting|financial\s+(?:report|results|highlights)|performance|quarterly|results/i.test(context)) score+=8;
    if(index<5000) score+=5; else if(index<15000) score+=2;
    found.push({period,score,index});
  };
  const patterns=[
    /\b(?:q[1-4]\s*[-/]?\s*20\d{2}|[1-4]q\s*[-/]?\s*\d{2,4}|20\d{2}\s*[-/]?\s*q[1-4])\b/gi,
    /\b(?:1h|9m|fy)\s*[-/]?\s*\d{2,4}\b/gi,
  ];
  for(const re of patterns) for(const m of s.matchAll(re)) add(m[0],m.index??0);
  return found;
}
function inferStructuredReportingPeriod(text){
  const candidates=structuredReportingPeriodCandidates(text); if(!candidates.length) return null;
  // Reporting-period tokens on the title/front matter are stronger than repeated
  // comparative-period labels deep in ratio tables. This prevents 1H25/Q1-25
  // comparison columns from outvoting the actual 1H26/Q1-26 report period.
  const frontMatter=candidates
    .filter((c)=>c.index<6000 && c.score>=18)
    .sort((a,b)=>a.index-b.index||b.score-a.score);
  if(frontMatter[0]) return frontMatter[0].period;
  const grouped=new Map();
  for(const c of candidates){const g=grouped.get(c.period)??{period:c.period,score:0,count:0,first:c.index};g.score+=c.score;g.count++;g.first=Math.min(g.first,c.index);grouped.set(c.period,g);}
  return [...grouped.values()].sort((a,b)=>b.score-a.score||a.first-b.first||b.count-a.count||b.period.localeCompare(a.period))[0]?.period??null;
}
function inferExplicitSnapshotMonth(text){
  const s=String(text??'').slice(0,40000); const monthPattern=Object.keys(MONTHS).join('|');
  const re=new RegExp(`(?:as\\s+of|as\\s+at|per|period(?:\\s+ending)?|for\\s+the\\s+period\\s+ended)\\s+(${monthPattern})[\\s,.-]+(20\\d{2})`,'gi');
  const found=[]; for(const m of s.matchAll(re)) found.push(lastDayIso(Number(m[2]),MONTHS[m[1].toLowerCase()]));
  return found.length?[...new Set(found)].at(-1)??null:null;
}
function inferReportingPeriodEndFromBody(text){
  return inferStructuredReportingPeriod(text) ?? inferExplicitSnapshotMonth(text);
}
function inferPeriodFromDocumentTitle(title){
  const s=String(title??'');
  const structured=inferStructuredReportingPeriod(s); if(structured) return structured;
  // A bare publication month must not override the reporting period. Only
  // accept month/year from titles that explicitly describe a financial/reporting snapshot.
  if(/financial\s+(?:report|statement)|quarterly\s+(?:report|financial)|as\s+of|as\s+at|\bper\b|period\s+end/i.test(s)) return inferPeriodEnd(s);
  return null;
}
export function resolvePeriod(docTitle,text,kind='PDF'){
  const fromTitle=inferPeriodFromDocumentTitle(docTitle); if(fromTitle) return fromTitle;
  if(kind==='HTML') return inferExplicitSnapshotMonth(text);
  return inferReportingPeriodEndFromBody(text);
}
function derivedDocumentTitle(docTitle,text,periodEnd,url){
  if(!isGenericDocumentLinkTitle(docTitle)) return cleanContextDocumentTitle(docTitle);
  const lines=String(text??'').replace(/\r/g,'').split('\n').map((x)=>cleanContextDocumentTitle(x)).filter(Boolean).slice(0,120);
  const periodYear=String(periodEnd??'').slice(0,4);
  const cue=/(?:corporate\s+presentation|analyst\s+meeting|financial\s+(?:report|results|highlights)|quarterly|earnings|performance|capital\s+and\s+risk\s+exposure)/i;
  const scored=lines.map((line,index)=>({line,index,score:(cue.test(line)?8:0)+(inferStructuredReportingPeriod(line)?8:0)+(periodYear&&line.includes(periodYear)?3:0)}))
    .filter((x)=>x.score>=8&&x.line.length>=4&&x.line.length<=260)
    .sort((a,b)=>b.score-a.score||a.index-b.index);
  if(scored[0]) return scored[0].line;
  try{const name=cleanContextDocumentTitle(decodeURIComponent(path.basename(new URL(url).pathname)));if(name&&!isGenericDocumentLinkTitle(name)) return name;}catch{}
  return periodEnd?`Official bank report ${periodEnd}`:'Official bank report';
}
function periodYear(periodEnd){return periodEnd?Number(String(periodEnd).slice(0,4)):null;}

function inferDocumentBasis(text){
  const s=String(text??'').slice(0,30000);
  const bank=/(?:as\s+of|per|basis|figures?)[^\n]{0,100}(?:bank\s*only|bank\s*entity|individual|individu)/i.test(s);
  const consolidated=/(?:as\s+of|per|basis|figures?)[^\n]{0,100}(?:consolidated|konsolidas)/i.test(s);
  if(bank&&consolidated) return 'DISCLOSED_UNSPECIFIED';
  if(bank) return 'BANK_ONLY';
  if(consolidated) return 'CONSOLIDATED';
  return 'DISCLOSED_UNSPECIFIED';
}

const EXTRACTION_PRIORITY = {
  BBCA_3_PERIOD_COMPARISON_WITH_DELTAS: 130,
  BBCA_DUAL_COMPARISON_TRIPLE: 128,
  TABLE_PERIOD_COLUMN_VALUE: 120,
  PERIOD_TAGGED_VALUE: 115,
  FLATTENED_TREND_LDR_FIRST_SERIES: 110,
  EXACT_LABEL_SINGLE_VALUE: 85,
  LABEL_NEXT_LINE_SINGLE_VALUE: 75,
  LOCAL_WINDOW_SINGLE_VALUE: 65,
};
function extractionPriority(method){return EXTRACTION_PRIORITY[String(method??'')]??50;}
function chooseWithinDocument(arr){
  const byValue=new Map();
  for(const c of arr){const key=Number(c.value).toFixed(4);const list=byValue.get(key)??[];list.push(c);byValue.set(key,list);}
  if(byValue.size===1) return {winner:[...arr].sort((a,b)=>extractionPriority(b.extractionMethod)-extractionPriority(a.extractionMethod)||b.confidence-a.confidence)[0],resolved:true};
  const ranked=[...arr].sort((a,b)=>extractionPriority(b.extractionMethod)-extractionPriority(a.extractionMethod)||b.confidence-a.confidence);
  const top=ranked[0], second=ranked[1];
  if(top && extractionPriority(top.extractionMethod)>=110 && (!second || extractionPriority(top.extractionMethod)>extractionPriority(second.extractionMethod))){
    return {winner:top,resolved:true};
  }
  return {winner:null,resolved:false};
}

export function reconcileCandidates(candidates){
  const rawQuarantine=candidates.filter((c)=>c.status==='QUARANTINED'||!c.periodEnd).map((c)=>({...c,status:'QUARANTINED',reason:c.reason??(!c.periodEnd?'period_end_unresolved':'quarantined')}));
  const byDocument=new Map();
  for(const c of candidates){
    if(c.status!=='CANDIDATE'||c.value==null||!c.periodEnd) continue;
    const key=[c.ticker,c.periodEnd,c.basis,c.metricKey,canonicalSourceUrl(c.sourceUrl)].join('|');
    const arr=byDocument.get(key)??[];arr.push({...c,sourceUrl:canonicalSourceUrl(c.sourceUrl)});byDocument.set(key,arr);
  }
  const documentResolved=[]; const quarantine=[...rawQuarantine]; let resolvedWithinDocument=0;
  for(const arr of byDocument.values()){
    const picked=chooseWithinDocument(arr);
    if(picked.winner){documentResolved.push(picked.winner); if(arr.length>1) resolvedWithinDocument+=arr.length-1; continue;}
    const values=[...new Set(arr.map((x)=>Number(x.value).toFixed(4)))];
    for(const x of arr) quarantine.push({...x,status:'QUARANTINED',reason:`conflicting_values_same_document:${values.join('/')}`});
  }

  const grouped=new Map();
  // Cross-document conflicts are evaluated only for genuinely comparable
  // populations: same ticker, reporting period, explicit/unspecified basis and metric.
  for(const c of documentResolved){const key=[c.ticker,c.periodEnd,c.basis,c.metricKey].join('|');const arr=grouped.get(key)??[];arr.push(c);grouped.set(key,arr);}
  const accepted=[];
  for(const arr of grouped.values()){
    const values=[...new Set(arr.map((x)=>Number(x.value).toFixed(4)))];
    if(values.length>1){for(const x of arr) quarantine.push({...x,status:'QUARANTINED',reason:`conflicting_official_values:${values.join('/')}`});continue;}
    const best=[...arr].sort((a,b)=>extractionPriority(b.extractionMethod)-extractionPriority(a.extractionMethod)||b.confidence-a.confidence)[0];
    if(best.confidence<0.94){quarantine.push({...best,status:'QUARANTINED',reason:'confidence_below_threshold'});continue;}
    accepted.push(best);
  }
  return {accepted,quarantine,diagnostics:{resolvedWithinDocument}};
}

async function dbClient(){if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL wajib untuk --confirm'); const pg=await import('pg'); const Client=pg.Client??pg.default?.Client; return new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:15_000});}

function methodFromAutoNotes(notes){
  const m=String(notes??'').match(/AUTO_COLLECTED:([^;]+)/); return m?.[1]?.trim()??'';
}
function sameNumber(a,b){return Number.isFinite(Number(a))&&Number.isFinite(Number(b))&&Math.abs(Number(a)-Number(b))<1e-9;}
function canSupersedeAutoEvidence(prior,current){
  const sameSource=canonicalSourceUrl(prior.source_url)===canonicalSourceUrl(current.sourceUrl);
  if(!sameSource) return false;
  if(String(prior.notes??'').startsWith('AUTO_COLLECTED:')===false) return false;
  const priorBasis=String(prior.basis??'DISCLOSED_UNSPECIFIED');
  const basisCompatible=priorBasis===current.basis || (priorBasis==='DISCLOSED_UNSPECIFIED'&&current.basis!=='DISCLOSED_UNSPECIFIED');
  if(!basisCompatible) return false;
  const currentPriority=extractionPriority(current.extractionMethod);
  // One official PDF is one reporting snapshot in this collector. If a newer
  // reporting-period resolver assigns that same PDF to a different period, the
  // old auto row is stale even when its previously extracted value also changes.
  if(String(prior.period_end).slice(0,10)!==current.periodEnd && currentPriority>=110) return true;
  // An explicit local basis is strictly more informative than a historical
  // DISCLOSED_UNSPECIFIED auto row from the same source/metric.
  if(priorBasis==='DISCLOSED_UNSPECIFIED'&&current.basis!=='DISCLOSED_UNSPECIFIED'&&currentPriority>=110) return true;
  // Same-period/same-basis value corrections require a strictly stronger
  // deterministic extraction method; otherwise the conflict remains fail-closed.
  const priorMethod=methodFromAutoNotes(prior.notes);
  return currentPriority>extractionPriority(priorMethod) && currentPriority>=110;
}
function isImmutableOfficialDocumentUrl(url){
  try{
    const u=new URL(String(url??''));
    return /\.pdf$/i.test(u.pathname) || /\/api\/files\/?$/i.test(u.pathname) || /\/documents\//i.test(u.pathname);
  }catch{return false;}
}
function invalidationScope(reason,sourceUrl){
  const r=String(reason??'');
  // Semantic guards may invalidate every historical extraction only when the
  // source URL is an immutable document. Stable HTML/IR landing pages can host
  // many reporting periods, so their invalidation must stay period-scoped.
  if(r==='forecast_or_peer_context' || r.startsWith('metric_definition_mismatch:')) return isImmutableOfficialDocumentUrl(sourceUrl)?'SOURCE_METRIC':'SOURCE_PERIOD_BASIS_METRIC';
  if(r.startsWith('multiple_values:') || r.startsWith('conflicting_values_same_document:') || r.startsWith('conflicting_official_values:') || r.startsWith('outside_guardrail:') || r==='confidence_below_threshold') return 'SOURCE_PERIOD_BASIS_METRIC';
  return null;
}

async function persistRun({runId:id,accepted,quarantine,summary,tickers,confirm}){
  const db=await dbClient(); await db.connect();
  try{
    await db.query('BEGIN');
    await db.query(`INSERT INTO bank_metric_collection_runs(run_id,mode,status,tickers,source_pages_checked,documents_discovered,documents_parsed,evidence_candidates,detail)
      VALUES($1,$2,'RUNNING',$3,$4,$5,$6,$7,$8::jsonb)`,[id,confirm?'CONFIRM':'DRY_RUN',tickers,summary.pagesChecked,summary.docsDiscovered,summary.docsParsed,accepted.length+quarantine.length,JSON.stringify({collectorVersion:10, parserPolicy:'front-matter reporting period + strict year overscan + canonical-source dedupe + local-basis + same-document reconciliation + correction lineage + period-safe stale-auto invalidation; ambiguous/cross-source-conflict/guardrail remain fail-closed',...summary})]);
    let inserted=0,existing=0,superseded=0,dbQuarantined=0;
    for(const r of accepted){
      const observedDate=OBSERVED_DATE;
      const currentFp=fingerprint({...r,observedDate});
      // Fetch only previous AUTO_COLLECTED rows for this issuer/metric. Canonical URL
      // comparison happens in JS so signed/path query parameters are preserved while
      // harmless tracking parameters can differ safely.
      const priorResult=await db.query(`SELECT id,period_end::text,value::float8 value,unit,basis,source_url,notes,evidence_fingerprint
        FROM bank_metric_evidence
        WHERE ticker=$1 AND metric_key=$2 AND superseded_at IS NULL AND notes LIKE 'AUTO_COLLECTED:%'
        ORDER BY observed_date DESC, created_at DESC`,[r.ticker,r.metricKey]);
      const sameSource=priorResult.rows.filter((x)=>canonicalSourceUrl(x.source_url)===canonicalSourceUrl(r.sourceUrl));

      const exact=sameSource.find((x)=>String(x.period_end).slice(0,10)===r.periodEnd&&sameNumber(x.value,r.value)&&String(x.unit)===r.unit&&String(x.basis)===r.basis);
      if(exact){
        existing++;
        await db.query(`INSERT INTO bank_metric_collection_candidates(run_id,ticker,period_end,observed_date,metric_key,value,unit,basis,confidence,extraction_method,status,source_title,source_url,source_tier,raw_excerpt,evidence_fingerprint)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'EXISTING',$11,$12,'ISSUER_IR',$13,$14)`,[id,r.ticker,r.periodEnd,observedDate,r.metricKey,r.value,r.unit,r.basis,r.confidence,r.extractionMethod,r.sourceTitle,r.sourceUrl,r.rawExcerpt,String(exact.evidence_fingerprint)]);
        continue;
      }

      const compatible=sameSource.filter((x)=>String(x.basis)===r.basis || (String(x.basis)==='DISCLOSED_UNSPECIFIED'&&r.basis!=='DISCLOSED_UNSPECIFIED'));
      const unsafe=compatible.filter((x)=>!canSupersedeAutoEvidence(x,r));
      if(unsafe.length){
        dbQuarantined++;
        await db.query(`INSERT INTO bank_metric_collection_candidates(run_id,ticker,period_end,observed_date,metric_key,value,unit,basis,confidence,extraction_method,status,reason,source_title,source_url,source_tier,raw_excerpt)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'QUARANTINED','conflict_with_active_auto_evidence',$11,$12,'ISSUER_IR',$13)`,[id,r.ticker,r.periodEnd,observedDate,r.metricKey,r.value,r.unit,r.basis,r.confidence,r.extractionMethod,r.sourceTitle,r.sourceUrl,r.rawExcerpt]);
        continue;
      }

      const toSupersede=compatible.filter((x)=>canSupersedeAutoEvidence(x,r));
      if(toSupersede.length){
        const ids=toSupersede.map((x)=>Number(x.id)).filter(Number.isFinite);
        if(ids.length){
          const reason=`AUTO_COLLECTOR_CORRECTION:${r.extractionMethod}`;
          const q=await db.query(`UPDATE bank_metric_evidence SET superseded_at=now(),superseded_reason=$2,superseded_by_fingerprint=$3 WHERE id=ANY($1::bigint[]) AND superseded_at IS NULL`,[ids,reason,currentFp]);
          superseded+=q.rowCount??0;
        }
      }

      // If an older explicit-basis row exists for this same document, never
      // degrade it by inserting a new DISCLOSED_UNSPECIFIED duplicate.
      if(r.basis==='DISCLOSED_UNSPECIFIED' && sameSource.some((x)=>String(x.basis)!=='DISCLOSED_UNSPECIFIED')){
        dbQuarantined++;
        await db.query(`INSERT INTO bank_metric_collection_candidates(run_id,ticker,period_end,observed_date,metric_key,value,unit,basis,confidence,extraction_method,status,reason,source_title,source_url,source_tier,raw_excerpt)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'QUARANTINED','basis_regression_to_unspecified',$11,$12,'ISSUER_IR',$13)`,[id,r.ticker,r.periodEnd,observedDate,r.metricKey,r.value,r.unit,r.basis,r.confidence,r.extractionMethod,r.sourceTitle,r.sourceUrl,r.rawExcerpt]);
        continue;
      }

      const q=await db.query(`INSERT INTO bank_metric_evidence
        (ticker,period_end,observed_date,published_at,source_document_date,metric_key,value,unit,basis,evidence_type,source_tier,source_title,source_url,notes,evidence_fingerprint)
        VALUES($1,$2,$3,NULL,NULL,$4,$5,$6,$7,'REPORTED','ISSUER_IR',$8,$9,$10,$11)
        ON CONFLICT(evidence_fingerprint) DO NOTHING`,[r.ticker,r.periodEnd,observedDate,r.metricKey,r.value,r.unit,r.basis,r.sourceTitle,r.sourceUrl,`AUTO_COLLECTED:${r.extractionMethod}; confidence=${r.confidence}; observed_date adalah tanggal collector melihat evidence.`,currentFp]);
      const status=(q.rowCount??0)===1?'INGESTED':'EXISTING';
      if(status==='INGESTED')inserted++;else existing++;
      await db.query(`INSERT INTO bank_metric_collection_candidates(run_id,ticker,period_end,observed_date,metric_key,value,unit,basis,confidence,extraction_method,status,source_title,source_url,source_tier,raw_excerpt,evidence_fingerprint)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'ISSUER_IR',$14,$15)`,[id,r.ticker,r.periodEnd,observedDate,r.metricKey,r.value,r.unit,r.basis,r.confidence,r.extractionMethod,status,r.sourceTitle,r.sourceUrl,r.rawExcerpt,currentFp]);
    }
    for(const r of quarantine){
      // A newer semantic guard may prove that an older auto-extracted value from
      // the exact same official document was never the requested metric (for
      // example sector NIM, CASA growth, or Net NPL Formation). Invalidate only
      // AUTO_COLLECTED evidence for that same source+metric; ambiguous/conflicting
      // rows never delete/supersede prior evidence automatically.
      const scope=invalidationScope(r.reason,r.sourceUrl);
      if(scope){
        const prior=await db.query(`SELECT id,period_end::text,basis,source_url FROM bank_metric_evidence
          WHERE ticker=$1 AND metric_key=$2 AND superseded_at IS NULL AND notes LIKE 'AUTO_COLLECTED:%'`,[r.ticker,r.metricKey]);
        const ids=prior.rows.filter((x)=>{
          if(canonicalSourceUrl(x.source_url)!==canonicalSourceUrl(r.sourceUrl)) return false;
          if(scope==='SOURCE_METRIC') return true;
          return String(x.period_end).slice(0,10)===String(r.periodEnd??'').slice(0,10) && String(x.basis)===String(r.basis);
        }).map((x)=>Number(x.id)).filter(Number.isFinite);
        if(ids.length){
          const reason=`AUTO_COLLECTOR_INVALIDATED:${r.reason}`;
          const q=await db.query(`UPDATE bank_metric_evidence SET superseded_at=now(),superseded_reason=$2,superseded_by_fingerprint=NULL WHERE id=ANY($1::bigint[]) AND superseded_at IS NULL`,[ids,reason]);
          superseded+=q.rowCount??0;
        }
      }
      await db.query(`INSERT INTO bank_metric_collection_candidates(run_id,ticker,period_end,observed_date,metric_key,value,unit,basis,confidence,extraction_method,status,reason,source_title,source_url,source_tier,raw_excerpt)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'QUARANTINED',$11,$12,$13,'ISSUER_IR',$14)`,[id,r.ticker,r.periodEnd,OBSERVED_DATE,r.metricKey,r.value,r.unit,r.basis,r.confidence,r.extractionMethod,r.reason,r.sourceTitle,r.sourceUrl,r.rawExcerpt]);
    }
    const quarantineTotal=quarantine.length+dbQuarantined;
    const status=quarantineTotal?'PARTIAL':'SUCCESS';
    await db.query(`UPDATE bank_metric_collection_runs SET status=$2,evidence_inserted=$3,evidence_existing=$4,evidence_superseded=$5,quarantined=$6,finished_at=now(),detail=$7::jsonb WHERE run_id=$1`,[id,status,inserted,existing,superseded,quarantineTotal,JSON.stringify({...summary,accepted:accepted.length,dbQuarantined})]);
    await db.query('COMMIT'); return {inserted,existing,superseded,quarantined:quarantineTotal,status};
  }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{await db.end().catch(()=>{});}
}

async function main(){
  const args=parseArgs(process.argv.slice(2)); const cfg=JSON.parse(await fs.readFile(CONFIG_PATH,'utf8')); const all=Object.keys(cfg.banks); const tickers=args.tickers?.length?args.tickers:all; for(const t of tickers)if(!cfg.banks[t])throw new Error(`Ticker belum punya official-source registry: ${t}`);
  const year=args.year??Number(jakartaDate().slice(0,4)); const maxDocs=args.maxDocs??Number(cfg.policy?.defaultMaxDocumentsPerTicker??12); const tmpDir=await fs.mkdtemp(path.join(os.tmpdir(),'sahamlens-bank-auto-')); const allCandidates=[]; let pagesChecked=0,docsDiscovered=0,docsParsed=0,docsSkippedYear=0,docsUnresolvedPeriod=0;
  console.log('Bank Fundamental Official-Source Auto Collector'); console.log(`Mode      : ${args.confirm?'CONFIRM':'DRY RUN'}`); console.log(`Ticker    : ${tickers.join(', ')}`); console.log(`Year      : ${year}`); console.log('Policy    : OFFICIAL DOMAIN ONLY / DATA_ONLY / ambiguous => quarantine');
  try{
    for(const ticker of tickers){
      const bank=cfg.banks[ticker]; console.log(`\n=== ${ticker} ===`);
      const discovered=await discoverForBank(ticker,bank,{year,maxDocs}); pagesChecked+=discovered.pagesChecked; docsDiscovered+=discovered.docs.length;
      console.log(`source pages checked: ${discovered.pagesChecked}; documents selected: ${discovered.docs.length}`);
      if(args.list){for(const d of discovered.docs)console.log(`  ${d.kind.padEnd(4)} score=${String(d.score).padStart(2)} ${d.title} :: ${d.url}`);continue;}
      let idx=0; let processedForYear=0;
      for(const doc of discovered.docs){
        if(processedForYear>=maxDocs) break;
        idx++; try{
        let text,finalUrl=doc.url;
        if(doc.kind==='HTML'){text=htmlToText(doc.html);}
        else {const f=await fetchWithRetry(doc.url,{asBuffer:true}); finalUrl=f.finalUrl; if(!hostAllowed(finalUrl,bank.domains))throw new Error(`redirect keluar domain resmi: ${finalUrl}`); text=await pdfToText(f.body,tmpDir,`${ticker.replace('.JK','')}-${idx}`);}
        docsParsed++;
        const periodEnd=resolvePeriod(doc.title,text,doc.kind);
        if(periodEnd && periodYear(periodEnd)!==year){docsSkippedYear++;console.log(`  skip-year ${doc.title.slice(0,70)} -> period=${periodEnd}`);continue;}
        processedForYear++;
        if(!periodEnd) docsUnresolvedPeriod++;
        const effectiveTitle=derivedDocumentTitle(doc.title,text,periodEnd,finalUrl);
        const cands=extractMetricCandidates(text,{ticker,sourceTitle:effectiveTitle,sourceUrl:finalUrl,periodEnd,defaultBasis:inferDocumentBasis(text)}); allCandidates.push(...cands);
        console.log(`  parsed ${effectiveTitle.slice(0,70)} -> period=${periodEnd??'UNRESOLVED'} candidates=${cands.length}`);
      }catch(e){console.warn(`  WARN skip ${doc.title}: ${e instanceof Error?e.message:String(e)}`);}
      }
    }
    if(args.list){console.log('\nLIST ONLY - tidak ada parse/DB write.');return;}
    const {accepted,quarantine,diagnostics:reconcileDiagnostics}=reconcileCandidates(allCandidates);
    const summary={pagesChecked,docsDiscovered,docsParsed,docsSkippedYear,docsUnresolvedPeriod,resolvedWithinDocument:reconcileDiagnostics.resolvedWithinDocument};
    console.log('\n=== QUALITY SUMMARY ==='); console.log(`Docs discovered : ${docsDiscovered}`); console.log(`Docs parsed     : ${docsParsed}`); console.log(`Skipped year    : ${docsSkippedYear}`); console.log(`Unresolved period: ${docsUnresolvedPeriod}`); console.log(`Resolved in-doc : ${reconcileDiagnostics.resolvedWithinDocument}`); console.log(`Accepted        : ${accepted.length}`); console.log(`Quarantined     : ${quarantine.length}`);
    for(const r of accepted) console.log(`  ACCEPT ${r.ticker} ${r.periodEnd} ${r.metricKey}=${r.value}% basis=${r.basis} conf=${r.confidence} source=${r.sourceTitle}`);
    for(const r of quarantine.slice(0,20)) console.log(`  HOLD   ${r.ticker} ${r.periodEnd??'NO_PERIOD'} ${r.metricKey} reason=${r.reason}`);
    if(!args.confirm){console.log('\nDRY RUN - database tidak ditulis. Tambahkan --confirm hanya setelah quality summary masuk akal.'); const marker={status:'DRY_RUN',accepted:accepted.length,quarantined:quarantine.length,...summary}; console.log(`SAHAMLENS_BANK_COLLECT_RESULT=${JSON.stringify(marker)}`);return;}
    const id=runId(); const persisted=await persistRun({runId:id,accepted,quarantine,summary,tickers,confirm:true}); const marker={status:persisted.status,runId:id,inserted:persisted.inserted,existing:persisted.existing,superseded:persisted.superseded,accepted:accepted.length,quarantined:persisted.quarantined,...summary}; console.log(`\nDB: ${persisted.inserted} evidence baru, ${persisted.existing} sudah ada, ${persisted.superseded} superseded, ${persisted.quarantined} quarantine.`); console.log('LensScore tetap OFF untuk bank-specific evidence.'); console.log(`SAHAMLENS_BANK_COLLECT_RESULT=${JSON.stringify(marker)}`);
  }finally{if(args.keepFiles)console.log(`Temp files dipertahankan: ${tmpDir}`);else await fs.rm(tmpDir,{recursive:true,force:true}).catch(()=>{});}
}

const isCli = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if(isCli){main().catch(e=>{console.error(`BANK-AUTO-COLLECTOR GAGAL: ${e instanceof Error?e.stack??e.message:String(e)}`);process.exitCode=1;});}
