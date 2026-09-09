import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
import { cheerioFetch } from './fetchers/cheerio.js';
import { playwrightFetch } from './fetchers/playwright.js';
import { isQualityExtraction } from './quality-check.js';
import { isRssFeed, parseRssFeed } from './rss.js';

const OUTPUT_DIR = './output';
const URLS_FILE = './urls.txt';
const FORCE_FLAG = process.argv.includes('--force');

function generateSlug(url) {
  const hash = createHash('md5').update(url).digest('hex');
  return `${hash.slice(0, 12)}.md`;
}

function generateFrontmatter(data) {
  return `---
title: "${(data.title || '').replace(/"/g, '\\"')}"
description: "${(data.description || '').replace(/"/g, '\\"')}"
author: "${(data.author || '').replace(/"/g, '\\"')}"
date: "${data.date || new Date().toISOString()}"
image: "${data.image || ''}"
source_url: "${data.url || ''}"
scraped_at: "${new Date().toISOString()}"
fetch_method: "${data.fetchMethod || 'unknown'}"
---

`;
}

async function ensureOutputDir() {
  try {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
  } catch (error) {
    console.error('Failed to create output directory:', error.message);
    process.exit(1);
  }
}

async function fileExists(filepath) {
  try {
    await fs.access(filepath);
    return true;
  } catch {
    return false;
  }
}

async function scrapeUrl(url) {
  console.log(`[scrape] Processing: ${url}`);

  const outputFile = path.join(OUTPUT_DIR, generateSlug(url));
  const exists = await fileExists(outputFile);

  if (exists && !FORCE_FLAG) {
    console.log(`[scrape] Skipping ${url} (output exists, use --force to override)`);
    return null;
  }

  // Check if it's an RSS feed
  try {
    const isRss = await isRssFeed(url);
    if (isRss) {
      console.log(`[scrape] Detected RSS feed: ${url}`);
      const items = await parseRssFeed(url);
      console.log(`[scrape] Parsed ${items.length} items from RSS feed`);
      return { isRss: true, items };
    }
  } catch (error) {
    console.log(`[scrape] Not an RSS feed (${error.message})`);
  }

  // Try fast path first (Cheerio)
  try {
    console.log(`[scrape] Trying cheerio (fast path) for ${url}`);
    const result = await cheerioFetch(url);

    if (isQualityExtraction(result)) {
      console.log(`[scrape] ✓ Cheerio extraction passed quality check for ${url}`);
      return { isRss: false, data: result };
    }

    console.log(`[scrape] Cheerio extraction failed quality check, escalating to Playwright`);
  } catch (error) {
    console.log(`[scrape] Cheerio fetch failed (${error.message}), trying Playwright`);
  }

  // Escalate to Playwright
  try {
    console.log(`[scrape] Trying Playwright (fallback) for ${url}`);
    const result = await playwrightFetch(url);

    if (isQualityExtraction(result)) {
      console.log(`[scrape] ✓ Playwright extraction passed quality check for ${url}`);
      return { isRss: false, data: result };
    }

    console.log(`[scrape] Playwright extraction failed quality check for ${url}`);
    return null;
  } catch (error) {
    console.error(`[scrape] Playwright fetch failed for ${url}:`, error.message);
    return null;
  }
}

async function writeMarkdownFile(data, slug) {
  const filepath = path.join(OUTPUT_DIR, slug);
  const frontmatter = generateFrontmatter(data);
  const content = frontmatter + (data.body || '');

  try {
    await fs.writeFile(filepath, content, 'utf-8');
    console.log(`[write] Created ${slug}`);
  } catch (error) {
    console.error(`[write] Failed to write ${slug}:`, error.message);
  }
}

async function main() {
  try {
    console.log('[start] URL scraper initialized');
    console.log(`[config] Force mode: ${FORCE_FLAG}`);

    await ensureOutputDir();

    // Read URLs file
    let urls = [];
    try {
      const content = await fs.readFile(URLS_FILE, 'utf-8');
      urls = content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));
    } catch (error) {
      console.error(`Failed to read ${URLS_FILE}:`, error.message);
      process.exit(1);
    }

    if (urls.length === 0) {
      console.log('[info] No URLs to process');
      process.exit(0);
    }

    console.log(`[info] Found ${urls.length} URLs to process`);

    // Process each URL
    for (const url of urls) {
      try {
        const result = await scrapeUrl(url);

        if (result?.isRss) {
          // Write each RSS item
          for (const item of result.items) {
            const slug = generateSlug(item.url);
            await writeMarkdownFile(item, slug);
          }
        } else if (result?.data) {
          const slug = generateSlug(url);
          await writeMarkdownFile(result.data, slug);
        }
      } catch (error) {
        console.error(`[error] Unexpected error processing ${url}:`, error.message);
      }
    }

    console.log('[done] Scraping complete');
  } catch (error) {
    console.error('[fatal] Unexpected error:', error.message);
    process.exit(1);
  }
}

main();
