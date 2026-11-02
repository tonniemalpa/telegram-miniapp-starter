import { db } from 'sdk';
import { sql } from 'sdk/db';
import { users } from '../schema.js';
import { isAdmin, notifyAdmin, safeSend } from './notify.js';
import { unknownCommand } from './commands.js';

// Admin features. The admin is config.adminChatId in lib/config.js.
export const adminSettings = {
  // Message the admin when someone opens the app for the first time.
  // Turn off once the app gets busy.
  notifyNewUsers: true,
};

// Wraps a command so only the admin can use it. Anyone else gets the
// same reply as an unknown command.
export function adminOnly(command) {
  return async (message, args) => {
    if (!isAdmin(message.from?.id)) return unknownCommand(message);
    return command(message, args);
  };
}

// newUserHooks entry
export async function notifyNewUser(user) {
  if (!adminSettings.notifyNewUsers) return;
  const name = [user.firstName, user.username ? `@${user.username}` : null].filter(Boolean).join(' ');
  await notifyAdmin(`New user: ${name || 'unknown'} (id ${user.id})`);
}

// /stats - user counts
export const stats = adminOnly(async (message) => {
  const day = 24 * 60 * 60;
  const total = await db.$count(users);
  const newToday = await db.$count(users, sql`${users.createdAt} >= unixepoch() - ${day}`);
  const activeToday = await db.$count(users, sql`${users.lastSeenAt} >= unixepoch() - ${day}`);
  return safeSend(message.chat.id,
    `Users: ${total}\nNew in the last 24h: ${newToday}\nActive in the last 24h: ${activeToday}`);
});
