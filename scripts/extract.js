import metascraper from 'metascraper';
import metascraperAuthor from 'metascraper-author';
import metascraperDate from 'metascraper-date';
import metascraperDescription from 'metascraper-description';
import metascraperImage from 'metascraper-image';
import metascraperTitle from 'metascraper-title';
import TurndownService from 'turndown';

const ms = metascraper([
  metascraperAuthor(),
  metascraperDate(),
  metascraperDescription(),
  metascraperImage(),
  metascraperTitle(),
]);

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
});

// Configure turndown to preserve code blocks and important elements
turndown.addRule('pre', {
  filter: 'pre',
  replacement: (content) => '\n```\n' + content + '\n```\n',
});

export async function extractMetadata(html, url) {
  try {
    const metadata = await ms({
      html,
      url,
    });

    return {
      title: metadata.title || '',
      description: metadata.description || '',
      author: metadata.author || '',
      date: metadata.date || new Date().toISOString(),
      image: metadata.image || '',
    };
  } catch (error) {
    console.error(`[extract] Metadata extraction failed for ${url}:`, error.message);
    return {
      title: '',
      description: '',
      author: '',
      date: new Date().toISOString(),
      image: '',
    };
  }
}

export function htmlToMarkdown(html) {
  try {
    // Remove script and style tags before conversion
    let cleaned = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

    const markdown = turndown.turndown(cleaned);

    // Clean up excessive whitespace
    return markdown
      .split('\n')
      .filter(line => line.trim())
      .join('\n')
      .trim();
  } catch (error) {
    console.error('[extract] HTML to markdown conversion failed:', error.message);
    return '';
  }
}

export function extractBodyText(html) {
  try {
    // Simple text extraction from HTML
    let text = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();
    return text;
  } catch (error) {
    return '';
  }
}
