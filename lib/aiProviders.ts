import { GoogleGenerativeAI } from '@google/generative-ai';

// Council AI multi-provider - sebelumnya SELURUH app cuma bisa pakai Gemini, dan kuota
// gratis Gemini dibatasi PER MODEL PER HARI (20/hari/model - lihat lib/gemini.ts versi
// lama). Strategi sekarang: smart rotation antar combo yang sehat + cooldown otomatis
// untuk 429/timeout/error, lalu cascade sampai satu berhasil. Kalau semua gagal, return
// null dan caller pakai fallback lokalnya masing-masing (sudah ada di semua tempat).
//
// REWRITE (2026-08-05): sebelumnya tiap provider punya cabang if/else sendiri di
// generateAI() - nambah provider baru berarti menyalin ulang seluruh blok
// callOpenAICompatible() dengan resiko salah tempel URL/header. Sekarang provider
// (kecuali Gemini, yang API-nya beda bentuk total - lihat callGemini()) didaftarkan
// sebagai DATA di OPENAI_COMPATIBLE_PROVIDERS - nambah provider baru = nambah 1 entri,
// bukan nambah cabang kode.

// BUG FIX (audit logika & algoritma 2026-08-05, temuan L-2): tiga nama model terakhir di
// daftar lama ('gemini-3.5-flash', 'gemini-3.6-flash', 'gemini-3.1-flash-lite') tidak
// merujuk model yang benar-benar ada. Karena urutan combo diacak, tiap panggilan AI
// berpeluang membuang beberapa percobaan (dan waktu timeout) ke model yang PASTI gagal
// sebelum sampai ke yang berfungsi - biaya latensi murni, tanpa manfaat. Disisakan hanya
// nama model yang terverifikasi.
//
// BUG FIX (2026-08-05, diagnostik log produksi): 'gemini-2.5-flash' DIHAPUS - log
// menunjukkan [404 Not Found] untuk model ini secara konsisten. TIDAK diganti nama lain
// tanpa verifikasi (itu justru masalah yang barusan diperbaiki di atas) - disisakan
// 'gemini-2.0-flash' yang terkonfirmasi ADA (responsnya 429 kuota, bukan 404 tidak
// ditemukan - beda jelas: nama modelnya benar, cuma jatah harian yang habis).
const GEMINI_MODELS = [
  'gemini-2.0-flash',
];

interface OpenAICompatibleProvider {
  /** Dipakai sebagai key env var (`${envPrefix}_API_KEY`) DAN label log. */
  name: string;
  envVar: string;
  url: string;
  models: string[];
  extraHeaders?: Record<string, string>;
}

