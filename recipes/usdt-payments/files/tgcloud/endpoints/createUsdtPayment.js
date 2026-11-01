import { db, EndpointError } from 'sdk';
import { eq, and } from 'sdk/db';
import { usdtPayments } from '../schema.js';
import { toRawAddress } from '../lib/ton-cells.js';
import {
  usdtSettings, usdtConfigured, findUsdtItem, toUnits, makeUsdtReference,
  expireStaleUsdtPayments, findPayerJettonWallet, buildUsdtMessage, publicUsdtPayment,
} from '../lib/usdt.js';

// input: { itemId, payerAddress } -> { payment, message }
// `message` goes straight into TonConnectUI.sendTransaction({ messages: [message] }).
// The payer address only shapes the transfer; payment is confirmed on-chain later.
export default async function (input, ctx) {
  const userId = ctx.initData.user.id;
  if (!usdtConfigured()) throw new EndpointError('USDT payments are not configured yet.', { code: 'NOT_CONFIGURED' });

  const item = findUsdtItem(input?.itemId);
  if (!item) throw new EndpointError('Item not found.', { code: 'BAD_ITEM' });

  let payerAddress;
  try { payerAddress = toRawAddress(input?.payerAddress); } catch {
    throw new EndpointError('Connect your wallet first.', { code: 'BAD_ADDRESS' });
  }

  await expireStaleUsdtPayments(userId);
  const pending = await db.$count(usdtPayments, and(eq(usdtPayments.userId, userId), eq(usdtPayments.status, 'pending')));
  if (pending >= usdtSettings.maxPendingPerUser) {
    throw new EndpointError('You have too many unpaid payments. Pay or wait for them to expire.', { code: 'TOO_MANY_PENDING' });
  }

  const units = toUnits(item.priceUsdt, usdtSettings.decimals);
  const jettonWallet = await findPayerJettonWallet(payerAddress);
  if (!jettonWallet) throw new EndpointError('This wallet has no USDT.', { code: 'NO_USDT' });
  if (BigInt(jettonWallet.balance ?? '0') < BigInt(units)) {
    throw new EndpointError('Not enough USDT in this wallet.', { code: 'NOT_ENOUGH_USDT' });
  }

  const [row] = await db.insert(usdtPayments)
    .values({ userId, itemId: item.id, units, reference: makeUsdtReference(), payerAddress })
    .returning()
    .run();

  return {
    payment: publicUsdtPayment(row),
    message: buildUsdtMessage({ jettonWallet: jettonWallet.address, units, payerAddress, reference: row.reference }),
  };
}
