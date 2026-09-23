export function Eyebrow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
	return <p className={`text-sm font-medium text-blue-600 ${className}`}>{children}</p>;
}

export function SectionHeading({
	eyebrow,
	title,
	lede,
	align = "left",
	as: Heading = "h2",
}: {
	eyebrow: string;
	title: React.ReactNode;
	lede?: React.ReactNode;
	align?: "left" | "center";
	as?: "h2" | "h3";
}) {
	const centered = align === "center";
	return (
		<div className={centered ? "mx-auto max-w-3xl text-center" : "max-w-2xl"}>
			<Eyebrow>{eyebrow}</Eyebrow>
			<Heading className="mt-3 text-[2rem] font-semibold leading-[1.1] tracking-[-0.03em] text-balance text-zinc-950 md:text-[2.75rem]">
				{title}
			</Heading>
			{lede ? (
				<p
					className={`mt-4 text-pretty text-base/7 text-zinc-600 md:text-lg/8 ${centered ? "mx-auto max-w-[54ch]" : "max-w-[56ch]"}`}
				>
					{lede}
				</p>
			) : null}
		</div>
	);
}

/** The frame every card on the page shares, so surfaces read as one system. */
export const CARD =
	"rounded-2xl bg-white shadow-[0_0_0_1px_rgb(24_24_27/0.07),0_1px_2px_rgb(24_24_27/0.04),0_16px_40px_-24px_rgb(24_24_27/0.16)]";

/** Marks sample data as sample data, wherever an illustration invents a brand. */
export function ExampleTag({ children }: { children: React.ReactNode }) {
	return (
		<p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-zinc-500">
			<span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-amber-700 ring-1 ring-amber-200/80">
				Example
			</span>
			{children}
		</p>
	);
}

/** Browser chrome around product screenshots, so they read as the real app rather than a picture. */
export function BrowserFrame({ children, className = "" }: { children: React.ReactNode; className?: string }) {
	return (
		<div
			className={`overflow-hidden rounded-xl bg-white shadow-[0_0_0_1px_rgb(24_24_27/0.08),0_2px_4px_rgb(24_24_27/0.04),0_24px_48px_-16px_rgb(37_99_235/0.16)] ${className}`}
		>
			<div
				aria-hidden="true"
				className="flex h-8 items-center gap-1.5 border-b border-zinc-200/80 bg-zinc-50/80 px-3.5"
			>
				<span className="size-2.5 rounded-full bg-zinc-300" />
				<span className="size-2.5 rounded-full bg-zinc-300" />
				<span className="size-2.5 rounded-full bg-zinc-300" />
			</div>
			{children}
		</div>
	);
}
