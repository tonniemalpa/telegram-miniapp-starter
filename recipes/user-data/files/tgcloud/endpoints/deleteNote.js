import { db, EndpointError } from 'sdk';
import { eq, and } from 'sdk/db';
import { notes } from '../schema.js';

// input: { id: number }. Only deletes the note if it belongs to the caller.
export default async function (input, ctx) {
  const id = Number(input?.id);
  if (!Number.isInteger(id)) throw new EndpointError('Missing note.', { code: 'BAD_ID' });

  const owned = and(eq(notes.id, id), eq(notes.userId, ctx.initData.user.id));
  const note = await db.select().from(notes).where(owned).get();
  if (!note) throw new EndpointError('Note not found.', { code: 'NOT_FOUND' });

  await db.delete(notes).where(owned).run();
  return { deleted: id };
}
