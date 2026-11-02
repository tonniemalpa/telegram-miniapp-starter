import { commands, messageHooks } from '../lib/extensions.js';
import { fallback, unknownCommand } from '../lib/commands.js';

// Every message sent to the bot. Logic lives in lib/; register features in lib/extensions.js.
export default async function (message) {
  if (message.chat?.type !== 'private') return;

  for (const hook of messageHooks) {
    if (await hook(message)) return;
  }

  const text = (message.text ?? '').trim();
  if (text.startsWith('/')) {
    const [first, ...rest] = text.split(/\s+/);
    const name = first.split('@')[0].toLowerCase();   // "/start@my_bot" -> "/start"
    const command = commands[name];
    if (command) return command(message, rest.join(' '));
    return unknownCommand(message);
  }

  return fallback(message);
}
