import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const adminPage = readFileSync(new URL('../app/admin/page.tsx', import.meta.url), 'utf8');

describe('admin auth boundaries', () => {
  it('admin page tetap mengarahkan guest ke admin-login di server component', () => {
    expect(adminPage).toContain("redirect('/admin-login')");
    expect(adminPage).toContain('if (!(await isAdminServer()))');
  });

  it('admin-status hanya menandai status admin tanpa membocorkan data sensitif', () => {
    const route = readFileSync(new URL('../app/api/admin-status/route.ts', import.meta.url), 'utf8');
    expect(route).toContain('handleAdminStatus(await cookies())');
    expect(route).toContain('runController');
  });

  it('shadow-ledger admin page dan API rute dilindungi oleh isAdminServer', () => {
    const page = readFileSync(new URL('../app/admin/shadow-ledger/page.tsx', import.meta.url), 'utf8');
    expect(page).toContain("redirect('/admin-login')");
    expect(page).toContain('if (!(await isAdminServer()))');

    const apiRoute = readFileSync(new URL('../app/api/admin/shadow-ledger/route.ts', import.meta.url), 'utf8');
    expect(apiRoute).toContain('if (!(await isAdminServer()))');
    expect(apiRoute).toContain('status: 401');
  });

  it('tautan shadow-ledger di Sidebar hanya ada di grup admin', () => {
    const sidebar = readFileSync(new URL('../components/Sidebar.tsx', import.meta.url), 'utf8');
    const adminGroupStart = sidebar.indexOf('const ADMIN_NAV_GROUP');
    const accessFunctionStart = sidebar.indexOf('function visibleGroupsFor');
    const shadowLink = sidebar.indexOf("path: '/admin/shadow-ledger'");

    expect(adminGroupStart).toBeGreaterThan(-1);
    expect(shadowLink).toBeGreaterThan(adminGroupStart);
    expect(shadowLink).toBeLessThan(accessFunctionStart);
  });
});
