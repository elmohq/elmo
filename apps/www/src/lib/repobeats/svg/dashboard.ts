/**
 * "Dashboard" — the rich snapshot: a row of KPI tiles, a hero commit chart with
 * release markers, and an insights panel (area distribution, open/closed issue
 * split, contributor avatars).
 */

import { MAX_CONTRIB_AVATARS } from "../constants";
import type { Palette } from "../theme";
import type { RepobeatsData } from "../types";
import { accentRule, avatarRow, barChart, fmt, panel, svgDoc, text } from "./primitives";
import {
	areaDistribution,
	eMark,
	eyebrow,
	kpiStat,
	metaChips,
	ratioBar,
	repoName,
	updatedCaption,
} from "./shared";

const W = 840;
const H = 384;
const P = 24;
const RELEASE_COLOR = "#ee964b";

function truncate(value: string, max: number): string {
	return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function renderDashboard(data: RepobeatsData, pal: Palette): string {
	const contentW = W - P * 2;
	let body = "";

	// ---- Header --------------------------------------------------------------
	body += eMark(P, 20, 44);
	body += repoName(P + 60, 42, 17, data.repo);
	if (data.description) {
		body += text(P + 60, 61, truncate(data.description, 58), { size: 12.5, cls: "rb-muted" });
	}
	const meta = metaChips(0, 0, data, 13);
	body += metaChips(W - P - meta.width, 38, data, 13).svg;
	body += updatedCaption(W - P, 58, data.generatedAt, "end");

	// ---- KPI tiles -----------------------------------------------------------
	body += eyebrow(P, 84, "LAST 30 DAYS");
	const kpis = [
		{ icon: "commit" as const, value: fmt(data.kpis.commits), label: "Commits" },
		{ icon: "pr" as const, value: fmt(data.kpis.prsMerged), label: "PRs merged" },
		{ icon: "issue" as const, value: fmt(data.kpis.issuesClosed), label: "Issues closed" },
		{ icon: "tag" as const, value: fmt(data.kpis.releases), label: "Releases" },
		{ icon: "people" as const, value: fmt(data.contributorTotal), label: "Contributors" },
	];
	const gap = 12;
	const tileW = (contentW - gap * (kpis.length - 1)) / kpis.length;
	const tileY = 94;
	const tileH = 68;
	kpis.forEach((k, i) => {
		const tx = P + i * (tileW + gap);
		body += panel(tx, tileY, tileW, tileH, 12);
		body += kpiStat(tx + 16, tileY + 40, { ...k, valueSize: 26, accent: i === 0 });
	});

	// ---- Hero commit chart ---------------------------------------------------
	const panelY = 178;
	const panelH = 182;
	const chartPanelW = 484;
	body += panel(P, panelY, chartPanelW, panelH, 14);
	body += eyebrow(P + 16, panelY + 26, "COMMITS PER WEEK · LAST 30 WEEKS");
	body += `<circle cx="${P + chartPanelW - 74}" cy="${panelY + 22.5}" r="3" fill="${RELEASE_COLOR}"/>`;
	body += text(P + chartPanelW - 66, panelY + 26, "release", { size: 10.5, weight: 600, cls: "rb-faint" });
	const cX = P + 16;
	const cW = chartPanelW - 32;
	const cY = panelY + 48;
	const cH = 96;
	body += barChart(cX, cY, cW, cH, data.commitsByWeek, data.releaseWeeks, { markerTop: panelY + 36 });
	body += text(cX, cY + cH + 20, "30 weeks ago", { size: 10, cls: "rb-faint" });
	body += text(cX + cW, cY + cH + 20, "this week", { size: 10, cls: "rb-faint", anchor: "end" });

	// ---- Insights panel (stacked dynamically) --------------------------------
	const insX = P + chartPanelW + 16;
	const insW = contentW - chartPanelW - 16;
	body += panel(insX, panelY, insW, panelH, 14);
	const ix = insX + 16;
	const iw = insW - 32;

	const area = areaDistribution(ix, panelY + 24, iw, data.areaLabels, "dash-area", 4);
	body += area.svg;
	const ratioY = panelY + 24 + area.height + 16;
	const ratio = ratioBar(ix, ratioY, iw, data, "dash-ratio");
	body += ratio.svg;
	const contribY = ratioY + ratio.height + 20;
	body += eyebrow(ix, contribY, "CONTRIBUTORS");
	const shown = data.contributors.slice(0, MAX_CONTRIB_AVATARS);
	const extra = Math.max(0, data.contributorTotal - shown.length);
	body += avatarRow(ix, contribY + 18, 11, shown, extra, "dash-av", 5);

	// ---- Footer accent -------------------------------------------------------
	body += accentRule(P, H - 8, contentW, 3, 1.5);

	return svgDoc(W, H, pal, body, `${data.repo} — repository activity dashboard, last 30 days`);
}
