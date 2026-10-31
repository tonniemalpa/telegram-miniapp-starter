// Minimal encoder for a TON text-comment payload, so the Mini App needs no npm packages.
// Produces the same bag-of-cells as @ton/core:
//   beginCell().storeUint(0, 32).storeStringTail(text).endCell().toBoc().toString('base64')
// Supports comments up to 123 bytes (one cell). Order references are ~11 bytes.

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

export function commentBocBytes(text) {
  const textBytes = new TextEncoder().encode(text);
  const data = new Uint8Array(4 + textBytes.length); // 32-bit zero opcode = text comment
  data.set(textBytes, 4);
  if (data.length > 127) throw new Error('Comment too long for a single cell');

  // Cell: descriptor d1 (0 refs, ordinary, level 0), d2 (2 x full bytes), data.
  const cell = new Uint8Array(2 + data.length);
  cell[0] = 0x00;
  cell[1] = data.length * 2;
  cell.set(data, 2);

  const header = [
    0xb5, 0xee, 0x9c, 0x72, // BOC magic
    0x41,                   // has_crc32c, size_bytes = 1
    0x01,                   // offset_bytes = 1
    0x01,                   // cells: 1
    0x01,                   // roots: 1
    0x00,                   // absent: 0
    cell.length,            // total cells size
    0x00,                   // root index
  ];

  const body = new Uint8Array(header.length + cell.length);
  body.set(header, 0);
  body.set(cell, header.length);

  const crc = crc32c(body);
  const out = new Uint8Array(body.length + 4);
  out.set(body, 0);
  out[body.length] = crc & 0xff;           // little-endian
  out[body.length + 1] = (crc >>> 8) & 0xff;
  out[body.length + 2] = (crc >>> 16) & 0xff;
  out[body.length + 3] = (crc >>> 24) & 0xff;
  return out;
}

export function commentPayload(text) {
  let bin = '';
  for (const b of commentBocBytes(text)) bin += String.fromCharCode(b);
  return btoa(bin);
}
