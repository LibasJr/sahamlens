import Parser from 'rss-parser';
import { generateAI } from '@/lib/aiProviders';

// Berita & Sentimen Pasar - sebelumnya cuma placeholder "Segera hadir" di app/home,
// tidak ada backend sama sekali. Sumber berita: RSS publik gratis (CNBC Indonesia
// & Detik Finance, keduanya sudah dites reachable), bukan API berbayar. Sentimen
// dinilai oleh Council AI dalam SATU panggilan batch untuk semua judul sekaligus
// (bukan per-artikel) supaya hemat kuota, dengan cascade lintas provider (Gemini/
// Groq/OpenRouter - lib/aiProviders.ts); kalau semua provider tidak tersedia/gagal,
// fallback ke heuristik kata kunci rule-based (bukan default netral kosong).

const RSS_FEEDS = [
  { name: 'CNBC Indonesia', url: 'https://www.cnbcindonesia.com/market/rss' },
  { name: 'Detik Finance', url: 'https://finance.detik.com/rss' },
];

const parser = new Parser({
  headers: { 'User-Agent': 'Mozilla/5.0' },
  timeout: 8000,
});

export type Sentiment = 'POSITIF' | 'NETRAL' | 'NEGATIF';
export type NewsItem = {
  title: string;
  link: string;
  source: string;
  pubDate: string;
  sentiment: Sentiment;
  reason: string;
};

async function fetchFeed(feed: { name: string; url: string }, limit = 15) {
  try {
    const parsed = await parser.parseURL(feed.url);
    return (parsed.items || []).slice(0, limit).map((item) => ({
      title: (item.title || '').trim(),
      link: item.link || '',
      source: feed.name,
      pubDate: item.pubDate || item.isoDate || new Date().toISOString(),
    }));
  } catch (e) {
    console.warn(`[news] Gagal fetch RSS ${feed.name}:`, e);
    return [];
  }
}

// Fallback rule-based - dipakai kalau Council AI (Gemini) tidak tersedia/gagal.
// Kata kunci umum bahasa berita finansial Indonesia, bukan tebakan acak.
const POSITIVE_WORDS = ['naik', 'menguat', 'melesat', 'melonjak', 'laba', 'untung', 'rekor', 'cuan', 'akuisisi', 'ekspansi', 'tumbuh', 'positif', 'surplus', 'bullish'];
const NEGATIVE_WORDS = ['turun', 'anjlok', 'merosot', 'rugi', 'gugatan', 'delisting', 'resesi', 'phk', 'default', 'bangkrut', 'negatif', 'bearish', 'krisis', 'suspensi', 'panic selling'];

function keywordSentiment(title: string): { sentiment: Sentiment; reason: string } {
  const lower = title.toLowerCase();
  const posHit = POSITIVE_WORDS.find((w) => lower.includes(w));
  const negHit = NEGATIVE_WORDS.find((w) => lower.includes(w));
  if (posHit && !negHit) return { sentiment: 'POSITIF', reason: `Mengandung kata kunci positif: "${posHit}"` };
  if (negHit && !posHit) return { sentiment: 'NEGATIF', reason: `Mengandung kata kunci negatif: "${negHit}"` };
  return { sentiment: 'NETRAL', reason: 'Tidak ada indikasi sentimen kuat dari judul' };
}

async function classifyWithCouncilAI(titles: string[]): Promise<{ sentiment: Sentiment; reason: string }[] | null> {
  if (titles.length === 0) return null;
  try {
    const list = titles.map((t, i) => `${i + 1}. ${t}`).join('\n');
    const prompt = `Kamu adalah analis sentimen pasar saham Indonesia. Untuk setiap judul berita di bawah, tentukan sentimennya terhadap pasar saham/emiten terkait: POSITIF, NETRAL, atau NEGATIF, beserta alasan singkat (maks 12 kata, Bahasa Indonesia).

Judul berita:
${list}

Balas HANYA dalam format JSON array, urut sesuai nomor, tanpa teks lain:
[{"sentiment":"POSITIF|NETRAL|NEGATIF","reason":"..."}]`;

    const text = await generateAI({ prompt, json: true, timeoutMs: 10000 });
    if (!text) return null;
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed) || parsed.length !== titles.length) return null;
    return parsed.map((p: any) => ({
      sentiment: ['POSITIF', 'NETRAL', 'NEGATIF'].includes(p.sentiment) ? p.sentiment : 'NETRAL',
      reason: typeof p.reason === 'string' ? p.reason : '',
    }));
  } catch (e) {
    console.warn('[news] Semua AI provider gagal, pakai fallback kata kunci:', e);
    return null;
  }
}

