import { guard } from '@/lib/sahamLensGuard';
guard();

export const maxDuration = 60;

import { runController } from '@/shared/http/next-response.adapter';
import { handleChatRequest } from '@/modules/ai/controller/chat.controller';

export async function POST(request: Request) {
  return runController(() => handleChatRequest(request), request);
}
