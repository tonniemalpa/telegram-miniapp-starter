// Encoding checks for the usdt-payments recipe (recipes/usdt-payments/files/tgcloud/lib/ton-cells.js).
// The last group compares byte-for-byte with the official @ton/core library and
// runs only when it is installed (npm install).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as t from '../recipes/usdt-payments/files/tgcloud/lib/ton-cells.js';

const USDT = 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs';
const USDT_RAW = '0:B113A994B5024A16719F69139328EB759596C38A25F59028B146FECDC3621DFE'; // as toncenter returns it

let core = null;
try { core = await import('@ton/core'); } catch { /* not installed: cross-checks are skipped */ }

test('addresses: friendly <-> raw matches toncenter for the USDT master', () => {
  assert.equal(t.toRawAddress(USDT), USDT_RAW);
  assert.equal(t.toFriendlyAddress(USDT_RAW), USDT);
  assert.equal(t.toRawAddress(USDT_RAW.toLowerCase()), USDT_RAW);
  const nonBounce = t.toFriendlyAddress(USDT_RAW, { bounceable: false });
  assert.match(nonBounce, /^UQ/);
  assert.equal(t.toRawAddress(nonBounce), USDT_RAW);
  assert.match(t.toFriendlyAddress(USDT_RAW, { testOnly: true }), /^kQ/);
  assert.ok(t.sameAddress(USDT, USDT_RAW));
});

test('addresses: bad input is rejected', () => {
  assert.throws(() => t.parseAddress(USDT.slice(0, -1) + 't'), /checksum/);
  assert.throws(() => t.parseAddress('not an address'));
  assert.throws(() => t.parseAddress('0:1234'));
  assert.equal(t.sameAddress('junk', USDT), false);
});

test('base64 and checksums', () => {
  const bytes = Uint8Array.from({ length: 50 }, (_, i) => (i * 37) & 0xff);
  for (let n = 0; n < 50; n++) {
    const b = bytes.slice(0, n);
    assert.deepEqual([...t.base64ToBytes(t.bytesToBase64(b))], [...b]);
    assert.equal(t.bytesToBase64(b), Buffer.from(b).toString('base64'));
    assert.equal(t.bytesToBase64(b, true), Buffer.from(b).toString('base64url') + '='.repeat((3 - (n % 3)) % 3));
  }
  assert.equal(t.crc32c(new TextEncoder().encode('123456789')), 0xe3069283);
  assert.equal(t.crc16(new TextEncoder().encode('123456789')), 0x31c3);   // CRC-16/XMODEM check value
});

test('coins encoding (VarUInteger 16)', () => {
  const bits = (v) => t.beginCell().coins(v).end().bits.join('');
  assert.equal(bits(0), '0000');
  assert.equal(bits(1), '0001' + '00000001');
  assert.equal(bits(10000), '0010' + (10000).toString(2).padStart(16, '0'));
  assert.throws(() => t.beginCell().coins(-1));
});

test('jetton transfer payload: structure round-trips', () => {
  const payer = t.toFriendlyAddress('0:' + 'AB'.repeat(32), { bounceable: false });
  const p = t.jettonTransferPayload({ amount: 10000n, destination: USDT, responseDestination: payer, comment: 'UP-7K2Q9XWD' });
  assert.ok(p.startsWith('te6cck'), 'BOC with CRC-32C');
  const root = t.parseBoc(p);
  const bitsToInt = (bits) => BigInt('0b' + (bits.join('') || '0'));
  assert.equal(bitsToInt(root.bits.slice(0, 32)), 0x0f8a7ea5n, 'transfer opcode');
  assert.equal(root.refs.length, 1, 'comment in a reference');
  assert.equal(t.readComment(root.refs[0]), 'UP-7K2Q9XWD');
  assert.equal(root.bits.at(-1), 1, 'forward_payload stored as a reference');
  // amount: after op (32) + query id (64) comes the 4-bit length then the value
  const len = Number(bitsToInt(root.bits.slice(96, 100)));
  assert.equal(bitsToInt(root.bits.slice(100, 100 + len * 8)), 10000n);
});

test('comment reader handles inline and referenced comments, rejects others', () => {
  const cell = t.commentCell('hello');
  assert.equal(t.readComment(cell), 'hello');
  assert.equal(t.readComment({ bits: [1], refs: [cell] }), 'hello');
  assert.equal(t.readComment(t.beginCell().uint(1, 32).end()), null);
  assert.equal(t.readComment(t.parseBoc(t.bytesToBase64(t.serializeBoc(cell)))), 'hello');
});

// ---------- official library cross-check ----------

const cross = { skip: core ? false : 'install dev dependencies (npm install) to compare with @ton/core' };

test('matches @ton/core: addresses', cross, () => {
  const { Address } = core;
  for (const a of [USDT, USDT_RAW, '-1:' + '3'.repeat(64), '0:' + 'ff'.repeat(32)]) {
    const ref = Address.parse(a);
    assert.equal(t.toRawAddress(a), ref.toRawString().toUpperCase().replace(/^(-?\d+):/, '$1:'));
    for (const bounceable of [true, false]) for (const testOnly of [true, false]) {
      assert.equal(t.toFriendlyAddress(a, { bounceable, testOnly }), ref.toString({ bounceable, testOnly, urlSafe: true }));
    }
  }
});

test('matches @ton/core: jetton transfer payload, byte for byte', cross, () => {
  const { beginCell, Address } = core;
  const payer = '0:' + 'AB'.repeat(32);
  for (const [amount, comment] of [[10000n, 'UP-7K2Q9XWD'], [1n, 'x'], [123456789012n, 'UP-AAAAAAAA'], [0n, '']]) {
    const mine = t.jettonTransferPayload({ amount, destination: USDT, responseDestination: payer, comment });
    const ref = beginCell()
      .storeUint(0x0f8a7ea5, 32)
      .storeUint(0, 64)
      .storeCoins(amount)
      .storeAddress(Address.parse(USDT))
      .storeAddress(Address.parse(payer))
      .storeBit(0)
      .storeCoins(1n)
      .storeBit(1)
      .storeRef(beginCell().storeUint(0, 32).storeStringTail(comment).endCell())
      .endCell()
      .toBoc()
      .toString('base64');
    assert.equal(mine, ref, `amount ${amount}`);
  }
});

test('matches @ton/core: parsing a comment payload it produced', cross, () => {
  const { beginCell } = core;
  const boc = beginCell().storeUint(0, 32).storeStringTail('UP-7K2Q9XWD').endCell().toBoc().toString('base64');
  assert.equal(t.readComment(t.parseBoc(boc)), 'UP-7K2Q9XWD');
});
