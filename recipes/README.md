# Recipes

Ready-made features you can add to the starter with one command. Each one copies its files, adds its tables to `tgcloud/schema.js`, and registers itself at the `--- recipe ... ---` markers. It never overwrites a file you changed, and running it twice does nothing.

```bash
npm run recipe -- --list
npm run recipe -- <name>
```

| Recipe | Adds |
|---|---|
| [`user-data`](user-data/README.md) | Per-user records (notes): save, list, delete, owner-only |
| [`stars-payments`](stars-payments/README.md) | Sell digital goods for Telegram Stars, with `/paysupport` and admin `/refund` |
| [`ton-payments`](ton-payments/README.md) | TON payments with TON Connect, verified on-chain (testnet by default) |
| [`usdt-payments`](usdt-payments/README.md) | USDT on TON payments with TON Connect, verified on-chain (mainnet, real money) |
| [`admin-notifications`](admin-notifications/README.md) | New-user alerts, `/stats`, `adminOnly()` for your own admin commands |

After adding a recipe, follow the "Next steps" it prints. They usually come down to:

```bash
npx tgcloud push
npx tgcloud migrate
```

Each recipe's README explains how it works, so you can adapt it or build your own feature the same way.

## Adding a recipe by hand

If a marker was removed, or you'd rather not use the script, do what `recipe.json` describes:

1. Copy everything under `recipes/<name>/files/` into the project at the same paths.
2. Append `schema-additions.js` to `tgcloud/schema.js`.
3. Add each `insert.text` line above its `insert.marker`.
