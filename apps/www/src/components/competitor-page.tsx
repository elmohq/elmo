import { Link } from "@tanstack/react-router";
import { CLOUD_ENTRY_PRICE_USD, PLANS } from "@workspace/config/plans";
import { cloudAppUrl } from "@workspace/config/referrals";
import { ArrowRight, Check, CornerDownRight } from "lucide-react";
import type { ReactNode } from "react";
import { VisibilityPageGraphic } from "@/components/feature-graphics";
import { FeatureMark } from "@/components/feature-mark";
import { CARD } from "@/components/home/ui";
import {
	type Competitor,
	type CompetitorReview,
	ELMO_FEATURES,
	type FeatureKey,
	getComparisonSlug,
	getScreenshotUrl,
} from "@/lib/competitors";

const ENGINE_KEYS: FeatureKey[] = [
	"chatgpt",
	"googleAiOverviews",
	"googleAiMode",
	"gemini",
	"perplexity",
	"copilot",
	"claude",
	"grok",
	"deepseek",
	"metaAi",
];

function engineCount(features: Partial<Record<FeatureKey, boolean>>): number {
	return ENGINE_KEYS.filter((key) => features[key]).length;
}

function engineSummary(features: Partial<Record<FeatureKey, boolean>>): string {
	return `${engineCount(features)} of ${ENGINE_KEYS.length}`;
}

function startingPrice(c: Competitor): string {
	return c.pricing?.startingPrice ?? (c.pricing?.hasFree ? "Free" : "Not published");
}

export interface GlanceTile {
	label: string;
	value: string;
	detail?: string;
}

/** Hand-checked facts from a review where one exists, otherwise what the directory records for every tool. */
export function competitorGlance(c: Competitor, review?: CompetitorReview): GlanceTile[] {
	if (review) {
		const g = review.glance;
		return [
			{ label: "Starting Price", ...g.startingPrice },
			{ label: "AI Engines", ...g.engines },
			{ label: "Sampling", ...g.sampling },
			{ label: "API Access", ...g.api },
			{ label: "Open Source", ...g.openSource },
		];
	}
	const open = Boolean(c.license || c.features.openSource);
	return [
		{
			label: "Starting Price",
			value: startingPrice(c),
			detail: c.pricing?.hasFree ? "Free tier available" : "No free tier",
		},
		{ label: "AI Engines", value: engineSummary(c.features), detail: "Of the engines we track" },
		{
			label: "API Access",
			value: c.features.dataExportApi ? "Yes" : "No",
			detail: c.features.mcpServer ? "Plus an MCP server" : undefined,
		},
		{ label: "Open Source", value: open ? "Yes" : "No", detail: c.license },
	];
}

const GRID_BG =
	"pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,rgb(0_0_0/0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgb(0_0_0/0.04)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:linear-gradient(to_bottom,black,transparent_90%)]";

/** A competitor's homepage capture in browser chrome, with its domain in the address bar. */
export function SiteScreenshot({ competitor, className = "" }: { competitor: Competitor; className?: string }) {
	return (
		<div className={className}>
			<div className="overflow-hidden rounded-xl bg-white shadow-[0_0_0_1px_rgb(24_24_27/0.08),0_2px_4px_rgb(24_24_27/0.04),0_24px_48px_-16px_rgb(24_24_27/0.18)]">
				<div className="flex h-8 items-center gap-3 border-b border-zinc-200/80 bg-zinc-50/80 px-3.5">
					<span aria-hidden="true" className="flex gap-1.5">
						<span className="size-2.5 rounded-full bg-zinc-300" />
						<span className="size-2.5 rounded-full bg-zinc-300" />
						<span className="size-2.5 rounded-full bg-zinc-300" />
					</span>
					<span className="truncate rounded-md bg-white px-2 py-0.5 font-mono text-[11px] text-zinc-500 ring-1 ring-zinc-200/80">
						{competitor.domain}
					</span>
				</div>
				<img
					src={getScreenshotUrl(competitor.slug)}
					alt={`Screenshot of the ${competitor.name} homepage`}
					width={1920}
					height={1080}
					className="aspect-[16/10] w-full object-cover object-top"
				/>
			</div>
		</div>
	);
}

