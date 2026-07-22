import { createFileRoute } from "@tanstack/react-router";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { ogMeta, canonicalUrl, breadcrumbJsonLd } from "@/lib/seo";
import { externalRel } from "@/lib/external-link";
import { getStatusData } from "@/lib/status";
import {
	buildStatusMatrix,
	dedupeEntries,
	formatLatency,
	formatModel,
	formatProvider,
	getLatest,
	parseTarget,
	passRate,
	MODEL_API_CATEGORIES,
	PROVIDER_FILTER_LABELS,
	PROVIDER_FILTER_ORDER,
	providerCategory,
	rateTier,
	type CellAvailability,
	type MatrixCell,
	type RateTier,
	type StatusEntry,
	type TargetStatus,
} from "@/lib/status-helpers";
import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
	type ChartConfig,
} from "@workspace/ui/components/chart";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Badge } from "@workspace/ui/components/badge";
import { Fragment, useState, useRef, useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
	LineChart,
	Line,
	XAxis,
	YAxis,
	CartesianGrid,
	ResponsiveContainer,
} from "recharts";

const title = "Provider Status · Elmo";
const description =
	"Real-time status and performance monitoring for AI search provider integrations.";

export const Route = createFileRoute("/status")({
	head: () => ({
		meta: [
			{ title },
			{ name: "description", content: description },
			...ogMeta({ title, description, path: "/status", image: "/og/status.png" }),
		],
		links: [{ rel: "canonical", href: canonicalUrl("/status") }],
		scripts: [
			breadcrumbJsonLd([
				{ name: "Home", path: "/" },
				{ name: "Status", path: "/status" },
			]),
		],
	}),
	loader: () => getStatusData(),
	component: StatusPage,
});

// ─── Helpers ──────────────────────────────────────────────────────────────

// Group targets by model for display
function groupByModel(data: TargetStatus[]) {
	const groups: Record<string, TargetStatus[]> = {};
	for (const d of data) {
		const { model } = parseTarget(d.target);
		if (!groups[model]) groups[model] = [];
		groups[model].push(d);
	}
	return groups;
}

// Tailwind classes per uptime tier for the light-themed matrix. Data cells are
// light; the row/column health cells sit one shade darker; the overall corner
// is solid.
const TIER_CELL: Record<RateTier, string> = {
	up: "bg-green-100 text-green-800",
	warn: "bg-amber-100 text-amber-800",
	down: "bg-red-100 text-red-800",
	none: "bg-zinc-100 text-zinc-400",
};
const TIER_CELL_AVG: Record<RateTier, string> = {
	up: "bg-green-200 text-green-900",
	warn: "bg-amber-200 text-amber-900",
	down: "bg-red-200 text-red-900",
	none: "bg-zinc-100 text-zinc-400",
};
const TIER_SOLID: Record<RateTier, string> = {
	up: "bg-green-600 text-white",
	warn: "bg-amber-500 text-white",
	down: "bg-red-600 text-white",
	none: "bg-zinc-300 text-white",
};

// Diagonal hatch marking "not available" cells — a combination that can't exist,
// distinct from the flat dot used for combinations Elmo just doesn't track yet.
const HATCH_BG =
	"repeating-linear-gradient(-45deg, rgb(228 228 231) 0, rgb(228 228 231) 1px, transparent 1px, transparent 6px)";

// ─── Components ───────────────────────────────────────────────────────────

function UptimeBadge({ entries }: { entries: StatusEntry[] }) {
	if (entries.length === 0) return <Badge variant="outline">No data</Badge>;
	const latest = entries[entries.length - 1];
	if (latest.status === "fail") return <Badge className="bg-red-600 text-white">Failing</Badge>;
	return <Badge className="bg-green-600 text-white">Operational</Badge>;
}

