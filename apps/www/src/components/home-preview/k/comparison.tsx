import { Link } from "@tanstack/react-router";
import { CLOUD_ENTRY_PRICE_USD, PLANS } from "@workspace/config/plans";
import { CUSTOMER_QUOTES } from "@workspace/ui/brand/customers";
import { ArrowRight, Check, Lock } from "lucide-react";
import { Logo } from "@/components/logo";
import { SectionHeading } from "./ui";

// Competitor cells come only from their public pricing pages as captured in
// September 2026. "unknown" means the plan details we reviewed didn't say, so
// the table shows a dash rather than guessing.

type Tone = "yes" | "gated" | "plain" | "unknown";
type Cell = { text: string; note?: string; tone: Tone };

const COMPETITORS = ["Profound", "Peec AI", "SE Ranking", "Promptwatch"] as const;

interface Row {
	label: string;
	elmo: Cell;
	them: [Cell, Cell, Cell, Cell];
}

const UNKNOWN: Cell = { text: "Not stated", tone: "unknown" };

const ROWS: Row[] = [
	{
		label: "Entry price",
		elmo: { text: `$${CLOUD_ENTRY_PRICE_USD}/mo`, note: "or $0 self-hosted", tone: "yes" },
		them: [
			{ text: "No public price", note: "7-day free trial, then Enterprise", tone: "gated" },
			{ text: "$95/mo", tone: "plain" },
			{ text: "$103.20 + $71.20/mo", note: "Core plus AI Search add-on, billed annually", tone: "plain" },
			{ text: "$95/mo", tone: "plain" },
		],
	},
	{
		label: "API access",
		elmo: { text: "Every plan", note: "REST API and MCP server", tone: "yes" },
		them: [
			{ text: "Enterprise only", tone: "gated" },
			{ text: "Enterprise only", tone: "gated" },
			{ text: "Every paid plan", note: "Credit-metered", tone: "plain" },
			UNKNOWN,
		],
	},
	{
		label: "Seats",
		elmo: { text: "Unlimited", note: "On every plan", tone: "yes" },
		them: [
			{ text: "Unlimited", note: "On the trial", tone: "plain" },
			{ text: "Unlimited", tone: "plain" },
			{ text: "1 on Core, 3 on Growth", note: "One active session at a time", tone: "gated" },
			{ text: "1 / 2 / 5 by plan", tone: "gated" },
		],
	},
	{
		label: "Claude & Perplexity",
		elmo: {
			text: `From $${PLANS.basic.monthlyPriceUsd}/mo`,
			note: "Basic and up; Starter is ChatGPT only",
			tone: "yes",
		},
		them: [
			{ text: "Enterprise only", tone: "gated" },
			{ text: "Enterprise only", tone: "gated" },
			{ text: "Perplexity via add-on", note: "Claude not listed", tone: "plain" },
			{ text: "4 models per plan", tone: "plain" },
		],
	},
	{
		label: "Sampling",
		elmo: {
			text: `Up to ${PLANS.basic.standardRunsPerDay}× a day`,
			note: `Basic and up; ${PLANS.starter.standardRunsPerDay}× on Starter`,
			tone: "yes",
		},
		them: [{ text: "Daily", tone: "plain" }, { text: "Daily", tone: "plain" }, UNKNOWN, UNKNOWN],
	},
	{
		label: "Self-hosting",
		elmo: { text: "Free, open source", note: "Any model, incl. OpenRouter", tone: "yes" },
		them: [
			{ text: "Not listed", tone: "plain" },
			{ text: "Not listed", tone: "plain" },
			{ text: "Not listed", tone: "plain" },
			{ text: "Not listed", tone: "plain" },
		],
	},
];

function CellBody({ cell, elmo = false }: { cell: Cell; elmo?: boolean }) {
	if (cell.tone === "unknown") {
		return (
			<span className="text-zinc-400">
				<span aria-hidden="true">—</span>
				<span className="sr-only">{cell.text}</span>
			</span>
		);
	}
	return (
		<span className="flex items-start gap-2">
			{cell.tone === "yes" ? (
				<span className="mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
					<Check className="size-2.5" strokeWidth={3.5} aria-hidden="true" />
				</span>
			) : null}
			{cell.tone === "gated" ? <Lock className="mt-0.5 size-3.5 shrink-0 text-zinc-400" aria-hidden="true" /> : null}
			<span className="min-w-0">
				<span className={`block ${elmo ? "font-semibold text-zinc-950" : "text-zinc-800"}`}>{cell.text}</span>
				{cell.note ? (
					<span className={`mt-0.5 block text-[12px]/4 ${elmo ? "text-blue-800/80" : "text-zinc-500"}`}>
						{cell.note}
					</span>
				) : null}
			</span>
		</span>
	);
}

