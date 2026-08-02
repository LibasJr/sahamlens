import { describe, it, expect, afterEach, vi } from 'vitest';
import { getPaymentMethods } from '../payment';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getPaymentMethods', () => {
  it('mengembalikan array kosong kalau semua env var payment kosong', () => {
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_DANA_NUMBER', '');
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_DANA_NAME', '');
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_GOPAY_NUMBER', '');
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_GOPAY_NAME', '');
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_BANK_NAME', '');
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_BANK_ACCOUNT_NUMBER', '');
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_BANK_ACCOUNT_NAME', '');

    expect(getPaymentMethods()).toEqual([]);
  });

  it('hanya mengembalikan DANA kalau cuma env var DANA yang lengkap', () => {
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_DANA_NUMBER', '085200000000');
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_DANA_NAME', 'BUDI SANTOSO');
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_GOPAY_NUMBER', '');
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_GOPAY_NAME', '');
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_BANK_NAME', '');
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_BANK_ACCOUNT_NUMBER', '');
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_BANK_ACCOUNT_NAME', '');

    expect(getPaymentMethods()).toEqual([
      { id: 'dana', label: 'DANA', accountNumber: '085200000000', accountName: 'BUDI SANTOSO' },
    ]);
  });

  it('mengembalikan ketiga metode dengan urutan DANA, GoPay, bank kalau semua lengkap', () => {
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_DANA_NUMBER', '085200000000');
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_DANA_NAME', 'BUDI SANTOSO');
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_GOPAY_NUMBER', '085211111111');
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_GOPAY_NAME', 'BUDI SANTOSO');
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_BANK_NAME', 'BCA');
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_BANK_ACCOUNT_NUMBER', '1234567890');
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_BANK_ACCOUNT_NAME', 'BUDI SANTOSO');

    expect(getPaymentMethods()).toEqual([
      { id: 'dana', label: 'DANA', accountNumber: '085200000000', accountName: 'BUDI SANTOSO' },
      { id: 'gopay', label: 'GoPay', accountNumber: '085211111111', accountName: 'BUDI SANTOSO' },
      { id: 'bank', label: 'BCA', accountNumber: '1234567890', accountName: 'BUDI SANTOSO' },
    ]);
  });

  it('melewati bank kalau salah satu dari tiga env var bank kosong', () => {
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_DANA_NUMBER', '');
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_DANA_NAME', '');
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_GOPAY_NUMBER', '');
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_GOPAY_NAME', '');
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_BANK_NAME', 'BCA');
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_BANK_ACCOUNT_NUMBER', '1234567890');
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_BANK_ACCOUNT_NAME', '');

    expect(getPaymentMethods()).toEqual([]);
  });
});
