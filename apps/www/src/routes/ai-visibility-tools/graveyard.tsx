import { createFileRoute, Link } from "@tanstack/react-router";
import { DirectoryBackLink, DirectoryHero, DirectorySection, ElmoCta } from "@/components/directory-shell";
import { Faq } from "@/components/faq";
import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";
import {
	type Competitor,
	formatFateDate,
	type GraveyardFate,
	getComparisonSlug,
	getScreenshotUrl,
	graveyardFate,
	graveyardTools,
	hasComparisonPage,
} from "@/lib/competitors";
import type { FaqItem } from "@/lib/faqs";
import { breadcrumbJsonLd, canonicalUrl, faqJsonLd, itemListJsonLd, ogMeta } from "@/lib/seo";

const title = "The AEO Graveyard: AI Visibility Tools That Shut Down · Elmo";
const description =
	"AI visibility and AEO tools that shut down, pivoted, or were acquired, with what happened to each and what to do if your tracker disappears.";
const path = "/ai-visibility-tools/graveyard";

// A rounded count reads as prose; the exact number changes every time we add a tool.
const roundedCount = (() => {
	const n = graveyardTools.length;
	const rounded = Math.round(n / 10) * 10;
	if (rounded > n) return `Nearly ${rounded}`;
	if (rounded < n) return `More than ${rounded}`;
	return `${n}`;
})();

const lead = `${roundedCount} AI visibility tools have disappeared in the last two years. Most shut down, and the rest pivoted to something else or were bought and folded into another product. When a tracker disappears, its customers have to adjust to a new system or start from scratch.`;

const FATE_LABEL: Record<GraveyardFate, string> = {
	"shut-down": "Shut down",
	pivoted: "Pivoted",
	acquired: "Acquired",
};

const STEPS: { title: string; body: string }[] = [
	{
		title: "Export everything while you still can",
		body: "Shutdown notices often give a few weeks. Pull your prompts, competitor list, and as much history as the tool will export: CSV, API, or screenshots of the charts if that's all there is.",
	},
	{
		title: "Write down how your numbers were made",
		body: "Note which engines you tracked, how often, and in which countries. Visibility scores are not portable between tools, so you need this to explain the jump when you switch.",
	},
	{
		title: "Re-baseline instead of stitching",
		body: "Start the new tool on the same prompts and treat its first few weeks as a fresh baseline. Grafting one vendor's numbers onto another's makes the trend line meaningless.",
	},
	{
		title: "Pick a tool that can't disappear",
		body: "Check whether the code is open source and under which license, whether you can self-host it, and whether your data leaves through an API. A permissive license means the software outlives the company.",
	},
	{
		title: "Move your prompts over",
		body: "In Elmo you can paste a list of prompts in one go, add your competitors, and pick the engines to track. The first runs land within minutes.",
	},
];

const FAQS: FaqItem[] = [
	{
		question: "What happens to my data when an AI visibility tool shuts down?",
		answer:
			"Usually it goes with the tool. Hosted trackers keep your prompts, answers, and history on their servers, so once the service is switched off there is nothing left to export. That's why it pays to export regularly, or to use a tool you can self-host so the data lives in your own database from day one.",
	},
	{
		question: "How does open source protect me if a tool shuts down?",
		answer:
			"With a permissive open-source license like MIT, the code stays available and usable whatever happens to the company behind it. You can keep running your own copy, fix it, or fork it, and because a self-hosted install stores data in your own database, your history doesn't depend on anyone else's servers. Copyleft licenses like AGPL and source-available licenses like FSL still protect you from a shutdown, but they add conditions on how you can modify or offer the software.",
	},
	{
		question: "Can an open-source tool go closed source?",
		answer:
			"Yes. A company can stop publishing new code, as Notra did in October 2026 when it took its AGPL repository private. What it can't do is take back code already released under an open-source license: anyone who has a copy can keep using and forking that version. That's another reason to prefer a permissive license and an active community over a single vendor's goodwill.",
	},
	{
		question: "My AI visibility tool was acquired. Should I switch?",
		answer:
			"Not necessarily, but watch the roadmap. Acquired tools are often folded into the buyer's product, repriced, or put on a waitlist, as happened when Hall joined Tracksuit. Export your data now so you have the option, and re-evaluate when the new owner announces its plans.",
	},
	{
		question: "Is Elmo going to shut down?",
		answer:
			"Elmo is MIT-licensed and bootstrapped, and everything it does is on GitHub. Even in the worst case, you could keep running your own copy indefinitely, with your data in your own PostgreSQL database.",
	},
];

export const Route = createFileRoute("/ai-visibility-tools/graveyard")({
	head: () => ({
		meta: [{ title }, { name: "description", content: description }, ...ogMeta({ title, description, path })],
		links: [{ rel: "canonical", href: canonicalUrl(path) }],
		scripts: [
			breadcrumbJsonLd([
				{ name: "Home", path: "/" },
				{ name: "AI Visibility Tool Directory", path: "/ai-visibility-tools" },
				{ name: "AEO Graveyard", path },
			]),
			itemListJsonLd(
				graveyardTools.map((c) => ({
					name: c.name,
					path: hasComparisonPage(c) ? `/ai-visibility-tools/${getComparisonSlug(c)}` : undefined,
					description: c.fate?.summary,
				})),
			),
			faqJsonLd(FAQS),
		],
	}),
	component: GraveyardPage,
});

// Fine grain so the stone doesn't read as a flat gradient.
const STONE_GRAIN =
	"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.18 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

