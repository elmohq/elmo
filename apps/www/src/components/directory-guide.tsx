import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { type Competitor, getComparisonSlug } from "@/lib/competitors";
import type { DirectoryGuide, GuideSection } from "@/lib/directory-guides";
import { externalRel } from "@/lib/external-link";

const LINK = "font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900";
const MARKDOWN_LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g;

export function RichText({ text }: { text: string }) {
	const parts: ReactNode[] = [];
	let last = 0;
	for (const match of text.matchAll(MARKDOWN_LINK)) {
		const [whole, label, href] = match;
		const start = match.index ?? 0;
		if (start > last) parts.push(text.slice(last, start));
		parts.push(
			href.startsWith("/") ? (
				<a key={start} className={LINK} href={href}>
					{label}
				</a>
			) : (
				<a key={start} className={LINK} href={href} target="_blank" rel={`nofollow ${externalRel(href)}`}>
					{label}
				</a>
			),
		);
		last = start + whole.length;
	}
	if (last < text.length) parts.push(text.slice(last));
	return <>{parts}</>;
}

function Section({ section, tinted }: { section: GuideSection; tinted: boolean }) {
	return (
		<section className={`border-b border-zinc-200 py-12 lg:py-16 ${tinted ? "bg-zinc-50" : "bg-white"}`}>
			<div className="mx-auto max-w-6xl px-4 md:px-6">
				<div className="max-w-3xl">
					<h2 className="font-heading text-2xl text-zinc-950 md:text-3xl">{section.heading}</h2>
					<div className="mt-6 space-y-5 text-[1.0625rem] leading-relaxed text-zinc-600">
						{section.paragraphs.map((paragraph) => (
							<p key={paragraph}>
								<RichText text={paragraph} />
							</p>
						))}
					</div>
				</div>
				{section.items?.length ? (
					<div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
						{section.items.map((item) => (
							<div key={item.title} className="rounded-md border border-zinc-200 bg-white p-5">
								<h3 className="font-semibold text-zinc-950">{item.title}</h3>
								<p className="mt-2 text-sm leading-relaxed text-zinc-600">
									<RichText text={item.body} />
								</p>
							</div>
						))}
					</div>
				) : null}
				{section.table ? (
					<div className="mt-8 overflow-x-auto rounded-md border border-zinc-200 bg-white">
						<table className="w-full text-left text-sm">
							<thead className="border-b border-zinc-200 bg-zinc-50 text-zinc-950">
								<tr>
									{section.table.columns.map((column) => (
										<th key={column} scope="col" className="px-4 py-3 font-semibold">
											{column}
										</th>
									))}
								</tr>
							</thead>
							<tbody className="divide-y divide-zinc-200 text-zinc-600">
								{section.table.rows.map((row) => (
									<tr key={row.join("|")}>
										{row.map((cell, i) => (
											<td key={section.table?.columns[i]} className="px-4 py-3 align-top">
												<RichText text={cell} />
											</td>
										))}
									</tr>
								))}
							</tbody>
						</table>
					</div>
				) : null}
			</div>
		</section>
	);
}

export function GuideSections({ guide }: { guide: DirectoryGuide }) {
	return (
		<>
			{guide.sections.map((section, i) => (
				<Section key={section.heading} section={section} tinted={i % 2 === 0} />
			))}
		</>
	);
}

export function GuidePicks({ guide, tools }: { guide: DirectoryGuide; tools: Competitor[] }) {
	const bySlug = new Map(tools.map((tool) => [tool.slug, tool]));
	const picks = (guide.picks ?? []).flatMap((pick) => {
		const tool = bySlug.get(pick.slug);
		return tool ? [{ tool, reason: pick.reason }] : [];
	});
	if (picks.length === 0) return null;
	return (
		<section className="border-b border-zinc-200 bg-white py-12 lg:py-16">
			<div className="mx-auto max-w-6xl px-4 md:px-6">
				<h2 className="font-heading text-2xl text-zinc-950 md:text-3xl">{guide.picksTitle ?? "Top Picks"}</h2>
				<ol className="mt-8 divide-y divide-zinc-200 border-t border-zinc-200">
					{picks.map(({ tool, reason }, i) => (
						<li key={tool.slug} className="flex gap-4 py-5">
							<span className="font-mono text-sm text-zinc-400">{String(i + 1).padStart(2, "0")}</span>
							<div className="max-w-3xl">
								<h3 className="font-semibold text-zinc-950">{tool.name}</h3>
								<p className="mt-1 leading-relaxed text-zinc-600">
									<RichText text={reason} />
								</p>
								<Link
									to="/ai-visibility-tools/$slug"
									params={{ slug: getComparisonSlug(tool) }}
									className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900"
								>
									Compare {tool.name} with Elmo
									<ArrowRight className="h-3.5 w-3.5" />
								</Link>
							</div>
						</li>
					))}
				</ol>
			</div>
		</section>
	);
}
