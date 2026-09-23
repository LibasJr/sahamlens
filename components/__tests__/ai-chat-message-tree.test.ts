import { describe, expect, it } from 'vitest';
import { insertThreadMessage, replyHistory } from '../ai-chat-message-tree';

type Message = { id: string; replyToId?: string };
const base: Message[] = [
  { id: 'rups' },
  { id: 'wrong-answer', replyToId: 'rups' },
  { id: 'later-question' },
  { id: 'later-answer', replyToId: 'later-question' },
];

describe('LensAI inline reply branches', () => {
  it('places swipe reply and its answer below the original RUPS question', () => {
    const correction = insertThreadMessage(base, { id: 'correction', replyToId: 'rups' });
    const answer = insertThreadMessage(correction, { id: 'correct-rups-answer', replyToId: 'correction' });
    expect(answer.map((message) => message.id)).toEqual([
      'rups', 'wrong-answer', 'correction', 'correct-rups-answer', 'later-question', 'later-answer',
    ]);
  });

  it('keeps later unrelated messages and gives reply only its parent context', () => {
    expect(replyHistory(base, 'rups').map((message) => message.id)).toEqual(['rups']);
    expect(replyHistory(base).map((message) => message.id)).toEqual(base.map((message) => message.id));
  });
});
