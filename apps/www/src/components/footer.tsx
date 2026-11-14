import { Link } from "@tanstack/react-router";
import { openCookiePreferences } from "@workspace/ui/lib/cookie-consent";
import { cn } from "@workspace/ui/lib/utils";
import { ArrowUpRight } from "lucide-react";
import { externalRel } from "@/lib/external-link";
import { NewsletterSignup } from "./newsletter-signup";

// externalRel keeps the Referer for this owned domain; `ref` preserves
// attribution when an intermediary strips that header.
const BLUEWHALE_URL = "https://bluewhale.dev?ref=elmo";

type FooterLink = { label: string; href: string; external?: boolean };

const legalLinks = [
	{ label: "Terms", href: "/legal/terms" },
	{ label: "Privacy", href: "/legal/privacy" },
	{ label: "Cookies", href: "/legal/cookies" },
	{ label: "Subprocessors", href: "/legal/subprocessors" },
	{ label: "Acceptable Use", href: "/legal/acceptable-use" },
];

const cols: { heading: string; links: FooterLink[] }[] = [
	{
		heading: "Product",
		links: [
			{ label: "Features", href: "/features" },
			{ label: "Pricing", href: "/pricing" },
			{ label: "Off-Site AEO", href: "/off-site-aeo" },
			{ label: "Changelog", href: "/changelog" },
			{ label: "Roadmap", href: "/roadmap" },
		],
	},
	{
		heading: "Resources",
		links: [
			{ label: "Blog", href: "/blog" },
			{ label: "Documentation", href: "/docs" },
			{ label: "Support", href: "/support" },
			{ label: "API Reference", href: "/docs/api" },
			{ label: "Elmo Cloud Status", href: "https://status.elmohq.com/", external: true },
			{ label: "Provider Status", href: "/status" },
			{ label: "Issues", href: "https://github.com/elmohq/elmo/issues", external: true },
		],
	},
	{
		heading: "Learn",
		links: [
			{ label: "What is AEO?", href: "/answer-engine-optimization" },
			{ label: "What is GEO?", href: "/generative-engine-optimization" },
			{ label: "AEO Glossary", href: "/glossary" },
			{ label: "AI Search Guides", href: "/ai-search" },
			{ label: "AI Search Statistics", href: "/statistics" },
			{ label: "AEO by Industry", href: "/aeo-for" },
		],
	},
	{
		heading: "Tools",
		links: [
			{ label: "Tool Directory", href: "/ai-visibility-tools" },
			{ label: "Free & Open-Source Tools", href: "/ai-visibility-tools/category/open-source" },
			{ label: "Compare Tools", href: "/ai-visibility-tools/compare" },
			{ label: "Tool Alternatives", href: "/ai-visibility-tools/alternatives" },
		],
	},
	{
		heading: "Company",
		links: [
			{ label: "About", href: "/about" },
			{ label: "Vision", href: "/vision" },
			{ label: "Brand Assets", href: "/brand" },
			{ label: "Merch", href: "https://shop.elmohq.com", external: true },
			{ label: "llms.txt", href: "/llms.txt" },
		],
	},
];

