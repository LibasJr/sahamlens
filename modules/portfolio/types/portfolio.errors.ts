import { ForbiddenError, NotFoundError, ValidationError } from '../../../shared/errors/app-error';

export class PortfolioNotFoundError extends NotFoundError {
  constructor() {
    super('Portfolio tidak ditemukan');
  }
}

export class InsufficientCashError extends ValidationError {
  constructor() {
    super('Cash tidak cukup');
  }
}

export class InsufficientLotsError extends ValidationError {
  constructor() {
    super('Jumlah lot yang dipegang tidak cukup');
  }
}

/** Harga transaksi terlalu jauh dari harga pasar (audit 2026-08-05, temuan H-11) -
 * lihat modules/portfolio/service/price-guard.service.ts. */
export class UnrealisticTradePriceError extends ValidationError {
  constructor(message: string) {
    super(message);
  }
}

/** Sesi admin-secret tidak terikat ke akun mana pun, jadi tidak ada portfolio milik
 * siapa pun untuk menampung transaksinya (lihat shared/constants/identity.ts).
 * Ditolak eksplisit di sini supaya klien dapat pesan yang bisa ditindaklanjuti,
 * bukan 500 dari pelanggaran foreign key di lapisan database. */
export class AdminSessionHasNoPortfolioError extends ForbiddenError {
  constructor() {
    super('Sesi admin tidak punya portofolio demo. Masuk dengan akun email biasa untuk mencatat transaksi virtual.');
  }
}
