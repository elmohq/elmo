import { ArrowRight, FilePlus2, Megaphone, RefreshCw } from "lucide-react";
import { DEMO_URL, DISPLAY, Shot } from "./ui";

interface Tone {
	pill: string;
	well: string;
	num: string;
}

const TONES = {
	blue: { pill: "bg-blue-600 text-white", well: "bg-blue-100", num: "text-blue-600" },
	amber: { pill: "bg-amber-300 text-zinc-950", well: "bg-amber-100", num: "text-amber-600" },
	emerald: { pill: "bg-emerald-400 text-zinc-950", well: "bg-emerald-100", num: "text-emerald-600" },
} satisfies Record<string, Tone>;

interface Feature {
	title: string;
	body: string;
	src: string;
	alt: string;
}

const CARD =
	"group relative flex flex-col overflow-hidden rounded-3xl bg-white ring-1 ring-zinc-950/[0.07] shadow-[0_1px_2px_rgb(9_9_11/0.04)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_24px_48px_-24px_rgb(9_9_11/0.3)]";

/**
 * The screenshot peeks out of a tinted well, cut off at the right and bottom.
 * In a big card the well stretches to the card's height, so the shot is
 * pinned to its top-left and clipped rather than leaving an empty gap.
 */
function Well({ tone, feature, big = false }: { tone: Tone; feature: Feature; big?: boolean }) {
	const frame =
		"overflow-hidden rounded-tl-xl shadow-[0_8px_30px_-8px_rgb(9_9_11/0.25)] ring-1 ring-zinc-950/10 transition-transform duration-300 group-hover:-translate-x-1 group-hover:-translate-y-1";
	if (big) {
		return (
			<div
				className={`relative mt-auto overflow-hidden pt-8 pl-8 lg:mt-0 lg:min-h-[30rem] lg:flex-1 lg:p-0 ${tone.well}`}
			>
				<div className={`${frame} lg:absolute lg:top-8 lg:right-0 lg:left-8`}>
					<Shot
						src={feature.src}
						alt={feature.alt}
						aspect="aspect-[16/10] lg:aspect-square"
						crop="sidebar"
						sizes="(min-width: 1024px) 720px, 100vw"
					/>
				</div>
			</div>
		);
	}
	return (
		<div className={`relative mt-auto overflow-hidden pt-6 pl-6 ${tone.well}`}>
			<div className={frame}>
				<Shot
					src={feature.src}
					alt={feature.alt}
					aspect="aspect-[16/10]"
					crop="zoom"
					sizes="(min-width: 1024px) 640px, 100vw"
				/>
			</div>
		</div>
	);
}

function FeatureCard({ tone, feature, big = false }: { tone: Tone; feature: Feature; big?: boolean }) {
	return (
		<article className={`${CARD} ${big ? "lg:col-span-2 lg:row-span-2" : ""}`}>
			<div className={big ? "p-7 md:p-9" : "p-6 md:p-7"}>
				<h4
					className={`font-bold tracking-tight text-balance text-zinc-950 ${big ? "text-2xl md:text-[1.75rem] md:leading-tight" : "text-lg md:text-xl"}`}
				>
					{feature.title}
				</h4>
				<p className={`mt-2.5 text-pretty text-zinc-600 ${big ? "max-w-[46ch] text-base md:text-lg" : "text-[15px]"}`}>
					{feature.body}
				</p>
			</div>
			<Well tone={tone} feature={feature} big={big} />
		</article>
	);
}

