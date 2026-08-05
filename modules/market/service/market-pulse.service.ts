// BUILD 002 (Refactor Domain) - dipindah dari app/api/market-pulse/route.ts, verbatim.
// IDX Indices
//
// BUG FIX (audit integritas data 2026-08-03, temuan L-03): field `symbol` untuk LQ45/
// IDX30/Kompas100 di sini TIDAK dipakai untuk fetch sungguhan (getMarketPulse() di bawah
// meng-override lewat tryFetchQuote() dengan daftar simbol sendiri per nama) - tapi
// sebelumnya field ini salah/menyesatkan: Kompas100 dideklarasikan dengan simbol '^JKSE'
// (simbol IHSG) dan fullName "(proxy IHSG)", padahal sejak C-01 tidak ada lagi proxy
// dari IHSG (lihat komentar tryFetchQuote di bawah - kalau Kompas100.JK gagal, quote
// tetap null, TIDAK di-derive dari IHSG). Disamakan dengan simbol yang benar-benar
// dipakai supaya field ini tidak menyesatkan pembaca kode.
const IDX_INDICES = [
  { symbol: '^JKSE', name: 'IHSG', fullName: 'Jakarta Composite Index' },
  { symbol: '^JKLQ45', name: 'LQ45', fullName: 'LQ45 Index' },
  { symbol: 'IDX30.JK', name: 'IDX30', fullName: 'IDX30 Index' },
  { symbol: 'Kompas100.JK', name: 'Kompas100', fullName: 'Kompas 100 Index' },
];

// IDX Sector representatives (top stocks per sector for heatmap)
// BUG FIX (2026-08-05, permintaan user): daftar per sektor diperluas dari 3-4 jadi
// 5-8 saham wakil (masih hardcoded/kurasi manual, BUKAN universe lengkap - lihat
// komentar HeatmapTile di app/market-pulse/page.tsx soal kenapa universe penuh per
// sektor tidak tersedia di aplikasi ini). Dijaga TIDAK saling tumpang tindih dengan
// PGAS/TBIG/MTEL (Infra & Transport) supaya 1 saham tidak dobel hitung di 2 sektor.
const IDX_SECTORS = [
  { sector: 'Financial', color: '#3b82f6', stocks: ['BBCA.JK', 'BBRI.JK', 'BMRI.JK', 'BBNI.JK', 'BRIS.JK', 'BBTN.JK', 'ARTO.JK'] },
  { sector: 'Energy', color: '#f97316', stocks: ['ADRO.JK', 'PTBA.JK', 'MEDC.JK', 'ITMG.JK', 'HRUM.JK', 'INDY.JK', 'ELSA.JK'] },
  { sector: 'Consumer Defensive', color: '#22c55e', stocks: ['ICBP.JK', 'INDF.JK', 'UNVR.JK', 'MYOR.JK', 'CPIN.JK', 'JPFA.JK', 'GGRM.JK', 'HMSP.JK'] },
  { sector: 'Technology', color: '#8b5cf6', stocks: ['GOTO.JK', 'BUKA.JK', 'EMTK.JK', 'MTDL.JK', 'DCII.JK'] },
  { sector: 'Telecom', color: '#06b6d4', stocks: ['TLKM.JK', 'ISAT.JK', 'EXCL.JK', 'TOWR.JK', 'FREN.JK'] },
  { sector: 'Basic Materials', color: '#eab308', stocks: ['ANTM.JK', 'INCO.JK', 'TINS.JK', 'INKP.JK', 'SMGR.JK', 'INTP.JK', 'TPIA.JK'] },
  { sector: 'Industrials', color: '#64748b', stocks: ['ASII.JK', 'UNTR.JK', 'AUTO.JK', 'SMSM.JK', 'GJTL.JK'] },
  { sector: 'Healthcare', color: '#ec4899', stocks: ['KLBF.JK', 'SIDO.JK', 'SILO.JK', 'MIKA.JK', 'HEAL.JK', 'PRDA.JK', 'TSPC.JK'] },
  { sector: 'Property', color: '#14b8a6', stocks: ['BSDE.JK', 'CTRA.JK', 'SMRA.JK', 'PWON.JK', 'ASRI.JK', 'APLN.JK'] },
  { sector: 'Infra & Transport', color: '#f43f5e', stocks: ['TBIG.JK', 'MTEL.JK', 'PGAS.JK', 'AKRA.JK', 'JSMR.JK', 'ASSA.JK'] },
  { sector: 'Consumer Cyclical', color: '#a855f7', stocks: ['MAPI.JK', 'ACES.JK', 'AMRT.JK', 'LPPF.JK', 'ERAA.JK', 'RALS.JK'] },
];

