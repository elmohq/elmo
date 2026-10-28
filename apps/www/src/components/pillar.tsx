import { ArrowRight } from "lucide-react";
import type { Pillar } from "@/data/pillars";

export function PillarBody({ pillar }: { pillar: Pillar }) {
	return (
		<section className="border-b border-zinc-200 bg-white py-12">
			<div className="mx-auto max-w-6xl px-4 md:px-6">
				<div className="max-w-3xl">
					<div className="rounded-md border border-blue-200 bg-blue-50/40 p-6">
						<h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">In short</h2>
						<p className="mt-3 text-lg leading-relaxed text-zinc-800">{pillar.definition}</p>
					</div>

					<nav aria-label="On this page" className="mt-10 rounded-md border border-zinc-200 bg-zinc-50 p-6">
						<h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">On this page</h2>
						<ol className="mt-4 space-y-2">
							{pillar.sections.map((section, i) => (
								<li key={section.id} className="flex gap-3 text-sm">
									<span className="font-mono text-zinc-400 tabular-nums">{String(i + 1).padStart(2, "0")}</span>
									<a href={`#${section.id}`} className="text-zinc-700 transition-colors hover:text-zinc-950">
										{section.heading}
									</a>
								</li>
							))}
						</ol>
					</nav>

					{pillar.sections.map((section) => (
						<div key={section.id} className="mt-12 scroll-mt-24" id={section.id}>
							<h2 className="font-heading text-2xl text-zinc-950">{section.heading}</h2>
							<div className="mt-5 space-y-5 text-lg leading-relaxed text-zinc-700">
								{section.body.map((paragraph) => (
									<p key={paragraph.slice(0, 40)}>{paragraph}</p>
								))}
							</div>

							{section.steps ? (
								<ol className="mt-6 space-y-5">
									{section.steps.map((step, i) => (
										<li key={step.name} className="flex gap-4">
											<span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 font-mono text-xs text-white tabular-nums">
												{i + 1}
											</span>
											<div>
												<h3 className="font-semibold text-zinc-950">{step.name}</h3>
												<p className="mt-1 leading-relaxed text-zinc-600">{step.text}</p>
											</div>
										</li>
									))}
								</ol>
							) : null}

							{section.bullets ? (
								<ul className="mt-6 space-y-3">
									{section.bullets.map((bullet) => (
										<li key={bullet.slice(0, 40)} className="flex gap-3 leading-relaxed text-zinc-600">
											<span aria-hidden className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-300" />
											<span>{bullet}</span>
										</li>
									))}
								</ul>
							) : null}

							{section.callout ? (
								<div className="mt-8 rounded-md border border-zinc-200 bg-zinc-50 p-6">
									<h3 className="font-semibold text-zinc-950">{section.callout.heading}</h3>
									<p className="mt-2 leading-relaxed text-zinc-600">{section.callout.text}</p>
								</div>
							) : null}
						</div>
					))}

					<div className="mt-14 border-t border-zinc-200 pt-8">
						<h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">Keep reading</h2>
						<div className="mt-4 grid gap-3 sm:grid-cols-2">
							{pillar.related.map((link) => (
								<a
									key={link.href}
									href={link.href}
									className="group rounded-md border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300"
								>
									<span className="flex items-center gap-1.5 font-semibold text-zinc-950">
										{link.label}
										<ArrowRight className="h-3.5 w-3.5 text-zinc-400 transition-transform group-hover:translate-x-0.5" />
									</span>
									<span className="mt-1 block text-sm leading-relaxed text-zinc-600">{link.description}</span>
								</a>
							))}
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}
