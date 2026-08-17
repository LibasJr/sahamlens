#!/usr/bin/env node
import dns from 'node:dns';
import net from 'node:net';
dns.setDefaultResultOrder('ipv4first');
net.setDefaultAutoSelectFamily(false);
import bcrypt from 'bcryptjs';
import pg from 'pg';

const { Client } = pg;

const newPassword = process.argv[2]?.trim();

if (!newPassword) {
  console.error('\nPenggunaan:');
  console.error('  node scripts/reset-admin-password.mjs "<password_baru_minimal_12_karakter>"\n');
  console.error('Atau di VPS:');
  console.error('  node --env-file=/opt/sahamlens/app/.env.production scripts/reset-admin-password.mjs "PasswordBaruAnda123"\n');
  process.exit(1);
}

if (newPassword.length < 12) {
  console.error('ERROR: Password admin minimal 12 karakter.');
  process.exit(1);
}

const dbUrl = process.env.DATABASE_URL?.trim();
if (!dbUrl) {
  console.error('ERROR: DATABASE_URL tidak ditemukan. Pastikan env terpasang (misal --env-file=.env.production).');
  process.exit(1);
}

const client = new Client({ connectionString: dbUrl, connectionTimeoutMillis: 15000 });

try {
  await client.connect();
  const hash = await bcrypt.hash(newPassword, 12);
  const { rows } = await client.query(
    `INSERT INTO admin_secret (id, secret_hash, session_version, updated_at)
     VALUES (1, $1, 1, now())
     ON CONFLICT (id) DO UPDATE SET
       secret_hash = EXCLUDED.secret_hash,
       session_version = admin_secret.session_version + 1,
       updated_at = now()
     RETURNING session_version`,
    [hash],
  );

  console.log('\n✅ BERHASIL: Password admin telah di-reset.');
  console.log(`Session version baru: ${rows[0]?.session_version}`);

  const redisUrl = process.env.REDIS_URL?.trim();
  if (redisUrl) {
    try {
      const { createClient } = await import('redis');
      const redisClient = createClient({ url: redisUrl });
      await redisClient.connect();
      const keys = await redisClient.keys('sahamlens:ratelimit:*');
      if (keys.length > 0) {
        await redisClient.del(keys);
        console.log(`🧹 Rate limit counter & blokir dibersihkan (${keys.length} keys di Redis).`);
      }
      await redisClient.disconnect();
    } catch {
      // Redis optional
    }
  }

  console.log('Silakan restart service lalu login di https://sahamlens.id/admin-login dengan password baru Anda.\n');
} catch (err) {
  console.error('❌ GAGAL mereset password admin:', err?.message ?? err);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
