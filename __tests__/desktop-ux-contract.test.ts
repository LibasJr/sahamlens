import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), 'utf8');

describe('kontrak UX desktop', () => {
  it('shortcut pencarian global bekerja lintas Windows dan macOS', () => {
    const header = read('desktop/src/components/GlobalHeader.tsx');
    expect(header).toContain("event.key.toLowerCase() === 'k'");
    expect(header).toContain('(event.metaKey || event.ctrlKey)');
    expect(header).toContain('searchInput.current?.focus()');
  });

  it('pencarian membedakan gagal API dari hasil kosong', () => {
    const header = read('desktop/src/components/GlobalHeader.tsx');
    expect(header).toContain('setSearchError(');
    expect(header).toContain('Pencarian emiten tidak dapat terhubung');
    expect(header).toContain('Ticker atau nama emiten tidak ditemukan');
  });

  it('dialog akun menutup dengan Escape dan menjaga fokus di dalam dialog', () => {
    const modal = read('desktop/src/components/AccountModal.tsx');
    expect(modal).toContain("event.key === 'Escape'");
    expect(modal).toContain("event.key !== 'Tab'");
    expect(modal).toContain('previousFocus.current?.focus()');
  });

  it('oscillator tidak menggunakan price scale candlestick', () => {
    const chart = read('desktop/src/components/ChartPanel.tsx');
    expect(chart).toContain("'#a78bfa', 'oscillator'");
    expect(chart).toContain("'#f97316', 'obv'");
    expect(chart).toContain("'#fb7185', 'atr'");
  });
});