const stoneStyle = {
	backgroundImage: `${STONE_GRAIN}, radial-gradient(ellipse at 30% 0%, #f5f5f4 0%, #d6d3d1 45%, #a8a29e 100%)`,
	boxShadow:
		"inset 0 2px 0 rgba(255,255,255,0.6), inset 0 -18px 30px rgba(68,64,60,0.18), 0 1px 0 #78716c, 0 14px 24px -12px rgba(41,37,36,0.45)",
};

// Light from above: a dark edge on top and a light one below reads as cut into the stone.
const ENGRAVED = "[text-shadow:0_1px_0_rgba(255,255,255,0.55),0_-1px_0_rgba(41,37,36,0.25)]";

function Tombstone({ competitor }: { competitor: Competitor }) {
	const fate = graveyardFate(competitor);
	if (!fate || !competitor.fate) return null;
	return (
		<li
			className="flex flex-col rounded-t-[999px] rounded-b-sm border border-stone-400/70 px-6 pt-12 pb-6"
			style={stoneStyle}
		>
			<p className={`text-center font-mono text-[11px] uppercase tracking-[0.35em] text-stone-500 ${ENGRAVED}`}>
				{fate === "acquired" ? "Absorbed" : "R.I.P."}
			</p>
			<h3 className={`font-heading mt-2 text-center text-3xl text-stone-700 ${ENGRAVED}`}>{competitor.name}</h3>
			<p className={`mt-1 text-center text-xs text-stone-600 ${ENGRAVED}`}>
				{FATE_LABEL[fate]} · {formatFateDate(competitor.fate.date)}
			</p>
			<TombstoneDivider />
			{!competitor.noScreenshot && (
				<>
					<div className="overflow-hidden rounded-sm shadow-[inset_0_2px_6px_rgba(41,37,36,0.45),0_1px_0_rgba(255,255,255,0.5)]">
						<img
							src={getScreenshotUrl(competitor.slug)}
							alt={`${competitor.name}'s homepage while it was live`}
							width={1280}
							height={800}
							className={`aspect-[16/10] w-full object-cover object-top opacity-60 mix-blend-multiply contrast-125 grayscale ${competitor.darkScreenshot ? "invert" : ""}`}
							loading="lazy"
						/>
					</div>
					<TombstoneDivider />
				</>
			)}
			<p className={`text-sm text-stone-600 ${ENGRAVED}`}>{competitor.tagline}</p>
			<TombstoneDivider />
			<p className={`flex-1 text-sm text-stone-800 ${ENGRAVED}`}>{competitor.fate.summary}</p>
			<TombstoneDivider />
			<div className={`flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs ${ENGRAVED}`}>
				{hasComparisonPage(competitor) && (
					<Link
						to="/ai-visibility-tools/$slug"
						params={{ slug: getComparisonSlug(competitor) }}
						className="text-stone-900 underline decoration-stone-500 underline-offset-4 hover:decoration-stone-900"
					>
						Elmo vs {competitor.name}
					</Link>
				)}
				{competitor.fate.source && (
					<a
						href={competitor.fate.source}
						target="_blank"
						rel="noopener noreferrer nofollow"
						className="text-stone-900 underline decoration-stone-500 underline-offset-4 hover:decoration-stone-900"
					>
						Source
					</a>
				)}
			</div>
		</li>
	);
}

function TombstoneDivider() {
	return <hr className="my-4 border-t border-b border-t-stone-500/40 border-b-white/50" />;
}

function GraveyardPage() {
	return (
		<div className="min-h-screen">
			<Navbar />
			<main>
				<DirectoryBackLink />
				<DirectoryHero title="The AEO Graveyard" lead={lead}>
					<div className="max-w-3xl border-l-2 border-blue-600 pl-4 text-sm text-zinc-600">
						<p className="font-medium text-zinc-950">Open source is the safety net</p>
						<p className="mt-1">
							When a hosted tracker goes under, your history goes with it. Elmo is open source, so you can always keep
							running it yourself.{" "}
							<Link
								to="/"
								className="text-zinc-950 underline decoration-zinc-400 underline-offset-4 hover:decoration-zinc-950"
							>
								Learn more about Elmo →
							</Link>
						</p>
					</div>
				</DirectoryHero>
				<DirectorySection>
					<ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
						{graveyardTools
							.filter((c) => !c.noScreenshot)
							.map((c) => (
								<Tombstone key={c.slug} competitor={c} />
							))}
					</ul>
					<ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
						{graveyardTools
							.filter((c) => c.noScreenshot)
							.map((c) => (
								<Tombstone key={c.slug} competitor={c} />
							))}
					</ul>
					<p className="mt-6 text-xs text-zinc-500">
						Screenshots were taken while each tool was live. Dates are when the shutdown, pivot, or acquisition was
						announced, or the month we found the site offline.
					</p>
				</DirectorySection>
				<DirectorySection title="Your AI visibility tool shut down. Now what?">
					<ol className="grid gap-6 md:grid-cols-2">
						{STEPS.map((step, i) => (
							<li key={step.title} className="rounded-md border border-zinc-200 bg-white p-5">
								<p className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">Step {i + 1}</p>
								<h3 className="mt-1 font-semibold text-zinc-950">{step.title}</h3>
								<p className="mt-2 text-sm text-zinc-600">{step.body}</p>
							</li>
						))}
					</ol>
				</DirectorySection>
				<Faq items={FAQS} />
				<ElmoCta />
			</main>
			<Footer />
		</div>
	);
}
