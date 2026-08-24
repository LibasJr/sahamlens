import { recordDataSourceHealth } from '@/modules/observability/service/data-source-health.service';

// Council AI multi-provider - sebelumnya SELURUH app cuma bisa pakai Gemini, dan kuota
// gratis Gemini dibatasi PER MODEL PER HARI (20/hari/model - lihat lib/gemini.ts versi
// lama). Strategi sekarang: smart rotation antar combo yang sehat + cooldown otomatis
// untuk 429/timeout/error, lalu cascade sampai satu berhasil. Kalau semua gagal, return
// null dan caller pakai fallback lokalnya masing-masing (sudah ada di semua tempat).
//
// REWRITE (2026-08-05): sebelumnya tiap provider punya cabang if/else sendiri di
// generateAI() - nambah provider baru berarti menyalin ulang seluruh blok
// callOpenAICompatible() dengan resiko salah tempel URL/header. Provider didaftarkan
// sebagai DATA di OPENAI_COMPATIBLE_PROVIDERS - nambah provider baru = nambah 1 entri,
// bukan nambah cabang kode.
//
// GEMINI LANGSUNG DIHAPUS (2026-08-24, keputusan operator): provider Gemini terpisah
// (callGemini/streamGemini, API key sendiri di luar 9Router) berulang kali basi -
// 'gemini-2.5-flash' 404 pada 2026-08-05, lalu satu-satunya sisa 'gemini-2.0-flash'
// juga 404 pada 2026-08-24 ("model ini telah mencapai akhir masa pakainya"). Akses ke
// model Gemini TIDAK hilang - 9Router (lihat buildNineRouterProvider() di bawah) sudah
// merutekannya sendiri lewat NINEROUTER_MODELS (mis. 'gemini/gemini-3.5-flash-lite'),
// jadi operator cukup menjaga satu katalog model (dashboard 9Router), bukan dua.

interface OpenAICompatibleProvider {
  /** Dipakai sebagai key env var (`${envPrefix}_API_KEY`) DAN label log. */
  name: string;
  envVar: string;
  url: string;
  models: string[];
  extraHeaders?: Record<string, string>;
  /**
   * Kalau true, seluruh model provider ini ditaruh di depan ranking MODEL_PRIORITY.
   * Dipakai untuk gateway/router (9Router) yang model-id-nya milik deployment
   * masing-masing sehingga TIDAK MUNGKIN di-rank di MODEL_PRIORITY yang statis.
   */
  tryFirst?: boolean;
  /**
   * Lantai timeout khusus provider ini (ms). Router yang melakukan fallback ke
   * upstream-nya sendiri butuh waktu lebih dari budget default caller (8-12 detik).
   */
  minTimeoutMs?: number;
}

// --- 9Router (proxy AI multi-provider self-hosted) --------------------------
//
// 9Router (github.com/decolua/9router) adalah proxy OpenAI-compatible yang DIRINYA
// SENDIRI merutekan ke banyak provider (Claude/GPT/Gemini/GLM/dst) dengan fallback
// internal. Dari sisi SahamLens dia cuma "satu provider OpenAI-compatible lagi" -
// makanya tidak butuh cabang kode baru di generateAIResult(), cukup satu entri
// provider seperti Groq/Kimi/NVIDIA.
//
// Bedanya dari entri statis di atas: base URL dan daftar model 9Router TIDAK bisa
// di-hardcode - keduanya milik instance masing-masing (VPS/tunnel sendiri, dan model
// apa saja tergantung akun apa yang dipasang di dashboard 9Router). Jadi entri ini
// dibangun dari env var saat buildCombos() dipanggil, bukan konstanta modul.
const NINEROUTER_DEFAULT_MODELS = ['auto'];
const NINEROUTER_DEFAULT_MIN_TIMEOUT_MS = 15_000;

/**
 * Menerima tiga bentuk penulisan yang sama-sama wajar dari operator:
 *   https://router.example.com
 *   https://router.example.com/v1
 *   https://router.example.com/v1/chat/completions
 * dan menormalkan ketiganya ke URL chat completions penuh.
 */
let warnedInvalidNineRouterUrl = false;
let warnedMissingNineRouterKey = false;

