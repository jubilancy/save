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

// A link alone in its paragraph becomes an embed (video/audio players) or a link card (social posts).
// Embeds are limited to hosts allowed by the CSP frame-src in index.html; nothing third-party runs as script on this page.
function embedFor(href) {
  let u; try { u = new URL(href); } catch { return null; }
  const h = u.hostname.replace(/^www\.|^m\./, '');
  const seg = u.pathname.split('/').filter(Boolean);
  const id = /^[\w-]{6,}$/;
  if (h === 'youtu.be' && id.test(seg[0] || '')) return { kind: 'frame', src: `https://www.youtube-nocookie.com/embed/${seg[0]}`, ratio: '16/9' };
  if (h === 'youtube.com') {
    const v = u.pathname === '/watch' ? u.searchParams.get('v') : ['embed', 'shorts', 'live'].includes(seg[0]) ? seg[1] : null;
    if (v && id.test(v)) return { kind: 'frame', src: `https://www.youtube-nocookie.com/embed/${v}`, ratio: '16/9' };
  }
  if (h === 'vimeo.com' && /^\d+$/.test(seg[0] || '')) return { kind: 'frame', src: `https://player.vimeo.com/video/${seg[0]}`, ratio: '16/9' };
  if (h === 'open.spotify.com') {
    const i = ['track', 'album', 'playlist', 'episode', 'show', 'artist'].includes(seg[0]) ? 1 : (seg[0] || '').startsWith('intl-') ? 2 : -1;
    const kind = seg[i - 1 < 0 ? 0 : i - 1], sid = seg[i];
    if (i > 0 && /^\w{10,}$/.test(sid || '')) return { kind: 'frame', src: `https://open.spotify.com/embed/${kind}/${sid}`, height: kind === 'track' || kind === 'episode' ? 152 : 352 };
  }
  const social = { 'twitter.com': 'Twitter / X', 'x.com': 'Twitter / X', 'instagram.com': 'Instagram' }[h];
  if (social) return { kind: 'card', label: social, path: u.pathname.replace(/\/$/, '') || '/' };
  return null;
}

function embedLinks(root) {
  for (const p of root.querySelectorAll('p')) {
    const kids = [...p.childNodes].filter((n) => n.nodeType !== 3 || n.textContent.trim());
    if (kids.length !== 1 || kids[0].nodeName !== 'A') continue;
    const a = kids[0], e = embedFor(a.getAttribute('href'));
    if (!e) continue;
    const box = document.createElement('div');
    if (e.kind === 'frame') {
      box.className = 'embed';
      const f = document.createElement('iframe');
      f.src = e.src; f.loading = 'lazy'; f.referrerPolicy = 'strict-origin-when-cross-origin'; f.allowFullscreen = true;
      f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation allow-popups');
      f.setAttribute('allow', 'encrypted-media; picture-in-picture; fullscreen');
      f.title = a.textContent.trim() || 'Embedded media';
      if (e.ratio) f.style.aspectRatio = e.ratio; else f.style.height = e.height + 'px';
      box.append(f);
      const cap = document.createElement('a');
      cap.href = a.href; cap.rel = 'noopener'; cap.textContent = 'Open original'; cap.className = 'cap';
      box.append(cap);
    } else {
      box.className = 'card social';
      a.rel = 'noopener';
      const b = document.createElement('b'); b.textContent = e.label;
      const s = document.createElement('small'); s.textContent = e.path;
      const t = document.createElement('span'); t.textContent = a.textContent.trim() !== a.getAttribute('href') ? a.textContent.trim() : '';
      box.append(b, s, t);
      box.addEventListener('click', () => window.open(a.href, '_blank', 'noopener'));
      box.tabIndex = 0; box.setAttribute('role', 'link');
      box.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') window.open(a.href, '_blank', 'noopener'); });
    }
    p.replaceWith(box);
  }
}

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
    const total = DATA.sites.reduce((n, x) => n + x.pages.length, 0);
    const host = (u) => { try { return new URL(u).hostname; } catch { return ''; } };
    main.innerHTML = `<section class="hero"><p class="eyebrow">markdown, rendered</p><h1>Knowledge Bases</h1>
      <p class="lede">${DATA.sites.length} site${DATA.sites.length === 1 ? '' : 's'} and ${total} pages, scraped to markdown and kept readable, searchable and linkable.</p>
      <p class="hint">Press <kbd>/</kbd> to search everything.</p></section>
      <div class="cards">${DATA.sites.map((x) => `<a class="card" data-link href="${siteHref(x)}"><b>${esc(x.name)}</b><small>${esc(host(x.source))}</small><small>${x.pages.length} pages</small></a>`).join('') || '<p>No sites yet.</p>'}</div>`;
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
  embedLinks(tpl.content);
  const src = page.url ? `<div class="src">Source: <a href="${esc(page.url)}" rel="noopener">${esc(page.url)}</a> · <a href="${esc(`${BASE}${site.name}/${page.path}`)}">raw markdown</a></div>` : '';
  main.innerHTML = src;
  main.append(tpl.content);
  const i = site.pages.indexOf(page), prev = site.pages[i - 1], next = site.pages[i + 1];
  if (prev || next) {
    const pager = document.createElement('nav');
    pager.className = 'pager';
    pager.innerHTML = (prev ? `<a data-link class="prev" href="${pageHref(site, prev)}"><small>← Previous</small>${esc(prev.title)}</a>` : '<span></span>')
      + (next ? `<a data-link class="next" href="${pageHref(site, next)}"><small>Next →</small>${esc(next.title)}</a>` : '<span></span>');
    main.append(pager);
  }
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

// '/' focuses search from anywhere (unless already typing); arrows + Enter pick a result; Esc closes.
document.addEventListener('keydown', (e) => {
  const t = e.target, typing = t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
  if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); q.focus(); q.select(); }
});
q.addEventListener('keydown', (e) => {
  const items = [...res.querySelectorAll('a')], cur = items.findIndex((a) => a.classList.contains('sel'));
  if (e.key === 'Escape') { res.style.display = 'none'; q.blur(); return; }
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter') return;
  if (!items.length || res.style.display === 'none') return;
  e.preventDefault();
  if (e.key === 'Enter') { (items[cur] || items[0]).click(); q.blur(); return; }
  const next = e.key === 'ArrowDown' ? (cur + 1) % items.length : (cur - 1 + items.length) % items.length;
  items.forEach((a, i) => a.classList.toggle('sel', i === next));
  items[next].scrollIntoView({ block: 'nearest' });
});

render().catch(() => { main.innerHTML = '<p class="err">Could not load the site index.</p>'; });

// Reading progress bar.
const bar = document.getElementById('progress');
const tick = () => {
  const max = document.documentElement.scrollHeight - innerHeight;
  bar.style.transform = `scaleX(${max > 0 ? Math.min(1, scrollY / max) : 0})`;
};
addEventListener('scroll', tick, { passive: true });
addEventListener('resize', tick);
new MutationObserver(tick).observe(main, { childList: true });
