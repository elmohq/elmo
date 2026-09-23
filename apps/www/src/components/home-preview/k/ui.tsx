export function Eyebrow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
	return (
		<p className={`flex items-center gap-2.5 text-[13px] font-semibold tracking-[-0.005em] text-blue-600 ${className}`}>
			<span aria-hidden="true" className="h-[3px] w-5 rounded-full bg-blue-600" />
			{children}
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
		<div className={centered ? "mx-auto flex max-w-3xl flex-col items-center text-center" : "max-w-2xl"}>
			<Eyebrow>{eyebrow}</Eyebrow>
			<h2 className="mt-4 text-[2rem] font-semibold leading-[1.08] tracking-[-0.03em] text-balance text-zinc-950 md:text-[2.75rem]">
				{title}
			</h2>
			{lede ? (
				<p
					className={`mt-4 text-pretty text-base/7 text-zinc-600 md:text-lg/8 ${centered ? "mx-auto max-w-[56ch]" : "max-w-[58ch]"}`}
				>
					{lede}
				</p>
			) : null}
		</div>
	);
}

/** Browser chrome around product screenshots, so they read as the real app rather than a picture. */
export function BrowserFrame({ children, className = "" }: { children: React.ReactNode; className?: string }) {
	return (
		<div
			className={`overflow-hidden rounded-xl bg-white shadow-[0_0_0_1px_rgb(24_24_27/0.08),0_2px_4px_rgb(24_24_27/0.04),0_24px_48px_-12px_rgb(37_99_235/0.18)] ${className}`}
		>
			<div className="flex h-9 items-center gap-1.5 border-b border-zinc-200/80 bg-zinc-50/80 px-4" aria-hidden="true">
				<span className="size-2.5 rounded-full bg-zinc-300" />
				<span className="size-2.5 rounded-full bg-zinc-300" />
				<span className="size-2.5 rounded-full bg-zinc-300" />
			</div>
			{children}
		</div>
	);
}

const BTN =
	"inline-flex h-10 items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-medium leading-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2";

/** Button looks for the blue closing band, where the shared blue primary would disappear. */
export const ON_BLUE_PRIMARY = `${BTN} bg-white text-blue-700 shadow-sm hover:bg-blue-50 focus-visible:outline-white`;
export const ON_BLUE_SECONDARY = `${BTN} text-white ring-1 ring-white/40 hover:bg-white/10 focus-visible:outline-white`;
