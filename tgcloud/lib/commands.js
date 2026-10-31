import { config, isConfigured } from './config.js';
import { safeSend } from './notify.js';

// Built-in bot commands. Each receives (message, args) where args is the text
// after the command. Register new commands in extensions.js.

export function openAppMarkup(label = 'Open app') {
  return { inline_keyboard: [[{ text: label, web_app: { url: config.miniAppUrl } }]] };
}

export async function start(message) {
  if (!isConfigured()) {
    return safeSend(message.chat.id,
      'This bot is not configured yet: set miniAppUrl in tgcloud/lib/config.js and push again.');
  }
  return safeSend(message.chat.id,
    `Welcome to ${config.appName}! Tap the button below to open the app.`,
    { reply_markup: openAppMarkup() });
}

export async function help(message) {
  return safeSend(message.chat.id,
    `${config.appName}\n\n/start - open the app\n/myid - show your Telegram user ID`);
}

// Lets the owner find the numeric ID for config.adminChatId.
export async function myid(message) {
  return safeSend(message.chat.id, `Your Telegram user ID: ${message.from?.id}`);
}

// Reply to anything that is not a known command.
export async function fallback(message) {
  if (!isConfigured()) return start(message);
  return safeSend(message.chat.id, 'Tap the button below to open the app.',
    { reply_markup: openAppMarkup() });
}
