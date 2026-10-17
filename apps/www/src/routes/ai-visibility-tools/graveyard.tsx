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

const counts = graveyardTools.reduce(
	(acc, c) => {
		const fate = graveyardFate(c);
		if (fate) acc[fate] += 1;
		return acc;
	},
	{ "shut-down": 0, pivoted: 0, acquired: 0 } as Record<GraveyardFate, number>,
);

const lead = `The AI visibility market is young and crowded, and not every tool makes it. ${counts["shut-down"]} AI visibility tools we know of have shut down, ${counts.pivoted} have pivoted to something else, and ${counts.acquired} have been bought. When a tracker goes, its prompt history and baselines usually go with it. Here is who is gone, and how to make sure it doesn't happen to you.`;

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

function Tombstone({ competitor }: { competitor: Competitor }) {
	const fate = graveyardFate(competitor);
	if (!fate || !competitor.fate) return null;
	return (
		<li className="flex flex-col rounded-t-[999px] border border-zinc-300 bg-gradient-to-b from-zinc-100 to-zinc-50 px-5 pt-10 pb-5 shadow-[inset_0_-6px_0_0_rgba(0,0,0,0.04)]">
			<p className="text-center font-mono text-[11px] uppercase tracking-[0.3em] text-zinc-400">
				{fate === "acquired" ? "Absorbed" : "RIP"}
			</p>
			<h3 className="font-heading mt-2 text-center text-2xl text-zinc-900">{competitor.name}</h3>
			<p className="mt-1 text-center text-xs text-zinc-500">
				{FATE_LABEL[fate]} · {formatFateDate(competitor.fate.date)}
			</p>
			<TombstoneDivider />
			{competitor.noScreenshot ? (
				<div className="flex aspect-[16/10] items-center justify-center rounded-md border border-dashed border-zinc-300 text-xs text-zinc-400">
					No snapshot survived
				</div>
			) : (
				<div className="overflow-hidden rounded-md border border-zinc-300">
					<img
						src={getScreenshotUrl(competitor.slug)}
						alt={`${competitor.name}'s homepage while it was live`}
						width={1280}
						height={800}
						className="aspect-[16/10] w-full object-cover object-top grayscale"
						loading="lazy"
					/>
				</div>
			)}
			<TombstoneDivider />
			<p className="text-sm text-zinc-600">{competitor.tagline}</p>
			<TombstoneDivider />
			<p className="flex-1 text-sm text-zinc-800">{competitor.fate.summary}</p>
			<TombstoneDivider />
			<div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs">
				{hasComparisonPage(competitor) && (
					<Link
						to="/ai-visibility-tools/$slug"
						params={{ slug: getComparisonSlug(competitor) }}
						className="text-zinc-950 underline decoration-zinc-400 underline-offset-4 hover:decoration-zinc-950"
					>
						Elmo vs {competitor.name}
					</Link>
				)}
				{competitor.fate.source && (
					<a
						href={competitor.fate.source}
						target="_blank"
						rel="noopener noreferrer nofollow"
						className="text-zinc-950 underline decoration-zinc-400 underline-offset-4 hover:decoration-zinc-950"
					>
						Source
					</a>
				)}
			</div>
		</li>
	);
}

function TombstoneDivider() {
	return <hr className="my-4 border-zinc-300" />;
}

function GraveyardPage() {
	return (
		<div className="min-h-screen">
			<Navbar />
			<main>
				<DirectoryBackLink />
				<DirectoryHero title="The AEO Graveyard" lead={lead} />
				<DirectorySection title="Here lie">
					<ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
						{graveyardTools.map((c) => (
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
				<DirectorySection title="Open source is the safety net">
					<div className="max-w-3xl space-y-4 text-zinc-600">
						<p>
							A hosted tracker is a bet on the company behind it. If it runs out of money, gets acquired, or decides AI
							visibility isn't its business anymore, your history goes with it, usually with a few weeks' notice.
						</p>
						<p>
							Open-source software changes the odds. When Genwolf's hosted app went offline, its MIT-licensed core was
							still on GitHub. When Notra took its repository private, every copy already released under the AGPL stayed
							usable. The code outlives the company, and a self-hosted install keeps your data in your own database.
						</p>
						<p>
							Elmo is MIT-licensed, so you can self-host it, modify it, and keep running it no matter what happens to
							us. Browse the{" "}
							<Link to="/ai-visibility-tools/category/open-source" className="text-blue-700 hover:underline">
								open-source AI visibility tools
							</Link>{" "}
							to compare the options.
						</p>
					</div>
				</DirectorySection>
				<Faq items={FAQS} />
				<ElmoCta />
			</main>
			<Footer />
		</div>
	);
}
