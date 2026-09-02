import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const read = (path: string) => readFileSync(path, 'utf8');
const css = read('desktop/src/v013.css');
const screener = read('desktop/src/components/MarketScreener.tsx');
const intelligence = read('desktop/src/components/OperationsWorkspace.tsx');

describe('Desktop v0.1.3 screenshot regressions', () => {
  it('menjaga semua menu sidebar termasuk Pengaturan dan Akun sebagai ikon dengan tooltip', () => {
    expect(css).toContain('.app-navigation .nav-items button span,.app-navigation .nav-bottom button span');
    expect(css).toContain('visibility:hidden');
    expect(css).toContain('.app-navigation .nav-bottom button:hover span');
    expect(css).toContain('place-items:center!important');
  });
  it('membuat Lens AI drawer stabil dan dapat discroll tanpa overflow halaman', () => {
    expect(css).toContain('.lens-ai-drawer{overflow:hidden}');
    expect(css).toContain('.lens-ai-drawer .lens-ai-answer{min-height:0;overflow:auto}');
    expect(css).toContain('max-width:calc(100vw - 64px)');
  });
  it('menyediakan screener multi-faktor setara struktur web, bukan tabel empat kolom', () => {
    for (const text of ['Seleksi Profil Risiko Investor', 'Preset Parameter (1-Klik)', 'Market Cap Min', 'Likuiditas Min', 'Kualitas Profit', 'Bandarmology']) expect(screener).toContain(text);
    expect(screener).toContain("new URLSearchParams({ profile })");
    expect(screener).toContain("'N/A'");
  });
  it('meringkas Insight Pasar maksimal satu panel dan tidak merender payload API generik', () => {
    expect(intelligence).toContain('<MarketInsightSummary market={market} error={error} />');
    expect(intelligence).not.toContain("tab === 'insight' ? <FeatureWorkspace");
    expect(intelligence).toContain('Sektor terkuat');
    expect(css).toContain('.market-insight-summary');
  });
  it('tidak mengubah tab yang tidak dikenal menjadi Market Pulse', () => {
    const main = read('desktop/src/main.tsx');
    expect(main).not.toContain('?? desktopFeatures[0]');
    expect(main).toContain('Fitur desktop tidak terdaftar');
    for (const label of ['Analisis Emiten', 'Consensus Agent AI', 'Bandarmology', 'Research Tools']) expect(main).toContain(label);
  });
  it('memutar candle backtest satu emiten secara bertahap seperti web', () => {
    const backtest = read('desktop/src/components/BacktestWorkspace.tsx');
    expect(backtest).toContain("getPublicChart(code, '10Y')");
    expect(backtest).toContain('Number(period) * 22');
    expect(backtest).toContain('<CandleReplay candles={candles} visible={visible} />');
    for (const control of ['Backtest', 'Start', 'Stop', 'Ulang', '24 bulan']) expect(backtest).toContain(control);
    expect(backtest).toContain('requestAnimationFrame');
  });
  it('menjaga metadata installer pada 0.1.3', () => {
    expect(JSON.parse(read('desktop/package.json')).version).toBe('0.1.3');
    expect(JSON.parse(read('desktop/src-tauri/tauri.conf.json')).version).toBe('0.1.3');
  });
});