function UptimeBar({ entries }: { entries: StatusEntry[] }) {
	const [hovered, setHovered] = useState<number | null>(null);
	const [pos, setPos] = useState({ x: 0, y: 0 });
	const deduped = dedupeEntries(entries);
	if (deduped.length === 0) return null;

	// One square per run, oldest to newest, colored by that run's status. A
	// manual re-run just appends another square; a missed run leaves no gap.
	const active = hovered !== null ? deduped[hovered] : null;

	return (
		<div className="flex gap-0.5">
			{deduped.map((entry, i) => (
				<div
					key={entry.ts}
					onMouseEnter={(e) => {
						const r = e.currentTarget.getBoundingClientRect();
						setPos({ x: r.left + r.width / 2, y: r.top });
						setHovered(i);
					}}
					onMouseLeave={() => setHovered(null)}
					className={`h-6 flex-1 rounded-sm ${
						entry.status === "fail" ? "bg-red-500" : "bg-green-500"
					}`}
				/>
			))}
			{active &&
				createPortal(
					<div
						className="pointer-events-none fixed z-50 rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-950 shadow-lg"
						style={{
							left: pos.x,
							top: pos.y,
							transform: "translate(-50%, calc(-100% - 6px))",
						}}
					>
						<div className="font-medium whitespace-nowrap">
							{new Date(active.ts).toLocaleString(undefined, {
								month: "short",
								day: "numeric",
								hour: "numeric",
								minute: "2-digit",
							})}
						</div>
						<div className="mt-0.5 text-zinc-600">
							{active.status === "fail" ? "Failing" : "Operational"}
							{` · ${formatLatency(active.latency)}`}
						</div>
						{active.status === "fail" && active.error && (
							<div className="mt-0.5 max-w-[16rem] text-red-500">
								{active.error.slice(0, 120)}
							</div>
						)}
					</div>,
					document.body,
				)}
		</div>
	);
}

function LatencyChart({ data }: { data: TargetStatus[] }) {
	// Merge all targets into a time-series chart
	// Bucket by ~6 hours for a clean chart
	const allTimestamps = new Set<string>();
	const seriesMeta: Record<string, { modelLabel: string; providerLabel: string }> = {};
	const targetNames = data.map((d) => {
		const { model, provider } = parseTarget(d.target);
		const name = `${formatModel(model)} (${formatProvider(provider)})`;
		if (!seriesMeta[name])
			seriesMeta[name] = {
				modelLabel: formatModel(model),
				providerLabel: formatProvider(provider),
			};
		return name;
	});

	// Build chart data: each row is a time bucket, columns are targets
	const bucketMs = 6 * 60 * 60 * 1000;
	const now = Date.now();
	const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

	const bucketMap: Record<number, Record<string, number[]>> = {};

	for (let i = 0; i < data.length; i++) {
		const deduped = dedupeEntries(data[i].entries);
		const name = targetNames[i];
		for (const entry of deduped) {
			if (entry.status !== "pass") continue;
			const t = new Date(entry.ts).getTime();
			if (t < sevenDaysAgo) continue;
			const bucket = Math.floor(t / bucketMs) * bucketMs;
			if (!bucketMap[bucket]) bucketMap[bucket] = {};
			if (!bucketMap[bucket][name]) bucketMap[bucket][name] = [];
			bucketMap[bucket][name].push(entry.latency);
		}
	}

	const chartData = Object.entries(bucketMap)
		.sort(([a], [b]) => Number(a) - Number(b))
		.map(([ts, values]) => {
			const row: Record<string, any> = {
				time: new Date(Number(ts)).toLocaleDateString(undefined, {
					month: "short",
					day: "numeric",
					hour: "numeric",
				}),
			};
			for (const [name, latencies] of Object.entries(values)) {
				// Use median to smooth outliers
				latencies.sort((a, b) => a - b);
				row[name] = latencies[Math.floor(latencies.length / 2)];
			}
			return row;
		});

	if (chartData.length === 0) {
		return (
			<div className="py-12 text-center text-sm text-zinc-600">
				No latency data for the current selection.
			</div>
		);
	}

	const colors = [
		"hsl(221, 83%, 53%)", "hsl(142, 71%, 45%)", "hsl(38, 92%, 50%)",
		"hsl(0, 84%, 60%)", "hsl(262, 83%, 58%)", "hsl(174, 72%, 40%)",
		"hsl(330, 81%, 60%)", "hsl(200, 98%, 39%)", "hsl(47, 95%, 53%)",
		"hsl(15, 75%, 55%)",
	];

	const config: ChartConfig = {};
	const uniqueNames = [...new Set(targetNames)];
	uniqueNames.forEach((name, i) => {
		config[name] = { label: name, color: colors[i % colors.length] };
	});

	return (
		<ChartContainer config={config} className="h-[400px] w-full">
			<LineChart data={chartData}>
				<CartesianGrid strokeDasharray="3 3" />
				<XAxis dataKey="time" tick={{ fontSize: 11 }} />
				<YAxis
					tick={{ fontSize: 11 }}
					tickFormatter={(v) => formatLatency(v)}
					label={{ value: "Latency", angle: -90, position: "insideLeft", style: { fontSize: 12 } }}
				/>
				<ChartTooltip
					content={({ active, payload, label }: any) => {
						if (!active || !payload?.length) return null;
						// Group the hovered bucket by model; within each model list
						// providers fastest-first. Model groups follow the same order
						// as the page's sections (alphabetical).
						const groups: Record<
							string,
							{ providerLabel: string; color: string; value: number }[]
						> = {};
						for (const item of payload as any[]) {
							if (item.value == null) continue;
							const meta = seriesMeta[item.name] ?? {
								modelLabel: item.name,
								providerLabel: item.name,
							};
							(groups[meta.modelLabel] ??= []).push({
								providerLabel: meta.providerLabel,
								color: item.color,
								value: item.value as number,
							});
						}
						const ordered = Object.entries(groups)
							.map(([modelLabel, rows]) => ({
								modelLabel,
								rows: rows.sort((a, b) => a.value - b.value),
							}))
							.sort((a, b) => a.modelLabel.localeCompare(b.modelLabel));
						if (ordered.length === 0) return null;
						return (
							<div className="border-border/50 bg-background min-w-[11rem] rounded-lg border px-2.5 py-1.5 text-xs shadow-xl">
								<div className="font-medium mb-1.5">{label}</div>
								<div className="grid gap-2">
									{ordered.map((group) => (
										<div key={group.modelLabel}>
											<div className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
												{group.modelLabel}
											</div>
											<div className="grid gap-1">
												{group.rows.map((row) => (
													<div key={row.providerLabel} className="flex items-center gap-2">
														<div className="size-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: row.color }} />
														<span className="flex-1 text-zinc-600">{row.providerLabel}</span>
														<span className="font-mono font-medium tabular-nums">{formatLatency(row.value)}</span>
													</div>
												))}
											</div>
										</div>
									))}
								</div>
							</div>
						);
					}}
				/>
				{uniqueNames.map((name, i) => (
					<Line
						key={name}
						type="monotone"
						dataKey={name}
						stroke={colors[i % colors.length]}
						strokeWidth={2}
						dot={false}
						connectNulls
					/>
				))}
			</LineChart>
		</ChartContainer>
	);
}


