import { api, db, EndpointError } from 'sdk';
import { eq, and } from 'sdk/db';
import { starsPurchases } from '../schema.js';
import { findStarsItem, makeStarsPayload, starsSettings } from '../lib/stars.js';

// input: { itemId: string } -> { purchaseId, invoiceLink }
// The Mini App opens invoiceLink with Telegram.WebApp.openInvoice().
export default async function (input, ctx) {
  const userId = ctx.initData.user.id;
  const item = findStarsItem(input?.itemId);
  if (!item) throw new EndpointError('Item not found.', { code: 'BAD_ITEM' });

  const pending = await db.$count(starsPurchases, and(eq(starsPurchases.userId, userId), eq(starsPurchases.status, 'pending')));
  if (pending >= starsSettings.maxPendingPerUser) {
    throw new EndpointError('Too many unfinished payments. Try again later.', { code: 'TOO_MANY_PENDING' });
  }

  const payload = makeStarsPayload();
  const [purchase] = await db.insert(starsPurchases)
    .values({ userId, itemId: item.id, stars: item.stars, payload })
    .returning()
    .run();

  try {
    const invoiceLink = await api.createInvoiceLink({
      title: item.title,
      description: item.description,
      payload,
      provider_token: '',        // empty for Telegram Stars
      currency: 'XTR',
      prices: [{ label: item.title, amount: item.stars }],   // exactly one price for Stars
    });
    return { purchaseId: purchase.id, invoiceLink };
  } catch (e) {
    await db.delete(starsPurchases).where(eq(starsPurchases.id, purchase.id)).run();
    console.error('createInvoiceLink failed', e?.description ?? e?.message);
    throw new EndpointError('Could not create the payment. Please try again.', { code: 'INVOICE_FAILED' });
  }
}
