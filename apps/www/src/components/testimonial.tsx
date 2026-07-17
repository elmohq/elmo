import { TradeSitesWordmark } from "./customer-logos";

const TRADESITES_URL = "https://www.tradesites.ai/?ref=elmo";

export function Testimonial() {
	return (
		<section className="border-b border-zinc-200 bg-white">
			<div className="mx-auto max-w-6xl px-4 py-14 md:px-6 lg:py-16">
				<figure className="mx-auto max-w-2xl">
					<div className="relative rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm md:p-6">
						<blockquote className="text-pretty text-[15px] leading-relaxed text-zinc-700 md:text-base">
							“We were looking for an affordable way to track our visibility in
							AI search, and Elmo was a great fit. They were incredibly
							responsive and quickly added the integration we needed.”
						</blockquote>
						{/* tail pointing down to the speaker */}
						<span
							aria-hidden="true"
							className="absolute -bottom-[7px] left-8 size-3.5 rotate-45 rounded-br-[3px] border-b border-r border-zinc-200 bg-white"
						/>
					</div>
					<figcaption className="mt-4 flex items-center gap-2.5 pl-8">
						<a
							href={TRADESITES_URL}
							target="_blank"
							rel="noopener noreferrer"
							aria-label="TradeSites"
							className="inline-flex rounded-sm transition-opacity hover:opacity-80"
						>
							<TradeSitesWordmark />
						</a>
						<span className="text-sm font-medium text-zinc-600">James</span>
					</figcaption>
				</figure>
			</div>
		</section>
	);
}
