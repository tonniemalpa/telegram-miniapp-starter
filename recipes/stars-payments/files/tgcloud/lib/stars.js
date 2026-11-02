import { api, db } from 'sdk';
import { eq, and } from 'sdk/db';
import { starsPurchases } from '../schema.js';
import { safeSend, notifyAdmin, isAdmin } from './notify.js';
import { unknownCommand } from './commands.js';

// ---------------------------------------------------------------------------
// What users can buy with Telegram Stars. Telegram requires Stars (currency
// XTR) for digital goods and services sold in bots and Mini Apps.
// title: 1-32 characters, description: 1-255 characters, stars: whole number.
// ---------------------------------------------------------------------------
export const starsItems = [
  { id: 'demo-item', title: 'Demo item', description: 'A test purchase that costs 1 Star.', stars: 1 },
];

export const starsSettings = {
  maxPendingPerUser: 10,
  // Shown when a user sends /paysupport (Telegram requires bots that take payments to answer it).
  supportText: 'Payment problem? Reply here with your order reference (it starts with SP-) and what went wrong. We will get back to you.',
};

export function findStarsItem(id) {
  return starsItems.find((i) => i.id === id) ?? null;
}

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function makeStarsPayload() {
  const bytes = new Uint8Array(10);
  globalThis.crypto.getRandomValues(bytes);
  return 'SP-' + Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

// Returns null if the pre-checkout query matches a pending purchase,
// otherwise the error message to show the user.
export function checkPreCheckout(query, purchase) {
  if (!purchase) return 'This order no longer exists. Please start again.';
  if (purchase.status !== 'pending') return 'This order is already paid.';
  if (purchase.userId !== query.from?.id) return 'This order belongs to another account.';
  if (query.currency !== 'XTR' || query.total_amount !== purchase.stars) return 'The price has changed. Please start again.';
  return null;
}

// messageHooks entry: records the payment when Telegram confirms it.
// Deliver what was bought only after this runs (status = 'paid').
export async function onSuccessfulPayment(message) {
  const payment = message.successful_payment;
  if (!payment || payment.currency !== 'XTR') return false;

  const result = await db.update(starsPurchases)
    .set({ status: 'paid', chargeId: payment.telegram_payment_charge_id, paidAt: new Date() })
    .where(and(eq(starsPurchases.payload, payment.invoice_payload), eq(starsPurchases.status, 'pending')))
    .returning()
    .run();
  const purchase = Array.isArray(result) ? result[0] : result?.rows?.[0];

  if (!purchase) {
    // Money arrived but there is no matching pending order: keep the details for a refund.
    console.error('successful_payment without a pending purchase', payment);
    await notifyAdmin(`Unmatched Stars payment: ${payment.total_amount} Stars, payload ${payment.invoice_payload}, ` +
      `charge ${payment.telegram_payment_charge_id}, user ${message.from?.id}. Check and refund if needed.`);
    return true;
  }

  const item = findStarsItem(purchase.itemId);
  await safeSend(message.chat.id, `Payment received: ${item?.title ?? purchase.itemId} (${purchase.stars} Stars). Order ${purchase.payload}.`);
  await notifyAdmin(`Stars payment: ${purchase.stars} Stars for ${purchase.itemId} from user ${purchase.userId} (${purchase.payload})`);
  return true;
}

// /paysupport
export async function paySupport(message, args) {
  await safeSend(message.chat.id, starsSettings.supportText);
  if (args) await notifyAdmin(`/paysupport from ${message.from?.id}: ${args}`);
}

// /refund SP-XXXXXXXXXX  (admin only)
export async function refundStars(message, args) {
  if (!isAdmin(message.from?.id)) return unknownCommand(message);
  const payload = (args || '').trim().toUpperCase();
  if (!payload) return safeSend(message.chat.id, 'Usage: /refund SP-XXXXXXXXXX');

  const purchase = await db.select().from(starsPurchases).where(eq(starsPurchases.payload, payload)).get();
  if (!purchase || purchase.status !== 'paid') {
    return safeSend(message.chat.id, `No paid order ${payload}.`);
  }
  try {
    await api.refundStarPayment({ user_id: purchase.userId, telegram_payment_charge_id: purchase.chargeId });
  } catch (e) {
    return safeSend(message.chat.id, `Refund failed: ${e?.description ?? e?.message}`);
  }
  await db.update(starsPurchases)
    .set({ status: 'refunded', refundedAt: new Date() })
    .where(eq(starsPurchases.id, purchase.id))
    .run();
  await safeSend(purchase.userId, `Your payment for order ${purchase.payload} (${purchase.stars} Stars) was refunded.`);
  return safeSend(message.chat.id, `Refunded ${purchase.payload}.`);
}