// Tiap entri diverifikasi manual lewat endpoint publik provider (`GET {base}/models`
// dengan API key sungguhan) SEBELUM ditambahkan - lihat tanggal & catatan di tiap entri.
// JANGAN tambah/ganti nama model tanpa verifikasi yang sama; katalog gratis (terutama
// OpenRouter) berubah tanpa peringatan (lihat riwayat panjang di catatan OpenRouter).
const OPENAI_COMPATIBLE_PROVIDERS: OpenAICompatibleProvider[] = [
  {
    // Kuota gratis jauh lebih besar dari Gemini per API key (Llama via LPU Groq).
    name: 'groq',
    envVar: 'GROQ_API_KEY',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
  },
  {
    // BUG FIX (2026-08-05, diagnostik log produksi): ketiga slug lama SEMUA 404 -
    // OpenRouter mengganti/menghapus model ":free" secara berkala (bukan salah ketik/basi
    // karena lupa update, tapi memang sifat katalognya). Log produksi persis menunjukkan
    // pesan error resmi OpenRouter untuk masing-masing:
    //   deepseek/deepseek-chat:free -> "gunakan deepseek/deepseek-chat"
    //   meta-llama/llama-3.3-70b-instruct:free -> "gunakan meta-llama/llama-3.3-70b-instruct"
    //   google/gemini-2.0-flash-exp:free -> "No endpoints found"
    // Diganti ke slug yang DIKONFIRMASI ada (GET openrouter.ai/api/v1/models, endpoint
    // publik tanpa API key, 2026-08-05). Kalau [AI:openrouter] log penuh 404 lagi, cek
    // ulang endpoint publik itu - jangan tebak nama model.
    name: 'openrouter',
    envVar: 'OPENROUTER_API_KEY',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    models: [
      'google/gemma-4-31b-it:free',
      'openai/gpt-oss-20b:free',
      'nvidia/nemotron-3-super-120b-a12b:free',
    ],
    extraHeaders: { 'HTTP-Referer': 'https://sahamlens.vercel.app', 'X-Title': 'SahamLens' },
  },
  {
    // Kimi (Moonshot AI) - diverifikasi 2026-08-05 lewat GET api.moonshot.ai/v1/models
    // dengan key sungguhan (200, model persis seperti di bawah). Varian "-code" sengaja
    // tidak dipakai - prompt aplikasi ini analisis teks/JSON keuangan, bukan coding.
    name: 'kimi',
    envVar: 'KIMI_API_KEY',
    url: 'https://api.moonshot.ai/v1/chat/completions',
    models: ['kimi-k2.6'],
  },
  {
    // NVIDIA NIM (build.nvidia.com) - diverifikasi 2026-08-05 lewat GET
    // integrate.api.nvidia.com/v1/models dengan key sungguhan (200, 102 model). Dipilih
    // 2 model kecil/cepat dari katalog itu (bukan model raksasa 70B+/253B) supaya cocok
    // dengan anggaran timeout cascade (8-10 detik per percobaan).
    name: 'nvidia',
    envVar: 'NVIDIA_API_KEY',
    url: 'https://integrate.api.nvidia.com/v1/chat/completions',
    models: ['meta/llama-3.1-8b-instruct', 'nvidia/llama-3.1-nemotron-nano-8b-v1'],
  },
];

type Combo =
  | { kind: 'gemini'; model: string; envVar: string }
  | { kind: 'openai-compatible'; provider: OpenAICompatibleProvider; model: string };


type FailureKind = 'rate-limit' | 'auth' | 'not-found' | 'timeout' | 'server' | 'other';

interface ComboHealth {
  consecutiveFailures: number;
  cooldownUntil: number;
  lastFailureKind?: FailureKind;
}

const globalForAIRotation = globalThis as unknown as {
  __sahamlensAIRotationCursor?: number;
  __sahamlensAIHealth?: Map<string, ComboHealth>;
};

function healthStore(): Map<string, ComboHealth> {
  if (!globalForAIRotation.__sahamlensAIHealth) {
    globalForAIRotation.__sahamlensAIHealth = new Map();
  }
  return globalForAIRotation.__sahamlensAIHealth;
}

function comboKey(combo: Combo): string {
  return combo.kind === 'gemini'
    ? `gemini:${combo.model}`
    : `${combo.provider.name}:${combo.model}`;
}

function cooldownMs(kind: FailureKind, consecutiveFailures: number): number {
  const multiplier = Math.min(Math.max(consecutiveFailures, 1), 4);
  switch (kind) {
    case 'rate-limit': return 5 * 60_000 * multiplier;
    case 'auth': return 30 * 60_000;
    case 'not-found': return 60 * 60_000;
    case 'timeout': return 45_000 * multiplier;
    case 'server': return 30_000 * multiplier;
    default: return 20_000 * multiplier;
  }
}

function markSuccess(combo: Combo): void {
  healthStore().delete(comboKey(combo));
}

function markFailure(combo: Combo, kind: FailureKind): void {
  const store = healthStore();
  const key = comboKey(combo);
  const previous = store.get(key);
  const consecutiveFailures = (previous?.consecutiveFailures ?? 0) + 1;
  store.set(key, {
    consecutiveFailures,
    cooldownUntil: Date.now() + cooldownMs(kind, consecutiveFailures),
    lastFailureKind: kind,
  });
}

function isCoolingDown(combo: Combo, now = Date.now()): boolean {
  return (healthStore().get(comboKey(combo))?.cooldownUntil ?? 0) > now;
}

