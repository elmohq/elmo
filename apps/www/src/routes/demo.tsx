import { createFileRoute } from "@tanstack/react-router";
import { trackAdConversion } from "@workspace/ui/lib/ad-tags";
import { useEffect, useRef } from "react";
import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";
import { embedInlineBooking } from "@/lib/cal-embed";
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
	const booker = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!booker.current) return;
		embedInlineBooking({
			element: booker.current,
			calLink: "jrhizor/elmo",
			// So bookings stay attributed to where the visitor clicked through from.
			params: ref ? { ref } : undefined,
			onBooked: (uid) => trackAdConversion("demo_booked", { id: uid }),
		});
	}, [ref]);

	return (
		<div className="min-h-screen">
			<Navbar />
			<main className="mx-auto max-w-6xl px-4 py-12 md:px-6 lg:py-20">
				<header className="mb-10 space-y-4">
					<p className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">/ DEMO</p>
					<h1 className="font-heading text-4xl text-zinc-950 lg:text-5xl">Book a demo</h1>
					<p className="max-w-2xl text-lg text-balance text-zinc-600">
						30 minutes on your own brand's data: where AI answer engines mention you, what they cite, and how they
						describe you next to your competitors.
					</p>
				</header>
				<div ref={booker} className="min-h-[640px] w-full overflow-auto" />
			</main>
			<Footer />
		</div>
	);
}
