import { Check, Minus } from "lucide-react";
import { delay } from "./styles";
import { CARD, ExampleTag, SectionHeading } from "./ui";

const BRAND = "Loftwell";

interface Source {
	domain: string;
	kind: string;
	/** Share of answers in the category that cite this domain. */
	cited: number;
	mentionsYou: boolean;
}

const SOURCES: Source[] = [
	{ domain: "deskreviewlab.com", kind: "Review site", cited: 70, mentionsYou: false },
	{ domain: "reddit.com", kind: "Forum", cited: 52, mentionsYou: true },
	{ domain: "wfhgearguide.com", kind: "Blog", cited: 38, mentionsYou: false },
	{ domain: "youtube.com", kind: "Video", cited: 27, mentionsYou: true },
	{ domain: "officeweekly.news", kind: "News", cited: 19, mentionsYou: false },
];

const missing = SOURCES.filter((s) => !s.mentionsYou).length;

const POINTS = [
	{
		title: "AI answers cite their sources",
		body: "Review sites, forums, videos, and news shape what AI says about your market.",
	},
	{
		title: "Elmo ranks the ones that matter",
		body: "See which domains get cited most in your category, and which of them mention you.",
	},
	{
		title: "The gaps become your plan",
		body: "A trusted source that never names you is the clearest place to get covered next.",
	},
];

function SourceRow({ source, index }: { source: Source; index: number }) {
	return (
		<li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 py-4 sm:grid-cols-[minmax(0,11rem)_1fr_8.25rem]">
			<div className="min-w-0">
				<p className="truncate text-[15px] font-medium text-zinc-950">{source.domain}</p>
				<p className="text-[13px] text-zinc-500">{source.kind}</p>
			</div>
			<div className="col-span-2 row-start-2 flex items-center gap-3 sm:col-span-1 sm:row-start-auto">
				<span className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100">
					<span
						className={`home-grow block h-full rounded-full ${source.mentionsYou ? "bg-zinc-300" : "bg-amber-400"}`}
						style={{ width: `${source.cited}%`, ...delay(index * 90) }}
					/>
				</span>
				<span className="w-10 text-right text-sm text-zinc-600 tabular-nums">{source.cited}%</span>
			</div>
			{source.mentionsYou ? (
				<span className="inline-flex items-center gap-1 justify-self-end rounded-full bg-emerald-50 px-2.5 py-1 text-[13px] font-medium text-emerald-700 ring-1 ring-emerald-200/70">
					<Check className="size-3.5" strokeWidth={2.5} aria-hidden="true" />
					Mentions you
				</span>
			) : (
				<span className="inline-flex items-center gap-1 justify-self-end rounded-full bg-amber-50 px-2.5 py-1 text-[13px] font-medium text-amber-800 ring-1 ring-amber-200/80">
					<Minus className="size-3.5" strokeWidth={2.5} aria-hidden="true" />
					Missing you
				</span>
			)}
		</li>
	);
}

export function Citations() {
	return (
		<section className="border-y border-zinc-200/80 bg-zinc-50/70">
			<div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 md:px-6 lg:grid-cols-12 lg:items-center lg:gap-16 lg:py-28">
				<div className="lg:col-span-5">
					<SectionHeading
						eyebrow="Citations"
						title="Get into the sources AI trusts."
						lede="Every answer is built from pages the model found. Elmo shows you which ones."
					/>
					<ol className="mt-10 space-y-6">
						{POINTS.map((p, i) => (
							<li key={p.title} className="flex gap-4">
								<span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold text-blue-600 ring-1 ring-zinc-200 tabular-nums">
									{i + 1}
								</span>
								<div>
									<h3 className="text-base font-semibold text-zinc-950">{p.title}</h3>
									<p className="mt-1 text-pretty text-[15px]/6 text-zinc-600">{p.body}</p>
								</div>
							</li>
						))}
					</ol>
				</div>

				<div className="lg:col-span-7">
					<ExampleTag>
						<span>
							Sources AI cites for <span className="font-medium text-zinc-700">standing desks</span>
						</span>
					</ExampleTag>
					<div className={`mt-4 p-6 md:p-7 ${CARD}`}>
						<div className="flex items-baseline justify-between gap-4 border-b border-zinc-100 pb-3 text-[13px] font-medium text-zinc-500">
							<span>Most-cited sources</span>
							<span>Share of answers citing it</span>
						</div>
						<ol className="divide-y divide-zinc-100">
							{SOURCES.map((s, i) => (
								<SourceRow key={s.domain} source={s} index={i} />
							))}
						</ol>
						<p className="mt-2 rounded-xl bg-amber-50/80 px-4 py-3.5 text-pretty text-[15px]/6 text-amber-900 ring-1 ring-amber-200/70">
							<span className="font-semibold">
								{missing} of the {SOURCES.length} sources AI trusts most never mention {BRAND}.
							</span>{" "}
							That's the outreach list.
						</p>
					</div>
				</div>
			</div>
		</section>
	);
}
