/** Mid-level, composable building blocks assembled by each layout variant. */

import type { LabelSlice, RepobeatsData } from "../types";
import {
	MONO,
	WORDMARK_FAMILY,
	fmt,
	icon,
	rrect,
	stackedBar,
	text,
} from "./primitives";

/** Rough advance width — good enough for laying out short numeric/mono strings. */
function approxWidth(value: string, size: number, factor = 0.6): number {
	return value.length * size * factor;
}

/** Rounded brand-tinted square containing the Titan One "e" mark. */
export function eMark(x: number, y: number, size: number): string {
	const r = size * 0.28;
	return (
		rrect(x, y, size, size, r, { cls: "rb-brand", opacity: 0.12 }) +
		`<text x="${x + size / 2}" y="${y + size * 0.75}" class="rb-brand" text-anchor="middle" font-family="${WORDMARK_FAMILY}" font-size="${size * 0.66}" font-weight="400">e</text>`
	);
}

/** Monospace `owner/repo` with the owner dimmed. */
export function repoName(x: number, baseline: number, size: number, repo: string): string {
	const [owner, name] = repo.split("/");
	const ownerW = approxWidth(`${owner}/`, size, 0.62);
	return (
		`<text x="${x}" y="${baseline}" class="rb-muted" font-family="${MONO}" font-size="${size}" font-weight="500">${owner}/</text>` +
		`<text x="${x + ownerW}" y="${baseline}" class="rb-text" font-family="${MONO}" font-size="${size}" font-weight="600">${name}</text>`
	);
}

/** Uppercase tracked eyebrow label. */
export function eyebrow(x: number, y: number, label: string, anchor: "start" | "end" = "start"): string {
	return text(x, y, label, {
		size: 10.5,
		weight: 600,
		cls: "rb-faint",
		letter: "0.12em",
		anchor,
	});
}

/** Star + fork counts with icons. Returns markup and the total width consumed. */
export function metaChips(
	x: number,
	centerY: number,
	data: RepobeatsData,
	size = 13,
): { svg: string; width: number } {
	let cx = x;
	let svg = "";
	const iconSize = size + 1;
	const iconY = centerY - iconSize / 2;

	svg += icon("star", cx, iconY, iconSize, "rb-faint");
	cx += iconSize + 4;
	const starStr = fmt(data.stars);
	svg += text(cx, centerY + size * 0.34, starStr, { size, weight: 600, cls: "rb-text" });
	cx += approxWidth(starStr, size, 0.62) + 14;

	svg += icon("fork", cx, iconY, iconSize, "rb-faint");
	cx += iconSize + 4;
	const forkStr = fmt(data.forks);
	svg += text(cx, centerY + size * 0.34, forkStr, { size, weight: 600, cls: "rb-text" });
	cx += approxWidth(forkStr, size, 0.62);

	return { svg, width: cx - x };
}

interface KpiOpts {
	icon?: Parameters<typeof icon>[0];
	value: string;
	label: string;
	valueSize?: number;
	accent?: boolean;
}

/** A single KPI: optional icon + large value + caption. `y` is the value baseline. */
export function kpiStat(x: number, y: number, opts: KpiOpts): string {
	const { value, label, valueSize = 25, accent = false } = opts;
	let out = "";
	let vx = x;
	if (opts.icon) {
		const s = valueSize * 0.62;
		out += icon(opts.icon, x, y - s, s, accent ? "rb-brand" : "rb-faint");
		vx = x + s + 7;
	}
	out += text(vx, y, value, {
		size: valueSize,
		weight: 700,
		cls: accent ? "rb-brand" : "rb-text",
	});
	out += text(x, y + 15, label, { size: 11, weight: 500, cls: "rb-muted", letter: "0.01em" });
	return out;
}

interface Block {
	svg: string;
	/** Vertical extent below `y`, so callers can stack blocks without overlap. */
	height: number;
}

/** Open vs. closed issue split as a two-tone pill with counts beneath. */
export function ratioBar(
	x: number,
	y: number,
	w: number,
	data: RepobeatsData,
	clipId: string,
): Block {
	const open = data.totals.issuesOpen;
	const closed = data.totals.issuesClosed;
	const total = open + closed;
	const barY = y + 8;
	const h = 8;
	let out = eyebrow(x, y, "OPEN / CLOSED ISSUES");
	if (total === 0) {
		out += rrect(x, barY, w, h, h / 2, { cls: "rb-track" });
		return { svg: out, height: barY + h - y };
	}
	// Open (green) fills from the left, closed (purple) the remainder — matching
	// the "open" / "closed" captions below.
	const openW = (open / total) * w;
	out += `<clipPath id="${clipId}"><rect x="${x}" y="${barY}" width="${w}" height="${h}" rx="${h / 2}"/></clipPath>`;
	out += `<g clip-path="url(#${clipId})">`;
	out += rrect(x, barY, w, h, 0, { cls: "rb-closed" });
	out += rrect(x, barY, openW, h, 0, { cls: "rb-open" });
	out += `</g>`;

	const cy = barY + h + 16;
	out += `<circle cx="${x + 4}" cy="${cy - 4}" r="3.5" class="rb-open"/>`;
	out += text(x + 13, cy, `${fmt(open)} open`, { size: 11, weight: 600, cls: "rb-muted" });
	out += `<circle cx="${x + w - 3}" cy="${cy - 4}" r="3.5" class="rb-closed"/>`;
	out += text(x + w - 11, cy, `${fmt(closed)} closed`, {
		size: 11,
		weight: 600,
		cls: "rb-muted",
		anchor: "end",
	});
	return { svg: out, height: cy - y + 4 };
}

/** Area-label distribution: stacked pill + wrapping legend. */
export function areaDistribution(
	x: number,
	y: number,
	w: number,
	slices: LabelSlice[],
	clipId: string,
	maxItems = 4,
): Block {
	let out = eyebrow(x, y, "ISSUES BY AREA");
	const barY = y + 8;
	if (slices.length === 0) {
		out += rrect(x, barY, w, 8, 4, { cls: "rb-track" });
		return { svg: out, height: barY + 8 - y };
	}
	out += stackedBar(x, barY, w, 8, slices, clipId);

	// Legend: colour dot + label + count, packed left-to-right and wrapped to width.
	let lx = x;
	let ly = barY + 26;
	const legendSize = 11;
	slices.slice(0, maxItems).forEach((s) => {
		const label = `${s.label} ${s.count}`;
		const itemW = 12 + approxWidth(label, legendSize, 0.56) + 14;
		if (lx > x && lx + itemW > x + w) {
			lx = x;
			ly += 18;
		}
		out += `<circle cx="${lx + 4}" cy="${ly - 3}" r="4" fill="${s.color}"/>`;
		out += text(lx + 12, ly, label, { size: legendSize, weight: 500, cls: "rb-muted" });
		lx += itemW;
	});
	return { svg: out, height: ly - y + 5 };
}

/** Small "updated" caption with the brand-agnostic clock-free wording. */
export function updatedCaption(x: number, y: number, iso: string, anchor: "start" | "end" = "end"): string {
	const d = new Date(iso);
	const label = Number.isNaN(d.getTime())
		? "updated just now"
		: `updated ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`;
	return text(x, y, label, { size: 10.5, weight: 500, cls: "rb-faint", anchor });
}
