"use client";

import { Check, Copy, Download } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { describePagesFn, discoverSiteFn } from "@/lib/tools/api";
import { SUMMARY_BATCH_SIZE } from "@/lib/tools/limits";
import { buildLlmsTxt, type LlmsTxtPage } from "@/lib/tools/llms-txt";
import type { SiteDiscovery } from "@/lib/tools/types";
import { SiteUrlForm } from "./site-url-form";

interface GeneratorState {
	discovery: SiteDiscovery;
	pages: LlmsTxtPage[];
	/** How many pages have had their title and description fetched. */
	described: number;
}

export function LlmsTxtGenerator() {
	const [input, setInput] = useState("");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [state, setState] = useState<GeneratorState | null>(null);
	// Bumped on every run so a slow batch from an abandoned run cannot write
	// its titles over the results of the one the visitor is watching.
	const runId = useRef(0);

	const generate = useCallback(async () => {
		const run = ++runId.current;
		setPending(true);
		setError(null);
		setState(null);

		try {
			const discovered = await discoverSiteFn({ data: { url: input } });
			if (run !== runId.current) return;
			if (!discovered.ok) {
				setError(discovered.error);
				return;
			}

			const discovery = discovered.data;
			// Show the file straight away with slug-derived titles, then upgrade
			// each entry as its real title arrives.
			let pages: LlmsTxtPage[] = discovery.urls.map((url) => ({ url, title: null, description: null }));
			setState({ discovery, pages, described: 0 });

			for (let start = 0; start < discovery.urls.length; start += SUMMARY_BATCH_SIZE) {
				const batch = discovery.urls.slice(start, start + SUMMARY_BATCH_SIZE);
				const described = await describePagesFn({ data: { urls: batch } });
				if (run !== runId.current) return;
				if (!described.ok) {
					setError(described.error);
					break;
				}

				const bySummaryUrl = new Map(described.data.map((summary) => [summary.url, summary]));
				pages = pages.map((page) => bySummaryUrl.get(page.url) ?? page);
				setState({ discovery, pages, described: Math.min(start + batch.length, discovery.urls.length) });
			}
		} catch {
			if (run === runId.current) setError("Could not reach the generator. Try again in a moment.");
		} finally {
			if (run === runId.current) setPending(false);
		}
	}, [input]);

	return (
		<div>
			<SiteUrlForm
				value={input}
				onChange={setInput}
				onSubmit={generate}
				pending={pending}
				label="Site to read"
				placeholder="example.com"
				submitLabel="Generate llms.txt"
				pendingLabel="Generating"
				error={error}
			/>
			{state ? <GeneratedFile state={state} /> : null}
		</div>
	);
}

function GeneratedFile({ state }: { state: GeneratorState }) {
	const { discovery, pages, described } = state;
	const content = buildLlmsTxt({
		siteName: discovery.siteName,
		siteDescription: discovery.siteDescription,
		pages,
	});

	return (
		<div className="mt-8">
			<div className="flex flex-wrap items-center justify-between gap-4">
				<div>
					<p className="text-sm text-zinc-600">
						{pages.length} page{pages.length === 1 ? "" : "s"} from{" "}
						<span className="break-all font-mono text-xs">{discovery.sitemapUrl}</span>
						{described < pages.length ? ` · reading titles ${described}/${pages.length}` : ""}
					</p>
					{discovery.truncated ? (
						<p className="mt-1 text-sm text-amber-700">
							This site has more pages than the tool reads. Edit the file to cover the sections that matter most.
						</p>
					) : null}
				</div>
				<div className="flex gap-2">
					<CopyButton content={content} />
					<DownloadButton content={content} />
				</div>
			</div>

			<pre className="mt-4 max-h-[32rem] overflow-auto rounded-md border border-zinc-200 bg-zinc-50 p-4 font-mono text-xs leading-relaxed text-zinc-700">
				{content}
			</pre>

			<p className="mt-3 text-sm leading-relaxed text-zinc-600">
				Read it before you publish it. The sections come from your URL structure and the notes come from your meta
				descriptions, so the order and the wording are a starting point, not a finished document. Serve it at{" "}
				<code className="font-mono text-xs">/llms.txt</code> as <code className="font-mono text-xs">text/plain</code>,
				and link to it — an agent already on your site following a link is the most common way the file gets read at
				all.
			</p>
		</div>
	);
}

function CopyButton({ content }: { content: string }) {
	const [copied, setCopied] = useState(false);

	async function copy() {
		try {
			await navigator.clipboard.writeText(content);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			setCopied(false);
		}
	}

	return (
		<button
			type="button"
			onClick={copy}
			className="inline-flex h-9 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 hover:border-zinc-300 hover:text-zinc-950"
		>
			{copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
			{copied ? "Copied" : "Copy"}
		</button>
	);
}

function DownloadButton({ content }: { content: string }) {
	function download() {
		const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
		const href = URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		anchor.href = href;
		anchor.download = "llms.txt";
		anchor.click();
		URL.revokeObjectURL(href);
	}

	return (
		<button
			type="button"
			onClick={download}
			className="inline-flex h-9 items-center gap-1.5 rounded-md bg-zinc-900 px-3 text-sm font-medium text-white hover:bg-zinc-800"
		>
			<Download className="size-3.5" />
			Download
		</button>
	);
}
