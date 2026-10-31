#!/usr/bin/env node
// Adds a recipe to this project.
//
//   npm run recipe -- --list          list available recipes
//   npm run recipe -- <name>          add one, e.g. npm run recipe -- stars-payments
//
// What it does, all or nothing:
//   1. copies recipes/<name>/files/** into the project (never overwrites a different file)
//   2. appends recipes/<name>/schema-additions.js to tgcloud/schema.js (if present)
//   3. inserts the lines from recipe.json "insert" above the matching
//      "--- recipe ... ---" markers in the project files
// Running it again for the same recipe changes nothing.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const recipesDir = join(root, 'recipes');

function listRecipes() {
  return readdirSync(recipesDir)
    .filter((d) => existsSync(join(recipesDir, d, 'recipe.json')))
    .map((d) => ({ name: d, ...JSON.parse(readFileSync(join(recipesDir, d, 'recipe.json'), 'utf8')) }));
}

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function fail(message) {
  console.error(`\nError: ${message}`);
  process.exit(1);
}

const name = process.argv[2];

if (!name || name === '--list') {
  console.log('Available recipes:\n');
  for (const r of listRecipes()) console.log(`  ${r.name.padEnd(22)} ${r.description}`);
  console.log('\nAdd one with: npm run recipe -- <name>');
  process.exit(0);
}

const recipeDir = join(recipesDir, name);
if (!existsSync(join(recipeDir, 'recipe.json'))) fail(`No recipe named "${name}". Run: npm run recipe -- --list`);
const recipe = JSON.parse(readFileSync(join(recipeDir, 'recipe.json'), 'utf8'));

// ---- plan every change first, write nothing until all checks pass ----
const writes = new Map();           // absolute path -> new content
const report = [];
const read = (p) => (writes.has(p) ? writes.get(p) : readFileSync(p, 'utf8'));

// 1. files
const filesDir = join(recipeDir, 'files');
for (const src of walk(filesDir)) {
  const rel = relative(filesDir, src);
  const dest = join(root, rel);
  const content = readFileSync(src, 'utf8');
  if (existsSync(dest)) {
    if (readFileSync(dest, 'utf8') === content) { report.push(`  unchanged ${rel}`); continue; }
    fail(`${rel} already exists and differs from the recipe's version. Rename or merge it by hand, then run again.`);
  }
  writes.set(dest, content);
  report.push(`  added     ${rel}`);
}

// 2. schema
const schemaAdditions = join(recipeDir, 'schema-additions.js');
if (existsSync(schemaAdditions)) {
  const schemaPath = join(root, 'tgcloud', 'schema.js');
  const tag = `// recipe: ${name}`;
  const schema = read(schemaPath);
  if (schema.includes(tag)) {
    report.push('  unchanged tgcloud/schema.js');
  } else {
    writes.set(schemaPath, `${schema.trimEnd()}\n\n${tag}\n${readFileSync(schemaAdditions, 'utf8').trim()}\n`);
    report.push('  updated   tgcloud/schema.js (new tables)');
  }
}

// 3. inserts at markers
for (const { file, marker, text } of recipe.insert ?? []) {
  const path = join(root, file);
  if (!existsSync(path)) fail(`${file} is missing; it is needed to register this recipe.`);
  const content = read(path);
  if (content.includes(text)) { report.push(`  unchanged ${file}`); continue; }
  const at = content.indexOf(marker);
  if (at === -1) fail(`Marker "${marker}" not found in ${file}. Add it back, or register the recipe by hand (see recipes/${name}/README.md).`);
  const lineStart = content.lastIndexOf('\n', at) + 1;
  writes.set(path, content.slice(0, lineStart) + text + '\n' + content.slice(lineStart));
  report.push(`  updated   ${file}`);
}

// ---- apply ----
for (const [path, content] of writes) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

console.log(`\nRecipe "${name}": ${writes.size ? 'added' : 'already added, nothing to do'}\n`);
console.log(report.map((l) => l.split('/').join(sep === '\\' ? '\\' : '/')).join('\n'));
if (recipe.next?.length) {
  console.log('\nNext steps:');
  recipe.next.forEach((step, i) => console.log(`  ${i + 1}. ${step}`));
}
console.log(`\nDetails: recipes/${name}/README.md\n`);
