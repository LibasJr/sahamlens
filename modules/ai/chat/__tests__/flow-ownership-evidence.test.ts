import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Penjaga regresi: pertanyaan arus dana/akumulasi-distribusi (FLOW_BROKER) WAJIB
 * ikut membawa bukti komposisi kepemilikan KSEI. Tanpa itu LensAI menjawab
 * 'data tidak tersedia' padahal bukti kepemilikannya ada di database.
 */
describe('blok FLOW_BROKER membawa bukti komposisi kepemilikan', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'modules/ai/chat/chat-data-router.ts'), 'utf8');

  it('memanggil ownershipFlowBlock di dalam cabang FLOW_BROKER', () => {
    const start = source.indexOf("if (request.intent === 'FLOW_BROKER')");
    expect(start).toBeGreaterThan(-1);
    const branch = source.slice(start, source.indexOf('if (request.intent === \'OWNERSHIP_FLOW\')', start));
    expect(branch).toContain('ownershipFlowBlock');
    expect(branch).toContain('KOMPOSISI KEPEMILIKAN');
  });
});