function StatWithSparkline({
	label,
	value,
	sparkData,
	timestamps,
	sparkColor = "hsl(221, 83%, 53%)",
	formatFn,
}: {
	label: string;
	value: string;
	sparkData: number[];
	timestamps: string[];
	sparkColor?: string;
	formatFn?: (v: number) => string;
}) {
	const [show, setShow] = useState(false);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const [pos, setPos] = useState({ x: 0, y: 0 });

	useEffect(() => {
		if (show && triggerRef.current) {
			const rect = triggerRef.current.getBoundingClientRect();
			setPos({ x: rect.left + rect.width / 2, y: rect.top });
		}
	}, [show]);

	if (sparkData.length === 0) {
		return <span>{label}: {value}</span>;
	}

	const isInteger = sparkData.every((v) => Number.isInteger(v));
	const yTickFmt = (v: number) => {
		if (formatFn) return formatFn(v);
		if (isInteger) return String(Math.round(v));
		return String(v);
	};

	// For a single data point, pad with a synthetic earlier point to create a dotted line
	let chartData: { ts: string; v: number; synthetic?: boolean }[];
	if (sparkData.length === 1) {
		const realTs = timestamps[0];
		const syntheticTs = new Date(new Date(realTs).getTime() - 24 * 60 * 60 * 1000).toISOString();
		chartData = [
			{ ts: syntheticTs, v: sparkData[0], synthetic: true },
			{ ts: realTs, v: sparkData[0] },
		];
	} else {
		chartData = sparkData.map((v, i) => ({ ts: timestamps[i], v }));
	}

	// Y-axis: representative range with some padding
	const vals = sparkData;
	const min = Math.min(...vals);
	const max = Math.max(...vals);
	const padding = max === min ? Math.max(1, max * 0.2) : (max - min) * 0.1;
	const yMin = Math.max(0, min - padding);
	const yMax = max + padding;

	return (
		<>
			<button
				ref={triggerRef}
				type="button"
				className="cursor-default underline decoration-dotted underline-offset-2 opacity-70 hover:opacity-100 transition-opacity"
				onMouseEnter={() => setShow(true)}
				onMouseLeave={() => setShow(false)}
			>
				{label}: {value}
			</button>
			{show && createPortal(
				<div
					className="pointer-events-none fixed z-50 rounded-md border border-zinc-200 bg-white px-2 pt-3 pb-1 text-zinc-950 shadow-lg"
					style={{ left: pos.x, top: pos.y, transform: "translate(-50%, calc(-100% - 6px))" }}
				>
					<div style={{ width: 220, height: 90 }}>
						<ResponsiveContainer width="100%" height="100%">
							<LineChart data={chartData} margin={{ top: 4, right: 30, bottom: 2, left: 4 }}>
								<CartesianGrid strokeDasharray="3 3" vertical={false} />
								<XAxis
									dataKey="ts"
									ticks={[chartData[0].ts, chartData[chartData.length - 1].ts]}
									interval={0}
									tick={(props: any) => {
										const { x, y, payload } = props;
										const d = new Date(payload.value);
										const date = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
										const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
										return (
											<g transform={`translate(${x},${y})`}>
												<text x={0} y={0} dy={11} textAnchor="middle" fontSize={10} fill="currentColor" className="fill-muted-foreground">{date}</text>
												<text x={0} y={0} dy={22} textAnchor="middle" fontSize={9} fill="currentColor" className="fill-muted-foreground">{time}</text>
											</g>
										);
									}}
									height={32}
								/>
								<YAxis
									tick={{ fontSize: 9 }}
									tickFormatter={yTickFmt}
									width={40}
									domain={[isInteger ? Math.floor(yMin) : yMin, isInteger ? Math.ceil(yMax) : yMax]}
									allowDecimals={!isInteger}
								/>
								<Line
									type="monotone"
									dataKey="v"
									stroke={sparkColor}
									strokeWidth={1.5}
									dot={sparkData.length <= 3}
									connectNulls
									isAnimationActive={false}
									strokeDasharray={sparkData.length === 1 ? "4 3" : undefined}
								/>
							</LineChart>
						</ResponsiveContainer>
					</div>
				</div>,
				document.body,
			)}
		</>
	);
}

