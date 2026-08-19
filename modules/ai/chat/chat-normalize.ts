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
