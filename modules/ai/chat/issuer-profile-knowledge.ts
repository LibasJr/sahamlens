import { getTickerName } from '@/lib/trendingTickers';
import { fetchCurrentFundamentalSource } from '@/modules/fundamental/service/current-fundamental-source.service';
import { normalizeChatText } from './chat-normalize';

/**
 * Pertanyaan identitas/kegiatan usaha emiten. Ini sengaja terpisah dari FUNDAMENTAL_TERMS:
 * "DGWG perusahaan apa?" tidak membutuhkan RSI/PER untuk dijawab, tetapi membutuhkan
 * profil bisnis yang benar-benar datang dari sumber server.
 */
const ISSUER_PROFILE_QUERY = /\b(?:perusahaan(?:nya)?\s+apa|perusahaan\s+apa\s+itu|emiten(?:nya)?\s+apa|profil\s+(?:perusahaan|emiten)|nama\s+(?:resmi\s+)?perusahaan|bergerak\s+di\s+bidang|bidang\s+usaha|kegiatan\s+usaha|bisnis(?:nya)?\s+(?:apa|apa\s+saja|gimana|bagaimana)|usaha(?:nya)?\s+(?:apa|apa\s+saja)|jual(?:an)?\s+apa|produk(?:nya)?\s+(?:apa|apa\s+saja)|layanan(?:nya)?\s+(?:apa|apa\s+saja)|sumber\s+pendapatan(?:nya)?|dapat\s+uang\s+dari\s+mana|dapet\s+uang\s+dari\s+mana|revenue\s+stream|segmen\s+(?:bisnis|usaha)|lini\s+bisnis|anak\s+usaha|grup\s+usaha|group\s+usaha|induk\s+usaha|pengendali(?:nya)?|merek(?:nya)?|brand(?:nya)?)\b/;

// Pengguna sering menyisipkan ticker di tengah frasa, misalnya
// "bisnisnya DGWG apa saja?" atau "produk ICBP apa?". Matcher utama di atas
// menangani frasa berurutan; matcher ini menangani satu token ticker di antaranya.
// Routing akhir tetap mensyaratkan ticker yang benar-benar ter-resolve, jadi regex ini
// boleh fokus pada bentuk bahasa tanpa mencoba memvalidasi simbol saham sendiri.
const ISSUER_PROFILE_WITH_INTERLEAVED_TICKER = /\b(?:bisnis(?:nya)?|usaha(?:nya)?|produk(?:nya)?|layanan(?:nya)?)\s+[a-z0-9.]{2,10}\s+(?:apa(?:\s+saja)?|gimana|bagaimana)\b/;

// Marker ini hanya dipakai untuk membedakan pertanyaan profil murni dari pertanyaan
// campuran. Kata "jual" SENDIRI sengaja tidak dianggap marker trading karena frasa
// "ANTM jual apa?" berarti menanyakan produk yang dijual perusahaan, bukan rekomendasi
// SELL. Bentuk trading harus membawa konteks eksplisit seperti "jual sekarang",
// "layak dibeli", RSI, fundamental, target harga, dan sebagainya.
const ISSUER_PROFILE_ANALYSIS_QUERY = /\b(?:fundamental|teknikal|analisis|valuasi|nilai\s+wajar|prospek|risiko|rsi|macd|support|resistance|target(?:\s+harga)?|entry|take\s*profit|stop\s*loss|cut\s*loss|p\/?e|per|pbv|roe|der|dividen|lens\s*score|lensscore|rekomendasi|layak\s+(?:dibeli|dijual)|sebaiknya\s+(?:beli|jual)|mending\s+(?:beli|jual)|(?:beli|jual)\s+(?:sekarang|kapan|di\s+harga))\b/;

export function asksAboutIssuerProfile(prompt: string): boolean {
  const normalized = normalizeChatText(prompt);
  return ISSUER_PROFILE_QUERY.test(normalized) || ISSUER_PROFILE_WITH_INTERLEAVED_TICKER.test(normalized);
}

/**
 * Menentukan apakah pertanyaan bisa dijawab hanya dari profil emiten.
 * Keputusan ini berbasis semantik prompt, bukan label classifier umum, karena classifier
 * trading secara wajar membaca kata "jual" sebagai SELL sementara "ANTM jual apa?"
 * adalah pertanyaan produk perusahaan.
 */
