import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";
import { formatPostDate } from "@/lib/format";
import type { LegalPageSummary } from "@/lib/legal";
import { breadcrumbJsonLd, canonicalUrl, ogMeta } from "@/lib/seo";

const title = "Legal · Elmo";
const description =
	"Elmo's terms of service, privacy policy, cookie policy, subprocessor list, and acceptable use policy — all versioned in public.";

const getLegalPages = createServerFn({ method: "GET" }).handler(async (): Promise<LegalPageSummary[]> => {
	const { listLegalPages } = await import("@/lib/legal");
	return listLegalPages();
});

export const Route = createFileRoute("/legal/")({
	head: () => ({
		meta: [{ title }, { name: "description", content: description }, ...ogMeta({ title, description, path: "/legal" })],
		links: [{ rel: "canonical", href: canonicalUrl("/legal") }],
		scripts: [
			breadcrumbJsonLd([
				{ name: "Home", path: "/" },
				{ name: "Legal", path: "/legal" },
			]),
		],
	}),
	loader: async () => ({ pages: await getLegalPages() }),
	component: LegalIndex,
});

function LegalIndex() {
	const { pages } = Route.useLoaderData();

	return (
		<div className="min-h-screen">
			<Navbar />
			<main>
				<section className="border-b border-zinc-200 bg-white py-12 lg:py-20">
					<div className="mx-auto max-w-6xl px-4 md:px-6">
						<p className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">/ Legal</p>
						<h1 className="font-heading mt-2 text-4xl text-balance text-zinc-950 md:text-5xl">
							The fine print, in public
						</h1>
						<p className="mt-4 max-w-3xl text-lg text-balance text-zinc-600">
							These policies cover Elmo Cloud and our websites. They live in the same repository as the product, so
							every revision is a diff you can read.
						</p>
					</div>
				</section>

				<section className="bg-white py-10 lg:py-14">
					<div className="mx-auto max-w-6xl px-4 md:px-6">
						<dl className="grid gap-5 md:grid-cols-2">
							{pages.map((page) => (
								<div key={page.slug} className="rounded-md border border-zinc-200 bg-white p-5">
									<dt>
										<a href={`/legal/${page.slug}`} className="font-semibold text-zinc-950 hover:text-blue-700">
											{page.title}
										</a>
									</dt>
									<dd className="mt-1.5 text-sm leading-relaxed text-zinc-600">{page.description}</dd>
									<dd className="mt-3 font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-400">
										Updated {formatPostDate(page.updated)}
									</dd>
								</div>
							))}
						</dl>
						<p className="mt-8 max-w-3xl text-sm text-zinc-600">
							Running Elmo yourself instead? None of this applies — the{" "}
							<a href="https://github.com/elmohq/elmo" className="text-zinc-950 underline hover:text-blue-700">
								source
							</a>{" "}
							is MIT-licensed and your instance is yours.
						</p>
					</div>
				</section>
			</main>
			<Footer />
		</div>
	);
}
