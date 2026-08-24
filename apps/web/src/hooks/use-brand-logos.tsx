import { useMemo } from "react";
import { buildBrandDomainIndex, domainForName } from "@/lib/brand-logo";
import { useBrand, useCompetitors } from "@/hooks/use-brands";

/**
 * Logo domains for everyone a brand's pages can name: the brand itself and the
 * competitors it tracks. Mention data carries names only, so surfaces that
 * render those names look the domain up here.
 */
export function useBrandLogos(brandId?: string) {
	const { brand } = useBrand(brandId);
	const { competitors } = useCompetitors(brandId);

	return useMemo(() => {
		const index = buildBrandDomainIndex([
			// The brand goes first so it keeps its own name if a competitor also claims it.
			...(brand
				? [
						{
							name: brand.name,
							domains: [brand.website, ...(brand.additionalDomains ?? [])],
							aliases: brand.aliases ?? [],
						},
					]
				: []),
			...competitors.map((competitor) => ({
				name: competitor.name,
				domains: competitor.domains ?? [],
				aliases: competitor.aliases ?? [],
			})),
		]);

		return { domainFor: (name: string | null | undefined) => domainForName(index, name) };
	}, [brand, competitors]);
}
