#!/usr/bin/env node
import dns from 'node:dns';
import net from 'node:net';
dns.setDefaultResultOrder('ipv4first');
net.setDefaultAutoSelectFamily(false);
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';

const failures=[]; const warnings=[]; const pass=[];
const ok=(m)=>pass.push(m); const warn=(m)=>warnings.push(m); const fail=(m)=>failures.push(m);
const major=Number(process.versions.node.split('.')[0]);
major===22?ok(`Node ${process.versions.node} selaras runtime policy`):fail(`Node harus major 22; aktual ${process.versions.node}`);
for(const key of ['DATABASE_URL','JWT_SECRET_KEY']) process.env[key]?.trim()?ok(`${key} tersedia`):fail(`${key} wajib tersedia`);
process.env.ADMIN_JWT_SECRET?.trim()?ok('ADMIN_JWT_SECRET terpisah tersedia'):fail('ADMIN_JWT_SECRET wajib terpisah di production; admin login fail-closed bila kosong.');
process.env.AUTH_AUDIT_HASH_SECRET?.trim()?ok('AUTH_AUDIT_HASH_SECRET terpisah tersedia'):fail('AUTH_AUDIT_HASH_SECRET wajib di production agar audit IP HMAC tidak kehilangan linkage.');
process.env.TRUSTED_PROXY_MODE==='cloudflare'?ok('TRUSTED_PROXY_MODE=cloudflare'):warn(`TRUSTED_PROXY_MODE=${process.env.TRUSTED_PROXY_MODE||'(default)'}; pastikan sesuai topologi reverse proxy.`);
process.env.ADMIN_BREAK_GLASS_ENABLED==='true'?warn('ADMIN_BREAK_GLASS_ENABLED=true. Matikan setelah insiden/bootstrap selesai.'):ok('Break-glass admin tidak aktif');
(process.env.NEXT_PUBLIC_TESTING_OPEN_ACCESS !== 'false') ? warn('NEXT_PUBLIC_TESTING_OPEN_ACCESS belum false: cocok fase pengujian, tetapi paywall belum enforcement production.') : ok('Testing open access tidak aktif');

