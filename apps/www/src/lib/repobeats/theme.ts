/**
 * Colour themes for the repo-activity SVG.
 *
 * Themeable colours are exposed as CSS classes in a `<style>` block rather than
 * inline attributes. GitHub renders README SVGs as isolated `<img>` documents
 * that apply `<style>`/`@media` but block scripts and external fetches — the
 * same mechanism the existing `elmo-icon.svg` relies on. This lets a single
 * `theme=auto` file follow `prefers-color-scheme`, while `light`/`dark` emit a
 * fixed palette for maximum renderer compatibility.
 */

import type { RepobeatsTheme } from "./types";

interface ThemeColors {
	bg: string;
	panel: string;
	panelBorder: string;
	text: string;
	muted: string;
	faint: string;
	brand: string;
	track: string;
	add: string;
	del: string;
	open: string;
	closed: string;
	ring: string;
}

const LIGHT: ThemeColors = {
	bg: "#ffffff",
	panel: "#f8fafc",
	panelBorder: "#e8edf3",
	text: "#0f172a",
	muted: "#64748b",
	faint: "#94a3b8",
	brand: "#2563eb",
	track: "#eef2f7",
	add: "#3ca951",
	del: "#ff725c",
	open: "#3ca951",
	closed: "#8b5cf6",
	ring: "#e2e8f0",
};

const DARK: ThemeColors = {
	bg: "#0d1117",
	panel: "#161b22",
	panelBorder: "#242c38",
	text: "#e6edf3",
	muted: "#9198a1",
	faint: "#6e7781",
	brand: "#4f8bff",
	track: "#21262d",
	add: "#3fb950",
	del: "#f85149",
	open: "#3fb950",
	closed: "#a371f7",
	ring: "#30363d",
};

/** Maps each themeable colour to the CSS declarations that consume it. */
const CLASS_RULES: Array<[keyof ThemeColors, string]> = [
	["bg", ".rb-bg{fill:$}"],
	["panel", ".rb-panel{fill:$}"],
	["panelBorder", ".rb-panel-b{stroke:$}"],
	["text", ".rb-text{fill:$}"],
	["muted", ".rb-muted{fill:$}"],
	["faint", ".rb-faint{fill:$}"],
	["brand", ".rb-brand{fill:$}.rb-brand-s{stroke:$}"],
	["track", ".rb-track{fill:$}"],
	["add", ".rb-add{fill:$}"],
	["del", ".rb-del{fill:$}"],
	["open", ".rb-open{fill:$}"],
	["closed", ".rb-closed{fill:$}"],
	["ring", ".rb-ring{stroke:$}"],
];

function rules(colors: ThemeColors): string {
	return CLASS_RULES.map(([key, tmpl]) => tmpl.replaceAll("$", colors[key])).join("");
}

export class Palette {
	readonly mode: RepobeatsTheme;
	/** Concrete colours for the default (non-dark) rendering — used for gradients, avatar rings, etc. */
	readonly base: ThemeColors;

	constructor(mode: RepobeatsTheme) {
		this.mode = mode;
		this.base = mode === "dark" ? DARK : LIGHT;
	}

	/** The `<style>` body defining the `.rb-*` classes (plus a dark `@media` block for `auto`). */
	classStyles(): string {
		if (this.mode === "auto") {
			return `${rules(LIGHT)}@media(prefers-color-scheme:dark){${rules(DARK)}}`;
		}
		return rules(this.base);
	}
}

export function resolveTheme(input: string | null | undefined): RepobeatsTheme {
	if (input === "dark" || input === "auto") return input;
	return "light";
}

export function palette(theme: RepobeatsTheme): Palette {
	return new Palette(theme);
}
