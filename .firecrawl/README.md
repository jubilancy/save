# Firecrawl Knowledge Bases

Monorepo of knowledge bases built with the `firecrawl-knowledge-base` skill. Each site gets its own folder, named after its hostname:

```text
.firecrawl/
  <hostname>/
    index.md          # table of contents
    sources.json      # url, path, title, size per page
    <path>/index.md   # one page per file, frontmatter: source, title
```

## Sites

| Folder | Source | Pages |
|---|---|---|
| [memeanalysis.webflow.io](memeanalysis.webflow.io/index.md) | https://memeanalysis.webflow.io/ | 31 |
