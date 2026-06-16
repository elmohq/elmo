import { marked } from "marked";

// ── Eval data model (shared by eval.ts, the report, and the CSV writers) ──────

interface EvalCitation {
	url: string;
	title?: string;
	domain: string;
	citationIndex: number;
}

export interface EvalRun {
	runIndex: number;
	responseMarkdown: string;
	/** null when no brand context was supplied. */
	brandMentioned: boolean | null;
	competitorsMentioned: string[];
	citations: EvalCitation[];
	webQueries: string[];
	error?: string;
}

export interface EvalTargetResult {
	label: string;
	model: string;
	provider: string;
	runs: EvalRun[];
}

export interface EvalPromptResult {
	index: number;
	prompt: string;
	tags: string[];
	targets: EvalTargetResult[];
	/** per-prompt share of voice (0-100) or null when nobody was mentioned. */
	sov: number | null;
}

export interface EvalReport {
	brandName?: string;
	generatedAt: string;
	runsPerTarget: number;
	targetLabels: string[];
	prompts: EvalPromptResult[];
	overallSov: number | null;
	competitorSov: { name: string; sov: number; mentionCount: number }[];
	totals: {
		prompts: number;
		targets: number;
		responses: number;
		citations: number;
		fanoutQueries: number;
	};
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

/**
 * Render model-supplied markdown to HTML for the local report. The content is
 * the user's own eval output opened from `file://`, but we still strip active
 * content (script/iframe/style tags, inline event handlers, javascript: urls)
 * as defense-in-depth.
 */
function renderMarkdown(md: string): string {
	const html = marked.parse(md ?? "", { async: false }) as string;
	return html
		// Drop active blocks entirely (tags *and* their contents)…
		.replace(/<(script|style|iframe)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
		// …then any stray/unclosed tags, inline event handlers, and js: urls.
		.replace(/<\/?(script|style|iframe)\b[^>]*>/gi, "")
		.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
		.replace(/javascript:/gi, "");
}

function sovBar(label: string, sov: number | null, mentionCount?: number): string {
	const pct = sov ?? 0;
	const value = sov === null ? "—" : `${sov}%`;
	const meta = mentionCount === undefined ? "" : ` <span class="muted">(${mentionCount})</span>`;
	return `<div class="bar-row">
    <div class="bar-label">${escapeHtml(label)}${meta}</div>
    <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
    <div class="bar-value">${value}</div>
  </div>`;
}

function badge(text: string, kind: "yes" | "no" | "neutral"): string {
	return `<span class="badge badge-${kind}">${escapeHtml(text)}</span>`;
}

function renderRun(run: EvalRun): string {
	if (run.error) {
		return `<div class="run run-error"><div class="run-head">Run ${run.runIndex} — <span class="err">failed</span></div><pre>${escapeHtml(run.error)}</pre></div>`;
	}
	const mentionBadge =
		run.brandMentioned === null
			? ""
			: run.brandMentioned
				? badge("brand mentioned", "yes")
				: badge("brand absent", "no");
	const compBadges = run.competitorsMentioned.map((c) => badge(c, "neutral")).join(" ");
	const citations = run.citations.length
		? `<details class="cites"><summary>${run.citations.length} citation${run.citations.length === 1 ? "" : "s"}</summary><ul>${run.citations
				.map(
					(c) =>
						`<li><a href="${escapeHtml(c.url)}" target="_blank" rel="noopener">${escapeHtml(c.title || c.domain)}</a> <span class="muted">${escapeHtml(c.domain)}</span></li>`,
				)
				.join("")}</ul></details>`
		: `<div class="muted small">No citations.</div>`;
	const fanout = run.webQueries.length
		? `<details class="cites"><summary>${run.webQueries.length} fan-out quer${run.webQueries.length === 1 ? "y" : "ies"}</summary><ul>${run.webQueries
				.map((q) => `<li>${escapeHtml(q)}</li>`)
				.join("")}</ul></details>`
		: "";
	return `<div class="run">
    <div class="run-head">Run ${run.runIndex} ${mentionBadge} ${compBadges}</div>
    <div class="response">${renderMarkdown(run.responseMarkdown)}</div>
    ${citations}
    ${fanout}
  </div>`;
}

function renderTarget(target: EvalTargetResult): string {
	return `<div class="target">
    <h4>${escapeHtml(target.label)}</h4>
    ${target.runs.map(renderRun).join("\n")}
  </div>`;
}

function renderPrompt(prompt: EvalPromptResult): string {
	const search = escapeHtml(
		`${prompt.prompt} ${prompt.tags.join(" ")} ${prompt.targets.map((t) => t.label).join(" ")}`.toLowerCase(),
	);
	const tags = prompt.tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join(" ");
	const sov = prompt.sov === null ? "" : `<span class="pill">SoV ${prompt.sov}%</span>`;
	return `<details class="prompt" data-search="${search}" open>
    <summary><span class="idx">${pad(prompt.index)}</span> ${escapeHtml(prompt.prompt)} ${tags} ${sov}</summary>
    ${prompt.targets.map(renderTarget).join("\n")}
  </details>`;
}

function pad(n: number): string {
	return String(n).padStart(3, "0");
}

const STYLE = `
:root { --bg:#0b0f1a; --card:#121829; --ink:#e6e9f0; --muted:#8b93a7; --line:#222a3f; --blue:#3b82f6; --green:#22c55e; --red:#ef4444; }
* { box-sizing:border-box; }
body { margin:0; background:var(--bg); color:var(--ink); font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
.wrap { max-width:980px; margin:0 auto; padding:28px 20px 80px; }
h1 { font-size:22px; margin:0 0 4px; }
h4 { margin:18px 0 8px; font-size:13px; color:var(--blue); font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }
.muted { color:var(--muted); } .small { font-size:12px; }
.header { border-bottom:1px solid var(--line); padding-bottom:16px; margin-bottom:20px; }
.totals { display:flex; flex-wrap:wrap; gap:10px; margin-top:12px; }
.stat { background:var(--card); border:1px solid var(--line); border-radius:8px; padding:8px 12px; }
.stat b { display:block; font-size:18px; }
.bars { margin-top:16px; }
.bar-row { display:grid; grid-template-columns:200px 1fr 48px; align-items:center; gap:10px; margin:5px 0; }
.bar-label { font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.bar-track { background:var(--line); border-radius:6px; height:10px; overflow:hidden; }
.bar-fill { background:var(--blue); height:100%; }
.bar-value { text-align:right; font-size:12px; color:var(--muted); }
#filter { width:100%; padding:10px 12px; margin:18px 0; background:var(--card); border:1px solid var(--line); border-radius:8px; color:var(--ink); font-size:14px; }
.prompt { background:var(--card); border:1px solid var(--line); border-radius:10px; margin:10px 0; padding:6px 14px; }
.prompt > summary { cursor:pointer; padding:8px 0; font-weight:600; list-style:none; }
.prompt > summary::-webkit-details-marker { display:none; }
.idx { color:var(--muted); font-family:ui-monospace,monospace; margin-right:6px; }
.tag { display:inline-block; background:var(--line); color:var(--muted); border-radius:5px; padding:1px 6px; font-size:11px; margin-left:4px; }
.pill { float:right; background:var(--blue); color:#fff; border-radius:20px; padding:2px 10px; font-size:11px; }
.target { border-top:1px dashed var(--line); padding-top:4px; }
.run { border-left:2px solid var(--line); padding:4px 0 4px 12px; margin:10px 0; }
.run-head { font-size:12px; color:var(--muted); margin-bottom:6px; }
.run-error .err { color:var(--red); }
.response { background:#0e1424; border:1px solid var(--line); border-radius:8px; padding:2px 14px; max-height:340px; overflow:auto; }
.response a { color:var(--blue); } .response pre { overflow:auto; }
.badge { display:inline-block; border-radius:5px; padding:1px 7px; font-size:11px; }
.badge-yes { background:rgba(34,197,94,.18); color:var(--green); }
.badge-no { background:rgba(239,68,68,.18); color:var(--red); }
.badge-neutral { background:var(--line); color:var(--muted); }
.cites { margin:8px 0; } .cites summary { cursor:pointer; color:var(--muted); font-size:12px; }
.cites ul { margin:6px 0; padding-left:18px; } .cites li { margin:2px 0; }
.err { color:var(--red); }
`;

const SCRIPT = `
const f = document.getElementById('filter');
const prompts = Array.from(document.querySelectorAll('.prompt'));
f.addEventListener('input', () => {
  const q = f.value.trim().toLowerCase();
  for (const p of prompts) {
    p.style.display = !q || p.dataset.search.includes(q) ? '' : 'none';
  }
});
`;

/** Build a single self-contained HTML document for browsing an eval run. */
export function buildEvalReportHtml(report: EvalReport): string {
	const t = report.totals;
	const stats = [
		["prompts", t.prompts],
		["targets", t.targets],
		["responses", t.responses],
		["citations", t.citations],
		["fan-out queries", t.fanoutQueries],
	]
		.map(([label, n]) => `<div class="stat"><b>${n}</b><span class="muted small">${label}</span></div>`)
		.join("");

	const sovBars =
		report.overallSov === null && report.competitorSov.length === 0
			? `<div class="muted small">No brand context supplied — share of voice not computed.</div>`
			: [
					sovBar(`${report.brandName || "Brand"} (you)`, report.overallSov),
					...report.competitorSov.map((c) => sovBar(c.name, c.sov, c.mentionCount)),
				].join("\n");

	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Elmo eval — ${escapeHtml(report.brandName || "report")}</title>
<style>${STYLE}</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <h1>Elmo eval${report.brandName ? ` — ${escapeHtml(report.brandName)}` : ""}</h1>
    <div class="muted small">${escapeHtml(report.generatedAt)} · ${report.runsPerTarget} run(s) per target · ${escapeHtml(report.targetLabels.join(", "))}</div>
    <div class="totals">${stats}</div>
    <div class="bars">${sovBars}</div>
  </div>
  <input id="filter" type="search" placeholder="Filter prompts, tags, or models…" />
  ${report.prompts.map(renderPrompt).join("\n")}
</div>
<script>${SCRIPT}</script>
</body>
</html>
`;
}
