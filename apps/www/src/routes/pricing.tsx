import { createFileRoute } from "@tanstack/react-router";
import { Navbar } from "@/components/navbar";
import { Pricing } from "@/components/pricing";
import { CTA } from "@/components/cta";
import { Footer } from "@/components/footer";
import { ogMeta, canonicalUrl, breadcrumbJsonLd } from "@/lib/seo";

const title = "Pricing — Elmo";
const description =
	"Elmo is free and open source to self-host. Managed cloud hosting coming soon. White-label available for agencies.";

export const Route = createFileRoute("/pricing")({
	head: () => ({
		meta: [
			{ title },
			{ name: "description", content: description },
			...ogMeta({ title, description, path: "/pricing" }),
		],
		links: [{ rel: "canonical", href: canonicalUrl("/pricing") }],
		scripts: [
			breadcrumbJsonLd([
				{ name: "Home", path: "/" },
				{ name: "Pricing", path: "/pricing" },
			]),
		],
	}),
	component: PricingPage,
});

function PricingPage() {
	return (
		<div className="min-h-screen">
			<Navbar />
			<main>
				<Pricing />
				<CTA />
			</main>
			<Footer />
		</div>
	);
}
