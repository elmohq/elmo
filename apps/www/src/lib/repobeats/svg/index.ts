/** Variant dispatch + a minimal always-valid fallback graphic. */

import { REPO } from "../constants";
import { palette } from "../theme";
import type { RepobeatsData, RepobeatsTheme, RepobeatsVariant } from "../types";
import { accentRule, svgDoc, text, wordmark } from "./primitives";
import { renderCard } from "./card";
import { renderDashboard } from "./dashboard";
import { renderPulse } from "./pulse";

export function resolveVariant(input: string | null | undefined): RepobeatsVariant {
	if (input === "dashboard" || input === "card") return input;
	return "pulse";
}

export function renderRepobeats(
	data: RepobeatsData,
	opts: { variant: RepobeatsVariant; theme: RepobeatsTheme },
): string {
	const pal = palette(opts.theme);
	switch (opts.variant) {
		case "dashboard":
			return renderDashboard(data, pal);
		case "card":
			return renderCard(data, pal);
		default:
			return renderPulse(data, pal);
	}
}

/** Rendered when data is completely unavailable, so the README image never breaks. */
export function renderFallback(theme: RepobeatsTheme): string {
	const pal = palette(theme);
	const w = 460;
	const h = 120;
	let body = wordmark(24, 58, 34);
	body += text(24, 84, `${REPO} · activity unavailable`, {
		size: 12,
		cls: "rb-muted",
	});
	body += accentRule(24, h - 14, w - 48, 3, 1.5);
	return svgDoc(w, h, pal, body, `${REPO} — repository activity`);
}
