// Telegram Stars purchases (stars-payments recipe).
export const starsPurchases = table('stars_purchases', {
  id:         integer('id').primaryKey({ autoIncrement: true }),
  userId:     integer('user_id').notNull(),
  itemId:     text('item_id').notNull(),
  stars:      integer('stars').notNull(),
  payload:    text('payload').notNull().unique(),          // invoice payload, e.g. SP-7K2Q9XWDAB
  status:     text('status').notNull().default('pending'), // pending | paid | refunded
  chargeId:   text('charge_id').unique(),                  // telegram_payment_charge_id, needed for refunds
  createdAt:  integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  paidAt:     integer('paid_at', { mode: 'timestamp' }),
  refundedAt: integer('refunded_at', { mode: 'timestamp' }),
}, (t) => ({
  userIdx: index('idx_stars_purchases_user').on(t.userId),
}));
