// ---------------------------------------------------------------------------
// Extension points. Features plug in here instead of editing the handlers.
// `npm run recipe -- <name>` inserts lines above the "--- recipe ... ---"
// markers; keep the markers so more recipes can be added later.
// ---------------------------------------------------------------------------
import { start, help, myid } from './commands.js';
// --- recipe imports ---

// Bot commands: '/name': async (message, args) => {}
export const commands = {
  '/start': start,
  '/help': help,
  '/myid': myid,
  // --- recipe commands ---
};

// Run for every private message before command routing, in order.
// Return true to mark the message as handled.
export const messageHooks = [
  // --- recipe message hooks ---
];

// Run once, the first time a user opens the Mini App: async (userRow) => {}
export const newUserHooks = [
  // --- recipe new user hooks ---
];