export function StatTiles({ tiles }: { tiles: GlanceTile[] }) {
	return (
		<dl
			className={`grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-zinc-200/80 ring-1 ring-zinc-200/80 [&>div:last-child:nth-child(odd)]:col-span-2 md:[&>div:last-child:nth-child(odd)]:col-span-1 ${tiles.length === 5 ? "md:grid-cols-5" : "md:grid-cols-4"}`}
		>
			{tiles.map((tile) => (
				<div key={tile.label} className="bg-white p-4 md:p-5">
					<dt className="text-sm text-zinc-500">{tile.label}</dt>
					<dd className="mt-2 text-lg font-semibold tracking-[-0.02em] text-zinc-950 md:text-xl">{tile.value}</dd>
					{tile.detail ? <dd className="mt-0.5 text-[13px] leading-snug text-zinc-500">{tile.detail}</dd> : null}
				</div>
			))}
		</dl>
	);
}

export interface JumpLink {
	id: string;
	label: string;
}

export function CompetitorHero({
	competitor,
	title,
	lead,
	note,
	tiles,
	jumpLinks,
	children,
}: {
	competitor: Competitor;
	title: string;
	lead: string;
	note?: ReactNode;
	tiles: GlanceTile[];
	jumpLinks: JumpLink[];
	children?: ReactNode;
}) {
	const shot = !competitor.noScreenshot;
	return (
		<section className="relative overflow-hidden border-b border-zinc-200 bg-white">
			<div aria-hidden="true" className={GRID_BG} />
			<div className="relative mx-auto max-w-6xl px-4 pb-12 pt-8 md:px-6 lg:pb-16 lg:pt-12">
				<div className={shot ? "grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:gap-14" : ""}>
					<div className={shot ? "" : "max-w-3xl"}>
						<h1 className="text-4xl font-semibold leading-[1.05] tracking-[-0.035em] text-balance text-zinc-950 md:text-5xl">
							{title}
						</h1>
						<p className="mt-5 text-pretty text-base/7 text-zinc-600 md:text-lg/8">{lead}</p>
						{note ? <p className="mt-4 text-sm text-zinc-500">{note}</p> : null}
						{children ? <div className="mt-6">{children}</div> : null}
					</div>
					{shot ? <SiteScreenshot competitor={competitor} /> : null}
				</div>
				<div className="mt-10 lg:mt-12">
					<StatTiles tiles={tiles} />
				</div>
				<nav aria-label="On this page" className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm">
					{jumpLinks.map((link) => (
						<a
							key={link.id}
							href={`#${link.id}`}
							className="text-zinc-500 underline decoration-zinc-300 underline-offset-4 transition hover:text-zinc-950 hover:decoration-zinc-500"
						>
							{link.label}
						</a>
					))}
				</nav>
			</div>
		</section>
	);
}

function ToolThumb({ competitor }: { competitor: Competitor }) {
	if (competitor.noScreenshot) {
		return (
			<div className="relative grid aspect-[2/1] sm:aspect-[16/10] place-items-center bg-zinc-50">
				<div
					aria-hidden="true"
					className="absolute inset-0 [background-image:radial-gradient(circle,rgb(0_0_0/0.07)_1px,transparent_1px)] [background-size:16px_16px]"
				/>
				<span className="relative text-sm text-zinc-400">{competitor.domain}</span>
			</div>
		);
	}
	return (
		<img
			src={getScreenshotUrl(competitor.slug)}
			alt={`Screenshot of the ${competitor.name} homepage`}
			width={1920}
			height={1080}
			loading="lazy"
			className="aspect-[2/1] sm:aspect-[16/10] w-full object-cover object-top"
		/>
	);
}

function AlternativeCard({ competitor }: { competitor: Competitor }) {
	return (
		<article className={`flex flex-col overflow-hidden ${CARD}`}>
			<div className="border-b border-zinc-200/80">
				<ToolThumb competitor={competitor} />
			</div>
			<div className="flex flex-1 flex-col p-5">
				<h3 className="text-base font-semibold text-zinc-950">{competitor.name}</h3>
				<p className="mt-1.5 line-clamp-2 flex-1 text-sm/6 text-zinc-600">{competitor.tagline}</p>
				<dl className="mt-4 grid grid-cols-2 gap-3 border-t border-dashed border-zinc-200 pt-4">
					<div>
						<dt className="text-xs text-zinc-500">Starting Price</dt>
						<dd className="mt-1 truncate text-sm font-medium text-zinc-950">{startingPrice(competitor)}</dd>
					</div>
					<div>
						<dt className="text-xs text-zinc-500">AI Engines</dt>
						<dd className="mt-1 text-sm font-medium text-zinc-950">{engineSummary(competitor.features)}</dd>
					</div>
				</dl>
				<Link
					to="/ai-visibility-tools/$slug"
					params={{ slug: getComparisonSlug(competitor) }}
					className="mt-4 inline-flex items-center gap-1 self-start text-sm font-medium text-blue-700 hover:text-blue-900"
				>
					Compare With Elmo
					<ArrowRight className="size-3.5" />
				</Link>
			</div>
		</article>
	);
}

