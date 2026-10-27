import { CLOUD_ENTRY_PRICE_USD } from "@workspace/config/plans";
import { cloudAppUrl, demoSiteUrl } from "@workspace/config/referrals";
import { AlertTriangle, ArrowRight, ArrowUpRight, Check, CircleHelp, X } from "lucide-react";
import { CARD } from "@/components/home/ui";
import { trackChecker } from "@/lib/checker/track";
import type { CheckResult, PromptResult, SiteSignals } from "@/lib/checker/types";
import { externalRel } from "@/lib/external-link";

function scoreBand(score: number): { label: string; tone: string; ring: string } {
	if (score >= 70) return { label: "Strong", tone: "text-emerald-700", ring: "stroke-emerald-500" };
	if (score >= 40) return { label: "Moderate", tone: "text-amber-700", ring: "stroke-amber-500" };
	return { label: "Low", tone: "text-red-700", ring: "stroke-red-500" };
}

function ScoreDial({ score }: { score: number }) {
	const band = scoreBand(score);
	const circumference = 2 * Math.PI * 52;
	return (
		<div className="relative size-40 shrink-0">
			<svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden="true">
				<circle cx="60" cy="60" r="52" className="fill-none stroke-zinc-100" strokeWidth="10" />
				<circle
					cx="60"
					cy="60"
					r="52"
					className={`fill-none ${band.ring}`}
					strokeWidth="10"
					strokeLinecap="round"
					strokeDasharray={`${(score / 100) * circumference} ${circumference}`}
				/>
			</svg>
			<div className="absolute inset-0 flex flex-col items-center justify-center">
				<span className="text-5xl font-semibold tracking-tight text-zinc-950 tabular-nums">{score}</span>
				<span className="text-xs text-zinc-500">out of 100</span>
			</div>
		</div>
	);
}

function SectionTitle({ children, lede }: { children: React.ReactNode; lede?: React.ReactNode }) {
	return (
		<div className="mb-4">
			<h3 className="text-lg font-semibold tracking-tight text-zinc-950">{children}</h3>
			{lede ? <p className="mt-1 text-pretty text-sm text-zinc-600">{lede}</p> : null}
		</div>
	);
}

export function CheckerResults({ result }: { result: CheckResult }) {
	const band = scoreBand(result.score.total);
	const answered = result.prompts.filter((prompt) => !prompt.failed);
	const mentionedCount = answered.filter((prompt) => prompt.mentioned).length;

	return (
		<div className="mt-10 space-y-6">
			{result.sample ? (
				<p className="flex items-center gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
					<AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
					Sample answers: no OpenAI key is configured, so the AI answers below are canned fixtures. Site checks are
					real.
				</p>
			) : null}

			<section className={`${CARD} p-6 md:p-8`} aria-labelledby="checker-score">
				<div className="flex flex-col gap-8 md:flex-row md:items-center">
					<ScoreDial score={result.score.total} />
					<div className="min-w-0 flex-1">
						<p className="text-sm text-zinc-500">AI visibility score for {result.domain}</p>
						<h2 id="checker-score" className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950">
							<span className={band.tone}>{band.label}.</span> {result.brandName} was named in {mentionedCount} of{" "}
							{answered.length} AI answers.
						</h2>
						<p className="mt-2 text-sm text-zinc-600">
							{result.category ? `Category: ${result.category}. ` : ""}
							Engine: {result.engine}. Checked {new Date(result.checkedAt).toLocaleString()}.
						</p>
					</div>
				</div>
				<ul className="mt-8 grid gap-x-8 gap-y-4 sm:grid-cols-2">
					{result.score.items.map((item) => (
						<li key={item.key}>
							<div className="flex items-baseline justify-between gap-3 text-sm">
								<span className="font-medium text-zinc-900">{item.label}</span>
								<span className="tabular-nums text-zinc-600">
									{item.points}/{item.max}
								</span>
							</div>
							<div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-100">
								<div
									className="h-full rounded-full bg-blue-600"
									style={{ width: `${item.max === 0 ? 0 : (item.points / item.max) * 100}%` }}
								/>
							</div>
							<p className="mt-1 text-[13px] text-zinc-500">{item.detail}</p>
						</li>
					))}
				</ul>
			</section>

			<TrackCta result={result} />

			<section className={`${CARD} p-6 md:p-8`}>
				<SectionTitle lede="Each question was asked once, unbranded, the way a buyer would ask it.">
					What AI said, prompt by prompt
				</SectionTitle>
				<PromptTable prompts={result.prompts} domain={result.domain} />
			</section>

			<div className="grid gap-6 lg:grid-cols-2">
				<section className={`${CARD} p-6`}>
					<SectionTitle lede="Brands named in the same answers, by how many answers named them.">
						Who AI recommends instead
					</SectionTitle>
					<RankedBars
						rows={result.recommendedInstead.map((row) => ({ label: row.name, count: row.count }))}
						total={answered.length}
						empty="No other brands were named."
					/>
				</section>
				<section className={`${CARD} p-6`}>
					<SectionTitle lede="The sites AI leaned on for these answers. Getting mentioned there is how you get recommended.">
						Sources AI cited
					</SectionTitle>
					<RankedBars
						rows={result.topSources.map((row) => ({
							label: row.domain,
							count: row.count,
							highlight: isOwnDomain(row.domain, result.domain),
						}))}
						total={answered.length}
						empty="No sources were cited."
					/>
				</section>
			</div>

			<section className={`${CARD} p-6 md:p-8`}>
				<SectionTitle lede="Technical basics that decide whether AI can read and cite your site at all.">
					AI crawler access and site checks
				</SectionTitle>
				<SiteChecklist site={result.site} domain={result.domain} />
			</section>

			<TrackCta result={result} compact />
		</div>
	);
}

