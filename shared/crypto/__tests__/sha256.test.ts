import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { sha256Hex } from '../sha256';

describe('sha256 murni JS - dibuktikan, bukan diasumsikan', () => {
  // Vektor uji resmi NIST/RFC. Implementasi kripto buatan sendiri tanpa vektor uji
  // adalah tebakan yang terlihat meyakinkan.
  it.each([
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    ['abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'],
  ])('vektor resmi: %j', (input, expected) => {
    expect(sha256Hex(input)).toBe(expected);
  });

  it('cocok dengan node:crypto pada berbagai panjang - termasuk batas blok 64 byte', () => {
    // Padding SHA-256 paling mudah salah tepat di sekitar batas blok.
    for (const len of [0, 1, 55, 56, 63, 64, 65, 119, 120, 127, 128, 1000]) {
      const s = 'x'.repeat(len);
      expect(sha256Hex(s)).toBe(createHash('sha256').update(s).digest('hex'));
    }
  });

  it('menangani UTF-8 multibyte sama seperti node:crypto', () => {
    for (const s of ['saham', 'emoji rocket IDX', 'nihongo', 'n'.repeat(40)]) {
      expect(sha256Hex(s)).toBe(createHash('sha256').update(s).digest('hex'));
    }
  });
});