export async function getMarketNews(): Promise<{ items: NewsItem[]; sentimentSource: 'council-ai' | 'keyword-fallback' }> {
  const results = await Promise.all(RSS_FEEDS.map(fetchFeed));
  const merged = results.flat();

  const seen = new Set<string>();
  const deduped = merged.filter((item) => {
    if (!item.title || seen.has(item.title)) return false;
    seen.add(item.title);
    return true;
  });

  deduped.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
  const top = deduped.slice(0, 12);

  const aiSentiments = await classifyWithCouncilAI(top.map((t) => t.title));
  const sentimentSource: 'council-ai' | 'keyword-fallback' = aiSentiments ? 'council-ai' : 'keyword-fallback';

  const items: NewsItem[] = top.map((item, i) => {
    const s = aiSentiments ? aiSentiments[i] : keywordSentiment(item.title);
    return { ...item, sentiment: s.sentiment, reason: s.reason };
  });

  return { items, sentimentSource };
}

// Berita PER-EMITEN (bukan pasar umum) - dipakai di halaman Technical Analyzer/AI
// Council per saham. Sengaja TIDAK pakai Google News RSS search meski jauh lebih
// relevan/lengkap, karena feed itu berlisensi "personal, non-commercial use" saja
// (lihat copyright di response-nya) - SahamLens produk komersial (ada tier Pro).
// Jadi sumbernya tetap RSS_FEEDS yang sama, difilter berdasarkan penyebutan kode
// ticker/nama perusahaan di judul. Konsekuensinya: cakupan tipis untuk emiten yang
// jarang diberitakan - itu jujur lebih baik daripada menampilkan berita tidak terkait.
export async function getStockNews(symbol: string, companyName?: string): Promise<{ items: NewsItem[]; sentimentSource: 'council-ai' | 'keyword-fallback' }> {
  const code = symbol.replace('.JK', '').toUpperCase();
  const results = await Promise.all(RSS_FEEDS.map((f) => fetchFeed(f, 40)));
  const merged = results.flat();

  // Ambil kata-kata distingtif dari nama perusahaan (buang kata generik PT/Tbk/Indonesia
  // dkk yang muncul di hampir semua nama emiten dan tidak membantu filter).
  const GENERIC_WORDS = new Set(['pt', 'tbk', 'indonesia', 'persero', 'the']);
  const nameWords = (companyName || '')
    .toLowerCase()
    .replace(/[.,()]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !GENERIC_WORDS.has(w));

  const matched = merged.filter((item) => {
    const t = item.title.toLowerCase();
    if (t.includes(code.toLowerCase())) return true;
    return nameWords.some((w) => t.includes(w));
  });

  const seen = new Set<string>();
  const deduped = matched.filter((item) => {
    if (!item.title || seen.has(item.title)) return false;
    seen.add(item.title);
    return true;
  });
  deduped.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
  const top = deduped.slice(0, 8);

  const aiSentiments = await classifyWithCouncilAI(top.map((t) => t.title));
  const sentimentSource: 'council-ai' | 'keyword-fallback' = aiSentiments ? 'council-ai' : 'keyword-fallback';

  const items: NewsItem[] = top.map((item, i) => {
    const s = aiSentiments ? aiSentiments[i] : keywordSentiment(item.title);
    return { ...item, sentiment: s.sentiment, reason: s.reason };
  });

  return { items, sentimentSource };
}
