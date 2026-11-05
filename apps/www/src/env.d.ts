/// <reference types="vite/client" />

// App version injected by Vite `define` (see vite.config.ts) from this
// package's package.json, which shares the fixed workspace release version.
declare const __APP_VERSION__: string;

// Day the OpenAPI spec last changed in git (see vite.config.ts); null without full history.
declare const __API_SPEC_UPDATED__: string | null;
