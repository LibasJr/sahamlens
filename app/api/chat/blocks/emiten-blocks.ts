import { cacheGet } from '@/shared/cache/redis-cache';
import { COMPUTED_CACHE_KEY } from '@/shared/cache/computed-keys';
import { fetchPublicEarningsData } from '@/modules/fundamental/service/public-earnings-data.service';
import { fetchNormalizedEarnings } from '@/modules/fundamental/service/normalized-earnings.service';
import { buildMoatProxy } from '@/modules/fundamental/service/moat-proxy.service';
import { buildMoatDurability } from '@/modules/fundamental/service/moat-durability.service';
import { getLatestBrokerPeriodSummary } from '@/modules/broker-flow';
import { analyzeBandarmology, analyzeAccumulationSignal, calculateBeta } from '@/modules/market';
import { fetchYahooHistory } from '@/modules/technical';
import { finite, safe, signed, unavailableLine } from './format';

/**
 * Blok data per-emiten untuk fitur yang sebelumnya tidak pernah sampai ke LensAI:
 * dividen, earnings, kalender korporasi, arus broker/bandarmologi, moat, dan risiko.
 *
 * Semua fungsi di sini mengembalikan STRING blok, tidak pernah melempar. Kegagalan satu
 * sumber tidak boleh menggagalkan seluruh jawaban - ia harus muncul sebagai baris "tidak
 * tersedia" supaya model tahu bedanya "tidak ditanyakan" dan "tidak terbaca".
 */

const FETCH_TIMEOUT_MS = 8000;

function plain(ticker: string): string {
  return ticker.replace(/\.JK$/i, '').toUpperCase();
}

/** Profil dividen dari universe yang sama dengan halaman Dividend Plan. */
export async function dividendBlock(ticker: string): Promise<string> {
  const universe = await cacheGet<any[]>(COMPUTED_CACHE_KEY.DIVIDEND_UNIVERSE);
  const code = plain(ticker);

  if (!Array.isArray(universe) || universe.length === 0) {
    return [`### ${code}`, unavailableLine('Data dividen', 'cache universe dividen sedang kosong')].join('\n');
  }

  const row = universe.find((item: any) => plain(String(item.ticker ?? '')) === code);
  if (!row) {
    return [
      `### ${code}`,
      `- Dividen: ${code} TIDAK ADA di universe dividen SahamLens (universe ini hanya memuat emiten pembayar dividen yang lolos kurasi).`,
      '- Itu BUKAN berarti emitennya tidak pernah bagi dividen - artinya SahamLens belum memuatnya. Jangan mengarang yield/DPS.',
    ].join('\n');
  }

  return [
    `### ${code}`,
    `- Dividend yield: ${safe(row.yield_pct, '%')}`,
    `- Skor keamanan dividen (model SahamLens): ${safe(row.safety_score)}`,
    `- Payout ratio: ${row.payout_ratio == null ? 'tidak tersedia' : safe(row.payout_ratio, '%')}`,
    `- Konsistensi membayar: ${row.consistency_years ?? 'tidak tersedia'} tahun`,
    '- BATAS: yield dihitung dari dividen yang SUDAH dibayar dan harga saat ini - bukan janji dividen berikutnya.',
  ].join('\n');
}

