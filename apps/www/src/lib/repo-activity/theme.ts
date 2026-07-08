/**
 * Light-only colour theme for the repo-activity SVG.
 *
 * Themeable colours are exposed both as raw values (`THEME`, for gradients) and
 * as a `<style>` block of `.rb-*` classes (`themeStyleBlock`). The SVG is only
 * ever shown light-mode in the README, so there is no dark/auto variant.
 */

export const THEME = {
	bg: "#ffffff",
	line: "#e8edf3",
	text: "#0f172a",
	muted: "#64748b",
	faint: "#94a3b8",
	brand: "#2563eb",
	track: "#eef2f7",
	open: "#3ca951",
	closed: "#a463f2",
	ring: "#e2e8f0",
} as const;

type ThemeKey = keyof typeof THEME;

const CLASS_RULES: Array<[ThemeKey, string]> = [
	["bg", ".rb-bg{fill:$}"],
	["line", ".rb-line{stroke:$}"],
	["text", ".rb-text{fill:$}"],
	["muted", ".rb-muted{fill:$}"],
	["faint", ".rb-faint{fill:$}"],
	["brand", ".rb-brand{fill:$}.rb-brand-s{stroke:$}"],
	["track", ".rb-track{fill:$}.rb-track-s{stroke:$}"],
	["open", ".rb-open{fill:$}"],
	["closed", ".rb-closed{fill:$}"],
	["ring", ".rb-ring{stroke:$}"],
];

/** The `<style>` body defining the `.rb-*` classes. */
export function themeStyleBlock(): string {
	return CLASS_RULES.map(([key, tmpl]) => tmpl.replaceAll("$", THEME[key])).join("");
}
