/** The page's one accent gradient; everything else is blue-600 or neutral. */
export const ACCENT_GRADIENT = "bg-[linear-gradient(100deg,#1d4ed8_0%,#2563eb_35%,#0ea5e9_100%)]";
export const ACCENT_TEXT = `${ACCENT_GRADIENT} bg-clip-text text-transparent`;

/** White card that sits on the blue-tinted canvas. */
export const CARD =
	"rounded-2xl bg-white shadow-[0_0_0_1px_rgb(30_58_138/0.07),0_1px_2px_rgb(30_58_138/0.05),0_18px_40px_-24px_rgb(30_58_138/0.22)]";

export function Eyebrow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
	return (
		<p className={`inline-flex items-center gap-2 text-[13px] font-medium text-blue-700 ${className}`}>
			<span aria-hidden="true" className={`h-[3px] w-4 rounded-full ${ACCENT_GRADIENT}`} />
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
		<div className={centered ? "mx-auto max-w-3xl text-center" : "max-w-2xl"}>
			<Eyebrow>{eyebrow}</Eyebrow>
			<h2 className="mt-4 text-[2rem] font-semibold leading-[1.1] tracking-[-0.03em] text-balance text-slate-950 md:text-[2.75rem]">
				{title}
			</h2>
			{lede ? (
				<p
					className={`mt-4 text-pretty text-base/7 text-slate-600 md:text-lg/8 ${centered ? "mx-auto max-w-[52ch]" : "max-w-[56ch]"}`}
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
			className={`overflow-hidden rounded-xl bg-white shadow-[0_0_0_1px_rgb(30_58_138/0.08),0_2px_4px_rgb(30_58_138/0.04),0_24px_48px_-16px_rgb(30_58_138/0.25)] ${className}`}
		>
			<div
				className="flex h-9 items-center gap-1.5 border-b border-slate-200/70 bg-slate-50/80 px-4"
				aria-hidden="true"
			>
				<span className="size-2.5 rounded-full bg-slate-300" />
				<span className="size-2.5 rounded-full bg-slate-300" />
				<span className="size-2.5 rounded-full bg-slate-300" />
			</div>
			{children}
		</div>
	);
}
