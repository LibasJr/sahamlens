import { GoogleGenerativeAI } from '@google/generative-ai';

// Council AI multi-provider - sebelumnya SELURUH app cuma bisa pakai Gemini, dan kuota
// gratis Gemini dibatasi PER MODEL PER HARI (20/hari/model - lihat lib/gemini.ts versi
// lama). Di sini kita tambah 2 provider gratis lagi (Groq, OpenRouter, keduanya API
// OpenAI-compatible) supaya total kapasitas gratis jauh lebih besar sebelum semua fitur
// AI (chat, council, sentimen berita, ringkasan) harus jatuh ke fallback rule-based.
// Strategi: acak URUTAN provider+model tiap panggilan, lalu coba satu-satu (cascade) -
// begitu satu berhasil, langsung dipakai; kalau semua gagal/exhausted, return null dan
// caller pakai fallback lokalnya masing-masing (sudah ada di semua tempat).

// BUG FIX (audit logika & algoritma 2026-08-05, temuan L-2): tiga nama model terakhir di
// daftar lama ('gemini-3.5-flash', 'gemini-3.6-flash', 'gemini-3.1-flash-lite') tidak
// merujuk model yang benar-benar ada. Karena urutan combo diacak, tiap panggilan AI
// berpeluang membuang beberapa percobaan (dan waktu timeout) ke model yang PASTI gagal
// sebelum sampai ke yang berfungsi - biaya latensi murni, tanpa manfaat. Disisakan hanya
// nama model yang terverifikasi.
const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
];

// Model Groq (Llama via LPU Groq - kuota gratis jauh lebih besar dari Gemini per API key).
const GROQ_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];

// Model OpenRouter yang punya varian ":free" (gratis, rate limit lebih longgar).
const OPENROUTER_MODELS = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'deepseek/deepseek-chat:free',
  'google/gemini-2.0-flash-exp:free',
];

type Provider = 'gemini' | 'groq' | 'openrouter';
type Combo = { provider: Provider; model: string };

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildCombos(): Combo[] {
  const combos: Combo[] = [];
  if (process.env.GEMINI_API_KEY) combos.push(...GEMINI_MODELS.map((model) => ({ provider: 'gemini' as const, model })));
  if (process.env.GROQ_API_KEY) combos.push(...GROQ_MODELS.map((model) => ({ provider: 'groq' as const, model })));
  if (process.env.OPENROUTER_API_KEY) combos.push(...OPENROUTER_MODELS.map((model) => ({ provider: 'openrouter' as const, model })));
  return shuffle(combos);
}

export function hasAnyAIProvider(): boolean {
  return !!(process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY || process.env.OPENROUTER_API_KEY);
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
  url: string,
  apiKey: string,
  model: string,
  system: string | undefined,
  prompt: string,
  json: boolean,
  timeoutMs: number,
  extraHeaders?: Record<string, string>,
  /** Nama provider untuk log diagnostik saja - tidak memengaruhi request. */
  providerLabel = 'openai-compatible'
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const messages: { role: string; content: string }[] = [];
    if (system) messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content: prompt });

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        ...extraHeaders,
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
    // (temuan M-05) - ini menyamakannya untuk jalur Groq/OpenRouter.
    if (!res.ok) {
      // Body dibaca sebagai teks (bukan .json()) supaya halaman HTML error/rate-limit
      // dari proxy pun tetap terbaca, dan dipotong 200 karakter supaya log tidak banjir.
      const body = await res.text().catch(() => '');
      console.warn(`[AI:${providerLabel}] "${model}" HTTP ${res.status} ${res.statusText} - ${body.slice(0, 200)}`);
      return null;
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) {
      // Sukses HTTP tapi tanpa isi - bentuk respons tidak sesuai dugaan (mis. model
      // mengembalikan tool_call, atau content difilter). Beda sebab dari HTTP error,
      // jadi dibedakan juga di log.
      console.warn(`[AI:${providerLabel}] "${model}" HTTP 200 tapi tidak ada teks jawaban`);
      return null;
    }
    return text;
  } catch (e: any) {
    const reason = e?.name === 'AbortError' ? `timeout ${timeoutMs}ms` : (e?.message || String(e));
    console.warn(`[AI:${providerLabel}] "${model}" gagal: ${reason}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Coba tiap kombinasi provider+model secara berurutan (acak) sampai satu berhasil.
// Return teks mentah (kalau json:true, caller yang JSON.parse - beberapa model OpenRouter
// gratis kadang membungkus JSON dengan ```json fences, jadi JSON.parse bisa gagal di
// respons pertama; caller sudah lanjut ke fallback rule-based kalau itu terjadi, yang
// lebih aman daripada mencoba "membetulkan" JSON yang mungkin salah).
export async function generateAI(opts: { system?: string; prompt: string; json?: boolean; timeoutMs?: number }): Promise<string | null> {
  const { system, prompt, json = false, timeoutMs = 8000 } = opts;
  const combos = buildCombos();

  for (const combo of combos) {
    let text: string | null = null;
    if (combo.provider === 'gemini') {
      text = await callGemini(combo.model, system, prompt, json, timeoutMs);
    } else if (combo.provider === 'groq') {
      text = await callOpenAICompatible(
        'https://api.groq.com/openai/v1/chat/completions',
        process.env.GROQ_API_KEY!,
        combo.model,
        system,
        prompt,
        json,
        timeoutMs,
        undefined,
        'groq'
      );
    } else {
      text = await callOpenAICompatible(
        'https://openrouter.ai/api/v1/chat/completions',
        process.env.OPENROUTER_API_KEY!,
        combo.model,
        system,
        prompt,
        json,
        timeoutMs,
        { 'HTTP-Referer': 'https://sahamlens.vercel.app', 'X-Title': 'SahamLens' },
        'openrouter'
      );
    }
    if (text) return text;
  }
  // Ringkasan saat SEMUA kombinasi habis - baris per-model di atas menjelaskan sebabnya
  // satu per satu; baris ini menandai batas akhir cascade supaya mudah dicari di log
  // ("kenapa pengguna dapat fallback lokal") dan langsung terlihat berapa kombinasi yang
  // sebenarnya dicoba (0 = tidak ada API key terpasang sama sekali).
  console.warn(`[AI] Semua ${combos.length} kombinasi provider+model gagal - caller akan memakai fallback lokal`);
  return null;
}
