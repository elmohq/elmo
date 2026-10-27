import { ArrowRight, Check, ChevronDown, Loader2 } from "lucide-react";
import { useId, useRef, useState } from "react";
import { parseDomainInput } from "@/lib/checker/domain";
import { trackChecker } from "@/lib/checker/track";
import type { CheckEvent, CheckResult } from "@/lib/checker/types";
import { useTurnstile } from "@/lib/use-turnstile";
import { CheckerResults } from "./checker-results";

const STAGES = [
	{ key: "site", label: "Reading your site, robots.txt, and llms.txt" },
	{ key: "prompts", label: "Writing the questions your buyers ask AI" },
	{ key: "answers", label: "Asking ChatGPT with web search" },
	{ key: "analysis", label: "Finding who it recommends and scoring" },
] as const;

type StageKey = (typeof STAGES)[number]["key"];

interface Progress {
	stage: StageKey;
	brandName?: string;
	prompts: string[];
	answered: Set<number>;
}

const INPUT =
	"h-11 w-full min-w-0 rounded-lg bg-white px-3.5 text-base text-zinc-950 ring-1 ring-zinc-300 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:bg-zinc-50 sm:text-sm";

async function readEvents(response: Response, onEvent: (event: CheckEvent) => void): Promise<void> {
	if (!response.body) return;
	const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
	let buffer = "";
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += value;
		const lines = buffer.split("\n");
		buffer = lines.pop() ?? "";
		for (const line of lines) if (line.trim()) onEvent(JSON.parse(line) as CheckEvent);
	}
	if (buffer.trim()) onEvent(JSON.parse(buffer) as CheckEvent);
}

async function requestCheck(body: {
	domain: string;
	brandName?: string;
	category?: string;
	turnstileToken?: string;
}): Promise<Response> {
	const response = await fetch("/api/tools/ai-visibility-checker", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	if (!response.ok) {
		const failure = (await response.json().catch(() => ({}))) as { error?: string };
		throw new Error(failure.error ?? "Something went wrong. Please try again.");
	}
	return response;
}

function advance(progress: Progress, event: Exclude<CheckEvent, { type: "result" | "error" }>): Progress {
	switch (event.type) {
		case "stage":
			return { ...progress, stage: event.stage };
		case "prompts":
			return { ...progress, brandName: event.brandName, prompts: event.prompts };
		case "answer":
			return { ...progress, answered: new Set(progress.answered).add(event.index) };
	}
}

export function CheckerTool() {
	const id = useId();
	const [domain, setDomain] = useState("");
	const [brandName, setBrandName] = useState("");
	const [category, setCategory] = useState("");
	const [showOptions, setShowOptions] = useState(false);
	const [error, setError] = useState("");
	const [progress, setProgress] = useState<Progress | null>(null);
	const [result, setResult] = useState<CheckResult | null>(null);
	const resultsRef = useRef<HTMLDivElement>(null);
	const turnstile = useTurnstile(import.meta.env.VITE_TURNSTILE_SITE_KEY);
	const running = progress !== null;

	async function handleSubmit(event: React.FormEvent) {
		event.preventDefault();
		if (running) return;
		const parsed = parseDomainInput(domain);
		if (!parsed.ok) {
			setError(parsed.error);
			return;
		}
		setError("");
		setResult(null);
		setProgress({ stage: "site", prompts: [], answered: new Set() });
		trackChecker("started", { domain: parsed.domain });

		try {
			const response = await requestCheck({
				domain: parsed.host,
				brandName: brandName.trim() || undefined,
				category: category.trim() || undefined,
				turnstileToken: await turnstile.getToken(),
			});

			let finished = false;
			await readEvents(response, (checkEvent) => {
				if (checkEvent.type === "error") throw new Error(checkEvent.message);
				if (checkEvent.type !== "result") {
					setProgress((current) => current && advance(current, checkEvent));
					return;
				}
				finished = true;
				setResult(checkEvent.result);
				trackChecker("completed", {
					domain: checkEvent.result.domain,
					score: checkEvent.result.score.total,
					cached: checkEvent.cached,
				});
				requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
			});
			if (!finished) throw new Error("The check was interrupted. Please try again.");
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "Something went wrong. Please try again.");
		} finally {
			setProgress(null);
		}
	}

	return (
		<div>
			<form onSubmit={handleSubmit} noValidate className="w-full max-w-2xl">
				<label htmlFor={`${id}-domain`} className="sr-only">
					Your website
				</label>
				<div className="flex flex-col gap-2 sm:flex-row">
					<input
						id={`${id}-domain`}
						type="text"
						inputMode="url"
						autoComplete="url"
						autoCapitalize="none"
						spellCheck={false}
						data-lpignore="true"
						data-1p-ignore
						value={domain}
						onChange={(e) => setDomain(e.target.value)}
						placeholder="yourcompany.com"
						disabled={running}
						aria-invalid={error ? true : undefined}
						aria-describedby={error ? `${id}-error` : undefined}
						className={`${INPUT} sm:flex-1`}
					/>
					<button
						type="submit"
						disabled={running}
						className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:bg-blue-400"
					>
						{running ? (
							<>
								<Loader2 className="size-4 animate-spin" aria-hidden="true" />
								Checking…
							</>
						) : (
							<>
								Check AI visibility
								<ArrowRight className="size-4" aria-hidden="true" />
							</>
						)}
					</button>
				</div>

				<button
					type="button"
					onClick={() => setShowOptions((open) => !open)}
					aria-expanded={showOptions}
					aria-controls={`${id}-options`}
					className="mt-3 inline-flex items-center gap-1 text-sm text-zinc-600 hover:text-zinc-950"
				>
					Set the brand name or category yourself
					<ChevronDown className={`size-3.5 transition-transform ${showOptions ? "rotate-180" : ""}`} />
				</button>
				{showOptions ? (
					<div id={`${id}-options`} className="mt-3 grid gap-3 sm:grid-cols-2">
						<div>
							<label htmlFor={`${id}-brand`} className="text-sm font-medium text-zinc-800">
								Brand name <span className="font-normal text-zinc-500">(optional)</span>
							</label>
							<input
								id={`${id}-brand`}
								type="text"
								maxLength={80}
								value={brandName}
								onChange={(e) => setBrandName(e.target.value)}
								placeholder="Acme"
								disabled={running}
								className={`${INPUT} mt-1.5`}
							/>
						</div>
						<div>
							<label htmlFor={`${id}-category`} className="text-sm font-medium text-zinc-800">
								Category <span className="font-normal text-zinc-500">(optional)</span>
							</label>
							<input
								id={`${id}-category`}
								type="text"
								maxLength={80}
								value={category}
								onChange={(e) => setCategory(e.target.value)}
								placeholder="CRM for real estate agents"
								disabled={running}
								className={`${INPUT} mt-1.5`}
							/>
						</div>
					</div>
				) : null}

				<div ref={turnstile.ref} className="mt-3 empty:hidden" />

				{error ? (
					<p id={`${id}-error`} role="alert" className="mt-3 text-sm text-red-600">
						{error}
					</p>
				) : null}
				<p className="mt-4 text-sm text-zinc-500">Free, no signup. Takes about a minute.</p>
			</form>

			{progress ? <CheckerProgress progress={progress} /> : null}

			<div ref={resultsRef} className="scroll-mt-20">
				{result ? <CheckerResults result={result} /> : null}
			</div>
		</div>
	);
}

