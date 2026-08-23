"use client";

import { AlertTriangle, Check, X } from "lucide-react";
import { useState } from "react";
import { AI_CRAWLERS, CRAWLER_ROLE_LABELS } from "@/lib/tools/ai-crawlers";
import { checkAiCrawlersFn } from "@/lib/tools/api";
import type { CrawlerCheckResult, CrawlerVerdict } from "@/lib/tools/types";
import { SiteUrlForm } from "./site-url-form";

export function AiCrawlerChecker() {
	const [input, setInput] = useState("");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [result, setResult] = useState<CrawlerCheckResult | null>(null);

	async function check() {
		setPending(true);
		setError(null);
		try {
			const response = await checkAiCrawlersFn({ data: { url: input } });
			if (response.ok) {
				setResult(response.data);
			} else {
				setResult(null);
				setError(response.error);
			}
		} catch {
			setResult(null);
			setError("Could not reach the checker. Try again in a moment.");
		} finally {
			setPending(false);
		}
	}

	return (
		<div>
			<SiteUrlForm
				value={input}
				onChange={setInput}
				onSubmit={check}
				pending={pending}
				label="Site to check"
				placeholder="example.com"
				submitLabel="Check robots.txt"
				pendingLabel="Checking"
				error={error}
			/>
			{result ? <CheckResult result={result} /> : null}
		</div>
	);
}

function OutcomeBanner({ result }: { result: CrawlerCheckResult }) {
	if (result.outcome === "missing") {
		return (
			<div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
				<p className="font-semibold">No robots.txt found</p>
				<p className="mt-1 leading-relaxed">
					{result.siteUrl}/robots.txt returned HTTP {result.httpStatus}. With no file, every crawler is allowed
					everywhere — which is fine for AI visibility, but you also have nowhere to point crawlers at your sitemap.
				</p>
			</div>
		);
	}

	if (result.outcome === "server-error") {
		return (
			<div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900">
				<p className="font-semibold">robots.txt is returning a server error</p>
				<p className="mt-1 leading-relaxed">
					{result.robotsUrl} returned HTTP {result.httpStatus}. Google and other major crawlers treat a robots.txt that
					keeps failing as a site-wide disallow, so this is stricter than having no file at all. Fix the error before
					anything else on this page.
				</p>
			</div>
		);
	}

	const blocked = result.crawlers.filter((crawler) => !crawler.allowed);
	if (blocked.length === 0) {
		return (
			<div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
				<p className="font-semibold">
					All {result.crawlers.length} AI crawlers can reach {result.path}
				</p>
				<p className="mt-1 leading-relaxed">
					Nothing in {result.robotsUrl} blocks the crawlers that feed ChatGPT, Perplexity, Claude, or Google's AI
					answers.
				</p>
			</div>
		);
	}

	return (
		<div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900">
			<p className="font-semibold">
				{blocked.length} of {result.crawlers.length} AI crawlers are blocked from {result.path}
			</p>
			<p className="mt-1 leading-relaxed">
				{blocked.map((crawler) => crawler.token).join(", ")} cannot fetch this path, so they have nothing of yours to
				cite. Check each rule below before changing anything — some of these blocks may be deliberate.
			</p>
		</div>
	);
}

