import { useState } from "react";
import { CitationFlowCard } from "@/components/citations/citation-flow-card";
import { type CitationFilters, useCitationDomains, useCitationFlow } from "@/hooks/use-citations";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { defaultFlowDomain, flowDomainOptions } from "@/lib/citation-flow";
import type { CitationDomainListItem } from "@/server/citations";

const PICKER_DOMAINS = 50;
const BRAND_DOMAINS = 10;

export interface CitationFlowSource {
	brandId: string;
	filters: CitationFilters;
	brandDomains: readonly string[];
	competitorDomains: readonly string[];
	modelOrder: readonly string[];
}

function useFlowDomains(source: CitationFlowSource, search: string) {
	const query = { category: "all", page: 0, pageSize: PICKER_DOMAINS };
	const top = useCitationDomains(source.brandId, source.filters, { ...query, search: "" });
	const searched = useCitationDomains(source.brandId, source.filters, { ...query, search });
	// The brand's own hosts are always offered, even when they aren't among the most cited.
	const brand = useCitationDomains(source.brandId, source.filters, {
		category: "brand",
		page: 0,
		pageSize: BRAND_DOMAINS,
		search: "",
	});

	const configured = [
		...source.brandDomains.map((domain) => ({ domain, category: "brand" as const })),
		...source.competitorDomains.map((domain) => ({ domain, category: "competitor" as const })),
	];
	const optionsFrom = (cited: CitationDomainListItem[]) => {
		const merged = new Map(cited.map((item) => [item.domain, item]));
		for (const item of brand.data?.items ?? []) merged.set(item.domain, item);
		return flowDomainOptions([...merged.values()], configured);
	};
	const needle = search.toLowerCase();
	return {
		options: optionsFrom(searched.data?.items ?? []).filter((option) => !needle || option.domain.includes(needle)),
		defaultDomain: defaultFlowDomain(optionsFrom(top.data?.items ?? [])),
		isLoading: top.isPending,
		error: top.error,
	};
}

export function CitationFlowSection({
	source,
	domain,
	onDomainChange,
}: {
	source: CitationFlowSource;
	domain: string | undefined;
	onDomainChange: (domain: string) => void;
}) {
	const [search, setSearch] = useState("");
	const debouncedSearch = useDebouncedValue(search);
	const domains = useFlowDomains(source, debouncedSearch);
	const shownDomain = domain ?? domains.defaultDomain;
	const flow = useCitationFlow(source.brandId, source.filters, shownDomain);

	return (
		<CitationFlowCard
			domains={domains.options}
			isLoadingDomains={domains.isLoading}
			domain={shownDomain}
			onDomainChange={onDomainChange}
			search={search}
			onSearchChange={setSearch}
			rows={flow.data}
			isLoading={flow.isPlaceholderData}
			error={flow.error ?? domains.error}
			modelOrder={source.modelOrder}
		/>
	);
}
