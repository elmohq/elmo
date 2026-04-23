---
"@workspace/web": patch
---

Replace the page-top demo-mode banner with a compact "Demo" pill next to the sidebar logo (with a tooltip explaining the read-only behavior), and move version / elmohq.com / GitHub links into the sidebar footer for every deployment mode except whitelabel. Also reads the better-auth `user.image` field so avatars actually render.
