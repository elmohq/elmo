/** Entry point for rendering the repo-activity SVG (single light-mode dashboard). */

import { REPO } from "../constants";
import type { RepobeatsData } from "../types";
import { svgDoc, text } from "./primitives";
import { renderDashboard } from "./dashboard";

export function renderRepobeats(data: RepobeatsData): string {
	return renderDashboard(data);
}

/** Rendered when data is completely unavailable, so the README image never breaks. */
export function renderFallback(): string {
	const w = 480;
	const h = 96;
	const body = text(w / 2, h / 2 + 4, `${REPO} · activity unavailable`, {
		size: 13,
		cls: "rb-muted",
		anchor: "middle",
	});
	return svgDoc(w, h, body, `${REPO} — repository activity`);
}
