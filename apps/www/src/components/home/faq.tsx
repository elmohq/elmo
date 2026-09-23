import { Plus } from "lucide-react";
import type { FaqItem } from "@/lib/faqs";
import { DISCORD_INVITE_URL } from "./closing";
import { SectionHeading } from "./ui";

/** Answers live inside closed <details>, so they stay in the DOM for crawlers and the FAQPage JSON-LD. */
export function Faq({ items }: { items: FaqItem[] }) {
	return (
		<section className="border-t border-zinc-200/80 bg-white">
			<div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 md:px-6 lg:grid-cols-12 lg:gap-12 lg:py-28">
				<div className="lg:col-span-4">
					<SectionHeading title="Frequently asked questions" />
					<p className="mt-4 text-pretty text-sm/6 text-zinc-600">
						Something we didn't cover? Ask the maintainers directly on{" "}
						<a
							href={DISCORD_INVITE_URL}
							target="_blank"
							rel="noopener noreferrer"
							className="font-medium text-zinc-950 underline decoration-zinc-300 underline-offset-4 hover:decoration-zinc-950"
						>
							Discord
						</a>
						.
					</p>
				</div>
				<div className="lg:col-span-8">
					<div className="divide-y divide-zinc-200 border-y border-zinc-200">
						{items.map((item) => (
							<details key={item.question} className="group">
								<summary className="flex cursor-pointer list-none items-start justify-between gap-6 py-5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 [&::-webkit-details-marker]:hidden">
									<h3 className="text-base font-medium text-zinc-950">{item.question}</h3>
									<span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full text-zinc-400 ring-1 ring-zinc-200 transition group-open:rotate-45 group-open:bg-blue-600 group-open:text-white group-open:ring-blue-600">
										<Plus className="size-3" strokeWidth={2.5} aria-hidden="true" />
									</span>
								</summary>
								<p className="-mt-1 max-w-[68ch] pb-6 pr-10 text-pretty text-[15px]/7 text-zinc-600">{item.answer}</p>
							</details>
						))}
					</div>
				</div>
			</div>
		</section>
	);
}