function ProviderRow({ data }: { data: TargetStatus }) {
	const { model, provider, rest } = parseTarget(data.target);
	const deduped = dedupeEntries(data.entries);
	const latest = getLatest(deduped);
	const uptime = passRate([data]);

	// Build sparkline data from all deduped entries
	const allTimestamps = deduped.map((e) => e.ts);
	const latencyData = deduped.map((e) => e.latency);
	const citationData = deduped.map((e) => e.citations);
	const webQueryData = deduped.map((e) => e.webQueries);
	const textData = deduped.map((e) => e.textLength);
	const retryData = deduped.map((e) => e.retries);


	return (
		<div className="space-y-2 rounded-md border border-zinc-200 bg-white p-4">
			<div className="flex items-center justify-between">
				<div>
					<span className="font-medium text-zinc-950">{formatProvider(provider)}</span>
					{rest && <span className="text-zinc-500"> ({["openrouter", "openai-api", "anthropic-api", "mistral-api"].includes(provider) ? rest : rest.replace(/online/g, "web search")})</span>}
				</div>
				<UptimeBadge entries={deduped} />
			</div>
			<UptimeBar entries={deduped} />
			<div className="flex flex-wrap gap-4 text-xs text-zinc-600">
				{latest && (
					<>
						<span>Success: {uptime !== null ? `${uptime.toFixed(1)}%` : "—"}</span>
						<StatWithSparkline
							label="Latency"
							value={formatLatency(latest.latency)}
							sparkData={latencyData}
							timestamps={allTimestamps}
							sparkColor="hsl(221, 83%, 53%)"
							formatFn={formatLatency}
						/>
						<StatWithSparkline
							label="Citations"
							value={String(latest.citations)}
							sparkData={citationData}
							timestamps={allTimestamps}
							sparkColor="hsl(262, 83%, 58%)"
						/>
						<StatWithSparkline
							label="Web Queries"
							value={String(latest.webQueries)}
							sparkData={webQueryData}
							timestamps={allTimestamps}
							sparkColor="hsl(174, 72%, 40%)"
						/>
						<StatWithSparkline
							label="Text"
							value={`${latest.textLength} chars`}
							sparkData={textData}
							timestamps={allTimestamps}
							sparkColor="hsl(38, 92%, 50%)"
							formatFn={(v) => `${v}`}
						/>
						<StatWithSparkline
							label="Retries"
							value={String(latest.retries)}
							sparkData={retryData}
							timestamps={allTimestamps}
							sparkColor="hsl(0, 84%, 60%)"
						/>
					</>
				)}
				{!latest && <span>No data yet</span>}
			</div>
			{latest?.error && (
				<div className="text-xs text-red-500">Error: {latest.error.slice(0, 120)}</div>
			)}
		</div>
	);
}

