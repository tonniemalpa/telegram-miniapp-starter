import { starsItems } from '../lib/stars.js';

// What can be bought with Stars.
export default async function () {
  return starsItems.map(({ id, title, description, stars }) => ({ id, title, description, stars }));
}
