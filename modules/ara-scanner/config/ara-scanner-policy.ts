export const ARA_SCANNER_POLICY = {
  name: 'Mesin Bukti ARA SahamLens',
  ownership: {
    evidenceEngine: 'SAHAMLENS',
    decisionOrchestrator: 'HERMES_AGENT_SPEED',
    humanFinalAuthority: true,
    boundary: 'SahamLens menghitung bukti dan observasi ARA tanpa keputusan. Hermes/Agent Speed menilai bukti secara independen dan memegang gerbang keputusan; manusia tetap otoritas final.',
  } as const,
  version: 'v0.3',
  lifecycle: ['RESEARCH_ONLY', 'EXPERIMENTAL', 'UNCALIBRATED'] as const,
  scoreName: 'ACS',
  scoreIsProbability: false,
  autoBuyAllowed: false,
  maxCandidates: 5,
  dataGate: {
    maxFutureSkewMinutes: 10,
    minimumAvailableWeight: 0.75,
    requiresCorporateActionAdjustment: true,
    requiresTradeableSecurity: true,
    requiresTraceableSourceAndTime: true,
    failure: { acs: null, action: 'NO_ACTION' as const },
  },
  formula: {
    expressionAsProvided: 'ACS = 100 x (0.15 x V + 0.20 x C + 0.20 x B + 0.10 x R + 0.05 x T + 0.10 x RS + 0.05 x S + 0.15 x K) - penalti',
    status: 'CONFIRMED' as const,
    penaltyUnit: 'ACS_POINTS' as const,
    reviewNote: 'Semua komponen adalah kontribusi positif. Hanya penalti rejection, failed breakout, dan kenaikan terlalu panjang yang dikurangi dari base ACS.',
    components: [
      { key: 'V', label: 'Volume expansion', weight: 0.15, detail: 'Volume aktual dibandingkan volume normal atau rata-rata.' },
      { key: 'C', label: 'Quality of close', weight: 0.20, detail: 'Posisi penutupan terhadap rentang harga harian; dekat high bernilai lebih besar.' },
      { key: 'B', label: 'Breakout quality', weight: 0.20, detail: 'Kekuatan dan persistensi breakout tanpa kegagalan atau rejection material.' },
      { key: 'R', label: 'Range expansion', weight: 0.10, detail: 'Ekspansi rentang harga yang mendukung pergerakan.' },
      { key: 'T', label: 'Turnover expansion', weight: 0.05, detail: 'Perubahan nilai transaksi relatif; bobot dibatasi karena berkorelasi dengan volume.' },
      { key: 'RS', label: 'Relative strength', weight: 0.10, detail: 'Kinerja saham dibandingkan IHSG atau benchmark relevan.' },
      { key: 'S', label: 'Supply condition', weight: 0.05, detail: 'Kualitas kondisi supply. SahamLens tidak memiliki order book, sehingga komponen ini permanen null di lapisan analisa; rejection dan distribusi tetap diterapkan sebagai penalti terpisah dari data harga.', ownedBy: 'EXECUTION_LAYER' },
      { key: 'K', label: 'Verified catalyst', weight: 0.15, detail: 'Kualitas katalis terverifikasi, bukan rumor.' },
    ] as const,
    penalties: [
      { key: 'rejection', label: 'Rejection' },
      { key: 'failedBreakout', label: 'Failed breakout' },
      { key: 'multiDayExtension', label: 'Kenaikan terlalu panjang' },
    ] as const,
  },
  thresholds: [
    { min: 80, max: 100, label: 'HIGH' },
    { min: 65, max: 79, label: 'MODERATE-HIGH' },
    { min: 50, max: 64, label: 'WATCH' },
    { min: 0, max: 49, label: 'LOW' },
  ] as const,
  classifications: {
    continuation: [
      'Penutupan kuat dan dekat harga tertinggi',
      'Breakout bersih serta bertahan',
      'Volume dan nilai transaksi meningkat',
      'Relative strength positif',
      'Katalis terverifikasi',
      'Tidak ada rejection atau distribusi material',
      'Saham masih layak diperdagangkan',
    ],
    exhaustion: [
      'Upper wick atau rejection kuat',
      'Breakout gagal',
      'Distribusi atau tekanan jual meningkat',
      'Kenaikan beberapa hari sudah terlalu jauh',
      'Likuiditas menurun',
      'Harga gagal mempertahankan level penting',
    ],
    exhaustionActions: ['WAIT', 'AVOID_CHASING', 'NO_ACTION'] as const,
  },
  /**
   * Ambang likuiditas lapisan analisa. Bukan jaminan eksekusi: ini hanya
   * menyaring saham yang terlalu tipis untuk dianalisis serius. Spread, depth,
   * dan slippage tetap milik lapisan eksekusi.
   */
  liquidityProxy: {
    minAvgDailyTurnoverIdr: 5_000_000_000,
    minAvgDailyVolume: 1_000_000,
    maxZeroVolumeDaysIn20: 2,
    note: 'Lolos ambang ini berarti layak dianalisis, BUKAN berarti order berukuran tertentu bisa terisi.',
  },
  investabilityOrder: ['Kualitas continuation', 'Investability', 'ACS'] as const,
  /**
   * Investability dibagi menurut pemilik data. SahamLens hanya boleh mengklaim
   * yang ada di analysisLayer; sisanya wajib dinilai di titik eksekusi.
   */
  investabilityChecks: {
    analysisLayer: [
      'Likuiditas via proksi nilai transaksi dan volume rata-rata',
      'Frekuensi transaksi',
      'Status suspensi/UMA',
      'Free float',
      'Aksi korporasi',
      'Risiko governance',
    ],
    executionLayer: [
      'Spread',
      'Kedalaman bid-offer',
      'Slippage',
      'Kelayakan entry dan exit pada harga nyata',
    ],
    executionLayerOwner: 'HERMES_AGENT_SPEED_DAN_MANUSIA',
    executionLayerNote: 'SahamLens tidak memiliki order book dan tidak boleh mengklaim spread, depth, atau slippage. Pemeriksaan ini dilakukan Agent Speed bersama manusia di platform broker sebelum eksekusi.',
  } as const,
  downstreamDecisionContract: {
    owner: 'HERMES_AGENT_SPEED',
    independentReviewRequired: true,
    evidenceIsNonBinding: true,
    gates: [
      'Quant/Data',
      'Fundamental dan valuasi',
      'Trader/teknikal',
      'Makro dan sektor',
      'Bear/Risk Reviewer',
      'Portfolio fit',
    ],
    outcomes: ['EKSEKUSI', 'PANTAU', 'TOLAK_ATAU_DIAM'],
    riskReviewerCanVeto: true,
  } as const,
  prohibitions: [
    'Menganggap ACS sebagai probabilitas kenaikan',
    'Menghasilkan BUY otomatis',
    'Mengejar saham yang sudah ARA',
    'Mengarang order book, volume, katalis, atau harga',
    'Mengklaim spread, kedalaman bid-offer, atau slippage dari sisi SahamLens',
    'Menaikkan ORDER_BOOK dari OUT_OF_SCOPE menjadi READY di dalam SahamLens',
    'Menggunakan data stale sebagai kondisi live',
    'Menganggap input yang tidak tersedia sebagai netral',
    'Mengubah sinyal SahamLens menjadi keputusan tanpa evaluasi independen',
    'Mengirim lebih dari lima kandidat',
  ] as const,
} as const;

export type AraScannerPolicy = typeof ARA_SCANNER_POLICY;
