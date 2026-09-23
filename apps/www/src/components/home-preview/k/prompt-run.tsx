import { ArrowUp, Check, Minus } from "lucide-react";
import { Fragment, useState } from "react";
import { MODELS } from "./models";

// Everything here is illustrative. Vaultlark, Keyfold, Passcrate and Lockhaven
// are made-up password managers, so nobody mistakes this for a customer's data.

const OWN_BRAND = "Vaultlark";
const BRANDS = new Set([OWN_BRAND, "Keyfold", "Passcrate", "Lockhaven"]);
const BRAND_PATTERN = /(Vaultlark|Keyfold|Passcrate|Lockhaven)/;

type Answer = { excerpt: string; rank?: number; source: string };

const ENGINES = [
	{ name: "ChatGPT", model: "ChatGPT" },
	{ name: "Claude", model: "Claude" },
	{ name: "Perplexity", model: "Perplexity" },
	{ name: "AI Overviews", model: "Google AI Overviews" },
] as const;

const PROMPTS: { chip: string; text: string; answers: Answer[] }[] = [
	{
		chip: "Best for a startup",
		text: "What's the best password manager for a 20-person startup?",
		answers: [
			{
				excerpt: "1. Keyfold, for its admin console. 2. Vaultlark, if you want simple shared vaults and SSO…",
				rank: 2,
				source: "reddit.com",
			},
			{
				excerpt: "Vaultlark is a strong fit at that size: shared vaults, fast onboarding, and SSO on every tier…",
				rank: 1,
				source: "vaultlark.com",
			},
			{
				excerpt: "Top picks for small teams are Keyfold, Passcrate and Lockhaven, based on recent reviews…",
				source: "g2.com",
			},
			{
				excerpt: "Popular options include Keyfold, Vaultlark and Passcrate. Look for SSO and audit logs…",
				rank: 2,
				source: "techradar.com",
			},
		],
	},
	{
		chip: "Vaultlark vs. Keyfold",
		text: "Vaultlark vs. Keyfold: which is better for a small team?",
		answers: [
			{
				excerpt: "Both work well. Vaultlark is simpler to roll out; Keyfold has deeper policy controls…",
				rank: 1,
				source: "vaultlark.com",
			},
			{
				excerpt: "Keyfold suits teams that need granular policies. Vaultlark wins on price and setup time…",
				rank: 2,
				source: "keyfold.com",
			},
			{
				excerpt: "Reviewers rate Vaultlark higher for ease of use and Keyfold higher for compliance…",
				rank: 1,
				source: "g2.com",
			},
			{
				excerpt: "Keyfold is the more established choice, while Vaultlark is newer and cheaper per seat…",
				rank: 2,
				source: "reddit.com",
			},
		],
	},
	{
		chip: "Sharing with contractors",
		text: "How do I share logins securely with contractors?",
		answers: [
			{
				excerpt: "Use a password manager with expiring guest access. Keyfold and Passcrate both support it…",
				source: "keyfold.com",
			},
			{
				excerpt: "Never send passwords over chat. Tools like Vaultlark or Keyfold let you share one item…",
				rank: 1,
				source: "youtube.com",
			},
			{
				excerpt: "Create a separate vault per contractor and revoke it when the work ends. Passcrate…",
				source: "reddit.com",
			},
			{
				excerpt: "Most teams use a manager like Keyfold, Lockhaven or Vaultlark with time-limited sharing…",
				rank: 3,
				source: "pcmag.com",
			},
		],
	},
];

const runCss = `
@keyframes k-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: no-preference) {
	.k-in { animation: k-in .5s cubic-bezier(.2,.7,.2,1) both; }
}
`;

function iconFor(model: string) {
	return MODELS.find((m) => m.name === model)?.icon ?? MODELS[0].icon;
}

function Highlighted({ text }: { text: string }) {
	return (
		<>
			{text.split(BRAND_PATTERN).map((part, i) => {
				const key = `${i}-${part}`;
				if (part === OWN_BRAND) {
					return (
						<mark key={key} className="rounded-[3px] bg-blue-100 px-0.5 font-medium text-blue-800">
							{part}
						</mark>
					);
				}
				if (BRANDS.has(part)) {
					return (
						<span key={key} className="font-medium text-zinc-900">
							{part}
						</span>
					);
				}
				return <Fragment key={key}>{part}</Fragment>;
			})}
		</>
	);
}

