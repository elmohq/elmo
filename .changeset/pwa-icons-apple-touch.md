---
"@workspace/web": patch
---

Add PNG PWA icons (192×192, 512×512, and a 180×180 Apple touch icon) plus `theme-color` and `apple-mobile-web-app-title` meta tags so the favicon, Android installer, and iOS home-screen icon all render for local/demo deployments. Whitelabel deployments continue to use their configured `branding.icon` URL for both favicon and touch icon.
