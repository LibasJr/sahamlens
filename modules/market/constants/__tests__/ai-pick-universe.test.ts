import { describe, expect, it } from 'vitest';
import { BACKTEST_UNIVERSE } from '../../../backtest/constants/backtest-universe';
import {
  ACTIVE_LIQUID_UNIVERSE_TARGET_SIZE,
  ACTIVE_LIQUID_UNIVERSE_VERSION,
  AI_PICK_UNIVERSE,
  AI_PICK_UNIVERSE_ADDITIONS,
  LEGACY_VALIDATED_UNIVERSE_VERSION,
  LEGACY_VALIDATED_UNIVERSE_SIZE,
} from '../ai-pick-universe';
import { getEmitenSymbolSet } from '../../../../shared/market/emiten-list';

describe('AI_PICK_UNIVERSE active universe', () => {
  it('memakai versi idx-liquid-v2-200 dengan tepat 200 ticker', () => {
    expect(ACTIVE_LIQUID_UNIVERSE_VERSION).toBe('idx-liquid-v2-200');
    expect(AI_PICK_UNIVERSE).toHaveLength(ACTIVE_LIQUID_UNIVERSE_TARGET_SIZE);
    expect(AI_PICK_UNIVERSE).toHaveLength(200);
  });

  it('mempertahankan 109 ticker legacy yang menjadi basis histori lama', () => {
    expect(BACKTEST_UNIVERSE).toHaveLength(LEGACY_VALIDATED_UNIVERSE_SIZE);
    expect(AI_PICK_UNIVERSE.slice(0, LEGACY_VALIDATED_UNIVERSE_SIZE)).toEqual(BACKTEST_UNIVERSE);
    expect(LEGACY_VALIDATED_UNIVERSE_VERSION).toBe('idx-liquid-v1-109');
  });

  it('tidak memiliki ticker duplikat', () => {
    expect(new Set(AI_PICK_UNIVERSE).size).toBe(AI_PICK_UNIVERSE.length);
  });

  it('membedakan tambahan v2 dari universe legacy secara deterministik', () => {
    expect(AI_PICK_UNIVERSE_ADDITIONS).toHaveLength(91);
    expect(AI_PICK_UNIVERSE_ADDITIONS).toEqual(AI_PICK_UNIVERSE.slice(LEGACY_VALIDATED_UNIVERSE_SIZE));
    expect(AI_PICK_UNIVERSE_ADDITIONS.slice(0, 5)).toEqual(['BUMI.JK', 'BUVA.JK', 'KOTA.JK', 'AADI.JK', 'VKTR.JK']);
    expect(AI_PICK_UNIVERSE_ADDITIONS.slice(-5)).toEqual(['GOLF.JK', 'PGUN.JK', 'GEMS.JK', 'DEPO.JK', 'CITY.JK']);
  });

  it('hanya berisi ticker IDX valid yang tersedia di listing project', () => {
    const symbols = getEmitenSymbolSet();
    const legacySymbols = new Set(BACKTEST_UNIVERSE.map((ticker) => ticker.replace('.JK', '')));
    const invalidFormat = AI_PICK_UNIVERSE.filter((ticker) => !/^[A-Z0-9]{4}\.JK$/.test(ticker));
    const missingFromProjectData = AI_PICK_UNIVERSE.filter((ticker) => {
      const symbol = ticker.replace('.JK', '');
      return !symbols.has(symbol) && !legacySymbols.has(symbol);
    });

    expect(invalidFormat).toEqual([]);
    expect(missingFromProjectData).toEqual([]);
  });
});
