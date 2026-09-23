import { Link } from "@tanstack/react-router";
import { ArrowRight, Database, KeyRound, type LucideIcon, Network, ScanSearch } from "lucide-react";
import { MODELS } from "./models";
import { SectionHeading } from "./ui";

interface Point {
	icon: LucideIcon;
	title: string;
	body: React.ReactNode;
}

const points: Point[] = [
	{
		icon: Database,
		title: "Your servers, your database",
		body: "A Docker Compose stack of web, worker, and Postgres. Use the bundled database or point it at your own, so the answers and history never leave your network.",
	},
	{
		icon: KeyRound,
		title: "Your keys, provider prices",
		body: "Bring OpenAI, Anthropic, Mistral, or OpenRouter keys and pay the providers directly. No license fee, no markup, unlimited prompts.",
	},
	{
		icon: Network,
		title: "Any model on OpenRouter",
		body: "One key reaches Claude, Grok, Kimi, Llama, Perplexity Sonar, and the rest of the OpenRouter catalog.",
	},
	{
		icon: ScanSearch,
		title: "The real consumer answers",
		body: (
			<>
				Scrape ChatGPT and Google AI Mode through Cloro, Bright Data, Oxylabs, SearchApi, Olostep, or DataForSEO. We
				publish how each one performs on the{" "}
				<Link
					to="/status"
					className="font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-4 hover:decoration-zinc-900"
				>
					status page
				</Link>
				.
			</>
		),
	},
];

const C = "text-zinc-500";
const KEY = "text-sky-300";
const VAL = "text-emerald-300";

function ConfigTerminal() {
	return (
		<div className="overflow-hidden rounded-2xl bg-[#070b16] shadow-[0_0_0_1px_rgb(24_24_27/0.9),0_40px_80px_-32px_rgb(15_23_42/0.55)]">
			<div className="flex h-10 items-center gap-3 border-b border-white/[0.07] px-4">
				<div aria-hidden="true" className="flex gap-1.5">
					<span className="size-2.5 rounded-full bg-white/15" />
					<span className="size-2.5 rounded-full bg-white/15" />
					<span className="size-2.5 rounded-full bg-white/15" />
				</div>
				<span className="font-mono text-[11px] text-zinc-500">~/elmo</span>
			</div>
			<div className="overflow-x-auto px-4 py-5 font-mono text-[11px] leading-[1.8] sm:px-5 sm:text-[12px] text-zinc-300 [scrollbar-width:thin]">
				<p className="whitespace-pre">
					<span className="select-none text-zinc-600">$ </span>
					<span className="text-white">npm install -g</span> <span className="text-blue-300">@elmohq/cli</span>
				</p>
				<p className="whitespace-pre">
					<span className="select-none text-zinc-600">$ </span>
					<span className="text-white">elmo init</span>
				</p>
				<p className={`whitespace-pre ${C}`}>{"# prompts, then writes elmo.yaml + .env"}</p>

				<div className="my-4 rounded-lg bg-white/[0.03] px-3 py-3 sm:px-4 ring-1 ring-white/[0.06]">
					<p className={`whitespace-pre ${C}`}># elmo/.env</p>
					<p className="whitespace-pre">
						<span className={KEY}>OPENROUTER_API_KEY</span>=<span className={VAL}>sk-or-…</span>
					</p>
					<p className="whitespace-pre">
						<span className={KEY}>CLORO_API_KEY</span>=<span className={VAL}>…</span>
					</p>
					<p className="whitespace-pre">
						<span className={KEY}>SCRAPE_TARGETS</span>=<span className={VAL}>chatgpt:cloro:online,</span>
					</p>
					<p className={`whitespace-pre ${VAL}`}>{"  google-ai-mode:cloro:online,"}</p>
					<p className={`whitespace-pre ${VAL}`}>{"  claude:openrouter:anthropic/claude-sonnet-5,"}</p>
					<p className={`whitespace-pre ${VAL}`}>{"  perplexity:openrouter:perplexity/sonar:online"}</p>
				</div>

				<p className="whitespace-pre">
					<span className="select-none text-zinc-600">$ </span>
					<span className="text-white">elmo compose up -d</span>
				</p>
				<p className={`whitespace-pre ${C}`}>
					# then open <span className="text-blue-300 underline decoration-blue-300/40">http://localhost:1515</span>
				</p>
			</div>
		</div>
	);
}

export function Infrastructure() {
	return (
		<section className="bg-white">
			<div className="mx-auto max-w-6xl px-4 py-20 md:px-6 lg:py-28">
				<div className="grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-12 lg:items-center lg:gap-16">
					<div className="lg:col-span-6">
						<SectionHeading
							eyebrow="Your data, your infrastructure"
							title="Run the whole thing yourself, for free."
							lede="Self-hosted Elmo is the same product as the cloud, not a trimmed-down community edition. Two commands to install, one file to configure."
						/>
						<ul className="mt-10 space-y-6">
							{points.map((p) => {
								const Icon = p.icon;
								return (
									<li key={p.title} className="flex gap-4">
										<span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-zinc-950 text-white">
											<Icon className="size-4" aria-hidden="true" />
										</span>
										<div>
											<h3 className="text-[15px] font-semibold text-zinc-950">{p.title}</h3>
											<p className="mt-1 text-pretty text-sm/6 text-zinc-600">{p.body}</p>
										</div>
									</li>
								);
							})}
						</ul>
						<Link
							to="/docs"
							className="group mt-10 inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
						>
							Read the self-hosting guide
							<ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
						</Link>
					</div>
					<div className="min-w-0 lg:col-span-6">
						<ConfigTerminal />
					</div>
				</div>

				<div className="mt-20 border-t border-zinc-200 pt-10">
					<div className="flex flex-col gap-2 md:flex-row md:items-baseline md:justify-between">
						<h3 className="text-lg font-semibold tracking-[-0.01em] text-zinc-950">
							Tracks every major AI answer engine
						</h3>
						<p className="text-sm text-zinc-600">Scraped from the real product, or called through its API.</p>
					</div>
					<ul className="mt-6 flex flex-wrap gap-2">
						{MODELS.map((m) => {
							const Icon = m.icon;
							return (
								<li
									key={m.name}
									className="inline-flex h-10 items-center gap-2.5 rounded-full bg-white px-4 text-sm font-medium text-zinc-800 shadow-[0_0_0_1px_rgb(24_24_27/0.08),0_1px_2px_rgb(24_24_27/0.04)]"
								>
									<span className="size-4 shrink-0">
										<Icon />
									</span>
									{m.name}
								</li>
							);
						})}
						<li className="inline-flex h-10 items-center rounded-full border border-dashed border-blue-300 px-4 text-sm font-medium text-blue-700">
							+ anything on OpenRouter
						</li>
					</ul>
				</div>
			</div>
		</section>
	);
}
