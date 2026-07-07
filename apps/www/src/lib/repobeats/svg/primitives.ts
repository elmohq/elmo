/**
 * Low-level SVG string builders shared by every layout variant. Pure functions
 * that return markup — no DOM, no React — so they run identically in the Nitro
 * route handler and the standalone sample generator.
 */

import { ACCENT_GRADIENT } from "../constants";
import { TITAN_ONE_DATA_URI } from "../fonts";
import type { LabelSlice, RepoContributor, WeekPoint } from "../types";
import type { Palette } from "../theme";

const SANS =
	"-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
export const MONO =
	"ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace";
export const WORDMARK_FAMILY = "'Titan One','Trebuchet MS',system-ui,sans-serif";

const RELEASE_COLOR = "#ee964b";

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
	stroke?: string;
	strokeWidth?: number;
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
	if (opts.stroke) attrs.push(`stroke="${opts.stroke}"`);
	if (opts.strokeWidth) attrs.push(`stroke-width="${opts.strokeWidth}"`);
	if (opts.opacity != null) attrs.push(`opacity="${opts.opacity}"`);
	return `<rect ${attrs.join(" ")}/>`;
}

/** A card surface: filled panel with a hairline border. */
export function panel(x: number, y: number, w: number, h: number, r = 14): string {
	return `<rect x="${round(x)}" y="${round(y)}" width="${round(w)}" height="${round(h)}" rx="${r}" class="rb-panel rb-panel-b" stroke-width="1"/>`;
}

function round(n: number): number {
	return Math.round(n * 100) / 100;
}

/** Minimal Octicon subset (MIT), drawn in a 16×16 box and scaled at use sites. */
const ICONS: Record<string, string> = {
	star: "M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z",
	fork: "M5 5.372v.878c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75v-.878a2.25 2.25 0 1 1 1.5 0v.878a2.25 2.25 0 0 1-2.25 2.25h-1.5v2.128a2.251 2.251 0 1 1-1.5 0V8.5h-1.5A2.25 2.25 0 0 1 3.5 6.25v-.878a2.25 2.25 0 1 1 1.5 0ZM5 3.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Zm6.75.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm-3 8.75a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z",
	commit:
		"M11.93 8.5a4.002 4.002 0 0 1-7.86 0H.75a.75.75 0 0 1 0-1.5h3.32a4.002 4.002 0 0 1 7.86 0h3.32a.75.75 0 0 1 0 1.5Zm-1.43-.75a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z",
	pr: "M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z",
	issue:
		"M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z",
	tag: "M1 7.775V2.75C1 1.784 1.784 1 2.75 1h5.025c.464 0 .91.184 1.238.513l6.25 6.25a1.75 1.75 0 0 1 0 2.474l-5.026 5.026a1.75 1.75 0 0 1-2.474 0l-6.25-6.25A1.75 1.75 0 0 1 1 7.775Zm1.5 0c0 .066.026.13.073.177l6.25 6.25a.25.25 0 0 0 .354 0l5.025-5.025a.25.25 0 0 0 0-.354l-6.25-6.25a.25.25 0 0 0-.177-.073H2.75a.25.25 0 0 0-.25.25ZM6 5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z",
	people:
		"M2 5.5a3.5 3.5 0 1 1 5.898 2.549 5.508 5.508 0 0 1 3.034 4.084.75.75 0 1 1-1.482.235 4 4 0 0 0-7.9 0 .75.75 0 0 1-1.482-.236A5.507 5.507 0 0 1 3.1 8.048 3.493 3.493 0 0 1 2 5.5ZM11 4a3.001 3.001 0 0 1 2.22 5.018 5.01 5.01 0 0 1 2.56 3.012.749.749 0 0 1-.885.954.752.752 0 0 1-.549-.514 3.507 3.507 0 0 0-2.522-2.372.75.75 0 0 1-.574-.73v-.352a.75.75 0 0 1 .416-.672A1.5 1.5 0 0 0 11 5.5.75.75 0 0 1 11 4Zm-5.5-.5a2 2 0 1 0-.001 3.999A2 2 0 0 0 5.5 3.5Z",
};

export function icon(name: keyof typeof ICONS, x: number, y: number, size: number, cls = "rb-muted"): string {
	const d = ICONS[name];
	if (!d) return "";
	const s = size / 16;
	return `<g transform="translate(${round(x)},${round(y)}) scale(${round(s)})" class="${cls}"><path d="${d}"/></g>`;
}

