import { IconChevronDown, IconInfoCircle, IconSearch } from "@tabler/icons-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Separator } from "@workspace/ui/components/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { useState } from "react";
import { BrandPromptLink } from "@/components/brand-prompt-link";
import { attributionDotClass } from "@/components/citations/shared";
import type { GoogleModuleData } from "@/components/citations/types";
import { ListPagination } from "@/components/list-pagination";

export const PRODUCTS_PAGE_SIZE = 10;
export const QUERIES_PAGE_SIZE = 5;

function PromptCountList({
	prompts,
	promptValues,
}: {
	prompts: { id: string; count: number }[];
	promptValues: Record<string, string>;
}) {
	return (
		<div className="pl-5 pb-2 space-y-0.5">
			{prompts.map((p) => (
				<BrandPromptLink key={p.id} promptId={p.id} className="flex items-center justify-between py-1 group text-xs">
					<span className="text-muted-foreground group-hover:text-foreground group-hover:underline truncate min-w-0">
						{promptValues[p.id]}
					</span>
					<span className="tabular-nums text-muted-foreground shrink-0 ml-3">{p.count.toLocaleString()}</span>
				</BrandPromptLink>
			))}
		</div>
	);
}

type GoogleProduct = GoogleModuleData["shopping"]["products"][number];
type GoogleQuery = GoogleModuleData["search"]["queries"][number];
type ProductFilter = "all" | "brand" | "competitor";

interface GoogleList<T> {
	items: T[];
	total: number;
	page: number;
	setPage: (page: number) => void;
	isFetching?: boolean;
}

export function GoogleShoppingCard({
	totals,
	products,
	productFilter,
	setProductFilter,
	queries,
	promptValues,
}: {
	totals: GoogleModuleData;
	products: GoogleList<GoogleProduct>;
	productFilter: ProductFilter;
	setProductFilter: (filter: ProductFilter) => void;
	queries: GoogleList<GoogleQuery>;
	promptValues: Record<string, string>;
}) {
	const [expandedProduct, setExpandedProduct] = useState<string | null>(null);
	const [expandedQuery, setExpandedQuery] = useState<string | null>(null);
	const googleModule = totals;
	const productCounts = totals.shopping.productCounts;

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-1.5">
					Google Shopping
					<Tooltip>
						<TooltipTrigger render={<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />} />
						<TooltipContent className="max-w-xs text-sm font-normal">
							Product cards Google AI Mode showed when answering your prompts. The number next to each is how many times
							that card appeared across results (card inclusions, not unique products). Kept separate from the citation
							mix above.
						</TooltipContent>
					</Tooltip>
				</CardTitle>
				<CardDescription>
					Products Google AI Mode surfaced —{" "}
					<span className="font-medium text-emerald-600">{googleModule.shopping.brandCount.toLocaleString()}</span>{" "}
					appearances for yours vs{" "}
					<span className="font-medium text-red-600">{googleModule.shopping.competitorCount.toLocaleString()}</span> for
					competitors
				</CardDescription>
			</CardHeader>
			<Separator />
			<CardContent className="space-y-6">
				{productCounts.all > 0 && (
					<div>
						<div className="flex items-center justify-between mb-2 gap-2">
							<h4 className="text-sm font-medium shrink-0">Products</h4>
							<div className="flex items-center gap-1">
								{(
									[
										["all", "All"],
										["brand", "Yours"],
										["competitor", "Competitors"],
									] as const
								).map(([key, label]) => (
									<button
										key={key}
										type="button"
										onClick={() => setProductFilter(key)}
										className={`px-2 py-0.5 rounded text-[11px] cursor-pointer transition-colors ${productFilter === key ? "bg-muted text-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`}
									>
										{label} ({productCounts[key].toLocaleString()})
									</button>
								))}
							</div>
						</div>
						<div className={`divide-y divide-border/50 transition-opacity ${products.isFetching ? "opacity-60" : ""}`}>
							{products.items.map((product) => {
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
												{product.count.toLocaleString()}
											</span>
										</div>
										{isExpanded && product.prompts.length > 0 && (
											<PromptCountList prompts={product.prompts} promptValues={promptValues} />
										)}
									</div>
								);
							})}
						</div>
						<ListPagination
							page={products.page}
							pageSize={PRODUCTS_PAGE_SIZE}
							totalItems={products.total}
							onPageChange={products.setPage}
						/>
					</div>
				)}

				{googleModule.search.queryCount > 0 && (
					<div>
						<h4 className="text-sm font-medium mb-2">Search queries</h4>
						<div className={`divide-y divide-border/50 transition-opacity ${queries.isFetching ? "opacity-60" : ""}`}>
							{queries.items.map((q) => {
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
											<span className="text-sm font-semibold tabular-nums shrink-0">{q.count.toLocaleString()}</span>
										</div>
										{isExpanded && q.prompts.length > 0 && (
											<PromptCountList prompts={q.prompts} promptValues={promptValues} />
										)}
									</div>
								);
							})}
						</div>
						<ListPagination
							page={queries.page}
							pageSize={QUERIES_PAGE_SIZE}
							totalItems={queries.total}
							onPageChange={queries.setPage}
						/>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
