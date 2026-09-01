/**
 * Shared constants used across all deployment configurations
 */

/**
 * Default branding values for local/demo modes
 * These are used when environment variables are not set
 *
 * NOTE: Whitelabel mode does NOT use these defaults - all values must be
 * provided via environment variables.
 */
export const DEFAULT_APP_NAME = "Elmo";
export const DEFAULT_APP_ICON = "/icons/elmo-icon.svg";
export const DEFAULT_APP_URL = "http://localhost:3000/";

/**
 * Provider setup guide, linked from SCRAPE_TARGETS errors and the LLMs page.
 * Per-provider anchors are appended to it, so it has to stay the page itself
 * rather than the docs index.
 */
export const PROVIDERS_DOCS_URL = "https://www.elmohq.com/docs/user-guide/providers";

/** Public docs for the REST API and the MCP endpoint, linked from the API keys page. */
export const API_DOCS_URL = "https://www.elmohq.com/docs/api";
export const MCP_DOCS_URL = "https://www.elmohq.com/docs/mcp";

/** Public identifier for the support chat, shared by the app and the marketing site. */
export const CRISP_WEBSITE_ID = "2f79a110-4e29-41a8-b45d-4993df6ff487";

/**
 * Elmo brand constants — used for icon generation, manifest, and the brand kit.
 */
export const ELMO_BRAND_COLOR = "#2563eb"; // blue-600
export const ELMO_BRAND_FONT = "Titan One";
export const ELMO_THEME_COLOR = "#2563eb";
export const ELMO_BACKGROUND_COLOR = "#ffffff";

/**
 * Default chart colors for the Elmo product.
 *
 * 11 base hues (Observable + Tableau, anchored to brand blue) expanded
 * into 55 colors across five lightness tiers: base → dark → light →
 * muted → deep. This keeps harmony (same hue families throughout) while
 * supporting charts with many series. Whitelabel deployments override
 * via VITE_CHART_COLORS.
 *
 * Hue order is load-bearing, not decorative. Charts assign colors by slot,
 * so the earliest slots are the ones that end up side by side most often;
 * the order below is the one that keeps the first four furthest apart under
 * protanopia and deuteranopia. Reordering these is a visible change.
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
