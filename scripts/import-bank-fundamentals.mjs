#!/usr/bin/env node
import dns from 'node:dns';
import net from 'node:net';
dns.setDefaultResultOrder('ipv4first');
net.setDefaultAutoSelectFamily(false);
import fs from 'node:fs/promises';
import pg from 'pg';
const { Client } = pg;
const args = process.argv.slice(2);
const confirm = args.includes('--confirm');
function arg(name) { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; }
const file = arg('--file');
if (!file) throw new Error('--file CSV wajib diisi');

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

const text = await fs.readFile(file, 'utf8');
const lines = text.split(/\r?\n/).filter((x) => x.trim());
if (lines.length < 2) throw new Error('CSV kosong');
const head = parseCsvLine(lines[0]).map((x) => x.trim());
const idx = Object.fromEntries(head.map((x, i) => [x, i]));
for (const k of ['ticker','observed_date','period_end','source','source_url']) if (idx[k] == null) throw new Error(`Kolom ${k} wajib ada`);
const pctMetrics = ['nim_pct','npl_gross_pct','npl_net_pct','casa_pct','car_pct','ldr_pct','cost_of_credit_pct','cost_to_income_pct','coverage_ratio_pct'];
const metrics = [...pctMetrics, 'ppop_idr'];
const metricBounds = {
  nim_pct: [-20, 50], npl_gross_pct: [0, 100], npl_net_pct: [0, 100], casa_pct: [0, 100],
  car_pct: [0, 250], ldr_pct: [0, 400], cost_of_credit_pct: [-20, 100],
  cost_to_income_pct: [0, 400], coverage_ratio_pct: [0, 2_000],
};
const rows=[];
for (let lineNo=1; lineNo<lines.length; lineNo++) {
  const c=parseCsvLine(lines[lineNo]);
  const rawTicker=(c[idx.ticker]||'').toUpperCase();
  const ticker=(rawTicker.endsWith('.JK') ? rawTicker : `${rawTicker}.JK`);
  const observed=c[idx.observed_date], period=c[idx.period_end], source=c[idx.source], sourceUrl=c[idx.source_url];
  const published = idx.published_at == null ? null : (c[idx.published_at] || null);
  if (!/^[A-Z0-9]{4,6}\.JK$/.test(ticker)) throw new Error(`Baris ${lineNo+1}: ticker tidak valid`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(observed)||!/^\d{4}-\d{2}-\d{2}$/.test(period)) throw new Error(`Baris ${lineNo+1}: tanggal wajib YYYY-MM-DD`);
  if (observed < period) throw new Error(`Baris ${lineNo+1}: observed_date tidak boleh sebelum period_end`);
  if (published) {
    const publishedTime = Date.parse(published);
    if (!Number.isFinite(publishedTime)) throw new Error(`Baris ${lineNo+1}: published_at bukan timestamp valid`);
    if (new Date(`${observed}T23:59:59Z`).getTime() < publishedTime) throw new Error(`Baris ${lineNo+1}: observed_date tidak boleh sebelum published_at`);
  }
  if (!source || !/^https:\/\//i.test(sourceUrl||'')) throw new Error(`Baris ${lineNo+1}: source dan source_url HTTPS wajib`);
  const m={};
  for (const k of metrics) {
    const raw=idx[k]==null?'':(c[idx[k]]??'');
    m[k]=raw===''?null:Number(raw);
    if (m[k]!=null && !Number.isFinite(m[k])) throw new Error(`Baris ${lineNo+1}: ${k} bukan angka`);
    const bounds=metricBounds[k];
    if (m[k]!=null && bounds && (m[k] < bounds[0] || m[k] > bounds[1])) throw new Error(`Baris ${lineNo+1}: ${k} di luar guardrail ${bounds[0]}..${bounds[1]}`);
    if (k === 'ppop_idr' && m[k] != null && m[k] < 0) throw new Error(`Baris ${lineNo+1}: ppop_idr harus nilai IDR non-negatif yang sudah dinormalisasi`);
  }
  rows.push({ticker,observed,period,published,source,sourceUrl,m});
}
console.log(`Baris bank valid : ${rows.length}`);
console.log('Status            : DATA_ONLY (tidak otomatis masuk LensScore).');
console.log('Catatan PPOP      : kolom ppop_idr harus sudah dinormalisasi ke rupiah penuh, bukan juta/miliar.');
if (!confirm) { console.log('DRY RUN. Tambahkan --confirm hanya setelah CSV berasal dari laporan resmi IDX/OJK/emiten yang diverifikasi.'); process.exit(0); }
const db=process.env.DATABASE_URL; if(!db) throw new Error('DATABASE_URL wajib diset');
const client=new Client({connectionString:db, connectionTimeoutMillis:15000});
try {
  await client.connect(); await client.query('BEGIN');
  let inserted=0; let existing=0;
  for (const r of rows) {
    const result=await client.query(`INSERT INTO bank_fundamental_history
      (ticker,observed_date,period_end,published_at,nim_pct,npl_gross_pct,npl_net_pct,casa_pct,car_pct,ldr_pct,cost_of_credit_pct,cost_to_income_pct,coverage_ratio_pct,ppop_idr,source,source_url)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      ON CONFLICT(ticker,observed_date,period_end,source) DO NOTHING`,
      [r.ticker,r.observed,r.period,r.published,...metrics.map(k=>r.m[k]),r.source,r.sourceUrl]);
    if ((result.rowCount??0)===1) inserted++; else existing++;
  }
  await client.query('COMMIT'); console.log(`Bank evidence: ${inserted} baru, ${existing} sudah ada. Existing evidence tidak ditimpa.`);
} catch (e) { await client.query('ROLLBACK').catch(()=>{}); throw e; }
finally { await client.end().catch(()=>{}); }
