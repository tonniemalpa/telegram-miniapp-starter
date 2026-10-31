import { db, fetch } from 'sdk';
import { eq, and, inArray, sql } from 'sdk/db';
import { tonPayments } from '../schema.js';
import { safeSend, notifyAdmin } from './notify.js';

// ---------------------------------------------------------------------------
// TON payment settings. Nothing here is secret (this file is committed).
// ---------------------------------------------------------------------------
export const tonSettings = {
  // 'testnet' = test coins, no real money. 'mainnet' = real TON.
  network: 'testnet',
  // Your wallet that receives payments (a testnet address on testnet).
  // It must be active: it has sent at least one transaction.
  receiverAddress: 'PASTE_YOUR_TON_WALLET_ADDRESS',
  // Optional toncenter API key (raises the 1 request/second limit).
  toncenterApiKey: '',
  orderTtlMinutes: 30,
  maxPendingPerUser: 3,
};

// What can be paid for, priced in TON.
export const tonItems = [
  { id: 'demo-item', title: 'Demo item', priceTon: '0.01' },
];

export const TONCENTER_BASE = {
  testnet: 'https://testnet.toncenter.com/api/v3',
  mainnet: 'https://toncenter.com/api/v3',
};
// TON Connect chain IDs.
export const TON_CHAIN = { testnet: '-3', mainnet: '-239' };

export const tonConfigured = () => !tonSettings.receiverAddress.startsWith('PASTE_');

export function findTonItem(id) {
  return tonItems.find((i) => i.id === id) ?? null;
}

// "0.05" -> "50000000". Exact decimal parsing, no floating point.
export function tonToNano(ton) {
  const s = String(ton).trim();
  if (!/^\d+(\.\d{1,9})?$/.test(s)) throw new Error(`Invalid TON amount: ${ton}`);
  const [whole, frac = ''] = s.split('.');
  return (BigInt(whole) * 1_000_000_000n + BigInt(frac.padEnd(9, '0'))).toString();
}

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function makeTonReference() {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  return 'TP-' + Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

// Finds the transaction that pays `reference` in toncenter API v3 /transactions
// results for the receiver: an internal message (has a source), not aborted,
// with exactly this text comment and at least the price.
export function findTonPayment(transactions, reference, priceNano) {
  if (!Array.isArray(transactions)) return null;
  const price = BigInt(priceNano);
  for (const tx of transactions) {
    const msg = tx?.in_msg;
    if (!msg || !msg.source) continue;
    if (tx.description?.aborted) continue;
    const comment = msg.message_content?.decoded?.comment;
    if (typeof comment !== 'string' || comment.trim() !== reference) continue;
    let value;
    try { value = BigInt(msg.value ?? '0'); } catch { continue; }
    if (value < price) continue;
    return { hash: tx.hash, value: String(msg.value), source: msg.source };
  }
  return null;
}

export function publicTonPayment(p) {
  return { id: p.id, itemId: p.itemId, priceNano: p.priceNano, reference: p.reference, status: p.status, txHash: p.txHash ?? null };
}

// Marks this user's unpaid payments older than the TTL as expired.
export async function expireStaleTonPayments(userId) {
  await db.update(tonPayments)
    .set({ status: 'expired' })
    .where(and(
      eq(tonPayments.userId, userId),
      eq(tonPayments.status, 'pending'),
      sql`${tonPayments.createdAt} < unixepoch() - ${tonSettings.orderTtlMinutes * 60}`,
    ))
    .run();
}

async function fetchReceiverTransactions() {
  const base = TONCENTER_BASE[tonSettings.network];
  const url = `${base}/transactions?account=${encodeURIComponent(tonSettings.receiverAddress)}&limit=50&sort=desc`;
  const headers = { accept: 'application/json' };
  if (tonSettings.toncenterApiKey) headers['X-API-Key'] = tonSettings.toncenterApiKey;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    console.warn('toncenter request failed', res.status);
    return null;
  }
  const data = await res.json();
  return Array.isArray(data?.transactions) ? data.transactions : [];
}

// Looks for the payment on-chain. Returns { checked, payment } where payment
// is the updated row if this call marked it paid.
export async function settleTonPayment(payment) {
  const transactions = await fetchReceiverTransactions();
  if (transactions === null) return { checked: false, payment: null };

  const found = findTonPayment(transactions, payment.reference, payment.priceNano);
  if (!found) return { checked: true, payment: null };

  // Conditional update: only one caller can move it to paid, so messages go out once.
  const result = await db.update(tonPayments)
    .set({ status: 'paid', txHash: found.hash, paidAt: new Date() })
    .where(and(eq(tonPayments.id, payment.id), inArray(tonPayments.status, ['pending', 'expired'])))
    .returning()
    .run();
  const updated = Array.isArray(result) ? result[0] : result?.rows?.[0];
  if (!updated) return { checked: true, payment: null };

  const item = findTonItem(updated.itemId);
  const ton = Number(BigInt(updated.priceNano)) / 1e9;
  await safeSend(updated.userId, `Payment received: ${item?.title ?? updated.itemId} (${ton} TON). Reference ${updated.reference}.`);
  await notifyAdmin(`TON payment: ${ton} TON (${tonSettings.network}) for ${updated.itemId} from user ${updated.userId} (${updated.reference})`);
  return { checked: true, payment: updated };
}
