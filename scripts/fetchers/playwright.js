import { PlaywrightCrawler } from 'crawlee';
import { extractMetadata, htmlToMarkdown, extractBodyText } from '../extract.js';

async function autoScroll(page, maxIterations = 10, maxTime = 30000) {
  const startTime = Date.now();
  let lastHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  let iterations = 0;

  while (iterations < maxIterations && Date.now() - startTime < maxTime) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await page.waitForTimeout(500);

    const newHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    if (newHeight === lastHeight) {
      break;
    }
    lastHeight = newHeight;
    iterations++;
  }
}

export async function playwrightFetch(url) {
  const crawler = new PlaywrightCrawler({
    maxRequestsPerCrawl: 1,
    maxRequestsPerMinute: 30,
    navigationTimeoutSecs: 30,
    useSessionPool: false,
  });

  let result = null;
  let error = null;

  crawler.addHandler(async ({ page, request, body }) => {
    try {
      // Wait for network idle
      try {
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      } catch (err) {
        // Network idle timeout is acceptable
      }

      // Try to auto-scroll for infinite-scroll pages
      await autoScroll(page);

      // Get the rendered HTML
      const renderedHtml = await page.content();

      const metadata = await extractMetadata(renderedHtml, request.url);
      const bodyText = extractBodyText(renderedHtml);
      const markdown = htmlToMarkdown(renderedHtml);

      result = {
        url: request.url,
        title: metadata.title,
        description: metadata.description,
        author: metadata.author,
        date: metadata.date,
        image: metadata.image,
        body: markdown,
        bodyText: bodyText,
        rawHtml: renderedHtml,
        fetchMethod: 'playwright',
      };
    } catch (err) {
      error = err;
    }
  });

  crawler.addErrorHandler(async ({ request, error: err }) => {
    error = err;
  });

  try {
    await crawler.run([url]);
  } catch (err) {
    error = err;
  }

  if (error) {
    throw error;
  }

  if (!result) {
    throw new Error('No data extracted from URL');
  }

  return result;
}
