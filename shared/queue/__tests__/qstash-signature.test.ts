import { afterEach, describe, expect, it } from 'vitest';
import { verifyQStashSignature } from '../qstash-signature';

const original = {
  cronSecret: process.env.CRON_SECRET,
  currentKey: process.env.QSTASH_CURRENT_SIGNING_KEY,
  nextKey: process.env.QSTASH_NEXT_SIGNING_KEY,
};

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  restore('CRON_SECRET', original.cronSecret);
  restore('QSTASH_CURRENT_SIGNING_KEY', original.currentKey);
  restore('QSTASH_NEXT_SIGNING_KEY', original.nextKey);
});

describe('verifyQStashSignature', () => {
  it('accepts the VPS scheduler bearer secret without a QStash signature', async () => {
    process.env.CRON_SECRET = 'local-scheduler-secret';
    delete process.env.QSTASH_CURRENT_SIGNING_KEY;
    delete process.env.QSTASH_NEXT_SIGNING_KEY;

    await expect(verifyQStashSignature(
      null,
      '',
      'Bearer local-scheduler-secret',
    )).resolves.toBe(true);
  });

  it('rejects a wrong bearer secret when QStash is not configured', async () => {
    process.env.CRON_SECRET = 'local-scheduler-secret';
    delete process.env.QSTASH_CURRENT_SIGNING_KEY;
    delete process.env.QSTASH_NEXT_SIGNING_KEY;

    await expect(verifyQStashSignature(null, '', 'Bearer wrong-secret')).resolves.toBe(false);
  });

  it('fails closed when neither authentication mechanism is configured', async () => {
    delete process.env.CRON_SECRET;
    delete process.env.QSTASH_CURRENT_SIGNING_KEY;
    delete process.env.QSTASH_NEXT_SIGNING_KEY;

    await expect(verifyQStashSignature(null, '', null)).resolves.toBe(false);
  });
});
