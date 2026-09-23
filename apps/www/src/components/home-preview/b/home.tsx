import geist400 from "@fontsource/geist-sans/files/geist-sans-latin-400-normal.woff2?url";
import geist500 from "@fontsource/geist-sans/files/geist-sans-latin-500-normal.woff2?url";
import geist600 from "@fontsource/geist-sans/files/geist-sans-latin-600-normal.woff2?url";
import geist700 from "@fontsource/geist-sans/files/geist-sans-latin-700-normal.woff2?url";
import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";
import { HOME_FAQS } from "@/lib/faqs";
import { CommunityB, CtaB, FaqB } from "./closing";
import { FeaturesB } from "./features";
import { HeroB } from "./hero";
import { ModelsBand } from "./models";
import { PricingB } from "./pricing";
import { TestimonialsB } from "./testimonials";

const face = (weight: number, src: string) =>
	`@font-face{font-family:"Geist B";font-style:normal;font-weight:${weight};font-display:swap;src:url("${src}") format("woff2");}`;

// styles.css ships only the 400 Geist file, so real 500–700 weights are
// declared here under their own family and scoped to this page.
const PAGE_CSS = `
${face(400, geist400)}
${face(500, geist500)}
${face(600, geist600)}
${face(700, geist700)}
.home-b{font-family:"Geist B",var(--font-geist-sans);}
@keyframes hb-marquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}
.hb-marquee-track{animation:hb-marquee 45s linear infinite;}
.hb-marquee:hover .hb-marquee-track{animation-play-state:paused;}
@media (prefers-reduced-motion: reduce){
.hb-marquee{mask-image:none!important;}
.hb-marquee-track{animation:none;flex-wrap:wrap;justify-content:center;width:100%;padding:0 1.25rem;}
.hb-marquee-track>ul{flex-wrap:wrap;justify-content:center;row-gap:.75rem;}
.hb-marquee-dup{display:none!important;}
.home-b *{transition:none!important;}
}
`;

export function HomeVariantB() {
	return (
		<div className="home-b min-h-screen bg-[#faf9f6] text-zinc-950 [&_header]:bg-[#faf9f6]/85">
			<style>{PAGE_CSS}</style>
			<Navbar />
			<main>
				<HeroB />
				<ModelsBand />
				<FeaturesB />
				<TestimonialsB />
				<PricingB />
				<CommunityB />
				<FaqB items={HOME_FAQS} />
				<CtaB />
			</main>
			<Footer />
		</div>
	);
}
