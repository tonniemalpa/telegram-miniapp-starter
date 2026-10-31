// Per-user items (user-data recipe). Rename "notes" to whatever your app stores.
export const notes = table('notes', {
  id:        integer('id').primaryKey({ autoIncrement: true }),
  userId:    integer('user_id').notNull(),                 // owner: Telegram user ID
  text:      text('text').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
}, (t) => ({
  userIdx: index('idx_notes_user').on(t.userId),
}));
