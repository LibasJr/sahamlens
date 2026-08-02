// Nomor pembayaran (DANA/GoPay/bank) untuk upgrade Pro - dibaca dari env var
// NEXT_PUBLIC_PAYMENT_* (client-safe, di-inline saat build oleh Next.js).
// Nilai asli HANYA ada di Vercel dashboard + .env.local lokal (gitignored),
// TIDAK PERNAH ditulis di file manapun yang ter-commit - lihat DEPLOYMENT.md
// untuk daftar nama variabelnya.
//
// Metode yang env var-nya tidak lengkap (kosong/belum di-set) dilewati, bukan
// dianggap error - supaya rollout bertahap (mis. cuma bank dulu) tetap jalan.

export interface PaymentMethod {
  id: 'dana' | 'gopay' | 'bank';
  label: string;
  accountNumber: string;
  accountName: string;
}

export function getPaymentMethods(): PaymentMethod[] {
  const methods: PaymentMethod[] = [];

  if (process.env.NEXT_PUBLIC_PAYMENT_DANA_NUMBER && process.env.NEXT_PUBLIC_PAYMENT_DANA_NAME) {
    methods.push({
      id: 'dana',
      label: 'DANA',
      accountNumber: process.env.NEXT_PUBLIC_PAYMENT_DANA_NUMBER,
      accountName: process.env.NEXT_PUBLIC_PAYMENT_DANA_NAME,
    });
  }

  if (process.env.NEXT_PUBLIC_PAYMENT_GOPAY_NUMBER && process.env.NEXT_PUBLIC_PAYMENT_GOPAY_NAME) {
    methods.push({
      id: 'gopay',
      label: 'GoPay',
      accountNumber: process.env.NEXT_PUBLIC_PAYMENT_GOPAY_NUMBER,
      accountName: process.env.NEXT_PUBLIC_PAYMENT_GOPAY_NAME,
    });
  }

  if (
    process.env.NEXT_PUBLIC_PAYMENT_BANK_NAME &&
    process.env.NEXT_PUBLIC_PAYMENT_BANK_ACCOUNT_NUMBER &&
    process.env.NEXT_PUBLIC_PAYMENT_BANK_ACCOUNT_NAME
  ) {
    methods.push({
      id: 'bank',
      label: process.env.NEXT_PUBLIC_PAYMENT_BANK_NAME,
      accountNumber: process.env.NEXT_PUBLIC_PAYMENT_BANK_ACCOUNT_NUMBER,
      accountName: process.env.NEXT_PUBLIC_PAYMENT_BANK_ACCOUNT_NAME,
    });
  }

  return methods;
}
