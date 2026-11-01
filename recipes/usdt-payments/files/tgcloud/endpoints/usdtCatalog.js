import { usdtItems, usdtSettings, usdtConfigured, toUnits, USDT_CHAIN } from '../lib/usdt.js';

// Everything the Mini App needs to show USDT prices and start a payment.
export default async function () {
  return {
    network: usdtSettings.network,
    chain: USDT_CHAIN[usdtSettings.network],
    configured: usdtConfigured(),
    decimals: usdtSettings.decimals,
    items: usdtItems.map((i) => ({ id: i.id, title: i.title, units: toUnits(i.priceUsdt, usdtSettings.decimals) })),
  };
}
