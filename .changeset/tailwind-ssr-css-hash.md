---
"@workspace/web": patch
---

Fix missing stylesheet and favicon in Docker builds caused by `@tailwindcss/vite` emitting different CSS hashes in the client and SSR passes.
