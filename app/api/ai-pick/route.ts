import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { cacheGet } from '@/shared/cache/redis-cache';
import { readAiPickScores } from '@/shared/cache/ai-pick-cache';
import { rankAiPicks, type BreakoutInfo } from '@/modules/recommendation/service/ai-pick.service';
import { getLensScoreValidationStatus } from '@/modules/validation';
import { getBrokerFlowBadges } from '@/modules/broker-flow/service/broker-summary-cache.service';

const BREAKOUT_CACHE_KEY = 'sahamlens:cache:computed:breakout-radar';

// Public-read karena LensRadar ada di menu guest. TIDAK ADA fallback scan di sini: kalau
// cache belum terisi, jawab apa adanya supaya UI bisa bilang "data sedang disiapkan",
// bukan diam-diam menembak Yahoo ratusan kali di dalam request seorang pengguna.
export async function GET() {
  try {
    const scoreData = await readAiPickScores();
    if (!scoreData) {
      return NextResponse.json({ ready: false, items: [], computedAt: null, note: null });
    }

    const cachedBreakout = await cacheGet<any>(BREAKOUT_CACHE_KEY);
    const breakout: BreakoutInfo = {
      breakoutSymbols: (cachedBreakout?.data || []).map((b: any) => b.symbol),
      goldenCrossSymbols: (cachedBreakout?.crossSignals?.golden || []).map((s: any) => s.symbol),
      deadCrossSymbols: (cachedBreakout?.crossSignals?.dead || []).map((s: any) => s.symbol),
    };

    const modelValidation = getLensScoreValidationStatus();
    // Audit follow-up 2026-08-05:
    // Endpoint ini dipakai beranda sebagai LensRadar scanner/pantauan. Versi sebelumnya
    // mengosongkan `items` saat LensScore belum tervalidasi point-in-time, sehingga data
    // real yang sudah dipindai tidak muncul sama sekali di halaman utama. Guard validasi
    // tetap dipertahankan lewat `advisoryEnabled`: false = boleh tampil sebagai scanner,
    // TIDAK boleh dibaca sebagai rekomendasi beli/jual atau instruksi aksi investasi.
    const advisoryEnabled = modelValidation.validated;
    const rankMode = advisoryEnabled ? 'advisory' : 'scanner';
    const rankedItems = rankAiPicks(scoreData.scores, breakout, scoreData.bearishSymbols, { mode: rankMode });
    const brokerBadges = await getBrokerFlowBadges(rankedItems.map((item) => item.symbol));
    const items = rankedItems.map((item) => ({
      ...item,
      brokerCode: brokerBadges[item.symbol.replace(/\.JK$/, '')]?.brokerCode ?? null,
      brokerNetValue: brokerBadges[item.symbol.replace(/\.JK$/, '')]?.netValue ?? null,
      brokerTradeDate: brokerBadges[item.symbol.replace(/\.JK$/, '')]?.tradeDate ?? null,
    }));

    // BUG FIX (audit integritas data 2026-08-03): TTL cache skor diperpanjang ke 3 hari
    // (lihat shared/cache/ai-pick-cache.ts) supaya halaman ini tidak kosong total di
    // luar jam bursa - tapi itu berarti data yang disajikan BISA jadi data sesi
    // kemarin/Jumat, bukan hari ini. `stale` memberi tahu UI kapan harus bilang jujur
    // "data sesi terakhir" alih-alih diam-diam menampilkannya seolah baru saja dihitung.
    const ageMinutes = (Date.now() - new Date(scoreData.computedAt).getTime()) / 60000;
    const stale = ageMinutes > 20;

    // Phase 0 (P0-1/P0-3): daftar bisa kosong karena saham yang datanya tidak cukup atau
    // yang tidak lolos gerbang kelayakan DIKELUARKAN, bukan diberi peringkat rendah.
    // Angka di bawah dilaporkan apa adanya supaya "kosong" bisa dibedakan antara "tidak
    // ada saham yang memenuhi syarat hari ini" dan "cache belum berisi field baru"
    // (entri cache lama ber-TTL 3 hari akan tersaring sampai cron berikutnya menimpanya).
    const scanned = scoreData.scores.length;
    const legacyCacheShape = scanned > 0 && scoreData.scores.every((s) => s.eligibilityStatus == null);

    return NextResponse.json({
      ready: true,
      items,
      computedAt: scoreData.computedAt,
      stale,
      scanned,
      eligible: rankedItems.length,
      advisoryEnabled,
      rankMode,
      modelValidation,
      note: !advisoryEnabled
        ? `${modelValidation.message} Daftar LensRadar ditampilkan sebagai scanner/pantauan berbasis data real, bukan rekomendasi beli/jual.`
        : !cachedBreakout
        ? 'Data breakout belum siap - peringkat sementara tanpa tag breakout & golden cross.'
        : legacyCacheShape
          ? 'Skor tersimpan berasal dari versi sebelum gerbang kelayakan ditambahkan - daftar disiapkan ulang pada pemindaian berikutnya.'
          : null,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Server Error' }, { status: 500 });
  }
}
