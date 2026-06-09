/**
 * Sortable / searchable / category-filterable data tables for cited domains and
 * cited URLs, built on the generic DataTable. The domains table folds in DR and
 * citation-volatility as sortable columns.
 */
import type { ColumnDef, Row } from "@tanstack/react-table";
import { IconExternalLink } from "@tabler/icons-react";
import { CATEGORY_CONFIG, type CitationCategory, DOMAIN_CATEGORY_COLORS } from "@/lib/domain-categories";
import { DataTable } from "@/components/data-table";

export interface DomainTableRow {
	domain: string;
	category: CitationCategory;
	citations: number;
	rating: number | null;
	volatility: number | null;
}

export interface UrlTableRow {
	url: string;
	title: string | null;
	domain: string;
	category: CitationCategory;
	citations: number;
	avgPosition: number | null;
	prompts: number;
}

const CATEGORY_OPTIONS = (Object.keys(CATEGORY_CONFIG) as CitationCategory[]).map((c) => ({
	label: CATEGORY_CONFIG[c].label,
	value: c,
}));

/** Sort numbers ascending with nulls always last. */
function nullableNumberSort<T>(id: string) {
	return (a: Row<T>, b: Row<T>) => {
		const x = a.getValue<number | null>(id);
		const y = b.getValue<number | null>(id);
		return (x ?? Number.NEGATIVE_INFINITY) - (y ?? Number.NEGATIVE_INFINITY);
	};
}

function CategoryCell({ category }: { category: CitationCategory }) {
	return (
		<span className="inline-flex items-center gap-1.5 whitespace-nowrap">
			<span className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: DOMAIN_CATEGORY_COLORS[category] }} />
			{CATEGORY_CONFIG[category].label}
		</span>
	);
}

function DomainLink({ domain }: { domain: string }) {
	return (
		<a
			href={`https://${domain}`}
			target="_blank"
			rel="noopener noreferrer"
			className="inline-flex items-center gap-1 hover:underline"
		>
			<span className="truncate">{domain}</span>
			<IconExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
		</a>
	);
}

const dr = (r: number | null) => (r === null ? "—" : Math.round(r).toString());
const num = (n: number) => n.toLocaleString();

export function CitedDomainsTable({ rows }: { rows: DomainTableRow[] }) {
	const columns: ColumnDef<DomainTableRow>[] = [
		{ accessorKey: "domain", header: "Domain", cell: ({ row }) => <DomainLink domain={row.original.domain} /> },
		{ accessorKey: "category", header: "Category", filterFn: "equals", cell: ({ row }) => <CategoryCell category={row.original.category} /> },
		{ accessorKey: "citations", header: "Citations", cell: ({ row }) => <span className="font-mono tabular-nums">{num(row.original.citations)}</span> },
		{ accessorKey: "rating", header: "DR", sortingFn: nullableNumberSort<DomainTableRow>("rating"), cell: ({ row }) => <span className="font-mono tabular-nums text-muted-foreground">{dr(row.original.rating)}</span> },
		{ accessorKey: "volatility", header: "Volatility", sortingFn: nullableNumberSort<DomainTableRow>("volatility"), cell: ({ row }) => <span className="font-mono tabular-nums text-muted-foreground">{row.original.volatility === null ? "—" : row.original.volatility.toFixed(2)}</span> },
	];
	return (
		<DataTable
			columns={columns}
			data={rows}
			searchColumnId="domain"
			searchPlaceholder="Search domains…"
			facet={{ columnId: "category", placeholder: "All categories", options: CATEGORY_OPTIONS }}
			initialSorting={[{ id: "citations", desc: true }]}
		/>
	);
}

export function CitedUrlsTable({ rows }: { rows: UrlTableRow[] }) {
	const columns: ColumnDef<UrlTableRow>[] = [
		{
			accessorKey: "url",
			header: "URL",
			cell: ({ row }) => (
				<a
					href={row.original.url}
					target="_blank"
					rel="noopener noreferrer"
					className="inline-flex max-w-md items-center gap-1 hover:underline"
					title={row.original.url}
				>
					<span className="truncate">{row.original.title || row.original.url}</span>
					<IconExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
				</a>
			),
		},
		{ accessorKey: "domain", header: "Domain", cell: ({ row }) => <span className="truncate text-muted-foreground">{row.original.domain}</span> },
		{ accessorKey: "category", header: "Category", filterFn: "equals", cell: ({ row }) => <CategoryCell category={row.original.category} /> },
		{ accessorKey: "citations", header: "Citations", cell: ({ row }) => <span className="font-mono tabular-nums">{num(row.original.citations)}</span> },
		{ accessorKey: "avgPosition", header: "Avg pos", sortingFn: nullableNumberSort<UrlTableRow>("avgPosition"), cell: ({ row }) => <span className="font-mono tabular-nums text-muted-foreground">{row.original.avgPosition === null ? "—" : row.original.avgPosition.toFixed(1)}</span> },
		{ accessorKey: "prompts", header: "Prompts", cell: ({ row }) => <span className="font-mono tabular-nums text-muted-foreground">{num(row.original.prompts)}</span> },
	];
	return (
		<DataTable
			columns={columns}
			data={rows}
			searchColumnId="url"
			searchPlaceholder="Search URLs…"
			facet={{ columnId: "category", placeholder: "All categories", options: CATEGORY_OPTIONS }}
			initialSorting={[{ id: "citations", desc: true }]}
		/>
	);
}
