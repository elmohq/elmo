import { CUSTOMER_QUOTES, type CustomerQuote } from "@workspace/ui/brand/customers";
import { DISPLAY } from "./ui";

function QuoteMark({ className }: { className: string }) {
	return (
		<svg aria-hidden="true" viewBox="0 0 48 36" className={className}>
			<path
				fill="currentColor"
				d="M0 36V22.2C0 9.4 6.6 1.9 19.2 0l2 5.2C14.4 7 11 11 10.6 17H20v19H0Zm27.6 0V22.2C27.6 9.4 34.2 1.9 46.8 0l2 5.2C42 7 38.6 11 38.2 17h9.4v19h-20Z"
			/>
		</svg>
	);
}

function QuoteCard({
	q,
	className,
	quoteClass,
	markClass,
	metaClass,
}: {
	q: CustomerQuote;
	className: string;
	quoteClass: string;
	markClass: string;
	metaClass: string;
}) {
	return (
		<figure
			className={`flex flex-col justify-between rounded-[2rem] p-8 transition duration-200 hover:-translate-y-1 md:p-10 ${className}`}
		>
			<div>
				<QuoteMark className={`h-8 w-auto ${markClass}`} />
				<blockquote className={`mt-6 text-pretty ${quoteClass}`}>{q.quote}</blockquote>
			</div>
			<figcaption className={`mt-10 flex flex-wrap items-center gap-x-2.5 gap-y-2 text-base ${metaClass}`}>
				<span className="font-bold">{q.author}</span>
				<span className="opacity-60">at</span>
				<a
					href={q.companyUrl}
					target="_blank"
					rel="noopener noreferrer"
					aria-label={q.company}
					className="inline-flex items-center rounded-sm transition-opacity hover:opacity-75"
				>
					{q.mark}
				</a>
			</figcaption>
		</figure>
	);
}

export function TestimonialsB() {
	return (
		<section aria-labelledby="hb-quotes" className="bg-zinc-950 py-24 text-white lg:py-32">
			<div className="mx-auto max-w-6xl px-5 md:px-8">
				<p className="text-sm font-bold uppercase tracking-[0.14em] text-amber-300">Customers</p>
				<h2 id="hb-quotes" className={`${DISPLAY} mt-4 max-w-[18ch] text-4xl leading-[1.05] md:text-6xl`}>
					Don&apos;t just take our word for it.
				</h2>
				<div className="mt-14 grid gap-5 lg:grid-cols-[5fr_7fr]">
					<QuoteCard
						q={CUSTOMER_QUOTES.speakeasy}
						className="bg-amber-300 text-zinc-950"
						quoteClass={`${DISPLAY} text-4xl leading-[1.1] md:text-5xl`}
						markClass="text-zinc-950/20"
						metaClass="text-zinc-950"
					/>
					<QuoteCard
						q={CUSTOMER_QUOTES.tradesites}
						className="bg-blue-600 text-white"
						quoteClass="text-2xl font-semibold leading-snug tracking-tight md:text-[2rem] md:leading-[1.3]"
						markClass="text-white/30"
						metaClass="text-white"
					/>
				</div>
			</div>
		</section>
	);
}
