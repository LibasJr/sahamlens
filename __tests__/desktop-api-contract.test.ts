import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..');
const desktopApi = readFileSync(path.join(ROOT, 'desktop/src/api.ts'), 'utf8');
const desktopFeatures = readFileSync(path.join(ROOT, 'desktop/src/components/FeatureWorkspace.tsx'), 'utf8');
const desktopBacktest = readFileSync(path.join(ROOT, 'desktop/src/components/BacktestWorkspace.tsx'), 'utf8');
const requiredRoutes = [
  'app/api/auth/desktop/login/route.ts',
  'app/api/tickers/search/route.ts',
  'app/api/watchlist/desktop/route.ts',
  'app/api/admin/desktop-overview/route.ts',
];

describe('kontrak API desktop', () => {
  it.each(requiredRoutes)('%s tersedia pada branch yang membangun installer', (route) => {
    expect(existsSync(path.join(ROOT, route)), `${route} tidak boleh tertinggal di branch desktop`).toBe(true);
  });

  it('mengirim bearer token untuk endpoint akun dan fitur privat', () => {
    expect(desktopApi).toContain("headers.set('Authorization', `Bearer ${token}`)");
    expect(desktopApi).toContain("requestFeature('/api/auth/me'");
    expect(desktopApi).toContain("requestFeature('/api/watchlist/desktop'");
    expect(desktopApi).toContain("requestFeature('/api/admin/desktop-overview'");
  });

  it('memvalidasi sesi bearer sesudah token disimpan sebelum login dinyatakan berhasil', () => {
    expect(desktopApi).toContain('await saveToken(payload.token)');
    expect(desktopApi).toContain('await getAccount(baseUrl)');
    expect(desktopApi).toContain('await clearToken().catch(() => undefined)');
    expect(desktopApi).toContain('Credential diterima server, tetapi token gagal disimpan aman');
    expect(desktopApi).toContain('meta?.requestId');
  });

  it('route watchlist menerima skema bearer case-insensitive dan menolak token kosong', () => {
    const route = readFileSync(path.join(ROOT, 'app/api/watchlist/desktop/route.ts'), 'utf8');
    expect(route).toContain("/^Bearer\\s+\\S+$/i");
  });

  it('menu riset emiten menunjuk route server yang tersedia', () => {
    const routeContracts = [
      ['/api/stock/', 'app/api/stock/[ticker]/route.ts'],
      ['/api/fundamental/', 'app/api/fundamental/[ticker]/route.ts'],
      ['/api/dcf/', 'app/api/dcf/[ticker]/route.ts'],
      ['/api/earnings/', 'app/api/earnings/[ticker]/route.ts'],
      ['/api/ownership-flow/', 'app/api/ownership-flow/[ticker]/route.ts'],
    ] as const;

    for (const [endpoint, route] of routeContracts) {
      expect(desktopFeatures).toContain(endpoint);
      expect(existsSync(path.join(ROOT, route)), `${route} wajib tersedia untuk menu desktop`).toBe(true);
    }
  });

  it('membaca nama field hasil backtest sesuai kontrak API server', () => {
    for (const field of ['return', 'ihsgReturn', 'alpha', 'winRate', 'maxDD']) {
      expect(desktopBacktest).toContain(`result.${field}`);
    }
    expect(desktopBacktest).not.toContain('result.returnPct');
    expect(desktopBacktest).not.toContain('result.ihsgReturnPct');
  });
});
