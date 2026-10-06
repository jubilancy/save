# Knowledge base conventions

- Firecrawl knowledge bases live in `.firecrawl/<hostname>/`, one folder per site. Never overwrite or mix another site's folder.
- Each site folder has `index.md`, `sources.json`, and `<path>/index.md` pages with `source` and `title` frontmatter. The site root page is saved as `home-root/`.
- After adding a site, add a row to the Sites table in `.firecrawl/README.md`.
- Build `index.md` and `sources.json` after scraping finishes, from the page files on disk, so a late background job can't overwrite them with a partial list.
- Scrape with low concurrency and retry on HTTP 429.
