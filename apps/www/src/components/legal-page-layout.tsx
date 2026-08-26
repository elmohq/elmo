// Mirrors blog-post-layout.tsx: the heavy fumadocs-ui / browser-collection
// imports live here, NOT in the route file, so @tanstack/router-plugin can
// split them into the legal chunk instead of shipping them everywhere.

import browserCollections from "collections/browser";
import { RootProvider } from "fumadocs-ui/provider/tanstack";
import { Suspense } from "react";
import { Footer } from "@/components/footer";
import { getMDXComponents } from "@/components/mdx";
import { Navbar } from "@/components/navbar";
import { formatPostDate } from "@/lib/format";
import type { LegalPageSummary } from "@/lib/legal";
import type { LegalLoaderData } from "@/routes/legal/$";

const mdxComponents = getMDXComponents();

export const clientLoader = browserCollections.legal.createClientLoader({
	component({ default: MDX }, _props: undefined) {
		return <MDX components={mdxComponents} />;
	},
});

function SiblingPolicies({ pages, currentSlug }: { pages: LegalPageSummary[]; currentSlug: string }) {
	const others = pages.filter((page) => page.slug !== currentSlug);
	if (others.length === 0) return null;

	return (
		<nav aria-label="Other policies" className="not-prose mt-16 border-t border-zinc-200 pt-8">
			<h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">Other policies</h2>
			<ul role="list" className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
				{others.map((page) => (
					<li key={page.slug}>
						<a href={`/legal/${page.slug}`} className="text-zinc-700 hover:text-zinc-950 hover:underline">
							{page.title}
						</a>
					</li>
				))}
			</ul>
		</nav>
	);
}

export function LegalPageLayout({ data }: { data: LegalLoaderData }) {
	return (
		<RootProvider theme={{ defaultTheme: "light", forcedTheme: "light" }} search={{ enabled: false }}>
			<div className="min-h-screen">
				<Navbar />
				<main className="mx-auto max-w-3xl px-4 py-12 md:px-6 lg:py-16">
					<a
						href="/legal"
						className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500 hover:text-zinc-950"
					>
						/ LEGAL
					</a>
					<article className="prose prose-zinc mt-6 max-w-none">
						<h1 className="mb-3 text-balance">{data.title}</h1>
						<p className="not-prose font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">
							Last updated {formatPostDate(data.updated)}
						</p>
						<div className="mt-8">
							<Suspense>{clientLoader.useContent(data.path)}</Suspense>
						</div>
						<SiblingPolicies pages={data.pages} currentSlug={data.slugs.join("/")} />
					</article>
				</main>
				<Footer />
			</div>
		</RootProvider>
	);
}
