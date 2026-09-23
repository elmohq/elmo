import { NewsletterSignup } from "@/components/newsletter-signup";

export function Updates() {
	return (
		<section aria-labelledby="updates" className="border-t border-zinc-200/80 bg-zinc-50/70">
			<div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-12 md:flex-row lg:py-14 md:items-center md:justify-between md:px-6">
				<div>
					<h2 id="updates" className="text-xl font-semibold tracking-[-0.02em] text-zinc-950">
						Get product updates
					</h2>
					<p className="mt-1 text-[15px] text-zinc-600">New features and releases from Elmo, straight to your inbox.</p>
				</div>
				<NewsletterSignup source="homepage-updates" hideLabel className="w-full md:max-w-md" />
			</div>
		</section>
	);
}
