import { db, EndpointError } from 'sdk';
import { eq } from 'sdk/db';
import { notes } from '../schema.js';
import { cleanNoteText, noteLimits, publicNote } from '../lib/notes.js';

// input: { text: string }
export default async function (input, ctx) {
  const userId = ctx.initData.user.id;
  const text = cleanNoteText(input?.text);

  const count = await db.$count(notes, eq(notes.userId, userId));
  if (count >= noteLimits.maxPerUser) {
    throw new EndpointError(`You can keep up to ${noteLimits.maxPerUser} notes. Delete some first.`, { code: 'LIMIT' });
  }

  const [row] = await db.insert(notes).values({ userId, text }).returning().run();
  return publicNote(row);
}
