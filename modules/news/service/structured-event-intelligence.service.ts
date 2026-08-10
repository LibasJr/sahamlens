export const EVENT_TYPES = [
  'EARNINGS',
  'DIVIDEND',
  'CORPORATE_ACTION',
  'M_AND_A',
  'CAPITAL_RAISE',
  'REGULATORY',
  'MACRO_RATE',
  'FX',
  'COMMODITY',
  'LEGAL',
  'OPERATIONS',
  'MANAGEMENT',
  'MARKET_FLOW',
  'OTHER',
] as const;

export const EVENT_HORIZONS = [
  'IMMEDIATE',
  'SHORT_TERM',
  'MEDIUM_TERM',
  'LONG_TERM',
  'UNDETERMINED',
] as const;

export const IMPACT_DIRECTIONS = [
  'POSITIVE',
  'NEGATIVE',
  'MIXED',
  'NEUTRAL',
  'UNCLEAR',
] as const;

export const IMPACT_MAGNITUDES = ['LOW', 'MEDIUM', 'HIGH', 'UNDETERMINED'] as const;

export type EventType = (typeof EVENT_TYPES)[number];
export type EventHorizon = (typeof EVENT_HORIZONS)[number];
export type ImpactDirection = (typeof IMPACT_DIRECTIONS)[number];
export type ImpactMagnitude = (typeof IMPACT_MAGNITUDES)[number];

export type StructuredEventIntelligence = {
  eventType: EventType;
  eventLabel: string;
  affectedMetrics: string[];
  horizon: EventHorizon;
  expectedImpact: {
    direction: ImpactDirection;
    magnitude: ImpactMagnitude;
    summary: string;
  };
  confidence: number;
  evidenceBasis: 'HEADLINE_ONLY';
};

type Rule = {
  eventType: EventType;
  eventLabel: string;
  keywords: string[];
  affectedMetrics: string[];
  horizon: EventHorizon;
  defaultDirection: ImpactDirection;
  magnitude: ImpactMagnitude;
  confidence: number;
  summary: string;
};

const POSITIVE_CUES = [
  'naik',
  'menguat',
  'melesat',
  'melonjak',
  'tumbuh',
  'rekor',
  'surplus',
  'menang',
  'disetujui',
  'meningkat',
];

const NEGATIVE_CUES = [
  'turun',
  'anjlok',
  'merosot',
  'rugi',
  'gagal',
  'ditolak',
  'dibatalkan',
  'default',
  'bangkrut',
  'suspensi',
  'gugatan',
];