// Breadth sample stocks (broad IDX)
const BREADTH_STOCKS = [
  'BBCA.JK','BBRI.JK','BMRI.JK','BBNI.JK','TLKM.JK','ASII.JK','GOTO.JK','ADRO.JK','UNTR.JK',
  'ICBP.JK','KLBF.JK','PGAS.JK','PTBA.JK','ANTM.JK','BRPT.JK','INKP.JK','INDF.JK','ITMG.JK',
  'CPIN.JK','UNVR.JK','AKRA.JK','BRIS.JK','SMGR.JK','INTP.JK','CTRA.JK','BSDE.JK','SMRA.JK',
  'ISAT.JK','EXCL.JK','BUKA.JK','TOWR.JK','TBIG.JK','SIDO.JK','AMRT.JK','MYOR.JK','HMSP.JK',
  'GGRM.JK','JPFA.JK','ARTO.JK','BDMN.JK','BNGA.JK','BBTN.JK','MEGA.JK','INDY.JK','BYAN.JK',
  'HRUM.JK','INCO.JK','TINS.JK','MAPI.JK','SILO.JK','EMTK.JK','WIKA.JK','ADHI.JK','PWON.JK',
];

async function fetchYahooQuote(symbol: string) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=1d&interval=5m`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      next: { revalidate: 60 },
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const json = await res.json();
    const result = json.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta;
    const closes = result.indicators?.quote?.[0]?.close || [];
    const validCloses = closes.filter((c: any) => c !== null);
    const prevClose = meta.chartPreviousClose || meta.previousClose || validCloses[0] || 0;
    const currentPrice = meta.regularMarketPrice || validCloses[validCloses.length - 1] || 0;
    const changePct = prevClose ? ((currentPrice - prevClose) / prevClose) * 100 : 0;

    return {
      symbol,
      price: currentPrice,
      prevClose,
      changePct: parseFloat(changePct.toFixed(2)),
      sparkline: validCloses.slice(-50).map((c: number) => parseFloat(c?.toFixed(2) || '0')),
      volume: meta.regularMarketVolume || 0,
      marketCap: meta.marketCap || 0
    };
  } catch {
    return null;
  }
}

async function fetchQuoteSimple(symbol: string) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=1d&interval=1d`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      next: { revalidate: 120 },
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const json = await res.json();
    const result = json.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta;
    const prevClose = meta.chartPreviousClose || meta.previousClose || 0;
    const currentPrice = meta.regularMarketPrice || 0;
    const changePct = prevClose ? ((currentPrice - prevClose) / prevClose) * 100 : 0;

    return {
      symbol,
      price: currentPrice,
      changePct: parseFloat(changePct.toFixed(2)),
      marketCap: meta.marketCap || 0,
      volume: meta.regularMarketVolume || 0
    };
  } catch {
    return null;
  }
}

// Coba tiap simbol berurutan, pakai quote PERTAMA yang benar-benar punya harga (> 0).
// Sebelumnya ini ditulis sebagai `await fetchYahooQuote(a) || await fetchYahooQuote(b)` -
// operator || gagal karena Yahoo sering mengembalikan OBJEK truthy dengan price: 0 untuk
// simbol yang ada tapi tanpa data intraday (mis. 'LQ45.JK'), jadi fallback ke simbol yang
// benar-benar berfungsi ('^JKLQ45') tidak pernah tereksekusi - macet di angka dummy di
// bawah. Sekarang eksplisit cek price > 0 di tiap kandidat.
async function tryFetchQuote(...symbols: string[]) {
  for (const s of symbols) {
    const q = await fetchYahooQuote(s);
    if (q && q.price > 0) return q;
  }
  return null;
}

