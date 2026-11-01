// ---------------------------------------------------------------------------
// Minimal TON tools for building and reading jetton (USDT) transfers.
// Pure JavaScript with no imports, because the Serverless runtime has no npm
// packages. tests/usdt.test.js checks the output byte-for-byte against the
// official @ton/core library when it is installed (npm install, then npm test).
// ---------------------------------------------------------------------------

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesToBase64(bytes, urlSafe = false) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63]
      + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=')
      + (i + 2 < bytes.length ? B64[n & 63] : '=');
  }
  return urlSafe ? out.replace(/\+/g, '-').replace(/\//g, '_') : out;
}

export function base64ToBytes(str) {
  const s = String(str).trim().replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  const out = [];
  let buf = 0;
  let bits = 0;
  for (const ch of s) {
    const v = B64.indexOf(ch);
    if (v < 0) throw new Error('Invalid base64');
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buf >> bits) & 0xff);
      buf &= (1 << bits) - 1;
    }
  }
  return Uint8Array.from(out);
}

const hexToBytes = (hex) => Uint8Array.from(hex.match(/../g).map((h) => parseInt(h, 16)));
const bytesToHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();

// CRC-16/XMODEM, used by user-friendly TON addresses.
export function crc16(bytes) {
  let crc = 0;
  for (const b of bytes) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

// CRC-32C, used by bag-of-cells serialization.
const CRC32C_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0x82f63b78 : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();
export function crc32c(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC32C_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---------- addresses ----------

// Accepts raw ("0:ABC…") or user-friendly ("EQ…"/"UQ…") form.
export function parseAddress(input) {
  const s = String(input ?? '').trim();
  const raw = s.match(/^(-?\d+):([0-9a-fA-F]{64})$/);
  if (raw) return { workchain: Number(raw[1]), hash: hexToBytes(raw[2]) };

  if (/^[A-Za-z0-9+/_-]{48}$/.test(s)) {
    const b = base64ToBytes(s);
    if (b.length !== 36) throw new Error('Invalid TON address');
    const crc = crc16(b.subarray(0, 34));
    if (b[34] !== crc >> 8 || b[35] !== (crc & 0xff)) throw new Error('Invalid TON address checksum');
    const tag = b[0] & 0x7f;
    if (tag !== 0x11 && tag !== 0x51) throw new Error('Invalid TON address');
    return { workchain: b[1] > 127 ? b[1] - 256 : b[1], hash: b.slice(2, 34) };
  }
  throw new Error('Invalid TON address');
}

// "0:B113…" (upper-case hex, the form toncenter returns).
export function toRawAddress(input) {
  const a = typeof input === 'string' ? parseAddress(input) : input;
  return `${a.workchain}:${bytesToHex(a.hash)}`;
}

export function toFriendlyAddress(input, { bounceable = true, testOnly = false } = {}) {
  const a = typeof input === 'string' ? parseAddress(input) : input;
  const b = new Uint8Array(36);
  b[0] = (bounceable ? 0x11 : 0x51) | (testOnly ? 0x80 : 0);
  b[1] = a.workchain & 0xff;
  b.set(a.hash, 2);
  const crc = crc16(b.subarray(0, 34));
  b[34] = crc >> 8;
  b[35] = crc & 0xff;
  return bytesToBase64(b, true);
}

export const sameAddress = (a, b) => {
  try { return toRawAddress(a) === toRawAddress(b); } catch { return false; }
};

// ---------- cells ----------

export class CellBuilder {
  constructor() { this.bits = []; this.refs = []; }
  uint(value, n) {
    const v = BigInt(value);
    for (let i = n - 1; i >= 0; i--) this.bits.push(Number((v >> BigInt(i)) & 1n));
    return this;
  }
  bit(b) { this.bits.push(b ? 1 : 0); return this; }
  bytes(arr) { for (const b of arr) this.uint(b, 8); return this; }
  // VarUInteger 16 (Coins): 4-bit byte length, then the value.
  coins(value) {
    const v = BigInt(value);
    if (v < 0n) throw new Error('Negative amount');
    let len = 0;
    for (let t = v; t > 0n; t >>= 8n) len++;
    this.uint(len, 4);
    return len ? this.uint(v, len * 8) : this;
  }
  // addr_std$10 anycast:nothing workchain:int8 hash:bits256
  address(input) {
    const a = typeof input === 'string' ? parseAddress(input) : input;
    return this.uint(0b10, 2).bit(0).uint(a.workchain & 0xff, 8).bytes(a.hash);
  }
  ref(cell) { this.refs.push(cell); return this; }
  end() {
    if (this.bits.length > 1023 || this.refs.length > 4) throw new Error('Cell overflow');
    return { bits: this.bits, refs: this.refs };
  }
}

export const beginCell = () => new CellBuilder();

// Text comment: 32-bit zero opcode followed by UTF-8 text (one cell, up to 123 bytes).
export function commentCell(text) {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length > 123) throw new Error('Comment too long');
  return beginCell().uint(0, 32).bytes(bytes).end();
}

function cellData(cell) {
  const n = cell.bits.length;
  const bits = [...cell.bits];
  if (n % 8) { bits.push(1); while (bits.length % 8) bits.push(0); }   // completion tag
  const data = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    data.push(byte);
  }
  return { d1: cell.refs.length, d2: Math.floor(n / 8) + Math.ceil(n / 8), data };
}

