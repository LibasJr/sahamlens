import { generateAI } from '@/lib/aiProviders';
import {
  sanitizeEventIntelligence,
  type StructuredEventIntelligence,
} from './structured-event-intelligence.service';

export type NewsClassification = {
  sentiment: 'POSITIF' | 'NETRAL' | 'NEGATIF';
  reason: string;
  intelligence: StructuredEventIntelligence;
};

export async function classifyStructuredWithCouncilAI(
  titles: string[],
): Promise<NewsClassification[] | null> {
  if (titles.length === 0) return null;
  try {
    const list = titles.map((title, index) => String(index + 1) + '. ' + title).join('\n');
    const prompt = [
      'Analisis event saham Indonesia hanya dari judul. Jangan mengarang isi, angka, target harga, atau emiten.',
      'Tiap item: sentiment POSITIF|NETRAL|NEGATIF, reason maksimal 12 kata, dan intelligence.',
      'eventType EARNINGS|DIVIDEND|CORPORATE_ACTION|M_AND_A|CAPITAL_RAISE|REGULATORY|MACRO_RATE|FX|COMMODITY|LEGAL|OPERATIONS|MANAGEMENT|MARKET_FLOW|OTHER.',
      'affectedMetrics 1-3 metrik; horizon IMMEDIATE|SHORT_TERM|MEDIUM_TERM|LONG_TERM|UNDETERMINED.',
      'expectedImpact berisi direction POSITIVE|NEGATIVE|MIXED|NEUTRAL|UNCLEAR, magnitude LOW|MEDIUM|HIGH|UNDETERMINED, summary maksimal 18 kata.',
      'Gunakan dapat/berpotensi untuk inferensi. confidence 20-75 karena hanya judul.',
      list,
      'Balas hanya JSON object dengan key items sesuai urutan:',
      '{"items":[{"sentiment":"POSITIF","reason":"...","intelligence":{"eventType":"EARNINGS","eventLabel":"Kinerja keuangan","affectedMetrics":["Pendapatan","Laba bersih"],"horizon":"SHORT_TERM","expectedImpact":{"direction":"POSITIVE","magnitude":"HIGH","summary":"Laba dapat memperbaiki ekspektasi kinerja."},"confidence":70}}]}',
    ].join('\n');

    const text = await generateAI({ prompt, json: true, timeoutMs: 12000 });
    if (!text) return null;
    const parsed = JSON.parse(text);
    const items = Array.isArray(parsed) ? parsed : parsed?.items;
    if (!Array.isArray(items) || items.length !== titles.length) return null;

    return items.map((item: unknown, index: number) => {
      const value = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      const sentiment = ['POSITIF', 'NETRAL', 'NEGATIF'].includes(String(value.sentiment))
        ? value.sentiment as NewsClassification['sentiment']
        : 'NETRAL';
      return {
        sentiment,
        reason: typeof value.reason === 'string'
          ? value.reason.replace(/\s+/g, ' ').trim().slice(0, 120)
          : '',
        intelligence: sanitizeEventIntelligence(value.intelligence, titles[index]),
      };
    });
  } catch (error) {
    console.warn('[news] Klasifikasi event AI gagal, pakai fallback:', error);
    return null;
  }
}
