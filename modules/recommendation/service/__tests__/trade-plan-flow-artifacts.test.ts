import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { analyzeOfficialForeignFlow, getRealForeignFlow } from '@/modules/market';
import { resolveTradePlanOfficialFlow } from '../trade-plan-flow';

/**
 * Probe terhadap artefak SUNGGUHAN di `data/foreign-flow/`, bukan fixture.
 *
 * Unit test di trade-plan-flow.test.ts membuktikan logikanya benar terhadap masukan yang
 * disusun tangan. Yang TIDAK dibuktikannya: apakah artefak produksi benar-benar berbentuk
 * seperti yang diandaikan. Dua hal itu pernah berbeda di repo ini.
 *
 * CI tidak membawa `data/`, jadi test ini melewati dirinya sendiri di sana. Pembacaan
 * direktori WAJIB berada di dalam `it` - `describe.skipIf` tetap menjalankan body describe
 * saat pengumpulan test, sehingga `readdirSync` di tingkat describe melempar ENOENT dan
 * menggagalkan seluruh suite di runner yang tidak punya artefak. Terukur 13 September 2026.
 */
const DATA_DIR = path.join(process.cwd(), 'data', 'foreign-flow');

function artifactCodes(): string[] {
  try {
    return fs
      .readdirSync(DATA_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace('.json', ''));
  } catch {
    return [];
  }
}

describe('arus asing resmi terhadap artefak nyata', () => {
  it('memutuskan setiap artefak tanpa melempar dan tanpa hasil setengah jadi', () => {
    const codes = artifactCodes();

    if (codes.length === 0) {
      // Tidak ada artefak (checkout CI). Dilewati secara eksplisit, bukan lulus diam-diam.
      expect(fs.existsSync(DATA_DIR)).toBe(false);
      return;
    }

    // Penjaga jumlah: kalau direktorinya ADA tapi isinya menciut drastis, pemindainya
    // atau sinkronisasinya yang rusak - bukan berarti tidak ada apa-apa untuk diperiksa
    // (pola yang sama dengan quote-summary-modules.test.ts).
    expect(codes.length).toBeGreaterThan(100);

    const tally: Record<string, number> = {};

    for (const code of codes) {
      const series = getRealForeignFlow(code, 20);
      const analysis = series ? analyzeOfficialForeignFlow(series.history) : null;
      const resolved = resolveTradePlanOfficialFlow(analysis, new Date());

      const key = resolved.rejection ?? 'USED';
      tally[key] = (tally[key] ?? 0) + 1;

      // Invarian inti: dipakai berarti KEDUA angka ada; ditolak berarti KEDUANYA null.
      // Tidak boleh ada keadaan setengah - itu yang membuat confidence bisa naik tanpa data.
      if (resolved.rejection === null) {
        expect(typeof resolved.officialNetPressure20).toBe('number');
        expect(typeof resolved.officialPositiveRatio20).toBe('number');
        expect(resolved.officialPositiveRatio20).toBeGreaterThanOrEqual(0);
        expect(resolved.officialPositiveRatio20).toBeLessThanOrEqual(1);
      } else {
        expect(resolved.officialNetPressure20).toBeNull();
        expect(resolved.officialPositiveRatio20).toBeNull();
      }
    }

    // Dilaporkan supaya perubahan cakupan terlihat di log, bukan disimpulkan diam-diam.
    console.log('[trade-plan-flow] sebaran keputusan artefak nyata:', JSON.stringify(tally));
  }, 30_000);
});
