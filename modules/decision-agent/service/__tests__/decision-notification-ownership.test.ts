import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Decision Lab notification ownership', () => {
  it('tidak memiliki jalur kirim Telegram; HERMES adalah final notification gate', () => {
    const serviceDir = path.resolve(process.cwd(), 'modules/decision-agent/service');
    const sources = fs.readdirSync(serviceDir)
      .filter((name) => name.endsWith('.ts'))
      .map((name) => fs.readFileSync(path.join(serviceDir, name), 'utf8'))
      .join('\n');

    expect(sources).not.toContain("@/lib/telegram");
    expect(sources).not.toContain('sendTelegramMessage(');
    expect(sources).not.toContain('notifyDecisionSignalTransitions(');
    expect(sources).toContain('Telegram dimiliki HERMES');
  });
});