import { Eye, Lightbulb, Link2, type LucideIcon, PieChart } from "lucide-react";
import { VisibilityTrendGraphic } from "@/components/feature-graphics";
import { Eyebrow, SectionHeading } from "./ui";

// These four are demonstrated in the hero tour, so here they only get a line each.
const TOURED: { icon: LucideIcon; name: string; description: string }[] = [
	{
		icon: Eye,
		name: "Visibility",
		description:
			"Per-prompt visibility scores, filtered by model, time range, and tags, with trend lines against competitors.",
	},
	{
		icon: PieChart,
		name: "Share of voice",
		description: "A live leaderboard of which brands AI engines name most, and where you're missing.",
	},
	{
		icon: Link2,
		name: "Citations",
		description: "The domains and URLs AI cites most, new and dropped sources, and a breakdown by category.",
	},
	{
		icon: Lightbulb,
		name: "Opportunities",
		description:
			"AI-generated recommendations ranked by impact: content to create, pages to refresh, sources to pitch.",
	},
];

/** Which part of a 5:3 app screenshot to show, in percentages of the source image. */
interface Crop {
	x: number;
	y: number;
	width: number;
	aspect: string;
}

function Screenshot({ src, alt, crop }: { src: string; alt: string; crop: Crop }) {
	const scale = 100 / crop.width;
	return (
		<div className="overflow-hidden rounded-tl-xl bg-white shadow-[0_0_0_1px_rgb(24_24_27/0.08),0_16px_40px_-16px_rgb(37_99_235/0.3)]">
			<div className={`overflow-hidden ${crop.aspect}`}>
				<img
					src={src}
					alt={alt}
					width={3000}
					height={1800}
					loading="lazy"
					decoding="async"
					className="block max-w-none"
					style={{
						width: `${scale * 100}%`,
						marginLeft: `${-crop.x * scale}%`,
						// Vertical margins resolve against the container width, so convert via the 5:3 ratio.
						marginTop: `${-crop.y * 0.6 * scale}%`,
					}}
				/>
			</div>
		</div>
	);
}

function FeatureCard({
	title,
	description,
	label,
	className = "",
	compactOnMobile = false,
	children,
}: {
	title: string;
	description: string;
	label: string;
	className?: string;
	/** Drop the visual on small phones, where a full app screenshot is too small to read. */
	compactOnMobile?: boolean;
	children: React.ReactNode;
}) {
	return (
		<article
			className={`flex flex-col overflow-hidden rounded-2xl bg-gradient-to-b from-zinc-50 to-white ring-1 ring-zinc-200/80 ${className}`}
		>
			<div className={`p-6 md:p-8 ${compactOnMobile ? "max-sm:pb-6" : "pb-7"}`}>
				<p className="font-mono text-[10px] uppercase tracking-[0.2em] text-blue-600">{label}</p>
				<h3 className="mt-3 text-lg font-semibold leading-snug tracking-[-0.01em] text-zinc-950 md:text-xl">{title}</h3>
				<p className="mt-2 max-w-[46ch] text-pretty text-sm/6 text-zinc-600 md:text-[15px]/7">{description}</p>
			</div>
			<div className={`mt-auto pl-6 md:pl-8 ${compactOnMobile ? "max-sm:hidden" : ""}`}>{children}</div>
		</article>
	);
}

export function Features() {
	return (
		<section id="features" className="bg-white">
			<div className="mx-auto max-w-6xl px-4 py-20 md:px-6 lg:py-28">
				<SectionHeading
					eyebrow="Features"
					title="Go deeper than the headline number."
					lede="The tour above answers the four questions most teams start with. Underneath is everything you need to explain the numbers and watch them move."
				/>

				<div className="mt-12 grid gap-4 lg:mt-16 lg:grid-cols-12">
					<FeatureCard
						className="lg:col-span-7"
						label="Query fan-out"
						title="See the searches behind every AI answer."
						description="AI engines fan a single prompt out into dozens of web searches. Track the exact queries and keywords they generate, and how they rewrite your prompts along the way."
					>
						<Screenshot
							src="/screenshots/query-fan-out.png"
							crop={{ x: 17, y: 9, width: 83, aspect: "aspect-[16/9]" }}
							alt="Elmo query fan-out page listing the web searches AI engines ran for a prompt"
						/>
					</FeatureCard>
					<FeatureCard
						className="lg:col-span-5"
						compactOnMobile
						label="Response deep dive"
						title="Inspect every individual AI response."
						description="Drill into any prompt to see exactly what each model said, which brands it mentioned, and what sources it cited."
					>
						<Screenshot
							src="/screenshots/prompt-detail.png"
							crop={{ x: 17, y: 9, width: 60, aspect: "aspect-[4/3]" }}
							alt="Elmo prompt detail page showing an individual AI response with mentioned brands and cited sources"
						/>
					</FeatureCard>
					<FeatureCard
						className="lg:col-span-4"
						compactOnMobile
						label="Dashboard"
						title="Your AI visibility command center."
						description="Current visibility, share of voice, and 30-day trends on one screen."
					>
						<Screenshot
							src="/screenshots/overview.png"
							crop={{ x: 18, y: 25, width: 55, aspect: "aspect-[16/10]" }}
							alt="Elmo dashboard overview showing AI visibility and share of voice scores with 30-day trend charts"
						/>
					</FeatureCard>
					<FeatureCard
						className="lg:col-span-4"
						label="Trends"
						title="Track visibility over months."
						description="Watch your AI visibility change against competitors and spot the impact of content changes and market shifts."
					>
						<div className="overflow-hidden rounded-tl-xl bg-white shadow-[0_0_0_1px_rgb(24_24_27/0.08),0_16px_40px_-16px_rgb(37_99_235/0.3)] [&>div]:rounded-none [&>div]:border-0">
							<VisibilityTrendGraphic />
						</div>
					</FeatureCard>
					<FeatureCard
						className="lg:col-span-4"
						compactOnMobile
						label="Prompt library"
						title="Search, tag, and organize prompts."
						description="Full-text search finds any prompt instantly. Tag prompts to filter and track visibility per prompt."
					>
						<Screenshot
							src="/screenshots/prompts.png"
							crop={{ x: 17, y: 9, width: 60, aspect: "aspect-[16/10]" }}
							alt="Elmo prompts page with full-text search, tags, and per-prompt visibility scores"
						/>
					</FeatureCard>
				</div>

				<div className="mt-14 border-t border-zinc-200 pt-10 lg:mt-16">
					<Eyebrow>Also in the tour above</Eyebrow>
					<ul className="mt-6 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
						{TOURED.map((f) => {
							const Icon = f.icon;
							return (
								<li key={f.name}>
									<a
										href="#product-tour"
										className="group inline-flex items-center gap-2 rounded-sm text-[15px] font-semibold text-zinc-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
									>
										<Icon className="size-4 text-blue-600" aria-hidden="true" />
										<span className="underline decoration-transparent underline-offset-4 transition-colors group-hover:decoration-zinc-300">
											{f.name}
										</span>
									</a>
									<p className="mt-2 text-pretty text-sm/6 text-zinc-600">{f.description}</p>
								</li>
							);
						})}
					</ul>
				</div>
			</div>
		</section>
	);
}
