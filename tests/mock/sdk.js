// In-memory stand-in for the Telegram Serverless `sdk` module, covering only
// what this project uses, so logic can be tested with plain Node.
// It is NOT the platform: always test on the platform and in Telegram too.

export class EndpointError extends Error {
  constructor(description, parameters) { super(description); this.parameters = parameters; }
}

export class BotApiError extends Error {
  constructor(code, description) { super(description); this.code = code; this.description = description; }
}

// ---- Bot API: every call is recorded; results come from apiResults or defaults ----
export const apiCalls = [];
export const apiResults = {};
const defaults = {
  sendMessage: () => ({ message_id: apiCalls.length }),
  createInvoiceLink: (p) => `https://t.me/$invoice-${p.payload}`,
};
export const api = new Proxy({}, {
  get(_, method) {
    return async (params = {}) => {
      apiCalls.push({ method, params });
      const r = apiResults[method] ?? defaults[method];
      if (r instanceof Error) throw r;
      return typeof r === 'function' ? r(params) : (r ?? true);
    };
  },
});
export const sent = () => apiCalls.filter((c) => c.method === 'sendMessage').map((c) => c.params);

// ---- fetch ----
export let fetchResponse = { status: 200, json: {} };
export function setFetch(json, status = 200) { fetchResponse = { status, json }; }
export const fetchCalls = [];
// setFetch(json) answers every request the same; setFetch((url) => json) answers per URL.
export async function fetch(url, init) {
  fetchCalls.push({ url, init });
  const { status } = fetchResponse;
  const json = typeof fetchResponse.json === 'function' ? fetchResponse.json(String(url)) : fetchResponse.json;
  return { ok: status >= 200 && status < 300, status, statusText: String(status), json: async () => json, text: async () => JSON.stringify(json) };
}

// ---- db ----
const tables = new Map();
function store(t) {
  if (!tables.has(t.__name)) tables.set(t.__name, { rows: [], nextId: 1 });
  return tables.get(t.__name);
}
export function rows(t) { return store(t).rows; }
export function reset() {
  tables.clear(); apiCalls.length = 0; fetchCalls.length = 0;
  for (const k of Object.keys(apiResults)) delete apiResults[k];
  fetchResponse = { status: 200, json: {} };
}

// Supports plain values and the `sql\`${col} + n\`` increment form only.
function evalValue(v, row) {
  if (v && v.__sql) {
    const [col, n] = v.values;
    // sql`${col} + ${n}`
    if (col?.key && typeof n === 'number' && v.strings[1]?.trim() === '+') return (row[col.key] ?? 0) + n;
    // sql`${col} + 1`
    const literal = v.strings[1]?.match(/^\s*\+\s*(\d+)\s*$/);
    if (col?.key && v.values.length === 1 && literal) return (row[col.key] ?? 0) + Number(literal[1]);
    throw new Error('mock db: unsupported sql expression');
  }
  return v;
}
const pred = (p) => (typeof p === 'function' ? p : () => false); // raw sql filters never match in the mock

function query(list, q) {
  let out = list.filter(pred(q.where ?? (() => true)));
  if (q.order) out = [...out].sort((a, b) => (q.order.dir === 'desc' ? -1 : 1) * (a[q.order.key] > b[q.order.key] ? 1 : -1));
  if (q.limit != null) out = out.slice(0, q.limit);
  return out;
}

export const db = {
  insert(t) {
    let values; let returning = false; let upsert = null;
    const b = {
      values(v) { values = v; return b; },
      onConflictDoUpdate(o) { upsert = o; return b; },
      onConflictDoNothing() { upsert = { nothing: true }; return b; },
      returning() { returning = true; return b; },
      async run() {
        const s = store(t);
        const list = Array.isArray(values) ? values : [values];
        const out = [];
        for (const v of list) {
          const row = { ...t.__defaults(), ...v };
          if (row.id == null) row.id = s.nextId++;
          else s.nextId = Math.max(s.nextId, row.id + 1);
          const uniques = ['id', ...t.__unique];
          const clash = s.rows.find((r) => uniques.some((k) => row[k] != null && r[k] === row[k]));
          if (clash) {
            if (upsert?.nothing) continue;
            if (upsert) {
              for (const [k, val] of Object.entries(upsert.set)) clash[k] = evalValue(val, clash);
              out.push(clash);
              continue;
            }
            throw new Error('UNIQUE constraint failed');
          }
          s.rows.push(row);
          out.push(row);
        }
        return returning ? out : { rowsAffected: out.length };
      },
    };
    return b;
  },
  update(t) {
    const q = {}; let changes; let returning = false;
    const b = {
      set(c) { changes = c; return b; },
      where(p) { q.where = p; return b; },
      returning() { returning = true; return b; },
      async run() {
        const hit = query(store(t).rows, q);
        for (const r of hit) for (const [k, v] of Object.entries(changes)) r[k] = evalValue(v, r);
        return returning ? hit : { rowsAffected: hit.length };
      },
    };
    return b;
  },
  delete(t) {
    const q = {};
    const b = {
      where(p) { q.where = p; return b; },
      async run() {
        const s = store(t);
        const hit = new Set(query(s.rows, q));
        s.rows = s.rows.filter((r) => !hit.has(r));
        return { rowsAffected: hit.size };
      },
    };
    return b;
  },
  select() {
    const q = {}; let t;
    const b = {
      from(x) { t = x; return b; },
      where(p) { q.where = p; return b; },
      orderBy(o) { q.order = o; return b; },
      limit(n) { q.limit = n; return b; },
      async all() { return query(store(t).rows, q); },
      async get() { return query(store(t).rows, q)[0] ?? null; },
    };
    return b;
  },
  async $count(t, p) { return query(store(t).rows, { where: p }).length; },
};
