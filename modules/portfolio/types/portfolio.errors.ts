import { NotFoundError, ValidationError } from '../../../shared/errors/app-error';

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
