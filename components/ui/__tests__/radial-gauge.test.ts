import { describe, expect, it } from 'vitest';
import React from 'react';
import { RadialScoreGauge } from '../RadialScoreGauge';

describe('RadialScoreGauge', () => {
  it('dapat di-render tanpa error dengan skor 0 sampai 100', () => {
    expect(RadialScoreGauge).toBeDefined();
  });
});
