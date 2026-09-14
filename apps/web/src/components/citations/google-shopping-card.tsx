import { useI18n } from "@/lib/i18n";
import { IconChevronDown, IconInfoCircle, IconSearch } from "@tabler/icons-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Separator } from "@workspace/ui/components/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { useMemo, useState } from "react";
import { BrandPromptLink } from "@/components/brand-prompt-link";
import { attributionDotClass } from "@/components/citations/shared";
import type { GoogleModuleData } from "@/components/citations/types";
import { ListPagination, usePagedList } from "@/components/list-pagination";

const PRODUCTS_PAGE_SIZE = 10;

function PromptCountList({ prompts }: { prompts: { id: string; value: string; count: number }[] }) {
	const { n } = useI18n();
	return (
		<div className="pl-5 pb-2 space-y-0.5">
			{prompts.map((p) => (
				<BrandPromptLink key={p.id} promptId={p.id} className="flex items-center justify-between py-1 group text-xs">
					<span className="text-muted-foreground group-hover:text-foreground group-hover:underline truncate min-w-0">
						{p.value}
					</span>
					<span className="tabular-nums text-muted-foreground shrink-0 ml-3">{n(p.count)}</span>
				</BrandPromptLink>
			))}
		</div>
	);
}

export function GoogleShoppingCard({ googleModule }: { googleModule: GoogleModuleData }) {
	const { t, n } = useI18n();
	const [expandedProduct, setExpandedProduct] = useState<string | null>(null);
	const [productFilter, setProductFilter] = useState<"all" | "brand" | "competitor">("all");
	const [expandedQuery, setExpandedQuery] = useState<string | null>(null);
	const [showAllQueries, setShowAllQueries] = useState(false);

	const filteredProducts = useMemo(() => {
		const ps = googleModule.shopping.products;
		return productFilter === "all" ? ps : ps.filter((p) => p.attribution === productFilter);
	}, [googleModule, productFilter]);
	const productCounts = useMemo(() => {
		const ps = googleModule.shopping.products;
		return {
			all: ps.length,
			brand: ps.filter((p) => p.attribution === "brand").length,
			competitor: ps.filter((p) => p.attribution === "competitor").length,
		};
	}, [googleModule]);

	const { page, setPage, pageItems, totalItems } = usePagedList(filteredProducts, PRODUCTS_PAGE_SIZE);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-1.5">
					{t("Google Shopping")}
					<Tooltip>
						<TooltipTrigger render={<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />} />
						<TooltipContent className="max-w-xs text-sm font-normal">
							{t(
								"Product cards Google AI Mode showed when answering your prompts. The number next to each is how many times that card appeared across results (card inclusions, not unique products). Kept separate from the citation mix above.",
							)}
						</TooltipContent>
					</Tooltip>
				</CardTitle>
				<CardDescription>
					{t("Products Google AI Mode surfaced —")}{" "}
					<span className="font-medium text-emerald-600">{n(googleModule.shopping.brandCount)}</span>{" "}
					{t("appearances for yours vs")}{" "}
					<span className="font-medium text-red-600">{n(googleModule.shopping.competitorCount)}</span>{" "}
					{t("for competitors")}
				</CardDescription>
			</CardHeader>
			<Separator />
			<CardContent className="space-y-6">
				{googleModule.shopping.products.length > 0 && (
					<div>
						<div className="flex items-center justify-between mb-2 gap-2">
							<h4 className="text-sm font-medium shrink-0">{t("Products")}</h4>
							<div className="flex items-center gap-1">
								{(
									[
										["all", /* i18n */ "All"],
										["brand", /* i18n */ "Yours"],
										["competitor", /* i18n */ "Competitors"],
									] as const
								).map(([key, label]) => (
									<button
										key={key}
										type="button"
										onClick={() => {
											setProductFilter(key);
											setPage(0);
										}}
										className={`px-2 py-0.5 rounded text-[11px] cursor-pointer transition-colors ${productFilter === key ? "bg-muted text-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`}
									>
										{t(label)} ({n(productCounts[key])})
									</button>
								))}
							</div>
						</div>
						<div className="divide-y divide-border/50">
							{pageItems.map((product) => {
								const isExpanded = expandedProduct === product.name;
								return (
									<div key={product.name}>
										<div className="flex items-center justify-between py-2 gap-3">
											<button
												type="button"
												onClick={() => setExpandedProduct(isExpanded ? null : product.name)}
												className="flex items-center gap-1.5 min-w-0 cursor-pointer group text-left"
											>
												<IconChevronDown
													className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${isExpanded ? "" : "-rotate-90"}`}
												/>
												<span className={`shrink-0 rounded-full h-2 w-2 ${attributionDotClass(product.attribution)}`} />
												<span className="text-sm font-medium text-foreground group-hover:underline truncate">
													{product.name}
												</span>
												{product.attribution === "competitor" && product.competitorName && (
													<span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
														({product.competitorName})
													</span>
												)}
											</button>
											<span className="text-sm font-semibold tabular-nums shrink-0">
												{n(product.count)}
											</span>
										</div>
										{isExpanded && product.prompts.length > 0 && <PromptCountList prompts={product.prompts} />}
									</div>
								);
							})}
						</div>
						<ListPagination page={page} pageSize={PRODUCTS_PAGE_SIZE} totalItems={totalItems} onPageChange={setPage} />
					</div>
				)}

				{googleModule.search.queries.length > 0 && (
					<div>
						<h4 className="text-sm font-medium mb-2">{t("Search queries")}</h4>
						<div className="divide-y divide-border/50">
							{(showAllQueries ? googleModule.search.queries : googleModule.search.queries.slice(0, 5)).map((q) => {
								const isExpanded = expandedQuery === q.query;
								return (
									<div key={q.query}>
										<div className="flex items-center justify-between py-2 gap-3">
											<button
												type="button"
												onClick={() => setExpandedQuery(isExpanded ? null : q.query)}
												className="flex items-center gap-1.5 min-w-0 cursor-pointer group text-left"
											>
												<IconChevronDown
													className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${isExpanded ? "" : "-rotate-90"}`}
												/>
												<IconSearch className="h-3 w-3 shrink-0 text-muted-foreground" />
												<span className="text-sm font-medium text-foreground group-hover:underline truncate">
													{q.query}
												</span>
											</button>
											<span className="text-sm font-semibold tabular-nums shrink-0">{n(q.count)}</span>
										</div>
										{isExpanded && q.prompts.length > 0 && <PromptCountList prompts={q.prompts} />}
									</div>
								);
							})}
						</div>
						{googleModule.search.queries.length > 5 && !showAllQueries && (
							<button
								type="button"
								onClick={() => setShowAllQueries(true)}
								className="mt-3 text-xs text-muted-foreground hover:text-foreground cursor-pointer px-3 py-1.5 rounded-md border border-border hover:bg-muted/60 transition-colors"
							>
								{t("Show {count} more", { count: googleModule.search.queries.length - 5 })}
							</button>
						)}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
