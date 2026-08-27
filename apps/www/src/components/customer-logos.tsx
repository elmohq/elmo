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
		linkClass: "flex h-5 items-center text-zinc-500 transition-colors hover:text-[#0d3b25]",
		render: () => <FermatWordmark />,
	},
	{
		name: "Speakeasy",
		url: "https://www.speakeasy.com/?ref=elmo",
		linkClass: "flex h-5 items-center text-zinc-500 transition-colors hover:text-zinc-950",
		render: () => <SpeakeasyLockup />,
	},
	{
		name: "TradeSites",
		url: "https://www.tradesites.ai/?ref=elmo",
		linkClass: "group/ts flex h-5 items-center",
		render: () => (
			<TradeSitesWordmark className="grayscale transition-[filter] duration-150 group-hover/ts:grayscale-0" />
		),
	},
	{
		name: "Record Ranks",
		url: "https://recordranks.com/?ref=elmo",
		linkClass: "group/rr flex h-5 items-center",
		render: () => (
			<img
				src="/recordranks-logo.svg"
				alt=""
				aria-hidden="true"
				className="block h-5 w-auto grayscale transition-[filter] duration-150 group-hover/rr:grayscale-0"
			/>
		),
	},
	{
		name: "AskHotel",
		url: "https://askhotel.ai/?ref=elmo",
		linkClass: "group/ah flex h-5 items-center",
		render: () => (
			<img
				src="/askhotel-logo.png"
				alt=""
				aria-hidden="true"
				className="block h-5 w-auto grayscale transition-[filter] duration-150 group-hover/ah:grayscale-0"
			/>
		),
	},
];

export function CustomerLogosInline() {
	return (
		<div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3">
			<p className="flex h-5 items-center font-mono text-[10px] uppercase leading-none tracking-[0.2em] text-zinc-500">
				Trusted by
			</p>
			<ul className="flex flex-wrap items-center gap-x-6 gap-y-3">
				{customers.map((c) => (
					<li key={c.name} className="flex h-5 items-center">
						<a
							href={c.url}
							target="_blank"
							rel={c.nofollow ? "nofollow noopener noreferrer" : "noopener noreferrer"}
							className={c.linkClass}
							aria-label={c.name}
						>
							{c.render()}
						</a>
					</li>
				))}
			</ul>
		</div>
	);
}
