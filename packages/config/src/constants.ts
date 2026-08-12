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

/** Provider setup guide, linked from SCRAPE_TARGETS errors and the LLMs page. */
export const PROVIDERS_DOCS_URL = "https://docs.elmohq.com/docs/user-guide/providers";

/**
 * Elmo brand constants — used for icon generation, manifest, and the brand kit.
 */
export const ELMO_BRAND_COLOR = "#2563eb"; // blue-600
export const ELMO_BRAND_FONT = "Titan One";
export const ELMO_THEME_COLOR = "#2563eb";
export const ELMO_BACKGROUND_COLOR = "#ffffff";

/**
 * Chart colors for the Elmo product (local, demo, and cloud modes).
 *
 * Eight hue families in a fixed order, anchored to the brand blue, each
 * expanded into three lightness tiers. Both the hues and their order are
 * chosen so that neighbouring series stay separable under protanopia and
 * deuteranopia, and every base color clears 3:1 against the light and dark
 * card surfaces alike — the palette is a single flat list serving both
 * themes, so each color has to work on white and on near-black.
 *
 * Charts pair this with a per-series marker shape, because no eight-color
 * palette can keep every pair distinct under color-vision deficiency; shape
 * carries identity where hue runs out.
 */
export const ELMO_CHART_COLORS = [
	// Base
	"#2563eb",
	"#c85b30",
	"#008d60",
	"#a6710f",
	"#be5a82",
	"#3a8c32",
	"#766fd4",
	"#d2504c",
	// Dark
	"#0036b5",
	"#953402",
	"#0b5e40",
	"#734c00",
	"#90305a",
	"#086100",
	"#5045a6",
	"#a11f24",
	// Light
	"#4f87fd",
	"#eb7a50",
	"#3aac7d",
	"#c68f3a",
	"#e078a0",
	"#5aab51",
	"#938ef6",
	"#f57069",
];

/**
 * Fallback chart colors for whitelabel deployments that don't set
 * VITE_CHART_COLORS. Kept on the original Observable + Tableau hues so
 * existing whitelabel installs render unchanged.
 */
export const DEFAULT_CHART_COLORS = [
	// Base
	"#2563eb",
	"#efb118",
	"#3ca951",
	"#ff725c",
	"#a463f2",
	"#ff8ab7",
	"#38b2ac",
	"#9c6b4e",
	"#7cb342",
	"#b07aa1",
	"#9498a0",
	// Dark
	"#0b43bc",
	"#bb8807",
	"#247a35",
	"#f9381a",
	"#7c1af4",
	"#fa478c",
	"#22817c",
	"#714932",
	"#58842a",
	"#934d7f",
	"#5e6d8d",
	// Light
	"#6d94e8",
	"#ebc566",
	"#6fbe7f",
	"#f88877",
	"#b282ed",
	"#f877a9",
	"#6ec4c0",
	"#b09382",
	"#9fc17b",
	"#c6a9be",
	"#a9b3c6",
	// Muted
	"#5178cd",
	"#d0aa49",
	"#62936c",
	"#ea8e80",
	"#ae87de",
	"#eb84ac",
	"#5f9b98",
	"#967664",
	"#839b69",
	"#af88a4",
	"#8e9ab4",
	// Deep
	"#0e3486",
	"#84620b",
	"#1e5229",
	"#db2206",
	"#6513c9",
	"#f9156d",
	"#1c5451",
	"#493327",
	"#3e5822",
	"#6b435f",
	"#49566e",
];
