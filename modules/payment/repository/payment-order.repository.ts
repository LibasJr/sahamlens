import { randomUUID } from 'node:crypto';
import { pool } from '@/shared/database/postgres.client';

export type PaymentOrderStatus = 'PENDING'|'CLAIMED'|'PAID'|'REJECTED'|'CANCELLED';
export interface PaymentOrderInput { userId:string|null; email:string|null; planCode:string; amountIdr:number; externalReference:string; claimChannel:'WHATSAPP'; }
export async function claimPaymentOrder(input: PaymentOrderInput): Promise<{id:string; status:PaymentOrderStatus}> {
  const id = randomUUID();
  const { rows } = await pool.query(
    `INSERT INTO payment_orders (id,user_id,email,plan_code,amount_idr,status,external_reference,claim_channel)
     VALUES ($1,$2,$3,$4,$5,'CLAIMED',$6,$7)
     ON CONFLICT (external_reference) WHERE external_reference IS NOT NULL DO NOTHING
     RETURNING id,status`,
    [id,input.userId,input.email,input.planCode,input.amountIdr,input.externalReference,input.claimChannel],
  );
  if (rows[0]) return { id:String(rows[0].id), status:String(rows[0].status) as PaymentOrderStatus };

  // Idempotency is strict: reusing a reference is allowed only for the exact same
  // commercial claim. A client cannot recycle one UUID to change plan/amount/email.
  const existing = await getPaymentOrderByReference(input.externalReference);
  if (!existing) throw new Error('PAYMENT_REFERENCE_CONFLICT_WITHOUT_ROW');
  const emailMatches = !existing.email || !input.email || existing.email.toLowerCase() === input.email.toLowerCase();
  if (existing.planCode !== input.planCode || existing.amountIdr !== input.amountIdr || !emailMatches) {
    throw Object.assign(new Error('PAYMENT_REFERENCE_REUSE_MISMATCH'), { code:'PAYMENT_REFERENCE_REUSE_MISMATCH' });
  }
  return { id:existing.id, status:existing.status };
}


export interface PaymentOrderLookup {
  id: string;
  userId: string | null;
  email: string | null;
  planCode: string;
  amountIdr: number | null;
  status: PaymentOrderStatus;
  externalReference: string | null;
}

export async function getPaymentOrderByReference(reference: string): Promise<PaymentOrderLookup | null> {
  try {
    const { rows } = await pool.query(
      `SELECT id,user_id,email,plan_code,amount_idr,status,external_reference
         FROM payment_orders
        WHERE external_reference=$1
        LIMIT 1`,
      [reference],
    );
    const row = rows[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      id: String(row.id),
      userId: row.user_id == null ? null : String(row.user_id),
      email: row.email == null ? null : String(row.email),
      planCode: String(row.plan_code),
      amountIdr: row.amount_idr == null ? null : Number(row.amount_idr),
      status: String(row.status) as PaymentOrderStatus,
      externalReference: row.external_reference == null ? null : String(row.external_reference),
    };
  } catch (error) {
    if ((error as { code?: string } | null)?.code === '42P01') return null;
    throw error;
  }
}

export async function reconcilePaymentOrderByReference(input:{reference:string;email:string;paid:boolean;adminJti?:string|null;note?:string|null}):Promise<boolean>{
  const {rowCount}=await pool.query(
    `UPDATE payment_orders SET status=$2, paid_at=CASE WHEN $2='PAID' THEN now() ELSE paid_at END,
       reconciled_by=$3, reconciliation_note=$4, updated_at=now()
     WHERE external_reference=$1 AND lower(COALESCE(email,''))=lower($5)`,
    [input.reference,input.paid?'PAID':'REJECTED',input.adminJti??'admin',input.note??null,input.email]);
  return (rowCount??0)>0;
}


/**
 * Atomically activate Pro and reconcile the payment claim. The user entitlement and the
 * accounting trail either both commit or both roll back; this avoids a "Pro active but
 * payment still CLAIMED" split-brain state during a transient database error.
 */
export async function activateProAndReconcilePayment(input: {
  userId: string;
  email: string;
  proExpiresAt: string;
  reference: string;
  adminJti?: string | null;
  note?: string | null;
}): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id,email,status FROM payment_orders
        WHERE external_reference=$1
        FOR UPDATE`,
      [input.reference],
    );
    const order = rows[0] as { id: string; email: string | null; status: PaymentOrderStatus } | undefined;
    if (!order) throw Object.assign(new Error('PAYMENT_REFERENCE_NOT_FOUND'), { code: 'PAYMENT_REFERENCE_NOT_FOUND' });
    if (order.email && order.email.toLowerCase() !== input.email.toLowerCase()) {
      throw Object.assign(new Error('PAYMENT_EMAIL_MISMATCH'), { code: 'PAYMENT_EMAIL_MISMATCH' });
    }
    if (order.status === 'PAID') {
      throw Object.assign(new Error('PAYMENT_ALREADY_RECONCILED'), { code: 'PAYMENT_ALREADY_RECONCILED' });
    }

    const userUpdate = await client.query(
      `UPDATE users SET is_pro=true, pro_expires_at=$2 WHERE id=$1`,
      [input.userId, input.proExpiresAt],
    );
    if ((userUpdate.rowCount ?? 0) !== 1) {
      throw Object.assign(new Error('PAYMENT_USER_NOT_FOUND'), { code: 'PAYMENT_USER_NOT_FOUND' });
    }

    const orderUpdate = await client.query(
      `UPDATE payment_orders
          SET status='PAID', paid_at=now(), reconciled_by=$2,
              reconciliation_note=$3, updated_at=now(), user_id=COALESCE(user_id,$4), email=COALESCE(email,$5)
        WHERE id=$1`,
      [order.id, input.adminJti ?? 'admin', input.note ?? null, input.userId, input.email],
    );
    if ((orderUpdate.rowCount ?? 0) !== 1) throw new Error('PAYMENT_RECONCILE_UPDATE_FAILED');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export interface PaymentOrderAdminRow extends PaymentOrderLookup {
  claimChannel: string | null;
  createdAt: string;
  paidAt: string | null;
  reconciledBy: string | null;
}

export async function listRecentPaymentOrders(limit = 25): Promise<PaymentOrderAdminRow[]> {
  const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 100));
  const { rows } = await pool.query(
    `SELECT id,user_id,email,plan_code,amount_idr,status,external_reference,claim_channel,
            created_at,paid_at,reconciled_by
       FROM payment_orders
      ORDER BY created_at DESC
      LIMIT $1`,
    [safeLimit],
  );
  return rows.map((row: Record<string, unknown>) => ({
    id: String(row.id),
    userId: row.user_id == null ? null : String(row.user_id),
    email: row.email == null ? null : String(row.email),
    planCode: String(row.plan_code),
    amountIdr: row.amount_idr == null ? null : Number(row.amount_idr),
    status: String(row.status) as PaymentOrderStatus,
    externalReference: row.external_reference == null ? null : String(row.external_reference),
    claimChannel: row.claim_channel == null ? null : String(row.claim_channel),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    paidAt: row.paid_at == null ? null : row.paid_at instanceof Date ? row.paid_at.toISOString() : String(row.paid_at),
    reconciledBy: row.reconciled_by == null ? null : String(row.reconciled_by),
  }));
}
