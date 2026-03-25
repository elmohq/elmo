const stats = [
	{ id: 1, name: "AI models tracked", value: "4+" },
	{ id: 2, name: "Prompts evaluated daily", value: "Unlimited" },
	{ id: 3, name: "Open source & self-hosted", value: "100%" },
];

export function Stats() {
	return (
		<section className="py-12 sm:py-20">
			<div className="mx-auto max-w-7xl px-4 md:px-6">
				<dl className="grid grid-cols-1 gap-x-4 gap-y-16 text-center lg:grid-cols-3">
					{stats.map((stat) => (
						<div
							key={stat.id}
							className="mx-auto flex max-w-xs flex-col gap-y-2"
						>
							<dt className="text-muted-foreground">{stat.name}</dt>
							<dd className="font-heading order-first text-3xl sm:text-4xl">
								{stat.value}
							</dd>
						</div>
					))}
				</dl>
			</div>
		</section>
	);
}
