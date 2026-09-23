export type ThreadedMessage = { id: string; replyToId?: string };

function belongsToThread(messages: ThreadedMessage[], message: ThreadedMessage, rootId: string): boolean {
  const byId = new Map(messages.map((item) => [item.id, item]));
  let parentId = message.replyToId;
  while (parentId) {
    if (parentId === rootId) return true;
    parentId = byId.get(parentId)?.replyToId;
  }
  return false;
}

/** Keep reply branches directly below their parent conversation, not at chat bottom. */
export function insertThreadMessage<T extends ThreadedMessage>(messages: T[], message: T): T[] {
  if (!message.replyToId) return [...messages, message];
  const parentIndex = messages.findIndex((item) => item.id === message.replyToId);
  if (parentIndex < 0) return [...messages, message];

  let insertAt = parentIndex + 1;
  while (insertAt < messages.length && belongsToThread(messages, messages[insertAt], message.replyToId)) insertAt++;
  return [...messages.slice(0, insertAt), message, ...messages.slice(insertAt)];
}

/** A reply gets only its parent branch as model context, never later unrelated turns. */
export function replyHistory<T extends ThreadedMessage>(messages: T[], parentId?: string, limit = 8): T[] {
  if (!parentId) return messages.slice(-limit);
  const parentIndex = messages.findIndex((item) => item.id === parentId);
  return parentIndex < 0 ? messages.slice(-limit) : messages.slice(Math.max(0, parentIndex - limit + 1), parentIndex + 1);
}
