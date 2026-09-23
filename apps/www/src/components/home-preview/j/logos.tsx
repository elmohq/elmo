// Customer list copied from the shared inline strip so this variant can size and center it.
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
		linkClass: "flex h-6 items-center text-stone-600 transition-colors hover:text-[#0d3b25]",
		render: () => <FermatWordmark />,
	},
	{
		name: "Speakeasy",
		url: "https://www.speakeasy.com/?ref=elmo",
		linkClass: "flex h-6 items-center text-stone-600 transition-colors hover:text-[#1c1a17]",
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
];

export function LogoStrip() {
	return (
		<section aria-label="Customers">
			<div className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-16">
				<div className="flex flex-col gap-6 border-y border-[#1c1a17]/12 py-7 md:flex-row md:items-center md:justify-between md:gap-10">
					<p className="shrink-0 font-mono text-[11px] uppercase tracking-[0.16em] text-stone-600">In use at</p>
					<ul className="flex flex-wrap items-center gap-x-10 gap-y-6 md:justify-end md:gap-x-12">
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
			</div>
		</section>
	);
}
