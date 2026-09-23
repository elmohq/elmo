import { Plus } from "lucide-react";
import type { FaqItem } from "@/lib/faqs";
import { DISCORD_INVITE_URL } from "./closing";
import { SectionHeading } from "./ui";

/** Answers live inside closed <details>, so they stay in the DOM for crawlers and the FAQPage JSON-LD. */
export function Faq({ items }: { items: FaqItem[] }) {
	return (
		<section>
			<div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:px-6 lg:grid-cols-12 lg:gap-12 lg:py-20">
				<div className="lg:col-span-4">
					<SectionHeading eyebrow="FAQ" title="Frequently asked questions" />
					<p className="mt-4 text-pretty text-sm/6 text-slate-600">
						Something we didn't cover? Ask the maintainers directly on{" "}
						<a
							href={DISCORD_INVITE_URL}
							target="_blank"
							rel="noopener noreferrer"
							className="font-medium text-slate-950 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-950"
						>
							Discord
						</a>
						.
					</p>
				</div>
				<div className="lg:col-span-8">
					<div className="divide-y divide-slate-200 border-y border-slate-200">
						{items.map((item) => (
							<details key={item.question} className="group">
								<summary className="flex cursor-pointer list-none items-start justify-between gap-6 py-5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 [&::-webkit-details-marker]:hidden">
									<h3 className="text-base font-medium text-slate-950">{item.question}</h3>
									<span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full text-slate-400 ring-1 ring-slate-200 transition group-open:rotate-45 group-open:bg-blue-600 group-open:text-white group-open:ring-blue-600">
										<Plus className="size-3" strokeWidth={2.5} aria-hidden="true" />
									</span>
								</summary>
								<p className="-mt-1 max-w-[68ch] pb-6 pr-10 text-pretty text-[15px]/7 text-slate-600">{item.answer}</p>
							</details>
						))}
					</div>
				</div>
			</div>
		</section>
	);
}
