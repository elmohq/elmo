---
"@workspace/web": patch
---

Brand settings and the onboarding wizard now reject an additional domain that the website or another domain in the list already covers, so adding `blog.acme.com` alongside `acme.com` tells you why instead of accepting an entry that does nothing.
