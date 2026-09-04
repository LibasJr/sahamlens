import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const page = readFileSync(path.join(root, 'app/admin/ara-scanner/page.tsx'), 'utf8');
const route = readFileSync(path.join(root, 'app/api/admin/ara-scanner/route.ts'), 'utf8');
const sidebar = readFileSync(path.join(root, 'components/Sidebar.tsx'), 'utf8');

describe('ARA scanner admin boundary', () => {
  it('mengunci halaman dengan pemeriksaan admin di server', () => {
    expect(page).toContain("if (!(await isAdminServer())) redirect('/admin-login')");
    expect(page).toContain("robots: { index: false, follow: false }");
  });

  it('mengunci API dengan sesi admin dan tidak memasang cache publik', () => {
    expect(route).toContain('await requireAdminSession()');
    expect(route).toContain('runController');
    expect(route).not.toContain('publicCacheHeaders');
  });

  it('menaruh tautan hanya di grup navigasi admin', () => {
    const adminGroupStart = sidebar.indexOf('const ADMIN_NAV_GROUP');
    const accessFunctionStart = sidebar.indexOf('function visibleGroupsFor');
    const araLink = sidebar.indexOf("path: '/admin/ara-scanner'");

    expect(adminGroupStart).toBeGreaterThan(-1);
    expect(araLink).toBeGreaterThan(adminGroupStart);
    expect(araLink).toBeLessThan(accessFunctionStart);
  });
});
