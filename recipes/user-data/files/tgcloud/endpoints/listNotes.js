import { db } from 'sdk';
import { eq, desc } from 'sdk/db';
import { notes } from '../schema.js';
import { publicNote } from '../lib/notes.js';

// The caller's notes, newest first.
export default async function (input, ctx) {
  const rows = await db.select().from(notes)
    .where(eq(notes.userId, ctx.initData.user.id))
    .orderBy(desc(notes.id))
    .all();
  return rows.map(publicNote);
}
