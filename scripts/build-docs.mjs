// Builds a static documentation site from every .firecrawl/<site>/ folder.
// Zero config: sites are auto-discovered, nav comes from sources.json (or a scan of index.md files).
import { readdir, readFile, writeFile, mkdir, rm, stat } from 'node:fs/promises';
import { join, relative, dirname } from 'node:path';
import { Marked } from 'marked';

const SRC = '.firecrawl';
const OUT = process.argv[2] || 'site';
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Third-party scraped content: escape raw HTML so it can never inject markup.
const marked = new Marked({ gfm: true, renderer: { html: (t) => esc(t.text ?? t) } });

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

const strip = (md) => md.replace(/[#*_`>\[\]()!|~-]+/g, ' ').replace(/\s+/g, ' ').trim();
const root = (depth) => (depth ? '../'.repeat(depth) : './');

const CSS = `:root{--bg:#fff;--fg:#1c1c1e;--mut:#6b6b73;--bd:#e4e4e8;--ac:#4f46e5;--sb:#f7f7f9;--code:#f1f1f4}
@media(prefers-color-scheme:dark){:root{--bg:#121214;--fg:#e8e8ec;--mut:#9a9aa5;--bd:#2a2a30;--ac:#8b85ff;--sb:#18181b;--code:#222226}}
*{box-sizing:border-box}body{margin:0;font:16px/1.65 system-ui,sans-serif;background:var(--bg);color:var(--fg)}
a{color:var(--ac)}header{display:flex;gap:16px;align-items:center;padding:10px 20px;border-bottom:1px solid var(--bd)}
header a.brand{font-weight:700;text-decoration:none;color:var(--fg)}
#q{margin-left:auto;width:min(320px,50vw);padding:7px 10px;border:1px solid var(--bd);border-radius:6px;background:var(--bg);color:var(--fg)}
#res{position:absolute;right:20px;top:52px;width:min(420px,calc(100vw - 40px));max-height:70vh;overflow:auto;background:var(--bg);border:1px solid var(--bd);border-radius:8px;display:none;z-index:5}
#res a{display:block;padding:8px 12px;text-decoration:none;color:var(--fg);border-bottom:1px solid var(--bd)}#res small{color:var(--mut);display:block}
.layout{display:flex;max-width:1200px;margin:0 auto}nav.side{width:270px;flex:none;padding:20px;border-right:1px solid var(--bd);background:var(--sb);min-height:calc(100vh - 53px);font-size:14px}
nav.side h4{margin:0 0 10px}nav.side a{display:block;padding:3px 0;text-decoration:none;color:var(--fg)}nav.side a.cur{color:var(--ac);font-weight:600}
nav.side summary{cursor:pointer;color:var(--mut);margin-top:8px}main{flex:1;min-width:0;padding:28px 36px}
main img{max-width:100%;height:auto}pre{overflow:auto;background:var(--code);padding:12px;border-radius:6px}code{background:var(--code);padding:1px 4px;border-radius:4px}pre code{padding:0}
table{border-collapse:collapse;display:block;overflow:auto}td,th{border:1px solid var(--bd);padding:6px 10px}
.src{color:var(--mut);font-size:13px;margin-bottom:20px}.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px}
.card{border:1px solid var(--bd);border-radius:8px;padding:14px;text-decoration:none;color:var(--fg)}.card small{color:var(--mut);display:block}
@media(max-width:800px){.layout{flex-direction:column}nav.side{width:auto;min-height:0;border-right:0;border-bottom:1px solid var(--bd)}main{padding:20px 16px}}`;

const JS = `const q=document.getElementById('q'),res=document.getElementById('res');let idx=null;
q.addEventListener('input',async()=>{const t=q.value.trim().toLowerCase();if(!t){res.style.display='none';return}
if(!idx)idx=await (await fetch(document.documentElement.dataset.root+'search.json')).json();
const hits=idx.filter(p=>(p.t+' '+p.x).toLowerCase().includes(t)).slice(0,15);
res.replaceChildren(...hits.map(p=>{const a=document.createElement('a');a.href=document.documentElement.dataset.root+p.u;
const b=document.createElement('b');b.textContent=p.t;const s=document.createElement('small');s.textContent=p.s;a.append(b,s);return a}));
if(!hits.length){res.textContent='No results'}res.style.display='block'});
document.addEventListener('click',e=>{if(!res.contains(e.target)&&e.target!==q)res.style.display='none'});`;

function layout({ title, depth, sidebar, content, siteName }) {
  const r = root(depth);
  return `<!doctype html><html lang="en" data-root="${r}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src * data:; style-src 'self'; script-src 'self'; connect-src 'self'; font-src 'self'">
<title>${esc(title)}${siteName ? ' · ' + esc(siteName) : ''}</title><link rel="stylesheet" href="${r}style.css"></head><body>
<header><a class="brand" href="${r}index.html">Knowledge Bases</a><input id="q" type="search" placeholder="Search all sites…" aria-label="Search"><div id="res"></div></header>
<div class="layout">${sidebar || ''}<main>${content}</main></div><script src="${r}search.js"></script></body></html>`;
}

function sidebarFor(site, curPath, depth) {
  const r = root(depth);
  const groups = new Map();
  for (const p of site.pages) {
    const seg = p.path.split('/');
    const key = seg.length > 1 ? seg[0] : '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  const link = (p) => `<a href="${r}${site.name}/${p.slug}"${p.path === curPath ? ' class="cur"' : ''}>${esc(p.title)}</a>`;
  let html = `<nav class="side"><h4><a href="${r}${site.name}/index.html">${esc(site.name)}</a></h4>`;
  for (const [key, pages] of groups) {
    // single-page folders (the common case) render flat; real nesting renders as a collapsible group
    html += pages.length > 1 && key ? `<details${pages.some((p) => p.path === curPath) ? ' open' : ''}><summary>${esc(key)}</summary>${pages.map(link).join('')}</details>` : pages.map(link).join('');
  }
  return html + '</nav>';
}

async function loadSite(name) {
  const dir = join(SRC, name);
  const files = await walk(dir);
  const meta = new Map();
  let sources = {};
  if (await exists(join(dir, 'sources.json'))) {
    try { sources = JSON.parse(await readFile(join(dir, 'sources.json'), 'utf8')); } catch {}
  }
  for (const p of sources.pages || []) meta.set(p.path, p);
  const pages = [];
  for (const f of files) {
    const path = relative(dir, f).split('\\').join('/');
    const dirPath = dirname(path);
    if (dirPath === '.') continue; // the site's own index.md is a table of contents; we generate our own
    const { front, body } = parseFront(await readFile(f, 'utf8'));
    const h1 = body.match(/^#\s+(.+)$/m)?.[1];
    const title = front.title || meta.get(path)?.title || h1 || dirPath;
    pages.push({ path, slug: `${dirPath}/index.html`, title, url: front.source || meta.get(path)?.url || '', body });
  }
  pages.sort((a, b) => dirname(a.path).localeCompare(dirname(b.path)));
  // Webflow-style sites reuse one <title> everywhere; fall back to the page's folder name when titles collide.
  const seen = new Map();
  for (const p of pages) seen.set(p.title, (seen.get(p.title) || 0) + 1);
  for (const p of pages) {
    if (seen.get(p.title) > 1) p.title = dirname(p.path).split('/').pop().replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return { name, pages, source: sources.source || pages[0]?.url || '' };
}

async function main() {
  if (!(await exists(SRC))) throw new Error(`${SRC}/ not found`);
  const names = (await readdir(SRC, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  const sites = (await Promise.all(names.map(loadSite))).filter((s) => s.pages.length);

  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  await writeFile(join(OUT, 'style.css'), CSS);
  await writeFile(join(OUT, 'search.js'), JS);
  await writeFile(join(OUT, '.nojekyll'), '');

  const search = [];
  for (const site of sites) {
    const byUrl = new Map(site.pages.filter((p) => p.url).map((p) => [p.url.replace(/\/$/, ''), p]));
    for (const p of site.pages) {
      const depth = 1 + p.slug.split('/').length - 1;
      const rewrite = (html) => html.replace(/href="(https?:\/\/[^"]+)"/g, (m, u) => {
        const t = byUrl.get(u.replace(/\/$/, '').split('#')[0]);
        return t ? `href="${root(depth)}${site.name}/${t.slug}"` : m;
      });
      const content = `<div class="src">Source: ${p.url ? `<a href="${esc(p.url)}" rel="noopener">${esc(p.url)}</a>` : esc(p.path)}</div>${rewrite(marked.parse(p.body))}`;
      const html = layout({ title: p.title, depth, sidebar: sidebarFor(site, p.path, depth), content, siteName: site.name });
      const out = join(OUT, site.name, p.slug);
      await mkdir(dirname(out), { recursive: true });
      await writeFile(out, html);
      search.push({ t: p.title, s: site.name, u: `${site.name}/${p.slug}`, x: strip(p.body).slice(0, 3000) });
    }
    const list = site.pages.map((p) => `<li><a href="${p.slug}">${esc(p.title)}</a></li>`).join('');
    await writeFile(join(OUT, site.name, 'index.html'), layout({
      title: site.name, depth: 1, siteName: '', sidebar: sidebarFor(site, '', 1),
      content: `<h1>${esc(site.name)}</h1>${site.source ? `<p class="src">Source: <a href="${esc(site.source)}" rel="noopener">${esc(site.source)}</a> · ${site.pages.length} pages</p>` : ''}<ul>${list}</ul>`,
    }));
  }
  const cards = sites.map((s) => `<a class="card" href="${s.name}/index.html"><b>${esc(s.name)}</b><small>${s.pages.length} pages</small></a>`).join('');
  await writeFile(join(OUT, 'index.html'), layout({ title: 'Knowledge Bases', depth: 0, content: `<h1>Knowledge Bases</h1><div class="cards">${cards || '<p>No sites yet.</p>'}</div>` }));
  await writeFile(join(OUT, 'search.json'), JSON.stringify(search));
  console.log(`Built ${sites.length} site(s), ${search.length} page(s) -> ${OUT}/`);
}

main().catch((e) => { console.error(e); process.exit(1); });
