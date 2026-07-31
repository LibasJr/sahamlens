import { GoogleGenerativeAI } from '@google/generative-ai';

// Council AI multi-provider - sebelumnya SELURUH app cuma bisa pakai Gemini, dan kuota
// gratis Gemini dibatasi PER MODEL PER HARI (20/hari/model - lihat lib/gemini.ts versi
// lama). Di sini kita tambah 2 provider gratis lagi (Groq, OpenRouter, keduanya API
// OpenAI-compatible) supaya total kapasitas gratis jauh lebih besar sebelum semua fitur
// AI (chat, council, sentimen berita, ringkasan) harus jatuh ke fallback rule-based.
// Strategi: acak URUTAN provider+model tiap panggilan, lalu coba satu-satu (cascade) -
// begitu satu berhasil, langsung dipakai; kalau semua gagal/exhausted, return null dan
// caller pakai fallback lokalnya masing-masing (sudah ada di semua tempat).

const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-3.5-flash',
  'gemini-3.6-flash',
  'gemini-3.1-flash-lite',
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
  } catch {
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
  extraHeaders?: Record<string, string>
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
    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    return typeof text === 'string' && text.trim() ? text : null;
  } catch {
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
        timeoutMs
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
        { 'HTTP-Referer': 'https://sahamlens.vercel.app', 'X-Title': 'SahamLens' }
      );
    }
    if (text) return text;
  }
  return null;
}
