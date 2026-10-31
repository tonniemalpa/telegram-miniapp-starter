import { tonItems, tonSettings, tonConfigured, tonToNano, TON_CHAIN } from '../lib/ton.js';

// Everything the Mini App needs to take a TON payment.
export default async function () {
  return {
    network: tonSettings.network,
    chain: TON_CHAIN[tonSettings.network],
    configured: tonConfigured(),
    receiverAddress: tonConfigured() ? tonSettings.receiverAddress : null,
    items: tonItems.map((i) => ({ id: i.id, title: i.title, priceNano: tonToNano(i.priceTon) })),
  };
}
