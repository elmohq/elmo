import { createFileRoute } from "@tanstack/react-router";
import { BookingPage } from "@/components/booking-page";
import { canonicalUrl, ogMeta } from "@/lib/seo";

const title = "Book a demo · Elmo";
const description =
	"Book a 30-minute walkthrough of Elmo on your own brand's data: how AI answer engines mention, cite, and describe you.";

export const Route = createFileRoute("/demo")({
	validateSearch: (search: Record<string, unknown>): { ref?: string } =>
		typeof search.ref === "string" ? { ref: search.ref } : {},
	head: () => ({
		meta: [{ title }, { name: "description", content: description }, ...ogMeta({ title, description, path: "/demo" })],
		links: [{ rel: "canonical", href: canonicalUrl("/demo") }],
	}),
	component: DemoPage,
});

function DemoPage() {
	const { ref } = Route.useSearch();
	return (
		<BookingPage
			eyebrow="/ DEMO"
			heading="Book a demo"
			intro="30 minutes on your own brand's data: where AI answer engines mention you, what they cite, and how they describe you next to your competitors."
			calLink="jrhizor/elmo"
			// So bookings stay attributed to where the visitor clicked through from.
			params={ref ? { ref } : undefined}
		/>
	);
}