// ─── Page ─────────────────────────────────────────────────────────────────

function filterPillClass(active: boolean) {
	return `rounded-full border px-3 py-1 text-xs transition-colors ${
		active
			? "border-zinc-900 bg-zinc-900 text-white"
			: "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
	}`;
}

function FilterRow({
	label,
	options,
	selected,
	onToggle,
	onClear,
}: {
	label: string;
	options: { value: string; label: string }[];
	selected: Set<string>;
	onToggle: (value: string) => void;
	onClear: () => void;
}) {
	return (
		<div className="flex flex-wrap items-center gap-1.5">
			<span className="w-20 shrink-0 text-xs font-medium text-zinc-500">
				{label}
			</span>
			<button
				type="button"
				onClick={onClear}
				className={filterPillClass(selected.size === 0)}
			>
				All
			</button>
			{options.map((o) => (
				<button
					key={o.value}
					type="button"
					onClick={() => onToggle(o.value)}
					className={filterPillClass(selected.has(o.value))}
				>
					{o.label}
				</button>
			))}
		</div>
	);
}

// ─── At-a-glance matrix ───────────────────────────────────────────────────

function MatrixCellView({
	cell,
	availability,
}: {
	cell: MatrixCell | null;
	availability: CellAvailability;
}) {
	if (!cell) {
		if (availability === "unavailable") {
			return (
				<div
					className="flex h-9 items-center justify-center rounded-sm bg-zinc-50 text-[10px] font-medium text-zinc-300"
					style={{ backgroundImage: HATCH_BG }}
					title="Not available through this type of provider"
				>
					N/A
				</div>
			);
		}
		return (
			<div
				className="flex h-9 items-center justify-center rounded-sm bg-zinc-50 text-zinc-300"
				title="Not currently tracked by Elmo"
			>
				·
			</div>
		);
	}
	const tier = rateTier(cell.rate);
	return (
		<div
			className={`flex h-9 items-center justify-center rounded-sm text-xs font-medium tabular-nums ${TIER_CELL[tier]} ${
				cell.down ? "ring-2 ring-inset ring-red-500" : ""
			}`}
			title={cell.down ? "Last check failed" : undefined}
		>
			{cell.rate === null ? "—" : `${Math.round(cell.rate)}%`}
		</div>
	);
}

// Row / column / overall health cells: one shade darker than data cells, with
// the overall corner solid.
function MatrixSummaryCell({
	rate,
	solid,
}: {
	rate: number | null;
	solid?: boolean;
}) {
	const tier = rateTier(rate);
	return (
		<div
			className={`flex h-9 items-center justify-center rounded-sm text-xs font-semibold tabular-nums ${
				solid ? TIER_SOLID[tier] : TIER_CELL_AVG[tier]
			}`}
		>
			{rate === null ? "—" : `${Math.round(rate)}%`}
		</div>
	);
}

