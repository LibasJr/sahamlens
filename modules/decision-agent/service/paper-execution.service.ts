import crypto from 'node:crypto';
import { pool } from '@/shared/database/postgres.client';
import { ensureSharedSchema } from '@/shared/database/schema.service';
import { ConflictError, NotFoundError, ValidationError } from '@/shared/errors/app-error';
import { fetchLivePriceSnapshot } from '@/modules/market/service/live-price.service';
import type { ConfigurePaperAccountInput, DecisionThesisInput } from '../validator/decision-agent.validator';
import type { DecisionAgentSignal, PaperOrder } from '../types/decision-agent.types';
import { calculatePaperBuyLots, calculatePaperPortfolioCapacity } from './paper-sizing';
import { calculatePaperFill } from './paper-fill';

const ACCOUNT_ID = 'internal-paper';
const LOT_SIZE = 100;

function asNumber(value: unknown): number {
  return Number(value);
}
function mapOrder(row: Record<string, unknown>): PaperOrder {
  return {
    id: String(row.id),
    signalId: String(row.signal_id),
    ticker: String(row.ticker),
    side: row.side as PaperOrder['side'],
    lots: asNumber(row.lots),
    limitPrice: asNumber(row.limit_price),
    fillPrice: row.fill_price == null ? null : asNumber(row.fill_price),
    grossValue: row.gross_value == null ? null : asNumber(row.gross_value),
    feeValue: row.fee_value == null ? null : asNumber(row.fee_value),
    slippageBps: row.slippage_bps == null ? null : asNumber(row.slippage_bps),
    priceSource: row.price_source == null ? null : String(row.price_source),
    priceAsOf: row.price_as_of ? new Date(String(row.price_as_of)).toISOString() : null,
    freshness: row.freshness == null ? null : String(row.freshness),
    status: row.status as PaperOrder['status'],
    rationale: String(row.rationale),
    proposedAt: new Date(String(row.proposed_at)).toISOString(),
    executedAt: row.executed_at ? new Date(String(row.executed_at)).toISOString() : null,
  };
}

export function assertHybridConfirmed(signal: DecisionAgentSignal): void {
  if (signal.hybridStatus !== 'CONFIRMED' || signal.hybridReview?.verdict !== 'CONFIRM') {
    throw new ConflictError('Paper order membutuhkan konfirmasi hybrid analyst yang valid');
  }
}

export async function configurePaperAccount(input: ConfigurePaperAccountInput): Promise<void> {
  await ensureSharedSchema();
  const frozen = await pool.query(`SELECT 1 FROM decision_agent_pilot_protocols WHERE account_id=$1 AND status='ACTIVE'`, [ACCOUNT_ID]);
  if (frozen.rows[0]) throw new ConflictError('Kebijakan sedang dibekukan selama pilot 90 hari');
  await pool.query(
    `INSERT INTO decision_agent_paper_accounts
      (id, name, cash, initial_cash, risk_budget_pct, max_position_pct, max_open_positions,
       max_total_exposure_pct, max_sector_exposure_pct, max_positions_per_sector, max_adv_participation_pct,
       max_drawdown_pct, buy_fee_pct, sell_fee_pct, slippage_bps, enabled, updated_at)
     VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, true, NOW())
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       cash = CASE
         WHEN NOT EXISTS (SELECT 1 FROM decision_agent_orders WHERE account_id = $1)
           THEN EXCLUDED.cash ELSE decision_agent_paper_accounts.cash END,
       initial_cash = CASE
         WHEN NOT EXISTS (SELECT 1 FROM decision_agent_orders WHERE account_id = $1)
           THEN EXCLUDED.initial_cash ELSE decision_agent_paper_accounts.initial_cash END,
       risk_budget_pct = EXCLUDED.risk_budget_pct,
       max_position_pct = EXCLUDED.max_position_pct,
       max_open_positions = EXCLUDED.max_open_positions,
       max_total_exposure_pct = $7,
       max_sector_exposure_pct = $8,
       max_positions_per_sector = $9,
       max_adv_participation_pct = $10,
       max_drawdown_pct = $11,
       buy_fee_pct = $12,
       sell_fee_pct = $13,
       slippage_bps = $14,
       enabled = true,
       updated_at = NOW()`,
    [
      ACCOUNT_ID, 'Internal Decision Agent Paper Account', input.initialCash, input.riskBudgetPct,
      input.maxPositionPct, input.maxOpenPositions, input.maxTotalExposurePct,
      input.maxSectorExposurePct, input.maxPositionsPerSector, input.maxAdvParticipationPct, input.maxDrawdownPct,
      input.buyFeePct, input.sellFeePct, input.slippageBps,
    ],
  );
  await pool.query(
    `INSERT INTO decision_agent_paper_nav_snapshots (id,account_id,nav,cash,positions_value,source,observed_at)
     SELECT $1,a.id,a.cash + COALESCE(SUM(p.lots*100*p.last_price),0),a.cash,
            COALESCE(SUM(p.lots*100*p.last_price),0),'ORDER',NOW()
       FROM decision_agent_paper_accounts a
       LEFT JOIN decision_agent_paper_positions p ON p.account_id=a.id AND p.lots>0
      WHERE a.id=$2
      GROUP BY a.id,a.cash
     HAVING NOT EXISTS (
       SELECT 1 FROM decision_agent_paper_nav_snapshots s WHERE s.account_id=$2
     )`,
    [crypto.randomUUID(), ACCOUNT_ID],
  );
}

