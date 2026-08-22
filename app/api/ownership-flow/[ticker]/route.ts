import { guard } from '@/lib/sahamLensGuard';
guard();

import { runController } from '@/shared/http/next-response.adapter';
import { normalizeIdxTickerParam } from '@/shared/market/ticker-validation';
import { getOwnershipFlowConfig } from '@/modules/ownership-flow/config/ownership-flow.config';
import {
  getOwnershipFlowView,
  getOwnershipSeries,
} from '@/modules/ownership-flow/service/ownership-flow-query.service';
import { getPrimarySource, getSourceById } from '@/modules/ownership-flow/source/source-registry';
import { logger } from '@/shared/logger/logger';

// API OWNERSHIP FLOW PER EMITEN.
//
// Dibaca dari DATABASE (lewat cache), TIDAK PERNAH menembak sumber secara live
// pada request pengguna - §39. Data ownership bukan data intraday; menariknya
// per pembaca hanya membebani sumber tanpa membuat angkanya lebih baru.
//
// Response SENGAJA tidak pernah memuat sinyal transaksi. Tidak ada `buy`, tidak
// ada `signal`, tidak ada skor. Yang dikembalikan: angka kepemilikan, delta
// dalam PERCENTAGE POINT, tanggal observasi, sumber, dan kejujuran tentang
// kesegaran serta status eksperimentalnya.

export const maxDuration = 30;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  return runController(async () => {
  const config = getOwnershipFlowConfig();
  if (!config.enabled) {
    return { status: 404, body: { error: 'Ownership Flow belum diaktifkan', code: 'FEATURE_DISABLED' } };
  }

  const { ticker: rawTicker } = await params;
  const ticker = normalizeIdxTickerParam(rawTicker);
  if (!ticker) {
    return { status: 400, body: { error: 'Ticker tidak valid' } };
  }

  try {
    const { searchParams } = new URL(request.url);
    const withSeries = searchParams.get('series') === '1';

    const view = await getOwnershipFlowView(ticker);
    if (!view) {
      return { status: 400, body: { error: 'Ticker tidak valid' } };
    }

    const source = (view.source ? getSourceById(view.source) : null) ?? getPrimarySource();
    const series = withSeries ? await getOwnershipSeries(ticker) : undefined;

    return { status: 200, body: {
      ticker: view.ticker.replace('.JK', ''),
      observedDate: view.observedDate,
      source: view.source ?? source.id,
      sourceUrl: view.sourceUrl,
      fetchedAt: view.fetchedAt,
      foreignPct: view.foreignPct,
      localPct: view.localPct,
      scriplessPct: view.scriplessPct,
      totalSecurities: view.totalSecurities,
      // SATUAN DELTA ADALAH PERCENTAGE POINT. Field-nya sengaja dinamai `pp`
      // supaya konsumen tidak bisa salah mengira ini persen relatif (§36).
      delta: {
        '1d': view.delta.d1.pp,
        '7d': view.delta.d7.pp,
        '30d': view.delta.d30.pp,
      },
      deltaUnit: 'percentage_point',
      previous: view.previous,
      // Basis tiap delta ikut dikirim: kalau sumber ternyata bercadence bulanan,
      // "30d" bisa saja dihitung dari observasi 31 hari lalu. Menyembunyikan ini
      // membuat label horizon berbohong.
      deltaBasis: {
        '1d': { observedDate: view.delta.d1.basisObservedDate, gapDays: view.delta.d1.actualGapDays, structuralBreak: view.delta.d1.structuralBreak },
        '7d': { observedDate: view.delta.d7.basisObservedDate, gapDays: view.delta.d7.actualGapDays, structuralBreak: view.delta.d7.structuralBreak },
        '30d': { observedDate: view.delta.d30.basisObservedDate, gapDays: view.delta.d30.actualGapDays, structuralBreak: view.delta.d30.structuralBreak },
      },
      trend: view.trend,
      trendReason: view.trendReason,
      freshness: view.freshness,
      ageDays: view.ageDays,
      cadence: view.cadence,
      historyCount: view.historyCount,
      sourceAuditStatus: source.auditStatus,
      experimental: view.experimental,
      inFinalScore: view.inFinalScore,
      ...(series ? { series } : {}),
    } };
  } catch (error) {
    // Stack trace TIDAK PERNAH sampai ke klien (§30) - hanya ke log server.
    logger.error('API ownership-flow gagal', { module: 'ownership-flow', ticker, err: error });
    return { status: 500, body: { error: 'Gagal memuat Ownership Flow' } };
  }
  }, request);
}
