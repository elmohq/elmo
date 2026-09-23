import geist400 from "@fontsource/geist-sans/files/geist-sans-latin-400-normal.woff2?url";
import geist500 from "@fontsource/geist-sans/files/geist-sans-latin-500-normal.woff2?url";
import geist600 from "@fontsource/geist-sans/files/geist-sans-latin-600-normal.woff2?url";
import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";
import { HOME_FAQS } from "@/lib/faqs";
import { Closing } from "./closing";
import { Faq } from "./faq";
import { Features } from "./features";
import { Hero } from "./hero";
import { LogoStrip } from "./logos";
import { ModelCoverage } from "./models";
import { Pricing } from "./pricing";
import { Testimonials } from "./testimonials";

// The global Geist face is a single 400 file stretched over every weight, so
// medium and semibold look regular. This page loads the real weights under
// its own family name and scopes them to the wrapper.
const fontCss = `
@font-face { font-family: "Geist A"; font-style: normal; font-weight: 400; font-display: swap; src: url("${geist400}") format("woff2"); }
@font-face { font-family: "Geist A"; font-style: normal; font-weight: 500; font-display: swap; src: url("${geist500}") format("woff2"); }
@font-face { font-family: "Geist A"; font-style: normal; font-weight: 600; font-display: swap; src: url("${geist600}") format("woff2"); }
.home-a { --font-sans: "Geist A", ui-sans-serif, system-ui, sans-serif; font-family: var(--font-sans); }
`;

export function HomeVariantG() {
	return (
		<div className="home-a min-h-screen bg-white antialiased">
			<style>{fontCss}</style>
			<Navbar />
			<main>
				<Hero />
				<LogoStrip />
				<ModelCoverage />
				<Features />
				<Testimonials />
				<Pricing />
				<Faq items={HOME_FAQS} />
				<Closing />
			</main>
			<Footer />
		</div>
	);
}
