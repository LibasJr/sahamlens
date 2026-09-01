import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..');
const desktopApi = readFileSync(path.join(ROOT, 'desktop/src/api.ts'), 'utf8');
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
    expect(desktopApi).toContain('await clearToken()');
  });

  it('route watchlist menerima skema bearer case-insensitive dan menolak token kosong', () => {
    const route = readFileSync(path.join(ROOT, 'app/api/watchlist/desktop/route.ts'), 'utf8');
    expect(route).toContain("/^Bearer\\s+\\S+$/i");
  });
});
