# URL Scraper

Scrapes URLs to markdown files with YAML frontmatter, automatically detecting and handling both static pages and client-side rendered content.

## Features

- **Cheap-first escalation**: Tries fast path first, escalates to Playwright only when needed
- **Automatic SPA detection**: Quality checks identify incomplete/loading states
- **RSS support**: Automatically detects and parses RSS feeds
- **Infinite scroll handling**: Auto-scrolls pages to capture full content
- **Idempotent**: Skips URLs with existing output files (override with `--force`)
- **GitHub Actions integration**: Auto-commits generated files

## Installation

```bash
npm install
npx playwright install --with-deps chromium
```

## Usage

Add URLs to `urls.txt` (one per line), then run:

```bash
npm run scrape
npm run scrape:force  # Override existing files
```

## How it works

### Extraction Strategy: Cheap-First with Automatic Escalation

1. **Fast Path (Cheerio)**: Most URLs are server-rendered static pages. The scraper uses `CheerioCrawler` with `got-scraping` to fetch and parse HTML without rendering, which is 10-20x faster than Playwright.

2. **Quality Check**: After extraction, the result is validated:
   - Body text must be ≥500 characters
   - No loading-state markers ("Loading...", empty `<div id="root">`, etc.)
   - If title/description exist but body is empty → SPA detected

3. **Playwright Escalation**: If Cheerio fails the quality check, the scraper automatically escalates to `PlaywrightCrawler` to render the page and capture client-side content.

4. **Infinite Scroll**: Within Playwright, an `autoScroll` helper scrolls in increments (waiting 500ms between each), stopping when page height stabilizes or a cap is hit (~10 iterations / 30s max).

5. **Paywall Handling**: Playwright renders what a logged-out visitor sees. Real paywalls are not defeated. A TODO comment in the code notes that cookie/session injection could be added later if needed.

### RSS Feeds

If a URL is detected as an RSS feed (by content-type or parsing), the scraper:
- Parses the feed
- Generates one markdown file per item
- Uses the feed URL to group related articles

## Tuning Quality Checks

Edit `scripts/quality-check.js` to adjust thresholds:

- **`MIN_BODY_LENGTH`** (currently 500): Increase if getting too many stubs, decrease if legitimate short articles are rejected
- **`loadingMarkers`**: Add domain-specific loading messages
- **`emptyElementPatterns`**: Add framework-specific empty selectors (Vue, Svelte, etc.)

### Debugging

Check `fetch_method` in generated file frontmatter:
- `cheerio`: Fast path succeeded
- `playwright`: Escalated and succeeded
- Missing file: Both paths failed quality checks

Run with verbose logging:
```bash
DEBUG=* npm run scrape
```

## Markdown Output

Each file contains YAML frontmatter followed by markdown body:

```yaml
---
title: "Article Title"
description: "Article excerpt"
author: "Author Name"
date: "2024-01-01T00:00:00Z"
image: "https://..."
source_url: "https://..."
scraped_at: "2024-01-01T12:00:00Z"
fetch_method: "cheerio"
---

# Article body in markdown...
```

## GitHub Action

Automatically runs when:
- `urls.txt` is pushed to `main`
- Manual trigger via `workflow_dispatch`

Caches Playwright binaries keyed on `package-lock.json` to avoid re-downloading on every run.

## Dependencies

Note: `turndown` was added to convert HTML to markdown (not in original spec). This bridges Crawlee/Cheerio output to markdown format without manual formatting.

| Package | Purpose |
|---------|---------|
| `crawlee` | Orchestration, CheerioCrawler + PlaywrightCrawler |
| `got-scraping` | Fast HTTP fetch with bot-detection avoidance |
| `metascraper` | Metadata extraction (title, description, image, author, date) |
| `rss-parser` | RSS feed parsing |
| `turndown` | HTML → Markdown conversion |

## Project Structure

```
.
├── urls.txt                    # URLs to scrape (one per line)
├── scripts/
│   ├── scrape.js              # Main orchestrator
│   ├── quality-check.js        # Content quality validation
│   ├── extract.js              # Metadata + HTML→Markdown
│   ├── rss.js                  # RSS feed parsing
│   └── fetchers/
│       ├── cheerio.js          # Fast path crawler
│       └── playwright.js        # Fallback crawler with autoScroll
├── output/                     # Generated markdown files
├── .github/workflows/
│   └── scrape.yml              # GitHub Action workflow
└── package.json
```

## Idempotency

File paths are slugs derived from URL hashes (not titles), so:
- Title changes don't break existing files
- Re-running doesn't overwrite valid content (unless `--force`)
- Easy to track which URLs have been processed

Use `npm run scrape:force` to re-scrape all URLs and overwrite existing files.