/** Earnings: jadwal rilis, ekspektasi analis, dan hasil kuartal terakhir. */
export async function earningsBlock(ticker: string): Promise<string> {
  const code = plain(ticker);
  try {
    const data = await fetchPublicEarningsData(ticker);
    if (!data) {
      return [`### ${code}`, unavailableLine('Data earnings')].join('\n');
    }

    const lines = [`### ${code}`];

    if (data.stock?.sector) lines.push(`- Sektor: ${data.stock.sector}${data.stock.industry ? ` / ${data.stock.industry}` : ''}`);

    if (data.upcoming?.date) {
      lines.push(
        `- Rilis berikutnya: ${data.upcoming.date}${data.upcoming.isEstimate ? ' (ESTIMASI, bukan tanggal resmi emiten)' : ''}` +
          `${data.upcoming.fiscalQuarter ? ` untuk ${data.upcoming.fiscalQuarter}` : ''}`,
      );
    } else {
      lines.push('- Rilis berikutnya: tidak tersedia. Jangan menebak tanggalnya.');
    }

    const eps = data.expectation?.eps;
    if (eps && (finite(eps.average) || finite(eps.growth))) {
      lines.push(
        `- Ekspektasi EPS: ${safe(eps.average)}${eps.currency ? ` ${eps.currency}` : ''}` +
          `${finite(eps.growth) ? `, pertumbuhan ${signed(eps.growth!)}%` : ''}` +
          `${eps.analystCount ? ` (dari ${eps.analystCount} analis)` : ''}`,
      );
    }

    const quarters = Array.isArray((data as any).quarters) ? (data as any).quarters : [];
    if (quarters.length) {
      lines.push('- Empat kuartal terakhir (hasil vs ekspektasi):');
      for (const q of quarters.slice(0, 4)) {
        lines.push(
          `  - ${q.period ?? q.fiscalQuarter ?? 'periode tidak tersedia'}: ${q.status ?? 'NO_DATA'}` +
            `${finite(q.actual) ? `, aktual ${safe(q.actual)}` : ''}${finite(q.estimate) ? `, estimasi ${safe(q.estimate)}` : ''}`,
        );
      }
    }

    if (data.periodCoverage?.missingQuarters?.length) {
      lines.push(
        `- LUBANG DATA: kuartal ${data.periodCoverage.missingQuarters.join(', ')} tidak ada di sumber.`,
        '  Sampaikan sebagai lubang, jangan disambung jadi tren mulus.',
      );
    }

    return lines.join('\n');
  } catch (error) {
    console.warn('[LensAI:emiten-blocks] earnings gagal', code, error instanceof Error ? error.message : String(error));
    return [`### ${code}`, unavailableLine('Data earnings', 'gagal dibaca dari sumber')].join('\n');
  }
}

/** Kalender korporasi (ex-date, jadwal earnings) - peta tanggal, disaring per emiten. */
export async function calendarBlock(tickers: string[]): Promise<string> {
  const map = await cacheGet<Record<string, any[]>>(COMPUTED_CACHE_KEY.CORPORATE_CALENDAR);
  if (!map || typeof map !== 'object') {
    return unavailableLine('Kalender korporasi', 'cache kalender sedang kosong');
  }

  const wanted = tickers.map(plain);
  const rows: string[] = [];

  for (const [dateKey, events] of Object.entries(map).sort(([a], [b]) => a.localeCompare(b))) {
    if (!Array.isArray(events)) continue;
    for (const event of events) {
      const symbol = plain(String(event.symbol ?? ''));
      if (wanted.length > 0 && !wanted.includes(symbol)) continue;
      rows.push(`  - ${dateKey} | ${symbol} | ${event.type} | ${event.title}`);
    }
  }

  if (!rows.length) {
    return wanted.length
      ? `- Kalender korporasi: tidak ada agenda tercatat untuk ${wanted.join(', ')} dalam jendela yang dipantau (45 hari ke belakang, 180 hari ke depan). Jangan mengarang tanggal.`
      : '- Kalender korporasi: tidak ada agenda dalam jendela yang dipantau.';
  }

  return [
    '- Agenda korporasi (jendela: 45 hari ke belakang sampai 180 hari ke depan):',
    ...rows.slice(0, 20),
    '- BATAS: ex-dividend date dari sumber adalah tanggal TERAKHIR TERCATAT (bisa sudah lewat),',
    '  dan tanggal earnings sering berupa ESTIMASI. Sebutkan sifat itu, jangan sajikan sebagai jadwal resmi emiten.',
  ].join('\n');
}

