import { Quote } from "lucide-react";
import { SpeakeasyLockup, TradeSitesWordmark } from "./customer-logos";

const TRADESITES_URL = "https://www.tradesites.ai/?ref=elmo";
const SPEAKEASY_URL = "https://www.speakeasy.com/?ref=elmo";

interface TestimonialProps {
	quote: string;
	author: string;
	company: string;
	companyUrl: string;
	logo: React.ReactNode;
}

function Testimonial({ quote, author, company, companyUrl, logo }: TestimonialProps) {
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
							className="inline-flex items-center rounded-sm transition-opacity hover:opacity-80"
						>
							{logo}
						</a>
					</figcaption>
				</figure>
			</div>
		</section>
	);
}

export function SpeakeasyTestimonial() {
	return (
		<Testimonial
			quote="Simple and much more cost effective than Profound."
			author="Nolan"
			company="Speakeasy"
			companyUrl={SPEAKEASY_URL}
			logo={<SpeakeasyLockup className="text-zinc-950" />}
		/>
	);
}

export function TradeSitesTestimonial() {
	return (
		<Testimonial
			quote="We were looking for an affordable way to track our visibility in AI search, and Elmo was a great fit. They were incredibly responsive and quickly added the integration we needed."
			author="James"
			company="TradeSites"
			companyUrl={TRADESITES_URL}
			logo={<TradeSitesWordmark />}
		/>
	);
}
