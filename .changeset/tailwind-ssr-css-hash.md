---
"@workspace/web": patch
---

Fix missing stylesheet in Docker/Alpine builds. `@tailwindcss/vite`'s module-graph scanner produces different CSS bytes in the client and SSR Vite builds on Linux, so the SSR-rendered `<link href>` pointed at a hashed file the client build never wrote — manifesting as a 404 on `/assets/styles-*.css` and a missing favicon on the demo instance. Opting out with `@import "tailwindcss" source(none)` and keeping our existing explicit `@source` directives makes both builds produce the same CSS. See tailwindlabs/tailwindcss#16389 and TanStack/router#4959.
