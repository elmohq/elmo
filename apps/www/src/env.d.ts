/// <reference types="vite/client" />

// App version injected by Vite `define` (see vite.config.ts) from this
// package's package.json, which shares the fixed workspace release version.
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
	/** Crisp support chat website ID. Absent in builds without support chat. */
	readonly VITE_CRISP_WEBSITE_ID?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
