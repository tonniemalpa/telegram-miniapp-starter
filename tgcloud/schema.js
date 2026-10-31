// Database tables. After changing this file: `npx tgcloud push`, then `npx tgcloud migrate`.
// The platform has no foreign keys: relate rows with plain columns (e.g. userId).
import { table, integer, text, boolean, json, index, uniqueIndex, sql } from 'sdk/db';

// One row per Telegram user who has opened the Mini App.
export const users = table('users', {
  id:           integer('id').primaryKey(),              // Telegram user ID
  username:     text('username'),
  firstName:    text('first_name'),
  languageCode: text('language_code'),
  visits:       integer('visits').notNull().default(0),
  createdAt:    integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  lastSeenAt:   integer('last_seen_at', { mode: 'timestamp' }),
});

// Tables added by recipes are appended below.
