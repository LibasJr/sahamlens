#!/usr/bin/env node
import crypto from 'node:crypto';
import dns from 'node:dns';
import fs from 'node:fs/promises';
import net from 'node:net';
dns.setDefaultResultOrder('ipv4first');
net.setDefaultAutoSelectFamily(false);

const args = process.argv.slice(2);
const confirm = args.includes('--confirm');
function arg(name) { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; }
const file = arg('--file');
if (!file) throw new Error('--file CSV wajib diisi');

const METRICS = new Set([
  'NIM_PCT','NPL_GROSS_PCT','NPL_NET_PCT','CASA_PCT','CAR_PCT','LDR_PCT',
  'COST_OF_CREDIT_PCT','COST_TO_INCOME_PCT','COVERAGE_RATIO_PCT','PPOP_IDR',
]);
const PCT_BOUNDS = {
  NIM_PCT: [-20, 50], NPL_GROSS_PCT: [0, 100], NPL_NET_PCT: [0, 100], CASA_PCT: [0, 100],
  CAR_PCT: [0, 250], LDR_PCT: [0, 400], COST_OF_CREDIT_PCT: [-20, 100],
  COST_TO_INCOME_PCT: [0, 400], COVERAGE_RATIO_PCT: [0, 2000],
};
const BASES = new Set(['BANK_ONLY','CONSOLIDATED','DISCLOSED_UNSPECIFIED']);
const TYPES = new Set(['REPORTED','DERIVED']);
const TIERS = new Set(['ISSUER_IR','IDX_FILING','OJK','OTHER_OFFICIAL']);

function parseCsvLine(line) {
  const out=[]; let cur=''; let quoted=false;
  for (let i=0;i<line.length;i++) {
    const ch=line[i];
    if (ch==='"') {
      if (quoted && line[i+1]==='"') { cur+='"'; i++; } else quoted=!quoted;
    } else if (ch===',' && !quoted) { out.push(cur.trim()); cur=''; }
    else cur+=ch;
  }
  out.push(cur.trim()); return out;
}
function dateOnly(v) { return /^\d{4}-\d{2}-\d{2}$/.test(v); }
function normalizedTicker(v) {
  const x=String(v||'').trim().toUpperCase();
  const t=x.endsWith('.JK')?x:`${x}.JK`;
  if (!/^[A-Z0-9]{4,6}\.JK$/.test(t)) throw new Error(`ticker tidak valid: ${v}`);
  return t;
}
function fingerprint(row) {
  const payload=[row.ticker,row.periodEnd,row.observedDate,row.publishedAt||'',row.metricKey,String(row.value),row.unit,row.basis,row.evidenceType,row.sourceTier,row.sourceTitle,row.sourceUrl,row.sourceDocumentDate||'',row.notes||''].join('|');
  return crypto.createHash('sha256').update(payload).digest('hex');
}

const text=await fs.readFile(file,'utf8');
const lines=text.split(/\r?\n/).filter(x=>x.trim() && !x.trimStart().startsWith('#'));
if (lines.length<2) throw new Error('CSV kosong');
const head=parseCsvLine(lines[0]);
const idx=Object.fromEntries(head.map((x,i)=>[x.trim(),i]));
const required=['ticker','period_end','observed_date','metric_key','value','unit','basis','evidence_type','source_tier','source_title','source_url'];
for(const k of required) if(idx[k]==null) throw new Error(`Kolom ${k} wajib ada`);
const get=(c,k)=>idx[k]==null?'':String(c[idx[k]]??'').trim();

