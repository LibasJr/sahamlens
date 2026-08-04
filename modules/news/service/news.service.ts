import Parser from 'rss-parser';
import { generateAI } from '@/lib/aiProviders';

// Berita & Sentimen Pasar - sebelumnya cuma placeholder "Segera hadir" di app/home,
// tidak ada backend sama sekali. Sumber berita: RSS publik gratis (bukan API
// berbayar). Sentimen dinilai oleh Council AI dalam SATU panggilan batch untuk
// semua judul sekaligus (bukan per-artikel) supaya hemat kuota, dengan cascade
// lintas provider (Gemini/Groq/OpenRouter - lib/aiProviders.ts); kalau semua
// provider tidak tersedia/gagal, fallback ke heuristik kata kunci rule-based
// (bukan default netral kosong).
//
// 10 sumber (2026-08-02, permintaan eksplisit "minim 10 sumber, harus kredibel") -
// sebelumnya cuma 2 (CNBC Indonesia + Detik Finance), jadi kalau salah satu/dua
// gagal fetch (rate-limit dari cloud IP, timeout, dst) hasilnya sering kosong
// total selama TTL cache 15 menit. Sekarang 10 media massa nasional yang sudah
// terverifikasi reachable + RSS-nya valid (dicoba manual sebelum ditambah ke sini,
// bukan ditebak) - kegagalan 1-2 sumber tidak lagi membuat widget kosong.
// IDX resmi (idx.co.id) TIDAK ada di daftar - situsnya SPA tanpa endpoint RSS
// publik yang bisa diandalkan (dicoba, hasilnya 503/HTML shell, bukan XML).
const RSS_FEEDS = [
  { name: 'CNBC Indonesia', url: 'https://www.cnbcindonesia.com/market/rss' },
  { name: 'CNBC Indonesia', url: 'https://www.cnbcindonesia.com/news/rss' },
  { name: 'Detik Finance', url: 'https://finance.detik.com/rss' },
  { name: 'CNN Indonesia', url: 'https://www.cnnindonesia.com/ekonomi/rss' },
  { name: 'Republika', url: 'https://www.republika.co.id/rss/ekonomi' },
  { name: 'IDX Channel', url: 'https://www.idxchannel.com/rss' },
  { name: 'Katadata', url: 'https://katadata.co.id/rss' },
  { name: 'Sindonews', url: 'https://ekbis.sindonews.com/rss' },
  { name: 'Liputan6', url: 'https://www.liputan6.com/feed/rss/bisnis' },
  { name: 'Warta Ekonomi', url: 'https://www.wartaekonomi.co.id/rss' },
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

// Filter relevansi market - BARU (2026-08-02, permintaan eksplisit "lebih sering
// tampilkan berita yang berhubungan dengan market"). Dengan 10 sumber (beberapa di
// antaranya kanal "Ekonomi"/"News" umum, bukan spesifik saham), mengurutkan semua
// item cuma berdasarkan tanggal terbit membiarkan berita yang sama sekali bukan
// pasar modal (mis. berita sosial/politik yang kebetulan ada di kanal Ekonomi) ikut
// lolos ke widget "Berita & Sentimen Pasar". Filter ini dijalankan SEBELUM sorting/
// slice, bukan tebakan AI - murni kecocokan kata kunci pada judul.
const MARKET_KEYWORDS = [
  'saham', 'ihsg', 'bei', 'bursa efek', 'emiten', 'reksadana', 'reksa dana',
  'obligasi', 'dividen', 'ipo', 'right issue', 'buyback', 'kuartal', 'laba bersih',
  'laba ', 'rugi bersih', 'kinerja keuangan', 'kapitalisasi pasar', 'market cap',
  'investor', 'valuasi', 'rupiah', 'valas', 'kurs', 'komoditas', 'crude', 'cpo',
  'batu bara', 'nikel', 'emas antam', 'bank indonesia', 'suku bunga', 'inflasi',
  'net sell', 'net buy', 'asing keluar', 'asing masuk', 'foreign flow', 'akuisisi',
  'merger', 'delisting', 'suspensi saham', 'ojk', 'fed rate', 'the fed', 'wall street',
  'nasdaq', 'dow jones', 'indeks saham', 'harga saham', 'gocap', 'top gainer', 'top loser',
];

function isMarketRelevant(title: string): boolean {
  const lower = title.toLowerCase();
  return MARKET_KEYWORDS.some((k) => lower.includes(k));
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
  // limit 30 (bukan default 15) - filter isMarketRelevant() di bawah cukup ketat
  // (istilah pasar saham spesifik), jadi dari 15 judul/sumber sering cuma segelintir
  // yang lolos (diverifikasi live: 10 sumber x 15 = ~150 mentah -> cuma 8 lolos filter,
  // jauh dari target 40 buat halaman /news). Fetch tetap 1x per sumber (parser.parseURL
  // ambil seluruh feed lalu baru di-slice), jadi menaikkan angka ini TIDAK menambah
  // waktu/panggilan HTTP - murni memperbesar kandidat sebelum difilter.
  const results = await Promise.all(RSS_FEEDS.map((feed) => fetchFeed(feed, 30)));
  const merged = results.flat();

  const seen = new Set<string>();
  const deduped = merged.filter((item) => {
    if (!item.title || seen.has(item.title)) return false;
    seen.add(item.title);
    return true;
  });

  // Filter relevansi dulu, baru urut+ambil 40 - supaya berita non-pasar (sosial/
  // politik yang kebetulan ada di kanal Ekonomi/News umum) tidak ikut lolos hanya
  // karena kebetulan terbaru. Fallback ke pool tanpa filter kalau hasil relevan
  // terlalu sedikit (<5) - lebih baik ada berita ekonomi umum daripada widget
  // kosong total pada hari yang sepi berita pasar spesifik.
  //
  // 40 (bukan 12) - satu fungsi ini dipakai BERSAMA oleh widget ringkas di Beranda
  // (app/home/page.tsx, slice sendiri ke 12 di sisi client) DAN halaman Berita penuh
  // (app/news/page.tsx, tampilkan semua). Menghitung 40 sekali lalu cache 15 menit
  // lebih murah daripada dua cache/panggilan AI terpisah untuk hal yang sama.
  const relevant = deduped.filter((item) => isMarketRelevant(item.title));
  const pool = relevant.length >= 5 ? relevant : deduped;

  pool.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
  const top = pool.slice(0, 40);

  const aiSentiments = await classifyWithCouncilAI(top.map((t) => t.title));
  const sentimentSource: 'council-ai' | 'keyword-fallback' = aiSentiments ? 'council-ai' : 'keyword-fallback';

  const items: NewsItem[] = top.map((item, i) => {
    const s = aiSentiments ? aiSentiments[i] : keywordSentiment(item.title);
    return { ...item, sentiment: s.sentiment, reason: s.reason };
  });

  return { items, sentimentSource };
}

// `sentiment: null` = saham TIDAK disebut media dalam siklus data ini (tidak ada
// artikel yang cocok) - berbeda dari 'NETRAL' (ADA artikel, tapi diklasifikasi
// netral). Menyamakan keduanya jadi 'NETRAL' akan mengulang pola H-04 (ketiadaan data
// disamarkan jadi nilai tengah yang terlihat terukur padahal cuma default).
export type TickerSentiment = { sentiment: Sentiment | null; matchedHeadline: string | null; matchedCount: number };

// BUG FIX (audit logika & algoritma 2026-08-05, temuan M-6): pencocokan berita ke emiten
// SEBELUMNYA menerima kecocokan SATU kata nama perusahaan sepanjang > 3 huruf. Efeknya
// parah untuk sektor perbankan: nama "Bank Central Asia" menghasilkan kata kunci "bank",
// sehingga judul apa pun tentang "Bank Indonesia menurunkan suku bunga" tercatat sebagai
// berita BBCA - dan ikut membentuk kolom Sentimen di Screener untuk BBCA/BBRI/BMRI/BBNI
// sekaligus. Sekarang: (1) kata terlalu umum di nama emiten IDX dibuang, (2) kecocokan
// nama harus berupa KATA UTUH (batas kata), bukan substring, (3) kata tunggal yang sangat
// umum tidak lagi cukup - butuh kode ticker, atau kombinasi kata nama yang distingtif.
const GENERIC_NAME_WORDS = new Set([
  'pt', 'tbk', 'the', 'persero', 'indonesia', 'bank', 'group', 'grup', 'jaya', 'sejahtera',
  'makmur', 'utama', 'sukses', 'mandiri', 'nusantara', 'internasional', 'international',
  'energi', 'energy', 'karya', 'sentosa', 'abadi', 'lestari', 'pratama', 'perkasa',
]);

function distinctiveNameWords(name: string): string[] {
  return (name || '')
    .toLowerCase()
    .replace(/[.,()]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !GENERIC_NAME_WORDS.has(w));
}

/** Cocok kalau judul menyebut KODE TICKER sebagai kata utuh, atau memuat kata distingtif
 * dari nama perusahaan (juga sebagai kata utuh). Emiten yang seluruh kata namanya generik
 * hanya bisa cocok lewat kode ticker - itu benar: tanpa penanda unik, "cocok" apa pun
 * cuma tebakan. */
export function matchesCompany(title: string, ticker: string, name?: string): boolean {
  const t = title.toLowerCase();
  const code = ticker.replace('.JK', '').toLowerCase();
  const wholeWord = (needle: string) =>
    new RegExp(`(^|[^a-z0-9])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(t);

  if (code.length >= 3 && wholeWord(code)) return true;
  const words = distinctiveNameWords(name || '');
  return words.some((w) => wholeWord(w));
}

// Sentimen berita PER-EMITEN untuk SELURUH universe Stock Screener sekaligus (bukan
// getStockNews() dipanggil satu-satu per ticker - untuk universe 114 saham itu berarti
// 114x fetch ulang 10 RSS feed yang SAMA + berpotensi 114 panggilan AI terpisah, boros
// dan lambat untuk data yang sama persis). RSS di-fetch SEKALI, dicocokkan ke tiap saham
// (definisi pencocokan SAMA dengan getStockNews: kode ticker atau kata distingtif nama
// perusahaan), lalu HANYA judul yang benar-benar cocok ke ticker mana pun yang dikirim ke
// Council AI untuk diklasifikasi - juga cuma sekali per judul unik (satu judul sektor bisa
// relevan ke banyak saham sekaligus).
async function classifyInChunks(titles: string[]): Promise<{ sentiment: Sentiment; reason: string }[] | null> {
  if (titles.length === 0) return [];
  const CHUNK = 40; // sama seperti batas per-panggilan di getMarketNews()
  const out: { sentiment: Sentiment; reason: string }[] = [];
  for (let i = 0; i < titles.length; i += CHUNK) {
    const chunk = titles.slice(i, i + CHUNK);
    const classified = await classifyWithCouncilAI(chunk);
    // Kalau SATU chunk gagal (AI tidak tersedia), seluruh batch jatuh ke fallback kata
    // kunci - bukan campuran diam-diam AI+heuristik per potongan tanpa penanda, supaya
    // pemanggil tahu pasti satu sumber metode per hasil (konsisten dgn getMarketNews).
    if (!classified) return null;
    out.push(...classified);
  }
  return out;
}

export async function getBatchStockSentiment(
  stocks: { ticker: string; name: string }[]
): Promise<Record<string, TickerSentiment>> {
  const results = await Promise.all(RSS_FEEDS.map((f) => fetchFeed(f, 40)));
  const merged = results.flat();
  const seen = new Set<string>();
  const deduped = merged.filter((item) => {
    if (!item.title || seen.has(item.title)) return false;
    seen.add(item.title);
    return true;
  });

  const matchesByTicker = new Map<string, typeof deduped>();
  for (const stock of stocks) {
    const matched = deduped
      .filter((item) => matchesCompany(item.title, stock.ticker, stock.name))
      .slice(0, 5); // cukup 5 artikel terbaru per saham untuk sentimen agregat
    if (matched.length > 0) matchesByTicker.set(stock.ticker, matched);
  }

  const uniqueTitles = Array.from(new Set(Array.from(matchesByTicker.values()).flat().map((i) => i.title)));
  const aiSentiments = await classifyInChunks(uniqueTitles);
  const sentimentByTitle = new Map<string, Sentiment>();
  uniqueTitles.forEach((title, i) => {
    sentimentByTitle.set(title, aiSentiments ? aiSentiments[i].sentiment : keywordSentiment(title).sentiment);
  });

  const result: Record<string, TickerSentiment> = {};
  for (const stock of stocks) {
    const matched = matchesByTicker.get(stock.ticker);
    if (!matched || matched.length === 0) {
      result[stock.ticker] = { sentiment: null, matchedHeadline: null, matchedCount: 0 };
      continue;
    }
    const labels = matched.map((m) => sentimentByTitle.get(m.title) || 'NETRAL');
    const posCount = labels.filter((l) => l === 'POSITIF').length;
    const negCount = labels.filter((l) => l === 'NEGATIF').length;
    const agg: Sentiment = posCount > negCount ? 'POSITIF' : negCount > posCount ? 'NEGATIF' : 'NETRAL';
    result[stock.ticker] = { sentiment: agg, matchedHeadline: matched[0].title, matchedCount: matched.length };
  }
  return result;
}

// Berita PER-EMITEN (bukan pasar umum) - dipakai di halaman Technical Analyzer/AI
// Council per saham. Sengaja TIDAK pakai Google News RSS search meski jauh lebih
// relevan/lengkap, karena feed itu berlisensi "personal, non-commercial use" saja
// (lihat copyright di response-nya) - SahamLens produk komersial (ada tier Pro).
// Jadi sumbernya tetap RSS_FEEDS yang sama, difilter berdasarkan penyebutan kode
// ticker/nama perusahaan di judul. Konsekuensinya: cakupan tipis untuk emiten yang
// jarang diberitakan - itu jujur lebih baik daripada menampilkan berita tidak terkait.
export async function getStockNews(symbol: string, companyName?: string): Promise<{ items: NewsItem[]; sentimentSource: 'council-ai' | 'keyword-fallback' }> {
  const results = await Promise.all(RSS_FEEDS.map((f) => fetchFeed(f, 40)));
  const merged = results.flat();

  // Definisi pencocokan yang SAMA dengan getBatchStockSentiment (temuan M-6) - satu
  // fungsi, supaya "berita saham ini" di halaman detail dan kolom Sentimen di Screener
  // tidak pernah memakai aturan berbeda.
  const matched = merged.filter((item) => matchesCompany(item.title, symbol, companyName));

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
