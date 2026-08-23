"use client";

import { Spinner } from "@workspace/ui/components/spinner";
import { ArrowRight } from "lucide-react";

/**
 * The single input every free tool starts with. Type="text" rather than "url"
 * so "example.com" submits without the browser demanding a scheme — the server
 * normalizes whatever is pasted.
 */
export function SiteUrlForm({
	value,
	onChange,
	onSubmit,
	pending,
	label,
	placeholder,
	submitLabel,
	pendingLabel,
	error,
}: {
	value: string;
	onChange: (value: string) => void;
	onSubmit: () => void;
	pending: boolean;
	label: string;
	placeholder: string;
	submitLabel: string;
	pendingLabel: string;
	error?: string | null;
}) {
	return (
		<form
			className="w-full"
			onSubmit={(event) => {
				event.preventDefault();
				if (!pending) onSubmit();
			}}
		>
			<label htmlFor="site-url" className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">
				{label}
			</label>
			<div className="mt-2 flex flex-col gap-2 sm:flex-row">
				<input
					id="site-url"
					name="site-url"
					type="text"
					inputMode="url"
					autoComplete="url"
					autoCapitalize="none"
					autoCorrect="off"
					spellCheck={false}
					value={value}
					onChange={(event) => onChange(event.target.value)}
					placeholder={placeholder}
					aria-invalid={error ? true : undefined}
					aria-describedby={error ? "site-url-error" : undefined}
					className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-base text-zinc-950 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 sm:text-sm"
				/>
				<button
					type="submit"
					disabled={pending}
					className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-md bg-blue-600 px-5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
				>
					{pending ? (
						<>
							<Spinner className="size-3.5" />
							{pendingLabel}
						</>
					) : (
						<>
							{submitLabel}
							<ArrowRight className="size-3.5" />
						</>
					)}
				</button>
			</div>
			{error ? (
				<p id="site-url-error" role="alert" className="mt-3 text-sm text-red-700">
					{error}
				</p>
			) : null}
		</form>
	);
}
