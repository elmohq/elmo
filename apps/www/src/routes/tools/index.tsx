import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Footer } from "@/components/footer";
import { Closing } from "@/components/home/closing";
import { HOME_FONT_CLASS, HomeStyles } from "@/components/home/styles";
import { CARD } from "@/components/home/ui";
import { Navbar } from "@/components/navbar";
import { breadcrumbJsonLd, canonicalUrl, itemListJsonLd, ogMeta } from "@/lib/seo";

const title = "Free AEO & AI Visibility Tools · Elmo";
const description =
	"Free tools from Elmo for answer engine optimization: check whether ChatGPT recommends your brand, see who it recommends instead, and audit AI crawler access.";

const TOOLS = [
	{
		path: "/tools/ai-visibility-checker",
		name: "AI Visibility Checker",
		description:
			"Get a free AI visibility score: whether ChatGPT names your brand for real buyer questions, who it recommends instead, which sources it cites, and whether AI crawlers can reach your site.",
	},
];

export const Route = createFileRoute("/tools/")({
	head: () => ({
		meta: [
			{ title },
			{ name: "description", content: description },
			...ogMeta({ title, description, path: "/tools", label: "Free tools" }),
		],
		links: [{ rel: "canonical", href: canonicalUrl("/tools") }],
		scripts: [
			breadcrumbJsonLd([
				{ name: "Home", path: "/" },
				{ name: "Free tools", path: "/tools" },
			]),
			itemListJsonLd(TOOLS.map((tool) => ({ name: tool.name, path: tool.path, description: tool.description }))),
		],
	}),
	component: ToolsPage,
});

function ToolsPage() {
	return (
		<div className={`${HOME_FONT_CLASS} min-h-screen`}>
			<HomeStyles />
			<Navbar />
			<main>
				<section className="border-b border-zinc-200 bg-white">
					<div className="mx-auto max-w-6xl px-4 py-16 md:px-6 lg:py-24">
						<h1 className="max-w-[20ch] text-[2.5rem] font-semibold leading-[1.05] tracking-[-0.03em] text-balance text-zinc-950 sm:text-6xl">
							Free AI visibility tools
						</h1>
						<p className="mt-5 max-w-[60ch] text-pretty text-base/7 text-zinc-600 md:text-lg/8">
							Quick, free checks for answer engine optimization. No signup. When you want the full picture every day,
							Elmo is open source to self-host, or managed in Elmo Cloud.
						</p>
						<ul className="mt-12 grid gap-6 md:grid-cols-2">
							{TOOLS.map((tool) => (
								<li key={tool.path}>
									<Link to={tool.path} className={`${CARD} group block p-6 transition-shadow hover:shadow-lg`}>
										<h2 className="text-xl font-semibold tracking-tight text-zinc-950">{tool.name}</h2>
										<p className="mt-2 text-pretty text-sm/6 text-zinc-600">{tool.description}</p>
										<span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-blue-700">
											Run a free check
											<ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
										</span>
									</Link>
								</li>
							))}
						</ul>
					</div>
				</section>
				<Closing from="marketing-checker" />
			</main>
			<Footer />
		</div>
	);
}
