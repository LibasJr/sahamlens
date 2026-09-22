/**
 * Normalisasi ringan untuk KLASIFIKASI percakapan.
 * Teks asli tetap dipakai untuk entity/ticker/date extraction supaya kode saham,
 * angka, dan tanggal tidak berubah diam-diam.
 */
export function normalizeChatText(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'")
    .replace(/\s+/g, ' ')
    // Hanya typo sosial yang sangat terbatas dan aman. Jangan menormalisasi token
    // finansial/ticker secara generik (mis. BBCA, PER, RSI, tanggal, angka).
    .replace(/\bhal+o+\b/g, 'halo')
    .replace(/\bhai+\b/g, 'hai')
    .replace(/\bmakasih+\b/g, 'makasih');
}

export function stripTerminalPunctuation(input: string): string {
  return input.replace(/[!?.,;:]+$/g, '').trim();
}

/**
 * POLA KEBOCORAN TOOL-CALL (laporan operator, 2026-09-22): beberapa model menumpahkan
 * sintaks pemanggilan fungsi internalnya ke jawaban yang terlihat pengguna - blok
 * <tool_call>/<function_call>, payload JSON {"name": ..., "arguments": ...}, atau token
 * spesial <|...|>. Itu bukan bagian jawaban: pengguna tidak pernah boleh melihatnya.
 * Stripping dilakukan sebelum verifikasi angka supaya pola angka di dalam payload JSON
 * tidak ikut dihitung sebagai klaim jawaban.
 */
const TOOL_CALL_BLOCK_PATTERNS: RegExp[] = [
  /<tool_call\b[^>]*>[\s\S]*?(?:<\/tool_call>|$)/gi,
  /<function_call\b[^>]*>[\s\S]*?(?:<\/function_call>|$)/gi,
  /<\|(?:tool_call|function_call|tool|system|im_end|endofmessage)[^|>]{0,40}\|>/gi,
];

/** Payload JSON pemanggilan tool: {"name": "...", "arguments": {...}} - utuh atau terpotong. */
const TOOL_CALL_JSON_RE = /"name"\s*:\s*"[^"]*"\s*,\s*"arguments"/i;

export function stripToolCallSyntax(input: string): string {
  let output = input;
  for (const pattern of TOOL_CALL_BLOCK_PATTERNS) {
    output = output.replace(pattern, '');
  }
  // Fenced code block yang isinya payload tool-call JSON dibuang utuh - identik
  // dengan kasus blok <tool_call>, hanya dibungkus backtick oleh model.
  output = output.replace(/```[a-zA-Z]*\n[\s\S]*?```/g, (block) =>
    TOOL_CALL_JSON_RE.test(block) ? '' : block,
  );
  // Payload terpotong yang tidak kebangun blok fenced-nya: baris berawalan JSON tool-call.
  output = output
    .split('\n')
    .filter((line) => !(/^\s*\{\s*"name"\s*:\s*"/i.test(line) && /arguments/i.test(line)))
    .join('\n');
  // Sisa tag pembuka/penutup yatim.
  output = output
    .replace(/<\/?(?:tool_call|function_call|function)\b[^>]*>/gi, '')
    .replace(/<\|[^|>]{0,40}\|>/g, '');
  return output;
}

const EMPTY_ANSWER_FALLBACK =
  'Maaf, jawaban LensAI belum berhasil disusun dengan benar. Silakan coba tanyakan ulang.';

export function sanitizeChatAnswerText(input: string): string {
  let output = stripToolCallSyntax(input)
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '')
    .replace(/<think\b[^>]*>[\s\S]*$/gi, '')
    .replace(/<\/?think\b[^>]*>/gi, '')
    .replace(/^\s+/, '')
    .replace(/\n{3,}/g, '\n\n');
  if (/<think\b|<\/think>/i.test(output)) {
    output = output.replace(/<\/?think\b[^>]*>/gi, '');
  }
  // Kalau seluruh isi ternyata cuma sintaks tool-call, jangan kirim string kosong -
  // jawaban kosong membuat UI menggantung tanpa pesan.
  if (!output.trim() && input.trim()) {
    return EMPTY_ANSWER_FALLBACK;
  }
  return output;
}

export function getDeterministicSmallTalkResponse(normalizedInput: string): string | null {
  const value = stripTerminalPunctuation(normalizedInput);

  if (/^(halo|hai|hi)(\s+(lensai|sahamlens))?$/.test(value)) {
    return value.startsWith('halo')
      ? 'Halo! Saya LensAI dari SahamLens. Ada yang ingin kamu cek atau tanyakan?'
      : 'Hai! Saya LensAI dari SahamLens. Ada yang ingin kamu cek atau tanyakan?';
  }

  if (/^selamat\s+(pagi|siang|sore|malam)$/.test(value)) {
    const part = value.replace('selamat ', '');
    return `Selamat ${part}! Ada saham, kondisi pasar, atau fitur SahamLens yang ingin kamu cek?`;
  }

  if (/^(pagi|siang|sore|malam)$/.test(value)) {
    return `Selamat ${value}! Ada yang ingin kamu cek di SahamLens?`;
  }

  if (/^(makasih|terima kasih|thanks)(\s+(ya|yah|bang|gan|min))?$/.test(value)) {
    return 'Sama-sama! Kalau ada saham atau fitur SahamLens yang ingin dicek lagi, tinggal tanya.';
  }

  if (/^(siapa kamu|kamu siapa)$/.test(value)) {
    return 'Saya LensAI, asisten di SahamLens. Saya bisa membantu menjelaskan analisis saham, fundamental, teknikal, valuasi, kondisi pasar, dan fitur SahamLens.';
  }

  // DIPERLUAS 2026-08-13 (temuan evaluasi routing). Sebelumnya polanya `^bisa bantu apa$`
  // saja - "kamu bisa bantu apa?", bentuk yang justru paling sering diketik, tidak
  // tertangkap dan jatuh ke UNKNOWN. Jawabannya juga sudah usang: ia menyebut empat hal
  // sementara LensAI kini menjangkau pasar, LensRadar, dividen, earnings, arus dana, dan
  // data pribadi pengguna. Pertanyaan "kamu bisa apa" dijawab dengan daftar yang terlalu
  // sempit adalah kerugian nyata - pengguna berhenti menanyakan hal yang sebenarnya bisa.
  if (/^(kamu |lensai )?(bisa bantu apa( aja| saja)?|bisa apa( aja| saja)?|bisa ngapain( aja| saja)?)$/.test(value)) {
    return [
      'Saya bisa bantu beberapa hal di SahamLens:',
      '',
      '- **Analisis emiten** - fundamental, teknikal, valuasi/nilai wajar, moat, risiko/beta',
      '- **Kondisi pasar** - IHSG, breadth, sektor, top gainer/loser, saham teraktif',
      '- **LensRadar** - peringkat skor harian, plus cara skornya ditentukan',
      '- **Dividen, earnings, dan kalender korporasi**',
      '- **Arus dana** - broker summary dan indikasi akumulasi/distribusi',
      '- **Portofolio & watchlist kamu** - kalau kamu sedang login',
      '',
      'Sebut saja kode sahamnya (misal "BBCA fundamentalnya gimana?") atau tanya kondisi pasar hari ini.',
    ].join('\n');
  }

  if (/^apa kabar$/.test(value)) {
    return 'Baik, terima kasih! Ada saham atau fitur SahamLens yang ingin kamu cek hari ini?';
  }

  return null;
}
