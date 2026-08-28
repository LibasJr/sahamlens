import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const page = fs.readFileSync(path.join(__dirname, '..', 'page.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('/recommendations user-facing terminology', () => {
  it('tidak menyebut output sebagai rekomendasi transaksi di copy pengguna', () => {
    expect(page).not.toMatch(/rekomendasi (saham|terbaik|lainnya|BUY|SELL|beli|jual)/i);
    expect(page).toContain('ide riset');
    expect(page).toContain('bukan arahan beli/jual');
  });
});