export async function getMarketPulse() {
  // 1. Fetch indices with sparkline
  const indicesData = await Promise.all(
    IDX_INDICES.map(async (idx) => {
      let quote = null;

      if (idx.name === 'IDX30') {
        // Urutan simbol dicoba: keduanya valid di Yahoo, IDX30.JK didahulukan karena
        // biasanya lebih lengkap datanya (sparkline interval 5m).
        quote = await tryFetchQuote('IDX30.JK', '^IDX30.JK');
      } else if (idx.name === 'LQ45') {
        // '^JKLQ45' didahulukan - terverifikasi konsisten mengembalikan harga (LQ45.JK
        // sering price:0), lihat catatan tryFetchQuote di atas.
        quote = await tryFetchQuote('^JKLQ45', 'LQ45.JK');
      } else if (idx.name === 'Kompas100') {
        quote = await tryFetchQuote('Kompas100.JK');
        // TIDAK ADA proxy dari IHSG/konstanta - Kompas100 dan IHSG adalah indeks
        // berbeda (basis & anggota beda), membaginya dengan konstanta ajaib (dulu 5.42)
        // menghasilkan angka yang kelihatan masuk akal tapi bukan Kompas100 sungguhan.
        // Kalau Yahoo tidak punya datanya, quote tetap null -> UI tampilkan N/A.
      } else {
        quote = await fetchYahooQuote(idx.symbol);
      }

      // TIDAK ADA fallback angka dummy - kalau quote gagal/null, price/changePct/volume
      // dikembalikan null (bukan 0) supaya UI bisa membedakan "pasar flat" dari "data
      // tidak tersedia", dan tidak ada angka dummy yang bisa keliru dianggap data asli.
      return {
        ...idx,
        price: quote?.price ?? null,
        changePct: quote?.changePct ?? null,
        sparkline: quote?.sparkline || [],
        volume: quote?.volume ?? null,
      };
    })
  );

  // 2. Fetch sector stocks in batches
  const allSectorStocks = IDX_SECTORS.flatMap(s => s.stocks);
  const uniqueStocks = Array.from(new Set(allSectorStocks));

  // Fetch in chunks of 8
  const stockQuotes: Record<string, any> = {};
  for (let i = 0; i < uniqueStocks.length; i += 8) {
    const chunk = uniqueStocks.slice(i, i + 8);
    const results = await Promise.all(chunk.map(s => fetchQuoteSimple(s)));
    results.forEach((r, idx) => {
      if (r) stockQuotes[chunk[idx]] = r;
    });
  }

  // Build sector heatmap
  const sectorHeatmap = IDX_SECTORS.map(sector => {
    const stocksData = sector.stocks
      .map(s => stockQuotes[s])
      .filter(Boolean);

    // BUG FIX (audit logika & algoritma 2026-08-05, temuan M-3): `meta.marketCap` TIDAK
    // ADA di Yahoo chart API (diverifikasi langsung ke endpoint-nya: field itu bukan
    // bagian dari `chart.result[].meta`). Jadi `marketCap` di sini SELALU 0, dan UI
    // memakainya untuk mengatur ukuran + urutan tile heatmap - artinya tata letak
    // "berdasarkan kapitalisasi pasar" tidak pernah benar-benar terjadi. Field dihapus
    // (bukan diisi angka lain): heatmap sekarang diurutkan berdasarkan besarnya pergerakan
    // sektor, sesuatu yang memang dihitung dari data nyata.
    //
    // `changePct` = rata-rata SEDERHANA dari 3-4 saham wakil sektor (bukan indeks sektor
    // resmi IDX, bukan pembobotan kapitalisasi) - `isProxy` + `sampleSize` dikirim supaya
    // UI bisa menyatakannya, alih-alih terbaca sebagai kinerja sektor sesungguhnya.
    const avgChange = stocksData.length > 0
      ? stocksData.reduce((sum, s) => sum + s.changePct, 0) / stocksData.length
      : null;

    return {
      sector: sector.sector,
      color: sector.color,
      changePct: avgChange != null ? parseFloat(avgChange.toFixed(2)) : null,
      isProxy: true,
      sampleSize: stocksData.length,
      stocks: stocksData.map(s => ({
        symbol: s.symbol.replace('.JK', ''),
        changePct: s.changePct,
      }))
    };
  });

  // 3. Fetch breadth data in batches
  const breadthQuotes: any[] = [];
  for (let i = 0; i < BREADTH_STOCKS.length; i += 10) {
    const chunk = BREADTH_STOCKS.slice(i, i + 10);
    const results = await Promise.all(chunk.map(s => fetchQuoteSimple(s)));
    results.forEach(r => { if (r) breadthQuotes.push(r); });
  }

  const advancing = breadthQuotes.filter(s => s.changePct > 0.1).length;
  const declining = breadthQuotes.filter(s => s.changePct < -0.1).length;
  const unchanged = breadthQuotes.length - advancing - declining;

  return {
    timestamp: new Date().toISOString(),
    indices: indicesData,
    sectorHeatmap: sectorHeatmap.sort((a, b) => Math.abs(b.changePct ?? 0) - Math.abs(a.changePct ?? 0)),
    breadth: {
      total: breadthQuotes.length,
      advancing,
      declining,
      unchanged,
      advanceDeclineRatio: declining > 0 ? parseFloat((advancing / declining).toFixed(2)) : advancing,
      topGainers: [...breadthQuotes].sort((a, b) => b.changePct - a.changePct).slice(0, 5).map(s => ({
        symbol: s.symbol.replace('.JK', ''),
        changePct: s.changePct,
        price: s.price
      })),
      topLosers: [...breadthQuotes].sort((a, b) => a.changePct - b.changePct).slice(0, 5).map(s => ({
        symbol: s.symbol.replace('.JK', ''),
        changePct: s.changePct,
        price: s.price
      })),
      topVolume: [...breadthQuotes].sort((a, b) => (b.volume || 0) - (a.volume || 0)).slice(0, 5).map(s => ({
        symbol: s.symbol.replace('.JK', ''),
        volume: s.volume || 0
      })),
      topValue: [...breadthQuotes].sort((a, b) => ((b.volume || 0) * (b.price || 0)) - ((a.volume || 0) * (a.price || 0))).slice(0, 5).map(s => ({
        symbol: s.symbol.replace('.JK', ''),
        value: (s.volume || 0) * (s.price || 0)
      })),
      // topFreq & netForeign SEBELUMNYA ada di sini berisi Math.random() murni (komentar
      // asli "Mock frequency") dan tidak pernah ditampilkan di UI manapun - dihapus,
      // bukan disimpan sebagai data palsu yang berisiko suatu saat dipakai tanpa sadar.
      // Data frekuensi transaksi & net foreign flow riil butuh feed data broker IDX
      // yang tidak tersedia gratis lewat Yahoo Finance.
    }
  };
}
