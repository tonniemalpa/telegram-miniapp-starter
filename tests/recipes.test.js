// Applies each recipe to a fresh copy of the starter with the real installer
// (scripts/add-recipe.js), then runs its flows against the SDK mock.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { reset, sent, apiCalls, apiResults, setFetch, rows, fetchCalls } from 'sdk';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const RECIPES = ['user-data', 'stars-payments', 'ton-payments', 'usdt-payments', 'admin-notifications'];

function copyStarter() {
  const dir = mkdtempSync(join(tmpdir(), 'starter-'));
  cpSync(ROOT, dir, { recursive: true, filter: (src) => !/[\\/](node_modules|\.git|\.tgcloud)([\\/]|$)/.test(src) });
  return dir;
}
function addRecipe(dir, name) {
  return execFileSync(process.execPath, [join(dir, 'scripts', 'add-recipe.js'), name], { cwd: dir, encoding: 'utf8' });
}
const load = (dir, rel) => import(pathToFileURL(join(dir, rel)).href).then((m) => m.default ?? m);
const loadModule = (dir, rel) => import(pathToFileURL(join(dir, rel)).href);
function jsFiles(dir) {
  return readdirSync(dir).flatMap((e) => {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) return /node_modules|tests|recipes/.test(e) ? [] : jsFiles(full);
    return full.endsWith('.js') ? [full] : [];
  });
}

// One project with every recipe applied, shared by the flow tests below.
const ALL = copyStarter();
for (const r of RECIPES) addRecipe(ALL, r);
const { config } = await loadModule(ALL, 'tgcloud/lib/config.js');
const schema = await loadModule(ALL, 'tgcloud/schema.js');
const onMessage = await load(ALL, 'tgcloud/handlers/message.js');

const ADMIN = 1000;
const BUYER = 42;
const ctx = (id = BUYER) => ({ initData: { user: { id, first_name: 'Ann', username: 'ann_test' } } });
const msg = (from, text, extra = {}) => ({ chat: { id: from, type: 'private' }, from: { id: from }, text, ...extra });

beforeEach(() => {
  reset();
  config.adminChatId = ADMIN;
  config.miniAppUrl = 'https://app1.tgcloud.ai/';
});

// ---------- installer ----------

test('installer: every recipe applies cleanly on its own', () => {
  for (const r of RECIPES) {
    const dir = copyStarter();
    const out = addRecipe(dir, r);
    assert.match(out, new RegExp(`Recipe "${r}": added`));
  }
});

test('installer: running a recipe twice changes nothing', () => {
  const dir = copyStarter();
  addRecipe(dir, 'stars-payments');
  const before = ['tgcloud/schema.js', 'tgcloud/lib/extensions.js', 'web/features.js'].map((f) => readFileSync(join(dir, f), 'utf8'));
  const out = addRecipe(dir, 'stars-payments');
  assert.match(out, /already added, nothing to do/);
  const after = ['tgcloud/schema.js', 'tgcloud/lib/extensions.js', 'web/features.js'].map((f) => readFileSync(join(dir, f), 'utf8'));
  assert.deepEqual(after, before);
});

test('installer: refuses to overwrite a changed file and writes nothing', () => {
  const dir = copyStarter();
  addRecipe(dir, 'user-data');
  const notesPath = join(dir, 'tgcloud/lib/notes.js');
  writeFileSync(notesPath, '// my own version\n');
  const featuresBefore = readFileSync(join(dir, 'web/features.js'), 'utf8');
  assert.throws(() => execFileSync(process.execPath, [join(dir, 'scripts/add-recipe.js'), 'user-data'], { cwd: dir, stdio: 'pipe' }));
  assert.equal(readFileSync(notesPath, 'utf8'), '// my own version\n');
  assert.equal(readFileSync(join(dir, 'web/features.js'), 'utf8'), featuresBefore);
});

test('installer: --list shows all recipes; unknown name fails', () => {
  const out = execFileSync(process.execPath, [join(ROOT, 'scripts/add-recipe.js'), '--list'], { encoding: 'utf8' });
  for (const r of RECIPES) assert.match(out, new RegExp(r));
  assert.throws(() => execFileSync(process.execPath, [join(ROOT, 'scripts/add-recipe.js'), 'nope'], { stdio: 'pipe' }));
});

