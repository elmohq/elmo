/**
 * "Pulse" — a wide, short activity strip (the closest 1:1 replacement for the
 * Repobeats embed). Header + a row of 30-day KPIs + a full-width commit chart
 * with release markers, plus a right-aligned contributor cluster.
 */

import { MAX_CONTRIB_AVATARS } from "../constants";
import type { Palette } from "../theme";
import type { RepobeatsData } from "../types";
import {
	accentRule,
	barChart,
	fmt,
	svgDoc,
	text,
} from "./primitives";
import { avatarRow } from "./primitives";
import { eMark, eyebrow, kpiStat, metaChips, repoName } from "./shared";

const W = 840;
const H = 200;
const P = 24;
const RELEASE_COLOR = "#ee964b";

export function renderPulse(data: RepobeatsData, pal: Palette): string {
	const contentW = W - P * 2;
	let body = "";

	// ---- Header --------------------------------------------------------------
	body += eMark(P, 18, 42);
	body += repoName(P + 56, 37, 15, data.repo);
	body += metaChips(P + 56, 54, data, 12).svg;

	body += eyebrow(W - P, 28, "REPO ACTIVITY · LAST 30 DAYS", "end");

	// Right-aligned contributor cluster.
	const r = 13;
	const gap = 5;
	const shown = data.contributors.slice(0, MAX_CONTRIB_AVATARS);
	const extra = Math.max(0, data.contributorTotal - shown.length);
	const rowWidth = (shown.length + (extra > 0 ? 1 : 0)) * (r * 2 + gap) - gap;
	body += avatarRow(W - P - rowWidth, 56, r, shown, extra, "pulse-av", gap);

	// ---- KPI row -------------------------------------------------------------
	const kpis = [
		{ icon: "commit" as const, value: fmt(data.kpis.commits), label: "Commits" },
		{ icon: "pr" as const, value: fmt(data.kpis.prsMerged), label: "PRs merged" },
		{ icon: "issue" as const, value: fmt(data.kpis.issuesClosed), label: "Issues closed" },
		{ icon: "tag" as const, value: fmt(data.kpis.releases), label: "Releases" },
	];
	const slot = contentW / kpis.length;
	kpis.forEach((k, i) => {
		body += kpiStat(P + i * slot, 116, { ...k, valueSize: 26, accent: i === 0 });
	});

	// ---- Commit chart --------------------------------------------------------
	const chartY = 158;
	const chartH = 30;
	body += eyebrow(P, 150, "COMMITS PER WEEK");
	body += `<circle cx="${W - P - 58}" cy="146.5" r="3" fill="${RELEASE_COLOR}"/>`;
	body += text(W - P - 50, 150, "release", { size: 10.5, weight: 600, cls: "rb-faint" });
	body += barChart(P, chartY, contentW, chartH, data.commitsByWeek, data.releaseWeeks, {
		markerTop: 150,
	});

	// ---- Footer accent -------------------------------------------------------
	body += accentRule(P, H - 6, contentW, 3, 1.5);

	return svgDoc(W, H, pal, body, `${data.repo} — repository activity, last 30 days`);
}
