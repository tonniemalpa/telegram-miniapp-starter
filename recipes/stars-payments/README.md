# Recipe: Telegram Stars payments

Sell digital goods and services inside your Mini App. Telegram requires Stars (currency `XTR`) for digital goods sold in bots and Mini Apps.

Not for apps that *sell* Telegram Stars: charging Stars for Stars makes no sense. Use the payment method that app needs, such as TON (`ton-payments`) or USDT.

```bash
npm run recipe -- stars-payments
```

## How a payment works

1. The user taps **Buy**. The Mini App calls `createStarsInvoice`, which saves a `pending` purchase and creates an invoice link with `createInvoiceLink` (currency `XTR`, empty `provider_token`, exactly one price).
2. The Mini App opens it with `Telegram.WebApp.openInvoice(link, callback)`.
3. Telegram sends a `pre_checkout_query`. `handlers/pre_checkout_query.js` checks that the purchase exists, is still pending, belongs to this user and has the right price, then answers within 10 seconds.
4. Telegram charges the user and sends a `successful_payment` message. `onSuccessfulPayment` marks the purchase `paid` and stores `telegram_payment_charge_id`, which refunds need.
5. The Mini App confirms the status with `getStarsPurchase`. **Deliver what was bought only when the status is `paid`.** The `openInvoice` callback alone is not proof of payment.

## What you get

| File | Purpose |
|---|---|
| `tgcloud/lib/stars.js` | Items for sale, settings, payment hook, `/paysupport`, `/refund` |
| `tgcloud/handlers/pre_checkout_query.js` | Approves or rejects each payment |
| `tgcloud/endpoints/starsCatalog.js` | Lists the items |
| `tgcloud/endpoints/createStarsInvoice.js` | Creates the purchase and the invoice link |
| `tgcloud/endpoints/getStarsPurchase.js` | The caller's purchase status |
| `web/recipes/stars-payments.js` | The "Pay with Telegram Stars" card |
| `tgcloud/schema.js` | `stars_purchases` table appended |
| `tgcloud/lib/extensions.js`, `web/features.js` | Registrations |

Bot commands:
- `/paysupport` is required for bots that take payments. It replies with `starsSettings.supportText` and forwards the user's text to the admin.
- `/refund SP-XXXXXXXXXX` is admin only. It calls `refundStarPayment` and tells the user.

## Setup

1. Edit `starsItems` in `tgcloud/lib/stars.js`: `title` is 1–32 characters, `description` is 1–255, and `stars` is a whole number.
2. Set `adminChatId` in `tgcloud/lib/config.js`. Refunds and alerts need it.
3. Deploy:

```bash
npx tgcloud push
npx tgcloud migrate
npx tgcloud webhook
```

This recipe adds a new handler type, `pre_checkout_query`. `npx tgcloud webhook` must report the webhook **in sync**. If it doesn't, run `npx tgcloud webhook sync`.

## Delivering the goods

Put your delivery logic in `onSuccessfulPayment`, after the purchase is marked `paid`: unlock a feature, add credits, send a file. Look up the item with `findStarsItem(purchase.itemId)`.

## Test

- Payments in Stars cost real Stars. The demo item costs 1 Star, and you can refund it with `/refund`.
- Telegram also has a separate test environment for payments: https://core.telegram.org/bots/features#testing-your-bot
- Check every step:
  1. Buy. The card shows "Paid".
  2. The bot messages you.
  3. The admin is notified.
  4. `/refund <reference>` returns the Star.

Docs: https://core.telegram.org/bots/payments-stars
