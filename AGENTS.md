# AGENTS.md

Guide for AI assistants and coding agents building a Telegram Mini App from this starter. Read it all before changing code.

## Read these first

1. `README.md`: setup steps for people.
2. `docs/tgcloud-sdk.md`: the official SDK reference, created by `npx tgcloud init`.
3. Telegram Serverless: https://core.telegram.org/bots/serverless.md
4. Telegram Mini Apps: https://core.telegram.org/bots/webapps.md
5. Bot API, for any `api.<method>` call: https://core.telegram.org/bots/api
6. LaPoe: https://lapoe.app/docs

Do not invent commands, APIs or options. If the docs don't answer something, say so and ask the user.

## Platform rules (Telegram Serverless)

- **What deploys.** Only `.js` files in `tgcloud/schema.js`, `tgcloud/lib/` (may nest), `tgcloud/handlers/` (flat) and `tgcloud/endpoints/` (flat) deploy as backend code. `web/` deploys as the static front end, as configured in `tgcloud.jsonc`. Nothing else deploys.
- **Imports.** Backend code may import only `sdk`, `sdk/db`, `sdk/api` and `sdk/fetch`, plus project files by **relative path ending in `.js`**. There are no npm packages and no filesystem, and the network is reached only through the SDK's `fetch`.
- **Database.** Every `db` call is async, so always `await` it. There are no foreign keys: relate rows with plain columns such as `userId`.
- **Deploy and migrate.** `npx tgcloud push` deploys code and `web/` but never changes the database. Run `npx tgcloud migrate` after editing `schema.js`. Deleting a table or column from `schema.js` does not drop it: mark it `.deprecated('reason')`, then migrate.
- **Handlers.** `handlers/<update_type>.js` receives that update's payload. Adding a new handler type can leave the webhook out of sync. Check with `npx tgcloud webhook`, and fix with `npx tgcloud webhook sync`.
- **Endpoints.** Endpoints receive `(input, ctx)`. `ctx.initData` is **already verified by the platform**, and `ctx.initData.user` is the caller. Never write your own initData check, and never trust a user ID or price sent by the client. Refuse a call with `throw new EndpointError(message, { code })`.
- **Calling endpoints.** The front end calls them with `call(name, input)` from `web/api.js`, which wraps `Telegram.WebApp.Serverless.call`.
- **Build step.** `web/` has no build step. If you add a bundler, point `static.source` at its output and build before every push, because `push` never builds.
- **Framing.** Do not add `X-Frame-Options` or a restrictive `frame-ancestors`: Telegram Web runs Mini Apps in an iframe.

## How this starter is organised

| Do this | Where |
|---|---|
| Add a screen or UI | `web/`. Small features: a card module registered in `web/features.js`. Bigger apps: replace the home screen in `index.html` and `app.js` |
| Add an endpoint | `tgcloud/endpoints/<name>.js`, default export `async (input, ctx)` |
| Add a table | `tgcloud/schema.js`, then push and migrate |
| Add a bot command | A function in `tgcloud/lib/`, registered in `commands` in `tgcloud/lib/extensions.js` |
| React to special messages (payments, files…) | `messageHooks` in `tgcloud/lib/extensions.js` |
| Do something when a user first opens the app | `newUserHooks` in `tgcloud/lib/extensions.js` |
| Settings | `tgcloud/lib/config.js`, committed, so no secrets |
| Message users or the owner | `safeSend`, `notifyAdmin` and `isAdmin` in `tgcloud/lib/notify.js` |

Keep the `--- recipe ... ---` marker comments: the recipe installer uses them.

Avoid import cycles. `lib/users.js` imports `lib/extensions.js`, so modules registered in `extensions.js` must not import `lib/users.js`.

## Recipes

Before writing a feature, check `recipes/`. If one fits, run `npm run recipe -- <name>` and follow its README:

- `user-data`: per-user records with ownership checks. This is the base pattern for most apps.
- `stars-payments`: charge users in Telegram Stars. Telegram requires Stars for digital goods and services sold inside bots and Mini Apps.
- `ton-payments`: TON Connect payments verified on-chain, testnet by default.
- `admin-notifications`: new-user alerts, `/stats`, `adminOnly()`.

