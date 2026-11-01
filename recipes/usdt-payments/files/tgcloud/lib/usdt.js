import { db, fetch, EndpointError } from 'sdk';
import { eq, and, inArray, sql } from 'sdk/db';
import { usdtPayments } from '../schema.js';
import { safeSend, notifyAdmin } from './notify.js';
import { toRawAddress, toFriendlyAddress, sameAddress, jettonTransferPayload, parseBoc, readComment } from './ton-cells.js';

// ---------------------------------------------------------------------------
// USDT on TON settings. Nothing here is secret (this file is committed).
// USDT exists only on TON mainnet: payments here are REAL money.
// ---------------------------------------------------------------------------
export const usdtSettings = {
  network: 'mainnet',
  // Your TON wallet address. USDT arrives in that wallet's USDT balance.
  receiverAddress: 'PASTE_YOUR_TON_WALLET_ADDRESS',
  // Official USDT (Tether) on TON. Never change this to another token by name:
  // fake tokens can copy the name "USDT". On testnet, put a test token here.
  jettonMaster: 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs',
  decimals: 6,
  // TON the payer's wallet attaches to cover the transfer fee. Unused TON is returned.
  attachTon: '0.05',
  // Optional toncenter API key (raises the 1 request/second limit).
  toncenterApiKey: '',
  orderTtlMinutes: 30,
  maxPendingPerUser: 3,
};

// What can be paid for, priced in USDT.
export const usdtItems = [
  { id: 'demo-item', title: 'Demo item', priceUsdt: '0.01' },
];

const TONCENTER_BASE = { testnet: 'https://testnet.toncenter.com/api/v3', mainnet: 'https://toncenter.com/api/v3' };
export const USDT_CHAIN = { testnet: '-3', mainnet: '-239' };

export const usdtConfigured = () => !usdtSettings.receiverAddress.startsWith('PASTE_');

export function findUsdtItem(id) {
  return usdtItems.find((i) => i.id === id) ?? null;
}

// "0.01" with 6 decimals -> "10000". Exact, no floating point.
export function toUnits(amount, decimals) {
  const s = String(amount).trim();
  if (!new RegExp(`^\\d+(\\.\\d{1,${decimals}})?$`).test(s)) throw new Error(`Invalid amount: ${amount}`);
  const [whole, frac = ''] = s.split('.');
  return (BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, '0'))).toString();
}

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function makeUsdtReference() {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  return 'UP-' + Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

// The comment of a toncenter jetton transfer: decoded field first, raw payload as fallback.
export function transferComment(t) {
  const decoded = t?.decoded_forward_payload?.comment;
  if (typeof decoded === 'string') return decoded;
  if (!t?.forward_payload) return null;
  try { return readComment(parseBoc(t.forward_payload)); } catch { return null; }
}

// Finds the incoming transfer that pays `reference` in toncenter API v3
// /jetton/transfers results: the real token, to the receiver, not aborted,
// with exactly this comment and at least the price.
export function findUsdtPayment(transfers, { reference, units, jettonMaster, receiver }) {
  if (!Array.isArray(transfers)) return null;
  const price = BigInt(units);
  for (const t of transfers) {
    if (!t || t.transaction_aborted) continue;
    if (!sameAddress(t.jetton_master, jettonMaster)) continue;
    if (t.destination && !sameAddress(t.destination, receiver)) continue;
    const comment = transferComment(t);
    if (typeof comment !== 'string' || comment.trim() !== reference) continue;
    let amount;
    try { amount = BigInt(t.amount ?? '0'); } catch { continue; }
    if (amount < price) continue;
    return { hash: t.transaction_hash, amount: String(t.amount), source: t.source ?? null };
  }
  return null;
}

export function publicUsdtPayment(p) {
  return { id: p.id, itemId: p.itemId, units: p.units, reference: p.reference, status: p.status, txHash: p.txHash ?? null };
}

async function toncenter(path, params) {
  const url = `${TONCENTER_BASE[usdtSettings.network]}${path}?${new URLSearchParams(params)}`;
  const headers = { accept: 'application/json' };
  if (usdtSettings.toncenterApiKey) headers['X-API-Key'] = usdtSettings.toncenterApiKey;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    console.warn('toncenter request failed', path, res.status);
    return null;
  }
  return res.json();
}

// The payer's USDT wallet (a separate contract tied to their main wallet).
export async function findPayerJettonWallet(payerAddress) {
  const data = await toncenter('/jetton/wallets', {
    owner_address: toRawAddress(payerAddress),
    jetton_address: usdtSettings.jettonMaster,
    limit: '1',
  });
  if (data === null) throw new EndpointError('Could not reach the TON network. Try again.', { code: 'NETWORK' });
  return data.jetton_wallets?.[0] ?? null;
}

// The TON Connect message that makes the payer's wallet send the USDT.
export function buildUsdtMessage({ jettonWallet, units, payerAddress, reference }) {
  return {
    address: toFriendlyAddress(jettonWallet, { bounceable: true, testOnly: usdtSettings.network === 'testnet' }),
    amount: toUnits(usdtSettings.attachTon, 9),
    payload: jettonTransferPayload({
      amount: BigInt(units),
      destination: usdtSettings.receiverAddress,
      responseDestination: payerAddress,       // unused TON goes back to the payer
      comment: reference,
    }),
  };
}

// Marks this user's unpaid payments older than the TTL as expired.
export async function expireStaleUsdtPayments(userId) {
  await db.update(usdtPayments)
    .set({ status: 'expired' })
    .where(and(
      eq(usdtPayments.userId, userId),
      eq(usdtPayments.status, 'pending'),
      sql`${usdtPayments.createdAt} < unixepoch() - ${usdtSettings.orderTtlMinutes * 60}`,
    ))
    .run();
}

// Looks for the payment on-chain. Returns { checked, payment } where payment
// is the updated row if this call marked it paid.
export async function settleUsdtPayment(payment) {
  const data = await toncenter('/jetton/transfers', {
    owner_address: usdtSettings.receiverAddress,
    jetton_master: usdtSettings.jettonMaster,
    direction: 'in',
    limit: '50',
    sort: 'desc',
  });
  if (data === null) return { checked: false, payment: null };

  const found = findUsdtPayment(data.jetton_transfers, {
    reference: payment.reference,
    units: payment.units,
    jettonMaster: usdtSettings.jettonMaster,
    receiver: usdtSettings.receiverAddress,
  });
  if (!found) return { checked: true, payment: null };

  // Conditional update: only one caller can move it to paid, so messages go out once.
  const result = await db.update(usdtPayments)
    .set({ status: 'paid', txHash: found.hash, paidAt: new Date() })
    .where(and(eq(usdtPayments.id, payment.id), inArray(usdtPayments.status, ['pending', 'expired'])))
    .returning()
    .run();
  const updated = Array.isArray(result) ? result[0] : result?.rows?.[0];
  if (!updated) return { checked: true, payment: null };

  const item = findUsdtItem(updated.itemId);
  const usdt = formatUnits(updated.units, usdtSettings.decimals);
  await safeSend(updated.userId, `Payment received: ${item?.title ?? updated.itemId} (${usdt} USDT). Reference ${updated.reference}.`);
  await notifyAdmin(`USDT payment: ${usdt} USDT for ${updated.itemId} from user ${updated.userId} (${updated.reference})`);
  return { checked: true, payment: updated };
}

export function formatUnits(units, decimals) {
  const n = BigInt(units);
  const base = 10n ** BigInt(decimals);
  const frac = (n % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  return frac ? `${n / base}.${frac}` : `${n / base}`;
}
