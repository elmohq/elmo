---
"@workspace/ui": minor
"@workspace/web": minor
"@workspace/www": minor
"@workspace/whitelabel": patch
"@workspace/docs": patch
---

Migrate shadcn UI components from Radix to Base UI (closes #104).

`@workspace/ui` now uses `@base-ui/react` primitives, regenerated from the `base-vega` shadcn registry. All `@radix-ui/*` packages have been removed. Consumer call sites updated to use Base UI's `render` prop in place of Radix's `asChild`, and Radix CSS attributes/variables (`data-[state=open]`, `--radix-*`) updated to Base UI equivalents (`data-popup-open`, `--anchor-width`).
