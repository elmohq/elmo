---
"@workspace/web": patch
---

Saving brand settings now drops additional domains that a broader tracked domain already covers, so adding `blog.acme.com` alongside `acme.com` no longer leaves a redundant entry in the list.
