# Telegram Mini App Starter

A starting point for any Telegram Mini App on [Telegram Serverless](https://core.telegram.org/bots/serverless), with [LaPoe](https://lapoe.app) live chat built in.

It runs on Telegram's own servers, so there are no servers to host. You get:

- **Front end.** Plain HTML, CSS and JS that follows Telegram's theme (light and dark) and safe areas. There's no build step.
- **Backend.** An example endpoint that knows which Telegram user is calling it.
- **Database.** A `users` table to build on.
- **Bot.** `/start` with an "Open app" button, plus `/myid`.
- **Support.** LaPoe live chat behind the Support button.
- **Recipes.** One-command features: Telegram Stars payments, TON payments, per-user data, and admin notifications.
- **Tests.** They run locally with `npm test`.

Building with AI? Point your AI at [`AGENTS.md`](AGENTS.md).

## What you need

- A computer with [Node.js](https://nodejs.org) 18 or newer. Running the tests needs Node 20.6 or newer.
- A Telegram bot. Create one with [@BotFather](https://t.me/BotFather) using `/newbot`.
- A free [LaPoe](https://lapoe.app) account, for the support chat.

## Setup

Run every command from the **project folder**: the folder that contains `package.json`.

**1. Get your copy.** Pick one:

- **With git.** On GitHub click **Use this template** → **Create a new repository**, then:

  ```bash
  git clone https://github.com/<you>/<your-repo>.git
  cd <your-repo>
  ```

- **Without git.** Click **Code** → **Download ZIP** and unzip it. The unzipped folder contains another folder, `telegram-miniapp-starter-main`. That inner folder is the project folder: open your terminal there.

Then install:

```bash
npm install
```

**2. Turn on Serverless.** Serverless is in the **BotFather app**, not in the `/mybots` chat menu. Open [@BotFather](https://t.me/BotFather), tap its **Open** button, choose your bot, then **Serverless**, and switch it on. Then open **CLI Access** and copy the access token. It looks like `app<id>:<secret>` and is not your bot token. Keep it private.

Use a bot made for this app only. `push` replaces everything in that bot's Serverless project.

**3. Link the project to your bot.**

```bash
npx tgcloud init     # adds the official SDK docs; never overwrites existing files
npx tgcloud login    # paste the CLI access token when asked
```

**4. Deploy.**

```bash
npx tgcloud push     # prints your app address, e.g. https://app123456.tgcloud.ai/
npx tgcloud migrate  # creates the users table (confirm when asked)
```

**5. Configure.** Send `/myid` to your bot to get your numeric ID. In `tgcloud/lib/config.js`, set:

- `miniAppUrl`: the address from step 4
- `appName`: your app's name
- `adminChatId`: your ID, as a plain number with no quotes

Check that no `XXXXXX` or placeholder text is left, then deploy again:

```bash
npx tgcloud push
```

**6. Open it from the bot.** In @BotFather, send `/mybots`, choose your bot, then **Bot Settings** → **Configure Mini App** (or **Menu Button**), and set the URL to the same address. Send `/start` to your bot: it should reply "Welcome to …" with an **Open app** button. Tap it. You should see "Hello, <your name>".

**7. Connect LaPoe.**

1. In your LaPoe dashboard, open the Mini App section and copy the snippet: `<script src="https://lapoe.app/widget.js" data-lapoe-key="lp_..." defer></script>`.
2. Paste it into `web/index.html`, on the line under `LaPoe live chat`.
3. In the dashboard, add your app address (`https://app<id>.tgcloud.ai`) to the allowed domains.
4. Run `npx tgcloud push`.

Open the app: a chat button appears, and **Support** opens the same chat.

Edit files in a code editor such as VS Code, and keep them saved as UTF-8. Creating files with PowerShell `echo` or `Set-Content` can break emoji and special characters.

## Add features with recipes

```bash
npm run recipe -- --list
npm run recipe -- user-data
```

| Recipe | Adds |
|---|---|
| `user-data` | Per-user records: save, list, delete |
| `stars-payments` | Sell digital goods for Telegram Stars |
| `ton-payments` | TON payments with TON Connect, verified on-chain |
| `admin-notifications` | New-user alerts, `/stats`, admin-only commands |

Each recipe prints its next steps, usually `npx tgcloud push` and `npx tgcloud migrate`. See [`recipes/`](recipes/README.md).

## Project layout

```
web/                     Front end, deployed as-is by `tgcloud push`
  index.html             Page shell
  app.js                 Loads the user, mounts feature cards
  api.js                 call(endpoint, input) and errorText(err)
  features.js            Feature cards on the home screen (recipes register here)
  lapoe.js               Support button (the LaPoe snippet goes in index.html)
  styles.css             Telegram theme colours and shared styles
tgcloud/                 Everything Serverless runs
  schema.js              Database tables
  handlers/message.js    All bot messages (routes to commands)
  endpoints/getMe.js     Example endpoint
  lib/config.js          App settings
  lib/extensions.js      Bot commands and hooks (recipes register here)
  lib/commands.js        /start, /help, /myid
  lib/users.js           Records users and visits
  lib/notify.js          safeSend, notifyAdmin, isAdmin
recipes/                 Ready-made features (not deployed)
scripts/add-recipe.js    The recipe installer
tests/                   npm test, with a local mock of the platform SDK
```

## Everyday commands

```bash
npx tgcloud status    # what changed since the last deploy
npx tgcloud push      # deploy code and web/
npx tgcloud migrate   # apply database changes
npx tgcloud run endpoints/getMe '{}' --ctx '{ initData: { user: { id: 1, first_name: "Ann" } } }'
npm test              # local tests
```

## Example app

[Stars Mrkt](https://github.com/tonniemalpa/stars-mrkt) is a full demo built the same way: buy Telegram Stars, pay with TON on testnet, with LaPoe support.

## Troubleshooting

- **"Open this app from its bot inside Telegram".** The page was opened in a normal browser. Endpoints only work inside Telegram.
- **The bot doesn't answer.** Run `npx tgcloud webhook`. If it's out of sync, run `npx tgcloud webhook sync`.
- **The page shows old content after a change.** Run `npx tgcloud push` again and reopen the app.
- **A database error after a schema change.** Run `npx tgcloud migrate`.
