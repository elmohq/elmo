/**
 * Low-level SVG string builders shared by the renderers. Pure functions that
 * return markup — no DOM, no React — so they run identically in the Nitro
 * route handler and the standalone sample generator.
 */

import { TITAN_ONE_DATA_URI } from "../fonts";
import { THEME, themeStyleBlock } from "../theme";
import type { LabelSlice, RepoContributor } from "../types";

const SANS =
	"-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
/** Titan One — the brand display face, used for the large KPI numerals. */
export const DISPLAY_FAMILY = "'Titan One','Trebuchet MS',system-ui,sans-serif";

function esc(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

/** Compact count: 1234 → "1.2k". */
export function fmt(n: number): string {
	if (!Number.isFinite(n)) return "0";
	if (Math.abs(n) < 1000) return String(Math.round(n));
	const k = n / 1000;
	if (Math.abs(k) < 10) return `${k.toFixed(1)}k`;
	if (Math.abs(k) < 1000) return `${Math.round(k)}k`;
	return `${(n / 1_000_000).toFixed(1)}m`;
}

function round(n: number): number {
	return Math.round(n * 100) / 100;
}

interface TextOpts {
	size?: number;
	weight?: number;
	cls?: string;
	anchor?: "start" | "middle" | "end";
	family?: string;
	letter?: string;
	opacity?: number;
}

export function text(x: number, y: number, content: string, opts: TextOpts = {}): string {
	const { size = 13, weight = 400, cls = "rb-text", anchor = "start", family, letter, opacity } =
		opts;
	const attrs = [
		`x="${round(x)}"`,
		`y="${round(y)}"`,
		`class="${cls}"`,
		`font-size="${size}"`,
		`font-weight="${weight}"`,
		`text-anchor="${anchor}"`,
	];
	if (family) attrs.push(`font-family="${family}"`);
	if (letter) attrs.push(`letter-spacing="${letter}"`);
	if (opacity != null) attrs.push(`opacity="${opacity}"`);
	return `<text ${attrs.join(" ")}>${esc(content)}</text>`;
}

interface RectOpts {
	cls?: string;
	fill?: string;
	opacity?: number;
}

export function rrect(
	x: number,
	y: number,
	w: number,
	h: number,
	r: number,
	opts: RectOpts = {},
): string {
	const attrs = [
		`x="${round(x)}"`,
		`y="${round(y)}"`,
		`width="${round(w)}"`,
		`height="${round(h)}"`,
		`rx="${round(r)}"`,
	];
	if (opts.cls) attrs.push(`class="${opts.cls}"`);
	if (opts.fill) attrs.push(`fill="${opts.fill}"`);
	if (opts.opacity != null) attrs.push(`opacity="${opts.opacity}"`);
	return `<rect ${attrs.join(" ")}/>`;
}

/** 1px separator line; pass `.5` offsets on the fixed axis for crisp rendering. */
export function hairline(
	x1: number,
	y1: number,
	x2: number,
	y2: number,
	opts: { cls?: string } = {},
): string {
	return `<line x1="${round(x1)}" y1="${round(y1)}" x2="${round(x2)}" y2="${round(y2)}" class="${opts.cls ?? "rb-line"}" stroke-width="1"/>`;
}

/**
 * Monotone-cubic (Fritsch–Carlson) spline through the points — smooth like a
 * trend line but never overshooting the data, so zero-commit weeks hug the
 * baseline instead of dipping below it.
 */
export function monotonePath(xs: number[], ys: number[]): string {
	const n = Math.min(xs.length, ys.length);
	if (n === 0) return "";
	let d = `M${round(xs[0])} ${round(ys[0])}`;
	if (n === 1) return d;
	const slope: number[] = [];
	for (let i = 0; i < n - 1; i++) {
		slope.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i] || 1));
	}
	const m: number[] = [slope[0]];
	for (let i = 1; i < n - 1; i++) {
		m.push(slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2);
	}
	m.push(slope[n - 2]);
	for (let i = 0; i < n - 1; i++) {
		if (slope[i] === 0) {
			m[i] = 0;
			m[i + 1] = 0;
			continue;
		}
		const a = m[i] / slope[i];
		const b = m[i + 1] / slope[i];
		const s = a * a + b * b;
		if (s > 9) {
			const t = 3 / Math.sqrt(s);
			m[i] = t * a * slope[i];
			m[i + 1] = t * b * slope[i];
		}
	}
	for (let i = 0; i < n - 1; i++) {
		const h = xs[i + 1] - xs[i];
		d += ` C${round(xs[i] + h / 3)} ${round(ys[i] + (m[i] * h) / 3)},${round(
			xs[i + 1] - h / 3,
		)} ${round(ys[i + 1] - (m[i + 1] * h) / 3)},${round(xs[i + 1])} ${round(ys[i + 1])}`;
	}
	return d;
}

