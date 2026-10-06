// Renders the Firecrawl markdown in the browser. The markdown files are published as-is next to this app.
const BASE = new URL(document.baseURI).pathname; // e.g. "/" or "/save/"
const $ = (s) => document.querySelector(s);
const main = $('main'), side = $('#side');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
let DATA, SEARCH;

// Scraped content is untrusted: escape raw HTML, and only allow http(s)/mailto links.
marked.use({
  renderer: { html: (t) => esc(t.text ?? t) },
  walkTokens(t) {
    if (t.type !== 'link' && t.type !== 'image') return;
    try {
      const u = new URL(t.href, 'https://x.invalid/');
      if (!['http:', 'https:', 'mailto:'].includes(u.protocol)) t.href = '#';
    } catch { t.href = '#'; }
  },
});

const stripFront = (t) => t.replace(/^---\n[\s\S]*?\n---\n?/, '');
const pageHref = (site, p) => `${BASE}${site.name}/${p.slug}/`;
const siteHref = (site) => `${BASE}${site.name}/`;

function sidebar(site, cur) {
  if (!site) return '';
  const groups = new Map();
  for (const p of site.pages) {
    const k = p.slug.includes('/') ? p.slug.split('/')[0] : '';
    (groups.get(k) || groups.set(k, []).get(k)).push(p);
  }
  const link = (p) => `<a data-link href="${pageHref(site, p)}"${p.slug === cur ? ' class="cur"' : ''}>${esc(p.title)}</a>`;
  let h = `<nav class="side"><h4><a data-link href="${siteHref(site)}">${esc(site.name)}</a></h4>`;
  for (const [k, ps] of groups) {
    h += k && ps.length > 1
      ? `<details${ps.some((p) => p.slug === cur) ? ' open' : ''}><summary>${esc(k)}</summary>${ps.map(link).join('')}</details>`
      : ps.map(link).join('');
  }
  return h + '</nav>';
}

function setTitle(t) { document.title = t ? `${t} · Knowledge Bases` : 'Knowledge Bases'; }

async function render() {
  DATA ||= await (await fetch('sites.json')).json();
  const parts = decodeURIComponent(location.pathname).slice(BASE.length).split('/').filter(Boolean);
  const site = DATA.sites.find((s) => s.name === parts[0]);
  side.innerHTML = sidebar(site, parts.slice(1).join('/'));
  window.scrollTo(0, 0);

  if (!parts.length) {
    setTitle('');
    main.innerHTML = `<h1>Knowledge Bases</h1><div class="cards">${DATA.sites.map((s) =>
      `<a class="card" data-link href="${siteHref(s)}"><b>${esc(s.name)}</b><small>${s.pages.length} pages</small></a>`).join('') || '<p>No sites yet.</p>'}</div>`;
    return;
  }
  if (!site) { main.innerHTML = '<p class="err">Site not found.</p>'; return; }

  const slug = parts.slice(1).join('/');
  if (!slug) {
    setTitle(site.name);
    main.innerHTML = `<h1>${esc(site.name)}</h1>${site.source ? `<p class="src">Source: <a href="${esc(site.source)}" rel="noopener">${esc(site.source)}</a> · ${site.pages.length} pages</p>` : ''}<ul>${site.pages.map((p) =>
      `<li><a data-link href="${pageHref(site, p)}">${esc(p.title)}</a></li>`).join('')}</ul>`;
    return;
  }
  const page = site.pages.find((p) => p.slug === slug);
  if (!page) { main.innerHTML = '<p class="err">Page not found.</p>'; return; }

  setTitle(`${page.title} · ${site.name}`);
  main.innerHTML = '<p class="err">Loading…</p>';
  const res = await fetch(`${site.name}/${page.path}`);
  if (!res.ok) { main.innerHTML = '<p class="err">Could not load this page.</p>'; return; }
  const tpl = document.createElement('template');
  tpl.innerHTML = marked.parse(stripFront(await res.text()));
  const byUrl = new Map(site.pages.filter((p) => p.url).map((p) => [p.url.replace(/\/$/, ''), p]));
  for (const a of tpl.content.querySelectorAll('a[href]')) {
    const t = byUrl.get(a.getAttribute('href').split('#')[0].replace(/\/$/, ''));
    if (t) { a.setAttribute('href', pageHref(site, t)); a.dataset.link = ''; } else a.rel = 'noopener';
  }
  for (const i of tpl.content.querySelectorAll('img')) i.loading = 'lazy';
  const src = page.url ? `<div class="src">Source: <a href="${esc(page.url)}" rel="noopener">${esc(page.url)}</a> · <a href="${esc(`${BASE}${site.name}/${page.path}`)}">raw markdown</a></div>` : '';
  main.innerHTML = src;
  main.append(tpl.content);
}

function go(href) { history.pushState(null, '', href); render(); }
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-link]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
  e.preventDefault();
  $('#res').style.display = 'none';
  go(a.getAttribute('href'));
});
addEventListener('popstate', render);

// Search across every site (index built at publish time).
const q = $('#q'), res = $('#res');
q.addEventListener('input', async () => {
  const t = q.value.trim().toLowerCase();
  if (!t) { res.style.display = 'none'; return; }
  SEARCH ||= await (await fetch('search.json')).json();
  const hits = SEARCH.filter((p) => `${p.t} ${p.x}`.toLowerCase().includes(t)).slice(0, 15);
  res.replaceChildren(...hits.map((p) => {
    const a = document.createElement('a'); a.href = BASE + p.u; a.dataset.link = '';
    const b = document.createElement('b'); b.textContent = p.t;
    const s = document.createElement('small'); s.textContent = p.s;
    a.append(b, s); return a;
  }));
  if (!hits.length) res.textContent = 'No results';
  res.style.display = 'block';
});
document.addEventListener('click', (e) => { if (!res.contains(e.target) && e.target !== q) res.style.display = 'none'; });

render().catch(() => { main.innerHTML = '<p class="err">Could not load the site index.</p>'; });
