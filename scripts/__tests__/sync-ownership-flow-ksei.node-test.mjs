import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeDatabaseUrl,
  resolveDatabaseSsl,
} from '../sync-ownership-flow-ksei.mjs';

test('loopback menghapus sslmode agar proses anak tidak mencoba TLS', () => {
  for (const host of ['127.0.0.1', 'localhost', '[::1]']) {
    const input = `postgresql://user:secret@${host}:5432/db?sslmode=require&x=1`;
    const normalized = normalizeDatabaseUrl(input);
    const parsed = new URL(normalized);
    assert.equal(parsed.searchParams.has('sslmode'), false);
    assert.equal(parsed.searchParams.get('x'), '1');
    assert.equal(resolveDatabaseSsl(normalized), false);
  }
});

test('database remote menaikkan TLS menjadi verify-full', () => {
  const normalized = normalizeDatabaseUrl(
    'postgresql://user:secret@db.example.com:5432/db?sslmode=require',
  );
  assert.equal(new URL(normalized).searchParams.get('sslmode'), 'verify-full');
  assert.deepEqual(resolveDatabaseSsl(normalized), { rejectUnauthorized: true });
});