export async function proposePaperOrder(signalId: string, thesisInput?: DecisionThesisInput): Promise<PaperOrder> {
  await ensureSharedSchema();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const signalResult = await client.query(`SELECT * FROM decision_agent_signals WHERE id = $1 FOR UPDATE`, [signalId]);
    const signalRow = signalResult.rows[0] as Record<string, unknown> | undefined;
    if (!signalRow) throw new NotFoundError('Sinyal tidak ditemukan');
    const signal = signalRow.payload as DecisionAgentSignal;
    if (signal.paperReadiness !== 'PAPER_READY') throw new ConflictError('Sinyal belum siap untuk paper order');
    assertHybridConfirmed(signal);

    const accountResult = await client.query(`SELECT * FROM decision_agent_paper_accounts WHERE id = $1 FOR UPDATE`, [ACCOUNT_ID]);
    const account = accountResult.rows[0] as Record<string, unknown> | undefined;
    if (!account || !account.enabled) throw new ConflictError('Paper account belum dikonfigurasi');

    const positionResult = await client.query(
      `SELECT * FROM decision_agent_paper_positions WHERE account_id = $1 AND ticker = $2 FOR UPDATE`,
      [ACCOUNT_ID, signal.ticker],
    );
    const position = positionResult.rows[0] as Record<string, unknown> | undefined;
    const existingLots = position ? asNumber(position.lots) : 0;
    const side = signal.action === 'BUY_CANDIDATE' ? 'BUY' : signal.action === 'EXIT_REVIEW' ? 'SELL' : null;
    if (!side) throw new ConflictError('Aksi sinyal tidak dapat menjadi paper order');

    const idempotencyKey = `${signalId}:${side}`;
    const existingOrder = await client.query(`SELECT * FROM decision_agent_orders WHERE idempotency_key = $1`, [idempotencyKey]);
    if (existingOrder.rows[0]) {
      await client.query('COMMIT');
      return mapOrder(existingOrder.rows[0]);
    }
    const otherProposedOrder = await client.query(
      `SELECT id FROM decision_agent_orders
        WHERE account_id=$1 AND ticker=$2 AND side=$3 AND status='PROPOSED'
        LIMIT 1`,
      [ACCOUNT_ID, signal.ticker, side],
    );
    if (otherProposedOrder.rows[0]) {
      throw new ConflictError(`Masih ada paper order ${side} yang belum diproses untuk ticker ini`);
    }

    let lots = existingLots;
    let rationale = 'Keluar penuh dari posisi paper setelah sinyal EXIT_REVIEW.';
    if (side === 'BUY') {
      if (existingLots > 0) throw new ConflictError('Pilot tidak mengizinkan pyramiding pada posisi paper yang masih terbuka');
      if (!signal.riskSetup) throw new ConflictError('Setup risiko tidak tersedia');
      if (!thesisInput) throw new ConflictError('Tesis dan kriteria invalidasi wajib diisi sebelum paper BUY');
      if (Date.parse(thesisInput.reviewAt) <= Date.now()) throw new ConflictError('Tanggal review tesis harus berada di masa depan');
      if (!signal.sector) throw new ConflictError('Sektor aktual tidak tersedia; batas konsentrasi tidak dapat dihitung');
      if (signal.avgValue20d == null || signal.avgValue20d <= 0) {
        throw new ConflictError('ADV20 aktual tidak tersedia; kapasitas likuiditas tidak dapat dihitung');
      }
      const requiredPolicy = [
        account.max_total_exposure_pct, account.max_sector_exposure_pct, account.max_positions_per_sector,
        account.max_adv_participation_pct, account.max_drawdown_pct,
        account.buy_fee_pct, account.sell_fee_pct, account.slippage_bps,
      ];
      if (requiredPolicy.some((value) => value == null)) {
        throw new ConflictError('Kebijakan pilot 90 hari belum lengkap; simpan ulang konfigurasi akun paper');
      }
      const positionCountResult = await client.query(
        `SELECT COUNT(*)::int AS count FROM decision_agent_paper_positions WHERE account_id = $1 AND lots > 0`,
        [ACCOUNT_ID],
      );
      const openPositions = asNumber(positionCountResult.rows[0]?.count);
      if (existingLots === 0 && openPositions >= asNumber(account.max_open_positions)) {
        throw new ConflictError('Batas jumlah posisi paper sudah tercapai');
      }
      const sectorPositionResult = await client.query(
        `SELECT
           (SELECT COUNT(*) FROM decision_agent_paper_positions
             WHERE account_id=$1 AND sector=$2 AND lots>0)
           +
           (SELECT COUNT(*) FROM decision_agent_orders
             WHERE account_id=$1 AND sector=$2 AND side='BUY' AND status='PROPOSED') AS count`,
        [ACCOUNT_ID, signal.sector],
      );
      if (asNumber(sectorPositionResult.rows[0]?.count) >= asNumber(account.max_positions_per_sector)) {
        throw new ConflictError(`Batas jumlah saham sektor ${signal.sector} sudah tercapai`);
      }
      const navResult = await client.query(
        `SELECT COALESCE(SUM(lots * 100 * last_price), 0) AS position_value,
                COALESCE(SUM(CASE WHEN sector = $2 THEN lots * 100 * last_price ELSE 0 END), 0) AS sector_value
           FROM decision_agent_paper_positions WHERE account_id = $1 AND lots > 0`,
        [ACCOUNT_ID, signal.sector],
      );
      const cash = asNumber(account.cash);
      const positionValue = asNumber(navResult.rows[0]?.position_value);
      const nav = cash + positionValue;
      const highWaterResult = await client.query(
        `SELECT MAX(nav) AS high_water FROM decision_agent_paper_nav_snapshots WHERE account_id = $1`,
        [ACCOUNT_ID],
      );
      const highWater = Math.max(nav, asNumber(highWaterResult.rows[0]?.high_water ?? nav));
      const drawdownPct = highWater > 0 ? (highWater - nav) / highWater * 100 : 0;
      if (drawdownPct >= asNumber(account.max_drawdown_pct)) {
        throw new ConflictError('Paper BUY dihentikan karena batas drawdown akun telah tercapai');
      }
      const sizing = calculatePaperBuyLots({
        nav,
        cash,
        price: signal.price,
        stop: signal.riskSetup.stop,
        existingLots,
        riskBudgetPct: asNumber(account.risk_budget_pct),
        maxPositionPct: asNumber(account.max_position_pct),
      });
      const portfolioCapacity = calculatePaperPortfolioCapacity({
        nav,
        orderPrice: signal.price,
        currentTotalExposureValue: positionValue,
        currentSectorExposureValue: asNumber(navResult.rows[0]?.sector_value),
        avgValue20d: signal.avgValue20d,
        maxTotalExposurePct: asNumber(account.max_total_exposure_pct),
        maxSectorExposurePct: asNumber(account.max_sector_exposure_pct),
        maxAdvParticipationPct: asNumber(account.max_adv_participation_pct),
      });
      lots = Math.min(sizing.lots, portfolioCapacity.lots);
      if (lots <= 0) throw new ConflictError('Tidak ada ukuran lot yang lolos seluruh batas risiko');
      rationale = `Ukuran lolos batas ${sizing.bindingConstraint} dan ${portfolioCapacity.bindingConstraint}; harga/stop/ADV berasal dari snapshot sinyal.`;

      const thesisPayload = {
        thesis: thesisInput.thesis,
        invalidationCriteria: thesisInput.invalidationCriteria,
        catalyst: thesisInput.catalyst,
        reviewAt: thesisInput.reviewAt,
        sourceType: 'USER_APPROVED',
      };
      const activeThesis = await client.query(
        `SELECT id FROM decision_agent_theses
          WHERE account_id = $1 AND ticker = $2 AND status = 'ACTIVE' FOR UPDATE`,
        [ACCOUNT_ID, signal.ticker],
      );
      const thesisId = activeThesis.rows[0]?.id ? String(activeThesis.rows[0].id) : crypto.randomUUID();
      if (activeThesis.rows[0]) {
        await client.query(
          `UPDATE decision_agent_theses
              SET thesis=$3,invalidation_criteria=$4::jsonb,catalyst=$5,review_at=$6,updated_at=NOW()
            WHERE id=$1 AND account_id=$2`,
          [thesisId, ACCOUNT_ID, thesisInput.thesis, JSON.stringify(thesisInput.invalidationCriteria), thesisInput.catalyst, thesisInput.reviewAt],
        );
      } else {
        await client.query(
          `INSERT INTO decision_agent_theses
            (id,account_id,ticker,status,thesis,invalidation_criteria,catalyst,review_at,source_type)
           VALUES ($1,$2,$3,'ACTIVE',$4,$5::jsonb,$6,$7,'USER_APPROVED')`,
          [thesisId, ACCOUNT_ID, signal.ticker, thesisInput.thesis, JSON.stringify(thesisInput.invalidationCriteria), thesisInput.catalyst, thesisInput.reviewAt],
        );
      }
      await client.query(
        `INSERT INTO decision_agent_thesis_events (id,thesis_id,event_type,payload)
         VALUES ($1,$2,$3,$4::jsonb)`,
        [crypto.randomUUID(), thesisId, activeThesis.rows[0] ? 'UPDATED' : 'CREATED', JSON.stringify(thesisPayload)],
      );
    } else if (lots <= 0) {
      throw new ConflictError('Tidak ada posisi paper yang dapat dijual');
    }

    const id = crypto.randomUUID();
    const result = await client.query(
      `INSERT INTO decision_agent_orders
        (id, signal_id, account_id, ticker, side, lots, limit_price, signal_price,
         status, rationale, idempotency_key, sector, avg_value_20d)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$7,'PROPOSED',$8,$9,$10,$11)
       ON CONFLICT (idempotency_key) DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
       RETURNING *`,
      [id, signalId, ACCOUNT_ID, signal.ticker, side, lots, signal.price, rationale, idempotencyKey, signal.sector, signal.avgValue20d],
    );
    await client.query('COMMIT');
    return mapOrder(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

type PaperQuoteReader = typeof fetchLivePriceSnapshot;

export async function executePaperOrder(
  orderId: string,
  quoteReader: PaperQuoteReader = fetchLivePriceSnapshot,
): Promise<PaperOrder> {
  await ensureSharedSchema();
  const preview = await pool.query(
    `SELECT ticker,status FROM decision_agent_orders WHERE id = $1`,
    [orderId],
  );
  if (!preview.rows[0]) throw new NotFoundError('Paper order tidak ditemukan');
  if (preview.rows[0].status !== 'PROPOSED') throw new ConflictError('Paper order bukan lagi berstatus PROPOSED');
  const quote = await quoteReader(`${String(preview.rows[0].ticker).replace(/\.JK$/, '')}.JK`);
  const quotePrice = quote.body.price;
  const freshness = String(quote.body.freshness ?? 'UNKNOWN');
  const priceAsOf = typeof quote.body.dataTimestamp === 'string' ? quote.body.dataTimestamp : null;
  const priceSource = typeof quote.body.source === 'string' ? quote.body.source : null;
  if (!quote.available || typeof quotePrice !== 'number' || !Number.isFinite(quotePrice) || quotePrice <= 0) {
    throw new ConflictError('Harga pasar aktual tidak tersedia; paper order tidak dieksekusi');
  }
  if (freshness !== 'DELAYED' || !priceAsOf || !priceSource) {
    throw new ConflictError('Paper fill hanya boleh memakai quote intraday aktual berstatus DELAYED');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const orderResult = await client.query(`SELECT * FROM decision_agent_orders WHERE id = $1 FOR UPDATE`, [orderId]);
    const order = orderResult.rows[0] as Record<string, unknown> | undefined;
    if (!order) throw new NotFoundError('Paper order tidak ditemukan');
    if (order.status !== 'PROPOSED') throw new ConflictError('Paper order bukan lagi berstatus PROPOSED');

    const accountResult = await client.query(`SELECT * FROM decision_agent_paper_accounts WHERE id = $1 FOR UPDATE`, [ACCOUNT_ID]);
    const account = accountResult.rows[0] as Record<string, unknown> | undefined;
    if (!account || !account.enabled) throw new ConflictError('Paper account tidak aktif');
    const ticker = String(order.ticker);
    const lots = asNumber(order.lots);
    const side = order.side === 'BUY' || order.side === 'SELL' ? order.side : null;
    if (!side) throw new ValidationError('Sisi order tidak valid');
    const feePct = side === 'BUY' ? account.buy_fee_pct : account.sell_fee_pct;
    if (feePct == null || account.slippage_bps == null) {
      throw new ConflictError('Fee dan slippage akun paper belum dikonfigurasi');
    }
    const fill = calculatePaperFill({
      side,
      quotePrice,
      lots,
      feePct: asNumber(feePct),
      slippageBps: asNumber(account.slippage_bps),
    });
    if (!fill) throw new ConflictError('Paper fill tidak dapat dihitung dari quote aktual');
    const price = fill.fillPrice;
    const positionResult = await client.query(
      `SELECT * FROM decision_agent_paper_positions WHERE account_id = $1 AND ticker = $2 FOR UPDATE`,
      [ACCOUNT_ID, ticker],
    );
    const position = positionResult.rows[0] as Record<string, unknown> | undefined;

    if (side === 'BUY') {
      const cash = asNumber(account.cash);
      if (cash < -fill.cashDelta) throw new ConflictError('Kas paper tidak cukup setelah harga aktual, fee, dan slippage');
      const oldLots = position ? asNumber(position.lots) : 0;
      if (oldLots > 0) throw new ConflictError('Pilot tidak mengizinkan pyramiding pada posisi paper yang masih terbuka');
      const signalResult = await client.query(
        `SELECT payload FROM decision_agent_signals WHERE id=$1`,
        [order.signal_id],
      );
      const signal = signalResult.rows[0]?.payload as DecisionAgentSignal | undefined;
      if (!signal?.riskSetup) throw new ConflictError('Setup risiko sinyal tidak tersedia saat fill');
      if (!order.sector || order.avg_value_20d == null || asNumber(order.avg_value_20d) <= 0) {
        throw new ConflictError('Konteks sektor/ADV20 order tidak lengkap; fill dibatalkan');
      }
      const requiredPolicy = [
        account.max_total_exposure_pct, account.max_sector_exposure_pct, account.max_positions_per_sector,
        account.max_adv_participation_pct, account.max_drawdown_pct,
      ];
      if (requiredPolicy.some((value) => value == null)) {
        throw new ConflictError('Kebijakan risiko akun tidak lengkap saat fill');
      }
      const contextResult = await client.query(
        `SELECT COUNT(*) FILTER (WHERE lots>0)::int AS open_positions,
                COUNT(*) FILTER (WHERE lots>0 AND sector=$2)::int AS sector_positions,
                COALESCE(SUM(CASE WHEN lots>0 THEN lots*100*last_price ELSE 0 END),0) AS position_value,
                COALESCE(SUM(CASE WHEN lots>0 AND sector=$2 THEN lots*100*last_price ELSE 0 END),0) AS sector_value
           FROM decision_agent_paper_positions WHERE account_id=$1`,
        [ACCOUNT_ID, order.sector],
      );
      const context = contextResult.rows[0];
      if (asNumber(context?.open_positions) >= asNumber(account.max_open_positions)) {
        throw new ConflictError('Batas jumlah posisi tercapai sebelum fill; paper order dibatalkan');
      }
      if (asNumber(context?.sector_positions) >= asNumber(account.max_positions_per_sector)) {
        throw new ConflictError(`Batas jumlah saham sektor ${String(order.sector)} tercapai sebelum fill`);
      }
      const positionValue = asNumber(context?.position_value);
      const nav = cash + positionValue;
      const highWaterResult = await client.query(
        `SELECT MAX(nav) AS high_water FROM decision_agent_paper_nav_snapshots WHERE account_id=$1`,
        [ACCOUNT_ID],
      );
      const highWater = Math.max(nav, asNumber(highWaterResult.rows[0]?.high_water ?? nav));
      const drawdownPct = highWater > 0 ? (highWater - nav) / highWater * 100 : 0;
      if (drawdownPct >= asNumber(account.max_drawdown_pct)) {
        throw new ConflictError('Batas drawdown tercapai sebelum fill; paper BUY dibatalkan');
      }
      const sizingAtFill = calculatePaperBuyLots({
        nav, cash, price, stop: signal.riskSetup.stop, existingLots: 0,
        riskBudgetPct: asNumber(account.risk_budget_pct),
        maxPositionPct: asNumber(account.max_position_pct),
      });
      const capacityAtFill = calculatePaperPortfolioCapacity({
        nav,
        orderPrice: price,
        currentTotalExposureValue: positionValue,
        currentSectorExposureValue: asNumber(context?.sector_value),
        avgValue20d: asNumber(order.avg_value_20d),
        maxTotalExposurePct: asNumber(account.max_total_exposure_pct),
        maxSectorExposurePct: asNumber(account.max_sector_exposure_pct),
        maxAdvParticipationPct: asNumber(account.max_adv_participation_pct),
      });
      if (lots > Math.min(sizingAtFill.lots, capacityAtFill.lots)) {
        throw new ConflictError('Ukuran order melampaui kapasitas risiko pada harga fill aktual');
      }
      const oldAverage = position ? asNumber(position.avg_price) : 0;
      const newLots = oldLots + lots;
      const newAverage = ((oldLots * oldAverage) + (lots * price)) / newLots;
      await client.query(`UPDATE decision_agent_paper_accounts SET cash = cash + $2, updated_at = NOW() WHERE id = $1`, [ACCOUNT_ID, fill.cashDelta]);
      await client.query(
        `INSERT INTO decision_agent_paper_positions
          (account_id,ticker,lots,avg_price,last_price,sector,avg_value_20d,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
         ON CONFLICT (account_id, ticker) DO UPDATE SET
           lots = EXCLUDED.lots, avg_price = EXCLUDED.avg_price,
           last_price = EXCLUDED.last_price, sector = EXCLUDED.sector,
           avg_value_20d = EXCLUDED.avg_value_20d, updated_at = NOW()`,
        [ACCOUNT_ID, ticker, newLots, newAverage, price, order.sector, order.avg_value_20d],
      );
      const openTrip = await client.query(
        `SELECT * FROM decision_agent_paper_round_trips
          WHERE account_id=$1 AND ticker=$2 AND status='OPEN' FOR UPDATE`,
        [ACCOUNT_ID, ticker],
      );
      if (openTrip.rows[0]) {
        const trip = openTrip.rows[0];
        const combinedLots = asNumber(trip.buy_lots) + lots;
        const combinedGross = asNumber(trip.gross_buy) + fill.grossValue;
        await client.query(
          `UPDATE decision_agent_paper_round_trips
              SET buy_lots=$2,avg_buy_price=$3,gross_buy=$4,buy_fee=buy_fee+$5
            WHERE id=$1`,
          [trip.id, combinedLots, combinedGross / (combinedLots * LOT_SIZE), combinedGross, fill.feeValue],
        );
      } else {
        await client.query(
          `INSERT INTO decision_agent_paper_round_trips
            (id,account_id,ticker,sector,status,entry_signal_id,buy_lots,avg_buy_price,gross_buy,buy_fee,opened_at)
           VALUES ($1,$2,$3,$4,'OPEN',$5,$6,$7,$8,$9,NOW())`,
          [crypto.randomUUID(), ACCOUNT_ID, ticker, order.sector, order.signal_id, lots, price, fill.grossValue, fill.feeValue],
        );
      }
    } else if (side === 'SELL') {
      const ownedLots = position ? asNumber(position.lots) : 0;
      if (ownedLots !== lots) throw new ConflictError('EXIT_REVIEW harus menutup seluruh posisi paper');
      const tripResult = await client.query(
        `SELECT * FROM decision_agent_paper_round_trips
          WHERE account_id=$1 AND ticker=$2 AND status='OPEN' FOR UPDATE`,
        [ACCOUNT_ID, ticker],
      );
      const trip = tripResult.rows[0];
      if (!trip) throw new ConflictError('Ledger round-trip terbuka tidak ditemukan; penjualan dibatalkan');
      const realizedPnl = fill.grossValue - fill.feeValue - asNumber(trip.gross_buy) - asNumber(trip.buy_fee);
      const invested = asNumber(trip.gross_buy) + asNumber(trip.buy_fee);
      const realizedReturnPct = invested > 0 ? realizedPnl / invested * 100 : null;
      await client.query(`UPDATE decision_agent_paper_accounts SET cash = cash + $2, updated_at = NOW() WHERE id = $1`, [ACCOUNT_ID, fill.cashDelta]);
      await client.query(
        `UPDATE decision_agent_paper_positions
            SET lots = 0, last_price = $3, updated_at = NOW()
          WHERE account_id = $1 AND ticker = $2`,
        [ACCOUNT_ID, ticker, price],
      );
      await client.query(
        `UPDATE decision_agent_paper_round_trips
            SET status='CLOSED',exit_signal_id=$2,sell_lots=$3,avg_sell_price=$4,
                gross_sell=$5,sell_fee=$6,realized_pnl=$7,realized_return_pct=$8,closed_at=NOW()
          WHERE id=$1`,
        [trip.id, order.signal_id, lots, price, fill.grossValue, fill.feeValue, realizedPnl, realizedReturnPct],
      );
      const thesisResult = await client.query(
        `UPDATE decision_agent_theses SET status='CLOSED',updated_at=NOW()
          WHERE account_id=$1 AND ticker=$2 AND status='ACTIVE' RETURNING id`,
        [ACCOUNT_ID, ticker],
      );
      if (thesisResult.rows[0]) {
        await client.query(
          `INSERT INTO decision_agent_thesis_events (id,thesis_id,event_type,payload)
           VALUES ($1,$2,'CLOSED',$3::jsonb)`,
          [crypto.randomUUID(), thesisResult.rows[0].id, JSON.stringify({ exitSignalId: String(order.signal_id), fillPrice: price, priceAsOf })],
        );
      }
    }

    const updated = await client.query(
      `UPDATE decision_agent_orders
          SET status='EXECUTED',executed_at=NOW(),fill_price=$2,gross_value=$3,fee_value=$4,
              slippage_bps=$5,price_source=$6,price_as_of=$7,freshness=$8
        WHERE id=$1 RETURNING *`,
      [orderId, price, fill.grossValue, fill.feeValue, asNumber(account.slippage_bps), priceSource, priceAsOf, freshness],
    );
    // Stockbit mengenakan satu bea materai Rp10.000 untuk Trade Confirmation jika
    // total nilai transaksi bursa pada hari tersebut > Rp10 juta. Aturan ini berasal
    // dari dokumentasi broker; datafeed tidak dihitung otomatis karena tarifnya
    // bertingkat dan harus berasal dari statement aktual.
    const dailyGross = await client.query(
      `SELECT COALESCE(SUM(gross_value),0) AS total FROM decision_agent_orders
       WHERE account_id=$1 AND status='EXECUTED'
         AND (executed_at AT TIME ZONE 'Asia/Jakarta')::date=(NOW() AT TIME ZONE 'Asia/Jakarta')::date`,
      [ACCOUNT_ID],
    );
    if (asNumber(dailyGross.rows[0]?.total) > 10_000_000) {
      const stamp = await client.query(
        `INSERT INTO decision_agent_paper_costs
         (id,account_id,cost_type,amount,observed_date,source_type,source_reference)
         VALUES ($1,$2,'STAMP_DUTY',10000,(NOW() AT TIME ZONE 'Asia/Jakarta')::date,'STOCKBIT_RULE',$3)
         ON CONFLICT DO NOTHING RETURNING amount`,
        [crypto.randomUUID(),ACCOUNT_ID,'https://help.stockbit.com/id/article/apa-itu-biaya-bea-materai-p08y2z/'],
      );
      if (stamp.rows[0]) {
        const cashUpdate = await client.query(`UPDATE decision_agent_paper_accounts SET cash=cash-10000,updated_at=NOW() WHERE id=$1 AND cash>=10000 RETURNING id`, [ACCOUNT_ID]);
        if (!cashUpdate.rows[0]) throw new ConflictError('Kas paper tidak cukup untuk bea materai Stockbit');
      }
    }
    const navResult = await client.query(
      `SELECT a.cash,COALESCE(SUM(p.lots*100*p.last_price),0) AS positions_value
         FROM decision_agent_paper_accounts a
         LEFT JOIN decision_agent_paper_positions p ON p.account_id=a.id AND p.lots>0
        WHERE a.id=$1 GROUP BY a.cash`,
      [ACCOUNT_ID],
    );
    const latest = navResult.rows[0];
    if (latest) {
      const cash = asNumber(latest.cash);
      const positionsValue = asNumber(latest.positions_value);
      await client.query(
        `INSERT INTO decision_agent_paper_nav_snapshots (id,account_id,nav,cash,positions_value,source,observed_at)
         VALUES ($1,$2,$3,$4,$5,'ORDER',NOW())`,
        [crypto.randomUUID(), ACCOUNT_ID, cash + positionsValue, cash, positionsValue],
      );
    }
    await client.query('COMMIT');
    return mapOrder(updated.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function rejectPaperOrder(orderId: string): Promise<PaperOrder> {
  await ensureSharedSchema();
  const { rows } = await pool.query(
    `UPDATE decision_agent_orders SET status = 'REJECTED'
      WHERE id = $1 AND status = 'PROPOSED' RETURNING *`,
    [orderId],
  );
  if (!rows[0]) throw new ConflictError('Paper order tidak ditemukan atau sudah diproses');
  return mapOrder(rows[0]);
}

export function executeLiveOrder(): never {
  throw new ConflictError('Live trading terkunci: model belum tervalidasi dan adapter broker belum dikonfigurasi');
}
