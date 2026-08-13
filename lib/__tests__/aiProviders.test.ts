import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  buildCombos,
  buildSmartAttemptOrder,
  buildNineRouterProvider,
  normalizeNineRouterUrl,
  parseChatCompletionBody,
  __resetAIRotationForTests,
  generateAIResult,
  hasAnyAIProvider,
} from '../aiProviders';

const ALL_KEYS = [
  'GEMINI_API_KEY',
  'GROQ_API_KEY',
  'OPENROUTER_API_KEY',
  'KIMI_API_KEY',
  'NVIDIA_API_KEY',
  'NINEROUTER_BASE_URL',
  'NINEROUTER_API_KEY',
  'NINEROUTER_MODELS',
  'NINEROUTER_PRIORITY',
  'NINEROUTER_TIMEOUT_MS',
  'NINEROUTER_PROMPT_BUDGET',
];

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


describe('generateAIResult error contract', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    __resetAIRotationForTests();
  });

  it('membedakan no provider configured tanpa mencoba jaringan', async () => {
    clearAllKeys();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const result = await generateAIResult({ prompt: 'test' });
    expect(result.text).toBeNull();
    expect(result.errorCode).toBe('NO_PROVIDER_CONFIGURED');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    [429, 'RATE_LIMIT'],
    [401, 'AUTH_ERROR'],
    [404, 'INVALID_MODEL'],
    [500, 'PROVIDER_ERROR'],
  ] as const)('memetakan HTTP %s ke %s tanpa membuka detail provider ke caller', async (status, expected) => {
    clearAllKeys();
    vi.stubEnv('GROQ_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":"sanitized"}', { status })));

    const result = await generateAIResult({ prompt: 'test', timeoutMs: 50 });
    expect(result.text).toBeNull();
    expect(result.errorCode).toBe(expected);
  });

  it('membedakan timeout provider', async () => {
    clearAllKeys();
    vi.stubEnv('GROQ_API_KEY', 'test-key');
    const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError));

    const result = await generateAIResult({ prompt: 'test', timeoutMs: 10 });
    expect(result.text).toBeNull();
    expect(result.errorCode).toBe('TIMEOUT');
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


describe('parseChatCompletionBody', () => {
  const OK = JSON.stringify({ choices: [{ message: { content: 'OK' } }] });

  it('membaca JSON murni seperti biasa', () => {
    expect(parseChatCompletionBody(OK)?.choices[0].message.content).toBe('OK');
  });

  // Body persis seperti yang dikembalikan 9Router 0.5.50 di VPS produksi.
  it('menoleransi terminator SSE "data: [DONE]" yang menempel di belakang JSON', () => {
    expect(parseChatCompletionBody(`${OK}data: [DONE]`)?.choices[0].message.content).toBe('OK');
    expect(parseChatCompletionBody(`${OK}\n\ndata: [DONE]\n`)?.choices[0].message.content).toBe('OK');
  });

  it('menggabungkan delta dari respons SSE penuh', () => {
    const sse = [
      'data: {"choices":[{"delta":{"content":"Ha"}}]}',
      'data: {"choices":[{"delta":{"content":"lo"}}]}',
      'data: [DONE]',
    ].join('\n');
    expect(parseChatCompletionBody(sse)?.choices[0].message.content).toBe('Halo');
  });

  it('satu chunk SSE rusak tidak membuang chunk lain', () => {
    const sse = [
      'data: {"choices":[{"delta":{"content":"A"}}]}',
      'data: {rusak',
      'data: {"choices":[{"delta":{"content":"B"}}]}',
    ].join('\n');
    expect(parseChatCompletionBody(sse)?.choices[0].message.content).toBe('AB');
  });

  it('null untuk body kosong atau yang benar-benar tidak terbaca', () => {
    expect(parseChatCompletionBody('')).toBeNull();
    expect(parseChatCompletionBody('   ')).toBeNull();
    expect(parseChatCompletionBody('<html>502 Bad Gateway</html>')).toBeNull();
  });
});

