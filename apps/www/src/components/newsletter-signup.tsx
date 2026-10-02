"use client";

import { ArrowRight, Check } from "lucide-react";
import { useId, useState } from "react";
import { identifyByEmail, trackEvent } from "@/lib/posthog";

/** Email signup for product updates. Subscribers land in PostHog as identified people with a `newsletter_subscribe` event. */
export function NewsletterSignup({
	source,
	className = "",
	hideLabel = false,
}: {
	source: string;
	className?: string;
	/** For when a heading beside the form already says what it is. */
	hideLabel?: boolean;
}) {
	const id = useId();
	const [email, setEmail] = useState("");
	const [error, setError] = useState("");
	const [done, setDone] = useState(false);

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		const trimmed = email.trim();
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
			setError("Please enter a valid email address.");
			return;
		}
		identifyByEmail(trimmed);
		trackEvent("newsletter_subscribe", { email: trimmed, source });
		setError("");
		setDone(true);
	}

	if (done) {
		return (
			<p className={`inline-flex items-center gap-2 text-sm font-medium text-emerald-700 ${className}`} role="status">
				<Check className="size-4" aria-hidden="true" />
				You're subscribed. Watch your inbox for product updates.
			</p>
		);
	}

	return (
		<form onSubmit={handleSubmit} noValidate className={className}>
			<label htmlFor={id} className={hideLabel ? "sr-only" : "text-sm font-medium text-zinc-950"}>
				Get product updates by email
			</label>
			<div className={`flex max-w-md gap-2 ${hideLabel ? "" : "mt-2"}`}>
				<input
					id={id}
					type="email"
					autoComplete="email"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					placeholder="you@company.com"
					aria-invalid={error ? true : undefined}
					aria-describedby={error ? `${id}-error` : undefined}
					className="h-9 min-w-0 flex-1 rounded-md bg-white px-3 text-sm text-zinc-950 ring-1 ring-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
				/>
				<button
					type="submit"
					className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-zinc-950 px-3.5 text-sm font-medium text-white hover:bg-zinc-800"
				>
					Subscribe
					<ArrowRight className="size-3.5" aria-hidden="true" />
				</button>
			</div>
			{error ? (
				<p id={`${id}-error`} className="mt-1.5 text-sm text-red-600">
					{error}
				</p>
			) : null}
		</form>
	);
}
