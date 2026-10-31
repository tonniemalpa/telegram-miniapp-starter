// Tests for the starter itself, against the in-memory SDK mock.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { reset, sent, rows } from 'sdk';
import { config } from '../tgcloud/lib/config.js';
import { users } from '../tgcloud/schema.js';
import getMe from '../tgcloud/endpoints/getMe.js';
import onMessage from '../tgcloud/handlers/message.js';
import { commands } from '../tgcloud/lib/extensions.js';

const ctx = (id = 42) => ({ initData: { user: { id, first_name: 'Ann', username: 'ann_test', language_code: 'en' } } });
const msg = (from, text, type = 'private') => ({ chat: { id: from, type }, from: { id: from }, text });

beforeEach(() => {
  reset();
  config.miniAppUrl = 'https://app1.tgcloud.ai/';
});

test('getMe creates the user on first visit, then counts visits', async () => {
  const first = await getMe({}, ctx());
  assert.equal(first.id, 42);
  assert.equal(first.firstName, 'Ann');
  assert.equal(first.visits, 1);
  const second = await getMe({}, ctx());
  assert.equal(second.visits, 2);
  assert.equal(rows(users).length, 1);
});

test('/start replies with an Open app button pointing at the Mini App', async () => {
  await onMessage(msg(42, '/start'));
  const [m] = sent();
  assert.equal(m.chat_id, 42);
  assert.equal(m.reply_markup.inline_keyboard[0][0].web_app.url, 'https://app1.tgcloud.ai/');
});

test('commands work with @botname and arguments; /myid shows the ID', async () => {
  await onMessage(msg(7, '/myid@my_bot extra'));
  assert.equal(sent()[0].text, 'Your Telegram user ID: 7');
});

test('unknown text gets the open-app reply; group messages are ignored', async () => {
  await onMessage(msg(42, 'hello'));
  assert.ok(sent()[0].reply_markup);
  await onMessage(msg(-100, '/start', 'supergroup'));
  assert.equal(sent().length, 1);
});

test('unconfigured miniAppUrl gives a setup hint instead of a broken button', async () => {
  config.miniAppUrl = 'https://appXXXXXX.tgcloud.ai/';
  await onMessage(msg(42, '/start'));
  assert.match(sent()[0].text, /not configured/);
  assert.equal(sent()[0].reply_markup, undefined);
});

test('built-in commands are registered', () => {
  assert.deepEqual(Object.keys(commands).sort(), ['/help', '/myid', '/start']);
});
