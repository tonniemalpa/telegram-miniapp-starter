import { db, EndpointError } from 'sdk';
import { eq, and } from 'sdk/db';
import { starsPurchases } from '../schema.js';

// input: { purchaseId: number } -> the caller's purchase and its status.
export default async function (input, ctx) {
  const id = Number(input?.purchaseId);
  const purchase = await db.select().from(starsPurchases)
    .where(and(eq(starsPurchases.id, id), eq(starsPurchases.userId, ctx.initData.user.id)))
    .get();
  if (!purchase) throw new EndpointError('Purchase not found.', { code: 'NOT_FOUND' });
  return {
    id: purchase.id,
    itemId: purchase.itemId,
    stars: purchase.stars,
    reference: purchase.payload,
    status: purchase.status,
  };
}
