import geistSans400 from "@fontsource/geist-sans/files/geist-sans-latin-400-normal.woff2?url";
import geistSans500 from "@fontsource/geist-sans/files/geist-sans-latin-500-normal.woff2?url";
import geistSans600 from "@fontsource/geist-sans/files/geist-sans-latin-600-normal.woff2?url";
import { HOME_FAQS } from "@/lib/faqs";
import { Features } from "./features";
import { Footer } from "./footer";
import { Hero } from "./hero";
import { Navbar } from "./navbar";
import { Pricing } from "./pricing";
import { ClosingCTA, CustomerLogos, Faq, ModelCoverage, OpenSource, Testimonials } from "./sections";

// The site-wide Geist face is a single 400 file stretched across every weight.
// This page leans on weight for hierarchy on black, so it loads real 500/600
// cuts under its own family name and scopes them to this wrapper.
const FONT_CSS = `
@font-face { font-family: "Geist C"; font-weight: 400; font-display: swap; src: url("${geistSans400}") format("woff2"); }
@font-face { font-family: "Geist C"; font-weight: 500; font-display: swap; src: url("${geistSans500}") format("woff2"); }
@font-face { font-family: "Geist C"; font-weight: 600 700; font-display: swap; src: url("${geistSans600}") format("woff2"); }
.home-c { font-family: "Geist C", var(--font-geist-sans); color-scheme: dark; }
.home-c ::selection { background: rgb(37 99 235 / 0.45); color: white; }
`;

export function HomeVariantC() {
	return (
		<div className="home-c min-h-screen bg-zinc-950 text-zinc-300 antialiased">
			<style>{FONT_CSS}</style>
			<Navbar />
			<main>
				<Hero />
				<CustomerLogos />
				<ModelCoverage />
				<Features />
				<Testimonials />
				<OpenSource />
				<Pricing />
				<Faq items={HOME_FAQS} />
				<ClosingCTA />
			</main>
			<Footer />
		</div>
	);
}
