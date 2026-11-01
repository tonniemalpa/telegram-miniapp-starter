import { db, EndpointError } from 'sdk';
import { eq, and } from 'sdk/db';
import { usdtPayments } from '../schema.js';
import { settleUsdtPayment, publicUsdtPayment } from '../lib/usdt.js';

// input: { paymentId: number }. Checks the blockchain; safe to call repeatedly.
export default async function (input, ctx) {
  const id = Number(input?.paymentId);
  const payment = await db.select().from(usdtPayments)
    .where(and(eq(usdtPayments.id, id), eq(usdtPayments.userId, ctx.initData.user.id)))
    .get();
  if (!payment) throw new EndpointError('Payment not found.', { code: 'NOT_FOUND' });
  if (payment.status === 'paid') return { checked: true, payment: publicUsdtPayment(payment) };

  const { checked, payment: updated } = await settleUsdtPayment(payment);
  return { checked, payment: publicUsdtPayment(updated ?? payment) };
}
