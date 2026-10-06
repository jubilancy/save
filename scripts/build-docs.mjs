// Publishes every .firecrawl/<site>/ folder as a browsable site.
// The markdown is copied as-is and rendered in the browser by scripts/docs-app/; this script only
// copies files and writes the two indexes the app needs (sites.json, search.json).
// Usage: node scripts/build-docs.mjs [outDir] [--base /path/]
import { readdir, readFile, writeFile, mkdir, rm, stat, cp } from 'node:fs/promises';
import { join, relative, dirname } from 'node:path';

const SRC = '.firecrawl';
const args = process.argv.slice(2);
const bi = args.indexOf('--base');
let BASE = bi >= 0 ? args.splice(bi, 2)[1] : '/';
BASE = '/' + BASE.replace(/^\/+|\/+$/g, '');
if (BASE !== '/') BASE += '/';
const OUT = args[0] || 'site';
const APP = new URL('./docs-app/', import.meta.url).pathname;

const exists = (p) => stat(p).then(() => true, () => false);

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (e.name === 'index.md') out.push(p);
  }
  return out;
}

function parseFront(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  const front = {};
  if (m) {
    for (const line of m[1].split('\n')) {
      const kv = line.match(/^(\w+):\s*(.*)$/);
      if (kv) front[kv[1]] = kv[2].replace(/^"(.*)"$/, '$1');
    }
  }
  return { front, body: m ? text.slice(m[0].length) : text };
}

const plain = (md) => md.replace(/[#*_`>\[\]()!|~-]+/g, ' ').replace(/\s+/g, ' ').trim();

async function loadSite(name) {
  const dir = join(SRC, name);
  const meta = new Map();
  let sources = {};
  if (await exists(join(dir, 'sources.json'))) {
    try { sources = JSON.parse(await readFile(join(dir, 'sources.json'), 'utf8')); } catch {}
  }
  for (const p of sources.pages || []) meta.set(p.path, p);
  const pages = [];
  for (const f of await walk(dir)) {
    const path = relative(dir, f).split('\\').join('/');
    const slug = dirname(path);
    if (slug === '.') continue; // the site's own index.md is a table of contents; the app generates one
    const { front, body } = parseFront(await readFile(f, 'utf8'));
    const title = front.title || meta.get(path)?.title || body.match(/^#\s+(.+)$/m)?.[1] || slug;
    pages.push({ slug, path, title, url: front.source || meta.get(path)?.url || '', text: plain(body).slice(0, 3000) });
  }
  pages.sort((a, b) => a.slug.localeCompare(b.slug));
  // Webflow-style sites reuse one <title> everywhere; fall back to the folder name when titles collide.
  const seen = new Map();
  for (const p of pages) seen.set(p.title, (seen.get(p.title) || 0) + 1);
  for (const p of pages) {
    if (seen.get(p.title) > 1) p.title = p.slug.split('/').pop().replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return { name, pages, source: sources.source || pages[0]?.url || '' };
}

async function main() {
  if (!(await exists(SRC))) throw new Error(`${SRC}/ not found`);
  const names = (await readdir(SRC, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  const sites = (await Promise.all(names.map(loadSite))).filter((s) => s.pages.length);

  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  for (const s of sites) await cp(join(SRC, s.name), join(OUT, s.name), { recursive: true });

  for (const f of ['style.css', 'app.js']) await cp(join(APP, f), join(OUT, f));
  await cp('node_modules/marked/lib/marked.umd.js', join(OUT, 'marked.js'));
  await mkdir(join(OUT, 'fonts'), { recursive: true });
  for (const w of [400, 600]) {
    const f = `overpass-mono-latin-${w}-normal.woff2`;
    await cp(join('node_modules/@fontsource/overpass-mono/files', f), join(OUT, 'fonts', f));
  }
  const shell = (await readFile(join(APP, 'index.html'), 'utf8')).replace('__BASE__', BASE);
  await writeFile(join(OUT, 'index.html'), shell);
  await writeFile(join(OUT, '404.html'), shell); // GitHub Pages serves this for unknown paths, so deep links reach the app
  await writeFile(join(OUT, '.nojekyll'), '');

  await writeFile(join(OUT, 'sites.json'), JSON.stringify({ sites: sites.map((s) => ({ name: s.name, source: s.source, pages: s.pages.map(({ slug, path, title, url }) => ({ slug, path, title, url })) })) }));
  await writeFile(join(OUT, 'search.json'), JSON.stringify(sites.flatMap((s) => s.pages.map((p) => ({ t: p.title, s: s.name, u: `${s.name}/${p.slug}/`, x: p.text })))));
  console.log(`Built ${sites.length} site(s), ${sites.reduce((n, s) => n + s.pages.length, 0)} page(s) -> ${OUT}/ (base ${BASE})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
