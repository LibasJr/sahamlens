import { describe, expect, it } from 'vitest';
import { LENS_SCORE_MODEL_HASH, LENS_SCORE_MODEL_METADATA, LENS_SCORE_MODEL_SPEC, modelSpecificationHash } from '../lens-score-model';

describe('frozen LensScore model specification', () => {
  it('has an explicit research-only identity', () => {
    expect(LENS_SCORE_MODEL_METADATA).toMatchObject({
      id: 'lens-score',
      version: 'lens-score-v1.6.0',
      status: 'RESEARCH_ONLY',
    });
    // Perubahan parameter tanpa update versi/hash harus terlihat sebagai kegagalan test,
    // bukan diam-diam mengubah arti skor historis dengan nama model yang sama.
    expect(LENS_SCORE_MODEL_HASH).toBe('fnv1a32-2b2f012f');
  });

  it('hashes object keys canonically', () => {
    expect(modelSpecificationHash({ b: 2, a: 1 })).toBe(modelSpecificationHash({ a: 1, b: 2 }));
  });

  it('changes identity when a model parameter changes', () => {
    const changed = { ...LENS_SCORE_MODEL_SPEC, indicatorParameters: { ...LENS_SCORE_MODEL_SPEC.indicatorParameters, rsiPeriod: 10 } };
    expect(modelSpecificationHash(changed)).not.toBe(LENS_SCORE_MODEL_HASH);
  });
});
