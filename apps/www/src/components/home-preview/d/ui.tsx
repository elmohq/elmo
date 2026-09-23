export function Eyebrow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
	return (
		<p className={`font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500 ${className}`}>
			<span className="text-blue-600">/</span> {children}
		</p>
	);
}

export function SectionHeading({
	eyebrow,
	title,
	lede,
	align = "left",
}: {
	eyebrow: string;
	title: React.ReactNode;
	lede?: React.ReactNode;
	align?: "left" | "center";
}) {
	const centered = align === "center";
	return (
		<div className={centered ? "mx-auto max-w-3xl text-center" : "max-w-2xl"}>
			<Eyebrow>{eyebrow}</Eyebrow>
			<h2 className="mt-4 text-[2rem] font-semibold leading-[1.1] tracking-[-0.025em] text-balance text-zinc-950 md:text-[2.75rem]">
				{title}
			</h2>
			{lede ? (
				<p
					className={`mt-4 text-pretty text-base/7 text-zinc-600 md:text-lg/8 ${centered ? "mx-auto max-w-[52ch]" : "max-w-[56ch]"}`}
				>
					{lede}
				</p>
			) : null}
		</div>
	);
}

/** Browser chrome around product screenshots, so they read as the real app rather than a picture. */
export function BrowserFrame({
	children,
	url,
	actions,
	className = "",
}: {
	children: React.ReactNode;
	url?: string;
	actions?: React.ReactNode;
	className?: string;
}) {
	return (
		<div
			className={`overflow-hidden rounded-xl bg-white shadow-[0_0_0_1px_rgb(24_24_27/0.08),0_2px_4px_rgb(24_24_27/0.04),0_24px_48px_-12px_rgb(37_99_235/0.18)] ${className}`}
		>
			<div className="flex h-10 items-center gap-3 border-b border-zinc-200/80 bg-zinc-50/80 px-4">
				<div aria-hidden="true" className="flex gap-1.5">
					<span className="size-2.5 rounded-full bg-zinc-300" />
					<span className="size-2.5 rounded-full bg-zinc-300" />
					<span className="size-2.5 rounded-full bg-zinc-300" />
				</div>
				{url ? (
					<div
						aria-hidden="true"
						className="mx-auto hidden h-6 w-full max-w-xs items-center justify-center rounded-md bg-white px-3 font-mono text-[11px] text-zinc-500 ring-1 ring-zinc-200 sm:flex"
					>
						{url}
					</div>
				) : (
					<div className="flex-1" />
				)}
				<div className="flex min-w-[3.25rem] justify-end">{actions}</div>
			</div>
			{children}
		</div>
	);
}
