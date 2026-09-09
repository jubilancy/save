import { CheerioCrawler } from 'crawlee';
import { extractMetadata, htmlToMarkdown, extractBodyText } from '../extract.js';

export async function cheerioFetch(url) {
  const crawler = new CheerioCrawler({
    maxRequestsPerCrawl: 1,
    maxRequestsPerMinute: 60,
  });

  let result = null;
  let error = null;

  crawler.addHandler(async ({ body, request }) => {
    try {
      const metadata = await extractMetadata(body, request.url);
      const bodyText = extractBodyText(body);
      const markdown = htmlToMarkdown(body);

      result = {
        url: request.url,
        title: metadata.title,
        description: metadata.description,
        author: metadata.author,
        date: metadata.date,
        image: metadata.image,
        body: markdown,
        bodyText: bodyText,
        rawHtml: body,
        fetchMethod: 'cheerio',
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