export function AlternativeGrid({ competitors }: { competitors: Competitor[] }) {
	return (
		<div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
			{competitors.map((c) => (
				<AlternativeCard key={c.slug} competitor={c} />
			))}
		</div>
	);
}

const ELMO_POINTS = [
	"Free to self-host under the MIT license",
	`Elmo Cloud from $${CLOUD_ENTRY_PRICE_USD}/mo, no sales call`,
	`Up to ${PLANS.basic.standardRunsPerDay}× a day sampling from $${PLANS.basic.monthlyPriceUsd}/mo`,
	"API, MCP, and unlimited seats on every plan",
];

export function ElmoPickCard({ competitor, pitch }: { competitor: Competitor; pitch: string }) {
	return (
		<article className="grid gap-8 overflow-hidden rounded-2xl bg-white p-6 shadow-[0_0_0_1px_rgb(37_99_235/0.35),0_16px_40px_-20px_rgb(37_99_235/0.35)] md:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center">
			<div>
				<p className="text-sm font-medium text-blue-700">Our Pick</p>
				<h3 className="mt-1 text-2xl font-semibold tracking-[-0.025em] text-zinc-950">
					Elmo: The Open-Source Alternative
				</h3>
				<p className="mt-3 text-pretty text-sm/6 text-zinc-600">{pitch}</p>
				<ul className="mt-5 space-y-2 text-sm">
					{ELMO_POINTS.map((point) => (
						<li key={point} className="flex items-start gap-2 text-zinc-700">
							<Check className="mt-0.5 size-4 shrink-0 text-blue-600" strokeWidth={2.5} aria-hidden="true" />
							{point}
						</li>
					))}
				</ul>
				<div className="mt-6 flex flex-wrap gap-3">
					<a
						href={cloudAppUrl("marketing-competitor-alternatives")}
						className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-700"
					>
						Start With Elmo Cloud
						<ArrowRight className="size-4" aria-hidden="true" />
					</a>
					<Link
						to="/ai-visibility-tools/$slug"
						params={{ slug: getComparisonSlug(competitor) }}
						className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium text-zinc-950 ring-1 ring-inset ring-zinc-200 transition hover:bg-zinc-50"
					>
						Elmo vs {competitor.name}
					</Link>
				</div>
			</div>
			<VisibilityPageGraphic />
		</article>
	);
}

interface ComparisonRow {
	name: string;
	price: string;
	free: boolean;
	engines: string;
	api: boolean;
	mcp: boolean;
	open: boolean;
	slug?: string;
}

function toRow(c: Competitor): ComparisonRow {
	return {
		name: c.name,
		price: startingPrice(c),
		free: Boolean(c.pricing?.hasFree),
		engines: engineSummary(c.features),
		api: Boolean(c.features.dataExportApi),
		mcp: Boolean(c.features.mcpServer),
		open: Boolean(c.license || c.features.openSource),
		slug: getComparisonSlug(c),
	};
}

const ELMO_ROW: ComparisonRow = {
	name: "Elmo",
	price: `Free to self-host, cloud from $${CLOUD_ENTRY_PRICE_USD}/mo`,
	free: true,
	engines: engineSummary(ELMO_FEATURES),
	api: ELMO_FEATURES.dataExportApi,
	mcp: ELMO_FEATURES.mcpServer,
	open: ELMO_FEATURES.openSource,
};