test('all recipes together: every file parses and everything is registered', async () => {
  for (const f of jsFiles(ALL)) execFileSync(process.execPath, ['--check', f]);
  for (const t of ['users', 'notes', 'starsPurchases', 'tonPayments', 'usdtPayments']) assert.ok(schema[t], `table ${t}`);
  const ext = await loadModule(ALL, 'tgcloud/lib/extensions.js');
  assert.deepEqual(Object.keys(ext.commands).sort(), ['/help', '/myid', '/paysupport', '/refund', '/start', '/stats']);
  assert.equal(ext.messageHooks.length, 1);
  assert.equal(ext.newUserHooks.length, 1);
  const features = readFileSync(join(ALL, 'web/features.js'), 'utf8');
  for (const n of ['userData', 'starsPayments', 'tonPayments', 'usdtPayments']) assert.match(features, new RegExp(`  ${n},`));
  assert.equal((readFileSync(join(ALL, 'web/index.html'), 'utf8').match(/tonconnect-ui\.min\.js/g) || []).length, 1, 'TON Connect script added once');
  assert.match(readFileSync(join(ALL, 'web/index.html'), 'utf8'), /tonconnect-ui\.min\.js/);
  assert.match(readFileSync(join(ALL, 'tgcloud.jsonc'), 'utf8'), /tonconnect-manifest\.json/);
});

// ---------- user-data ----------

test('user-data: add, list, delete; users only see their own notes', async () => {
  const addNote = await load(ALL, 'tgcloud/endpoints/addNote.js');
  const listNotes = await load(ALL, 'tgcloud/endpoints/listNotes.js');
  const deleteNote = await load(ALL, 'tgcloud/endpoints/deleteNote.js');

  const a = await addNote({ text: '  first  ' }, ctx());
  assert.equal(a.text, 'first');
  await addNote({ text: 'second' }, ctx());
  await addNote({ text: 'not yours' }, ctx(7));

  const mine = await listNotes({}, ctx());
  assert.deepEqual(mine.map((n) => n.text), ['second', 'first']);

  await assert.rejects(deleteNote({ id: a.id }, ctx(7)), (e) => e.parameters?.code === 'NOT_FOUND');
  await deleteNote({ id: a.id }, ctx());
  assert.deepEqual((await listNotes({}, ctx())).map((n) => n.text), ['second']);

  await assert.rejects(addNote({ text: '   ' }, ctx()), (e) => e.parameters?.code === 'EMPTY');
  await assert.rejects(addNote({ text: 'x'.repeat(501) }, ctx()), (e) => e.parameters?.code === 'TOO_LONG');
});

// ---------- stars-payments ----------