const rows=[];
for(let i=1;i<lines.length;i++){
  const c=parseCsvLine(lines[i]); const lineNo=i+1;
  const ticker=normalizedTicker(get(c,'ticker'));
  const periodEnd=get(c,'period_end'); const observedDate=get(c,'observed_date');
  if(!dateOnly(periodEnd)||!dateOnly(observedDate)) throw new Error(`Baris ${lineNo}: period_end/observed_date wajib YYYY-MM-DD`);
  if(observedDate<periodEnd) throw new Error(`Baris ${lineNo}: observed_date tidak boleh sebelum period_end`);
  const today=new Date().toISOString().slice(0,10); if(observedDate>today) throw new Error(`Baris ${lineNo}: observed_date tidak boleh di masa depan`);
  const publishedAt=get(c,'published_at')||null;
  if(publishedAt){ const t=Date.parse(publishedAt); if(!Number.isFinite(t)) throw new Error(`Baris ${lineNo}: published_at tidak valid`); if(new Date(`${observedDate}T23:59:59Z`).getTime()<t) throw new Error(`Baris ${lineNo}: observed_date sebelum published_at`); }
  const sourceDocumentDate=get(c,'source_document_date')||null;
  if(sourceDocumentDate && !dateOnly(sourceDocumentDate)) throw new Error(`Baris ${lineNo}: source_document_date wajib YYYY-MM-DD`);
  const metricKey=get(c,'metric_key').toUpperCase(); if(!METRICS.has(metricKey)) throw new Error(`Baris ${lineNo}: metric_key tidak dikenal`);
  const value=Number(get(c,'value')); if(!Number.isFinite(value)) throw new Error(`Baris ${lineNo}: value bukan angka`);
  const unit=get(c,'unit').toUpperCase(); const expectedUnit=metricKey==='PPOP_IDR'?'IDR':'PCT'; if(unit!==expectedUnit) throw new Error(`Baris ${lineNo}: ${metricKey} wajib unit ${expectedUnit}`);
  if(metricKey==='PPOP_IDR' && value<0) throw new Error(`Baris ${lineNo}: PPOP_IDR tidak boleh negatif`);
  if(metricKey!=='PPOP_IDR'){ const [lo,hi]=PCT_BOUNDS[metricKey]; if(value<lo||value>hi) throw new Error(`Baris ${lineNo}: ${metricKey} di luar guardrail ${lo}..${hi}`); }
  const basis=get(c,'basis').toUpperCase(); if(!BASES.has(basis)) throw new Error(`Baris ${lineNo}: basis tidak valid`);
  const evidenceType=get(c,'evidence_type').toUpperCase(); if(!TYPES.has(evidenceType)) throw new Error(`Baris ${lineNo}: evidence_type tidak valid`);
  const sourceTier=get(c,'source_tier').toUpperCase(); if(!TIERS.has(sourceTier)) throw new Error(`Baris ${lineNo}: source_tier tidak valid`);
  const sourceTitle=get(c,'source_title'); const sourceUrl=get(c,'source_url'); if(!sourceTitle||!/^https:\/\//i.test(sourceUrl)) throw new Error(`Baris ${lineNo}: source_title dan source_url HTTPS wajib`);
  const notes=get(c,'notes')||null;
  const row={ticker,periodEnd,observedDate,publishedAt,sourceDocumentDate,metricKey,value,unit,basis,evidenceType,sourceTier,sourceTitle,sourceUrl,notes};
  rows.push({...row,evidenceFingerprint:fingerprint(row),lineNo});
}

// Cross-metric logical validation inside the same ticker/period/basis.
const groups=new Map();
for(const r of rows){const k=`${r.ticker}|${r.periodEnd}|${r.basis}`;const g=groups.get(k)||new Map();g.set(r.metricKey,r);groups.set(k,g);}
for(const [key,g] of groups){
  const gross=g.get('NPL_GROSS_PCT')?.value; const netv=g.get('NPL_NET_PCT')?.value;
  if(gross!=null&&netv!=null&&netv>gross) throw new Error(`${key}: NPL_NET_PCT (${netv}) > NPL_GROSS_PCT (${gross})`);
}

const tickerCount=new Set(rows.map(r=>r.ticker)).size;
const reported=rows.filter(r=>r.evidenceType==='REPORTED').length;
const derived=rows.length-reported;
console.log(`Evidence valid     : ${rows.length}`);
console.log(`Ticker             : ${tickerCount}`);
console.log(`Reported / Derived : ${reported} / ${derived}`);
console.log('Status             : DATA_ONLY. Import ini TIDAK mengubah LensScore.');
if(!confirm){console.log('DRY RUN. Tambahkan --confirm setelah provenance dan basis setiap metrik direview.');process.exit(0);}

if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL wajib diset');
const pgModule = await import('pg');
const Client = pgModule.Client ?? pgModule.default?.Client;
if (!Client) throw new Error('Driver pg tidak menyediakan Client');
const client=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:15000});
try{
  await client.connect(); await client.query('BEGIN'); let inserted=0,existing=0;
  for(const r of rows){
    const q=await client.query(`INSERT INTO bank_metric_evidence
      (ticker,period_end,observed_date,published_at,source_document_date,metric_key,value,unit,basis,evidence_type,source_tier,source_title,source_url,notes,evidence_fingerprint)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      ON CONFLICT(evidence_fingerprint) DO NOTHING`,
      [r.ticker,r.periodEnd,r.observedDate,r.publishedAt,r.sourceDocumentDate,r.metricKey,r.value,r.unit,r.basis,r.evidenceType,r.sourceTier,r.sourceTitle,r.sourceUrl,r.notes,r.evidenceFingerprint]);
    if((q.rowCount??0)===1) inserted++; else existing++;
  }
  await client.query('COMMIT');
  console.log(`Bank metric evidence: ${inserted} baru, ${existing} sudah ada.`);
  console.log('Append-only: koreksi sumber menjadi evidence baru; bukti lama tidak ditimpa.');
}catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}finally{await client.end().catch(()=>{});}
