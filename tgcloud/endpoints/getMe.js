import { touchUser } from '../lib/users.js';

// Called by the Mini App on open. ctx.initData is verified by the platform,
// so ctx.initData.user really is the person using the app.
export default async function (input, ctx) {
  const user = await touchUser(ctx.initData.user);
  return {
    id: user.id,
    firstName: user.firstName,
    username: user.username,
    visits: user.visits,
    memberSince: user.createdAt ?? null,
  };
}