function isOwnDomain(candidate: string, domain: string): boolean {
	return candidate === domain || candidate.endsWith(`.${domain}`);
}

function PromptTable({ prompts, domain }: { prompts: PromptResult[]; domain: string }) {
	return (
		<div className="-mx-6 overflow-x-auto md:mx-0">
			<table className="w-full min-w-[640px] text-left text-sm">
				<thead>
					<tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
						<th scope="col" className="py-2 pr-4 pl-6 font-medium md:pl-0">
							Prompt
						</th>
						<th scope="col" className="px-3 py-2 font-medium">
							Mentioned
						</th>
						<th scope="col" className="px-3 py-2 font-medium">
							Position
						</th>
						<th scope="col" className="px-3 py-2 font-medium">
							Brands named instead
						</th>
						<th scope="col" className="py-2 pr-6 pl-3 font-medium md:pr-0">
							Sources cited
						</th>
					</tr>
				</thead>
				<tbody className="divide-y divide-zinc-100 align-top">
					{prompts.map((prompt) => (
						<tr key={prompt.prompt}>
							<td className="max-w-[18rem] py-3 pr-4 pl-6 text-pretty text-zinc-900 md:pl-0">“{prompt.prompt}”</td>
							<td className="px-3 py-3">
								{prompt.failed ? (
									<span className="text-zinc-400">No answer</span>
								) : prompt.mentioned ? (
									<span className="inline-flex items-center gap-1 font-medium text-emerald-700">
										<Check className="size-4" strokeWidth={2.5} aria-hidden="true" />
										Yes
									</span>
								) : (
									<span className="inline-flex items-center gap-1 font-medium text-red-700">
										<X className="size-4" strokeWidth={2.5} aria-hidden="true" />
										No
									</span>
								)}
							</td>
							<td className="px-3 py-3 tabular-nums text-zinc-700">{prompt.position ? `#${prompt.position}` : "—"}</td>
							<td className="px-3 py-3 text-zinc-700">
								{prompt.competitors.length > 0 ? prompt.competitors.slice(0, 6).join(", ") : "—"}
							</td>
							<td className="py-3 pr-6 pl-3 md:pr-0">
								{prompt.sources.length > 0 ? (
									<ul className="space-y-0.5">
										{prompt.sources.slice(0, 4).map((source) => (
											<li key={source.url}>
												<a
													href={source.url}
													target="_blank"
													rel="noopener noreferrer nofollow"
													className={`hover:underline ${isOwnDomain(source.domain, domain) ? "font-semibold text-blue-700" : "text-zinc-700"}`}
												>
													{source.domain}
												</a>
											</li>
										))}
										{prompt.sources.length > 4 ? (
											<li className="text-zinc-400">+{prompt.sources.length - 4} more</li>
										) : null}
									</ul>
								) : (
									<span className="text-zinc-400">—</span>
								)}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

function RankedBars({
	rows,
	total,
	empty,
}: {
	rows: { label: string; count: number; highlight?: boolean }[];
	total: number;
	empty: string;
}) {
	if (rows.length === 0) return <p className="text-sm text-zinc-500">{empty}</p>;
	return (
		<ol className="space-y-2.5">
			{rows.map((row) => (
				<li key={row.label}>
					<div className="flex items-baseline justify-between gap-3 text-sm">
						<span className={`truncate ${row.highlight ? "font-semibold text-blue-700" : "text-zinc-900"}`}>
							{row.label}
							{row.highlight ? " (you)" : ""}
						</span>
						<span className="shrink-0 tabular-nums text-zinc-500">
							{row.count}/{total}
						</span>
					</div>
					<div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100">
						<div
							className={`h-full rounded-full ${row.highlight ? "bg-blue-600" : "bg-zinc-400"}`}
							style={{ width: `${total === 0 ? 0 : (row.count / total) * 100}%` }}
						/>
					</div>
				</li>
			))}
		</ol>
	);
}

function StatusIcon({ state }: { state: "pass" | "fail" | "unknown" }) {
	if (state === "pass") {
		return <Check className="size-4 shrink-0 text-emerald-600" strokeWidth={2.5} aria-label="Pass" />;
	}
	if (state === "fail") return <X className="size-4 shrink-0 text-red-600" strokeWidth={2.5} aria-label="Fail" />;
	return <CircleHelp className="size-4 shrink-0 text-zinc-400" aria-label="Unknown" />;
}

const LINK = "font-medium text-blue-700 underline decoration-blue-200 underline-offset-4 hover:decoration-blue-700";

const ACCESS_DISPLAY = {
	allowed: { state: "pass", label: "Allowed", tone: "text-emerald-700" },
	blocked: { state: "fail", label: "Blocked", tone: "text-red-700" },
	unknown: { state: "unknown", label: "Unknown", tone: "text-zinc-500" },
} as const;

function SiteChecklist({ site, domain }: { site: SiteSignals; domain: string }) {
	const blocked = site.crawlers.filter((crawler) => crawler.access === "blocked");
	return (
		<div className="grid gap-8 lg:grid-cols-5">
			<div className="lg:col-span-3">
				<h4 className="text-sm font-semibold text-zinc-900">AI crawlers in robots.txt</h4>
				<ul className="mt-3 divide-y divide-zinc-100 rounded-lg ring-1 ring-zinc-200">
					{site.crawlers.map((crawler) => (
						<li key={crawler.token} className="flex items-start gap-3 px-3 py-2.5 text-sm">
							<span className="mt-0.5">
								<StatusIcon state={ACCESS_DISPLAY[crawler.access].state} />
							</span>
							<div className="min-w-0 flex-1">
								<p className="font-mono text-[13px] text-zinc-900">
									{crawler.token}{" "}
									<span className="font-sans text-xs text-zinc-500">
										{crawler.owner} · {crawler.kind === "search" ? "search" : "training"}
									</span>
								</p>
								<p className="text-[13px] text-zinc-600">{crawler.purpose}</p>
							</div>
							<span className={`shrink-0 text-xs font-medium ${ACCESS_DISPLAY[crawler.access].tone}`}>
								{ACCESS_DISPLAY[crawler.access].label}
							</span>
						</li>
					))}
				</ul>
				{blocked.length > 0 ? (
					<div className="mt-4 rounded-lg bg-zinc-50 p-4 text-sm text-zinc-700 ring-1 ring-zinc-200">
						<p>
							<span className="font-medium text-zinc-950">Fix:</span> if you want to appear in AI answers, allow at
							least the search crawlers in <code className="font-mono text-[13px]">{domain}/robots.txt</code>:
						</p>
						<pre className="mt-3 overflow-x-auto rounded-md bg-white p-3 font-mono text-[12px] leading-5 text-zinc-800 ring-1 ring-zinc-200">
							{blocked.map((crawler) => `User-agent: ${crawler.token}\nAllow: /`).join("\n\n")}
						</pre>
						<p className="mt-3">
							Read{" "}
							<a href="/blog/robots-txt-ai-crawlers" className={LINK}>
								which AI crawlers to allow and which to block
							</a>
							.
						</p>
					</div>
				) : site.robotsTxt === "unreachable" ? (
					<p className="mt-3 text-sm text-zinc-600">
						We couldn't read robots.txt (it may be behind bot protection). Check that it doesn't block the crawlers
						above.
					</p>
				) : null}
			</div>

			<div className="space-y-5 lg:col-span-2">
				<ChecklistItem
					state={site.homepageReachable ? "pass" : "unknown"}
					title="Homepage reachable"
					body={
						site.homepageReachable
							? site.title
								? `Title: “${site.title}”`
								: "Loaded, but it has no <title>."
							: "We couldn't load your homepage. If bot protection blocks us, it may block AI crawlers too."
					}
				/>
				<ChecklistItem
					state={site.structuredDataTypes.length > 0 ? "pass" : "fail"}
					title="Structured data (JSON-LD)"
					body={
						site.structuredDataTypes.length > 0 ? (
							`Found: ${site.structuredDataTypes.join(", ")}.`
						) : (
							<>
								Add Organization and WebSite JSON-LD so engines can tie your name, logo, and site together.{" "}
								<a href="/blog/structured-data-for-ai-search" className={LINK}>
									How to add it
								</a>
								.
							</>
						)
					}
				/>
				<ChecklistItem
					state={site.llmsTxt ? "pass" : "fail"}
					title="llms.txt"
					body={
						site.llmsTxt ? (
							"Found /llms.txt."
						) : (
							<>
								A short Markdown map of your key pages for AI agents. Low effort, small upside.{" "}
								<a href="/blog/do-llms-txt-files-matter-for-aeo" className={LINK}>
									Does llms.txt matter?
								</a>
							</>
						)
					}
				/>
			</div>
		</div>
	);
}

function ChecklistItem({
	state,
	title,
	body,
}: {
	state: "pass" | "fail" | "unknown";
	title: string;
	body: React.ReactNode;
}) {
	return (
		<div className="flex items-start gap-3">
			<span className="mt-0.5">
				<StatusIcon state={state} />
			</span>
			<div className="min-w-0">
				<h4 className="text-sm font-semibold text-zinc-900">{title}</h4>
				<p className="mt-0.5 text-pretty text-[13px] text-zinc-600">{body}</p>
			</div>
		</div>
	);
}

function TrackCta({ result, compact = false }: { result: CheckResult; compact?: boolean }) {
	const signupUrl = cloudAppUrl("marketing-checker", result.domain);
	const demoUrl = demoSiteUrl("marketing-checker");
	return (
		<section
			className={`relative overflow-hidden rounded-2xl bg-zinc-950 text-white ${compact ? "p-6 md:p-8" : "p-6 md:p-10"}`}
		>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,rgb(255_255_255/0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255/0.05)_1px,transparent_1px)] [background-size:40px_40px] [mask-image:linear-gradient(to_left,black,transparent_70%)]"
			/>
			<div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
				<div className="max-w-2xl">
					<h3 className="text-2xl font-semibold tracking-tight text-balance md:text-3xl">
						This was {result.prompts.length} prompts on 1 model, once.
					</h3>
					<p className="mt-3 text-pretty text-zinc-300 md:text-lg">
						AI answers change from run to run. Elmo Cloud tracks hundreds of prompts across ChatGPT, Claude, Gemini,
						Perplexity, and Google AI Overviews every day, from ${CLOUD_ENTRY_PRICE_USD}/mo.
					</p>
				</div>
				<div className="flex shrink-0 flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
					<a
						href={signupUrl}
						onClick={() => trackChecker("signup", { domain: result.domain, score: result.score.total })}
						className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 text-base font-medium text-white transition-colors hover:bg-blue-500"
					>
						Track {result.domain} every day
						<ArrowRight className="size-4" aria-hidden="true" />
					</a>
					<a
						href={demoUrl}
						target="_blank"
						rel={externalRel(demoUrl)}
						className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-white/10 px-6 text-base font-medium text-white ring-1 ring-inset ring-white/20 transition-colors hover:bg-white/15"
					>
						Try the live demo
						<ArrowUpRight className="size-4" aria-hidden="true" />
					</a>
				</div>
			</div>
		</section>
	);
}
