import { guard } from '@/lib/sahamLensGuard';
guard();

import { runController } from '@/shared/http/next-response.adapter';
import { checkPublicComputeBudget } from '@/shared/security/api-rate-limit';
import { normalizeIdxTickerParam } from '@/shared/market/ticker-validation';
import { getMarketAwareTtlSec } from '@/shared/cache/ttl-policy';
import { getSession, hasOpenOrProAccess } from '@/modules/user';
import {
  computeDailyNetFlow,
  computeAccumulationStreak,
  analyzeBandarmology,
  analyzeAccumulationSignal,
  getRealForeignFlow,
  summarizeForeignFlow,
  IDX_FOREIGN_FLOW_SOURCE,
} from '@/modules/market';

// SUMBER DATA (2026-08-18): Net Foreign Buy/Sell RESMI Bursa Efek Indonesia jadi sumber
// UTAMA. Angkanya berasal dari endpoint publik BEI ListedCompany/GetTradingInfoSS yang
// disinkronkan ke data/foreign-flow/{TICKER}.json oleh scripts/sync-idx-foreign-flow.py
// (Node tidak bisa memanggil idx.co.id langsung - Cloudflare menolak klien tanpa
// fingerprint TLS browser, 403; skrip Python memakai curl_cffi impersonate chrome124).
//
// FALLBACK: emiten yang artefak resminya belum tersinkron TETAP dilayani proxy Chaikin
// Money Flow dari histori harga+volume Yahoo (modules/market/service/foreign-flow-proxy.ts)
// - dua-duanya angka riil, tapi mengukur hal BERBEDA: yang resmi adalah lembar saham yang
// benar-benar ditransaksikan investor asing menurut Bursa, yang proxy hanya menyimpulkan
// tekanan beli/jual dari posisi close dalam range harian. Karena itu setiap respons
// membawa field `source` dan UI wajib melabeli keduanya berbeda - jangan pernah
// menyeragamkan labelnya seolah satu jenis data.
//
// Riwayat: versi BUILD 003 menghasilkan SEMUA angka di sini dari seedRandom(ticker)
// (acak, tapi stabil per ticker sehingga tampak seperti data). Itu sudah dihapus total
// 2026-08-01. Jangan pernah mengembalikan angka yang tidak berasal dari sumber nyata.

// Tidak di-export: Next.js melarang route file mengekspor apa pun selain handler HTTP
// dan segment config (validator .next/types menolaknya saat typecheck).
const FALLBACK_FLOW_SOURCE = 'YAHOO_CMF_PROXY' as const;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  return runController(async () => {
  const budget = await checkPublicComputeBudget(request.headers, 'flow');
  if (!budget.allowed) return {
    status: 429,
    body: { error: 'Terlalu banyak permintaan. Coba lagi nanti.' },
    headers: budget.retryAfterSec ? { 'Retry-After': String(budget.retryAfterSec) } : undefined,
  };
  // Tamu (session null) dapat akses PENUH tanpa perlu login - keputusan produk
  // 2026-08-13, lihat hasOpenOrProAccess(). Akun terdaftar tetap lewat gerbang
  // trial/Pro seperti sebelumnya.
  const session = await getSession();
  if (!(await hasOpenOrProAccess(session))) {
    return { status: 402, body: { error: 'Fitur ini butuh akun Pro', code: 'SUBSCRIPTION_REQUIRED' } };
  }

  const { ticker: rawTicker } = await params;
  const ticker = normalizeIdxTickerParam(rawTicker);
  if (!ticker) return { status: 400, body: { error: 'Ticker tidak valid' } };
  const cleanTicker = ticker.replace('.JK', '');

  // ---------------------------------------------------------------------------
  // JALUR 1 - Data resmi BEI (utama)
  // ---------------------------------------------------------------------------
  const official = getRealForeignFlow(cleanTicker, 20);
  if (official && official.history.length > 0) {
    const summary = summarizeForeignFlow(official.history);
    return { status: 200, body: {
      ticker: cleanTicker,
      source: IDX_FOREIGN_FLOW_SOURCE,
      updatedAt: official.updatedAt,
      summary,
      foreignFlow20D: official.history.map((point) => ({
        date: point.date,
        close: point.close,
        volume: point.volume,
        foreignBuy: point.foreignBuy,
        foreignSell: point.foreignSell,
        netForeignVolume: point.netForeignVolume,
        netForeignValueBillion: point.netForeignValueBillion,
        // Alias supaya komponen grafik memakai satu nama field untuk kedua sumber.
        netValueBillion: point.netForeignValueBillion,
      })),
    } };
  }

  // ---------------------------------------------------------------------------
  // TIDAK ADA JALUR KEDUA (sejak 20 Agustus 2026)
  // ---------------------------------------------------------------------------
  // Sebelumnya emiten tanpa artefak resmi dilayani proxy Chaikin Money Flow dari histori
  // harga+volume Yahoo. Proxy itu MENYIMPULKAN tekanan beli/jual dari pergerakan harga;
  // ia bukan catatan transaksi investor asing. Dua hal yang berbeda asalnya disajikan di
  // panel yang sama selalu berisiko disalahbaca, betapapun labelnya dibedakan.
  //
  // Cakupan artefak resmi terukur 962 emiten pada 20 Agustus 2026, disegarkan systemd
  // timer sahamlens-idx-flow-sync (Sen-Jum 17:30 WIB) dengan IDX_FLOW_SYNC_UNIVERSE=all.
  //
  // Balasannya PERNYATAAN, bukan 404 dan bukan galat: emiten tanpa artefak adalah keadaan
  // normal yang bisa dijelaskan, bukan kerusakan. `available: false` membuat UI bisa
  // mengatakannya apa adanya alih-alih menampilkan panel kosong.
  //
  // modules/market/service/foreign-flow-proxy.ts SENGAJA tidak dihapus: LensAI
  // (modules/ai/chat/blocks/emiten-blocks.ts) dan ringkasan pasar masih memakainya, dan
  // membuangnya akan mengubah keduanya - perubahan yang berbeda dari keputusan ini.
  return { status: 200, body: {
    ticker: cleanTicker,
    source: IDX_FOREIGN_FLOW_SOURCE,
    available: false,
    reason: 'Data Net Foreign Buy/Sell resmi Bursa belum tersedia untuk emiten ini.',
    foreignFlow20D: [],
    summary: null,
  } };
  }, request);
}
