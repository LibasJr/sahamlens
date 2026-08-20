#!/usr/bin/env node
import dns from 'node:dns';
import net from 'node:net';
dns.setDefaultResultOrder('ipv4first');
net.setDefaultAutoSelectFamily(false);
import pg from 'pg';

const confirm = process.argv.includes('--confirm');
function retentionDays(name, fallback) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || value < 30) throw new Error(`${name} minimal 30 hari`);
  return Math.trunc(value);
}

const policy = {
  authDays: retentionDays('PRIVACY_AUTH_EVENT_RETENTION_DAYS', 90),
  funnelDays: retentionDays('PRIVACY_FUNNEL_RETENTION_DAYS', 90),
  journeyDays: retentionDays('PRIVACY_JOURNEY_RETENTION_DAYS', 90),
  feedbackDays: retentionDays('PRIVACY_LENSAI_FEEDBACK_RETENTION_DAYS', 180),
  unpaidDays: retentionDays('PRIVACY_UNPAID_ORDER_RETENTION_DAYS', 180),
  adminAuditDays: retentionDays('PRIVACY_ADMIN_AUDIT_RETENTION_DAYS', 365),
};
console.table(policy);
if (!confirm) {
  console.log('DRY RUN. Gunakan --confirm untuk menghapus data melewati retensi.');
  process.exit(0);
}
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL tidak tersedia');

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const deleted = {};
try {
  const statements = [
    ['user_auth_events', 'DELETE FROM user_auth_events WHERE created_at < now() - make_interval(days => $1::int)', policy.authDays],
    ['product_funnel_events', 'DELETE FROM product_funnel_events WHERE created_at < now() - make_interval(days => $1::int)', policy.funnelDays],
    ['product_journey_events', 'DELETE FROM product_journey_events WHERE created_at < now() - make_interval(days => $1::int)', policy.journeyDays],
    ['lensai_feedback', 'DELETE FROM lensai_feedback WHERE created_at < now() - make_interval(days => $1::int)', policy.feedbackDays],
    ['payment_orders_non_paid', "DELETE FROM payment_orders WHERE status <> 'PAID' AND created_at < now() - make_interval(days => $1::int)", policy.unpaidDays],
    ['admin_audit_events', 'DELETE FROM admin_audit_events WHERE created_at < now() - make_interval(days => $1::int)', policy.adminAuditDays],
  ];
  await client.query('BEGIN');
  for (const [label, sql, days] of statements) {
    const result = await client.query(sql, [days]);
    deleted[label] = result.rowCount ?? 0;
    console.log(`${label}: ${deleted[label]} deleted`);
  }
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK').catch(() => undefined);
  throw error;
} finally {
  await client.end();
}

console.log(`SAHAMLENS_PRIVACY_CLEANUP_RESULT=${JSON.stringify({ status: 'SUCCESS', deleted, policy })}`);
