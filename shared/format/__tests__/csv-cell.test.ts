import { describe, expect, it } from 'vitest';
import { csvCell } from '@/shared/format/csv-cell';

describe('csvCell', () => {
  it('neutralises spreadsheet formula triggers so exports cannot execute on open', () => {
    expect(csvCell('=cmd|\' /c calc\'!A1')).toBe('"\'=cmd|\' /c calc\'!A1"');
    expect(csvCell('+1+1')).toBe('"\'+1+1"');
    expect(csvCell('-1+1')).toBe('"\'-1+1"');
    expect(csvCell('@SUM(A1)')).toBe('"\'@SUM(A1)"');
    expect(csvCell('\tHYPERLINK("http://evil")')).toBe('"\'\tHYPERLINK(""http://evil"")"');
    expect(csvCell('\rHYPERLINK')).toBe('"\'\rHYPERLINK"');
  });

  it('leaves ordinary values and negative numbers usable', () => {
    expect(csvCell('BBCA')).toBe('"BBCA"');
    expect(csvCell('18,5x')).toBe('"18,5x"');
    expect(csvCell(-1250)).toBe('"-1250"');
    expect(csvCell(null)).toBe('""');
    expect(csvCell(undefined)).toBe('""');
  });

  it('escapes embedded quotes', () => {
    expect(csvCell('Catatan "khusus"')).toBe('"Catatan ""khusus"""');
  });
});
