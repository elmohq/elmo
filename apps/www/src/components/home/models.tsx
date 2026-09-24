import { Plus } from "lucide-react";
import { EngineIcon } from "./engines";
import { SectionHeading } from "./ui";

const ENGINES = [
	{ name: "ChatGPT", iconId: "openai" },
	{ name: "Claude", iconId: "anthropic" },
	{ name: "Gemini", iconId: "gemini" },
	{ name: "Perplexity", iconId: "perplexity" },
	{ name: "AI Overviews", iconId: "google" },
	{ name: "AI Mode", iconId: "google" },
	{ name: "Copilot", iconId: "microsoft" },
	{ name: "Grok", iconId: "x" },
	{ name: "DeepSeek", iconId: "deepseek" },
	{ name: "Mistral", iconId: "mistral" },
	{ name: "Qwen", iconId: "qwen" },
];

function Tile({ name, iconId }: { name: string; iconId: string }) {
	return (
		<li className="flex h-14 items-center gap-3 rounded-xl bg-white px-4 text-[15px] font-medium text-zinc-900 shadow-[0_0_0_1px_rgb(24_24_27/0.08),0_1px_2px_rgb(24_24_27/0.04)]">
			<span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-zinc-50 ring-1 ring-zinc-200/70">
				<EngineIcon iconId={iconId} className="size-[18px]" />
			</span>
			<span className="truncate">{name}</span>
		</li>
	);
}

export function ModelCoverage() {
	return (
		<section className="border-t border-zinc-200/80 bg-zinc-50/70">
			<div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:px-6 lg:grid-cols-12 lg:items-center lg:gap-12 lg:py-20">
				<div className="lg:col-span-5">
					<SectionHeading
						title="Every answer engine your buyers use."
						lede="Elmo both scrapes what real users see in popular AI search tools and captures all other models with direct API calls and OpenRouter."
					/>
				</div>
				<div className="lg:col-span-7">
					<ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3" aria-label="AI engines Elmo tracks">
						{ENGINES.map((m) => (
							<Tile key={m.name} {...m} />
						))}
						<li className="flex h-14 items-center gap-2 rounded-xl border border-dashed border-zinc-300 px-3 text-sm font-medium text-zinc-700 sm:px-4 sm:text-[15px]">
							<span className="inline-flex size-5 shrink-0 items-center justify-center text-zinc-500">
								<Plus className="size-[18px]" strokeWidth={2.25} aria-hidden="true" />
							</span>
							<span className="whitespace-nowrap">OpenRouter LLMs</span>
						</li>
					</ul>
				</div>
			</div>
		</section>
	);
}
