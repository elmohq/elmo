import { FermatWordmark, SpeakeasyLockup, TradeSitesWordmark } from "@workspace/ui/brand/customers";

interface Customer {
	name: string;
	url: string;
	nofollow?: boolean;
	linkClass: string;
	render: () => React.ReactNode;
}

const customers: Customer[] = [
	{
		name: "Fermat Commerce",
		url: "https://www.fermatcommerce.com/?ref=elmo",
		nofollow: true,
		linkClass: "flex h-6 items-center text-zinc-500 transition-colors hover:text-[#0d3b25]",
		render: () => <FermatWordmark />,
	},
	{
		name: "Speakeasy",
		url: "https://www.speakeasy.com/?ref=elmo",
		linkClass: "flex h-6 items-center text-zinc-500 transition-colors hover:text-zinc-950",
		render: () => <SpeakeasyLockup />,
	},
	{
		name: "TradeSites",
		url: "https://www.tradesites.ai/?ref=elmo",
		linkClass: "group/ts flex h-6 items-center",
		render: () => (
			<TradeSitesWordmark className="grayscale transition-[filter] duration-150 group-hover/ts:grayscale-0" />
		),
	},
	{
		name: "Record Ranks",
		url: "https://recordranks.com/?ref=elmo",
		linkClass: "group/rr flex h-6 items-center",
		render: () => (
			<img
				src="/recordranks-logo.svg"
				alt=""
				aria-hidden="true"
				className="block h-6 w-auto grayscale transition-[filter] duration-150 group-hover/rr:grayscale-0"
			/>
		),
	},
	{
		name: "AskHotel",
		url: "https://askhotel.ai/?ref=elmo",
		linkClass: "group/ah flex h-6 items-center",
		render: () => (
			<img
				src="/askhotel-logo.png"
				alt=""
				aria-hidden="true"
				className="block h-6 w-auto grayscale transition-[filter] duration-150 group-hover/ah:grayscale-0"
			/>
		),
	},
	{
		name: "AISearch Global",
		url: "https://aisearch.global/?ref=elmo",
		linkClass: "group/asg flex h-6 items-center",
		render: () => (
			<img
				src="/aisearch-global-logo.svg"
				alt=""
				aria-hidden="true"
				className="block h-6 w-auto opacity-60 grayscale transition-[filter,opacity] duration-150 group-hover/asg:opacity-100 group-hover/asg:grayscale-0"
			/>
		),
	},
];

export function LogoStrip() {
	return (
		<section aria-labelledby="social-proof" className="border-t border-zinc-200/80 bg-white">
			<div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-20">
				<div className="flex flex-col items-center gap-4 text-center">
					<h2
						id="social-proof"
						className="max-w-[24ch] text-2xl font-semibold tracking-[-0.025em] text-balance text-zinc-950 md:text-3xl"
					>
						Used by 200+ brands to optimize their AI visibility
					</h2>
				</div>
				<ul className="mt-10 flex flex-wrap items-center justify-center gap-x-10 gap-y-6 md:gap-x-14">
					{customers.map((c) => (
						<li key={c.name} className="flex h-6 items-center">
							<a
								href={c.url}
								target="_blank"
								rel={c.nofollow ? "nofollow noopener noreferrer" : "noopener noreferrer"}
								className={`${c.linkClass} rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600`}
								aria-label={c.name}
							>
								{c.render()}
							</a>
						</li>
					))}
				</ul>
			</div>
		</section>
	);
}