function StatusMatrix({ data }: { data: TargetStatus[] }) {
	const matrix = buildStatusMatrix(data);
	if (matrix.models.length === 0 || matrix.providers.length === 0) return null;

	// Columns split into two groups — Model APIs and AI Search Scrapers — with a
	// gap between them. matrix.providers is already in PROVIDER_FILTER_ORDER, so
	// the Model API categories sort ahead of the scrapers.
	const apiProviders = matrix.providers.filter((p) => MODEL_API_CATEGORIES.includes(p));
	const scraperProviders = matrix.providers.filter((p) => !MODEL_API_CATEGORIES.includes(p));
	const grouped = apiProviders.length > 0 && scraperProviders.length > 0;

	// A narrow spacer track sets the aggregate-health band (right column and
	// bottom row) apart from the per-target cells — the darker shading and the
	// solid corner then carry it without needing a label. When grouped, a wider
	// track separates the two column groups.
	const gridColumns = grouped
		? `minmax(112px, 1.4fr) repeat(${apiProviders.length}, minmax(52px, 1fr)) 16px repeat(${scraperProviders.length}, minmax(52px, 1fr)) 10px minmax(60px, 0.9fr)`
		: `minmax(112px, 1.4fr) repeat(${matrix.providers.length}, minmax(52px, 1fr)) 10px minmax(60px, 0.9fr)`;

	// Model API columns, an optional group gap, then scraper columns — the cell
	// order every row of the grid follows.
	const renderProviderCells = (render: (p: string) => ReactNode) => (
		<>
			{apiProviders.map(render)}
			{grouped && <div />}
			{scraperProviders.map(render)}
		</>
	);

	return (
		<Card className="mb-8">
			<CardHeader className="flex flex-row flex-wrap items-center justify-between gap-x-4 gap-y-2">
				<CardTitle>LLM Provider Status</CardTitle>
				<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
					<span className="flex items-center gap-1.5">
						<span className="size-3 rounded-sm bg-green-100" />≥99%
					</span>
					<span className="flex items-center gap-1.5">
						<span className="size-3 rounded-sm bg-amber-100" />≥90%
					</span>
					<span className="flex items-center gap-1.5">
						<span className="size-3 rounded-sm bg-red-100" />&lt;90%
					</span>
					<span className="flex items-center gap-1.5">
						<span className="size-3 rounded-sm ring-2 ring-inset ring-red-500" />last check failed
					</span>
					<span className="flex items-center gap-1.5">
						<span className="flex size-3 items-center justify-center rounded-sm bg-zinc-100 text-[9px] leading-none text-zinc-400">
							·
						</span>
						not tracked
					</span>
					<span className="flex items-center gap-1.5">
						<span
							className="size-3 rounded-sm bg-zinc-100"
							style={{ backgroundImage: HATCH_BG }}
						/>
						not available
					</span>
				</div>
			</CardHeader>
			<CardContent>
				<div className="overflow-x-auto">
					<div
						className="grid min-w-[640px] gap-1"
						style={{ gridTemplateColumns: gridColumns }}
					>
						{grouped && (
							<>
								<div />
								<div
									className="border-b border-zinc-200 px-1 pb-1 text-center text-[10px] font-semibold uppercase tracking-wide text-zinc-400"
									style={{ gridColumn: `span ${apiProviders.length}` }}
								>
									Model APIs
								</div>
								<div />
								<div
									className="border-b border-zinc-200 px-1 pb-1 text-center text-[10px] font-semibold uppercase tracking-wide text-zinc-400"
									style={{ gridColumn: `span ${scraperProviders.length}` }}
								>
									AI Search Scrapers
								</div>
								<div />
								<div />
							</>
						)}
						<div />
						{renderProviderCells((p) => (
							<div
								key={p}
								className="px-1 pb-1 text-center text-[11px] font-medium text-zinc-500"
							>
								{PROVIDER_FILTER_LABELS[p] ?? p}
							</div>
						))}
						<div />
						<div />
						{matrix.models.map((model) => (
							<Fragment key={model}>
								<div className="flex items-center pr-2 text-sm font-medium text-zinc-700">
									{formatModel(model)}
								</div>
								{renderProviderCells((p) => (
									<MatrixCellView
										key={p}
										cell={matrix.cell(model, p)}
										availability={matrix.availability(model, p)}
									/>
								))}
								<div />
								<MatrixSummaryCell rate={matrix.rowRate(model)} />
							</Fragment>
						))}
						<div className="col-span-full h-2" />
						<div />
						{renderProviderCells((p) => (
							<MatrixSummaryCell key={p} rate={matrix.colRate(p)} />
						))}
						<div />
						<MatrixSummaryCell rate={matrix.overall} solid />
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

function StatusPage() {
	const data = Route.useLoaderData();
	const [selectedProviders, setSelectedProviders] = useState<Set<string>>(
		new Set(),
	);
	const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());

	const toggleProvider = (value: string) =>
		setSelectedProviders((prev) => {
			const next = new Set(prev);
			if (next.has(value)) next.delete(value);
			else next.add(value);
			return next;
		});
	const toggleModel = (value: string) =>
		setSelectedModels((prev) => {
			const next = new Set(prev);
			if (next.has(value)) next.delete(value);
			else next.add(value);
			return next;
		});

	const providerOptions = PROVIDER_FILTER_ORDER.filter((c) =>
		data.some((d) => providerCategory(parseTarget(d.target).provider) === c),
	).map((c) => ({ value: c, label: PROVIDER_FILTER_LABELS[c] ?? c }));
	const modelOptions = [...new Set(data.map((d) => parseTarget(d.target).model))]
		.sort((a, b) => formatModel(a).localeCompare(formatModel(b)))
		.map((m) => ({ value: m, label: formatModel(m) }));

	const filteredData = data.filter((d) => {
		const { model, provider } = parseTarget(d.target);
		const providerOk =
			selectedProviders.size === 0 ||
			selectedProviders.has(providerCategory(provider));
		const modelOk = selectedModels.size === 0 || selectedModels.has(model);
		return providerOk && modelOk;
	});

	const groups = groupByModel(filteredData);

	return (
		<div className="min-h-screen">
			<Navbar />
			<main className="mx-auto max-w-6xl px-4 py-10 md:px-6">
				<div className="mb-8">
					<p className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">
						/ STATUS
					</p>
					<h1 className="font-heading text-3xl text-zinc-950 md:text-4xl">Provider Status</h1>
					<p className="mt-2 text-zinc-600">
						Status of the third-party AI providers and scraping services Elmo
						uses to track your brand's visibility and citations. Tests run
						automatically 4 times per day. Latencies shown are for individual
						prompt evaluations; batches can vary significantly.
					</p>
				</div>

				{/* Elmo Cloud status pointer */}
				<div className="mb-8 flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
					<span>Looking for Elmo Cloud's status?</span>
					<a
						href="https://status.elmohq.com/"
						target="_blank"
						rel={externalRel("https://status.elmohq.com/")}
						className="font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700"
					>
						status.elmohq.com
					</a>
				</div>

				{/* At-a-glance matrix — all providers, independent of the filters below */}
				<StatusMatrix data={data} />

				{/* Full breakdown — a titled rule separates the detail from the overview */}
				<div className="mt-4 mb-6 border-t border-zinc-200 pt-10">
					<h2 className="font-heading text-2xl text-zinc-950">Full breakdown</h2>
					<p className="mt-1 text-sm text-zinc-600">
						Filter to a provider or model, then expand any target for its 7-day
						run history, latency, citations, and errors.
					</p>
				</div>

				{/* Filters scope the per-provider detail and latency chart below */}
				<div className="mb-8 space-y-2">
					<FilterRow
						label="Provider"
						options={providerOptions}
						selected={selectedProviders}
						onToggle={toggleProvider}
						onClear={() => setSelectedProviders(new Set())}
					/>
					<FilterRow
						label="Model"
						options={modelOptions}
						selected={selectedModels}
						onToggle={toggleModel}
						onClear={() => setSelectedModels(new Set())}
					/>
				</div>

				{/* Provider status rows grouped by model */}
				{filteredData.length === 0 && (
					<p className="rounded-md border border-zinc-200 bg-white p-4 text-sm text-zinc-500">
						No providers match the selected filters.
					</p>
				)}
				<div className="space-y-8">
					{Object.entries(groups)
						.sort(([a], [b]) => a.localeCompare(b))
						.map(([model, targets]) => (
							<div key={model}>
								<h2 className="mb-3 text-lg font-semibold text-zinc-950">{formatModel(model)}</h2>
								<div className="space-y-2">
									{targets.map((t) => (
										<ProviderRow key={t.target} data={t} />
									))}
								</div>
							</div>
						))}
				</div>

				{/* Latency chart */}
				<Card className="mt-10">
					<CardHeader>
						<CardTitle>Evaluation Latency</CardTitle>
					</CardHeader>
					<CardContent>
						<LatencyChart data={filteredData} />
					</CardContent>
				</Card>

				<p className="mt-8 text-center text-xs text-zinc-500">
					Provider tests run every 6 hours via GitHub Actions.
					Each test sends a real query and validates the response.
				</p>
			</main>
			<Footer />
		</div>
	);
}
