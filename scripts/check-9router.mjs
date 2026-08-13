// Smoke test koneksi 9Router SEBELUM env var-nya dipasang di Vercel.
//
// Kenapa perlu: kalau 9Router salah konfigurasi, gejalanya di produksi cuma "LensAI tidak
// tersedia atau kena limit" - sama persis dengan gejala kuota habis. Skrip ini memisahkan
// penyebabnya di mesin dev (URL salah / key salah / model tidak ada / router mati),
// tanpa harus deploy dulu.
//
// Pakai:
//   NINEROUTER_BASE_URL=https://router.domain-anda.com \
//   NINEROUTER_API_KEY=xxx \
//   npm run check:9router
//
// Baca .env.local otomatis kalau ada, jadi cukup `npm run check:9router` setelah env
// lokal diisi.

import fs from 'node:fs';
import path from 'node:path';

function loadEnvLocal() {
  const file = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, '');
  }
}

// Disalin sengaja (bukan diimpor) - skrip ini .mjs polos tanpa transpile TypeScript.
// Kalau aturan normalisasi di lib/aiProviders.ts berubah, ubah juga di sini.
function normalizeBaseUrl(raw) {
  const trimmed = String(raw ?? '').trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  if (!/^https?:\/\//i.test(trimmed)) return null;
  if (/\/chat\/completions$/i.test(trimmed)) return trimmed.replace(/\/chat\/completions$/i, '');
  if (/\/v\d+$/i.test(trimmed)) return trimmed;
  return `${trimmed}/v1`;
}

function fail(message, hint) {
  console.error(`[9router] GAGAL: ${message}`);
  if (hint) console.error(`          -> ${hint}`);
  process.exitCode = 1;
}

async function main() {
  loadEnvLocal();

  const rawUrl = process.env.NINEROUTER_BASE_URL;
  const apiKey = process.env.NINEROUTER_API_KEY;

  if (!rawUrl || !apiKey) {
    return fail(
      'NINEROUTER_BASE_URL dan NINEROUTER_API_KEY dua-duanya harus diisi',
      'Base URL tanpa API key sengaja diabaikan aplikasi - lihat lib/aiProviders.ts.',
    );
  }

  const base = normalizeBaseUrl(rawUrl);
  if (!base) {
    return fail(
      `NINEROUTER_BASE_URL "${rawUrl}" tidak valid`,
      'Harus diawali http:// atau https://, contoh: https://router.domain-anda.com',
    );
  }

  if (/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)/i.test(base)) {
    console.warn(
      '[9router] PERINGATAN: base URL menunjuk localhost. Ini OK untuk uji di mesin sendiri, ' +
      'tapi TIDAK akan bisa dijangkau dari serverless Vercel. Untuk produksi pakai URL publik.',
    );
  }

  const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };

  console.log(`[9router] Base URL terbaca: ${base}`);

  // 1. Daftar model - membedakan "router mati/URL salah" dari "key salah".
  let availableModels = [];
  try {
    const res = await fetch(`${base}/models`, { headers });
    if (res.status === 401 || res.status === 403) {
      return fail(
        `GET ${base}/models -> HTTP ${res.status}`,
        'API key ditolak. Ambil ulang di Dashboard 9Router -> Settings -> API Keys.',
      );
    }
    if (!res.ok) {
      return fail(
        `GET ${base}/models -> HTTP ${res.status} ${res.statusText}`,
        'Cek 9Router hidup dan reverse proxy meneruskan path /v1.',
      );
    }
    const body = await res.json();
    availableModels = (body?.data ?? []).map((m) => m?.id).filter(Boolean);
    console.log(`[9router] OK - ${availableModels.length} model terdaftar.`);
    if (availableModels.length) {
      console.log(`[9router] Contoh model: ${availableModels.slice(0, 10).join(', ')}`);
    }
  } catch (e) {
    return fail(
      `tidak bisa menghubungi ${base}/models: ${e?.message || e}`,
      'Router belum jalan, DNS/SSL salah, atau port belum dibuka di firewall.',
    );
  }

  // 2. Validasi NINEROUTER_MODELS terhadap katalog nyata - jebakan yang sudah pernah
  // terjadi dengan katalog ":free" OpenRouter: nama model ditebak, produksi 404 semua.
  const configured = (process.env.NINEROUTER_MODELS ?? '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);

  if (configured.length && availableModels.length) {
    const unknown = configured.filter((m) => m !== 'auto' && !availableModels.includes(m));
    if (unknown.length) {
      fail(
        `model di NINEROUTER_MODELS tidak ada di instance ini: ${unknown.join(', ')}`,
        'Pakai nama persis dari daftar di atas, atau kosongkan NINEROUTER_MODELS untuk "auto".',
      );
    }
  }

  // 3. Satu request nyata - memastikan router benar-benar bisa meneruskan ke upstream,
  // bukan cuma hidup.
  const model = configured[0] || 'auto';
  const started = Date.now();
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        ...headers,
        'HTTP-Referer': 'https://sahamlens.vercel.app',
        'X-Title': 'SahamLens',
        ...(process.env.NINEROUTER_PROMPT_BUDGET
          ? { 'X-Prompt-Budget': process.env.NINEROUTER_PROMPT_BUDGET.trim() }
          : {}),
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Balas satu kata: OK' }],
      }),
    });

    const elapsed = Date.now() - started;
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return fail(
        `POST ${base}/chat/completions (model "${model}") -> HTTP ${res.status} - ${body.slice(0, 200)}`,
        res.status === 404
          ? 'Model tidak dikenal router ini.'
          : 'Cek provider upstream di dashboard 9Router - routernya hidup tapi tidak dapat jawaban.',
      );
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) {
      return fail(
        `model "${model}" membalas HTTP 200 tapi tanpa teks`,
        'Bentuk respons tidak OpenAI-compatible penuh; coba model lain.',
      );
    }

    console.log(`[9router] OK - model "${model}" menjawab dalam ${elapsed}ms: ${text.trim().slice(0, 80)}`);
    if (elapsed > 15_000) {
      console.warn(
        `[9router] PERINGATAN: ${elapsed}ms melebihi lantai timeout default (15000ms). ` +
        'Naikkan NINEROUTER_TIMEOUT_MS atau pilih model yang lebih cepat.',
      );
    }
  } catch (e) {
    return fail(`request chat completions gagal: ${e?.message || e}`);
  }

  if (!process.exitCode) {
    console.log('[9router] Semua pemeriksaan lolos. Aman dipasang di env Vercel.');
  }
}

main();
