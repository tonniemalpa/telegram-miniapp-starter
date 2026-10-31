import { db, EndpointError } from 'sdk';
import { eq, and } from 'sdk/db';
import { tonPayments } from '../schema.js';
import { settleTonPayment, publicTonPayment } from '../lib/ton.js';

// input: { paymentId: number }. Checks the blockchain; safe to call repeatedly.
export default async function (input, ctx) {
  const id = Number(input?.paymentId);
  const payment = await db.select().from(tonPayments)
    .where(and(eq(tonPayments.id, id), eq(tonPayments.userId, ctx.initData.user.id)))
    .get();
  if (!payment) throw new EndpointError('Payment not found.', { code: 'NOT_FOUND' });
  if (payment.status === 'paid') return { checked: true, payment: publicTonPayment(payment) };

  const { checked, payment: updated } = await settleTonPayment(payment);
  return { checked, payment: publicTonPayment(updated ?? payment) };
}
