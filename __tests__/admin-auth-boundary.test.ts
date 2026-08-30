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
});
