import { GoogleGenerativeAI } from "@google/generative-ai"

const apiKey = process.env.GEMINI_API_KEY;

let genAI: GoogleGenerativeAI | null = null;
if (apiKey) {
  genAI = new GoogleGenerativeAI(apiKey);
}

// Kuota gratis Gemini di-cap PER MODEL PER HARI (lihat quotaId
// "GenerateRequestsPerDayPerProjectPerModel-FreeTier" di error 429 yang pernah
// muncul) - bukan kuota gabungan lintas model. Sebelumnya SELURUH app selalu
// memanggil satu model yang sama ("gemini-3.6-flash"), jadi begitu jatah 20/hari
// model itu habis, semua fitur AI (chat, council, news sentiment, ai-briefing)
// ikut mati bersamaan meski model lain masih py kuota kosong. Dengan memilih
// model SECARA ACAK di setiap panggilan, beban tersebar ke ~5 kuota terpisah -
// bukan menambah kuota, tapi memanfaatkan yang sudah tersedia gratis.
// Daftar ini dikonfirmasi nyata & aktif untuk API key ini via GET /v1beta/models.
const MODEL_CANDIDATES = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-3.5-flash',
  'gemini-3.6-flash',
  'gemini-3.1-flash-lite',
];

export function pickGeminiModelName(): string {
  return MODEL_CANDIDATES[Math.floor(Math.random() * MODEL_CANDIDATES.length)];
}

// Model baru dibuat per panggilan (bukan singleton) supaya rotasi acak di atas
// benar-benar berpengaruh setiap request, bukan cuma sekali saat cold start.
export function getModel() {
  if (!genAI) return null;
  return genAI.getGenerativeModel({ model: pickGeminiModelName() });
}

export function getJsonModel() {
  if (!genAI) return null;
  return genAI.getGenerativeModel({
    model: pickGeminiModelName(),
    generationConfig: { responseMimeType: "application/json" },
  });
}
