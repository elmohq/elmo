/**
 * The repo-activity graphic: a flat, airy Repobeats-style card. A row of
 * 30-day KPI numerals, a full-width smooth commit-trend chart, and a bottom
 * band with the area-label split, open/closed issue ratio, and bot-filtered
 * contributor avatars. No logo, repo name, or star/fork counts — those are
 * already on the GitHub page this renders above.
 */

import { MAX_CONTRIB_AVATARS } from "../constants";
import type { RepobeatsData } from "../types";
import {
	DISPLAY_FAMILY,
	avatarRow,
	fmt,
	hairline,
	monotonePath,
	svgDoc,
	text,
} from "./primitives";
import { areaDistribution, eyebrow, ratioBar } from "./shared";

const W = 840;
const H = 360;
const P = 28;

/** "Jul 8, 2:45 PM PDT" — San Francisco time, so the freshness reads consistently. */
function updatedLabel(iso: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return "";
	return d.toLocaleString("en-US", {
		timeZone: "America/Los_Angeles",
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
		timeZoneName: "short",
	});
}

/** A KPI: large Titan One numeral over a small tracked caption. `y` is the numeral baseline. */
function kpi(x: number, y: number, value: string, label: string, accent = false): string {
	return (
		text(x, y, value, {
			size: 31,
			weight: 400,
			family: DISPLAY_FAMILY,
			cls: accent ? "rb-brand" : "rb-text",
		}) + text(x, y + 21, label.toUpperCase(), { size: 10, weight: 600, cls: "rb-muted", letter: "0.09em" })
	);
}

/** Smooth (monotone-spline) commit-per-week trend with a soft brand fill and a baseline. */
function commitTrend(x: number, y: number, w: number, h: number, values: number[]): string {
	if (values.length === 0) {
		return text(x + w / 2, y + h / 2, "commit stats warming up…", {
			size: 11,
			cls: "rb-faint",
			anchor: "middle",
		});
	}
	const max = Math.max(1, ...values);
	const n = values.length;
	const xs = values.map((_, i) => (n <= 1 ? x + w / 2 : x + (i / (n - 1)) * w));
	const ys = values.map((v) => y + h - (v / max) * h);
	const line = monotonePath(xs, ys);
	const area = `${line} L${xs[n - 1].toFixed(2)} ${(y + h).toFixed(2)} L${xs[0].toFixed(2)} ${(y + h).toFixed(2)} Z`;
	const lastX = xs[n - 1].toFixed(2);
	const lastY = ys[n - 1].toFixed(2);
	return (
		hairline(x, y + h, x + w, y + h) +
		`<path d="${area}" fill="url(#rb-trend-fill)"/>` +
		`<path d="${line}" class="rb-brand-s" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` +
		`<circle cx="${lastX}" cy="${lastY}" r="3.2" class="rb-brand"/>`
	);
}

export function renderDashboard(data: RepobeatsData): string {
	const contentW = W - P * 2;
	let body = "";

	// ---- KPI band ------------------------------------------------------------
	body += eyebrow(P, 42, "LAST 30 DAYS");
	const updated = updatedLabel(data.generatedAt);
	if (updated) {
		body += text(W - P, 42, `UPDATED ${updated.toUpperCase()}`, {
			size: 10,
			weight: 600,
			cls: "rb-faint",
			letter: "0.09em",
			anchor: "end",
		});
	}
	const kpis = [
		{ value: fmt(data.kpis.commits), label: "Commits", accent: true },
		{ value: fmt(data.kpis.prsMerged), label: "PRs merged" },
		{ value: fmt(data.kpis.issuesClosed), label: "Issues closed" },
		{ value: fmt(data.kpis.releases), label: "Releases" },
		{ value: fmt(data.contributorTotal), label: "Contributors" },
	];
	const slot = contentW / kpis.length;
	kpis.forEach((k, i) => {
		body += kpi(P + i * slot, 86, k.value, k.label, k.accent);
	});
	body += hairline(P, 126, W - P, 126);

	// ---- Commit trend (full width) ------------------------------------------
	body += eyebrow(P, 158, "COMMITS PER WEEK");
	body += text(W - P, 158, "last 30 weeks", { size: 10.5, weight: 500, cls: "rb-faint", anchor: "end" });
	body += commitTrend(P, 172, contentW, 78, data.commitsByWeek.map((p) => p.total));
	body += hairline(P, 278, W - P, 278);

	// ---- Bottom band: area split · open/closed · contributors ----------------
	const bandY = 300;
	const areaW = 344;
	body += areaDistribution(P, bandY, areaW, data.areaLabels, "rb-area", 3).svg;

	const ratioX = P + areaW + 28;
	const ratioW = 196;
	body += ratioBar(ratioX, bandY, ratioW, data, "rb-ratio").svg;

	const contribX = ratioX + ratioW + 32;
	body += eyebrow(contribX, bandY, "CONTRIBUTORS");
	const shown = data.contributors.slice(0, MAX_CONTRIB_AVATARS);
	const extra = Math.max(0, data.contributorTotal - shown.length);
	body += avatarRow(contribX, bandY + 24, 12, shown, extra, "rb-av", 5);

	return svgDoc(W, H, body, `${data.repo} — repository activity, last 30 days`);
}
