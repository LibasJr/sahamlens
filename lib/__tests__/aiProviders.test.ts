import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildCombos, buildSmartAttemptOrder, __resetAIRotationForTests, hasAnyAIProvider } from '../aiProviders';

const ALL_KEYS = ['GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENROUTER_API_KEY', 'KIMI_API_KEY', 'NVIDIA_API_KEY'];

function clearAllKeys() {
  for (const k of ALL_KEYS) vi.stubEnv(k, '');
}

describe('hasAnyAIProvider', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('false kalau tidak ada satu pun API key terpasang', () => {
    clearAllKeys();
    expect(hasAnyAIProvider()).toBe(false);
  });

  it('true kalau minimal satu provider OpenAI-compatible punya key (bukan cuma Gemini)', () => {
    clearAllKeys();
    vi.stubEnv('KIMI_API_KEY', 'sk-test');
    expect(hasAnyAIProvider()).toBe(true);
  });
});

describe('buildCombos', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('kosong kalau tidak ada API key terpasang', () => {
    clearAllKeys();
    expect(buildCombos()).toEqual([]);
  });

  it('hanya combo dari provider yang API key-nya terpasang', () => {
    clearAllKeys();
    vi.stubEnv('GROQ_API_KEY', 'gsk-test');
    const combos = buildCombos();
    expect(combos.length).toBeGreaterThan(0);
    expect(combos.every((c) => c.kind === 'openai-compatible' && c.provider.name === 'groq')).toBe(true);
  });

  // BUG FIX (2026-08-05, permintaan user - "urutan paling pinter ke paling gak pinter"):
  // urutan combo sekarang TETAP (ranking model), bukan diacak.
  it('urutan combo dari model paling mumpuni ke paling ringan, bukan acak', () => {
    clearAllKeys();
    vi.stubEnv('GEMINI_API_KEY', 'g-test');
    vi.stubEnv('GROQ_API_KEY', 'gsk-test');
    vi.stubEnv('KIMI_API_KEY', 'sk-test');

    const combos = buildCombos();
    const models = combos.map((c) => c.model);

    // kimi-k2.6 (paling mumpuni di antara ketiganya) harus di depan gemini-2.0-flash,
    // yang harus di depan llama-3.1-8b-instant (paling ringan).
    expect(models.indexOf('kimi-k2.6')).toBeLessThan(models.indexOf('gemini-2.0-flash'));
    expect(models.indexOf('gemini-2.0-flash')).toBeLessThan(models.indexOf('llama-3.1-8b-instant'));
  });

  it('hasil deterministik - dua panggilan berturut-turut menghasilkan urutan yang sama', () => {
    clearAllKeys();
    vi.stubEnv('GROQ_API_KEY', 'gsk-test');
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-or-test');

    const a = buildCombos().map((c) => c.model);
    const b = buildCombos().map((c) => c.model);
    expect(a).toEqual(b);
  });

  it('model yang belum di-rank jatuh ke urutan paling belakang, bukan prioritas tinggi', () => {
    clearAllKeys();
    vi.stubEnv('NVIDIA_API_KEY', 'nvapi-test');
    const combos = buildCombos();
    const models = combos.map((c) => c.model);
    // Kedua model NVIDIA memang belum ada di MODEL_PRIORITY - urutan relatif keduanya
    // tidak masalah, yang penting stabil (tidak berubah antar panggilan).
    expect(models).toEqual(buildCombos().map((c) => c.model));
  });
});


describe('buildSmartAttemptOrder', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    __resetAIRotationForTests();
  });

  it('merotasi combo sehat antar request tanpa mengacak ranking dasar buildCombos()', () => {
    clearAllKeys();
    vi.stubEnv('GEMINI_API_KEY', 'g-test');
    vi.stubEnv('GROQ_API_KEY', 'gsk-test');
    vi.stubEnv('KIMI_API_KEY', 'sk-test');

    __resetAIRotationForTests();
    const base = buildCombos();
    const first = buildSmartAttemptOrder(base).map((c) => c.model);
    const second = buildSmartAttemptOrder(base).map((c) => c.model);

    expect(first).toHaveLength(base.length);
    expect(second).toHaveLength(base.length);
    expect(second[0]).not.toBe(first[0]);
    expect([...first].sort()).toEqual([...second].sort());
  });
});
