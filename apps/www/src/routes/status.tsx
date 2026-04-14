import { createFileRoute } from "@tanstack/react-router";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { ogMeta, canonicalUrl, breadcrumbJsonLd } from "@/lib/seo";
import { getStatusData, type TargetStatus, type StatusEntry } from "@/lib/status";
import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
	type ChartConfig,
} from "@workspace/ui/components/chart";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Badge } from "@workspace/ui/components/badge";
import { useState, useRef } from "react";
import {
	LineChart,
	Line,
	XAxis,
	YAxis,
	CartesianGrid,
	ResponsiveContainer,
} from "recharts";

const title = "Provider Status — Elmo";
const description =
	"Real-time status and performance monitoring for AI search provider integrations.";

export const Route = createFileRoute("/status")({
	head: () => ({
		meta: [
			{ title },
			{ name: "description", content: description },
			...ogMeta({ title, description, path: "/status" }),
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

function parseTarget(target: string) {
	const parts = target.split(":");
	const model = parts[0];
	const provider = parts[1];
	const rest = parts.slice(2).join(":");
	return { model, provider, rest };
}

function formatModel(model: string) {
	const names: Record<string, string> = {
		chatgpt: "ChatGPT",
		claude: "Claude",
		gemini: "Gemini",
		grok: "Grok",
		perplexity: "Perplexity",
		copilot: "Copilot",
		deepseek: "DeepSeek",
		mistral: "Mistral",
		"google-ai-mode": "Google AI Mode",
		"google-ai-overview": "Google AI Overview",
	};
	return names[model] || model;
}

function formatProvider(provider: string) {
	const names: Record<string, string> = {
		olostep: "Olostep",
		brightdata: "BrightData",
		dataforseo: "DataForSEO",
		"openai-api": "OpenAI API",
		"anthropic-api": "Anthropic API",
		openrouter: "OpenRouter",
	};
	return names[provider] || provider;
}

function formatLatency(ms: number) {
	if (ms < 1000) return `${ms}ms`;
	if (ms < 10_000) return `${(ms / 1000).toFixed(1)}s`;
	const s = Math.floor(ms / 1000);
	const m = Math.floor(s / 60);
	return m > 0 ? `${m}m${(s % 60).toString().padStart(2, "0")}s` : `${s}s`;
}

function getUptime(entries: StatusEntry[]) {
	if (entries.length === 0) return null;
	const passes = entries.filter((e) => e.status === "pass").length;
	return (passes / entries.length) * 100;
}

function getLatest(entries: StatusEntry[]): StatusEntry | null {
	if (entries.length === 0) return null;
	return entries[entries.length - 1];
}

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

// Deduplicate entries that are within 5 minutes of each other (same run)
function dedupeEntries(entries: StatusEntry[]): StatusEntry[] {
	if (entries.length === 0) return [];
	const result: StatusEntry[] = [entries[0]];
	for (let i = 1; i < entries.length; i++) {
		const prev = new Date(result[result.length - 1].ts).getTime();
		const curr = new Date(entries[i].ts).getTime();
		if (curr - prev > 5 * 60 * 1000) {
			result.push(entries[i]);
		}
	}
	return result;
}

// ─── Components ───────────────────────────────────────────────────────────

function UptimeBadge({ entries }: { entries: StatusEntry[] }) {
	const uptime = getUptime(entries);
	if (uptime === null) return <Badge variant="outline">No data</Badge>;
	if (uptime >= 99) return <Badge className="bg-green-600 text-white">Operational</Badge>;
	if (uptime >= 90) return <Badge className="bg-yellow-500 text-white">Degraded</Badge>;
	return <Badge className="bg-red-600 text-white">Down</Badge>;
}

function UptimeBar({ entries }: { entries: StatusEntry[] }) {
	const deduped = dedupeEntries(entries);
	if (deduped.length === 0) return null;

	// Show last 7 days as a horizontal bar of pass/fail dots
	const now = Date.now();
	const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

	// Bucket into 6-hour windows (28 buckets for 7 days)
	const buckets: ("pass" | "fail" | "none")[] = Array(28).fill("none");
	for (const entry of deduped) {
		const t = new Date(entry.ts).getTime();
		if (t < sevenDaysAgo) continue;
		const idx = Math.floor(((t - sevenDaysAgo) / (7 * 24 * 60 * 60 * 1000)) * 28);
		const bi = Math.min(idx, 27);
		if (buckets[bi] === "none" || entry.status === "fail") {
			buckets[bi] = entry.status;
		}
	}

	return (
		<div className="flex gap-0.5">
			{buckets.map((b, i) => (
				<div
					key={i}
					className={`h-6 flex-1 rounded-sm ${
						b === "pass"
							? "bg-green-500"
							: b === "fail"
								? "bg-red-500"
								: "bg-muted"
					}`}
				/>
			))}
		</div>
	);
}

function LatencyChart({ data }: { data: TargetStatus[] }) {
	// Merge all targets into a time-series chart
	// Bucket by ~6 hours for a clean chart
	const allTimestamps = new Set<string>();
	const targetNames = data.map((d) => {
		const { model, provider } = parseTarget(d.target);
		return `${formatModel(model)} (${formatProvider(provider)})`;
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
			<div className="text-muted-foreground py-12 text-center text-sm">
				No latency data available yet. Data will appear after the first scheduled run.
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
					content={
						<ChartTooltipContent
							formatter={(value, name) => (
								<>
									<span className="text-muted-foreground flex-1">{name}</span>
									<span className="font-mono font-medium tabular-nums">{formatLatency(value as number)}</span>
								</>
							)}
						/>
					}
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

function Sparkline({ data, color = "currentColor" }: { data: number[]; color?: string }) {
	if (data.length < 2) return null;
	const min = Math.min(...data);
	const max = Math.max(...data);
	const range = max - min || 1;
	const w = 120;
	const h = 32;
	const pad = 2;
	const points = data
		.map((v, i) => {
			const x = pad + (i / (data.length - 1)) * (w - 2 * pad);
			const y = h - pad - ((v - min) / range) * (h - 2 * pad);
			return `${x},${y}`;
		})
		.join(" ");

	return (
		<svg width={w} height={h} className="block">
			<polyline
				points={points}
				fill="none"
				stroke={color}
				strokeWidth={1.5}
				strokeLinejoin="round"
				strokeLinecap="round"
			/>
		</svg>
	);
}

function StatWithSparkline({
	label,
	value,
	sparkData,
	sparkColor,
	formatFn,
}: {
	label: string;
	value: string;
	sparkData: number[];
	sparkColor?: string;
	formatFn?: (v: number) => string;
}) {
	const [show, setShow] = useState(false);
	const ref = useRef<HTMLSpanElement>(null);

	return (
		<span
			ref={ref}
			className="relative cursor-default"
			onMouseEnter={() => setShow(true)}
			onMouseLeave={() => setShow(false)}
		>
			{label}: {value}
			{show && sparkData.length >= 2 && (
				<span className="border-border/50 bg-background absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 rounded-md border p-2 shadow-lg">
					<span className="text-muted-foreground mb-1 block text-center text-[10px]">Last 7 days</span>
					<Sparkline data={sparkData} color={sparkColor} />
					<span className="text-muted-foreground mt-1 flex justify-between text-[10px]">
						<span>{formatFn ? formatFn(Math.min(...sparkData)) : Math.min(...sparkData)}</span>
						<span>{formatFn ? formatFn(Math.max(...sparkData)) : Math.max(...sparkData)}</span>
					</span>
				</span>
			)}
		</span>
	);
}

function ProviderRow({ data }: { data: TargetStatus }) {
	const { model, provider, rest } = parseTarget(data.target);
	const deduped = dedupeEntries(data.entries);
	const latest = getLatest(deduped);
	const uptime = getUptime(deduped);

	// Build sparkline data from deduped entries (only passes)
	const passEntries = deduped.filter((e) => e.status === "pass");
	const latencyData = passEntries.map((e) => e.latency);
	const citationData = passEntries.map((e) => e.citations);
	const textData = passEntries.map((e) => e.textLength);

	// Rolling uptime: compute uptime % over sliding windows
	const uptimeData: number[] = [];
	const windowSize = Math.max(3, Math.floor(deduped.length / 10));
	for (let i = windowSize; i <= deduped.length; i++) {
		const window = deduped.slice(i - windowSize, i);
		const passes = window.filter((e) => e.status === "pass").length;
		uptimeData.push((passes / window.length) * 100);
	}

	return (
		<div className="space-y-2 rounded-lg border p-4">
			<div className="flex items-center justify-between">
				<div>
					<span className="font-medium">{formatProvider(provider)}</span>
					{rest && <span className="text-muted-foreground"> ({provider === "openrouter" ? rest : rest.replace(/online/g, "web search")})</span>}
				</div>
				<UptimeBadge entries={deduped} />
			</div>
			<UptimeBar entries={deduped} />
			<div className="text-muted-foreground flex flex-wrap gap-4 text-xs">
				{latest && (
					<>
						<StatWithSparkline
							label="Latency"
							value={formatLatency(latest.latency)}
							sparkData={latencyData}
							sparkColor="hsl(221, 83%, 53%)"
							formatFn={formatLatency}
						/>
						<StatWithSparkline
							label="Uptime"
							value={uptime !== null ? `${uptime.toFixed(1)}%` : "—"}
							sparkData={uptimeData}
							sparkColor="hsl(142, 71%, 45%)"
							formatFn={(v) => `${v.toFixed(0)}%`}
						/>
						<StatWithSparkline
							label="Citations"
							value={String(latest.citations)}
							sparkData={citationData}
							sparkColor="hsl(262, 83%, 58%)"
						/>
						<StatWithSparkline
							label="Text"
							value={`${latest.textLength} chars`}
							sparkData={textData}
							sparkColor="hsl(38, 92%, 50%)"
							formatFn={(v) => `${v}`}
						/>
						{latest.retries > 0 && <span>Retries: {latest.retries}</span>}
						{latest.error && <span className="text-red-500">Error: {latest.error.slice(0, 60)}</span>}
					</>
				)}
				{!latest && <span>No data yet</span>}
			</div>
		</div>
	);
}

// ─── Page ─────────────────────────────────────────────────────────────────

function StatusPage() {
	const data = Route.useLoaderData();
	const groups = groupByModel(data);

	// Overall stats
	const allLatest = data
		.map((d) => getLatest(dedupeEntries(d.entries)))
		.filter((e): e is StatusEntry => e !== null);
	const allOperational = allLatest.length > 0 && allLatest.every((e) => e.status === "pass");
	const failCount = allLatest.filter((e) => e.status === "fail").length;

	return (
		<div className="min-h-screen">
			<Navbar />
			<main className="mx-auto max-w-5xl px-4 py-10 md:px-6">
				<div className="mb-8">
					<h1 className="font-heading text-3xl md:text-4xl">Provider Status</h1>
					<p className="text-muted-foreground mt-2">
						Real-time monitoring of AI search provider integrations. Tests run
						automatically 4 times per day.
					</p>
				</div>

				{/* Overall status banner */}
				<Card className={`mb-8 border-2 ${allOperational ? "border-green-500/30" : failCount > 0 ? "border-red-500/30" : "border-border"}`}>
					<CardContent className="flex items-center gap-5 py-8">
						<div className="relative flex items-center justify-center">
							<div
								className={`size-5 rounded-full ${allOperational ? "bg-green-500" : failCount > 0 ? "bg-red-500" : "bg-muted"}`}
							/>
							{(allOperational || failCount > 0) && (
								<div
									className={`absolute size-5 animate-ping rounded-full opacity-30 ${allOperational ? "bg-green-500" : "bg-red-500"}`}
								/>
							)}
						</div>
						<div>
							<p className="text-xl font-semibold">
								{allLatest.length === 0
									? "Waiting for data"
									: allOperational
										? "All Systems Operational"
										: `${failCount} provider${failCount !== 1 ? "s" : ""} experiencing issues`}
							</p>
							{allLatest.length > 0 && (
								<p className="text-muted-foreground mt-1 text-sm">
									Last checked{" "}
									{new Date(
										Math.max(...allLatest.map((e) => new Date(e.ts).getTime())),
									).toLocaleString()}
								</p>
							)}
						</div>
					</CardContent>
				</Card>

				{/* Provider status rows grouped by model */}
				<div className="space-y-8">
					{Object.entries(groups)
						.sort(([a], [b]) => a.localeCompare(b))
						.map(([model, targets]) => (
							<div key={model}>
								<h2 className="mb-3 text-lg font-semibold">{formatModel(model)}</h2>
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
						<CardTitle>Latency Over Time (7 days)</CardTitle>
					</CardHeader>
					<CardContent>
						<LatencyChart data={data} />
					</CardContent>
				</Card>

				<p className="text-muted-foreground mt-8 text-center text-xs">
					Provider tests run every 6 hours via GitHub Actions.
					Each test sends a real query and validates the response.
				</p>
			</main>
			<Footer />
		</div>
	);
}
