import { describe, it, expect } from 'vitest';
import { id } from '../locales/id';
import { en } from '../locales/en';

describe('i18n Localization System', () => {
  it('should have parity across all dictionary keys between ID and EN', () => {
    function getKeys(obj: Record<string, any>, prefix = ''): string[] {
      return Object.keys(obj).reduce((res: string[], el: string) => {
        const key = prefix ? `${prefix}.${el}` : el;
        if (Array.isArray(obj[el])) {
          return res;
        } else if (typeof obj[el] === 'object' && obj[el] !== null) {
          return [...res, ...getKeys(obj[el], key)];
        }
        return [...res, key];
      }, []);
    }

    const idKeys = getKeys(id).sort();
    const enKeys = getKeys(en).sort();

    expect(idKeys).toEqual(enKeys);
  });

  it('should verify all critical translation sections exist', () => {
    expect(id.common.appName).toBe('SahamLens');
    expect(en.common.appName).toBe('SahamLens');
    expect(id.nav.technical).toBe('LensTechnical');
    expect(en.nav.technical).toBe('LensTechnical');
    expect(id.hero.titleLine1).toBe('Lihat Peluang');
    expect(en.hero.titleLine1).toBe('See Opportunities');
    expect(id.bento.title).toBe('Satu Terminal untuk Semua Kebutuhan Riset');
    expect(en.bento.title).toBe('One Terminal for All Your Research Needs');
  });

  it('should correctly interpolate parameter templates', () => {
    const template = id.metrics.liquidTitle; // '{count} Saham Likuid'
    const result = template.replace('{count}', '190+');
    expect(result).toBe('190+ Saham Likuid');

    const enTemplate = en.metrics.liquidTitle; // '{count} Liquid Tickers'
    const enResult = enTemplate.replace('{count}', '190+');
    expect(enResult).toBe('190+ Liquid Tickers');
  });
});