/** Opens the SVG document: root element, embedded font, theme classes, gradients. */
export function svgDoc(width: number, height: number, body: string, title: string): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" role="img" aria-label="${esc(title)}">
<title>${esc(title)}</title>
<defs>
<style>
@font-face{font-family:'Titan One';font-style:normal;font-weight:400;src:url(${TITAN_ONE_DATA_URI}) format('woff2');}
text{font-family:${SANS};}
${themeStyleBlock()}
</style>
<linearGradient id="rb-trend-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${THEME.brand}" stop-opacity="0.24"/><stop offset="1" stop-color="${THEME.brand}" stop-opacity="0.02"/></linearGradient>
</defs>
<rect width="${width}" height="${height}" rx="12" class="rb-bg"/>
<rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="11" fill="none" class="rb-line" stroke-width="1"/>
${body}
</svg>`;
}

/** Proportional horizontal stacked bar (rounded pill), used for label distributions. */
export function stackedBar(
	x: number,
	y: number,
	w: number,
	h: number,
	slices: LabelSlice[],
	clipId: string,
): string {
	const total = slices.reduce((sum, s) => sum + s.count, 0) || 1;
	let segments = "";
	let cursor = x;
	slices.forEach((s) => {
		const sw = (s.count / total) * w;
		segments += `<rect x="${round(cursor)}" y="${round(y)}" width="${round(sw + 0.6)}" height="${round(h)}" fill="${s.color}"/>`;
		cursor += sw;
	});
	return `<clipPath id="${clipId}"><rect x="${round(x)}" y="${round(y)}" width="${round(w)}" height="${round(h)}" rx="${h / 2}"/></clipPath><g clip-path="url(#${clipId})">${segments}</g>`;
}

/** Circular contributor avatar with a themed ring; falls back to a login initial. */
function avatar(cx: number, cy: number, r: number, c: RepoContributor, id: string): string {
	let out = `<clipPath id="${id}"><circle cx="${round(cx)}" cy="${round(cy)}" r="${round(r)}"/></clipPath>`;
	if (c.avatarDataUri) {
		out += `<image x="${round(cx - r)}" y="${round(cy - r)}" width="${round(r * 2)}" height="${round(r * 2)}" href="${c.avatarDataUri}" xlink:href="${c.avatarDataUri}" clip-path="url(#${id})" preserveAspectRatio="xMidYMid slice"/>`;
	} else {
		out += `<circle cx="${round(cx)}" cy="${round(cy)}" r="${round(r)}" class="rb-track"/>`;
		out += text(cx, cy + r * 0.34, (c.login[0] ?? "?").toUpperCase(), {
			size: r,
			weight: 700,
			cls: "rb-muted",
			anchor: "middle",
		});
	}
	out += `<circle cx="${round(cx)}" cy="${round(cy)}" r="${round(r)}" fill="none" class="rb-ring" stroke-width="1.5"/>`;
	return out;
}

/** A row of avatars starting at (x, cy), plus a "+N" chip when some are hidden. */
export function avatarRow(
	x: number,
	cy: number,
	r: number,
	contributors: RepoContributor[],
	extra: number,
	idPrefix: string,
	gap = 6,
): string {
	let out = "";
	let cx = x + r;
	contributors.forEach((c, i) => {
		out += avatar(cx, cy, r, c, `${idPrefix}-${i}`);
		cx += r * 2 + gap;
	});
	if (extra > 0) {
		out += `<circle cx="${round(cx)}" cy="${round(cy)}" r="${round(r)}" class="rb-track"/>`;
		out += `<circle cx="${round(cx)}" cy="${round(cy)}" r="${round(r)}" fill="none" class="rb-ring" stroke-width="1.5"/>`;
		out += text(cx, cy + r * 0.34, `+${extra}`, {
			size: r * 0.85,
			weight: 700,
			cls: "rb-muted",
			anchor: "middle",
		});
	}
	return out;
}
