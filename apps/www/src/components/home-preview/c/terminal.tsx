"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

const COMMANDS = ["npm install -g @elmohq/cli", "elmo init"];

export function Terminal({ className = "" }: { className?: string }) {
	const [copied, setCopied] = useState(false);

	async function handleCopy() {
		try {
			await navigator.clipboard.writeText(COMMANDS.join(" && "));
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		} catch {
			// clipboard unavailable; nothing to report
		}
	}

	return (
		<div
			className={`overflow-hidden rounded-lg bg-black/60 font-mono text-[13px] ring-1 ring-white/10 backdrop-blur ${className}`}
		>
			<div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
				<div className="flex items-center gap-2">
					<div className="flex gap-1.5" aria-hidden="true">
						<span className="size-2.5 rounded-full bg-white/15" />
						<span className="size-2.5 rounded-full bg-white/15" />
						<span className="size-2.5 rounded-full bg-white/15" />
					</div>
					<span className="ml-2 text-[11px] text-zinc-500">~/self-host</span>
				</div>
				<button
					type="button"
					onClick={handleCopy}
					className="inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[11px] text-zinc-400 outline-none transition-colors hover:bg-white/10 hover:text-zinc-100 focus-visible:ring-2 focus-visible:ring-blue-400"
					aria-label={copied ? "Commands copied" : "Copy install commands"}
				>
					{copied ? <Check className="size-3" aria-hidden="true" /> : <Copy className="size-3" aria-hidden="true" />}
					{copied ? "Copied" : "Copy"}
				</button>
			</div>
			<div className="space-y-1.5 overflow-x-auto px-4 py-4 text-zinc-200">
				<div className="flex gap-3 whitespace-nowrap">
					<span className="select-none text-blue-400" aria-hidden="true">
						$
					</span>
					<span>
						npm install -g <span className="text-sky-300">@elmohq/cli</span>
					</span>
				</div>
				<div className="flex gap-3 whitespace-nowrap">
					<span className="select-none text-blue-400" aria-hidden="true">
						$
					</span>
					<span>
						elmo init
						<span
							aria-hidden="true"
							className="ml-1 inline-block h-[1.05em] w-[0.55em] translate-y-[0.2em] animate-pulse bg-zinc-300/80"
						/>
					</span>
				</div>
			</div>
		</div>
	);
}
