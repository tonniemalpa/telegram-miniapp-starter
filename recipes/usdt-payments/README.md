# Recipe: USDT on TON payments

Take payments in USDT on TON with TON Connect, and confirm them on-chain on the server.

```bash
npm run recipe -- usdt-payments
```

**This uses real money.** USDT exists only on TON mainnet. Testnet has no official USDT. The demo item costs 0.01 USDT.

For digital goods and services sold inside Telegram, Telegram requires Telegram Stars (see `stars-payments`). USDT fits other cases: physical goods, services outside Telegram, crypto products, and apps that sell Telegram Stars themselves.

## How a payment works

USDT on TON is a *jetton* (token). Each wallet holds its USDT in a separate "jetton wallet" contract, so a payment works like this:

1. The user connects a wallet with the TON Connect button and taps **Pay**.
2. `createUsdtPayment` finds the payer's USDT wallet through toncenter (`/jetton/wallets`) and checks the balance. It then saves a `pending` payment with a reference such as `UP-7K2Q9XWD`.
3. The server builds a TEP-74 jetton transfer: the amount, sent to your `receiverAddress`, with the reference as the comment. It returns that transfer as a ready-made TON Connect message. The message goes to the payer's USDT wallet with 0.05 TON attached for fees; the unused TON is returned to the payer.
4. The wallet asks the user to confirm. The USDT moves.
5. `checkUsdtPayment` reads the incoming USDT transfers to your wallet (`/jetton/transfers`, `direction=in`). It accepts only a transfer that:
   - uses the official USDT token (the master address, not the name, which fakes can copy),
   - goes to your wallet,
   - wasn't aborted,
   - carries the exact reference,
   - pays at least the price.

   The payment then becomes `paid`, and the user and the admin get a message.

## What you get

| File | Purpose |
|---|---|
| `tgcloud/lib/usdt.js` | Settings, items, transfer building, on-chain check, notifications |
| `tgcloud/lib/ton-cells.js` | Pure-JS TON address and cell encoding (no npm needed) |
| `tgcloud/endpoints/usdtCatalog.js` | Items, network and decimals for the Mini App |
| `tgcloud/endpoints/createUsdtPayment.js` | Checks the payer's USDT, creates the payment and the wallet message |
| `tgcloud/endpoints/checkUsdtPayment.js` | Checks the chain, marks it paid |
| `web/recipes/usdt-payments.js` | The "Pay with USDT" card |
| `web/lib/ton-connect.js` | One TON Connect instance shared with `ton-payments` |
| `web/tonconnect-manifest.json` | App name and icon that wallets show |
| `web/index.html`, `tgcloud.jsonc` | TON Connect script and manifest header |
| `tgcloud/schema.js` | `usdt_payments` table appended |

## Setup

1. In `tgcloud/lib/usdt.js`, set `receiverAddress` to your TON wallet address and edit `usdtItems`, with prices in USDT.
2. In `web/tonconnect-manifest.json`, replace both `appXXXXXX` with your app address and set `name`.
3. Deploy:

```bash
npx tgcloud push
npx tgcloud migrate
```

## Test (real money)

You need a wallet with at least the price in USDT and about 0.1 TON for the fee.

1. Open the app and connect the wallet in the "Pay with USDT" card.
2. Tap **Pay 0.01 USDT** and confirm in the wallet.
3. Within about a minute the card shows "Paid", the bot messages you, and the admin gets a notification.
4. Check your receiving wallet: it shows +0.01 USDT with the `UP-…` comment.

Errors you may see:
- "This wallet has no USDT" or "Not enough USDT": top up, or use another wallet.
- "Switch your wallet to mainnet": the wallet is on testnet.

## Before going live

- Run `npm test`. With `npm install` done, it also checks the transfer encoding byte-for-byte against the official `@ton/core` library.
- Add a `toncenterApiKey` if you expect more than one check per second.
- Never change `jettonMaster` away from the official USDT address on mainnet.
- Selling for real money brings platform rules and local regulations into play. Check them for your app.
