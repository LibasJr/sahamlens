import { buildAnonymousTrialCookie, type AnonTrialState } from '@/shared/auth/anonymous-trial';
import type { HttpResult } from '@/shared/types/http-result.types';

export type ChatJsonResponder = (body: any, init?: ResponseInit) => Promise<HttpResult>;

export function createChatJsonResponder(getAnonTrial: () => AnonTrialState | null): ChatJsonResponder {
  return async (body: any, init?: ResponseInit): Promise<HttpResult> => {
    const anonTrial = getAnonTrial();
    const cookie = anonTrial ? await buildAnonymousTrialCookie(anonTrial) : null;
    const headers = init?.headers ? Object.fromEntries(new Headers(init.headers).entries()) : undefined;
    return {
      status: init?.status ?? 200,
      body,
      headers,
      cookiesToSet: cookie ? [cookie] : undefined,
    };
  };
}