/** Opens the SVG document: root element, embedded font, theme classes, gradients. */
export function svgDoc(
	width: number,
	height: number,
	pal: Palette,
	body: string,
	title: string,
): string {
	const accentStops = ACCENT_GRADIENT.map(
		(c, i) =>
			`<stop offset="${round(i / (ACCENT_GRADIENT.length - 1))}" stop-color="${c}"/>`,
	).join("");
	return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" role="img" aria-label="${esc(title)}">
<title>${esc(title)}</title>
<defs>
<style>
@font-face{font-family:'Titan One';font-style:normal;font-weight:400;src:url(${TITAN_ONE_DATA_URI}) format('woff2');}
text{font-family:${SANS};}
${pal.classStyles()}
</style>
<linearGradient id="rb-accent" x1="0" y1="0" x2="1" y2="0">${accentStops}</linearGradient>
<linearGradient id="rb-brand-fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${pal.base.brand}" stop-opacity="0.28"/><stop offset="1" stop-color="${pal.base.brand}" stop-opacity="0"/></linearGradient>
</defs>
<rect width="${width}" height="${height}" rx="16" class="rb-bg"/>
${body}
</svg>`;
}

/** The elmo wordmark in Titan One at the brand blue. */
export function wordmark(x: number, baseline: number, size: number): string {
	return `<text x="${round(x)}" y="${round(baseline)}" class="rb-brand" font-family="${WORDMARK_FAMILY}" font-size="${size}" font-weight="400">elmo</text>`;
}

/** Accent gradient rule (the brand's signature underline). */
export function accentRule(x: number, y: number, w: number, h = 4, r = 2): string {
	return `<rect x="${round(x)}" y="${round(y)}" width="${round(w)}" height="${h}" rx="${r}" fill="url(#rb-accent)"/>`;
}

/** Vertical bar chart with a faint track and release markers above flagged weeks. */
export function barChart(
	x: number,
	y: number,
	w: number,
	h: number,
	points: WeekPoint[],
	releaseWeeks: number[],
	opts: { barCls?: string; gap?: number; markerTop?: number } = {},
): string {
	const { barCls = "rb-brand", gap = 2, markerTop = 0 } = opts;
	if (points.length === 0) {
		return text(x + w / 2, y + h / 2, "commit stats warming up…", {
			size: 11,
			cls: "rb-faint",
			anchor: "middle",
		});
	}
	const max = Math.max(1, ...points.map((p) => p.total));
	const n = points.length;
	const bw = (w - gap * (n - 1)) / n;
	const radius = Math.min(2.5, bw / 2);
	const releases = new Set(releaseWeeks);
	let out = "";
	let markers = "";
	points.forEach((p, i) => {
		const bx = x + i * (bw + gap);
		const bh = Math.max(1.5, (p.total / max) * h);
		const by = y + h - bh;
		out += `<rect x="${round(bx)}" y="${round(y)}" width="${round(bw)}" height="${round(h)}" rx="${radius}" class="rb-track" opacity="0.7"/>`;
		out += `<rect x="${round(bx)}" y="${round(by)}" width="${round(bw)}" height="${round(bh)}" rx="${radius}" class="${barCls}"/>`;
		if (releases.has(p.week)) {
			const cx = bx + bw / 2;
			markers += `<line x1="${round(cx)}" y1="${round(markerTop)}" x2="${round(cx)}" y2="${round(y + h)}" stroke="${RELEASE_COLOR}" stroke-width="1" opacity="0.22"/>`;
			markers += `<circle cx="${round(cx)}" cy="${round(markerTop + 3)}" r="2.6" fill="${RELEASE_COLOR}"/>`;
		}
	});
	return markers + out;
}

/** Smooth trend line with a soft brand-gradient fill underneath. */
export function sparkArea(
	x: number,
	y: number,
	w: number,
	h: number,
	values: number[],
): string {
	if (values.length === 0) return "";
	const max = Math.max(1, ...values);
	const n = values.length;
	const px = (i: number) => x + (n === 1 ? w / 2 : (i / (n - 1)) * w);
	const py = (v: number) => y + h - (v / max) * h;
	const line = values
		.map((v, i) => `${i === 0 ? "M" : "L"}${round(px(i))},${round(py(v))}`)
		.join(" ");
	const area = `${line} L${round(px(n - 1))},${round(y + h)} L${round(px(0))},${round(y + h)} Z`;
	return `<path d="${area}" fill="url(#rb-brand-fade)"/><path d="${line}" class="rb-brand-s" fill="none" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
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