function VerdictCell({ verdict }: { verdict: CrawlerVerdict }) {
	const partial = verdict.allowed && verdict.disallowedPatterns.length > 0;

	return (
		<div>
			<span
				className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
					verdict.allowed ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"
				}`}
			>
				{verdict.allowed ? <Check className="size-3" /> : <X className="size-3" />}
				{verdict.allowed ? "Allowed" : "Blocked"}
			</span>
			{verdict.matchedRule ? (
				<p className="mt-1.5 font-mono text-[11px] text-zinc-500">
					{verdict.matchedRule} · User-agent: {verdict.matchedAgent}
				</p>
			) : (
				<p className="mt-1.5 text-[11px] text-zinc-500">
					{verdict.matchedAgent ? `No rule matched in the "${verdict.matchedAgent}" group` : "No matching group"}
				</p>
			)}
			{partial ? (
				<p className="mt-1 inline-flex items-center gap-1 text-[11px] text-amber-700">
					<AlertTriangle className="size-3" />
					{verdict.disallowedPatterns.length} other path
					{verdict.disallowedPatterns.length === 1 ? "" : "s"} blocked
				</p>
			) : null}
			{verdict.crawlDelay !== undefined ? (
				<p className="mt-1 text-[11px] text-zinc-500">Crawl-delay: {verdict.crawlDelay}s</p>
			) : null}
		</div>
	);
}

function CheckResult({ result }: { result: CrawlerCheckResult }) {
	const verdicts = new Map(result.crawlers.map((crawler) => [crawler.token, crawler]));

	return (
		<div className="mt-8 space-y-8">
			<OutcomeBanner result={result} />

			<div className="overflow-x-auto">
				<table className="w-full min-w-[640px] text-sm">
					<caption className="sr-only">
						AI crawler access to {result.siteUrl}
						{result.path}
					</caption>
					<thead>
						<tr className="border-b border-zinc-200 text-left">
							<th className="py-3 pr-4 font-semibold text-zinc-950">Crawler</th>
							<th className="py-3 pr-4 font-semibold text-zinc-950">Run by</th>
							<th className="py-3 pr-4 font-semibold text-zinc-950">Job</th>
							<th className="py-3 font-semibold text-zinc-950">Verdict</th>
						</tr>
					</thead>
					<tbody>
						{AI_CRAWLERS.map((crawler) => {
							const verdict = verdicts.get(crawler.token);
							if (!verdict) return null;
							return (
								<tr key={crawler.token} className="border-b border-zinc-200 align-top">
									<td className="py-3 pr-4">
										<span className="font-mono text-xs text-zinc-950">{crawler.token}</span>
										<p className="mt-1 max-w-[28ch] text-[11px] leading-snug text-zinc-500">{crawler.purpose}</p>
									</td>
									<td className="py-3 pr-4 text-zinc-600">{crawler.operator}</td>
									<td className="py-3 pr-4 text-zinc-600">{CRAWLER_ROLE_LABELS[crawler.role]}</td>
									<td className="py-3">
										<VerdictCell verdict={verdict} />
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>

			<div className="grid gap-6 md:grid-cols-2">
				<div>
					<h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">Declared sitemaps</h3>
					{result.sitemaps.length > 0 ? (
						<ul className="mt-3 space-y-1.5 text-sm">
							{result.sitemaps.map((sitemap) => (
								<li key={sitemap} className="break-all font-mono text-xs text-zinc-600">
									{sitemap}
								</li>
							))}
						</ul>
					) : (
						<p className="mt-3 text-sm leading-relaxed text-zinc-600">
							No <code className="font-mono text-xs">Sitemap:</code> line. Adding one is the cheapest way to tell every
							crawler what to read.
						</p>
					)}
				</div>
				<div>
					<h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">Path checked</h3>
					<p className="mt-3 break-all font-mono text-xs text-zinc-600">
						{result.siteUrl}
						{result.path}
					</p>
					<p className="mt-2 text-sm leading-relaxed text-zinc-600">
						Paste a full URL instead of a bare domain to check a specific page.
					</p>
				</div>
			</div>

			{result.robotsTxt ? (
				<div>
					<h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">{result.robotsUrl}</h3>
					<pre className="mt-3 max-h-96 overflow-auto rounded-md border border-zinc-200 bg-zinc-50 p-4 font-mono text-xs leading-relaxed text-zinc-700">
						{result.robotsTxt}
						{result.robotsTxtTruncated ? "\n… truncated" : ""}
					</pre>
				</div>
			) : null}
		</div>
	);
}