function ThemeHeader({
	tone,
	num,
	name,
	title,
	body,
}: {
	tone: Tone;
	num: string;
	name: string;
	title: string;
	body: string;
}) {
	return (
		<div className="mb-8 grid gap-4 md:mb-10 md:grid-cols-[1fr_1fr] md:items-end md:gap-12">
			<div>
				<span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-bold ${tone.pill}`}>
					<span className="tabular-nums opacity-70">{num}</span>
					{name}
				</span>
				<h3 className={`${DISPLAY} mt-4 text-3xl leading-[1.05] text-zinc-950 md:text-[2.75rem]`}>{title}</h3>
			</div>
			<p className="max-w-[44ch] text-pretty text-lg text-zinc-600 md:justify-self-end">{body}</p>
		</div>
	);
}

const MEASURE: Feature[] = [
	{
		title: "Visibility across every prompt and model.",
		body: "Filter by model, time range, and tag. Every prompt gets a visibility score and a trend line against your competitors, so you can watch it move for months and spot what changed it.",
		src: "/screenshots/visibility.png",
		alt: "Visibility page listing prompts with visibility scores and trend charts comparing Nike, Adidas, Asics, and New Balance",
	},
	{
		title: "Share of voice.",
		body: "A live leaderboard of which brands AI names most — and where you're missing.",
		src: "/screenshots/share-of-voice.png",
		alt: "Share of voice page with a donut chart and a leaderboard of brands ranked by AI mentions",
	},
	{
		title: "Organized prompts.",
		body: "Full-text search and tags find any prompt instantly, each with its own score.",
		src: "/screenshots/prompts.png",
		alt: "Prompt list filtered by tags with per-prompt visibility charts",
	},
];

const UNDERSTAND: Feature[] = [
	{
		title: "Read every single AI response.",
		body: "Drill into any prompt to see exactly what each model said, which brands it mentioned, and which sources it cited.",
		src: "/screenshots/prompt-detail.png",
		alt: "Prompt detail page showing a Google AI Mode response, the brands it mentioned, and its cited sources",
	},
	{
		title: "Query fan-out.",
		body: "The web searches AI engines run behind each answer — and how they rewrite your prompts.",
		src: "/screenshots/query-fan-out.png",
		alt: "Query fan-out page with search counts, a word cloud of generated queries, and word-change bars",
	},
	{
		title: "Citations.",
		body: "The domains and URLs models cite most, new and dropped sources, broken down by category.",
		src: "/screenshots/citations.png",
		alt: "Citations page with citation share, unique domains, and stacked area charts of citation categories",
	},
];

const ACTIONS = [
	{ icon: FilePlus2, label: "Content to create" },
	{ icon: RefreshCw, label: "Pages to refresh" },
	{ icon: Megaphone, label: "Sources to pitch" },
];

export function FeaturesB() {
	return (
		<section id="features" aria-labelledby="hb-features" className="py-24 lg:py-32">
			<div className="mx-auto max-w-6xl px-5 md:px-8">
				<div className="max-w-3xl">
					<p className="text-sm font-bold uppercase tracking-[0.14em] text-blue-600">Features</p>
					<h2 id="hb-features" className={`${DISPLAY} mt-4 text-5xl leading-[1] text-zinc-950 md:text-7xl`}>
						Measure it. Understand it. <span className="text-blue-600">Fix it.</span>
					</h2>
					<p className="mt-6 max-w-[40rem] text-pretty text-lg text-zinc-600 md:text-xl">
						Everything you need to grow AI visibility, from the first score on your dashboard to the next page you
						should publish.
					</p>
				</div>

				<div className="mt-20 space-y-24 lg:mt-24 lg:space-y-28">
					<div>
						<ThemeHeader
							tone={TONES.blue}
							num="01"
							name="Measure"
							title="Know where you stand."
							body="Visibility, share of voice, and 30-day trends in one dashboard — per prompt, per model, per competitor."
						/>
						<div className="grid gap-5 lg:grid-cols-3 lg:grid-rows-2">
							<FeatureCard tone={TONES.blue} feature={MEASURE[0]} big />
							<FeatureCard tone={TONES.blue} feature={MEASURE[1]} />
							<FeatureCard tone={TONES.blue} feature={MEASURE[2]} />
						</div>
					</div>

					<div>
						<ThemeHeader
							tone={TONES.amber}
							num="02"
							name="Understand"
							title="See why AI says what it says."
							body="Open up the answers, the searches behind them, and the sources they lean on."
						/>
						<div className="grid gap-5 lg:grid-cols-3 lg:grid-rows-2">
							<FeatureCard tone={TONES.amber} feature={UNDERSTAND[1]} />
							<FeatureCard tone={TONES.amber} feature={UNDERSTAND[0]} big />
							<FeatureCard tone={TONES.amber} feature={UNDERSTAND[2]} />
						</div>
					</div>

					<div>
						<ThemeHeader
							tone={TONES.emerald}
							num="03"
							name="Act"
							title="Know exactly what to do next."
							body="Turn tracking data into a to-do list instead of another report nobody reads."
						/>
						<article className={`${CARD} lg:grid lg:grid-cols-[2fr_3fr]`}>
							<div className="flex flex-col p-7 md:p-9">
								<h4 className="text-2xl font-bold tracking-tight text-balance text-zinc-950 md:text-[1.75rem] md:leading-tight">
									Opportunities, ranked by impact.
								</h4>
								<p className="mt-2.5 text-pretty text-base text-zinc-600 md:text-lg">
									AI-generated recommendations built from your tracked answers: what to publish, what to update, and
									which third-party sources to get in front of.
								</p>
								<ul className="mt-6 flex flex-wrap gap-2">
									{ACTIONS.map(({ icon: Icon, label }) => (
										<li
											key={label}
											className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900 ring-1 ring-emerald-200"
										>
											<Icon className="size-4 text-emerald-600" aria-hidden="true" />
											{label}
										</li>
									))}
								</ul>
								<a
									href={DEMO_URL}
									target="_blank"
									rel="noopener noreferrer"
									className="group/demo mt-8 inline-flex w-fit items-center gap-1.5 rounded-md text-[15px] font-semibold text-zinc-950 underline decoration-emerald-400 decoration-2 underline-offset-4 lg:mt-auto"
								>
									Explore it in the live demo
									<ArrowRight
										className="size-4 transition-transform group-hover/demo:translate-x-0.5"
										aria-hidden="true"
									/>
								</a>
							</div>
							<Well
								tone={TONES.emerald}
								big
								feature={{
									title: "",
									body: "",
									src: "/screenshots/opportunities.png",
									alt: "Opportunities page with a summary of visibility gaps and recommended content to create and refresh",
								}}
							/>
						</article>
					</div>
				</div>
			</div>
		</section>
	);
}