/**
 * Arus dana: data broker asli kalau ada, plus proksi bandarmologi dari OHLCV.
 *
 * Dua sumber ini TIDAK boleh dicampur jadi satu klaim. Broker summary adalah data
 * transaksi sungguhan per broker; bandarmologi hanyalah tekanan arus dana yang
 * disimpulkan dari harga & volume - ia tidak tahu siapa yang membeli.
 */
export async function flowBlock(ticker: string): Promise<string> {
  const code = plain(ticker);
  const lines = [`### ${code}`];

  try {
    const broker = await getLatestBrokerPeriodSummary(ticker);
    if (broker && Array.isArray(broker.rows) && broker.rows.length) {
      const top = [...broker.rows].sort((a, b) => b.netValue - a.netValue);
      lines.push(
        `- Broker summary (DATA TRANSAKSI SUNGGUHAN), periode ${broker.startDate} s/d ${broker.endDate}, sumber ${broker.source}:`,
        `  - Net subset: ${broker.netSubsetValue.toLocaleString('id-ID')}`,
        '  - Net beli terbesar:',
        ...top.slice(0, 3).map((r) => `    - ${r.brokerCode}${r.brokerType ? ` (${r.brokerType})` : ''}: net ${r.netValue.toLocaleString('id-ID')}`),
        '  - Net jual terbesar:',
        ...top.slice(-3).reverse().map((r) => `    - ${r.brokerCode}${r.brokerType ? ` (${r.brokerType})` : ''}: net ${r.netValue.toLocaleString('id-ID')}`),
      );
    } else {
      lines.push('- Broker summary: tidak ada periode tersimpan untuk emiten ini. Jangan menyebut nama broker atau angka net broker apa pun.');
    }
  } catch (error) {
    console.warn('[LensAI:emiten-blocks] broker summary gagal', code, error instanceof Error ? error.message : String(error));
    lines.push('- Broker summary: gagal dibaca dari database.');
  }

  try {
    const chart = await fetchYahooHistory(ticker, '6mo');
    const history = chart?.history
      ?.filter((h: any) => finite(h.High) && finite(h.Low) && finite(h.Close) && finite(h.Volume))
      .map((h: any) => ({ date: h.Date ?? h.date, high: h.High, low: h.Low, close: h.Close, volume: h.Volume }));

    if (history && history.length >= 20) {
      const bandar = analyzeBandarmology(history as any);
      const accumulation = analyzeAccumulationSignal(history as any);
      lines.push(
        '- Proksi arus dana dari OHLCV (BUKAN data broker, BUKAN data asing sesungguhnya):',
        `  - Status tekanan: ${bandar.status}, CMF20 ${safe(bandar.cmf20)}, tekanan bersih ${safe(bandar.netPressurePct, '%')}`,
        `  - Sinyal akumulasi: ${accumulation.status}${accumulation.confirmed ? ' (terkonfirmasi)' : ' (belum terkonfirmasi)'}, rasio volume ${safe(accumulation.volRatio)}x`,
        '  - WAJIB: sebut ini sebagai INDIKASI dari harga & volume. Dilarang menyebutnya "asing borong"',
        '    atau "bandar akumulasi" seolah identitas pembelinya diketahui.',
      );
    } else {
      lines.push('- Proksi arus dana: histori harga tidak cukup untuk dihitung.');
    }
  } catch (error) {
    console.warn('[LensAI:emiten-blocks] flow proxy gagal', code, error instanceof Error ? error.message : String(error));
    lines.push('- Proksi arus dana: gagal dihitung dari histori harga.');
  }

  return lines.join('\n');
}

