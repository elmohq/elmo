/**
 * Generic sortable / searchable / filterable / paginated data table.
 *
 * Thin composition over @tanstack/react-table + the shadcn `table` primitive
 * (the standard shadcn data-table pattern). Pass column defs + rows; optionally
 * a search column and a faceted (exact-match) filter column.
 */
import { useState } from "react";
import {
	type ColumnDef,
	type ColumnFiltersState,
	flexRender,
	getCoreRowModel,
	getFilteredRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	type SortingState,
	useReactTable,
} from "@tanstack/react-table";
import { IconArrowsSort, IconSortAscending, IconSortDescending } from "@tabler/icons-react";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table";

export interface DataTableFacet {
	columnId: string;
	placeholder: string;
	options: { label: string; value: string }[];
}

export function DataTable<TData, TValue>({
	columns,
	data,
	searchColumnId,
	searchPlaceholder = "Search…",
	facet,
	initialSorting = [],
	pageSize = 25,
}: {
	columns: ColumnDef<TData, TValue>[];
	data: TData[];
	searchColumnId?: string;
	searchPlaceholder?: string;
	facet?: DataTableFacet;
	initialSorting?: SortingState;
	pageSize?: number;
}) {
	const [sorting, setSorting] = useState<SortingState>(initialSorting);
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

	const table = useReactTable({
		data,
		columns,
		state: { sorting, columnFilters },
		onSortingChange: setSorting,
		onColumnFiltersChange: setColumnFilters,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		initialState: { pagination: { pageSize } },
	});

	const searchValue = (searchColumnId ? (table.getColumn(searchColumnId)?.getFilterValue() as string) : "") ?? "";
	const facetValue = (facet ? (table.getColumn(facet.columnId)?.getFilterValue() as string) : "") ?? "";

	return (
		<div className="space-y-3">
			<div className="flex flex-wrap items-center gap-2">
				{searchColumnId && (
					<Input
						value={searchValue}
						onChange={(e) => table.getColumn(searchColumnId)?.setFilterValue(e.target.value)}
						placeholder={searchPlaceholder}
						className="h-8 max-w-xs"
					/>
				)}
				{facet && (
					<select
						value={facetValue}
						onChange={(e) => table.getColumn(facet.columnId)?.setFilterValue(e.target.value || undefined)}
						className="h-8 rounded-md border bg-background px-2 text-sm"
					>
						<option value="">{facet.placeholder}</option>
						{facet.options.map((o) => (
							<option key={o.value} value={o.value}>
								{o.label}
							</option>
						))}
					</select>
				)}
				<span className="ml-auto text-muted-foreground text-xs tabular-nums">
					{table.getFilteredRowModel().rows.length.toLocaleString()} rows
				</span>
			</div>

			<div className="rounded-md border overflow-x-auto">
				<Table>
					<TableHeader>
						{table.getHeaderGroups().map((hg) => (
							<TableRow key={hg.id}>
								{hg.headers.map((header) => {
									const sortable = header.column.getCanSort();
									const sorted = header.column.getIsSorted();
									return (
										<TableHead
											key={header.id}
											className={sortable ? "cursor-pointer select-none" : undefined}
											onClick={sortable ? header.column.getToggleSortingHandler() : undefined}
										>
											<span className="inline-flex items-center gap-1">
												{flexRender(header.column.columnDef.header, header.getContext())}
												{sortable &&
													(sorted === "asc" ? (
														<IconSortAscending className="h-3.5 w-3.5" />
													) : sorted === "desc" ? (
														<IconSortDescending className="h-3.5 w-3.5" />
													) : (
														<IconArrowsSort className="h-3.5 w-3.5 opacity-40" />
													))}
											</span>
										</TableHead>
									);
								})}
							</TableRow>
						))}
					</TableHeader>
					<TableBody>
						{table.getRowModel().rows.length ? (
							table.getRowModel().rows.map((row) => (
								<TableRow key={row.id}>
									{row.getVisibleCells().map((cell) => (
										<TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
									))}
								</TableRow>
							))
						) : (
							<TableRow>
								<TableCell colSpan={columns.length} className="h-20 text-center text-muted-foreground">
									No results.
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>

			<div className="flex items-center justify-end gap-2 text-xs">
				<span className="text-muted-foreground tabular-nums">
					Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount() || 1}
				</span>
				<Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
					Prev
				</Button>
				<Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
					Next
				</Button>
			</div>
		</div>
	);
}