function CheckerProgress({ progress }: { progress: Progress }) {
	const current = STAGES.findIndex((stage) => stage.key === progress.stage);
	return (
		<div
			role="status"
			aria-live="polite"
			className="mt-8 max-w-2xl rounded-xl bg-white p-5 shadow-[0_0_0_1px_rgb(24_24_27/0.08),0_16px_40px_-24px_rgb(24_24_27/0.2)]"
		>
			<ol className="space-y-3">
				{STAGES.map((stage, index) => (
					<StageRow
						key={stage.key}
						label={stage.label}
						state={index < current ? "done" : index === current ? "active" : "waiting"}
						progress={stage.key === "answers" ? progress : null}
					/>
				))}
			</ol>
		</div>
	);
}

function StageRow({
	label,
	state,
	progress,
}: {
	label: string;
	state: "done" | "active" | "waiting";
	progress: Progress | null;
}) {
	const prompts = state !== "waiting" && progress ? progress.prompts : [];
	const counter = state === "active" && prompts.length > 0 ? ` (${progress?.answered.size}/${prompts.length})` : "";
	return (
		<li className="flex items-start gap-3 text-sm">
			<span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center">
				{state === "done" ? (
					<Check className="size-4 text-emerald-600" strokeWidth={2.5} aria-hidden="true" />
				) : state === "active" ? (
					<Loader2 className="size-4 animate-spin text-blue-600" aria-hidden="true" />
				) : (
					<span className="size-1.5 rounded-full bg-zinc-300" />
				)}
			</span>
			<div className="min-w-0 flex-1">
				<p
					className={
						state === "active" ? "font-medium text-zinc-950" : state === "done" ? "text-zinc-600" : "text-zinc-400"
					}
				>
					{label}
					{counter}
				</p>
				{prompts.length > 0 ? (
					<ul className="mt-2 space-y-1.5">
						{prompts.map((prompt, index) => (
							<li key={prompt} className="flex items-start gap-2 text-[13px] text-zinc-600">
								{state === "done" || progress?.answered.has(index) ? (
									<Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
								) : (
									<Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-zinc-400" aria-hidden="true" />
								)}
								<span className="text-pretty">“{prompt}”</span>
							</li>
						))}
					</ul>
				) : null}
			</div>
		</li>
	);
}