function EngineCard({ engine, answer, index }: { engine: (typeof ENGINES)[number]; answer: Answer; index: number }) {
	const Icon = iconFor(engine.model);
	const mentioned = answer.rank !== undefined;
	return (
		<li
			className="k-in flex min-w-0 flex-col rounded-xl bg-white p-3 sm:p-4 shadow-[0_0_0_1px_rgb(24_24_27/0.08),0_1px_2px_rgb(24_24_27/0.04)]"
			style={{ animationDelay: `${index * 70}ms` }}
		>
			<div className="flex items-center justify-between gap-2">
				<span className="flex items-center gap-2">
					<span className="inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-zinc-50 p-1 text-zinc-800 ring-1 ring-zinc-200/80">
						<Icon />
					</span>
					<span className="text-[13px] font-semibold text-zinc-900">{engine.name}</span>
				</span>
				<span
					className={`text-[1.35rem] font-semibold leading-none tracking-[-0.03em] tabular-nums ${mentioned ? "text-zinc-950" : "text-zinc-300"}`}
				>
					{mentioned ? `#${answer.rank}` : "—"}
					<span className="sr-only">{mentioned ? " rank in the answer" : " not ranked"}</span>
				</span>
			</div>
			<p className="mt-3 line-clamp-3 flex-1 text-pretty text-[13px]/5 text-zinc-600 max-sm:hidden">
				<Highlighted text={answer.excerpt} />
			</p>
			<div className="mt-3 flex flex-col items-start gap-1.5 border-t border-zinc-100 pt-3 sm:mt-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
				<span
					className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium ${
						mentioned ? "bg-blue-50 text-blue-700 ring-1 ring-blue-600/15" : "bg-zinc-100 text-zinc-600"
					}`}
				>
					{mentioned ? (
						<Check className="size-3" strokeWidth={2.5} aria-hidden="true" />
					) : (
						<Minus className="size-3" strokeWidth={2.5} aria-hidden="true" />
					)}
					{mentioned ? "Mentioned" : "Not mentioned"}
				</span>
				<span className="max-w-full truncate font-mono text-[11px] text-zinc-500">
					<span className="sr-only">Top source: </span>
					{answer.source}
				</span>
			</div>
		</li>
	);
}

/** One buyer question asked across four engines, with what Elmo records from each answer. */
export function PromptRun() {
	const [index, setIndex] = useState(0);
	const prompt = PROMPTS[index];
	const mentioned = prompt.answers.filter((a) => a.rank !== undefined);
	const avgRank = mentioned.length
		? (mentioned.reduce((sum, a) => sum + (a.rank ?? 0), 0) / mentioned.length).toFixed(1)
		: "—";

	return (
		<figure className="relative rounded-[22px] bg-white/70 p-2 shadow-[0_0_0_1px_rgb(24_24_27/0.06),0_40px_80px_-32px_rgb(37_99_235/0.35)] backdrop-blur">
			<style>{runCss}</style>
			<figcaption className="sr-only">
				Illustrative example: Elmo asks four AI engines the same buyer question and records whether a fictional password
				manager, Vaultlark, is mentioned, where it ranks, and which source each answer leans on.
			</figcaption>
			<div className="rounded-2xl bg-zinc-50 p-3 ring-1 ring-zinc-200/70 sm:p-4">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div className="flex flex-wrap items-center gap-1.5">
						{PROMPTS.map((p, i) => (
							<button
								key={p.chip}
								type="button"
								aria-pressed={i === index}
								onClick={() => setIndex(i)}
								className={`h-7 rounded-full px-3 text-[12.5px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
									i === index
										? "bg-zinc-950 text-white"
										: "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:text-zinc-950 hover:ring-zinc-300"
								}`}
							>
								{p.chip}
							</button>
						))}
					</div>
					<p className="flex items-center gap-2 text-[12px] text-zinc-500">
						<span className="inline-flex h-5 items-center rounded-full bg-amber-50 px-2 font-mono text-[10px] uppercase tracking-[0.12em] text-amber-800 ring-1 ring-amber-600/20">
							Example
						</span>
						Vaultlark is a fictional brand
					</p>
				</div>

				<div className="mt-3 flex items-center gap-3 rounded-xl bg-white py-2 pl-4 pr-2 shadow-[0_0_0_1px_rgb(24_24_27/0.08),0_8px_24px_-16px_rgb(24_24_27/0.3)] sm:py-2.5 sm:pl-5">
					<p key={prompt.text} className="k-in min-w-0 flex-1 text-[15px]/6 text-zinc-900 sm:text-[17px]">
						<span className="sr-only">Example prompt: </span>
						{prompt.text}
					</p>
					<span
						aria-hidden="true"
						className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white"
					>
						<ArrowUp className="size-4" strokeWidth={2.25} />
					</span>
				</div>

				<ul key={index} className="mt-3 grid grid-cols-2 gap-2 sm:gap-2.5 lg:grid-cols-4">
					{ENGINES.map((engine, i) => (
						<EngineCard key={engine.name} engine={engine} answer={prompt.answers[i]} index={i} />
					))}
				</ul>

				<div
					aria-live="polite"
					className="mt-3 flex flex-col gap-2 px-1 text-[13px] text-zinc-600 sm:flex-row sm:items-center sm:justify-between"
				>
					<p>
						<span className="font-semibold text-zinc-950">Vaultlark</span> appears in{" "}
						<span className="font-semibold text-zinc-950 tabular-nums">
							{mentioned.length} of {ENGINES.length}
						</span>{" "}
						answers, average rank <span className="font-semibold text-zinc-950 tabular-nums">#{avgRank}</span>
					</p>
					<p className="text-zinc-500">Re-asked on a schedule, so you see the trend, not one roll of the dice.</p>
				</div>
			</div>
		</figure>
	);
}
