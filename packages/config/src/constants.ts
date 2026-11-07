/** Whitelabel never falls back to these; it must set its own branding. */
export const DEFAULT_APP_NAME = "Elmo";
export const DEFAULT_APP_ICON = "/icons/elmo-icon.svg";
export const DEFAULT_APP_URL = "http://localhost:3000/";

/** Per-provider anchors are appended, so this must stay the page itself, not the docs index. */
export const PROVIDERS_DOCS_URL = "https://www.elmohq.com/docs/user-guide/providers";

/** The public docs, for the hosted product. In the app itself the API and MCP
 * pages document the deployment the viewer is signed in to. */
export const API_DOCS_URL = "https://www.elmohq.com/docs/api";

/** Public identifier for the support chat, shared by the app and the marketing site. */
export const CRISP_WEBSITE_ID = "2f79a110-4e29-41a8-b45d-4993df6ff487";

export const ELMO_BRAND_COLOR = "#2563eb"; // blue-600
export const ELMO_BRAND_FONT = "Titan One";
export const ELMO_THEME_COLOR = "#2563eb";
export const ELMO_BACKGROUND_COLOR = "#ffffff";

/**
 * Whitelabel overrides these via VITE_CHART_COLORS. Hue order is load-bearing:
 * charts assign colors by slot, and this order keeps the first four furthest
 * apart under protanopia and deuteranopia.
 */
export const DEFAULT_CHART_COLORS = [
	// Base
	"#2563eb",
	"#efb118",
	"#ff8ab7",
	"#9c6b4e",
	"#7cb342",
	"#b07aa1",
	"#a463f2",
	"#3ca951",
	"#9498a0",
	"#ff725c",
	"#38b2ac",
	// Dark
	"#0b43bc",
	"#bb8807",
	"#fa478c",
	"#714932",
	"#58842a",
	"#934d7f",
	"#7c1af4",
	"#247a35",
	"#5e6d8d",
	"#f9381a",
	"#22817c",
	// Light
	"#6d94e8",
	"#ebc566",
	"#f877a9",
	"#b09382",
	"#9fc17b",
	"#c6a9be",
	"#b282ed",
	"#6fbe7f",
	"#a9b3c6",
	"#f88877",
	"#6ec4c0",
	// Muted
	"#5178cd",
	"#d0aa49",
	"#eb84ac",
	"#967664",
	"#839b69",
	"#af88a4",
	"#ae87de",
	"#62936c",
	"#8e9ab4",
	"#ea8e80",
	"#5f9b98",
	// Deep
	"#0e3486",
	"#84620b",
	"#f9156d",
	"#493327",
	"#3e5822",
	"#6b435f",
	"#6513c9",
	"#1e5229",
	"#49566e",
	"#db2206",
	"#1c5451",
];

/** Here rather than beside the auth server so the deployment policy rules can
 * read it without pulling better-auth and a database pool into them. */
export const MCP_PATH = "/api/mcp";

/** Where an interrupted MCP sign-in resumes. Named here so the sign-in page
 * need not know the auth base path or the plugin's own. */
export const MCP_AUTHORIZE_ENDPOINT = "/api/auth/oauth2/authorize";

export const API_KEY_RATE_LIMIT_PER_MINUTE = 1_000;
export const API_KEY_PREFIX = "elmo_";
