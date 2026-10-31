# Recipe: per-user data

The basic pattern behind most apps: each user creates, sees and deletes their own records. The example stores notes. Rename it to tasks, bookings, scores, favourites or whatever your app keeps.

```bash
npm run recipe -- user-data
```

## What you get

- A `notes` table with `userId`, `text` and `createdAt`.
- Endpoints: `listNotes`, `addNote({ text })` and `deleteNote({ id })`.
- A "My notes" card on the home screen.
- Limits: 500 characters per note and 100 notes per user. Change them in `tgcloud/lib/notes.js`.

## How ownership works

Every endpoint takes the owner from `ctx.initData.user.id`, which the platform has already verified. The Mini App never sends a user ID. `deleteNote` deletes a row only when both its `id` and its `userId` match, so one user cannot touch another user's data. Keep this rule when you adapt the recipe.

## Files

| File | Change |
|---|---|
| `tgcloud/schema.js` | `notes` table appended |
| `tgcloud/lib/notes.js` | Added: limits and validation |
| `tgcloud/endpoints/listNotes.js`, `addNote.js`, `deleteNote.js` | Added |
| `web/recipes/user-data.js` | Added: the card |
| `web/features.js` | Registers the card |

## Setup

```bash
npx tgcloud push
npx tgcloud migrate
```

## Adapting it

1. Rename the table and columns in `tgcloud/schema.js`, and add the columns you need. New columns are "safe" migrations. Renaming an existing column is a manual one: see the Serverless docs, under Migrations.
2. Update the three endpoints and `lib/notes.js` to match.
3. Change the card in `web/recipes/user-data.js`, or move the UI into your own screens.

## Test

- Add a note, close and reopen the app: the note is still there.
- Delete it.
- Open the app from a second account: it sees an empty list.
- Try on the platform without the UI:

```bash
npx tgcloud run endpoints/addNote '{ text: "hi" }' --ctx '{ initData: { user: { id: 1, first_name: "Ann" } } }'
```
