// Quality check heuristics to detect incomplete/SPA-rendered pages
const loadingMarkers = [
  'Loading...',
  'loading...',
  'LOADING',
  'Please wait',
  'Loading content',
  'Loading page'
];

const emptyElementPatterns = [
  /<div\s+id=["']root["']\s*>\s*<\/div>/,
  /<div\s+id=["']app["']\s*>\s*<\/div>/,
  /<div\s+id=["']__next["']\s*>\s*<\/div>/,
];

export function isQualityExtraction(extracted) {
  const { body, title, description } = extracted;

  // Body text is too short
  if (!body || body.trim().length < 500) {
    return false;
  }

  // Body contains common loading-state markers
  if (loadingMarkers.some(marker => body.includes(marker))) {
    return false;
  }

  // Body is empty/whitespace only
  if (!body.trim()) {
    return false;
  }

  // Metadata present but body empty (SPA indicator)
  if ((title || description) && body.trim().length === 0) {
    return false;
  }

  // Check for empty app/root divs in raw HTML (stored separately)
  if (extracted.rawHtml && emptyElementPatterns.some(p => p.test(extracted.rawHtml))) {
    return false;
  }

  return true;
}
