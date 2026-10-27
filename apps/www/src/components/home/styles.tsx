import geist400 from "@fontsource/geist-sans/files/geist-sans-latin-400-normal.woff2?url";
import geist500 from "@fontsource/geist-sans/files/geist-sans-latin-500-normal.woff2?url";
import geist600 from "@fontsource/geist-sans/files/geist-sans-latin-600-normal.woff2?url";

/**
 * The global Geist face is one 400 file stretched over every weight, so medium
 * and semibold render as regular. The homepage loads the real weights under its
 * own family name and scopes them to this class, leaving every other page as is.
 * Popovers and dialogs portal out of the page wrapper, so they take the class too.
 */
export const HOME_FONT_CLASS = "home-font";

// The data-headline rules paint the headline test's "Win AI Search" arm before
// hydration, at the hero's short-title size, so the server HTML can keep the
// default H1 without that arm ever flashing it.
//
// Entrance motion only: the static end state is the design, which is what a
// screenshot, a crawler, or a reduced-motion visitor gets.
const css = `
@font-face { font-family: "Geist Home"; font-style: normal; font-weight: 400; font-display: swap; src: url("${geist400}") format("woff2"); }
@font-face { font-family: "Geist Home"; font-style: normal; font-weight: 500; font-display: swap; src: url("${geist500}") format("woff2"); }
@font-face { font-family: "Geist Home"; font-style: normal; font-weight: 600; font-display: swap; src: url("${geist600}") format("woff2"); }
.${HOME_FONT_CLASS} { --font-sans: "Geist Home", ui-sans-serif, system-ui, sans-serif; font-family: var(--font-sans); }
@keyframes home-rise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
@keyframes home-grow { from { transform: scaleX(0); } }
.home-rise { animation: home-rise 700ms cubic-bezier(0.2, 0.7, 0.2, 1) both; animation-delay: var(--d, 0ms); }
.home-grow { transform-origin: left; animation: home-grow 900ms cubic-bezier(0.3, 0.7, 0.2, 1) both; animation-delay: var(--d, 0ms); }
@media (prefers-reduced-motion: reduce) { .home-rise, .home-grow { animation: none; } }
html[data-headline="win-ai-search"] h1[data-headline-pending] > span { display: none; }
html[data-headline="win-ai-search"] h1[data-headline-pending]::before { content: attr(data-headline-pending); }
html[data-headline="win-ai-search"] h1[data-headline-pending] { font-size: 3.5rem; line-height: 0.95; letter-spacing: -0.045em; }
@media (min-width: 40rem) { html[data-headline="win-ai-search"] h1[data-headline-pending] { font-size: 4.5rem; } }
@media (min-width: 64rem) { html[data-headline="win-ai-search"] h1[data-headline-pending] { font-size: 6.5rem; } }
`;

export function HomeStyles() {
	return <style>{css}</style>;
}

/** Staggers an entrance by `ms`, for elements carrying home-rise or home-grow. */
export function delay(ms: number): React.CSSProperties {
	return { "--d": `${ms}ms` } as React.CSSProperties;
}
