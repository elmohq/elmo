import { CUSTOMER_QUOTES, type CustomerQuote } from "@workspace/ui/brand/customers";
import { SectionHeading } from "./ui";

function QuoteCard({ quote, author, company, companyUrl, mark, large }: CustomerQuote & { large?: boolean }) {
	return (
		<figure className="flex h-full flex-col justify-between rounded-2xl bg-white p-7 shadow-[0_0_0_1px_rgb(30_58_138/0.07),0_1px_2px_rgb(30_58_138/0.05),0_18px_40px_-24px_rgb(30_58_138/0.22)] md:p-9">
			<blockquote
				className={`text-pretty tracking-[-0.015em] text-slate-950 ${large ? "text-2xl/[1.3] font-medium md:text-[1.75rem]/[1.3]" : "text-lg/[1.55] md:text-xl/[1.55]"}`}
			>
				<span aria-hidden="true" className="-ml-2.5 text-blue-600">
					“
				</span>
				{quote}”
			</blockquote>
			<figcaption className="mt-10 flex items-center justify-between gap-4 border-t border-slate-100 pt-5 text-sm">
				<span className="text-slate-600">
					<span className="font-medium text-slate-950">{author}</span>, {company}
				</span>
				<a
					href={companyUrl}
					target="_blank"
					rel="noopener noreferrer"
					aria-label={company}
					className="inline-flex items-center rounded-sm text-slate-950 transition-opacity hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600"
				>
					{mark}
				</a>
			</figcaption>
		</figure>
	);
}

export function Testimonials() {
	return (
		<section>
			<div className="mx-auto max-w-6xl px-4 pb-10 pt-20 md:px-6 lg:pb-12 lg:pt-24">
				<SectionHeading eyebrow="Customers" title="Cost-effective, with maintainers who listen." />
				<div className="mt-12 grid gap-4 md:grid-cols-5 md:gap-5">
					<div className="md:col-span-2">
						<QuoteCard {...CUSTOMER_QUOTES.speakeasy} large />
					</div>
					<div className="md:col-span-3">
						<QuoteCard {...CUSTOMER_QUOTES.tradesites} />
					</div>
				</div>
			</div>
		</section>
	);
}