/**
 * Smart rotation:
 * 1. buildCombos() tetap menjadi ranking kualitas deterministik.
 * 2. Semua combo yang sehat dirotasi agar API key/model utama tidak selalu kena request pertama.
 * 3. Combo yang sedang cooldown tidak dicoba selama masih ada combo sehat.
 * 4. Jika SEMUA combo sedang cooldown, satu combo dengan cooldown paling dekat selesai
 *    diizinkan sebagai probe agar LensAI tidak mati total pada warm instance.
 *
 * Cursor disimpan di globalThis sehingga stabil pada warm serverless instance. Di cold
 * start cursor kembali 0; ini sengaja tidak membutuhkan Redis/DB hanya untuk routing AI.
 */
export function buildSmartAttemptOrder(combos = buildCombos(), now = Date.now()): Combo[] {
  if (combos.length <= 1) return combos;

  const healthy = combos.filter((combo) => !isCoolingDown(combo, now));
  if (!healthy.length) {
    return [...combos].sort((a, b) =>
      (healthStore().get(comboKey(a))?.cooldownUntil ?? 0) -
      (healthStore().get(comboKey(b))?.cooldownUntil ?? 0)
    ).slice(0, 1);
  }

  const cursor = globalForAIRotation.__sahamlensAIRotationCursor ?? 0;
  const offset = cursor % healthy.length;
  globalForAIRotation.__sahamlensAIRotationCursor = (cursor + 1) % Number.MAX_SAFE_INTEGER;

  return [...healthy.slice(offset), ...healthy.slice(0, offset)];
}

// Hanya untuk unit test; jangan dipakai oleh route produksi.
export function __resetAIRotationForTests(): void {
  globalForAIRotation.__sahamlensAIRotationCursor = 0;
  globalForAIRotation.__sahamlensAIHealth = new Map();
}

// BUG FIX (2026-08-05, permintaan user - "urutan paling pinter ke paling gak pinter"):
// cascade SEBELUMNYA mengacak urutan combo (menyebar beban rata ke semua provider). Sekarang
// urutan TETAP, dari model paling mumpuni ke paling ringan - begitu satu berhasil langsung
// dipakai, jadi kalau provider ter-mumpuni sedang tersedia, itu yang menjawab.
//
// PERINGATAN JUJUR: ranking ini heuristik dari kelas ukuran/reputasi keluarga model
// (dense parameter count, MoE active params, reputasi lab), BUKAN hasil benchmark
// terukur head-to-head - beberapa model di sini terlalu baru untuk ada benchmark
// independen yang bisa diverifikasi saat catatan ini ditulis. Model yang tidak ada di
// daftar (fallback masa depan yang belum di-rank) jatuh ke urutan PALING BAWAH, bukan
// diam-diam diperlakukan sebagai prioritas tinggi.
const MODEL_PRIORITY: string[] = [
  'kimi-k2.6',                                    // Moonshot Kimi K2 - kelas frontier
  'nvidia/nemotron-3-super-120b-a12b:free',       // 120B total (MoE, 12B aktif)
  'llama-3.3-70b-versatile',                      // 70B dense
  'gemini-2.0-flash',                             // flash-tier Google, seimbang
  'openai/gpt-oss-20b:free',                      // 20B open-weight OpenAI
  'google/gemma-4-31b-it:free',                   // 31B
  'meta/llama-3.1-8b-instruct',                   // 8B
  'nvidia/llama-3.1-nemotron-nano-8b-v1',         // 8B, dituning buat efisiensi
  'llama-3.1-8b-instant',                         // 8B, dituning buat kecepatan
];

function priorityRank(model: string): number {
  const idx = MODEL_PRIORITY.indexOf(model);
  return idx === -1 ? MODEL_PRIORITY.length : idx;
}

const GEMINI_API_KEY_ENV_VARS = [
  'GEMINI_API_KEY',
  'GEMINI_API_KEY_2',
  'GEMINI_API_KEY_3',
  'GEMINI_API_KEY_4',
  'GEMINI_API_KEY_5',
] as const;
export function buildCombos(): Combo[] {
const combos: Combo[] = [];

for (const envVar of GEMINI_API_KEY_ENV_VARS) {
  if (!process.env[envVar]) continue;

  combos.push(
    ...GEMINI_MODELS.map((model) => ({
      kind: 'gemini' as const,
      model,
      envVar,
    })),
  );
}

for (const provider of OPENAI_COMPATIBLE_PROVIDERS) {
  if (!process.env[provider.envVar]) continue;

  combos.push(
    ...provider.models.map((model) => ({
      kind: 'openai-compatible' as const,
      provider,
      model,
    })),
  );
}

return combos.sort((a, b) => priorityRank(a.model) - priorityRank(b.model));
}
export function hasAnyAIProvider(): boolean {
if (GEMINI_API_KEY_ENV_VARS.some((envVar) => !!process.env[envVar])) {
  return true;
}

return OPENAI_COMPATIBLE_PROVIDERS.some(
  (p) => !!process.env[p.envVar],
);
}
interface AICallResult {
  text: string | null;
  failureKind?: FailureKind;
}

