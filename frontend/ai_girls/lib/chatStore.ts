export type CachedMsg = { id: string; from: 'me'|'model'; type: 'text'|'image'|'typing'|'generating'; time: string; text?: string; url?: string; caption?: string; prompt?: string };

const cache: Record<string, { chatId: number; messages: CachedMsg[] }> = {};

export function getCached(uuid: string) {
  return cache[uuid];
}

export function setCached(uuid: string, chatId: number, messages: CachedMsg[]) {
  cache[uuid] = { chatId, messages };
}

