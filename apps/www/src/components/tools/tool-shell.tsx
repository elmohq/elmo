import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

export function ToolHero({ eyebrow, title, lead }: { eyebrow: string; title: string; lead: string }) {
	return (
		<section className="border-b border-zinc-200 bg-white py-12 lg:py-16">
			<div className="mx-auto max-w-6xl px-4 md:px-6">
				<p className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">{eyebrow}</p>
				<h1 className="font-heading mt-2 text-4xl text-balance text-zinc-950 md:text-5xl">{title}</h1>
				<p className="mt-4 max-w-3xl text-lg text-balance text-zinc-600">{lead}</p>
			</div>
		</section>
	);
}

/** The interactive part, set on a tinted band so it reads as the point of the page. */
export function ToolPanel({ children }: { children: ReactNode }) {
	return (
		<section className="border-b border-zinc-200 bg-zinc-50 py-10">
			<div className="mx-auto max-w-6xl px-4 md:px-6">
				<div className="rounded-md border border-zinc-200 bg-white p-6">{children}</div>
			</div>
		</section>
	);
}

export function ToolSection({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="border-b border-zinc-200 bg-white py-12">
			<div className="mx-auto max-w-6xl px-4 md:px-6">
				<h2 className="font-heading text-2xl text-zinc-950 md:text-3xl">{title}</h2>
				<div className="mt-6">{children}</div>
			</div>
		</section>
	);
}

export function RelatedReading({ links }: { links: { label: string; href: string; blurb: string }[] }) {
	return (
		<section className="border-b border-zinc-200 bg-zinc-50 py-12">
			<div className="mx-auto max-w-6xl px-4 md:px-6">
				<h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">Keep reading</h2>
				<div className="mt-5 grid gap-5 sm:grid-cols-2">
					{links.map((link) => (
						<a
							key={link.href}
							href={link.href}
							className="flex flex-col rounded-md border border-zinc-200 bg-white p-5 transition-colors hover:border-zinc-300"
						>
							<span className="inline-flex items-center gap-1 font-semibold text-zinc-950">
								{link.label}
								<ArrowRight className="size-3.5" />
							</span>
							<span className="mt-2 text-sm leading-relaxed text-zinc-600">{link.blurb}</span>
						</a>
					))}
				</div>
			</div>
		</section>
	);
}