export function QuickComparisonTable({
	competitor,
	alternatives,
}: {
	competitor: Competitor;
	alternatives: Competitor[];
}) {
	const rows = [ELMO_ROW, ...alternatives.map(toRow), { ...toRow(competitor), slug: undefined }];
	const th = "px-4 py-3 text-left text-xs font-medium text-zinc-500";
	return (
		<div className={`overflow-hidden ${CARD}`}>
			<div className="relative overflow-x-auto">
				<table className="w-full min-w-[720px] text-sm">
					<thead>
						<tr className="border-b border-zinc-200 bg-zinc-50/80">
							<th className={`${th} sticky left-0 bg-zinc-50`}>Tool</th>
							<th className={th}>Starting Price</th>
							<th className={`${th} text-center`}>Free Option</th>
							<th className={th}>AI Engines</th>
							<th className={`${th} text-center`}>API</th>
							<th className={`${th} text-center`}>MCP</th>
							<th className={`${th} text-center`}>Open Source</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((row, i) => {
							const elmo = i === 0;
							const subject = i === rows.length - 1;
							const bg = elmo ? "bg-blue-50" : subject ? "bg-zinc-50" : "bg-white";
							return (
								<tr key={row.name} className={`border-b border-dashed border-zinc-200 last:border-0 ${bg}`}>
									<th scope="row" className={`sticky left-0 px-4 py-3 text-left font-medium text-zinc-950 ${bg}`}>
										{row.slug ? (
											<Link
												to="/ai-visibility-tools/$slug"
												params={{ slug: row.slug }}
												className="hover:text-blue-700 hover:underline"
											>
												{row.name}
											</Link>
										) : (
											row.name
										)}
										{elmo ? <span className="ml-2 text-xs font-normal text-blue-700">Our Pick</span> : null}
										{subject ? <span className="ml-2 text-xs font-normal text-zinc-500">This Page</span> : null}
									</th>
									<td className="px-4 py-3 text-zinc-700">{row.price}</td>
									<td className="px-4 py-3 text-center">
										<FeatureMark has={row.free} />
									</td>
									<td className="px-4 py-3 tabular-nums text-zinc-700">{row.engines}</td>
									<td className="px-4 py-3 text-center">
										<FeatureMark has={row.api} />
									</td>
									<td className="px-4 py-3 text-center">
										<FeatureMark has={row.mcp} />
									</td>
									<td className="px-4 py-3 text-center">
										<FeatureMark has={row.open} />
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
			<p className="border-t border-zinc-200 px-4 py-3 text-xs text-zinc-500">
				From our AI visibility tool directory. Engines count the {ENGINE_KEYS.length} answer engines we track, on any
				plan or add-on. A free option means a free tier or free self-hosting.
			</p>
		</div>
	);
}

export function AudienceCards({
	name,
	stay,
	leave,
	stayTitle,
	leaveTitle,
}: {
	name: string;
	stay: string[];
	leave: string[];
	stayTitle?: string;
	leaveTitle?: string;
}) {
	return (
		<div className="grid gap-5 md:grid-cols-2">
			<div className="rounded-2xl bg-zinc-50 p-6 ring-1 ring-zinc-200/80 md:p-7">
				<h3 className="text-lg font-semibold tracking-[-0.02em] text-zinc-950">
					{stayTitle ?? `Stay With ${name} If`}
				</h3>
				<ul className="mt-5 space-y-3">
					{stay.map((item) => (
						<li key={item} className="flex items-start gap-2.5 text-pretty text-sm/6 text-zinc-600">
							<Check className="mt-1 size-4 shrink-0 text-zinc-400" aria-hidden="true" />
							{item}
						</li>
					))}
				</ul>
			</div>
			<div className="rounded-2xl bg-blue-50/60 p-6 ring-1 ring-blue-200 md:p-7">
				<h3 className="text-lg font-semibold tracking-[-0.02em] text-zinc-950">
					{leaveTitle ?? "Consider an Alternative If"}
				</h3>
				<ul className="mt-5 space-y-3">
					{leave.map((item) => (
						<li key={item} className="flex items-start gap-2.5 text-pretty text-sm/6 text-zinc-700">
							<CornerDownRight className="mt-1 size-4 shrink-0 text-blue-600" aria-hidden="true" />
							{item}
						</li>
					))}
				</ul>
			</div>
		</div>
	);
}

export function SwitchingSteps({ steps }: { steps: string[] }) {
	return (
		<ol className="relative max-w-3xl">
			{steps.map((step, i) => (
				<li key={step} className="relative flex gap-5 pb-8 last:pb-0">
					{i < steps.length - 1 ? (
						<span aria-hidden="true" className="absolute left-[17px] top-10 bottom-1 w-px bg-zinc-200" />
					) : null}
					<span className="relative grid size-9 shrink-0 place-items-center rounded-full bg-white text-sm font-medium text-blue-700 ring-1 ring-blue-200">
						{i + 1}
					</span>
					<p className="pt-1.5 text-pretty leading-relaxed text-zinc-600">{step}</p>
				</li>
			))}
		</ol>
	);
}
