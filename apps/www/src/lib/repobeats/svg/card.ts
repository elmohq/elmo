/**
 * "Card" — a compact, brand-forward badge (wordmark hero + 2×2 KPI grid + a
 * commit sparkline + contributor avatars). Sized for a README sidebar column.
 */

import { MAX_CONTRIB_AVATARS } from "../constants";
import type { Palette } from "../theme";
import type { RepobeatsData } from "../types";
import {
	accentRule,
	avatarRow,
	fmt,
	sparkArea,
	svgDoc,
	text,
	wordmark,
} from "./primitives";
import { eyebrow, kpiStat, metaChips, repoName, updatedCaption } from "./shared";

const W = 460;
const H = 300;
const P = 22;

export function renderCard(data: RepobeatsData, pal: Palette): string {
	const contentW = W - P * 2;
	let body = "";

	// ---- Header --------------------------------------------------------------
	body += wordmark(P, 48, 36);
	body += repoName(P + 2, 70, 13, data.repo);
	const meta = metaChips(0, 0, data, 12.5);
	body += metaChips(W - P - meta.width, 34, data, 12.5).svg;
	body += eyebrow(W - P, 58, "LAST 30 DAYS", "end");

	// ---- KPI grid (2×2) ------------------------------------------------------
	const colW = contentW / 2;
	const kpis = [
		{ icon: "commit" as const, value: fmt(data.kpis.commits), label: "Commits", accent: true },
		{ icon: "pr" as const, value: fmt(data.kpis.prsMerged), label: "PRs merged" },
		{ icon: "issue" as const, value: fmt(data.kpis.issuesClosed), label: "Issues closed" },
		{ icon: "tag" as const, value: fmt(data.kpis.releases), label: "Releases" },
	];
	kpis.forEach((k, i) => {
		const kx = P + (i % 2) * colW;
		const ky = 116 + Math.floor(i / 2) * 52;
		body += kpiStat(kx, ky, { ...k, valueSize: 24 });
	});

	// ---- Commit sparkline ----------------------------------------------------
	body += eyebrow(P, 210, "COMMITS PER WEEK · LAST 30 WEEKS");
	const values = data.commitsByWeek.map((p) => p.total);
	if (values.length > 0) {
		body += sparkArea(P, 218, contentW, 40, values);
	} else {
		body += text(P + contentW / 2, 240, "commit stats warming up…", {
			size: 11,
			cls: "rb-faint",
			anchor: "middle",
		});
	}

	// ---- Footer: avatars + updated + accent ----------------------------------
	const shown = data.contributors.slice(0, MAX_CONTRIB_AVATARS);
	const extra = Math.max(0, data.contributorTotal - shown.length);
	body += avatarRow(P, 282, 10, shown, extra, "card-av", 5);
	body += updatedCaption(W - P, 286, data.generatedAt, "end");
	body += accentRule(P, H - 6, contentW, 3, 1.5);

	return svgDoc(W, H, pal, body, `${data.repo} — repository activity, last 30 days`);
}
