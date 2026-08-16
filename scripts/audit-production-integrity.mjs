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
  const macro=await c.query(`SELECT effective_date::text,observed_date::text,source FROM macro_assumption_history ORDER BY effective_date DESC LIMIT 1`).catch(()=>({rows:[]}));
  macro.rows[0]?ok(`Macro audit row terbaru ${macro.rows[0].effective_date} (${macro.rows[0].source})`):warn('macro_assumption_history masih kosong; model tetap memakai frozen assumptions, bukan dummy.');
  const bank=await c.query(`SELECT COUNT(*)::int n,COUNT(DISTINCT ticker)::int tickers FROM bank_fundamental_history`).catch(()=>({rows:[{n:0,tickers:0}]}));
  Number(bank.rows[0]?.n??0)>0?ok(`Bank fundamental evidence ${bank.rows[0].n} rows / ${bank.rows[0].tickers} ticker`):warn('Bank-specific fundamental history belum diimpor; bank metrics tetap DATA_ONLY/null.');
 }catch(e){fail(`PostgreSQL audit gagal: ${e instanceof Error?e.message:String(e)}`)}finally{await c.end().catch(()=>{})}
}

console.log('\n=== SAHAMLENS PRODUCTION INTEGRITY AUDIT ===');
for(const m of pass) console.log(`PASS  ${m}`);
for(const m of warnings) console.log(`WARN  ${m}`);
for(const m of failures) console.log(`FAIL  ${m}`);
console.log(`\nSummary: ${pass.length} pass, ${warnings.length} warn, ${failures.length} fail`);
if(failures.length) process.exitCode=1;
