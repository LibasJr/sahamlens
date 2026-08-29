import { describe, expect, it } from 'vitest';
import { getFlowSourceFromAnalyzers, getForeignFlowInterpretation } from '../foreign-flow-interpretation';

describe('getForeignFlowInterpretation', () => {
  it('menandai foreign-flow active untuk emiten large/liquid dengan flow resmi IDX', () => {
    expect(getForeignFlowInterpretation({
      capTier: 'LARGE_LIQUID_CURRENT',
      isLq45: false,
      source: 'IDX_OFFICIAL_API',
    }).kind).toBe('FOREIGN_FLOW_ACTIVE');
  });

  it('menandai domestic-driven context untuk small/thin non-LQ45 walau flow resmi tersedia', () => {
    const result = getForeignFlowInterpretation({
      capTier: 'SMALL_OR_THIN_CURRENT',
      isLq45: false,
      source: 'IDX_OFFICIAL_API',
    });
    expect(result.kind).toBe('DOMESTIC_DRIVEN_CONTEXT');
    expect(result.shortLabel).toBe('Domestic-driven');
  });

  it('tidak menurunkan LQ45 ke domestic-driven hanya karena tier current small/thin', () => {
    expect(getForeignFlowInterpretation({
      capTier: 'SMALL_OR_THIN_CURRENT',
      isLq45: true,
      source: 'IDX_OFFICIAL_API',
    }).kind).toBe('FOREIGN_FLOW_ACTIVE');
  });

  it('fail closed ke sparse kalau sumber flow resmi tidak tersedia', () => {
    expect(getForeignFlowInterpretation({
      capTier: 'LARGE_LIQUID_CURRENT',
      isLq45: true,
      source: null,
    }).kind).toBe('FOREIGN_FLOW_SPARSE');
  });
});

describe('getFlowSourceFromAnalyzers', () => {
  it('membaca sumber IDX resmi dari analyzer flow raw', () => {
    expect(getFlowSourceFromAnalyzers([
      { dimension: 'FLOW', label: 'Bandarmology (Net Asing)', raw: { source: 'IDX_OFFICIAL_API' } },
    ])).toBe('IDX_OFFICIAL_API');
  });

  it('tidak menganggap proxy CMF sebagai flow resmi', () => {
    expect(getFlowSourceFromAnalyzers([
      { dimension: 'FLOW', label: 'Bandarmology (CMF)', raw: { source: 'YAHOO_CMF_PROXY' } },
    ])).toBeNull();
  });
});