export function Footer() {
	return (
		<footer className="relative overflow-hidden border-t border-zinc-200/80 bg-white">
			<div className="mx-auto max-w-6xl px-4 pt-16 md:px-6">
				<div className="relative overflow-hidden rounded-2xl bg-zinc-50/80 ring-1 ring-zinc-200/80">
					<div
						aria-hidden="true"
						className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,rgb(0_0_0/0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgb(0_0_0/0.04)_1px,transparent_1px)] [background-size:48px_48px]"
					/>
					<div className="relative flex flex-col gap-6 p-8 md:flex-row md:items-center md:justify-between md:p-10">
						<div>
							<h2 className="text-xl font-semibold tracking-[-0.02em] text-zinc-950">Get product updates</h2>
							<p className="mt-1 text-[15px] text-zinc-600">
								New features and releases from Elmo, straight to your inbox.
							</p>
						</div>
						<NewsletterSignup source="footer" hideLabel className="w-full md:max-w-md" />
					</div>
				</div>

				<div className="grid grid-cols-2 gap-10 pt-16 pb-12 sm:grid-cols-3 lg:grid-cols-5">
					{cols.map((col) => (
						<div key={col.heading}>
							<h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">{col.heading}</h3>
							<ul className="mt-4 space-y-3 text-sm">
								{col.links.map((link) => (
									<li key={link.href}>
										<a
											href={link.href}
											target={link.external ? "_blank" : undefined}
											rel={link.external ? externalRel(link.href) : undefined}
											className="group inline-flex items-center gap-1 text-zinc-600 transition-colors hover:text-blue-600"
										>
											{link.label}
											{link.external ? (
												<ArrowUpRight
													className="size-3 opacity-50 transition group-hover:-translate-y-px group-hover:translate-x-px group-hover:opacity-100"
													aria-hidden="true"
												/>
											) : null}
										</a>
									</li>
								))}
							</ul>
						</div>
					))}
				</div>

				<div className="flex flex-col gap-4 pb-8 sm:flex-row sm:items-center sm:justify-between">
					<a
						href="https://github.com/elmohq/elmo"
						target="_blank"
						rel="noopener noreferrer"
						className="group inline-flex h-7 w-fit items-center gap-1.5 whitespace-nowrap rounded-full text-xs bg-white pl-1 pr-2.5 text-zinc-500 shadow-sm ring-1 ring-zinc-200 transition hover:text-zinc-950 hover:ring-zinc-300"
					>
						<span className="inline-flex h-5 items-center gap-1.5 rounded-full bg-zinc-100 px-2 font-mono text-[11px] text-zinc-700">
							<span className="size-1.5 rounded-full bg-emerald-500" />v{__APP_VERSION__}
						</span>
						Open Source
						<span className="sr-only"> on GitHub</span>
						<ArrowUpRight
							className="size-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
							aria-hidden="true"
						/>
					</a>
					<SocialLinks className="gap-4 text-zinc-400" linkClassName="transition-colors hover:text-zinc-950" />
				</div>

				<div className="flex flex-col gap-3 border-t border-zinc-200/80 py-6 text-xs text-zinc-500 md:flex-row md:items-center md:justify-between md:gap-6">
					<p className="whitespace-nowrap font-mono text-[11px]">
						&copy; {new Date().getFullYear()}{" "}
						<a
							href={BLUEWHALE_URL}
							target="_blank"
							rel={externalRel(BLUEWHALE_URL)}
							className="hover:text-zinc-950 hover:underline"
						>
							Blue Whale Software, LLC
						</a>
					</p>
					<nav aria-label="Legal" className="flex flex-wrap items-center gap-x-4 gap-y-2">
						{legalLinks.map((link) => (
							<a key={link.href} href={link.href} className="hover:text-zinc-950">
								{link.label}
							</a>
						))}
						<button type="button" onClick={openCookiePreferences} className="hover:text-zinc-950">
							Cookie Preferences
						</button>
					</nav>
				</div>
			</div>
			{/* Deliberately oversized and cropped by the page edge. */}
			<Link
				to="/"
				className="-mb-[0.14em] block translate-y-[0.1em] select-none text-center font-titan-one text-[clamp(7rem,30vw,24rem)] lowercase leading-[0.8] tracking-[-0.02em] text-blue-600"
			>
				elmo
			</Link>
		</footer>
	);
}

function SocialLinks({
	className,
	linkClassName = "hover:text-zinc-900",
}: {
	className?: string;
	linkClassName?: string;
}) {
	return (
		<div className={cn("flex items-center gap-3", className)}>
			<a href="https://x.com/tryelmo" target="_blank" rel="noopener noreferrer" className={linkClassName}>
				<span className="sr-only">Twitter / X</span>
				<svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 fill-current">
					<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
				</svg>
			</a>
			<a href="https://linkedin.com/company/elmohq" target="_blank" rel="noopener noreferrer" className={linkClassName}>
				<span className="sr-only">LinkedIn</span>
				<svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 fill-current">
					<path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
				</svg>
			</a>
			<a href="https://discord.gg/s24nubCtKz" target="_blank" rel="noopener noreferrer" className={linkClassName}>
				<span className="sr-only">Discord</span>
				<svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 fill-current">
					<path d="M20.317 4.3698a19.7913 19.7913 0 0 0-4.8851-1.5152.0741.0741 0 0 0-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 0 0-.0785-.037 19.7363 19.7363 0 0 0-4.8852 1.515.0699.0699 0 0 0-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 0 0 .0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 0 0 .0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 0 0-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 0 1-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 0 1 .0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 0 1 .0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 0 1-.0066.1276 12.2986 12.2986 0 0 1-1.873.8914.0766.0766 0 0 0-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 0 0 .0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 0 0 .0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 0 0-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z" />
				</svg>
			</a>
			<a href="https://github.com/elmohq/elmo" target="_blank" rel="noopener noreferrer" className={linkClassName}>
				<span className="sr-only">GitHub</span>
				<svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 fill-current">
					<path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
				</svg>
			</a>
			<span aria-hidden="true" className="h-4 w-px bg-zinc-200" />
			<a href="https://www.youtube.com/@TryElmo" target="_blank" rel="noopener noreferrer" className={linkClassName}>
				<span className="sr-only">YouTube</span>
				<svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 fill-current">
					<path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
				</svg>
			</a>
			<a href="https://www.tiktok.com/@elmohq" target="_blank" rel="noopener noreferrer" className={linkClassName}>
				<span className="sr-only">TikTok</span>
				<svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 fill-current">
					<path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
				</svg>
			</a>
			<a href="https://www.instagram.com/tryelmo" target="_blank" rel="noopener noreferrer" className={linkClassName}>
				<span className="sr-only">Instagram</span>
				<svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 fill-current">
					<path d="M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077" />
				</svg>
			</a>
			<a href="https://www.facebook.com/tryelmo" target="_blank" rel="noopener noreferrer" className={linkClassName}>
				<span className="sr-only">Facebook</span>
				<svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 fill-current">
					<path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z" />
				</svg>
			</a>
		</div>
	);
}
