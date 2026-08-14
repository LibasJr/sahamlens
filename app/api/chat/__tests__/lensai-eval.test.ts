import { describe, expect, it, afterAll } from 'vitest';
import { classifyChatIntent } from '../chat-intent';
import { resolveChatDate } from '../chat-date';
import { getDeterministicSmallTalkResponse, normalizeChatText } from '../chat-normalize';
import { resolveConversationTickers } from '../extract-ticker';
import fixtures from './fixtures/lensai-questions.json';

/**
 * EVALUASI ROUTING LENSAI.
 *
 * Sejarah perbaikan LensAI di repo ini punya satu pola: bug ditemukan dari screenshot
 * pengguna, diperbaiki satu per satu, dan tidak ada satu pun angka yang menyatakan
 * seberapa baik keadaannya sekarang. Akibatnya perbaikan berikutnya selalu dimulai dari
 * nol - tidak ada cara tahu apakah sesuatu yang dulu benar masih benar.
 *
 * File ini memberi angka itu. Ia TIDAK memanggil AI sama sekali: yang diukur adalah
 * apakah pertanyaan sampai ke DATA yang benar, dan itu bagian yang deterministik. Kalau
 * routingnya benar, kualitas kalimat adalah urusan model; kalau routingnya salah, model
 * sebagus apa pun tidak punya bahan untuk menjawab.
 *
 * Jalankan sendiri: `npm run eval:lensai`
 */

type Fixture = {
  q: string;
  tickers: number;
  intent: string;
  reason?: string;
  clarify?: boolean;
  group: string;
};

const questions = fixtures.questions as Fixture[];
const failures: Array<{ q: string; expected: string; actual: string }> = [];
const byGroup = new Map<string, { total: number; passed: number }>();

function record(group: string, passed: boolean) {
  const entry = byGroup.get(group) ?? { total: 0, passed: 0 };
  entry.total += 1;
  if (passed) entry.passed += 1;
  byGroup.set(group, entry);
}

function route(fixture: Fixture) {
  // Small talk ditangkap route SEBELUM classifier (jawaban deterministik tanpa AI),
  // jadi evaluasi harus melewati gerbang yang sama supaya angkanya mencerminkan
  // perilaku sungguhan, bukan perilaku satu fungsi yang diuji terpisah.
  const smallTalk = getDeterministicSmallTalkResponse(normalizeChatText(fixture.q));
  if (smallTalk) {
    return { intent: 'SMALL_TALK', tickers: [], outOfScopeReason: undefined, needsClarification: undefined } as any;
  }

  // PERBAIKAN 2026-08-13: dulu memakai `fixture.tickers` sebagai MASUKAN, jadi evaluasi
  // ini secara struktural buta terhadap kesalahan ekstraksi ticker. Buktinya nyata -
  // "harga emas hari ini berapa?" lolos di sini dengan tickers=0, padahal di server
  // sungguhan kata "emas" terbaca sebagai emiten EMAS dan pertanyaannya berubah jadi
  // analisis saham. Sekarang ekstraktor SUNGGUHAN yang dipakai, dan `fixture.tickers`
  // berubah peran dari masukan menjadi EKSPEKTASI yang ikut diperiksa.
  const tickers = resolveConversationTickers({ prompt: fixture.q, history: [] });

  return {
    ...classifyChatIntent({
      prompt: fixture.q,
      date: resolveChatDate(fixture.q, []),
      tickerCount: tickers.length,
      hasHistory: false,
      history: [],
    }),
    tickers,
  };
}

describe('evaluasi routing LensAI', () => {
  it.each(questions.map((f) => [f.group, f.q, f] as const))('[%s] %s', (_group, _q, fixture) => {
    const result = route(fixture);
    const passed = result.intent === fixture.intent;

    record(fixture.group, passed);
    if (!passed) failures.push({ q: fixture.q, expected: fixture.intent, actual: result.intent });

    expect(
      result.tickers?.length ?? 0,
      `"${fixture.q}" seharusnya mengenali ${fixture.tickers} kode emiten, dapat: ${(result.tickers ?? []).join(', ') || '(tidak ada)'}`,
    ).toBe(fixture.tickers);

    expect(result.intent, `"${fixture.q}" seharusnya ${fixture.intent}`).toBe(fixture.intent);

    if (fixture.reason) {
      expect(result.outOfScopeReason, `"${fixture.q}" alasan penolakan`).toBe(fixture.reason);
    }
    if (fixture.clarify) {
      expect(result.needsClarification, `"${fixture.q}" seharusnya ditanya balik`).toBe(true);
    }
  });

  it('setiap kelompok fitur punya minimal 2 pertanyaan', () => {
    // Menjaga daftar tetap seimbang: gampang sekali menambah 20 pertanyaan pasar lalu
    // merasa cakupannya bagus, padahal satu fitur tidak pernah diuji sama sekali.
    const groups: Record<string, number> = {};
    for (const fixture of questions) groups[fixture.group] = (groups[fixture.group] ?? 0) + 1;
    const thin = Object.keys(groups).filter((group) => groups[group] < 2);
    expect(thin, `kelompok dengan kurang dari 2 pertanyaan: ${thin.join(', ')}`).toEqual([]);
  });
});

afterAll(() => {
  const total = questions.length;
  const passed = total - failures.length;
  const rows: string[] = [];
  // forEach, bukan spread: tsconfig menargetkan ES5 dan iterator Map tidak bisa
  // di-spread tanpa downlevelIteration.
  byGroup.forEach((stat, group) => {
    rows.push(`  ${group.padEnd(16)} ${String(stat.passed).padStart(2)}/${String(stat.total).padEnd(2)}`);
  });
  rows.sort();

  console.log(
    [
      '',
      `[lensai-eval] ${passed}/${total} pertanyaan sampai ke data yang benar`,
      ...rows,
      failures.length ? '  GAGAL:' : '',
      ...failures.map((f) => `    "${f.q}" -> ${f.actual} (seharusnya ${f.expected})`),
    ]
      .filter(Boolean)
      .join('\n'),
  );
});
