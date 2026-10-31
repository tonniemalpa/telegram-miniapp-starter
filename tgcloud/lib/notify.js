import { api } from 'sdk';
import { config } from './config.js';

// Sends a message without throwing (e.g. if the user blocked the bot).
export async function safeSend(chatId, text, extra = {}) {
  try {
    return await api.sendMessage({ chat_id: chatId, text, ...extra });
  } catch (e) {
    console.warn('sendMessage failed', chatId, e?.description ?? e?.message);
    return null;
  }
}

// Messages the owner, if config.adminChatId is set.
export async function notifyAdmin(text) {
  if (!config.adminChatId) return null;
  return safeSend(config.adminChatId, text);
}

export function isAdmin(userId) {
  return Boolean(config.adminChatId) && userId === config.adminChatId;
}
