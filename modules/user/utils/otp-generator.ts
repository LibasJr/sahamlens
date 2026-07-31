import crypto from 'crypto';
import { OTP_LENGTH } from '../constants/user.constants';

// crypto.randomInt (CSPRNG), bukan Math.random() - temuan H4 di audit: kode OTP
// yang bisa ditebak-tebak (bukan cryptographically secure) membuat brute-force
// terhadap ruang 900.000 kombinasi jadi lebih layak.
export function generateOtp(): string {
  const min = 10 ** (OTP_LENGTH - 1);
  const max = 10 ** OTP_LENGTH - 1;
  return crypto.randomInt(min, max + 1).toString();
}
