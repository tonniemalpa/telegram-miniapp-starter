# Recipe: admin notifications

Gives the app owner a way to follow and manage the app from the bot chat.

```bash
npm run recipe -- admin-notifications
```

## What you get

- **New user alerts.** The admin gets a message the first time someone opens the Mini App. Turn this off in `adminSettings.notifyNewUsers` once the app is busy.
- **`/stats`.** Total users, new users and active users in the last 24 hours. Admin only.
- **`adminOnly(command)`.** Wrap any command so only the admin can run it. Anyone else gets the "Unknown command" reply, as if it did not exist.
- `notifyAdmin(text)` and `isAdmin(id)` come with the starter, in `tgcloud/lib/notify.js`.

## Files

| File | Change |
|---|---|
| `tgcloud/lib/admin.js` | Added |
| `tgcloud/lib/extensions.js` | Registers `/stats` and the new-user hook |

## Setup

1. Send `/myid` to your bot and put the number in `adminChatId` in `tgcloud/lib/config.js`.
2. Run `npx tgcloud push`.

## Add your own admin command

```js
// tgcloud/lib/admin.js
export const ping = adminOnly(async (message, args) => safeSend(message.chat.id, `pong ${args}`));
```

```js
// tgcloud/lib/extensions.js
import { stats, notifyNewUser, ping } from './admin.js';
// ...
  '/ping': ping,
```

## Test

1. Open the Mini App from a second Telegram account. The admin receives "New user: …".
2. Send `/stats` from the admin account, then from another account. Only the admin gets numbers.
