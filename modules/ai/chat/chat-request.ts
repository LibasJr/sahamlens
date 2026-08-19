import type { ChatHistoryMessage } from './chat-date';

const MAX_PROMPT_LEN = 2000;
const MAX_CONTEXT_LEN = 4000;
const MAX_HISTORY_TURNS = 8;

export interface ParsedChatRequest {
  prompt: string;
  context: string;
  symbol: string | null;
  wantsStream: boolean;
  history: ChatHistoryMessage[];
}

export async function parseChatRequest(request: Request): Promise<ParsedChatRequest> {
  const body = await request.json();
  const prompt = typeof body.prompt === 'string' ? body.prompt.slice(0, MAX_PROMPT_LEN) : '';
  const context = typeof body.context === 'string' ? body.context.slice(0, MAX_CONTEXT_LEN) : '';
  const symbol = typeof body.symbol === 'string' && /^[\^A-Za-z0-9.]{1,12}$/.test(body.symbol.trim())
    ? body.symbol.trim()
    : null;
  const rawHistory = Array.isArray(body.history) ? body.history : [];
  const history: ChatHistoryMessage[] = rawHistory
    .filter((message: any) => message && (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string')
    .slice(-MAX_HISTORY_TURNS)
    .map((message: any) => ({ role: message.role, content: message.content.slice(0, 1000) }));

  return { prompt, context, symbol, wantsStream: body.stream === true, history };
}
