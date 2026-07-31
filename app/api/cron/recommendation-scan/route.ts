import { NextRequest, NextResponse } from 'next/server';
import { verifyQStashSignature } from '@/shared/queue/qstash-signature';
import { withJobRunLog } from '@/shared/scheduler/job-run-log.repository';
import { logger } from '@/shared/logger/logger';
import { analyzeStock } from '@/modules/recommendation';
import { cacheSet } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC as TTL } from '@/shared/cache/ttl-policy';

// BUILD 006 (Scheduler) - "Recommendation AI Scan" dari roadmap. Memakai daftar
// simbol yang SAMA dengan modules/recommendation/service/breakout.service.ts
// (WATCHLIST 15 saham likuid) - bukan universe baru - supaya cakupan cron ini
// konsisten dengan apa yang sudah scanBreakouts() percayai representatif, alih-alih
// menciptakan daftar sembarang. GET /api/recommendations tetap bisa menganalisa
// simbol DI LUAR daftar ini secara live (lihat cache-first read di route itu) -
// job ini hanya mempercepat simbol yang paling sering diminta.
const SCAN_SYMBOLS = [
  'BBCA.JK', 'BBRI.JK', 'BMRI.JK', 'TLKM.JK', 'ASII.JK',
  'AMRT.JK', 'ICBP.JK', 'ADRO.JK', 'GOTO.JK', 'GGRM.JK',
  'EXCL.JK', 'ISAT.JK', 'TBIG.JK', 'ANTM.JK', 'BRIS.JK',
];
function cacheKeyFor(symbol: string): string {
  return `sahamlens:cache:computed:recommendation:${symbol}`;
}

export async function POST(req: NextRequest) {
  const signature = req.headers.get('Upstash-Signature');
  const rawBody = await req.text();

  const isValid = await verifyQStashSignature(signature, rawBody);
  if (!isValid) {
    logger.warn('Menolak request /api/cron/recommendation-scan - signature QStash tidak valid');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await withJobRunLog('recommendation-scan', async () => {
      let scanned = 0;
      for (let i = 0; i < SCAN_SYMBOLS.length; i += 5) {
        const chunk = SCAN_SYMBOLS.slice(i, i + 5);
        const chunkResults = await Promise.all(chunk.map((symbol) => analyzeStock(symbol)));
        await Promise.all(
          chunkResults.map((r, idx) => (r ? cacheSet(cacheKeyFor(chunk[idx]), r, TTL.RECOMMENDATION) : Promise.resolve()))
        );
        scanned += chunkResults.filter(Boolean).length;
      }
      return { scanned, total: SCAN_SYMBOLS.length };
    });
    return NextResponse.json({ success: true, result });
  } catch (err) {
    logger.error('Job recommendation-scan gagal', { err });
    return NextResponse.json({ error: 'Job gagal' }, { status: 500 });
  }
}
