/** Mid-level, composable building blocks assembled by the dashboard layout. */

import type { LabelSlice, RepoActivityData } from "../types";
import { fmt, rrect, stackedBar, text } from "./primitives";

/** Rough advance width — good enough for laying out short label strings. */
function approxWidth(value: string, size: number, factor = 0.6): number {
	return value.length * size * factor;
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
	data: RepoActivityData,
	clipId: string,
): Block {
	const open = data.totals.issuesOpen;
	const closed = data.totals.issuesClosed;
	const total = open + closed;
	const barY = y + 12;
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

	const cy = barY + h + 18;
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
	const barY = y + 12;
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
