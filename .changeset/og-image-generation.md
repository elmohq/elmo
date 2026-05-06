---
"@workspace/web": patch
---

Fix OG image generation: `og:image` is now an absolute URL and renders the current page's title/description. Adds `og:url`, `og:site_name`, `og:locale`, and `og:logo` to the document head.
