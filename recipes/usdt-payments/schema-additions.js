// USDT on TON payments (usdt-payments recipe).
export const usdtPayments = table('usdt_payments', {
  id:           integer('id').primaryKey({ autoIncrement: true }),
  userId:       integer('user_id').notNull(),
  itemId:       text('item_id').notNull(),
  units:        text('units').notNull(),                       // USDT in smallest units (6 decimals), as a string
  reference:    text('reference').notNull().unique(),          // transfer comment, e.g. UP-7K2Q9XWD
  payerAddress: text('payer_address'),
  status:       text('status').notNull().default('pending'),   // pending | expired | paid
  txHash:       text('tx_hash').unique(),
  createdAt:    integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  paidAt:       integer('paid_at', { mode: 'timestamp' }),
}, (t) => ({
  userIdx: index('idx_usdt_payments_user').on(t.userId),
}));
