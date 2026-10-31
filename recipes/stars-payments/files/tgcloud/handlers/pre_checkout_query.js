import { api, db } from 'sdk';
import { eq } from 'sdk/db';
import { starsPurchases } from '../schema.js';
import { checkPreCheckout } from '../lib/stars.js';

// Telegram asks the bot to confirm every payment before charging.
// It must be answered within 10 seconds or the payment is cancelled.
export default async function (query) {
  let error = null;
  try {
    const purchase = await db.select().from(starsPurchases)
      .where(eq(starsPurchases.payload, query.invoice_payload))
      .get();
    error = checkPreCheckout(query, purchase);
  } catch (e) {
    console.error('pre_checkout_query check failed', e);
    error = 'Something went wrong. Please try again.';
  }

  await api.answerPreCheckoutQuery(error
    ? { pre_checkout_query_id: query.id, ok: false, error_message: error }
    : { pre_checkout_query_id: query.id, ok: true });
}