function classifyErrorMessage(message: string): FailureKind {
  const lower = message.toLowerCase();
  if (lower.includes('429') || lower.includes('rate limit') || lower.includes('quota')) return 'rate-limit';
  if (lower.includes('401') || lower.includes('403') || lower.includes('unauthorized') || lower.includes('forbidden')) return 'auth';
  if (lower.includes('404') || lower.includes('not found')) return 'not-found';
  if (lower.includes('timeout') || lower.includes('abort')) return 'timeout';
  if (/\b5\d\d\b/.test(lower)) return 'server';
  return 'other';
}

async function callGemini(apiKey: string, model: string, system: string | undefined, prompt: string, json: boolean, timeoutMs: number): Promise<AICallResult> {
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const gModel = genAI.getGenerativeModel({
      model,
      systemInstruction: system,
      ...(json ? { generationConfig: { responseMimeType: 'application/json' } } : {}),
    });
    const result = await Promise.race([
      gModel.generateContent(prompt),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
    ]);
    const text = (result as Awaited<ReturnType<typeof gModel.generateContent>>).response.text();
    return { text: text || null, ...(text ? {} : { failureKind: 'other' as const }) };
  } catch (e: any) {
    const message = e?.message || String(e);
    console.warn(`[Gemini] Model "${model}" gagal: ${message}`);
    return { text: null, failureKind: classifyErrorMessage(message) };
  }
}

async function callOpenAICompatible(
  provider: OpenAICompatibleProvider,
  apiKey: string,
  model: string,
  system: string | undefined,
  prompt: string,
  json: boolean,
  timeoutMs: number
): Promise<AICallResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const messages: { role: string; content: string }[] = [];
    if (system) messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content: prompt });

    const res = await fetch(provider.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        ...provider.extraHeaders,
      },
      body: JSON.stringify({
        model,
        messages,
        ...(json ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: controller.signal,
    });
    // DIAGNOSTIK (2026-08-05): `if (!res.ok) return null` yang lama menelan status HTTP
    // tanpa jejak apa pun. Akibatnya, saat SEMUA provider gagal dan pengguna cuma melihat
    // "LensAI tidak tersedia atau kena limit", tidak ada cara membedakan penyebabnya dari
    // log produksi: 429 (kuota habis) vs 401 (key salah) vs 404 (nama model sudah
    // dihapus penyedianya) menghasilkan pesan yang persis sama ke pengguna, padahal
    // tindakan perbaikannya benar-benar berbeda. callGemini() sudah punya log serupa
    // (temuan M-05) - ini menyamakannya untuk seluruh provider OpenAI-compatible.
    if (!res.ok) {
      // Body dibaca sebagai teks (bukan .json()) supaya halaman HTML error/rate-limit
      // dari proxy pun tetap terbaca, dan dipotong 200 karakter supaya log tidak banjir.
      const body = await res.text().catch(() => '');
      console.warn(`[AI:${provider.name}] "${model}" HTTP ${res.status} ${res.statusText} - ${body.slice(0, 200)}`);
      const failureKind: FailureKind =
        res.status === 429 ? 'rate-limit'
        : (res.status === 401 || res.status === 403) ? 'auth'
        : res.status === 404 ? 'not-found'
        : res.status >= 500 ? 'server'
        : 'other';
      return { text: null, failureKind };
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) {
      // Sukses HTTP tapi tanpa isi - bentuk respons tidak sesuai dugaan (mis. model
      // mengembalikan tool_call, atau content difilter). Beda sebab dari HTTP error,
      // jadi dibedakan juga di log.
      console.warn(`[AI:${provider.name}] "${model}" HTTP 200 tapi tidak ada teks jawaban`);
      return { text: null, failureKind: 'other' };
    }
    return { text };
  } catch (e: any) {
    const reason = e?.name === 'AbortError' ? `timeout ${timeoutMs}ms` : (e?.message || String(e));
    console.warn(`[AI:${provider.name}] "${model}" gagal: ${reason}`);
    return { text: null, failureKind: e?.name === 'AbortError' ? 'timeout' : classifyErrorMessage(reason) };
  } finally {
    clearTimeout(timer);
  }
}

