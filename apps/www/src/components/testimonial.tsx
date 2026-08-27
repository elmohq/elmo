import { CUSTOMER_QUOTES, type CustomerQuote } from "@workspace/ui/brand/customers";
import { Quote } from "lucide-react";

function Testimonial({ quote, author, company, companyUrl, mark }: CustomerQuote) {
	return (
		<section className="border-b border-zinc-200 bg-zinc-50">
			<div className="mx-auto max-w-6xl px-4 py-16 md:px-6 lg:py-24">
				<p className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">/ TESTIMONIAL</p>
				<figure className="mt-8 max-w-[48rem]">
					<Quote className="size-8 text-zinc-300" strokeWidth={2} aria-hidden="true" />
					<blockquote className="mt-6 text-pretty text-2xl font-medium leading-[1.4] tracking-tight text-zinc-950 md:text-[2rem] md:leading-[1.35]">
						“{quote}”
					</blockquote>
					<figcaption className="mt-8 flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
						<span className="font-semibold text-zinc-950">{author}</span>
						<span className="text-zinc-500">at</span>
						<a
							href={companyUrl}
							target="_blank"
							rel="noopener noreferrer"
							aria-label={company}
							className="inline-flex items-center text-zinc-950 rounded-sm transition-opacity hover:opacity-80"
						>
							{mark}
						</a>
					</figcaption>
				</figure>
			</div>
		</section>
	);
}

export function SpeakeasyTestimonial() {
	return <Testimonial {...CUSTOMER_QUOTES.speakeasy} />;
}

export function TradeSitesTestimonial() {
	return <Testimonial {...CUSTOMER_QUOTES.tradesites} />;
}
