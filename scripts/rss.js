import Parser from 'rss-parser';
import { extractMetadata } from './extract.js';

const parser = new Parser();

export async function isRssFeed(url, contentType = '') {
  // Check content-type first
  if (contentType && contentType.includes('xml')) {
    return true;
  }

  // Try to parse as RSS
  try {
    await parser.parseURL(url);
    return true;
  } catch {
    return false;
  }
}

export async function parseRssFeed(url) {
  try {
    const feed = await parser.parseURL(url);
    const items = [];

    if (feed.items) {
      for (const item of feed.items.slice(0, 50)) {
        items.push({
          url: item.link || url,
          title: item.title || '',
          description: item.contentSnippet || item.summary || '',
          author: item.creator || feed.title || '',
          date: item.pubDate || new Date().toISOString(),
          image: item.image?.url || '',
          body: item.content || item.description || item.contentSnippet || '',
          bodyText: item.contentSnippet || item.summary || '',
          fetchMethod: 'rss',
        });
      }
    }

    return items;
  } catch (error) {
    console.error(`[rss] Failed to parse RSS feed ${url}:`, error.message);
    throw error;
  }
}
