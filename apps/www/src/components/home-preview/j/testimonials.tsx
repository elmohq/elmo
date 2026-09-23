import { CUSTOMER_QUOTES, type CustomerQuote } from "@workspace/ui/brand/customers";
import { SectionHeading } from "./ui";

function Quote({ quote, author, company, companyUrl, mark, large }: CustomerQuote & { large?: boolean }) {
	return (
		<figure className="flex h-full flex-col justify-between border-t-2 border-[#1c1a17] pt-6">
			<blockquote
				className={`text-pretty tracking-[-0.015em] text-[#1c1a17] ${large ? "text-2xl/[1.3] font-medium md:text-[1.75rem]/[1.3]" : "text-lg/[1.55] md:text-xl/[1.55]"}`}
			>
				<span aria-hidden="true" className="-ml-2.5 text-blue-600">
					“
				</span>
				{quote}”
			</blockquote>
			<figcaption className="mt-10 flex items-center justify-between gap-4 border-t border-[#1c1a17]/12 pt-4 text-sm">
				<span className="text-stone-600">
					<span className="font-medium text-[#1c1a17]">{author}</span>, {company}
				</span>
				<a
					href={companyUrl}
					target="_blank"
					rel="noopener noreferrer"
					aria-label={company}
					className="inline-flex items-center rounded-sm text-[#1c1a17] transition-opacity hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600"
				>
					{mark}
				</a>
			</figcaption>
		</figure>
	);
}

export function Testimonials() {
	return (
		<section className="bg-[#efece4]/60">
			<div className="mx-auto max-w-6xl px-4 py-20 md:px-6 lg:py-24">
				<SectionHeading n="§ 03" label="Customers" title="Cost-effective, with maintainers who listen." />
				<div className="mt-12 grid gap-12 md:grid-cols-5 md:gap-10">
					<div className="md:col-span-2">
						<Quote {...CUSTOMER_QUOTES.speakeasy} large />
					</div>
					<div className="md:col-span-3">
						<Quote {...CUSTOMER_QUOTES.tradesites} />
					</div>
				</div>
			</div>
		</section>
	);
}
