---
"@workspace/web": patch
"@workspace/lib": patch
---

Brand settings and the onboarding wizard now reject an additional domain that the website or another domain in the list already covers, and brand analysis stops suggesting them, so `blog.acme.com` alongside `acme.com` tells you why instead of adding an entry that does nothing.
