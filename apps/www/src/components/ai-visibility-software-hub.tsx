import { Link } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { ArrowRight } from "lucide-react";

const LINK = "font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900";

function Eyebrow({ num, label }: { num: string; label: string }) {
	return (
		<p className="font-mono text-[11px] uppercase tracking-[0.18em] text-blue-600 tabular-nums">
			{num} <span className="text-zinc-500">— {label}</span>
		</p>
	);
}

const FEATURES = [
	{
		title: "Cross-platform tracking",
		body: "Monitors your brand across the engines that matter — ChatGPT, Perplexity, Gemini, Copilot, and Google AI Overviews — not just one.",
	},
	{
		title: "Mention & citation analysis",
		body: "Separates being named in an answer from being cited with a link, so you can see which content actually earns traffic.",
	},
	{
		title: "Prompt monitoring",
		body: "Runs a defined set of prompts on a schedule, because a single check is a snapshot and AI answers shift over time.",
	},
	{
		title: "Competitor benchmarking",
		body: "Shows your share of voice against named rivals on the same prompts — the most actionable metric in AI visibility.",
	},
	{
		title: "Sentiment & accuracy",
		body: "Flags when an engine describes your brand incorrectly, so you can correct the record before buyers see it.",
	},
	{
		title: "Recommendations",
		body: "Surfaces the prompts and topics where you're missing, turning a vague worry into a concrete content to-do list.",
	},
];

