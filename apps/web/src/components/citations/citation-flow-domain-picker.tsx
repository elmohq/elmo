import { CATEGORY_CONFIG } from "@workspace/lib/citations/domain-categories";
import { Button } from "@workspace/ui/components/button";
import {
	Combobox,
	ComboboxCollection,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxGroup,
	ComboboxInput,
	ComboboxItem,
	ComboboxLabel,
	ComboboxList,
	ComboboxTrigger,
} from "@workspace/ui/components/combobox";
import { cn } from "@workspace/ui/lib/utils";
import { useMemo } from "react";
import { SiteIcon } from "@/components/site-icon";
import { type FlowDomainOption, matchesDomain } from "@/lib/citation-flow";

interface DomainGroup {
	value: string;
	items: FlowDomainOption[];
}

const isBrandOrCompetitor = (option: FlowDomainOption) =>
	option.category === "brand" || option.category === "competitor";

/** A listed domain's subdomains sit right under it, so docs.acme.com reads as part of acme.com. */
function nestSubdomains(items: FlowDomainOption[], nested: Set<FlowDomainOption>): FlowDomainOption[] {
	const isUnder = (child: FlowDomainOption, parent: FlowDomainOption) =>
		child !== parent && matchesDomain(child.domain, parent.domain);
	const roots = items.filter((item) => !items.some((other) => isUnder(item, other)));
	return roots.flatMap((root) => {
		const children = items.filter((item) => isUnder(item, root));
		for (const child of children) nested.add(child);
		return [root, ...children];
	});
}

function groupDomains(domains: readonly FlowDomainOption[]) {
	const nested = new Set<FlowDomainOption>();
	const groups: DomainGroup[] = [
		{
			value: "Your Brand",
			items: nestSubdomains(
				domains.filter((d) => d.category === "brand"),
				nested,
			),
		},
		{
			value: "Competitors",
			items: nestSubdomains(
				domains.filter((d) => d.category === "competitor"),
				nested,
			),
		},
		{
			value: "Other Sources",
			items: nestSubdomains(
				domains.filter((d) => !isBrandOrCompetitor(d)),
				nested,
			),
		},
	];
	return { groups: groups.filter((group) => group.items.length > 0), nested };
}

export function DomainPicker({
	domains,
	value,
	onChange,
	search,
	onSearchChange,
}: {
	domains: readonly FlowDomainOption[];
	value: string | undefined;
	onChange: (domain: string) => void;
	search: string;
	onSearchChange: (search: string) => void;
}) {
	const { groups, nested } = useMemo(() => groupDomains(domains), [domains]);
	const selected = value
		? (domains.find((d) => d.domain === value) ?? { domain: value, count: 0, category: "other" as const })
		: null;

	return (
		<Combobox
			items={groups}
			filter={null}
			inputValue={search}
			onInputValueChange={onSearchChange}
			onOpenChange={(open: boolean) => {
				if (!open) onSearchChange("");
			}}
			value={selected}
			onValueChange={(next: FlowDomainOption | null) => next && onChange(next.domain)}
			itemToStringLabel={(item: FlowDomainOption) => item.domain}
			isItemEqualToValue={(a: FlowDomainOption, b: FlowDomainOption) => a.domain === b.domain}
		>
			<ComboboxTrigger
				render={
					<Button
						variant="outline"
						size="sm"
						className="w-full min-w-0 justify-between gap-2 font-normal @xl/card-header:w-64"
						aria-label="Domain to analyze"
					/>
				}
			>
				<span className="flex min-w-0 items-center gap-2">
					<SiteIcon domain={value} size="xs" />
					<span className="truncate font-medium">{value ?? "Choose a Domain"}</span>
				</span>
			</ComboboxTrigger>
			<ComboboxContent align="end" className="w-80">
				<ComboboxInput showTrigger={false} placeholder="Search domains…" />
				<ComboboxEmpty>No cited domains match.</ComboboxEmpty>
				<ComboboxList>
					{(group: DomainGroup) => (
						<ComboboxGroup key={group.value} items={group.items}>
							<ComboboxLabel>{group.value}</ComboboxLabel>
							<ComboboxCollection>
								{(item: FlowDomainOption) => (
									<ComboboxItem key={item.domain} value={item} className={cn(nested.has(item) && "pl-8")}>
										<SiteIcon domain={item.domain} size="xs" />
										<span className="min-w-0 truncate">{item.domain}</span>
										{!isBrandOrCompetitor(item) && (
											<span className="shrink-0 text-xs text-muted-foreground">
												{CATEGORY_CONFIG[item.category]?.label}
											</span>
										)}
										<span className="ml-auto shrink-0 pl-2 text-xs text-muted-foreground tabular-nums">
											{item.count.toLocaleString()}
										</span>
									</ComboboxItem>
								)}
							</ComboboxCollection>
						</ComboboxGroup>
					)}
				</ComboboxList>
			</ComboboxContent>
		</Combobox>
	);
}
