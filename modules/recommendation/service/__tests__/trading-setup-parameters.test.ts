import { describe, expect, it } from 'vitest';
import {
  buildLongTradingSetup,
  DEFAULT_TRADING_SETUP_PARAMETERS,
  type TradingSetupParameters,
} from '../trading-setup';

const history = [
  { High: 102, Low: 100, Close: 101 }, { High: 103, Low: 101, Close: 102 },
  { High: 105, Low: 102, Close: 104 }, { High: 104, Low: 101, Close: 102 },
  { High: 103, Low: 100, Close: 101 }, { High: 105, Low: 102, Close: 104 },
  { High: 106, Low: 100, Close: 102 }, { High: 108, Low: 103, Close: 106 },
  { High: 110, Low: 105, Close: 108 }, { High: 114, Low: 108, Close: 112 },
  { High: 125, Low: 112, Close: 120 }, { High: 130, Low: 116, Close: 122 },
  { High: 126, Low: 114, Close: 118 }, { High: 120, Low: 108, Close: 112 },
  { High: 114, Low: 104, Close: 108 }, { High: 112, Low: 103, Close: 106 },
  { High: 111, Low: 103, Close: 106 }, { High: 112, Low: 104, Close: 108 },
  { High: 114, Low: 105, Close: 110 }, { High: 116, Low: 106, Close: 108 },
];

describe('trading setup parameterization', () => {
  it('caller tanpa override tetap memakai production default', () => {
    const setup = buildLongTradingSetup(history, 108, 5);
    expect(setup).not.toBeNull();
    expect(setup?.parameters).toEqual(DEFAULT_TRADING_SETUP_PARAMETERS);
  });

  it('validation override memakai fungsi yang sama tanpa mengubah default global', () => {
    const wider: TradingSetupParameters = {
      supportBufferAtr: 0.35, minStopDistanceAtr: 1, fallbackStopAtr: 2,
      minLongRr: 1.5, tp1R: 2, tp2R: 3,
    };
    const setup = buildLongTradingSetup(history, 108, 5, wider);
    expect(setup).not.toBeNull();
    expect(setup?.parameters).toEqual(wider);
    expect(DEFAULT_TRADING_SETUP_PARAMETERS.fallbackStopAtr).toBe(1.5);
  });

  it('fail-closed untuk kombinasi parameter tidak valid', () => {
    expect(buildLongTradingSetup(history, 108, 5, { tp1R: 1, minLongRr: 1.5 })).toBeNull();
  });
});