export function isIssuerProfileOnlyQuestion(prompt: string): boolean {
  const normalized = normalizeChatText(prompt);
  if (!asksAboutIssuerProfile(normalized)) return false;
  return !ISSUER_PROFILE_ANALYSIS_QUERY.test(normalized);
}

function cleanText(value: unknown, maxLength = 2500): string {
  if (typeof value !== 'string') return 'tidak tersedia';
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (!trimmed) return 'tidak tersedia';
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength).trimEnd()}…`;
}

function displayTicker(rawTicker: string): string {
  return rawTicker.trim().toUpperCase().replace(/\.JK$/i, '');
}

function masterTickerName(ticker: string): string | null {
  const resolved = getTickerName(`${ticker}.JK`);
  const normalized = resolved.replace(/\.JK$/i, '').trim();
  return normalized && normalized.toUpperCase() !== ticker ? resolved : null;
}

async function issuerProfileBlock(rawTicker: string): Promise<string> {
  const ticker = displayTicker(rawTicker);
  const masterName = masterTickerName(ticker);

  try {
    const data = await fetchCurrentFundamentalSource(rawTicker, { timeoutMs: 8000 });
    if (!data) {
      return [
        `### ${ticker} — PROFIL EMITEN`,
        `- Kode saham IDX: ${ticker}`,
        `- Nama perusahaan (master ticker SahamLens): ${cleanText(masterName, 300)}`,
        '- Profil bisnis provider: tidak tersedia dari backend saat ini.',
        '- FAIL-CLOSED: nama dari master ticker boleh disebut, tetapi jangan menebak sektor, bidang usaha, produk, grup usaha, pengendali, atau sumber pendapatan dari ingatan model.',
      ].join('\n');
    }

    const providerName = data.price?.longName || data.price?.shortName || null;
    const name = providerName || masterName;
    const shortName = data.price?.shortName || null;
    const sector = data.assetProfile?.sector || null;
    const industry = data.assetProfile?.industry || null;
    const businessSummary = data.assetProfile?.longBusinessSummary || null;
    const website = data.assetProfile?.website || null;

    return [
      `### ${ticker} — PROFIL EMITEN`,
      `- Kode saham IDX: ${ticker}`,
      `- Nama perusahaan: ${cleanText(name, 300)}`,
      `- Nama master ticker SahamLens: ${cleanText(masterName, 300)}`,
      `- Nama singkat provider: ${cleanText(shortName, 300)}`,
      `- Sektor: ${cleanText(sector, 300)}`,
      `- Industri: ${cleanText(industry, 300)}`,
      `- Ringkasan kegiatan usaha (sumber publik): ${cleanText(businessSummary)}`,
      `- Website perusahaan: ${cleanText(website, 500)}`,
      '- Sumber identitas: master ticker SahamLens + Yahoo Finance quoteSummary (PUBLIC_THIRD_PARTY), dengan field provider divalidasi adapter SahamLens.',
      '- ATURAN: rangkum profil di atas dengan bahasa Indonesia sederhana. Boleh menjelaskan produk/segmen HANYA jika tercantum di ringkasan kegiatan usaha. Jangan menambah pemilik/pengendali, anak usaha, pangsa pasar, merek, atau sumber pendapatan yang tidak ada di data.',
    ].join('\n');
  } catch (error) {
    console.warn('[LensAI:issuer-profile] profil gagal dibaca', ticker, error instanceof Error ? error.message : String(error));
    return [
      `### ${ticker} — PROFIL EMITEN`,
      `- Kode saham IDX: ${ticker}`,
      `- Nama perusahaan (master ticker SahamLens): ${cleanText(masterName, 300)}`,
      '- Profil bisnis provider: gagal dibaca dari backend saat ini.',
      '- FAIL-CLOSED: nama dari master ticker boleh disebut, tetapi jangan menebak sektor, bidang usaha, produk, grup usaha, pengendali, atau sumber pendapatan dari ingatan model.',
    ].join('\n');
  }
}

export async function buildIssuerProfileKnowledge(tickers: string[]): Promise<string> {
  const uniqueTickers = [...new Set(tickers.map((ticker) => displayTicker(ticker)).filter(Boolean))];
  if (!uniqueTickers.length) return '';

  const blocks = await Promise.all(uniqueTickers.map(issuerProfileBlock));
  return [
    '## Data Terverifikasi Server (OTORITATIF - PROFIL EMITEN):',
    ...blocks,
  ].join('\n\n');
}
