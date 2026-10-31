// In-memory stand-in for `sdk/db` (schema DSL + operators). Test-only.

function column() {
  const c = { __default: undefined, __unique: false };
  const chain = new Proxy(c, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'default') return (v) => { target.__default = v; return chain; };
      if (prop === 'unique') return () => { target.__unique = true; return chain; };
      return () => chain; // primaryKey, notNull, deprecated, ...
    },
  });
  return chain;
}

export const integer = () => column();
export const text = () => column();
export const real = () => column();
export const boolean = () => column();
export const json = () => column();
export const index = () => ({ on: () => ({ where: () => ({}) }) });
export const uniqueIndex = () => ({ on: () => ({}) });

export function sql(strings, ...values) { return { __sql: true, strings: [...strings], values }; }

export function table(name, columns) {
  const t = { __name: name, __unique: [] };
  for (const [key, col] of Object.entries(columns)) {
    col.key = key;
    t[key] = col;
    if (col.__unique) t.__unique.push(key);
  }
  t.__defaults = () => {
    const d = {};
    for (const [key, col] of Object.entries(columns)) {
      if (col.__default !== undefined) d[key] = col.__default?.__sql ? new Date() : col.__default;
    }
    return d;
  };
  return t;
}

export const eq = (col, v) => (row) => row[col.key] === v;
export const ne = (col, v) => (row) => row[col.key] !== v;
export const inArray = (col, arr) => (row) => arr.includes(row[col.key]);
export const and = (...ps) => (row) => ps.every((p) => typeof p === 'function' && p(row));
export const or = (...ps) => (row) => ps.some((p) => typeof p === 'function' && p(row));
export const desc = (col) => ({ key: col.key, dir: 'desc' });
export const asc = (col) => ({ key: col.key, dir: 'asc' });