export function normalizeNineRouterUrl(raw: string): string | null {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  if (!/^https?:\/\//i.test(trimmed)) {
    // Sekali saja per instance - fungsi ini dipanggil ulang tiap request lewat
    // buildCombos(), dan URL salah tidak akan berubah sendiri di tengah runtime.
    if (!warnedInvalidNineRouterUrl) {
      warnedInvalidNineRouterUrl = true;
      console.warn(
        '[AI:9router] NINEROUTER_BASE_URL harus diawali http:// atau https:// - nilai sekarang diabaikan.',
      );
    }
    return null;
  }
  if (/\/chat\/completions$/i.test(trimmed)) return trimmed;
  if (/\/v\d+$/i.test(trimmed)) return `${trimmed}/chat/completions`;
  return `${trimmed}/v1/chat/completions`;
}

function parseNineRouterModels(raw: string | undefined): string[] {
  const models = (raw ?? '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
  // "auto" = biarkan 9Router yang memilih model (fitur utamanya). Itu default yang
  // paling aman: tidak ada nama model yang bisa basi di sisi SahamLens.
  return models.length ? models : NINEROUTER_DEFAULT_MODELS;
}

/**
 * null kalau 9Router tidak dikonfigurasi. Sengaja butuh DUA env var:
 * NINEROUTER_BASE_URL (instance-nya di mana) dan NINEROUTER_API_KEY (bearer token
 * dari Dashboard 9Router). Base URL tanpa key berarti router-nya terbuka ke publik -
 * itu bukan sesuatu yang boleh terjadi diam-diam, jadi tidak didukung di sini.
 */
export function buildNineRouterProvider(): OpenAICompatibleProvider | null {
  const rawUrl = process.env.NINEROUTER_BASE_URL;
  if (!rawUrl) return null;

  if (!process.env.NINEROUTER_API_KEY) {
    // DIAGNOSTIK (2026-08-13): kasus ini benar-benar terjadi saat pemasangan di VPS -
    // baris `NINEROUTER_API_KEY=` tertulis ke .env.production dengan nilai KOSONG karena
    // variabel shell sumbernya sudah hilang. Sebelum ada peringatan ini, gejalanya
    // menyesatkan total: 9Router tidak pernah masuk cascade, jadi TIDAK ADA log
    // [AI:9router] sama sekali, dan operator melihat jawaban tetap keluar (dari provider
    // lama, lambat) tanpa satu pun petunjuk bahwa routernya diabaikan. Base URL terisi
    // tapi key kosong hampir pasti salah konfigurasi, bukan pilihan sadar - jadi ini
    // diteriakkan, bukan didiamkan.
    if (!warnedMissingNineRouterKey) {
      warnedMissingNineRouterKey = true;
      console.warn(
        '[AI:9router] NINEROUTER_BASE_URL terisi tapi NINEROUTER_API_KEY kosong - 9Router ' +
        'DILEWATI seluruhnya. Periksa nilainya (bukan sekadar ada barisnya): ' +
        "grep -c '^NINEROUTER_API_KEY=.\\+' <file env> harus 1.",
      );
    }
    return null;
  }

  const url = normalizeNineRouterUrl(rawUrl);
  if (!url) return null;

  const parsedTimeout = Number(process.env.NINEROUTER_TIMEOUT_MS);
  const promptBudget = process.env.NINEROUTER_PROMPT_BUDGET?.trim();

  return {
    name: '9router',
    envVar: 'NINEROUTER_API_KEY',
    url,
    models: parseNineRouterModels(process.env.NINEROUTER_MODELS),
    // Header khusus 9Router; diabaikan oleh proxy versi lama, jadi aman dikirim selalu.
    extraHeaders: {
      'HTTP-Referer': 'https://sahamlens.vercel.app',
      'X-Title': 'SahamLens',
      ...(promptBudget ? { 'X-Prompt-Budget': promptBudget } : {}),
    },
    tryFirst: process.env.NINEROUTER_PRIORITY !== 'last',
    minTimeoutMs:
      Number.isFinite(parsedTimeout) && parsedTimeout > 0
        ? parsedTimeout
        : NINEROUTER_DEFAULT_MIN_TIMEOUT_MS,
  };
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

type Combo = { kind: 'openai-compatible'; provider: OpenAICompatibleProvider; model: string };


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
  return `${combo.provider.name}:${combo.model}`;
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

  // BUG FIX (2026-08-13, terlihat dari log produksi VPS): rotasi lama memutar SELURUH
  // combo, termasuk gateway ber-flag tryFirst. Akibatnya niat "9Router dicoba duluan"
  // yang sudah dipasang di comboRank() dibatalkan lagi di sini - tiap request memulai
  // dari titik yang berbeda, jadi gateway sering baru kebagian giliran setelah beberapa
  // provider gratis yang kehabisan kuota menghabiskan 10-15 detik masing-masing.
  //
  // Rotasi tetap dipertahankan untuk provider langsung (itu memang gunanya: menyebar
  // beban antar API key gratis), tapi gateway di-pin di depan. Gateway punya rotasi
  // multi-akun dan fallback sendiri di dalamnya, jadi merotasinya lagi di sini tidak
  // menambah apa pun selain latensi.
  const pinned = healthy.filter((c) => c.kind === 'openai-compatible' && c.provider.tryFirst);
  const rotatable = healthy.filter((c) => !(c.kind === 'openai-compatible' && c.provider.tryFirst));

  if (!rotatable.length) return pinned;

  const cursor = globalForAIRotation.__sahamlensAIRotationCursor ?? 0;
  const offset = cursor % rotatable.length;
  globalForAIRotation.__sahamlensAIRotationCursor = (cursor + 1) % Number.MAX_SAFE_INTEGER;

  return [...pinned, ...rotatable.slice(offset), ...rotatable.slice(0, offset)];
}

// Hanya untuk unit test; jangan dipakai oleh route produksi.
// Ikut mereset flag warn-once: tanpa ini, test yang menguji peringatan konfigurasi
// bergantung pada urutan eksekusi (test lain sudah "memakai" peringatannya duluan).
export function __resetAIRotationForTests(): void {
  globalForAIRotation.__sahamlensAIRotationCursor = 0;
  globalForAIRotation.__sahamlensAIHealth = new Map();
  warnedInvalidNineRouterUrl = false;
  warnedMissingNineRouterKey = false;
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

// Provider dengan tryFirst (9Router) tidak bisa dinilai lewat MODEL_PRIORITY - id
// model-nya (`cc/claude-opus-4-7`, `glm/glm-5.1`, `auto`, ...) tergantung instance
// operator. Ditaruh di depan seluruh ranking, dan urutan antar model 9Router sendiri
// mengikuti urutan penulisan NINEROUTER_MODELS (Array.sort() stabil di V8), sehingga
// operator yang mau urutan tertentu cukup mengurutkan env var-nya.
function comboRank(combo: Combo): number {
  if (combo.kind === 'openai-compatible' && combo.provider.tryFirst) return -1;
  return priorityRank(combo.model);
}

export function buildCombos(): Combo[] {
const combos: Combo[] = [];

const nineRouter = buildNineRouterProvider();
const providers = nineRouter
  ? [nineRouter, ...OPENAI_COMPATIBLE_PROVIDERS]
  : OPENAI_COMPATIBLE_PROVIDERS;

for (const provider of providers) {
  if (!process.env[provider.envVar]) continue;

  combos.push(
    ...provider.models.map((model) => ({
      kind: 'openai-compatible' as const,
      provider,
      model,
    })),
  );
}

return combos.sort((a, b) => comboRank(a) - comboRank(b));
}
export function hasAnyAIProvider(): boolean {
if (buildNineRouterProvider()) return true;

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

/**
 * Membaca body chat-completions yang TIDAK selalu JSON murni.
 *
 * BUG FIX (2026-08-13, ditemukan saat memasang 9Router di VPS sungguhan): 9Router
 * membalas objek JSON biasa TAPI menempelkan terminator SSE di belakangnya:
 *
 *   {"id":"chatcmpl-...","choices":[...],"usage":{...}}data: [DONE]
 *
 * `res.json()` yang lama SELALU gagal untuk body seperti ini - JSON.parse melempar
 * begitu ada karakter tersisa setelah objek selesai. Efeknya diam-diam fatal: setiap
 * respons 9Router yang SUKSES (HTTP 200, jawaban benar) dihitung sebagai kegagalan
 * 'other', combo-nya kena cooldown, lalu cascade lanjut ke provider lain. Dari log
 * produksi gejalanya cuma "9router gagal" tanpa petunjuk bahwa body-nya sebenarnya
 * baik-baik saja.
 *
 * Urutan percobaan sengaja dari yang paling ketat: JSON murni dulu (jalur normal semua
 * provider lain, tanpa biaya tambahan), baru toleransi. Return null kalau benar-benar
 * tidak ada yang bisa dibaca - caller yang memutuskan itu kegagalan.
 */
export function parseChatCompletionBody(raw: string): any | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    // lanjut ke toleransi di bawah
  }

  // Kasus 9Router: JSON utuh + terminator SSE menempel di belakang.
  const withoutTerminator = trimmed.replace(/(?:\r?\n)*data:\s*\[DONE\]\s*$/i, '').trim();
  if (withoutTerminator && withoutTerminator !== trimmed) {
    try {
      return JSON.parse(withoutTerminator);
    } catch {
      // lanjut
    }
  }

  // Kasus respons SSE penuh (provider yang memaksa streaming walau tidak diminta):
  // gabungkan delta dari tiap baris `data: {...}`.
  if (/^data:\s*\{/m.test(trimmed)) {
    let streamed = '';
    let lastChunk: any = null;
    for (const line of trimmed.split(/\r?\n/)) {
      const match = line.match(/^data:\s*(\{.*\})\s*$/);
      if (!match) continue;
      try {
        const chunk = JSON.parse(match[1]);
        lastChunk = chunk;
        const delta = chunk?.choices?.[0]?.delta?.content;
        if (typeof delta === 'string') streamed += delta;
        const whole = chunk?.choices?.[0]?.message?.content;
        if (typeof whole === 'string') streamed += whole;
      } catch {
        // satu chunk rusak tidak boleh membuang chunk lain yang sudah terkumpul
      }
    }
    if (streamed) return { choices: [{ message: { content: streamed } }] };
    if (lastChunk) return lastChunk;
  }

  return null;
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
        // Dikirim eksplisit sejak 2026-08-13: tanpa ini sebagian gateway (9Router)
        // memutuskan sendiri untuk membungkus jawaban dengan protokol streaming.
        // Parameter standar OpenAI, diterima semua provider di daftar ini.
        stream: false,
        ...(json ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: controller.signal,
    });
    // DIAGNOSTIK (2026-08-05): `if (!res.ok) return null` yang lama menelan status HTTP
    // tanpa jejak apa pun. Akibatnya, saat SEMUA provider gagal dan pengguna cuma melihat
    // "LensAI tidak tersedia atau kena limit", tidak ada cara membedakan penyebabnya dari
    // log produksi: 429 (kuota habis) vs 401 (key salah) vs 404 (nama model sudah
    // dihapus penyedianya) menghasilkan pesan yang persis sama ke pengguna, padahal
    // tindakan perbaikannya benar-benar berbeda (temuan M-05).
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
    const rawBody = await res.text();
    const data = parseChatCompletionBody(rawBody);
    if (!data) {
      console.warn(
        `[AI:${provider.name}] "${model}" HTTP 200 tapi body tidak bisa dibaca sebagai JSON - ${rawBody.slice(0, 200)}`,
      );
      return { text: null, failureKind: 'other' };
    }
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
  const startedAt = Date.now();
  const { system, prompt, json = false, timeoutMs = 8000 } = opts;
  const baseCombos = buildCombos();

  if (baseCombos.length === 0) {
    if (process.env.NODE_ENV !== 'test') void recordDataSourceHealth({ sourceId: 'AI_COUNCIL', ok: false, latencyMs: Date.now() - startedAt, detail: { errorCode: 'NO_PROVIDER_CONFIGURED' } });
    return { text: null, errorCode: 'NO_PROVIDER_CONFIGURED', failureKinds: [] };
  }

  const combos = buildSmartAttemptOrder(baseCombos);
  const failures: FailureKind[] = [];

  for (const combo of combos) {
    const result = await callOpenAICompatible(
      combo.provider,
      process.env[combo.provider.envVar]!,
      combo.model,
      system,
      prompt,
      json,
      // Router yang punya fallback internal (9Router) butuh lantai timeout sendiri;
      // budget caller tetap dipakai kalau memang sudah lebih longgar. Seluruh route
      // pemanggil AI memakai maxDuration >= 60 detik, jadi lantai ini tidak bisa
      // menghabiskan anggaran eksekusi route.
      Math.max(timeoutMs, combo.provider.minTimeoutMs ?? 0),
    );

    if (result.text) {
      markSuccess(combo);
      if (process.env.NODE_ENV !== 'test') void recordDataSourceHealth({ sourceId: 'AI_COUNCIL', ok: true, latencyMs: Date.now() - startedAt, detail: { provider: combo.provider.name, model: combo.model } });
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

  const errorCode = aggregateProviderFailure(failures);
  if (process.env.NODE_ENV !== 'test') void recordDataSourceHealth({ sourceId: 'AI_COUNCIL', ok: false, latencyMs: Date.now() - startedAt, detail: { errorCode, attempts: combos.length } });
  return { text: null, errorCode, failureKinds: failures };
}

// Backward-compatible untuk seluruh caller existing yang hanya membutuhkan text/null.
export async function generateAI(opts: { system?: string; prompt: string; json?: boolean; timeoutMs?: number }): Promise<string | null> {
  return (await generateAIResult(opts)).text;
}




// ===========================================================================
// STREAMING (2026-08-13)
// ===========================================================================
//
// Jalur TERPISAH dari generateAIResult(), bukan penggantinya. Sembilan pemanggil
// existing hanya butuh teks utuh dan tidak boleh ikut berubah; yang butuh streaming
// baru satu, yaitu /api/chat.
//
// Sengaja tinggal di FILE YANG SAMA supaya memakai pembukuan kesehatan provider yang
// sama (markSuccess/markFailure/isCoolingDown/buildSmartAttemptOrder). Kalau streaming
// dipisah ke file lain dengan salinan logikanya sendiri, dua jalur itu akan berbeda
// pendapat tentang provider mana yang sedang mati - dan yang paling merugikan, provider
// yang baru saja gagal di jalur streaming tetap dicoba duluan di jalur biasa.
//
// ATURAN PINDAH PROVIDER. Kegagalan SEBELUM satu pun teks keluar -> lanjut ke kombinasi
// berikutnya seperti biasa. Kegagalan SETELAH teks mulai mengalir -> berhenti dengan
// teks seadanya. Mencoba provider lain di tengah jalan berarti menyambung dua jawaban
// dari dua model yang berbeda; kalimatnya bisa saja mulus, tapi isinya campuran dua
// penalaran - itu lebih menyesatkan daripada jawaban yang terpotong dan diakui terpotong.

/** Dipanggil tiap potongan teks tiba. Tidak boleh melempar - pemanggil yang menjaga. */
export type AIStreamDelta = (chunk: string) => void;

/**
 * Pecah aliran SSE menjadi baris utuh.
 *
 * Chunk jaringan TIDAK sejajar dengan batas baris: satu chunk bisa berisi setengah
 * baris `data: {...}`, dan JSON.parse atas potongan itu pasti gagal. Sisa yang belum
 * berakhir newline karena itu disimpan untuk digabung dengan chunk berikutnya.
 */
function createSseLineBuffer() {
  let carry = '';
  return {
    push(chunk: string): string[] {
      const combined = carry + chunk;
      const parts = combined.split(/\r?\n/);
      carry = parts.pop() ?? '';
      return parts;
    },
    flush(): string[] {
      const rest = carry.trim();
      carry = '';
      return rest ? [rest] : [];
    },
  };
}

async function streamOpenAICompatible(
  provider: OpenAICompatibleProvider,
  apiKey: string,
  model: string,
  system: string | undefined,
  prompt: string,
  timeoutMs: number,
  onDelta: AIStreamDelta,
): Promise<AICallResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let text = '';

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
      body: JSON.stringify({ model, messages, stream: true }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(`[AI:${provider.name}] stream "${model}" HTTP ${res.status} ${res.statusText} - ${body.slice(0, 200)}`);
      const failureKind: FailureKind =
        res.status === 429 ? 'rate-limit'
        : (res.status === 401 || res.status === 403) ? 'auth'
        : res.status === 404 ? 'not-found'
        : res.status >= 500 ? 'server'
        : 'other';
      return { text: null, failureKind };
    }

    if (!res.body) {
      console.warn(`[AI:${provider.name}] stream "${model}" HTTP 200 tanpa body`);
      return { text: null, failureKind: 'other' };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const lines = createSseLineBuffer();

    const handleLine = (line: string) => {
      const match = line.match(/^data:\s*(.+)$/);
      if (!match) return;
      const payload = match[1].trim();
      if (payload === '[DONE]') return;
      try {
        const chunk = JSON.parse(payload);
        const delta = chunk?.choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta) {
          text += delta;
          onDelta(delta);
        }
      } catch {
        // Satu baris rusak tidak boleh membatalkan aliran yang lain - pola yang sama
        // sudah dipakai parseChatCompletionBody().
      }
    };

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const line of lines.push(decoder.decode(value, { stream: true }))) handleLine(line);
    }
    for (const line of lines.flush()) handleLine(line);

    if (!text.trim()) {
      console.warn(`[AI:${provider.name}] stream "${model}" selesai tanpa teks`);
      return { text: null, failureKind: 'other' };
    }
    return { text };
  } catch (e: any) {
    const reason = e?.name === 'AbortError' ? `timeout ${timeoutMs}ms` : (e?.message || String(e));
    console.warn(`[AI:${provider.name}] stream "${model}" gagal: ${reason}`);
    // Teks yang SUDAH mengalir tetap dikembalikan: pemanggil sudah terlanjur
    // menampilkannya ke pengguna, jadi berpura-pura tidak ada justru membuat status
    // yang dilaporkan tidak cocok dengan yang terlihat di layar.
    if (text.trim()) return { text };
    return { text: null, failureKind: e?.name === 'AbortError' ? 'timeout' : classifyErrorMessage(reason) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Versi streaming generateAIResult(). `onDelta` dipanggil tiap potongan teks tiba;
 * nilai kembaliannya tetap teks UTUH supaya pemanggil bisa memverifikasi hasil akhir.
 */
export async function generateAIStream(opts: {
  system?: string;
  prompt: string;
  timeoutMs?: number;
  onDelta: AIStreamDelta;
}): Promise<GenerateAIResult> {
  const startedAt = Date.now();
  const { system, prompt, timeoutMs = 8000, onDelta } = opts;
  const baseCombos = buildCombos();

  if (baseCombos.length === 0) {
    if (process.env.NODE_ENV !== 'test') void recordDataSourceHealth({ sourceId: 'AI_COUNCIL', ok: false, latencyMs: Date.now() - startedAt, detail: { errorCode: 'NO_PROVIDER_CONFIGURED' } });
    return { text: null, errorCode: 'NO_PROVIDER_CONFIGURED', failureKinds: [] };
  }

  const combos = buildSmartAttemptOrder(baseCombos);
  const failures: FailureKind[] = [];

  for (const combo of combos) {
    let emitted = false;
    const guardedDelta: AIStreamDelta = (chunk) => {
      emitted = true;
      onDelta(chunk);
    };

    const result = await streamOpenAICompatible(
      combo.provider,
      process.env[combo.provider.envVar]!,
      combo.model,
      system,
      prompt,
      Math.max(timeoutMs, combo.provider.minTimeoutMs ?? 0),
      guardedDelta,
    );

    if (result.text) {
      markSuccess(combo);
      if (process.env.NODE_ENV !== 'test') void recordDataSourceHealth({ sourceId: 'AI_COUNCIL', ok: true, latencyMs: Date.now() - startedAt, detail: { provider: combo.provider.name, model: combo.model } });
      return { text: result.text, errorCode: null, failureKinds: failures };
    }

    const failureKind = result.failureKind ?? 'other';
    failures.push(failureKind);
    markFailure(combo, failureKind);

    // Teks sudah terlanjur tampil di layar pengguna - lihat "ATURAN PINDAH PROVIDER".
    if (emitted) {
      return { text: null, errorCode: aggregateProviderFailure(failures), failureKinds: failures };
    }
  }

  const errorCode = aggregateProviderFailure(failures);
  if (process.env.NODE_ENV !== 'test') void recordDataSourceHealth({ sourceId: 'AI_COUNCIL', ok: false, latencyMs: Date.now() - startedAt, detail: { errorCode, attempts: combos.length, mode: 'stream' } });
  return { text: null, errorCode, failureKinds: failures };
}