// Coba kombinasi provider+model menurut smart rotation sampai satu berhasil.
// Return teks mentah (kalau json:true, caller yang JSON.parse - beberapa model gratis
// kadang membungkus JSON dengan ```json fences, jadi JSON.parse bisa gagal di respons
// pertama; caller sudah lanjut ke fallback rule-based kalau itu terjadi, yang lebih aman
// daripada mencoba "membetulkan" JSON yang mungkin salah).
export type AIProviderErrorCode =
  | 'NO_PROVIDER_CONFIGURED'
  | 'RATE_LIMIT'
  | 'AUTH_ERROR'
  | 'TIMEOUT'
  | 'INVALID_MODEL'
  | 'PROVIDER_ERROR'
  | 'ALL_PROVIDERS_FAILED';

export interface GenerateAIResult {
  text: string | null;
  errorCode: AIProviderErrorCode | null;
  failureKinds: FailureKind[];
}

function aggregateProviderFailure(failures: FailureKind[]): AIProviderErrorCode {
  if (failures.length === 0) return 'ALL_PROVIDERS_FAILED';
  if (failures.every((kind) => kind === 'rate-limit')) return 'RATE_LIMIT';
  if (failures.every((kind) => kind === 'auth')) return 'AUTH_ERROR';
  if (failures.every((kind) => kind === 'timeout')) return 'TIMEOUT';
  if (failures.every((kind) => kind === 'not-found')) return 'INVALID_MODEL';
  if (new Set(failures).size > 1) return 'ALL_PROVIDERS_FAILED';
  return 'PROVIDER_ERROR';
}

/**
 * Versi terstruktur untuk caller yang perlu membedakan penyebab kegagalan provider.
 * Tidak pernah membawa API key, URL rahasia, atau body error mentah ke consumer.
 */
export async function generateAIResult(opts: { system?: string; prompt: string; json?: boolean; timeoutMs?: number }): Promise<GenerateAIResult> {
  const { system, prompt, json = false, timeoutMs = 8000 } = opts;
  const baseCombos = buildCombos();

  if (baseCombos.length === 0) {
    return { text: null, errorCode: 'NO_PROVIDER_CONFIGURED', failureKinds: [] };
  }

  const combos = buildSmartAttemptOrder(baseCombos);
  const failures: FailureKind[] = [];

  for (const combo of combos) {
    const result = combo.kind === 'gemini'
      ? await callGemini(
          process.env[combo.envVar]!,
          combo.model,
          system,
          prompt,
          json,
          timeoutMs,
        )
      : await callOpenAICompatible(
          combo.provider,
          process.env[combo.provider.envVar]!,
          combo.model,
          system,
          prompt,
          json,
          timeoutMs,
        );

    if (result.text) {
      markSuccess(combo);
      return { text: result.text, errorCode: null, failureKinds: failures };
    }

    const failureKind = result.failureKind ?? 'other';
    failures.push(failureKind);
    markFailure(combo, failureKind);
  }

  const cooling = baseCombos.filter((combo) => isCoolingDown(combo)).length;
  console.warn(
    `[AI] Semua ${combos.length} attempt smart-rotation gagal; ${cooling}/${baseCombos.length} combo sedang cooldown - error=${aggregateProviderFailure(failures)}`,
  );

  return { text: null, errorCode: aggregateProviderFailure(failures), failureKinds: failures };
}

// Backward-compatible untuk seluruh caller existing yang hanya membutuhkan text/null.
export async function generateAI(opts: { system?: string; prompt: string; json?: boolean; timeoutMs?: number }): Promise<string | null> {
  return (await generateAIResult(opts)).text;
}