/** Moat / durabilitas keunggulan usaha - dari analyzer fundamental + ROE multi-tahun. */
export async function moatBlock(ticker: string, analyzers: any[]): Promise<string> {
  const code = plain(ticker);
  const lines = [`### ${code}`];

  try {
    const proxy = buildMoatProxy(analyzers ?? []);
    lines.push(
      `- Status moat (proksi dari indikator fundamental): ${proxy.status}`,
      `- Dukungan indikator: ${proxy.supportive} mendukung, ${proxy.caution} mengkhawatirkan, ${proxy.neutral} netral` +
        ` (dari ${proxy.available}/${proxy.expected} indikator yang terbaca, kelengkapan ${safe(proxy.coveragePct, '%')})`,
    );
    for (const pillar of proxy.pillars ?? []) {
      if (!pillar.indicators?.length) continue;
      lines.push(`  - ${pillar.label}: ${pillar.status}`);
      lines.push(...pillar.indicators.slice(0, 3).map((i) => `    - ${i.label}: ${i.value} (${i.decision})`));
    }
  } catch (error) {
    console.warn('[LensAI:emiten-blocks] moat proxy gagal', code, error instanceof Error ? error.message : String(error));
    lines.push('- Status moat: gagal dihitung.');
  }

  try {
    const earnings = await fetchNormalizedEarnings(ticker).catch(() => null);
    // costOfEquity tidak dihitung di jalur chat: nilainya berasal dari DCF, dan
    // menjalankan DCF penuh untuk satu pertanyaan moat tidak sepadan. Tanpa itu
    // buildMoatDurability() memang menolak menilai - dan penolakan itu ikut dikirim
    // apa adanya, bukan disembunyikan.
    const durability = buildMoatDurability(earnings, null);
    lines.push(
      `- Ketahanan (durability) multi-tahun: ${durability.conclusion ?? 'tidak dinilai'}`,
      earnings
        ? `- Basis: ${earnings.years} tahun fiskal (${earnings.firstFiscalYear}-${earnings.lastFiscalYear}), ROE normal ${safe(earnings.normalizedRoePct, '%')}`
        : '- Basis ROE multi-tahun: tidak tersedia.',
    );
  } catch (error) {
    console.warn('[LensAI:emiten-blocks] moat durability gagal', code, error instanceof Error ? error.message : String(error));
    lines.push('- Ketahanan multi-tahun: gagal dihitung.');
  }

  lines.push('- BATAS: ini PROKSI dari angka keuangan, bukan analisis kualitatif merek/paten/regulasi.');

  return lines.filter(Boolean).join('\n');
}

/** Risiko: beta terhadap IHSG + volatilitas harga. */
export async function riskBlock(ticker: string): Promise<string> {
  const code = plain(ticker);
  try {
    const [stock, benchmark] = await Promise.all([
      fetchYahooHistory(ticker, '1y'),
      fetchYahooHistory('^JKSE', '1y'),
    ]);

    if (!stock || !benchmark) {
      return [`### ${code}`, unavailableLine('Data risiko/beta', 'histori harga tidak terbaca')].join('\n');
    }

    const toPoints = (chart: any) =>
      chart.history
        .filter((h: any) => finite(h.Close))
        .map((h: any) => ({ date: h.Date ?? h.date, close: h.AdjClose ?? h.Close }));

    const beta = calculateBeta(toPoints(stock) as any, toPoints(benchmark) as any);

    return [
      `### ${code}`,
      beta
        ? `- Beta terhadap IHSG (1 tahun): ${safe(beta.beta)}${finite((beta as any).rSquared) ? `, R² ${safe((beta as any).rSquared)}` : ''}`
        : '- Beta: tidak bisa dihitung (sampel return harian kurang dari 30).',
      beta
        ? '- Arti praktis: beta di atas 1 berarti historisnya bergerak lebih besar daripada IHSG, di bawah 1 lebih kalem. Ini ukuran KEPEKAAN terhadap pasar, bukan ramalan kerugian.'
        : '',
      '- BATAS: beta dihitung dari return harian setahun terakhir. Ia berubah seiring waktu dan tidak menjamin perilaku ke depan.',
    ]
      .filter(Boolean)
      .join('\n');
  } catch (error) {
    console.warn('[LensAI:emiten-blocks] risk gagal', code, error instanceof Error ? error.message : String(error));
    return [`### ${code}`, unavailableLine('Data risiko/beta', 'gagal dihitung')].join('\n');
  }
}

export const EMITEN_BLOCK_TIMEOUT_MS = FETCH_TIMEOUT_MS;
