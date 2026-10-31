import { db } from 'sdk';
import { sql } from 'sdk/db';
import { users } from '../schema.js';
import { newUserHooks } from './extensions.js';

// Records a visit from a verified Telegram user (ctx.initData.user) and
// returns their row. Runs newUserHooks the first time a user appears.
export async function touchUser(tgUser) {
  const now = new Date();
  const profile = {
    username: tgUser.username ?? null,
    firstName: tgUser.first_name ?? null,
    languageCode: tgUser.language_code ?? null,
    lastSeenAt: now,
  };
  const [row] = await db.insert(users)
    .values({ id: tgUser.id, ...profile, visits: 1 })
    .onConflictDoUpdate({
      target: users.id,
      set: { ...profile, visits: sql`${users.visits} + 1` },
    })
    .returning()
    .run();

  if (row.visits === 1) {
    for (const hook of newUserHooks) {
      try { await hook(row); } catch (e) { console.error('newUserHook failed', e); }
    }
  }
  return row;
}