const bytesFor = (n) => Math.max(1, Math.ceil(n.toString(2).length / 8));

// Bag of cells with CRC-32C, no index: the default output of @ton/core toBoc().
export function serializeBoc(root) {
  const cells = [];
  const index = new Map();
  (function visit(c) {
    if (index.has(c)) return;
    index.set(c, cells.length);
    cells.push(c);
    c.refs.forEach(visit);
  })(root);

  const sizeBytes = bytesFor(cells.length);
  const encoded = cells.map((c) => {
    const { d1, d2, data } = cellData(c);
    const refs = c.refs.flatMap((r) => toBytes(index.get(r), sizeBytes));
    return [d1, d2, ...data, ...refs];
  });
  const totSize = encoded.reduce((s, e) => s + e.length, 0);
  const offBytes = bytesFor(totSize);

  const out = [
    0xb5, 0xee, 0x9c, 0x72,
    0x40 | sizeBytes, offBytes,
    ...toBytes(cells.length, sizeBytes), ...toBytes(1, sizeBytes), ...toBytes(0, sizeBytes),
    ...toBytes(totSize, offBytes), ...toBytes(0, sizeBytes),
    ...encoded.flat(),
  ];
  const crc = crc32c(out);
  out.push(crc & 0xff, (crc >>> 8) & 0xff, (crc >>> 16) & 0xff, (crc >>> 24) & 0xff);
  return Uint8Array.from(out);
}

function toBytes(n, size) {
  const out = [];
  for (let i = size - 1; i >= 0; i--) out.push(Math.floor(n / 256 ** i) % 256);
  return out;
}

// Reads a bag of cells (ordinary cells, no index or with index) back into { bits, refs }.
export function parseBoc(input) {
  const b = typeof input === 'string' ? base64ToBytes(input) : input;
  if (b[0] !== 0xb5 || b[1] !== 0xee || b[2] !== 0x9c || b[3] !== 0x72) throw new Error('Not a BOC');
  const hasIdx = (b[4] & 0x80) !== 0;
  const sizeBytes = b[4] & 7;
  const offBytes = b[5];
  let p = 6;
  const read = (n) => { let v = 0; for (let i = 0; i < n; i++) v = v * 256 + b[p++]; return v; };
  const count = read(sizeBytes);
  const roots = read(sizeBytes);
  read(sizeBytes);                       // absent
  read(offBytes);                        // total size
  const rootIdx = [];
  for (let i = 0; i < roots; i++) rootIdx.push(read(sizeBytes));
  if (hasIdx) p += count * offBytes;
  const raw = [];
  for (let i = 0; i < count; i++) {
    const d1 = b[p++];
    const d2 = b[p++];
    const len = Math.ceil(d2 / 2);
    const data = b.slice(p, p + len);
    p += len;
    const bits = [];
    for (const byte of data) for (let j = 7; j >= 0; j--) bits.push((byte >> j) & 1);
    if (d2 % 2) { while (bits.pop() === 0); }            // strip completion tag
    const refs = [];
    for (let r = 0; r < (d1 & 7); r++) refs.push(read(sizeBytes));
    raw.push({ bits, refIdx: refs });
  }
  const cells = raw.map((c) => ({ bits: c.bits, refs: [] }));
  raw.forEach((c, i) => { cells[i].refs = c.refIdx.map((r) => cells[r]); });
  return cells[rootIdx[0]];
}

// Text comment from a cell: 32 zero bits then UTF-8 (continuing into the first ref if present).
export function readComment(cell) {
  if (!cell || cell.bits.length < 32 || cell.bits.slice(0, 32).some((x) => x)) {
    // Either ^Cell: the comment may sit in the first reference.
    if (cell?.refs?.length === 1 && cell.bits.length <= 1) return readComment(cell.refs[0]);
    return null;
  }
  const bytes = [];
  let c = { bits: cell.bits.slice(32), refs: cell.refs };
  while (c) {
    for (let i = 0; i + 8 <= c.bits.length; i += 8) {
      let byte = 0;
      for (let j = 0; j < 8; j++) byte = (byte << 1) | c.bits[i + j];
      bytes.push(byte);
    }
    c = c.refs[0];
  }
  return new TextDecoder().decode(Uint8Array.from(bytes));
}

// TEP-74 jetton transfer body, sent to the PAYER's jetton wallet.
// The comment goes in forward_payload (as a reference) so the receiver's
// transfer carries the order reference.
export function jettonTransferBody({ amount, destination, responseDestination, comment, forwardTonAmount = 1n, queryId = 0n }) {
  return beginCell()
    .uint(0x0f8a7ea5, 32)
    .uint(queryId, 64)
    .coins(amount)
    .address(destination)
    .address(responseDestination)
    .bit(0)                       // no custom_payload
    .coins(forwardTonAmount)      // > 0 so the receiver gets a transfer notification
    .bit(1)                       // forward_payload as a reference
    .ref(commentCell(comment))
    .end();
}

export const jettonTransferPayload = (opts) => bytesToBase64(serializeBoc(jettonTransferBody(opts)));
