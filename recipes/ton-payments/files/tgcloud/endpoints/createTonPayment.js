import { db, EndpointError } from 'sdk';
import { eq, and } from 'sdk/db';
import { tonPayments } from '../schema.js';
import {
  tonSettings, tonConfigured, findTonItem, tonToNano, makeTonReference,
  expireStaleTonPayments, publicTonPayment,
} from '../lib/ton.js';

// input: { itemId: string } -> a pending payment with the reference to use as the comment.
export default async function (input, ctx) {
  const userId = ctx.initData.user.id;
  if (!tonConfigured()) throw new EndpointError('TON payments are not configured yet.', { code: 'NOT_CONFIGURED' });

  const item = findTonItem(input?.itemId);
  if (!item) throw new EndpointError('Item not found.', { code: 'BAD_ITEM' });

  await expireStaleTonPayments(userId);
  const pending = await db.$count(tonPayments, and(eq(tonPayments.userId, userId), eq(tonPayments.status, 'pending')));
  if (pending >= tonSettings.maxPendingPerUser) {
    throw new EndpointError('You have too many unpaid payments. Pay or wait for them to expire.', { code: 'TOO_MANY_PENDING' });
  }

  const [row] = await db.insert(tonPayments)
    .values({ userId, itemId: item.id, priceNano: tonToNano(item.priceTon), reference: makeTonReference() })
    .returning()
    .run();
  return publicTonPayment(row);
}
