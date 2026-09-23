import { ArrowUpRight } from "lucide-react";

export const REPO_URL = "https://github.com/elmohq/elmo";

/** Links to a file on main, so "read the code" lands on the exact line of reasoning, not the repo root. */
export function repoFile(path: string) {
	return `${REPO_URL}/blob/main/${path}`;
}

/** Spec-sheet section label: a numbered clause, a name, and a hairline running to the edge. */
export function SpecLabel({
	n,
	children,
	tone = "paper",
	className = "",
}: {
	n: string;
	children: React.ReactNode;
	tone?: "paper" | "ink";
	className?: string;
}) {
	const ink = tone === "ink";
	return (
		<div
			className={`flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.16em] ${ink ? "text-[#b9b3a7]" : "text-stone-600"} ${className}`}
		>
			<span className="tabular-nums text-blue-600">{n}</span>
			<span>{children}</span>
			<span aria-hidden="true" className={`h-px flex-1 ${ink ? "bg-white/12" : "bg-[#1c1a17]/12"}`} />
		</div>
	);
}

export function SectionHeading({
	n,
	label,
	title,
	lede,
}: {
	n: string;
	label: string;
	title: React.ReactNode;
	lede?: React.ReactNode;
}) {
	return (
		<div>
			<SpecLabel n={n}>{label}</SpecLabel>
			<div className="mt-8 grid gap-5 lg:grid-cols-12 lg:items-end lg:gap-12">
				<h2 className="text-[2rem] font-semibold leading-[1.06] tracking-[-0.03em] text-balance text-[#1c1a17] md:text-[2.75rem] lg:col-span-7">
					{title}
				</h2>
				{lede ? (
					<p className="max-w-[52ch] text-pretty text-base/7 text-stone-600 lg:col-span-5 lg:pb-1">{lede}</p>
				) : null}
			</div>
		</div>
	);
}

/** Underlined text link in the page's single accent, for the quiet third-tier actions. */
export function InkLink({
	href,
	children,
	external = true,
	className = "",
}: {
	href: string;
	children: React.ReactNode;
	external?: boolean;
	className?: string;
}) {
	return (
		<a
			href={href}
			{...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
			className={`group inline-flex items-center gap-1 rounded-sm font-medium text-blue-700 underline decoration-blue-600/30 underline-offset-4 transition-colors hover:decoration-blue-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${className}`}
		>
			{children}
			{external ? (
				<ArrowUpRight
					className="size-3.5 shrink-0 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
					aria-hidden="true"
				/>
			) : null}
		</a>
	);
}

/** Hairline browser chrome for the product screenshots; a printed plate, not a floating card. */
export function BrowserFrame({ children, className = "" }: { children: React.ReactNode; className?: string }) {
	return (
		<div className={`overflow-hidden rounded-lg bg-white ring-1 ring-[#1c1a17]/15 ${className}`}>
			<div className="flex h-8 items-center gap-1.5 border-b border-[#1c1a17]/10 bg-[#fbfaf7] px-3" aria-hidden="true">
				<span className="size-2 rounded-full bg-stone-300" />
				<span className="size-2 rounded-full bg-stone-300" />
				<span className="size-2 rounded-full bg-stone-300" />
			</div>
			{children}
		</div>
	);
}
