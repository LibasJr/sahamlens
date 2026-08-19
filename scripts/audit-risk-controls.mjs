import fs from 'node:fs';
import path from 'node:path';

const checks = [];

function resolveProjectImport(fromFile, specifier) {
  if (!(specifier.startsWith('@/') || specifier.startsWith('.'))) return null;
  const base = specifier.startsWith('@/')
    ? path.resolve(specifier.slice(2))
    : path.resolve(path.dirname(fromFile), specifier);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return path.relative(process.cwd(), candidate);
  }
  return null;
}

// Setelah route handler ditipiskan, guard bisa hidup di application controller. Audit
// mengikuti dependency project secara bounded (maks 4 hop), bukan memaksa security policy
// kembali ditulis di adapter Next.js. Hanya import lokal/@ yang ditelusuri; package luar
// tidak dapat membuat sebuah route lolos audit secara kebetulan.
function dependencyContains(entryFile, needle, depth = 4, seen = new Set()) {
  if (depth < 0 || seen.has(entryFile) || !fs.existsSync(entryFile)) return false;
  seen.add(entryFile);
  const source = file(entryFile);
  if (source.includes(needle)) return true;
  const imports = [...source.matchAll(/(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g)]
    .map((match) => resolveProjectImport(entryFile, match[1]))
    .filter(Boolean);
  return imports.some((dep) => dependencyContains(dep, needle, depth - 1, seen));
}
function file(path) { return fs.readFileSync(path, 'utf8'); }
function requireCheck(id, ok, detail) { checks.push({ id, ok, detail }); }

const proxy = file('proxy.ts');
const expensiveRoutes = [
  ['S-3 dcf', '/api/dcf/:path*', 'app/api/dcf/[ticker]/route.ts'],
  ['S-3 intrinsic', '/api/intrinsic/:path*', 'app/api/intrinsic/[ticker]/route.ts'],
  ['S-3 earnings', '/api/earnings/:path*', 'app/api/earnings/[ticker]/route.ts'],
  ['S-3 compare', '/api/compare/:path*', 'app/api/compare/route.ts'],
  ['S-3 flow', '/api/flow/:path*', 'app/api/flow/[ticker]/route.ts'],
  ['S-3 live', '/api/live/:path*', 'app/api/live/[ticker]/route.ts'],
  ['S-3 stock-news', '/api/news/stock/:path*', 'app/api/news/stock/[ticker]/route.ts'],
];
// Matcher proxy dibalik jadi daftar-pengecualian pada 2026-08-19: satu pola `/api/:path*`
// menutup seluruh permukaan API, dan yang ditulis satu per satu adalah pembebasannya di
// isProxyExemptPath(). Karena itu syaratnya bukan lagi "ada matcher literal untuk endpoint
// ini" (selalu benar sekarang, jadi tidak menguji apa pun), melainkan dua hal yang masih
// bisa rusak: polanya benar-benar ada, dan endpoint mahal ini tidak ikut dibebaskan.
const PROXY_EXEMPT_PREFIXES = ['/api/cron/'];
const PROXY_EXEMPT_EXACT = ['/api/payment/notify', '/api/health', '/api/company-logo'];
const matcherCoversAllApi = proxy.includes("'/api/:path*'");
requireCheck('S-3 matcher', matcherCoversAllApi, 'satu pola /api/:path* menutup seluruh API');

for (const [id, matcher, route] of expensiveRoutes) {
  const sample = matcher.replace('/:path*', '/BBCA');
  const exempted =
    PROXY_EXEMPT_PREFIXES.some((p) => sample.startsWith(p)) || PROXY_EXEMPT_EXACT.includes(sample);
  requireCheck(
    id,
    matcherCoversAllApi && !exempted && dependencyContains(route, 'checkPublicComputeBudget'),
    `tercakup matcher, tidak dibebaskan, + route limiter`,
  );
}
for (const route of ['app/api/ai-briefing/route.ts','app/api/intrinsic-explain/route.ts']) {
  requireCheck('S-2 '+route, dependencyContains(route, 'checkAiAccountBudget'), 'AI account limiter');
}
const health = file('app/api/health/route.ts');
requireCheck('D-2', health.includes('listDataSourceHealth') && health.includes('sources:'), 'provider health exposed separately');
requireCheck('D-3', file('app/dashboard/page.tsx').includes('saat ini') && !file('lib/utils/cap-tier.ts').includes("'BLUE_CHIP'"), 'realtime label is condition, not identity');
requireCheck('D-4', fs.existsSync('modules/market/constants/manual-reference-review.ts') && fs.existsSync('scripts/audit-manual-market-references.mjs'), 'manual reference expiry guard');
requireCheck('T-1 portfolio', fs.existsSync('modules/portfolio/service/__tests__/trade.service.test.ts'), 'money-path regression tests');
requireCheck('T-1 watchlist', fs.existsSync('modules/watchlist/service/__tests__/watchlist.service.test.ts'), 'watchlist server tests');
requireCheck('T-2', file('.github/workflows/deploy-vps.yml').includes('Smoke test internal VPS setelah deploy') || file('.github/workflows/deploy-vps.yml').includes('Smoke test publik setelah deploy'), 'post-deploy smoke');
requireCheck('O-3', fs.existsSync('.github/workflows/external-health-watch.yml'), 'external scheduled probe');
requireCheck('O-1', fs.existsSync('scripts/verify-restore-drill-target.mjs') && fs.existsSync('docs/production/RESTORE_DRILL_EVIDENCE_TEMPLATE.md'), 'restore drill verifier + evidence template; execution remains operator evidence');
requireCheck('O-2', file('.github/workflows/deploy-vps.yml').includes('VPS_CF_SSH_HOST') && fs.existsSync('docs/production/CLOUDFLARE_SSH_DEPLOY.md'), 'tunnel-capable deploy; cutover remains operator action');
requireCheck('P-1', (file('components/Dashboard.tsx').includes('Alat analisis, bukan nasihat investasi') || file('lib/i18n/locales/id.ts').includes('Alat analisis, bukan nasihat investasi')), 'visible trust disclaimer');
requireCheck('P-2', fs.existsSync('shared/auth/__tests__/entitlement-production.test.ts') && fs.existsSync('docs/production/PAYWALL_STAGING_DRILL.md'), 'policy tests + staging matrix; live drill remains operator evidence');
requireCheck('P-3', file('app/transparency/page.tsx').includes('Apa arti “belum tervalidasi”?'), 'plain-language validation status');
requireCheck('S-1 residue', file('modules/user/repository/admin-audit.repository.ts').includes("'LOGIN_FAILED'"), 'failed admin login audit event');

let fail = 0;
for (const c of checks) {
  console.log(`${c.ok ? 'PASS' : 'FAIL'} ${c.id}: ${c.detail}`);
  if (!c.ok) fail++;
}
console.log(`Summary: ${checks.length - fail} pass, ${fail} fail`);
process.exitCode = fail ? 1 : 0;
