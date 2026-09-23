import { PLANS, PREMIUM_MODELS, premiumModelLabel, premiumPlanNames } from "@workspace/config/plans";
import { ArrowUpRight } from "lucide-react";
import { ModelIcon } from "./models";
import { REPO_URL, repoFile, SpecLabel } from "./ui";

// Mirrors CLOUD_PLATFORMS in packages/config/src/plans.ts, grouped for reading.
const SCRAPED = ["ChatGPT", "Google AI Mode", "Google AI Overviews", "Gemini", "Perplexity", "Copilot"];
const VIA_API = ["Claude", "DeepSeek", "Mistral", "Qwen"];
const SCRAPERS = ["Cloro", "BrightData", "Oxylabs", "SearchApi", "Olostep", "DataForSEO"];

const FORMULAS = [
	{
		term: "visibility",
		expr: "answers that mention you ÷ answers sampled",
		file: "apps/web/src/lib/postgres-read.ts",
	},
	{
		term: "share of voice",
		expr: "your mentions ÷ (yours + tracked competitors')",
		file: "packages/lib/src/report-metrics.ts",
	},
	{
		term: "mention",
		expr: "case-insensitive match on name, alias, or domain",
		file: "packages/lib/src/mentions.ts",
	},
	{
		term: "citations",
		expr: "every cited URL, by domain and source category",
		file: "apps/web/src/lib/domain-categories.ts",
	},
];

function Clause({
	n,
	title,
	children,
	aside,
}: {
	n: string;
	title: string;
	children: React.ReactNode;
	aside: React.ReactNode;
}) {
	return (
		<div className="grid gap-6 border-t border-white/12 py-10 md:grid-cols-12 md:gap-10 lg:py-12">
			<div className="md:col-span-5">
				<p className="font-mono text-[11px] tabular-nums tracking-[0.16em] text-blue-400">{n}</p>
				<h3 className="mt-3 text-xl font-semibold tracking-[-0.02em] text-[#f7f5f0] md:text-[1.375rem]">{title}</h3>
				<div className="mt-3 space-y-3 text-pretty text-[15px]/7 text-[#c9c3b8]">{children}</div>
			</div>
			<div className="md:col-span-7">{aside}</div>
		</div>
	);
}

function Chip({ name, tag }: { name: string; tag: string }) {
	return (
		<li className="flex items-center justify-between gap-3 border-b border-white/8 py-2.5 last:border-b-0">
			<span className="inline-flex items-center gap-2.5 text-[14px] text-[#f7f5f0]">
				<span className="inline-flex size-4 items-center justify-center text-[#c9c3b8]">
					<ModelIcon name={name} className="size-3.5" />
				</span>
				{name}
			</span>
			<span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#9d968a]">{tag}</span>
		</li>
	);
}

function DayTimeline() {
	const ticks = [0, 6, 12, 18];
	return (
		<div className="rounded-lg p-5 ring-1 ring-white/12">
			<div className="flex items-center justify-between font-mono text-[10.5px] uppercase tracking-[0.14em] text-[#9d968a]">
				<span>1 prompt · 1 platform · 1 day</span>
				<span className="text-blue-400">4 samples</span>
			</div>
			<div className="relative mt-8 h-10" aria-hidden="true">
				<div className="absolute inset-x-0 top-1/2 h-px bg-white/20" />
				{ticks.map((h) => (
					<span
						key={h}
						className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
						style={{ left: `${(h / 24) * 100 + 12.5}%` }}
					>
						<span className="block size-3 rounded-full bg-blue-500 ring-4 ring-[#1c1a17]" />
					</span>
				))}
				{[0, 6, 12, 18, 24].map((h) => (
					<span
						key={h}
						className="absolute top-full mt-1 -translate-x-1/2 font-mono text-[10px] tabular-nums text-[#9d968a]"
						style={{ left: `${(h / 24) * 100}%` }}
					>
						{String(h).padStart(2, "0")}:00
					</span>
				))}
			</div>
			<dl className="mt-10 grid grid-cols-3 gap-4 border-t border-white/10 pt-4 text-[13px]">
				<div>
					<dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#9d968a]">Basic & up</dt>
					<dd className="mt-1 text-[#f7f5f0]">{PLANS.basic.standardRunsPerDay}× a day</dd>
				</div>
				<div>
					<dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#9d968a]">Starter</dt>
					<dd className="mt-1 text-[#f7f5f0]">{PLANS.starter.standardRunsPerDay}× a day, ChatGPT</dd>
				</div>
				<div>
					<dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#9d968a]">Self-hosted</dt>
					<dd className="mt-1 text-[#f7f5f0]">Set your own cadence</dd>
				</div>
			</dl>
		</div>
	);
}

function FormulaSheet() {
	return (
		<dl className="divide-y divide-white/8 rounded-lg ring-1 ring-white/12">
			{FORMULAS.map((f) => (
				<div key={f.term} className="grid gap-1 px-5 py-4 sm:grid-cols-[8.5rem_1fr_auto] sm:items-baseline sm:gap-4">
					<dt className="font-mono text-[12.5px] text-blue-400">{f.term}</dt>
					<dd className="font-mono text-[12.5px]/5 text-[#f7f5f0]">= {f.expr}</dd>
					<dd>
						<a
							href={repoFile(f.file)}
							target="_blank"
							rel="noopener noreferrer"
							className="group inline-flex items-center gap-1 rounded-sm font-mono text-[11px] text-[#9d968a] transition-colors hover:text-[#f7f5f0] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
						>
							{f.file.split("/").pop()}
							<ArrowUpRight className="size-3" aria-hidden="true" />
							<span className="sr-only"> (source on GitHub)</span>
						</a>
					</dd>
				</div>
			))}
		</dl>
	);
}