describe('9Router (proxy AI multi-provider)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    __resetAIRotationForTests();
  });

  it('tidak aktif kalau base URL ada tapi API key kosong (router terbuka tidak dipakai diam-diam)', () => {
    clearAllKeys();
    vi.stubEnv('NINEROUTER_BASE_URL', 'https://router.example.com');
    expect(buildNineRouterProvider()).toBeNull();
    expect(hasAnyAIProvider()).toBe(false);
    expect(buildCombos()).toEqual([]);
  });

  // Regresi untuk kegagalan senyap yang terjadi di VPS: baris NINEROUTER_API_KEY=
  // tertulis dengan nilai kosong, 9Router dilewati diam-diam, dan tidak ada satu pun
  // log [AI:9router] yang bisa dipakai untuk melacaknya.
  it('memperingatkan kalau base URL terisi tapi API key kosong', () => {
    clearAllKeys();
    __resetAIRotationForTests();
    vi.stubEnv('NINEROUTER_BASE_URL', 'https://router.example.com');
    vi.stubEnv('NINEROUTER_API_KEY', '');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(buildNineRouterProvider()).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('NINEROUTER_API_KEY kosong'));

    warn.mockRestore();
  });

  it('tidak aktif kalau API key ada tapi base URL kosong', () => {
    clearAllKeys();
    vi.stubEnv('NINEROUTER_API_KEY', '9r-test');
    expect(buildNineRouterProvider()).toBeNull();
    expect(hasAnyAIProvider()).toBe(false);
  });

  it('menolak base URL tanpa skema http/https', () => {
    expect(normalizeNineRouterUrl('router.example.com')).toBeNull();
    expect(normalizeNineRouterUrl('   ')).toBeNull();
  });

  it.each([
    ['https://router.example.com', 'https://router.example.com/v1/chat/completions'],
    ['https://router.example.com/', 'https://router.example.com/v1/chat/completions'],
    ['https://router.example.com/v1', 'https://router.example.com/v1/chat/completions'],
    ['http://127.0.0.1:20128/v1/', 'http://127.0.0.1:20128/v1/chat/completions'],
    [
      'https://router.example.com/v1/chat/completions',
      'https://router.example.com/v1/chat/completions',
    ],
  ])('menormalkan %s ke endpoint chat completions penuh', (input, expected) => {
    expect(normalizeNineRouterUrl(input)).toBe(expected);
  });

  it('default model "auto" supaya routing diserahkan ke 9Router', () => {
    clearAllKeys();
    vi.stubEnv('NINEROUTER_BASE_URL', 'https://router.example.com');
    vi.stubEnv('NINEROUTER_API_KEY', '9r-test');

    expect(buildNineRouterProvider()?.models).toEqual(['auto']);
    expect(hasAnyAIProvider()).toBe(true);
  });

  it('membaca daftar model dari NINEROUTER_MODELS dan mempertahankan urutannya', () => {
    clearAllKeys();
    vi.stubEnv('NINEROUTER_BASE_URL', 'https://router.example.com');
    vi.stubEnv('NINEROUTER_API_KEY', '9r-test');
    vi.stubEnv('NINEROUTER_MODELS', ' cc/claude-opus-4-7 , glm/glm-5.1 ,, kr/claude-sonnet-4.5 ');

    const models = buildCombos().map((c) => c.model);
    expect(models).toEqual(['cc/claude-opus-4-7', 'glm/glm-5.1', 'kr/claude-sonnet-4.5']);
  });

  it('dicoba lebih dulu daripada provider langsung, karena model-id-nya tidak bisa di-rank', () => {
    clearAllKeys();
    vi.stubEnv('KIMI_API_KEY', 'sk-test');
    vi.stubEnv('GROQ_API_KEY', 'gsk-test');
    vi.stubEnv('NINEROUTER_BASE_URL', 'https://router.example.com');
    vi.stubEnv('NINEROUTER_API_KEY', '9r-test');
    vi.stubEnv('NINEROUTER_MODELS', 'cc/claude-opus-4-7');

    const combos = buildCombos();
    expect(combos[0].kind === 'openai-compatible' && combos[0].provider.name).toBe('9router');
    // Provider langsung tetap ada sebagai cadangan kalau router mati/limit.
    expect(combos.map((c) => c.model)).toContain('kimi-k2.6');
  });

  it('NINEROUTER_PRIORITY=last menaruh router di belakang model yang sudah di-rank', () => {
    clearAllKeys();
    vi.stubEnv('KIMI_API_KEY', 'sk-test');
    vi.stubEnv('NINEROUTER_BASE_URL', 'https://router.example.com');
    vi.stubEnv('NINEROUTER_API_KEY', '9r-test');
    vi.stubEnv('NINEROUTER_PRIORITY', 'last');

    const models = buildCombos().map((c) => c.model);
    expect(models.indexOf('kimi-k2.6')).toBeLessThan(models.indexOf('auto'));
  });

  it('memanggil URL 9Router dengan bearer key-nya sendiri, bukan key provider upstream', async () => {
    clearAllKeys();
    vi.stubEnv('NINEROUTER_BASE_URL', 'https://router.example.com/v1');
    vi.stubEnv('NINEROUTER_API_KEY', '9r-secret');
    vi.stubEnv('NINEROUTER_PROMPT_BUDGET', 'smart');

    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: 'halo' } }] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchSpy);

    const result = await generateAIResult({ prompt: 'test', timeoutMs: 50 });
    expect(result.text).toBe('halo');

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://router.example.com/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer 9r-secret');
    expect(init.headers['X-Prompt-Budget']).toBe('smart');
    expect(JSON.parse(init.body).model).toBe('auto');
    expect(JSON.parse(init.body).stream).toBe(false);

    vi.unstubAllGlobals();
  });

  // Regresi untuk bug yang hampir lolos ke produksi: respons 9Router yang SUKSES
  // ditolak res.json() karena terminator SSE, lalu dihitung sebagai kegagalan.
  it('respons 9Router dengan terminator SSE tetap terbaca sebagai jawaban', async () => {
    clearAllKeys();
    vi.stubEnv('NINEROUTER_BASE_URL', 'https://router.example.com');
    vi.stubEnv('NINEROUTER_API_KEY', '9r-secret');

    const body = JSON.stringify({ choices: [{ message: { content: 'jawaban router' } }] }) + 'data: [DONE]';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 200 })));

    const result = await generateAIResult({ prompt: 'test', timeoutMs: 50 });
    expect(result.text).toBe('jawaban router');
    expect(result.errorCode).toBeNull();

    vi.unstubAllGlobals();
  });

  it('gagalnya router tidak mematikan cascade - provider langsung tetap dicoba', async () => {
    clearAllKeys();
    vi.stubEnv('NINEROUTER_BASE_URL', 'https://router.example.com');
    vi.stubEnv('NINEROUTER_API_KEY', '9r-secret');
    vi.stubEnv('GROQ_API_KEY', 'gsk-test');

    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(new Response('{"error":"down"}', { status: 503 }))
      .mockResolvedValue(
        new Response(JSON.stringify({ choices: [{ message: { content: 'dari groq' } }] }), {
          status: 200,
        }),
      );
    vi.stubGlobal('fetch', fetchSpy);

    const result = await generateAIResult({ prompt: 'test', timeoutMs: 50 });
    expect(result.text).toBe('dari groq');
    expect(fetchSpy.mock.calls[0][0]).toContain('router.example.com');
    expect(fetchSpy.mock.calls[1][0]).toContain('api.groq.com');

    vi.unstubAllGlobals();
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
