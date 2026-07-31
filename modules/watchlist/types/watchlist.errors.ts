import { ForbiddenError } from '../../../shared/errors/app-error';

export class WatchlistLimitReachedError extends ForbiddenError {
  constructor(limit: number) {
    super(`Batas watchlist gratis (${limit}) sudah tercapai. Upgrade ke Pro untuk watchlist tanpa batas.`);
  }
}

export class AlertLimitReachedError extends ForbiddenError {
  constructor(limit: number) {
    super(`Batas alert gratis (${limit}) sudah tercapai. Upgrade ke Pro untuk alert tanpa batas.`);
  }
}