export function AiVisibilitySoftwareHub() {
	return (
		<>
			{/* Hero */}
			<section className="relative overflow-hidden border-b border-zinc-200 bg-white py-16 lg:py-24">
				<div
					aria-hidden="true"
					className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,rgb(0_0_0/0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgb(0_0_0/0.04)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]"
				/>
				<div className="relative mx-auto max-w-6xl px-4 md:px-6">
					<div className="max-w-3xl">
						<p className="mb-4 font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">
							/ AI VISIBILITY SOFTWARE
						</p>
						<h1 className="font-heading text-4xl text-balance text-zinc-950 md:text-5xl lg:text-6xl">
							AI Visibility Software
						</h1>
						<p className="mt-6 max-w-2xl text-lg text-balance text-zinc-600 md:text-xl">
							AI visibility software tracks how your brand appears in AI search — how often it is mentioned, cited, and
							accurately described across ChatGPT, Perplexity, Gemini, and Google AI Overviews. It turns an invisible
							new channel into something you can measure and improve.
						</p>
						<div className="mt-8 flex flex-wrap gap-3">
							<Button asChild size="sm">
								<a href="/blog/best-ai-visibility-tools">
									Compare the best tools
									<ArrowRight className="size-3.5" />
								</a>
							</Button>
							<Button asChild variant="outline" size="sm">
								<Link to="/docs">Get started with Elmo</Link>
							</Button>
						</div>
					</div>
				</div>
			</section>

			{/* What it does */}
			<section className="border-b border-zinc-200 bg-white py-12 lg:py-20">
				<div className="mx-auto max-w-6xl px-4 md:px-6">
					<div className="max-w-3xl">
						<Eyebrow num="01" label="WHAT IT DOES" />
						<h2 className="font-heading mt-3 text-3xl text-zinc-950 md:text-4xl">What AI visibility software does</h2>
						<div className="mt-8 space-y-6 text-[1.0625rem] leading-relaxed text-zinc-600">
							<p>
								AI visibility software answers a question traditional analytics can't: when someone asks an AI engine
								about your category, does it mention you — and is it right? Instead of tracking rankings on a results
								page, it samples the answers themselves.
							</p>
							<p>
								In practice, that means running a defined set of prompts across multiple AI engines on a schedule and
								recording what comes back: whether your brand is mentioned, whether it's{" "}
								<a className={LINK} href="/blog/ai-citations">
									cited with a link
								</a>
								, how it's described, and how often competitors appear instead. Good tools roll those signals into a
								share-of-voice metric and point you to the gaps worth closing.
							</p>
						</div>
					</div>
				</div>
			</section>

			{/* Why it matters */}
			<section className="border-b border-zinc-200 bg-zinc-50 py-12 lg:py-20">
				<div className="mx-auto max-w-6xl px-4 md:px-6">
					<div className="max-w-3xl">
						<Eyebrow num="02" label="WHY NOW" />
						<h2 className="font-heading mt-3 text-3xl text-zinc-950 md:text-4xl">Why AI visibility matters now</h2>
						<div className="mt-8 space-y-6 text-[1.0625rem] leading-relaxed text-zinc-600">
							<p>
								Search is shifting from a list of blue links to a synthesized answer. Google now shows{" "}
								<a className={LINK} href="/blog/google-ai-overviews">
									AI Overviews
								</a>{" "}
								above the results for many queries, and tools like Perplexity and ChatGPT Search resolve questions
								without a results page at all. For a growing share of searches, buyers read an answer and never click.
							</p>
							<p>
								That changes the unit of visibility. There's often no ranking to hold — there's one answer, and your
								brand is either named in it or it isn't. Being cited becomes the win. This is the premise of{" "}
								<a className={LINK} href="/blog/answer-engine-optimization">
									answer engine optimization
								</a>
								, and AI visibility software is how you measure whether it's working.
							</p>
						</div>
					</div>
				</div>
			</section>

			{/* Key features */}
			<section className="border-b border-zinc-200 bg-white py-12 lg:py-20">
				<div className="mx-auto max-w-6xl px-4 md:px-6">
					<div className="max-w-3xl">
						<Eyebrow num="03" label="WHAT TO LOOK FOR" />
						<h2 className="font-heading mt-3 text-3xl text-zinc-950 md:text-4xl">Key features to look for</h2>
						<p className="mt-6 text-[1.0625rem] leading-relaxed text-zinc-600">
							The category is young and tools vary widely. These are the capabilities that separate a genuine AI
							visibility platform from a basic prompt checker.
						</p>
					</div>
					<div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
						{FEATURES.map((feature) => (
							<div key={feature.title} className="rounded-md border border-zinc-200 bg-white p-5">
								<h3 className="font-semibold text-zinc-950">{feature.title}</h3>
								<p className="mt-2 text-sm leading-relaxed text-zinc-600">{feature.body}</p>
							</div>
						))}
					</div>
				</div>
			</section>

			{/* Elmo's approach */}
			<section className="border-b border-zinc-200 bg-zinc-50 py-12 lg:py-20">
				<div className="mx-auto max-w-6xl px-4 md:px-6">
					<div className="max-w-3xl">
						<Eyebrow num="04" label="ELMO'S APPROACH" />
						<h2 className="font-heading mt-3 text-3xl text-zinc-950 md:text-4xl">Elmo's approach</h2>
						<div className="mt-8 space-y-6 text-[1.0625rem] leading-relaxed text-zinc-600">
							<p>
								Elmo is open-source AI visibility software you can self-host. It tracks mentions, citations, and
								competitor share across ChatGPT, Claude, Gemini, Grok, Perplexity, Copilot, and Google AI Mode and AI
								Overviews — and because it's released under the MIT license, you can read exactly how every metric is
								collected and computed.
							</p>
							<p>
								That matters in a market full of opaque scoring and inflated pricing. With Elmo you own your data and
								avoid vendor lock-in: the self-hosted core is free, with a managed cloud option on the way. To see how
								it compares with the rest of the field, read our roundup of the{" "}
								<a className={LINK} href="/blog/best-ai-visibility-tools">
									best AI visibility tools
								</a>{" "}
								or learn{" "}
								<a className={LINK} href="/blog/track-brand-ai-search">
									how to track your brand in AI search
								</a>
								.
							</p>
						</div>
						<div className="mt-8 flex flex-wrap gap-3">
							<Button asChild size="sm">
								<Link to="/docs">
									Read the docs
									<ArrowRight className="size-3.5" />
								</Link>
							</Button>
							<Button asChild variant="outline" size="sm">
								<a href="https://github.com/elmohq/elmo" target="_blank" rel="noopener noreferrer">
									Star on GitHub
								</a>
							</Button>
						</div>
					</div>
				</div>
			</section>

			{/* Directory lead-in */}
			<section className="border-b border-zinc-200 bg-zinc-50 pt-12 lg:pt-20">
				<div className="mx-auto max-w-6xl px-4 md:px-6">
					<div className="max-w-3xl">
						<Eyebrow num="05" label="COMPARE" />
						<h2 className="font-heading mt-3 text-3xl text-zinc-950 md:text-4xl">Compare every AI visibility tool</h2>
						<p className="mt-6 text-[1.0625rem] leading-relaxed text-zinc-600">
							Browse the full directory of AI visibility and answer engine optimization tools below, with a
							feature-by-feature matrix and head-to-head comparisons against Elmo.
						</p>
					</div>
				</div>
			</section>
		</>
	);
}