function DesktopTable() {
	return (
		<div className="hidden overflow-hidden rounded-2xl bg-white shadow-[0_0_0_1px_rgb(24_24_27/0.09),0_1px_2px_rgb(24_24_27/0.04),0_24px_48px_-24px_rgb(24_24_27/0.18)] lg:block">
			<table className="w-full table-fixed border-collapse text-left text-[14px]/5">
				<caption className="sr-only">
					Elmo compared with Profound, Peec AI, SE Ranking and Promptwatch, based on public pricing pages in September
					2026
				</caption>
				<colgroup>
					<col className="w-[17%]" />
					<col className="w-[19%]" />
					<col />
					<col />
					<col />
					<col />
				</colgroup>
				<thead>
					<tr>
						<th scope="col" className="px-5 pb-4 pt-5 align-bottom">
							<span className="sr-only">Feature</span>
						</th>
						<th scope="col" className="bg-blue-600 px-5 pb-4 pt-5 align-bottom">
							<span className="sr-only">Elmo</span>
							<Logo className="text-[1.6rem] leading-none text-white" aria-hidden="true" />
						</th>
						{COMPETITORS.map((name) => (
							<th
								key={name}
								scope="col"
								className="px-5 pb-4 pt-5 align-bottom text-[13px] font-semibold text-zinc-500"
							>
								{name}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{ROWS.map((row) => (
						<tr key={row.label} className="border-t border-zinc-100">
							<th scope="row" className="px-5 py-4 align-top text-[14px] font-semibold text-zinc-950">
								{row.label}
							</th>
							<td
								className={`bg-blue-50 px-5 py-4 align-top shadow-[inset_1.5px_0_0_rgb(37_99_235),inset_-1.5px_0_0_rgb(37_99_235)]`}
							>
								<CellBody cell={row.elmo} elmo />
							</td>
							{row.them.map((cell, i) => (
								<td key={COMPETITORS[i]} className="px-5 py-4 align-top">
									<CellBody cell={cell} />
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

function MobileRows() {
	return (
		<ul className="space-y-3 lg:hidden">
			{ROWS.map((row) => (
				<li
					key={row.label}
					className="overflow-hidden rounded-2xl bg-white text-[14px]/5 shadow-[0_0_0_1px_rgb(24_24_27/0.09),0_1px_2px_rgb(24_24_27/0.04)]"
				>
					<h3 className="px-4 pt-4 text-[15px] font-semibold text-zinc-950">{row.label}</h3>
					<div className="mx-3 mt-3 rounded-xl bg-blue-50 p-3 ring-[1.5px] ring-blue-600">
						<p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-blue-700">Elmo</p>
						<CellBody cell={row.elmo} elmo />
					</div>
					<dl className="grid grid-cols-2 gap-x-4 gap-y-3 p-4">
						{row.them.map((cell, i) => (
							<div key={COMPETITORS[i]}>
								<dt className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
									{COMPETITORS[i]}
								</dt>
								<dd>
									<CellBody cell={cell} />
								</dd>
							</div>
						))}
					</dl>
				</li>
			))}
		</ul>
	);
}

function SpeakeasyQuote() {
	const { quote, author, company, companyUrl, mark } = CUSTOMER_QUOTES.speakeasy;
	return (
		<figure className="relative flex h-full flex-col justify-between overflow-hidden rounded-2xl bg-blue-600 p-7 text-white shadow-[0_24px_48px_-20px_rgb(37_99_235/0.6)] md:p-8">
			<div>
				<p className="text-[13px] font-semibold text-blue-100">On pricing</p>
				<blockquote className="mt-4 text-pretty text-[1.65rem]/[1.2] font-semibold tracking-[-0.025em] md:text-[2rem]/[1.15]">
					“{quote}”
				</blockquote>
			</div>
			<figcaption className="relative mt-8 flex items-center justify-between gap-4 border-t border-white/20 pt-5 text-sm">
				<span className="text-blue-100">
					<span className="font-medium text-white">{author}</span>, {company}
				</span>
				<a
					href={companyUrl}
					target="_blank"
					rel="noopener noreferrer"
					aria-label={company}
					className="inline-flex items-center rounded-sm text-white transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
				>
					{mark}
				</a>
			</figcaption>
		</figure>
	);
}

export function Comparison() {
	return (
		<section id="compare" className="border-t border-zinc-200 bg-zinc-50/70">
			<div className="mx-auto max-w-6xl px-4 py-20 md:px-6 lg:py-28">
				<div className="grid gap-8 lg:grid-cols-12 lg:items-stretch lg:gap-10">
					<div className="flex flex-col justify-between gap-8 lg:col-span-7">
						<SectionHeading
							eyebrow="What's gated elsewhere"
							title="What others keep behind Enterprise, Elmo puts on the price list."
							lede="API access, seats, and the engines your buyers use are where AI visibility pricing usually climbs. Here's where each tool draws the line."
						/>
					</div>
					<div className="lg:col-span-5">
						<SpeakeasyQuote />
					</div>
				</div>

				<div className="mt-12 lg:mt-14">
					<DesktopTable />
					<MobileRows />
				</div>

				<div className="mt-5 flex flex-col gap-3 text-[13px] text-zinc-500 md:flex-row md:items-center md:justify-between">
					<p className="flex items-center gap-2">
						<Lock className="size-3.5 shrink-0 text-zinc-400" aria-hidden="true" />
						<span>
							Based on public pricing pages, Sept 2026. Monthly list prices unless noted; — means the page didn't say.
						</span>
					</p>
					<Link
						to="/ai-visibility-tools/compare"
						className="group inline-flex shrink-0 items-center gap-1 font-medium text-blue-600 hover:text-blue-700"
					>
						Full head-to-head comparisons
						<ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
					</Link>
				</div>
			</div>
		</section>
	);
}
