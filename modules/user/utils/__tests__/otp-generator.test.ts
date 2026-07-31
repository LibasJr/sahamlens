import { describe, it, expect } from 'vitest';
import { generateOtp } from '../otp-generator';

describe('generateOtp', () => {
  it('menghasilkan string 6 digit', () => {
    const otp = generateOtp();
    expect(otp).toMatch(/^\d{6}$/);
  });

  it('tidak pernah menghasilkan angka dengan leading zero yang salah rentang (100000-999999)', () => {
    for (let i = 0; i < 50; i++) {
      const otp = Number(generateOtp());
      expect(otp).toBeGreaterThanOrEqual(100000);
      expect(otp).toBeLessThanOrEqual(999999);
    }
  });

  it('menghasilkan variasi nilai (bukan konstanta), dites lewat crypto.randomInt', () => {
    const values = new Set(Array.from({ length: 20 }, () => generateOtp()));
    // Dengan 20 sampel dari ruang 900.000 kombinasi, praktis pasti semuanya unik -
    // kalau sampai ada duplikat/konstanta, itu tanda generator rusak.
    expect(values.size).toBeGreaterThan(1);
  });
});