Adapt a recipe after adding it: rename tables and labels to fit the user's idea, and remove what isn't needed.

**Build what the user asked for.** Never swap their feature for a different one because a recipe exists. Payments are the main case: use the method their idea names (Stars, TON, USDT…). If a Telegram rule may affect it, explain the rule and let the user decide. For example, an app that *sells* Telegram Stars cannot charge in Stars, and USDT on TON needs a jetton transfer, which no recipe covers yet. Never change the idea silently.

## LaPoe live chat (keep it working)

- The user pastes the snippet from the **Mini App section of their LaPoe dashboard** (https://lapoe.app) into `web/index.html`, on the line under the `LaPoe live chat` comment. The snippet looks like `<script src="https://lapoe.app/widget.js" data-lapoe-key="lp_..." defer></script>`. Never make them dig out the key. If you can't see the dashboard, ask them to paste the snippet. Never ask for their password.
- The widget exposes `window.LaPoe.open()`, `close()` and `reset()`, and shows its own floating chat button. The Support button calls `openSupport()` in `web/lapoe.js`. Keep a visible way to reach support in every layout, and don't cover the floating button with fixed bottom bars.
- The app address (`https://app<id>.tgcloud.ai`) must be added to the allowed domains in the LaPoe dashboard. With or without `https://` both work.
- Suggest that the user add their app's FAQ to LaPoe Knowledge, so the chat gives real answers.
- Test inside Telegram: the chat opens, a message sends, LaPoe replies, and the app keeps working.

## How to work with the user

1. Understand their idea. Ask only the questions that change the build.
2. Get the starter running first, by following `README.md`: deployed, opened from the bot, "Hello, <name>" showing, and LaPoe answering. Fix setup problems before writing features.
3. Plan: which screens, endpoints, tables, commands and recipes. Agree the plan with the user.
4. Build in small stages. After each one, deploy, then test with `npx tgcloud run` and inside Telegram.
5. Finish with a full test in Telegram, and list honestly anything that wasn't tested.

The user does some steps by hand, because an agent can't: everything in @BotFather (Serverless switch, CLI token, Mini App URL), the LaPoe dashboard, and tests on their phone. Give exact instructions for those and wait for the result.

## Code and UI quality

- Give or write **complete files**, not fragments, and state the exact path and whether the file is new or replaced.
- Front end: reuse `web/styles.css` (`card`, `primary`, `secondary`, `small`, `list`, `row`, `stack`, `muted`, `error`, `success`). Never leave unstyled default buttons. Follow Telegram theme variables so light and dark mode both work. Every action shows loading, success and error states.
- Use `textContent` for user or server data, never `innerHTML` with it.
- Files must be UTF-8. Tell users to edit in a code editor such as VS Code, never to create code files with PowerShell `echo`, `>` or `Set-Content`, which can turn emoji into `?`.
- Backend errors to show to users: `throw new EndpointError(message, { code })` with `EndpointError` imported from `sdk`. There is no `sdk/errors`.

## Testing

- `npm test` runs locally against an in-memory mock of the SDK (`tests/mock/`). The mock only covers what this project uses and is not the platform. Extend the tests when you add logic.
- Try a module on the platform without deploying:
  `npx tgcloud run endpoints/<name> '{...}' --ctx '{ initData: { user: { id: 1, first_name: "Ann" } } }'`
- A test that passes in a normal browser does not prove the app works in Telegram. Always test in Telegram.

## Security

- The owner comes from `ctx.initData.user.id`. Filter every read and write of user data by it.
- Prices, items and permissions come from server config, never from the client.
- Never put tokens, seed phrases, private keys or API secrets in the repo, in `web/`, or in logs. The CLI token belongs in `npx tgcloud login`, or in the `TGCLOUD_TOKEN` environment variable in CI.
- Deliver paid goods only after the server has recorded the payment.
