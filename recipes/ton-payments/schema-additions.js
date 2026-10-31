// TON payments (ton-payments recipe).
export const tonPayments = table('ton_payments', {
  id:        integer('id').primaryKey({ autoIncrement: true }),
  userId:    integer('user_id').notNull(),
  itemId:    text('item_id').notNull(),
  priceNano: text('price_nano').notNull(),                  // nanoTON as a string
  reference: text('reference').notNull().unique(),          // payment comment, e.g. TP-7K2Q9XWD
  status:    text('status').notNull().default('pending'),   // pending | expired | paid
  txHash:    text('tx_hash').unique(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  paidAt:    integer('paid_at', { mode: 'timestamp' }),
}, (t) => ({
  userIdx: index('idx_ton_payments_user').on(t.userId),
}));