function ProofList() {
	const items = [
		{
			k: "Raw answers",
			v: "Open any prompt to see each run and the full response it was counted from.",
		},
		{
			k: "Open code",
			v: "Collection, matching and scoring are MIT-licensed on GitHub. Read it, or run it yourself.",
			href: REPO_URL,
			cta: "github.com/elmohq/elmo",
		},
		{
			k: "Scraper status",
			v: "We run every supported scraping provider continuously and publish reliability and speed.",
			href: "/status",
			cta: "elmohq.com/status",
			internal: true,
		},
	];
	return (
		<ul className="divide-y divide-white/8 rounded-lg ring-1 ring-white/12">
			{items.map((item) => (
				<li key={item.k} className="grid gap-1 px-5 py-4 sm:grid-cols-[8.5rem_1fr] sm:gap-4">
					<span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#9d968a] sm:pt-0.5">{item.k}</span>
					<span className="text-[14px]/6 text-[#e7e2d8]">
						{item.v}
						{item.href ? (
							<a
								href={item.href}
								{...(item.internal ? {} : { target: "_blank", rel: "noopener noreferrer" })}
								className="group ml-1.5 inline-flex items-center gap-0.5 rounded-sm font-mono text-[12px] text-blue-400 underline decoration-blue-400/30 underline-offset-4 hover:decoration-blue-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
							>
								{item.cta}
								<ArrowUpRight className="size-3" aria-hidden="true" />
							</a>
						) : null}
					</span>
				</li>
			))}
		</ul>
	);
}

/** The methodology band: where answers come from, how often, how they're counted, and how to check. */
export function Method() {
	const premium = PREMIUM_MODELS.map(premiumModelLabel).join(", ");
	return (
		<section id="method" className="bg-[#1c1a17] text-[#f7f5f0]">
			<div className="mx-auto max-w-6xl px-4 py-20 md:px-6 lg:py-28">
				<SpecLabel n="§ 01" tone="ink">
					How Elmo measures
				</SpecLabel>
				<div className="mt-8 grid gap-5 lg:grid-cols-12 lg:items-end lg:gap-12">
					<h2 className="text-[2rem] font-semibold leading-[1.06] tracking-[-0.03em] text-balance md:text-[2.75rem] lg:col-span-7">
						A score is only as good as how it was collected.
					</h2>
					<p className="max-w-[52ch] text-pretty text-base/7 text-[#c9c3b8] lg:col-span-5 lg:pb-1">
						So here is the whole method: where Elmo gets each answer, how often it asks, and the arithmetic behind every
						number — with links to the code that does it.
					</p>
				</div>

				<div className="mt-14">
					<Clause
						n="01 — SOURCE"
						title="Read from the product your buyers use."
						aside={
							<div className="grid gap-4 sm:grid-cols-2">
								<div className="rounded-lg px-5 py-3 ring-1 ring-white/12">
									<p className="pb-1 pt-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-blue-400">
										Scraped from the UI
									</p>
									<ul>
										{SCRAPED.map((m) => (
											<Chip key={m} name={m} tag="UI" />
										))}
									</ul>
								</div>
								<div className="flex flex-col gap-4">
									<div className="rounded-lg px-5 py-3 ring-1 ring-white/12">
										<p className="pb-1 pt-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-blue-400">
											Via the model's API
										</p>
										<ul>
											{VIA_API.map((m) => (
												<Chip key={m} name={m} tag="API" />
											))}
										</ul>
									</div>
									<div className="rounded-lg p-5 ring-1 ring-white/12">
										<p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-blue-400">Self-hosted</p>
										<p className="mt-2 text-[13.5px]/6 text-[#c9c3b8]">
											Pick a scraper — {SCRAPERS.join(", ")} — or any model on OpenRouter, with your own keys.
										</p>
									</div>
								</div>
							</div>
						}
					>
						<p>
							ChatGPT and Google AI Mode have no public API, and a model API with web search on isn't what a shopper
							sees. So Elmo Cloud scrapes the consumer products wherever it can, and uses model APIs for the rest.
						</p>
						<p>
							Grounded models with their own web search — {premium} — run on {premiumPlanNames()}.
						</p>
					</Clause>

					<Clause n="02 — FREQUENCY" title="Asked up to four times a day." aside={<DayTimeline />}>
						<p>
							The same question gets a different answer from one run to the next. One sample a day is an anecdote;
							several a day, every day, is a trend you can act on.
						</p>
						<p>Grounded premium models run once a day, because each call is metered.</p>
					</Clause>

					<Clause n="03 — ARITHMETIC" title="Counted the same way, every time." aside={<FormulaSheet />}>
						<p>
							Each metric is a plain ratio over answers Elmo actually collected, and the same matching rule applies to
							you and every competitor you track.
						</p>
					</Clause>

					<Clause n="04 — PROOF" title="Check it yourself." aside={<ProofList />}>
						<p>
							Don't take our word for any of the above. Open the answers, read the code, or run the whole thing on your
							own servers and compare.
						</p>
					</Clause>
				</div>
			</div>
		</section>
	);
}
