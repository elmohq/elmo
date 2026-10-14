import { createFileRoute } from "@tanstack/react-router";
import { BookingPage } from "@/components/booking-page";
import { canonicalUrl } from "@/lib/seo";

const title = "Book an off-site AEO call · Elmo";
const description = "Book a call to map your AEO gaps and plan placements on the sites AI answer engines cite.";

export const Route = createFileRoute("/off-site-aeo_/book")({
	validateSearch: (search: Record<string, unknown>): { plan?: string } =>
		typeof search.plan === "string" && search.plan ? { plan: search.plan } : {},
	head: () => ({
		meta: [{ title }, { name: "description", content: description }, { name: "robots", content: "noindex, follow" }],
		links: [{ rel: "canonical", href: canonicalUrl("/off-site-aeo/book") }],
	}),
	component: OffSiteAeoBookPage,
});

function OffSiteAeoBookPage() {
	const { plan } = Route.useSearch();
	return (
		<BookingPage
			eyebrow="/ OFF-SITE AEO"
			heading="Book a call"
			intro="We'll map where you're invisible in AI answers today and plan the placements that fix it."
			calLink="jrhizor/elmo-aeo"
			// Prefills the booking's "plan" question so each call arrives pre-qualified.
			params={plan ? { plan } : undefined}
		/>
	);
}