test('stars-payments: invoice -> pre-checkout -> successful_payment -> refund', async () => {
  const starsCatalog = await load(ALL, 'tgcloud/endpoints/starsCatalog.js');
  const createStarsInvoice = await load(ALL, 'tgcloud/endpoints/createStarsInvoice.js');
  const getStarsPurchase = await load(ALL, 'tgcloud/endpoints/getStarsPurchase.js');
  const preCheckout = await load(ALL, 'tgcloud/handlers/pre_checkout_query.js');

  const [item] = await starsCatalog({}, ctx());
  const { purchaseId, invoiceLink } = await createStarsInvoice({ itemId: item.id }, ctx());
  assert.match(invoiceLink, /^https:\/\/t\.me\//);

  const inv = apiCalls.find((c) => c.method === 'createInvoiceLink').params;
  assert.equal(inv.currency, 'XTR');
  assert.equal(inv.provider_token, '');
  assert.deepEqual(inv.prices, [{ label: item.title, amount: item.stars }]);
  assert.ok(inv.title.length <= 32 && inv.description.length <= 255);
  assert.match(inv.payload, /^SP-[A-Z2-9]{10}$/);

  // Wrong amount and wrong user are rejected; the right one is approved.
  const q = (over) => ({ id: 'q1', from: { id: BUYER }, currency: 'XTR', total_amount: item.stars, invoice_payload: inv.payload, ...over });
  await preCheckout(q({ total_amount: item.stars + 1 }));
  await preCheckout(q({ from: { id: 7 } }));
  await preCheckout(q({ invoice_payload: 'SP-NOPE' }));
  await preCheckout(q());
  const answers = apiCalls.filter((c) => c.method === 'answerPreCheckoutQuery').map((c) => c.params.ok);
  assert.deepEqual(answers, [false, false, false, true]);

  // Payment confirmed by Telegram.
  await onMessage(msg(BUYER, undefined, { successful_payment: {
    currency: 'XTR', total_amount: item.stars, invoice_payload: inv.payload,
    telegram_payment_charge_id: 'CHARGE1', provider_payment_charge_id: '',
  } }));
  const p = await getStarsPurchase({ purchaseId }, ctx());
  assert.equal(p.status, 'paid');
  assert.deepEqual(sent().map((m) => m.chat_id), [BUYER, ADMIN]);

  // Already paid: pre-checkout for the same payload is now refused.
  await preCheckout(q());
  assert.equal(apiCalls.filter((c) => c.method === 'answerPreCheckoutQuery').at(-1).params.ok, false);

  // Only the admin can refund.
  await onMessage(msg(BUYER, `/refund ${p.reference}`));
  assert.equal(apiCalls.filter((c) => c.method === 'refundStarPayment').length, 0);
  await onMessage(msg(ADMIN, `/refund ${p.reference.toLowerCase()}`));
  const refund = apiCalls.find((c) => c.method === 'refundStarPayment').params;
  assert.deepEqual(refund, { user_id: BUYER, telegram_payment_charge_id: 'CHARGE1' });
  assert.equal((await getStarsPurchase({ purchaseId }, ctx())).status, 'refunded');

  // Other users cannot read the purchase.
  await assert.rejects(getStarsPurchase({ purchaseId }, ctx(7)), (e) => e.parameters?.code === 'NOT_FOUND');
});

test('stars-payments: unmatched payment alerts the admin; /paysupport answers', async () => {
  await onMessage(msg(BUYER, undefined, { successful_payment: {
    currency: 'XTR', total_amount: 5, invoice_payload: 'SP-UNKNOWN', telegram_payment_charge_id: 'C9',
  } }));
  assert.equal(sent()[0].chat_id, ADMIN);
  assert.match(sent()[0].text, /Unmatched Stars payment.*C9/);

  await onMessage(msg(BUYER, '/paysupport I was charged twice'));
  assert.equal(sent()[1].chat_id, BUYER);
  assert.match(sent()[2].text, /I was charged twice/);
});

test('stars-payments: failed invoice creation leaves no pending purchase', async () => {
  const createStarsInvoice = await load(ALL, 'tgcloud/endpoints/createStarsInvoice.js');
  apiResults.createInvoiceLink = new Error('Bad Request');
  await assert.rejects(createStarsInvoice({ itemId: 'demo-item' }, ctx()), (e) => e.parameters?.code === 'INVOICE_FAILED');
  assert.equal(rows(schema.starsPurchases).length, 0);
});

// ---------- ton-payments ----------

test('ton-payments: create, not yet paid, paid once, ownership', async () => {
  const ton = await loadModule(ALL, 'tgcloud/lib/ton.js');
  ton.tonSettings.receiverAddress = 'kQRECEIVER';
  const tonCatalog = await load(ALL, 'tgcloud/endpoints/tonCatalog.js');
  const createTonPayment = await load(ALL, 'tgcloud/endpoints/createTonPayment.js');
  const checkTonPayment = await load(ALL, 'tgcloud/endpoints/checkTonPayment.js');

  const cat = await tonCatalog({}, ctx());
  assert.equal(cat.chain, '-3');
  assert.equal(cat.items[0].priceNano, '10000000');

  const pay = await createTonPayment({ itemId: 'demo-item' }, ctx());
  assert.match(pay.reference, /^TP-[A-Z2-9]{8}$/);

  setFetch({ transactions: [] });
  let res = await checkTonPayment({ paymentId: pay.id }, ctx());
  assert.equal(res.payment.status, 'pending');

  setFetch({ transactions: [{ hash: 'TX1', description: { aborted: false }, in_msg: {
    source: '0:payer', value: '10000000', message_content: { decoded: { comment: pay.reference } } } }] });
  res = await checkTonPayment({ paymentId: pay.id }, ctx());
  assert.equal(res.payment.status, 'paid');
  assert.equal(res.payment.txHash, 'TX1');
  await checkTonPayment({ paymentId: pay.id }, ctx());
  assert.deepEqual(sent().map((m) => m.chat_id), [BUYER, ADMIN], 'notified exactly once');

  await assert.rejects(checkTonPayment({ paymentId: pay.id }, ctx(7)), (e) => e.parameters?.code === 'NOT_FOUND');
});

test('ton-payments: matcher rejects wrong comment, underpayment, aborted and external', async () => {
  const { findTonPayment, tonToNano } = await loadModule(ALL, 'tgcloud/lib/ton.js');
  const tx = (over = {}, msgOver = {}) => ({ hash: 'h', description: { aborted: false }, ...over,
    in_msg: { source: '0:a', value: '100', message_content: { decoded: { comment: 'TP-AAAAAAAA' } }, ...msgOver } });
  assert.ok(findTonPayment([tx()], 'TP-AAAAAAAA', '100'));
  assert.ok(findTonPayment([tx({}, { value: '150' })], 'TP-AAAAAAAA', '100'));
  for (const bad of [
    tx({}, { message_content: { decoded: { comment: 'TP-BBBBBBBB' } } }),
    tx({}, { value: '99' }),
    tx({ description: { aborted: true } }),
    tx({}, { source: null }),
    tx({}, { message_content: { decoded: null } }),
  ]) assert.equal(findTonPayment([bad], 'TP-AAAAAAAA', '100'), null);
  assert.equal(tonToNano('0.01'), '10000000');
  assert.throws(() => tonToNano('1e3'));
});

test('ton-payments: refuses when receiver is not configured', async () => {
  const ton = await loadModule(ALL, 'tgcloud/lib/ton.js');
  ton.tonSettings.receiverAddress = 'PASTE_YOUR_TON_WALLET_ADDRESS';
  const createTonPayment = await load(ALL, 'tgcloud/endpoints/createTonPayment.js');
  await assert.rejects(createTonPayment({ itemId: 'demo-item' }, ctx()), (e) => e.parameters?.code === 'NOT_CONFIGURED');
});

test('ton-payments: comment payload is a valid single-cell BOC', async () => {
  const { commentBocBytes, commentPayload, crc32c } = await loadModule(ALL, 'web/lib/boc.js');
  assert.equal(crc32c(new TextEncoder().encode('123456789')), 0xe3069283);  // CRC-32C check value
  const bytes = commentBocBytes('TP-7K2Q9XWD');
  const body = bytes.slice(0, -4);
  const crc = bytes.at(-4) | (bytes.at(-3) << 8) | (bytes.at(-2) << 16) | (bytes.at(-1) << 24);
  assert.equal(crc >>> 0, crc32c(body));
  assert.deepEqual([...bytes.slice(0, 4)], [0xb5, 0xee, 0x9c, 0x72]);
  assert.deepEqual([...bytes.slice(13, 17)], [0, 0, 0, 0], 'text comment opcode');
  assert.equal(new TextDecoder().decode(bytes.slice(17, -4)), 'TP-7K2Q9XWD');
  assert.ok(commentPayload('TP-7K2Q9XWD').startsWith('te6cckEBAQEA'));
});

// ---------- admin-notifications ----------

test('admin-notifications: new user alert once; /stats admin only', async () => {
  const getMe = await load(ALL, 'tgcloud/endpoints/getMe.js');
  await getMe({}, ctx());
  await getMe({}, ctx());
  const alerts = sent().filter((m) => m.chat_id === ADMIN);
  assert.equal(alerts.length, 1);
  assert.match(alerts[0].text, /New user: Ann @ann_test \(id 42\)/);

  await onMessage(msg(BUYER, '/stats'));
  assert.ok(sent().at(-1).reply_markup, 'non-admin gets the normal reply');
  await onMessage(msg(ADMIN, '/stats'));
  assert.match(sent().at(-1).text, /^Users: 1/);
});

// ---------- usdt-payments ----------

const USDT_RAW = '0:B113A994B5024A16719F69139328EB759596C38A25F59028B146FECDC3621DFE';
const RECEIVER_RAW = '0:' + '11'.repeat(32);
const PAYER_RAW = '0:' + '22'.repeat(32);
const PAYER_JW_RAW = '0:' + '33'.repeat(32);

async function usdtSetup() {
  const usdt = await loadModule(ALL, 'tgcloud/lib/usdt.js');
  const cells = await loadModule(ALL, 'tgcloud/lib/ton-cells.js');
  usdt.usdtSettings.receiverAddress = cells.toFriendlyAddress(RECEIVER_RAW, { bounceable: false });
  return { usdt, cells };
}

test('usdt-payments: create builds a real transfer; paid once after the transfer appears', async () => {
  const { cells } = await usdtSetup();
  const usdtCatalog = await load(ALL, 'tgcloud/endpoints/usdtCatalog.js');
  const createUsdtPayment = await load(ALL, 'tgcloud/endpoints/createUsdtPayment.js');
  const checkUsdtPayment = await load(ALL, 'tgcloud/endpoints/checkUsdtPayment.js');

  const cat = await usdtCatalog({}, ctx());
  assert.equal(cat.network, 'mainnet');
  assert.equal(cat.chain, '-239');
  assert.deepEqual(cat.items[0], { id: 'demo-item', title: 'Demo item', units: '10000' });

  let transfers = [];
  setFetch((url) => url.includes('/jetton/wallets')
    ? { jetton_wallets: [{ address: PAYER_JW_RAW, balance: '50000', owner: PAYER_RAW, jetton: USDT_RAW }] }
    : { jetton_transfers: transfers });

  const { payment, message } = await createUsdtPayment({ itemId: 'demo-item', payerAddress: PAYER_RAW }, ctx());
  assert.match(payment.reference, /^UP-[A-Z2-9]{8}$/);
  assert.equal(payment.units, '10000');

  // The wallet lookup asked for the payer's wallet of the official USDT token.
  const lookup = new URL(fetchCalls[0].url);
  assert.equal(lookup.pathname, '/api/v3/jetton/wallets');
  assert.equal(lookup.searchParams.get('owner_address'), PAYER_RAW);
  assert.equal(cells.toRawAddress(lookup.searchParams.get('jetton_address')), USDT_RAW);

  // The message goes to the payer's jetton wallet with 0.05 TON for fees,
  // and its body sends 10000 units to the receiver with the reference.
  assert.equal(cells.toRawAddress(message.address), PAYER_JW_RAW);
  assert.match(message.address, /^EQ/, 'bounceable mainnet form');
  assert.equal(message.amount, '50000000');
  const body = cells.parseBoc(message.payload);
  assert.equal(cells.readComment(body.refs[0]), payment.reference);

  // Not on-chain yet.
  let res = await checkUsdtPayment({ paymentId: payment.id }, ctx());
  assert.equal(res.payment.status, 'pending');
  const q = new URL(fetchCalls.at(-1).url);
  assert.equal(q.pathname, '/api/v3/jetton/transfers');
  assert.equal(q.searchParams.get('direction'), 'in');

  // A fake token with the right comment must not count; the real one does.
  const transfer = (over) => ({
    transaction_hash: 'TXU1', transaction_aborted: false, jetton_master: USDT_RAW,
    source: PAYER_RAW, destination: RECEIVER_RAW, amount: '10000',
    decoded_forward_payload: { type: 'text_comment', comment: payment.reference }, ...over,
  });
  transfers = [transfer({ jetton_master: '0:' + '99'.repeat(32), transaction_hash: 'FAKE' })];
  res = await checkUsdtPayment({ paymentId: payment.id }, ctx());
  assert.equal(res.payment.status, 'pending', 'fake token ignored');

  transfers.push(transfer());
  res = await checkUsdtPayment({ paymentId: payment.id }, ctx());
  assert.equal(res.payment.status, 'paid');
  assert.equal(res.payment.txHash, 'TXU1');
  await checkUsdtPayment({ paymentId: payment.id }, ctx());
  assert.deepEqual(sent().map((m) => m.chat_id), [BUYER, ADMIN], 'notified exactly once');

  await assert.rejects(checkUsdtPayment({ paymentId: payment.id }, ctx(7)), (e) => e.parameters?.code === 'NOT_FOUND');
});

test('usdt-payments: matcher checks token, receiver, amount, comment and abort', async () => {
  const { usdt, cells } = await usdtSetup();
  const ref = 'UP-AAAAAAAA';
  const args = { reference: ref, units: '10000', jettonMaster: usdt.usdtSettings.jettonMaster, receiver: RECEIVER_RAW };
  const ok = { transaction_hash: 'h', transaction_aborted: false, jetton_master: USDT_RAW, destination: RECEIVER_RAW, amount: '10000', decoded_forward_payload: { comment: ref } };
  assert.ok(usdt.findUsdtPayment([ok], args));
  assert.ok(usdt.findUsdtPayment([{ ...ok, amount: '20000' }], args), 'overpayment accepted');
  // Comment only in the raw forward_payload (no decoded field) still works.
  const rawPayload = cells.bytesToBase64(cells.serializeBoc(cells.commentCell(ref)));
  assert.ok(usdt.findUsdtPayment([{ ...ok, decoded_forward_payload: undefined, forward_payload: rawPayload }], args));
  for (const bad of [
    { ...ok, jetton_master: '0:' + '99'.repeat(32) },
    { ...ok, destination: '0:' + '44'.repeat(32) },
    { ...ok, amount: '9999' },
    { ...ok, transaction_aborted: true },
    { ...ok, decoded_forward_payload: { comment: 'UP-BBBBBBBB' } },
    { ...ok, decoded_forward_payload: null, forward_payload: null },
  ]) assert.equal(usdt.findUsdtPayment([bad], args), null);
  assert.equal(usdt.toUnits('0.01', 6), '10000');
  assert.equal(usdt.toUnits('12.345678', 6), '12345678');
  assert.throws(() => usdt.toUnits('0.0000001', 6));
  assert.equal(usdt.formatUnits('10000', 6), '0.01');
});

test('usdt-payments: refuses missing USDT, low balance, bad address, unconfigured', async () => {
  const { usdt } = await usdtSetup();
  const createUsdtPayment = await load(ALL, 'tgcloud/endpoints/createUsdtPayment.js');
  setFetch({ jetton_wallets: [] });
  await assert.rejects(createUsdtPayment({ itemId: 'demo-item', payerAddress: PAYER_RAW }, ctx()), (e) => e.parameters?.code === 'NO_USDT');
  setFetch({ jetton_wallets: [{ address: PAYER_JW_RAW, balance: '9999' }] });
  await assert.rejects(createUsdtPayment({ itemId: 'demo-item', payerAddress: PAYER_RAW }, ctx()), (e) => e.parameters?.code === 'NOT_ENOUGH_USDT');
  await assert.rejects(createUsdtPayment({ itemId: 'demo-item', payerAddress: 'nope' }, ctx()), (e) => e.parameters?.code === 'BAD_ADDRESS');
  setFetch({}, 500);
  await assert.rejects(createUsdtPayment({ itemId: 'demo-item', payerAddress: PAYER_RAW }, ctx()), (e) => e.parameters?.code === 'NETWORK');
  assert.equal(rows(schema.usdtPayments).length, 0, 'no pending rows left behind');
  usdt.usdtSettings.receiverAddress = 'PASTE_YOUR_TON_WALLET_ADDRESS';
  await assert.rejects(createUsdtPayment({ itemId: 'demo-item', payerAddress: PAYER_RAW }, ctx()), (e) => e.parameters?.code === 'NOT_CONFIGURED');
});
