import { GoogleGenerativeAI } from '@google/generative-ai';

// Council AI multi-provider - sebelumnya SELURUH app cuma bisa pakai Gemini, dan kuota
// gratis Gemini dibatasi PER MODEL PER HARI (20/hari/model - lihat lib/gemini.ts versi
// lama). Strategi: acak URUTAN provider+model tiap panggilan, lalu coba satu-satu
// (cascade) - begitu satu berhasil, langsung dipakai; kalau semua gagal/exhausted, return
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
  | { kind: 'gemini'; model: string }
  | { kind: 'openai-compatible'; provider: OpenAICompatibleProvider; model: string };

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

export function buildCombos(): Combo[] {
  const combos: Combo[] = [];
  if (process.env.GEMINI_API_KEY) {
    combos.push(...GEMINI_MODELS.map((model) => ({ kind: 'gemini' as const, model })));
  }
  for (const provider of OPENAI_COMPATIBLE_PROVIDERS) {
    if (!process.env[provider.envVar]) continue;
    combos.push(...provider.models.map((model) => ({ kind: 'openai-compatible' as const, provider, model })));
  }
  return combos.sort((a, b) => priorityRank(a.model) - priorityRank(b.model));
}

export function hasAnyAIProvider(): boolean {
  if (process.env.GEMINI_API_KEY) return true;
  return OPENAI_COMPATIBLE_PROVIDERS.some((p) => !!process.env[p.envVar]);
}

async function callGemini(model: string, system: string | undefined, prompt: string, json: boolean, timeoutMs: number): Promise<string | null> {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
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
    return text || null;
  } catch (e: any) {
    // BUG FIX (audit integritas data 2026-08-03, temuan M-05): kegagalan sebelumnya
    // ditelan total tanpa jejak - kalau salah satu nama model di GEMINI_MODELS ternyata
    // sudah tidak berlaku (404 model-not-found) atau kena limit, tidak ada cara tahu
    // dari log produksi. `generateAI()` di atas SUDAH resilien (mencoba kombinasi
    // berikutnya), jadi ini murni visibilitas diagnostik, bukan perbaikan perilaku.
    console.warn(`[Gemini] Model "${model}" gagal: ${e?.message || e}`);
    return null;
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
): Promise<string | null> {
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
      return null;
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) {
      // Sukses HTTP tapi tanpa isi - bentuk respons tidak sesuai dugaan (mis. model
      // mengembalikan tool_call, atau content difilter). Beda sebab dari HTTP error,
      // jadi dibedakan juga di log.
      console.warn(`[AI:${provider.name}] "${model}" HTTP 200 tapi tidak ada teks jawaban`);
      return null;
    }
    return text;
  } catch (e: any) {
    const reason = e?.name === 'AbortError' ? `timeout ${timeoutMs}ms` : (e?.message || String(e));
    console.warn(`[AI:${provider.name}] "${model}" gagal: ${reason}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Coba tiap kombinasi provider+model secara berurutan (acak) sampai satu berhasil.
// Return teks mentah (kalau json:true, caller yang JSON.parse - beberapa model gratis
// kadang membungkus JSON dengan ```json fences, jadi JSON.parse bisa gagal di respons
// pertama; caller sudah lanjut ke fallback rule-based kalau itu terjadi, yang lebih aman
// daripada mencoba "membetulkan" JSON yang mungkin salah).
export async function generateAI(opts: { system?: string; prompt: string; json?: boolean; timeoutMs?: number }): Promise<string | null> {
  const { system, prompt, json = false, timeoutMs = 8000 } = opts;
  const combos = buildCombos();

  for (const combo of combos) {
    const text = combo.kind === 'gemini'
      ? await callGemini(combo.model, system, prompt, json, timeoutMs)
      : await callOpenAICompatible(combo.provider, process.env[combo.provider.envVar]!, combo.model, system, prompt, json, timeoutMs);
    if (text) return text;
  }
  // Ringkasan saat SEMUA kombinasi habis - baris per-model di atas menjelaskan sebabnya
  // satu per satu; baris ini menandai batas akhir cascade supaya mudah dicari di log
  // ("kenapa pengguna dapat fallback lokal") dan langsung terlihat berapa kombinasi yang
  // sebenarnya dicoba (0 = tidak ada API key terpasang sama sekali).
  console.warn(`[AI] Semua ${combos.length} kombinasi provider+model gagal - caller akan memakai fallback lokal`);
  return null;
}
