import { Link } from "@tanstack/react-router";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

/** Back link to the directory, matching the competitor comparison pages. */
export function DirectoryBackLink({ label = "AI Visibility Tool Directory" }: { label?: string }) {
	return (
		<div className="mx-auto max-w-6xl px-4 pt-8 md:px-6">
			<Link
				to="/ai-visibility-tools"
				className="inline-flex items-center gap-1 text-sm text-zinc-500 transition-colors hover:text-zinc-950"
			>
				<ArrowLeft className="h-3 w-3" />
				{label}
			</Link>
		</div>
	);
}

/**
 * Page hero with an eyebrow badge, H1, and a lead "answer block" written to be
 * lifted verbatim into an AI answer. Mirrors the comparison page hero.
 */
export function DirectoryHero({
	eyebrow,
	title,
	lead,
}: {
	eyebrow: string;
	title: string;
	lead: string;
}) {
	return (
		<section className="border-b border-zinc-200 bg-white py-12 lg:py-20">
			<div className="mx-auto max-w-6xl px-4 md:px-6">
				<Badge variant="outline" className="mb-4">
					{eyebrow}
				</Badge>
				<h1 className="font-heading text-4xl text-balance text-zinc-950 md:text-5xl">
					{title}
				</h1>
				<p className="mt-4 max-w-3xl text-lg text-balance text-zinc-600">{lead}</p>
			</div>
		</section>
	);
}

/** The "Ready to track your AI visibility?" closing CTA, shared across pages. */
export function ElmoCta() {
	return (
		<section className="border-b border-zinc-200 bg-white py-16 lg:py-24">
			<div className="mx-auto max-w-3xl px-4 text-center md:px-6">
				<h2 className="font-heading text-3xl text-zinc-950 md:text-4xl">
					Ready to track your AI visibility?
				</h2>
				<p className="mx-auto mt-4 max-w-xl text-lg text-balance text-zinc-600">
					Deploy Elmo in minutes and start monitoring how ChatGPT, Claude, and
					Google AI Overviews talk about your brand. Open source, self-hosted,
					free.
				</p>
				<div className="mt-8 flex flex-wrap justify-center gap-3">
					<Button asChild size="sm">
						<Link to="/docs">Deploy Elmo</Link>
					</Button>
					<Button asChild variant="outline" size="sm">
						<a
							href="https://github.com/elmohq/elmo"
							target="_blank"
							rel="noopener noreferrer"
						>
							View on GitHub
						</a>
					</Button>
				</div>
			</div>
		</section>
	);
}

/** A simple bordered content section with an optional H2. */
export function DirectorySection({
	title,
	children,
}: {
	title?: string;
	children: ReactNode;
}) {
	return (
		<section className="border-b border-zinc-200 bg-white py-12">
			<div className="mx-auto max-w-6xl px-4 md:px-6">
				{title ? (
					<h2 className="font-heading mb-8 text-2xl text-zinc-950">{title}</h2>
				) : null}
				{children}
			</div>
		</section>
	);
}
