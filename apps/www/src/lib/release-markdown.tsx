import { Fragment, type ReactNode } from "react";

const FULL_CHANGELOG_RE =
	/\*\*Full Changelog\*\*:\s*(https:\/\/github\.com\/[^\s]+\/compare\/[^\s]+)/i;

export function extractCompareUrl(body: string | null): {
	cleaned: string;
	compareUrl: string | null;
} {
	if (!body) return { cleaned: "", compareUrl: null };
	const match = body.match(FULL_CHANGELOG_RE);
	if (!match) return { cleaned: body, compareUrl: null };
	const cleaned = body.replace(FULL_CHANGELOG_RE, "").trimEnd();
	return { cleaned, compareUrl: match[1] };
}

// Parse inline markdown: bold, italic, code, links, @user, #N references.
function renderInline(text: string, keyPrefix: string): ReactNode[] {
	const out: ReactNode[] = [];
	const tokens =
		text.split(
			/(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|`[^`]+`|\*[^*\n]+\*|_[^_\n]+_|@[a-zA-Z0-9-]+|#\d+|https?:\/\/\S+)/g,
		);
	for (let i = 0; i < tokens.length; i++) {
		const tok = tokens[i];
		if (!tok) continue;
		const k = `${keyPrefix}-${i}`;

		if (/^\[[^\]]+\]\([^)]+\)$/.test(tok)) {
			const m = tok.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
			if (m) {
				out.push(
					<a
						key={k}
						href={m[2]}
						target="_blank"
						rel="noopener noreferrer"
						className="text-blue-700 underline decoration-blue-300 underline-offset-2 hover:decoration-blue-700"
					>
						{m[1]}
					</a>,
				);
				continue;
			}
		}
		if (/^\*\*[^*]+\*\*$/.test(tok)) {
			out.push(
				<strong key={k} className="font-semibold text-zinc-950">
					{tok.slice(2, -2)}
				</strong>,
			);
			continue;
		}
		if (/^`[^`]+`$/.test(tok)) {
			out.push(
				<code
					key={k}
					className="rounded-sm bg-zinc-100 px-1 py-0.5 font-mono text-[0.85em] text-zinc-800"
				>
					{tok.slice(1, -1)}
				</code>,
			);
			continue;
		}
		if (/^\*[^*\n]+\*$/.test(tok) || /^_[^_\n]+_$/.test(tok)) {
			out.push(
				<em key={k} className="italic">
					{tok.slice(1, -1)}
				</em>,
			);
			continue;
		}
		if (/^@[a-zA-Z0-9-]+$/.test(tok)) {
			out.push(
				<a
					key={k}
					href={`https://github.com/${tok.slice(1)}`}
					target="_blank"
					rel="noopener noreferrer"
					className="font-mono text-zinc-700 hover:text-blue-700"
				>
					{tok}
				</a>,
			);
			continue;
		}
		if (/^#\d+$/.test(tok)) {
			out.push(
				<a
					key={k}
					href={`https://github.com/elmohq/elmo/issues/${tok.slice(1)}`}
					target="_blank"
					rel="noopener noreferrer"
					className="font-mono text-zinc-700 hover:text-blue-700"
				>
					{tok}
				</a>,
			);
			continue;
		}
		if (/^https?:\/\/\S+$/.test(tok)) {
			out.push(
				<a
					key={k}
					href={tok}
					target="_blank"
					rel="noopener noreferrer"
					className="break-all text-blue-700 underline decoration-blue-300 underline-offset-2 hover:decoration-blue-700"
				>
					{tok}
				</a>,
			);
			continue;
		}
		out.push(<Fragment key={k}>{tok}</Fragment>);
	}
	return out;
}

export function ReleaseMarkdown({ body }: { body: string }) {
	const lines = body.split("\n");
	const blocks: ReactNode[] = [];
	let listBuffer: string[] = [];
	let listOrdered = false;
	let listKey = 0;

	const flushList = () => {
		if (listBuffer.length === 0) return;
		const ListEl = listOrdered ? "ol" : "ul";
		blocks.push(
			<ListEl
				key={`list-${listKey++}`}
				role="list"
				className={`my-2 space-y-1 pl-5 ${listOrdered ? "list-decimal" : "list-disc"} marker:text-zinc-400`}
			>
				{listBuffer.map((item, i) => (
					<li key={i} className="text-[14px] leading-relaxed text-zinc-700">
						{renderInline(item, `li-${listKey}-${i}`)}
					</li>
				))}
			</ListEl>,
		);
		listBuffer = [];
	};

	for (let i = 0; i < lines.length; i++) {
		const raw = lines[i];
		const line = raw.trimEnd();

		const ulMatch = line.match(/^[\s]*[*-]\s+(.*)$/);
		const olMatch = line.match(/^[\s]*\d+\.\s+(.*)$/);

		if (ulMatch) {
			if (listBuffer.length > 0 && listOrdered) flushList();
			listOrdered = false;
			listBuffer.push(ulMatch[1]);
			continue;
		}
		if (olMatch) {
			if (listBuffer.length > 0 && !listOrdered) flushList();
			listOrdered = true;
			listBuffer.push(olMatch[1]);
			continue;
		}

		if (listBuffer.length > 0) flushList();

		if (line.trim().length === 0) continue;

		if (line.startsWith("### ")) {
			blocks.push(
				<h4
					key={`h-${i}`}
					className="mt-4 text-sm font-semibold tracking-tight text-zinc-950"
				>
					{renderInline(line.slice(4), `h4-${i}`)}
				</h4>,
			);
			continue;
		}
		if (line.startsWith("## ")) {
			blocks.push(
				<h3
					key={`h-${i}`}
					className="mt-5 text-base font-semibold tracking-tight text-zinc-950"
				>
					{renderInline(line.slice(3), `h3-${i}`)}
				</h3>,
			);
			continue;
		}
		if (line.startsWith("# ")) {
			blocks.push(
				<h3
					key={`h-${i}`}
					className="mt-5 text-lg font-semibold tracking-tight text-zinc-950"
				>
					{renderInline(line.slice(2), `h2-${i}`)}
				</h3>,
			);
			continue;
		}

		blocks.push(
			<p
				key={`p-${i}`}
				className="text-[14px] leading-relaxed text-zinc-700"
			>
				{renderInline(line, `p-${i}`)}
			</p>,
		);
	}
	flushList();

	return <div className="space-y-2">{blocks}</div>;
}
