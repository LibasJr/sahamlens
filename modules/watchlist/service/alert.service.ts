import { listAlerts, countAlerts, createAlert, deleteAlert, listPendingAlerts, markTriggered } from '../repository/alert.repository';
import { FREE_LIMITS } from '../constants/watchlist.constants';
import { AlertLimitReachedError } from '../types/watchlist.errors';
import type { Alert } from '../types/watchlist.types';
import type { AlertInput } from '../validator/watchlist.validator';

export async function getAlerts(userId: string): Promise<Alert[]> {
  return listAlerts(userId);
}

// Sama seperti watchlist: limit gratis sebelumnya cuma dicek client-side.
export async function addAlert(userId: string, hasPro: boolean, input: AlertInput): Promise<Alert> {
  if (!hasPro) {
    const current = await countAlerts(userId);
    if (current >= FREE_LIMITS.ALERTS) {
      throw new AlertLimitReachedError(FREE_LIMITS.ALERTS);
    }
  }
  return createAlert(userId, {
    symbol: input.symbol,
    condition_type: input.conditionType,
    condition_value: input.targetValue ?? null,
  });
}

export async function removeAlert(userId: string, id: string): Promise<void> {
  await deleteAlert(userId, id);
}

export { listPendingAlerts, markTriggered };