// Urutan penting: event yang lebih spesifik harus dinilai sebelum event umum.
const RULES: Rule[] = [
  {
    eventType: 'CAPITAL_RAISE',
    eventLabel: 'Penambahan modal',
    keywords: ['rights issue', 'right issue', 'private placement', 'penerbitan saham baru'],
    affectedMetrics: ['Jumlah saham', 'EPS', 'Kas'],
    horizon: 'MEDIUM_TERM',
    defaultDirection: 'MIXED',
    magnitude: 'HIGH',
    confidence: 68,
    summary: 'Modal bertambah, tetapi dilusi EPS bergantung pada harga dan penggunaan dana.',
  },
  {
    eventType: 'CORPORATE_ACTION',
    eventLabel: 'Buyback saham',
    keywords: ['buyback', 'pembelian kembali saham'],
    affectedMetrics: ['Jumlah saham', 'EPS', 'Likuiditas'],
    horizon: 'SHORT_TERM',
    defaultDirection: 'POSITIVE',
    magnitude: 'MEDIUM',
    confidence: 67,
    summary: 'Permintaan saham dapat meningkat dan jumlah saham beredar dapat berkurang.',
  },
  {
    eventType: 'DIVIDEND',
    eventLabel: 'Dividen',
    keywords: ['dividen', 'dividend'],
    affectedMetrics: ['Dividend yield', 'Payout ratio', 'Kas'],
    horizon: 'SHORT_TERM',
    defaultDirection: 'POSITIVE',
    magnitude: 'MEDIUM',
    confidence: 69,
    summary: 'Dampak utama melalui imbal hasil tunai, payout ratio, dan posisi kas.',
  },
  {
    eventType: 'M_AND_A',
    eventLabel: 'Merger dan akuisisi',
    keywords: ['akuisisi', 'merger', 'pengambilalihan', 'takeover'],
    affectedMetrics: ['Pendapatan', 'EPS', 'Leverage'],
    horizon: 'MEDIUM_TERM',
    defaultDirection: 'MIXED',
    magnitude: 'HIGH',
    confidence: 66,
    summary: 'Sinergi dapat menaikkan pendapatan, tetapi harga transaksi dan pembiayaan menentukan hasil.',
  },
  {
    eventType: 'EARNINGS',
    eventLabel: 'Kinerja keuangan',
    keywords: ['laba bersih', 'rugi bersih', 'pendapatan', 'kinerja keuangan', 'kuartal', 'earnings'],
    affectedMetrics: ['Pendapatan', 'Laba bersih', 'Margin'],
    horizon: 'SHORT_TERM',
    defaultDirection: 'MIXED',
    magnitude: 'HIGH',
    confidence: 65,
    summary: 'Perubahan pendapatan, laba, dan margin dapat mengubah ekspektasi valuasi.',
  },
  {
    eventType: 'LEGAL',
    eventLabel: 'Risiko hukum',
    keywords: ['gugatan', 'pengadilan', 'tersangka', 'pailit', 'bangkrut', 'default', 'suspensi', 'delisting'],
    affectedMetrics: ['Biaya hukum', 'Arus kas', 'Going concern'],
    horizon: 'MEDIUM_TERM',
    defaultDirection: 'NEGATIVE',
    magnitude: 'HIGH',
    confidence: 67,
    summary: 'Proses hukum dapat menekan biaya, arus kas, atau kelangsungan usaha.',
  },
  {
    eventType: 'MACRO_RATE',
    eventLabel: 'Suku bunga dan inflasi',
    keywords: ['suku bunga', 'bi rate', 'bank indonesia', 'the fed', 'fed rate', 'inflasi'],
    affectedMetrics: ['Cost of funds', 'NIM', 'Discount rate'],
    horizon: 'MEDIUM_TERM',
    defaultDirection: 'MIXED',
    magnitude: 'HIGH',
    confidence: 64,
    summary: 'Transmisi berbeda per sektor melalui biaya dana, margin bunga, dan valuasi.',
  },
  {
    eventType: 'FX',
    eventLabel: 'Pergerakan valuta',
    keywords: ['rupiah', 'kurs', 'valas', 'dolar as', 'usd'],
    affectedMetrics: ['Biaya impor', 'Laba/rugi kurs', 'Margin'],
    horizon: 'SHORT_TERM',
    defaultDirection: 'MIXED',
    magnitude: 'MEDIUM',
    confidence: 63,
    summary: 'Dampak bergantung pada eksposur impor, ekspor, dan lindung nilai emiten.',
  },
  {
    eventType: 'COMMODITY',
    eventLabel: 'Harga komoditas',
    keywords: ['batu bara', 'batubara', 'nikel', 'cpo', 'minyak', 'crude', 'emas', 'komoditas'],
    affectedMetrics: ['Harga jual rata-rata', 'Pendapatan', 'Gross margin'],
    horizon: 'SHORT_TERM',
    defaultDirection: 'MIXED',
    magnitude: 'HIGH',
    confidence: 63,
    summary: 'Harga komoditas memengaruhi harga jual, pendapatan, dan margin produsen atau pengguna.',
  },
  {
    eventType: 'OPERATIONS',
    eventLabel: 'Operasional dan ekspansi',
    keywords: ['ekspansi', 'capex', 'pabrik', 'produksi', 'penjualan', 'kontrak baru', 'proyek baru'],
    affectedMetrics: ['Volume', 'Pendapatan', 'Capex'],
    horizon: 'LONG_TERM',
    defaultDirection: 'MIXED',
    magnitude: 'MEDIUM',
    confidence: 59,
    summary: 'Volume dan pendapatan berpotensi berubah, dengan kebutuhan capex sebagai penyeimbang.',
  },
  {
    eventType: 'REGULATORY',
    eventLabel: 'Kebijakan dan regulasi',
    keywords: ['ojk', 'regulasi', 'aturan baru', 'pajak', 'royalti', 'larangan ekspor', 'pemerintah'],
    affectedMetrics: ['Pendapatan', 'Biaya operasi', 'Margin'],
    horizon: 'MEDIUM_TERM',
    defaultDirection: 'MIXED',
    magnitude: 'HIGH',
    confidence: 58,
    summary: 'Dampak bergantung pada cakupan aturan dan emiten atau sektor yang terkena.',
  },
  {
    eventType: 'MANAGEMENT',
    eventLabel: 'Perubahan manajemen',
    keywords: ['direktur utama', 'ceo', 'komisaris', 'direksi', 'manajemen baru', 'mengundurkan diri'],
    affectedMetrics: ['Strategi', 'Eksekusi', 'Governance'],
    horizon: 'LONG_TERM',
    defaultDirection: 'UNCLEAR',
    magnitude: 'MEDIUM',
    confidence: 57,
    summary: 'Dampak bergantung pada perubahan strategi, kualitas eksekusi, dan tata kelola.',
  },
  {
    eventType: 'MARKET_FLOW',
    eventLabel: 'Arus dan teknikal pasar',
    keywords: ['net buy', 'net sell', 'asing masuk', 'asing keluar', 'foreign flow', 'ihsg', 'top gainer', 'top loser', 'indeks saham'],
    affectedMetrics: ['Harga', 'Volume', 'Likuiditas'],
    horizon: 'IMMEDIATE',
    defaultDirection: 'MIXED',
    magnitude: 'MEDIUM',
    confidence: 61,
    summary: 'Arus dana dan likuiditas terutama memengaruhi harga dan volume jangka sangat pendek.',
  },
  {
    eventType: 'CAPITAL_RAISE',
    eventLabel: 'Pendanaan',
    keywords: ['obligasi', 'penerbitan utang', 'pinjaman baru', 'refinancing'],
    affectedMetrics: ['Kas', 'Debt/Equity', 'Beban bunga'],
    horizon: 'MEDIUM_TERM',
    defaultDirection: 'MIXED',
    magnitude: 'MEDIUM',
    confidence: 57,
    summary: 'Likuiditas dapat membaik, sementara leverage dan beban bunga dapat meningkat.',
  },
];

function includesAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function inferDirection(title: string, defaultDirection: ImpactDirection): ImpactDirection {
  const lower = title.toLowerCase();
  const hasPositive = includesAny(lower, POSITIVE_CUES);
  const hasNegative = includesAny(lower, NEGATIVE_CUES);
  if (hasPositive && !hasNegative) return 'POSITIVE';
  if (hasNegative && !hasPositive) return 'NEGATIVE';
  if (hasPositive && hasNegative) return 'MIXED';
  return defaultDirection;
}

function directionSummary(direction: ImpactDirection, fallback: string): string {
  if (direction === 'POSITIVE') return 'Indikasi awal positif. ' + fallback;
  if (direction === 'NEGATIVE') return 'Indikasi awal negatif. ' + fallback;
  return fallback;
}

export function classifyEventByRules(title: string): StructuredEventIntelligence {
  const lower = title.toLowerCase();
  const rule = RULES.find((candidate) => includesAny(lower, candidate.keywords));

  if (!rule) {
    return {
      eventType: 'OTHER',
      eventLabel: 'Peristiwa lain',
      affectedMetrics: ['Belum dapat dipastikan'],
      horizon: 'UNDETERMINED',
      expectedImpact: {
        direction: 'UNCLEAR',
        magnitude: 'UNDETERMINED',
        summary: 'Judul belum cukup untuk memetakan dampak fundamental atau pasar.',
      },
      confidence: 25,
      evidenceBasis: 'HEADLINE_ONLY',
    };
  }

  const direction = inferDirection(title, rule.defaultDirection);
  return {
    eventType: rule.eventType,
    eventLabel: rule.eventLabel,
    affectedMetrics: rule.affectedMetrics,
    horizon: rule.horizon,
    expectedImpact: {
      direction,
      magnitude: rule.magnitude,
      summary: directionSummary(direction, rule.summary),
    },
    confidence: rule.confidence,
    evidenceBasis: 'HEADLINE_ONLY',
  };
}

function isOneOf<T extends readonly string[]>(value: unknown, allowed: T): value is T[number] {
  return typeof value === 'string' && allowed.includes(value as T[number]);
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean ? clean.slice(0, maxLength) : null;
}

/**
 * Respons AI tidak pernah dipercaya mentah. Nilai yang tidak valid kembali ke rule
 * engine dan confidence selalu dibatasi karena sumber analisis hanya judul RSS.
 */
export function sanitizeEventIntelligence(
  raw: unknown,
  title: string,
): StructuredEventIntelligence {
  const fallback = classifyEventByRules(title);
  if (!raw || typeof raw !== 'object') return fallback;

  const candidate = raw as Record<string, unknown>;
  const rawImpact = candidate.expectedImpact;
  const impact = rawImpact && typeof rawImpact === 'object'
    ? rawImpact as Record<string, unknown>
    : {};

  const metrics = Array.isArray(candidate.affectedMetrics)
    ? candidate.affectedMetrics
        .map((metric) => cleanText(metric, 40))
        .filter((metric): metric is string => Boolean(metric))
        .slice(0, 3)
    : [];

  const rawConfidence = typeof candidate.confidence === 'number'
    ? candidate.confidence
    : Number(candidate.confidence);
  const confidence = Number.isFinite(rawConfidence)
    ? Math.max(20, Math.min(75, Math.round(rawConfidence)))
    : fallback.confidence;

  return {
    eventType: isOneOf(candidate.eventType, EVENT_TYPES) ? candidate.eventType : fallback.eventType,
    eventLabel: cleanText(candidate.eventLabel, 60) ?? fallback.eventLabel,
    affectedMetrics: metrics.length > 0 ? metrics : fallback.affectedMetrics,
    horizon: isOneOf(candidate.horizon, EVENT_HORIZONS) ? candidate.horizon : fallback.horizon,
    expectedImpact: {
      direction: isOneOf(impact.direction, IMPACT_DIRECTIONS)
        ? impact.direction
        : fallback.expectedImpact.direction,
      magnitude: isOneOf(impact.magnitude, IMPACT_MAGNITUDES)
        ? impact.magnitude
        : fallback.expectedImpact.magnitude,
      summary: cleanText(impact.summary, 180) ?? fallback.expectedImpact.summary,
    },
    confidence,
    evidenceBasis: 'HEADLINE_ONLY',
  };
}