if(process.env.DATABASE_URL){
 const c=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:15000});
 try{
  await c.connect(); ok('PostgreSQL connect OK');
  const files=(await fs.readdir(path.join(process.cwd(),'database/migrations'))).filter(x=>/^\d{3}_.+\.sql$/.test(x)).sort();
  const table=await c.query(`SELECT to_regclass('public.schema_migrations')::text AS name`);
  if(!table.rows[0]?.name){fail('schema_migrations belum ada; jalankan npm run db:migrate');}
  else{
   const applied=await c.query('SELECT migration,checksum FROM schema_migrations'); const map=new Map(applied.rows.map(r=>[String(r.migration),String(r.checksum)]));
   for(const file of files){const sql=await fs.readFile(path.join(process.cwd(),'database/migrations',file),'utf8');const sum=crypto.createHash('sha256').update(sql).digest('hex'); if(!map.has(file)) fail(`migration pending: ${file}`); else if(map.get(file)!==sum) fail(`checksum migration berubah: ${file}`); else ok(`migration ${file} applied`)}
  }
  const own=await c.query(`SELECT COUNT(DISTINCT observed_date)::int snapshots,MAX(observed_date)::text latest,COUNT(*)::int rows FROM ownership_flow_history WHERE source='KSEI_HOLDING_COMPOSITION'`).catch(()=>({rows:[{}]}));
  const o=own.rows[0]??{}; Number(o.snapshots??0)>=2?ok(`Ownership Flow ${o.snapshots} snapshot; latest ${o.latest}`):warn('Ownership Flow belum punya >=2 snapshot KSEI untuk delta');
  const quarantine=await c.query(`SELECT COUNT(*)::int rows,COUNT(DISTINCT observed_date)::int snapshots FROM ownership_flow_quarantine WHERE source='KSEI_HOLDING_COMPOSITION'`).catch(()=>({rows:[{rows:0,snapshots:0}]}));
  const q=quarantine.rows[0]??{}; Number(q.rows??0)>0?warn(`Ownership Flow quarantine ${q.rows} row pada ${q.snapshots} snapshot; ini terisolasi dan tidak ikut delta`):ok('Ownership Flow quarantine kosong');
  const macro=await c.query(`SELECT input_key,value_pct::float8 AS value_pct,market_date::text,observed_date::text,usable_from_date::text,evidence_type,source_tier,source_name FROM macro_input_evidence ORDER BY usable_from_date DESC,id DESC`).catch(()=>({rows:[]}));
  const macroByKey=new Map(macro.rows.map(r=>[String(r.input_key),r]));
  const requiredMacro=['RISK_FREE_RATE_PCT','EQUITY_RISK_PREMIUM_PCT','MAX_PERPETUAL_GROWTH_PCT'];
  const missingMacro=requiredMacro.filter(k=>!macroByKey.has(k));
  if(missingMacro.length) warn(`Macro PIT evidence belum lengkap: ${missingMacro.join(', ')}; production model tetap frozen.`);
  else {
    const rf=macroByKey.get('RISK_FREE_RATE_PCT'); const erp=macroByKey.get('EQUITY_RISK_PREMIUM_PCT'); const g=macroByKey.get('MAX_PERPETUAL_GROWTH_PCT');
    ok(`Macro PIT lengkap: Rf ${rf.value_pct}% (${rf.source_name}), ERP ${erp.value_pct}% (${erp.source_name}), growth cap ${g.value_pct}% (${g.evidence_type})`);
    const ageDays=(d)=>Math.max(0,Math.floor((Date.now()-new Date(`${d}T00:00:00Z`).getTime())/86400000));
    ageDays(rf.observed_date)<=45?ok(`Risk-free evidence fresh (${ageDays(rf.observed_date)} hari)`):warn(`Risk-free evidence stale ${ageDays(rf.observed_date)} hari; refresh SBN 10Y evidence.`);
    ageDays(erp.observed_date)<=400?ok(`ERP evidence dalam annual-review window (${ageDays(erp.observed_date)} hari)`):warn(`ERP evidence >400 hari; refresh annual country ERP.`);
    g.evidence_type==='MODEL_POLICY'?ok('Perpetual-growth cap terklasifikasi MODEL_POLICY, bukan disamarkan sebagai market data'):warn('Perpetual-growth cap bukan MODEL_POLICY; review provenance.');
  }
  ['BI_RATE_PCT','INFLATION_TARGET_MID_PCT','INFLATION_TARGET_UPPER_PCT'].every(k=>macroByKey.has(k))
    ?ok('Macro context BI-Rate + inflation target tersedia sebagai evidence terpisah')
    :warn('Macro context BI-Rate/inflation target belum lengkap.');
  const bankMetric=await c.query(`SELECT
      COUNT(*) FILTER (WHERE superseded_at IS NULL)::int n,
      COUNT(*) FILTER (WHERE superseded_at IS NOT NULL)::int superseded,
      COUNT(DISTINCT ticker) FILTER (WHERE superseded_at IS NULL)::int tickers,
      COUNT(*) FILTER (WHERE superseded_at IS NULL AND evidence_type='DERIVED')::int derived,
      COUNT(*) FILTER (WHERE superseded_at IS NULL AND basis='DISCLOSED_UNSPECIFIED')::int unspecified,
      COUNT(*) FILTER (WHERE superseded_at IS NULL AND observed_date>CURRENT_DATE)::int future_observed
    FROM bank_metric_evidence`).catch(()=>({rows:[{n:0,superseded:0,tickers:0,derived:0,unspecified:0,future_observed:0}]}));
  if(Number(bankMetric.rows[0]?.n??0)>0){
    ok(`Bank metric evidence aktif ${bankMetric.rows[0].n} rows / ${bankMetric.rows[0].tickers} ticker`);
    Number(bankMetric.rows[0]?.superseded??0)>0?ok(`Bank collector correction lineage: ${bankMetric.rows[0].superseded} row superseded dan tidak ikut snapshot aktif`):ok('Bank collector belum memiliki evidence superseded');
    Number(bankMetric.rows[0]?.future_observed??0)===0?ok('Bank evidence observed_date tidak berada di masa depan'):fail(`Bank evidence memiliki ${bankMetric.rows[0].future_observed} observed_date di masa depan`);
    Number(bankMetric.rows[0]?.derived??0)>0?warn(`Bank evidence memiliki ${bankMetric.rows[0].derived} DERIVED rows aktif; jangan samakan dengan REPORTED.`):ok('Bank evidence aktif seluruhnya REPORTED');
    Number(bankMetric.rows[0]?.unspecified??0)>0?warn(`Bank evidence aktif memiliki ${bankMetric.rows[0].unspecified} row dengan basis DISCLOSED_UNSPECIFIED; tetap DATA_ONLY.`):ok('Bank evidence aktif basis eksplisit');
    const inconsistent=await c.query(`SELECT COUNT(*)::int n FROM bank_metric_evidence n JOIN bank_metric_evidence g ON g.ticker=n.ticker AND g.period_end=n.period_end AND g.basis=n.basis WHERE n.superseded_at IS NULL AND g.superseded_at IS NULL AND n.metric_key='NPL_NET_PCT' AND g.metric_key='NPL_GROSS_PCT' AND n.value>g.value`);
    Number(inconsistent.rows[0]?.n??0)===0?ok('Bank evidence aktif NPL net <= gross integrity check'):fail(`Bank evidence aktif inconsistency: ${inconsistent.rows[0].n} NPL net > gross`);
    const activeConflicts=await c.query(`SELECT COUNT(*)::int n FROM (
      SELECT ticker,period_end,basis,metric_key
        FROM bank_metric_evidence
       WHERE superseded_at IS NULL
       GROUP BY ticker,period_end,basis,metric_key
      HAVING COUNT(DISTINCT value)>1
    ) x`);
    Number(activeConflicts.rows[0]?.n??0)===0?ok('Bank evidence aktif tidak memiliki conflicting values dalam ticker/period/basis/metric'):fail(`Bank evidence aktif memiliki ${activeConflicts.rows[0].n} conflicting metric groups`);
  } else {
    const bankLegacy=await c.query(`SELECT COUNT(*)::int n,COUNT(DISTINCT ticker)::int tickers FROM bank_fundamental_history`).catch(()=>({rows:[{n:0,tickers:0}]}));
    Number(bankLegacy.rows[0]?.n??0)>0?warn(`Hanya legacy bank_fundamental_history tersedia (${bankLegacy.rows[0].n} rows); migrasikan ke metric evidence.`):warn('Bank-specific fundamental evidence belum diimpor; bank metrics tetap DATA_ONLY/null.');
  }
 }catch(e){fail(`PostgreSQL audit gagal: ${e instanceof Error?e.message:String(e)}`)}finally{await c.end().catch(()=>{})}
}

console.log('\n=== SAHAMLENS PRODUCTION INTEGRITY AUDIT ===');
for(const m of pass) console.log(`PASS  ${m}`);
for(const m of warnings) console.log(`WARN  ${m}`);
for(const m of failures) console.log(`FAIL  ${m}`);
console.log(`\nSummary: ${pass.length} pass, ${warnings.length} warn, ${failures.length} fail`);
if(failures.length) process.exitCode=1;
