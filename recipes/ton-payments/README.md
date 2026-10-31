# Recipe: TON payments

Take payments in TON with TON Connect, and confirm them on-chain on the server. It runs on **testnet** by default, so you can test the whole flow with free test coins.

```bash
npm run recipe -- ton-payments
```

For digital goods and services, Telegram requires Telegram Stars. Use the `stars-payments` recipe for those. TON fits payments for physical goods, services outside Telegram, donations, and apps built around TON.

## How a payment works

1. The user connects a wallet with the TON Connect button.
2. **Pay** calls `createTonPayment`, which saves a `pending` payment with a unique reference such as `TP-7K2Q9XWD`.
3. The Mini App asks the wallet to send the price to `receiverAddress`, with the reference as the text comment. `web/lib/boc.js` encodes the comment.
4. `checkTonPayment` reads the receiver's recent transactions from toncenter API v3. It accepts one that has a source, isn't aborted, carries the exact reference as its comment, and pays at least the price. The payment then becomes `paid`, and the user and the admin get a message.
5. Unpaid payments expire after `orderTtlMinutes`. A late payment still settles an expired one.

## What you get

| File | Purpose |
|---|---|
| `tgcloud/lib/ton.js` | Settings, items, on-chain check, notifications |
| `tgcloud/endpoints/tonCatalog.js` | Network, receiver and items for the Mini App |
| `tgcloud/endpoints/createTonPayment.js` | Creates a pending payment |
| `tgcloud/endpoints/checkTonPayment.js` | Checks the chain, marks it paid |
| `web/recipes/ton-payments.js` | The "Pay with TON" card with the wallet button |
| `web/lib/boc.js` | Encodes the comment payload, no npm needed |
| `web/tonconnect-manifest.json` | App name and icon that wallets show |
| `web/index.html` | TON Connect UI script added |
| `tgcloud.jsonc` | Lets wallets fetch the manifest |
| `tgcloud/schema.js` | `ton_payments` table appended |

## Setup

1. Get a TON wallet that supports testnet, such as Tonkeeper in testnet mode, plus test TON from a faucet like [@testgiver_ton_bot](https://t.me/testgiver_ton_bot). The receiving wallet must have sent at least one transaction so that it is active.
2. In `tgcloud/lib/ton.js`, set `receiverAddress` to that wallet and edit `tonItems`.
3. In `web/tonconnect-manifest.json`, replace both `appXXXXXX` with your app address and set `name`.
4. Deploy:

```bash
npx tgcloud push
npx tgcloud migrate
```

## Going to mainnet

Set `network: 'mainnet'`, use a mainnet receiving address, and add a `toncenterApiKey` if you expect traffic. That means real money: test thoroughly on testnet first.

## USDT (not included)

USDT on TON is a jetton. Accepting it needs a jetton transfer (TEP-74) sent to the payer's USDT jetton wallet, with the reference in the forward payload. Verification checks the jetton transfer, the **real USDT master address**, the amount and the comment. Build it against the current TON docs: https://docs.ton.org

## Test

- Connect a testnet wallet and pay the demo item. The card shows "Paid" within about a minute, and the bot messages you.
- A wallet on the wrong network gets a "switch your wallet" message.
- In `npm test`, the matcher is tested against wrong comments, underpayment, aborted transactions and external messages.
