const CATEGORY_COLORS = {
	brand: { bg: "bg-emerald-500", text: "text-emerald-700", light: "bg-emerald-100", hex: "#10b981" },
	competitor: { bg: "bg-rose-500", text: "text-rose-700", light: "bg-rose-100", hex: "#ef4444" },
	social: { bg: "bg-violet-500", text: "text-violet-700", light: "bg-violet-100", hex: "#8b5cf6" },
	google: { bg: "bg-blue-500", text: "text-blue-700", light: "bg-blue-100", hex: "#4285f4" },
	institutional: { bg: "bg-amber-500", text: "text-amber-700", light: "bg-amber-100", hex: "#f59e0b" },
	other: { bg: "bg-gray-400", text: "text-gray-600", light: "bg-gray-100", hex: "#9ca3af" },
} as const;

const CATEGORY_ORDER: (keyof typeof CATEGORY_COLORS)[] = [
	"brand", "competitor", "social", "google", "institutional", "other",
];

function GraphicShell({ children, className }: { children: React.ReactNode; className?: string }) {
	return (
		<div className={`overflow-hidden rounded-xl border bg-white shadow-sm ${className ?? ""}`}>
			<div className="flex items-center gap-1.5 border-b px-3 py-2">
				<div className="size-2.5 rounded-full bg-rose-400" />
				<div className="size-2.5 rounded-full bg-amber-400" />
				<div className="size-2.5 rounded-full bg-emerald-400" />
				<div className="ml-2 h-4 w-32 rounded bg-muted" />
			</div>
			<div className="p-4">{children}</div>
		</div>
	);
}

function CategoryBadge({ label, color }: { label: string; color: keyof typeof CATEGORY_COLORS }) {
	const c = CATEGORY_COLORS[color];
	return (
		<span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${c.light} ${c.text}`}>
			<span className={`size-1.5 rounded-full ${c.bg}`} />
			{label}
		</span>
	);
}

function svgAreaPath(data: number[], width: number, height: number, rangeMin: number, rangeMax: number) {
	const points = data.map((v, i) => {
		const x = (i / (data.length - 1)) * width;
		const y = height - ((v - rangeMin) / (rangeMax - rangeMin)) * height;
		return { x, y };
	});
	const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
	const area = `${line} L${width},${height} L0,${height} Z`;
	return { line, area, points };
}

// ---------------------------------------------------------------------------
// Overview / Dashboard Page Graphic
// ---------------------------------------------------------------------------

export function OverviewPageGraphic() {
	const visData = [45, 48, 52, 50, 55, 58, 56, 60, 63, 62, 65, 68, 66, 70, 72];
	const { line: visLine, area: visArea } = svgAreaPath(visData, 200, 60, 35, 80);

	const stackRaw = [
		[34, 22, 14, 8, 12, 10],
		[36, 20, 16, 9, 10, 9],
		[38, 21, 15, 10, 9, 7],
		[35, 24, 14, 8, 11, 8],
		[37, 23, 16, 7, 10, 7],
		[40, 22, 15, 9, 8, 6],
		[39, 25, 13, 8, 9, 6],
		[42, 21, 14, 10, 7, 6],
		[41, 23, 15, 8, 8, 5],
		[43, 20, 16, 9, 7, 5],
	];
	const stackW = 200;
	const stackH = 50;

	function stackedAreaPaths(raw: number[][], w: number, h: number) {
		const totals = raw.map((r) => r.reduce((a, b) => a + b, 0));
		const catCount = raw[0].length;
		const cumulative = raw.map((row) => {
			const cum: number[] = [];
			let acc = 0;
			for (const v of row) {
				acc += v;
				cum.push(acc);
			}
			return cum;
		});

		const paths: string[] = [];
		for (let c = catCount - 1; c >= 0; c--) {
			const upper = cumulative.map((cum, i) => {
				const x = (i / (raw.length - 1)) * w;
				const y = h - (cum[c] / totals[i]) * h;
				return `${x},${y}`;
			});
			const lower = cumulative.map((cum, i) => {
				const x = (i / (raw.length - 1)) * w;
				const y = c === 0 ? h : h - (cum[c - 1] / totals[i]) * h;
				return `${x},${y}`;
			});
			paths.push(`M${upper.join(" L")} L${lower.reverse().join(" L")} Z`);
		}
		return paths;
	}

	const stackPaths = stackedAreaPaths(stackRaw, stackW, stackH);
	const catHexes = CATEGORY_ORDER.map((k) => CATEGORY_COLORS[k].hex);

	return (
		<GraphicShell>
			{/* Stat cards row */}
			<div className="grid grid-cols-4 gap-2">
				{[
					{ label: "Prompts Tracked", value: "148" },
					{ label: "Evaluations (30d)", value: "4,216" },
					{ label: "Unique Citations", value: "892" },
					{ label: "Run Frequency", value: "~6h" },
				].map((s) => (
					<div key={s.label} className="rounded-lg border p-2 text-center">
						<div className="text-sm font-bold leading-tight">{s.value}</div>
						<div className="mt-0.5 text-[8px] text-muted-foreground leading-tight">{s.label}</div>
					</div>
				))}
			</div>

			{/* Visibility row */}
			<div className="mt-3 flex gap-3">
				{/* Visibility score card */}
				<div className="w-1/3 rounded-lg border p-3">
					<div className="text-[10px] text-muted-foreground">Current Visibility</div>
					<div className="relative mx-auto mt-1 flex size-16 items-center justify-center">
						<svg viewBox="0 0 36 36" className="size-full -rotate-90">
							<circle cx="18" cy="18" r="15.5" fill="none" stroke="#e5e7eb" strokeWidth="3" />
							<circle
								cx="18" cy="18" r="15.5" fill="none"
								stroke="#10b981" strokeWidth="3"
								strokeDasharray="70 100"
								strokeLinecap="round"
							/>
						</svg>
						<div className="absolute inset-0 flex flex-col items-center justify-center">
							<span className="text-base font-bold text-emerald-600">72%</span>
						</div>
					</div>
					<div className="mt-1 text-center text-[9px] text-emerald-600">↑ 12% vs last month</div>
				</div>

				{/* Visibility trend chart */}
				<div className="flex-1 rounded-lg border p-3">
					<div className="text-[10px] text-muted-foreground">Visibility Trends (30d)</div>
					<svg viewBox={`0 0 200 60`} className="mt-1 h-14 w-full" preserveAspectRatio="none">
						<defs>
							<linearGradient id="ovVisFill" x1="0" y1="0" x2="0" y2="1">
								<stop offset="0%" stopColor="#10b981" stopOpacity="0.2" />
								<stop offset="100%" stopColor="#10b981" stopOpacity="0" />
							</linearGradient>
						</defs>
						{[0, 1, 2, 3].map((i) => (
							<line key={i} x1="0" y1={i * 20} x2="200" y2={i * 20} stroke="#f3f4f6" strokeWidth="0.5" />
						))}
						<path d={visArea} fill="url(#ovVisFill)" />
						<path d={visLine} fill="none" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" />
					</svg>
				</div>
			</div>

			{/* Citation trends */}
			<div className="mt-3 rounded-lg border p-3">
				<div className="flex items-center justify-between">
					<span className="text-[10px] text-muted-foreground">Citation Category Trends (30d)</span>
					<div className="flex gap-2">
						{(["brand", "competitor", "social"] as const).map((c) => (
							<span key={c} className="flex items-center gap-0.5 text-[8px] text-muted-foreground">
								<span className={`inline-block size-1.5 rounded-full ${CATEGORY_COLORS[c].bg}`} />
								{c === "brand" ? "Brand" : c === "competitor" ? "Competitor" : "Social"}
							</span>
						))}
					</div>
				</div>
				<svg viewBox={`0 0 ${stackW} ${stackH}`} className="mt-1 h-10 w-full" preserveAspectRatio="none">
					{stackPaths.map((d, i) => (
						<path key={i} d={d} fill={catHexes[i]} opacity="0.7" />
					))}
				</svg>
			</div>
		</GraphicShell>
	);
}

// ---------------------------------------------------------------------------
// Visibility Page Graphic
// ---------------------------------------------------------------------------

export function VisibilityPageGraphic() {
	const prompts = [
		{
			text: "What is the best AI visibility tool for SaaS companies?",
			vis: 85,
			trend: [60, 65, 68, 72, 70, 75, 78, 80, 82, 85],
			compTrend: [50, 48, 52, 49, 47, 45, 50, 48, 46, 44],
		},
		{
			text: "How do brands track their AI search presence?",
			vis: 62,
			trend: [40, 42, 45, 48, 50, 52, 55, 58, 60, 62],
			compTrend: [55, 53, 50, 52, 48, 51, 49, 47, 45, 48],
		},
		{
			text: "Compare AI visibility platforms for enterprise",
			vis: 41,
			trend: [30, 28, 32, 35, 33, 36, 38, 40, 39, 41],
			compTrend: [60, 62, 58, 55, 57, 54, 52, 50, 53, 51],
		},
	];

	function miniLine(data: number[], w: number, h: number, color: string, dashed = false) {
		const max = 100;
		const min = 20;
		const pts = data.map((v, i) => {
			const x = (i / (data.length - 1)) * w;
			const y = h - ((v - min) / (max - min)) * h;
			return `${i === 0 ? "M" : "L"}${x},${y}`;
		}).join(" ");
		return (
			<path
				d={pts} fill="none" stroke={color}
				strokeWidth={dashed ? "1" : "1.5"}
				strokeLinecap="round"
				strokeDasharray={dashed ? "3 2" : undefined}
			/>
		);
	}

	return (
		<GraphicShell>
			{/* Model selector tabs */}
			<div className="flex items-center gap-3">
				<div className="flex gap-1">
					{["All", "OpenAI", "Anthropic", "Google"].map((m, i) => (
						<span
							key={m}
							className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${
								i === 0
									? "bg-primary text-primary-foreground"
									: "bg-muted text-muted-foreground"
							}`}
						>
							{m}
						</span>
					))}
				</div>
				<div className="ml-auto flex items-center gap-1 rounded-md border bg-muted/50 px-2 py-1">
					<svg className="size-2.5 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
						<circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
					</svg>
					<span className="text-[9px] text-muted-foreground">Search prompts…</span>
				</div>
				<div className="flex gap-0.5">
					{["1w", "1mo", "3mo"].map((p, i) => (
						<span
							key={p}
							className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${
								i === 1 ? "bg-foreground text-background" : "text-muted-foreground"
							}`}
						>
							{p}
						</span>
					))}
				</div>
			</div>

			{/* Summary bar */}
			<div className="mt-3 flex items-center gap-4 rounded-lg border bg-emerald-50/50 px-3 py-2">
				<span className="text-lg font-bold text-emerald-600">72%</span>
				<svg viewBox="0 0 48 16" className="h-3 w-10">
					{(() => {
						const d = [45, 52, 55, 60, 63, 68, 72];
						const pts = d.map((v, i) => {
							const x = (i / (d.length - 1)) * 48;
							const y = 16 - ((v - 40) / 40) * 16;
							return `${i === 0 ? "M" : "L"}${x},${y}`;
						}).join(" ");
						return <path d={pts} fill="none" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" />;
					})()}
				</svg>
				<div className="flex gap-3 text-[9px] text-muted-foreground">
					<span>148 prompts</span>
					<span>4,216 runs</span>
					<span>892 citations</span>
				</div>
			</div>

			{/* Prompt cards */}
			<div className="mt-2.5 space-y-2">
				{prompts.map((p) => (
					<div key={p.text} className="rounded-lg border px-3 py-2">
						<div className="flex items-start justify-between gap-2">
							<span className="flex-1 text-[10px] leading-relaxed">{p.text}</span>
							<span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
								p.vis >= 75 ? "bg-emerald-100 text-emerald-700"
									: p.vis >= 45 ? "bg-amber-100 text-amber-700"
									: "bg-rose-100 text-rose-700"
							}`}>
								{p.vis}%
							</span>
						</div>
						<svg viewBox="0 0 200 32" className="mt-1 h-5 w-full" preserveAspectRatio="none">
							{[0, 1, 2].map((i) => (
								<line key={i} x1="0" y1={i * 16} x2="200" y2={i * 16} stroke="#f3f4f6" strokeWidth="0.5" />
							))}
							{miniLine(p.compTrend, 200, 32, "#fca5a5", true)}
							{miniLine(p.trend, 200, 32, "#10b981")}
						</svg>
					</div>
				))}
			</div>

			{/* Legend */}
			<div className="mt-2 flex justify-center gap-4 text-[9px] text-muted-foreground">
				<span className="flex items-center gap-1">
					<span className="inline-block h-0.5 w-3 rounded-full bg-emerald-500" />Your Brand
				</span>
				<span className="flex items-center gap-1">
					<span className="inline-block h-0.5 w-3 rounded-full bg-rose-300" style={{ backgroundImage: "repeating-linear-gradient(90deg, transparent, transparent 2px, white 2px, white 4px)" }} />Competitor
				</span>
			</div>
		</GraphicShell>
	);
}

// ---------------------------------------------------------------------------
// Citations Page Graphic
// ---------------------------------------------------------------------------

export function CitationsPageGraphic() {
	const stackRaw = [
		[34, 22, 14, 8, 12, 10],
		[36, 20, 16, 9, 10, 9],
		[38, 21, 15, 10, 9, 7],
		[35, 24, 14, 8, 11, 8],
		[37, 23, 16, 7, 10, 7],
		[40, 22, 15, 9, 8, 6],
		[39, 25, 13, 8, 9, 6],
		[42, 21, 14, 10, 7, 6],
		[41, 23, 15, 8, 8, 5],
		[43, 20, 16, 9, 7, 5],
		[44, 22, 14, 8, 6, 6],
		[42, 24, 15, 9, 5, 5],
	];
	const stackW = 240;
	const stackH = 60;
	const catHexes = CATEGORY_ORDER.map((k) => CATEGORY_COLORS[k].hex);

	function stackedAreaPaths(raw: number[][], w: number, h: number) {
		const totals = raw.map((r) => r.reduce((a, b) => a + b, 0));
		const catCount = raw[0].length;
		const cumulative = raw.map((row) => {
			const cum: number[] = [];
			let acc = 0;
			for (const v of row) {
				acc += v;
				cum.push(acc);
			}
			return cum;
		});

		const paths: string[] = [];
		for (let c = catCount - 1; c >= 0; c--) {
			const upper = cumulative.map((cum, i) => {
				const x = (i / (raw.length - 1)) * w;
				const y = h - (cum[c] / totals[i]) * h;
				return `${x},${y}`;
			});
			const lower = cumulative.map((cum, i) => {
				const x = (i / (raw.length - 1)) * w;
				const y = c === 0 ? h : h - (cum[c - 1] / totals[i]) * h;
				return `${x},${y}`;
			});
			paths.push(`M${upper.join(" L")} L${lower.reverse().join(" L")} Z`);
		}
		return paths;
	}

	const stackPaths = stackedAreaPaths(stackRaw, stackW, stackH);

	const domains = [
		{ domain: "yourbrand.com", count: 47, pct: 100, category: "brand" as const },
		{ domain: "reddit.com/r/saas", count: 38, pct: 81, category: "social" as const },
		{ domain: "competitor.io", count: 31, pct: 66, category: "competitor" as const },
		{ domain: "docs.google.com", count: 24, pct: 51, category: "google" as const },
		{ domain: "harvard.edu", count: 18, pct: 38, category: "institutional" as const },
	];

	const recentChanges = [
		{ type: "new" as const, url: "yourbrand.com/blog/ai-guide", desc: "0 → 5 citations" },
		{ type: "new" as const, url: "reddit.com/r/saas/best-tools", desc: "0 → 3 citations" },
		{ type: "dropped" as const, url: "old-blog.com/article", desc: "4 → 0 citations" },
	];

	return (
		<GraphicShell>
			{/* Stats cards */}
			<div className="grid grid-cols-4 gap-2">
				<div className="rounded-lg border p-2 text-center">
					<div className="text-sm font-bold text-emerald-600">38%</div>
					<div className="mt-0.5 text-[8px] text-muted-foreground leading-tight">Brand Share</div>
				</div>
				<div className="rounded-lg border p-2 text-center">
					<div className="text-sm font-bold">64</div>
					<div className="mt-0.5 text-[8px] text-muted-foreground leading-tight">Unique Domains</div>
				</div>
				<div className="rounded-lg border p-2 text-center">
					<div className="text-sm font-bold">892</div>
					<div className="mt-0.5 text-[8px] text-muted-foreground leading-tight">Total Citations</div>
				</div>
				<div className="rounded-lg border p-2">
					<div className="mt-0.5 text-[8px] text-muted-foreground leading-tight">By Category</div>
					<div className="mt-1 flex h-2 w-full overflow-hidden rounded-full">
						{[
							{ pct: 38, color: "#10b981" },
							{ pct: 24, color: "#ef4444" },
							{ pct: 14, color: "#8b5cf6" },
							{ pct: 11, color: "#4285f4" },
							{ pct: 8, color: "#f59e0b" },
							{ pct: 5, color: "#9ca3af" },
						].map((seg, i) => (
							<div key={i} style={{ width: `${seg.pct}%`, backgroundColor: seg.color }} />
						))}
					</div>
				</div>
			</div>

			{/* Stacked area chart */}
			<div className="mt-3 rounded-lg border p-3">
				<div className="flex items-center justify-between">
					<span className="text-[10px] text-muted-foreground">Citation Category Trends</span>
					<div className="flex gap-2">
						{CATEGORY_ORDER.slice(0, 4).map((c) => (
							<span key={c} className="flex items-center gap-0.5 text-[8px] text-muted-foreground">
								<span className={`inline-block size-1.5 rounded-full`} style={{ backgroundColor: CATEGORY_COLORS[c].hex }} />
								{c === "brand" ? "Brand" : c === "competitor" ? "Competitor" : c === "social" ? "Social" : "Google"}
							</span>
						))}
					</div>
				</div>
				<svg viewBox={`0 0 ${stackW} ${stackH}`} className="mt-1 h-12 w-full" preserveAspectRatio="none">
					{stackPaths.map((d, i) => (
						<path key={i} d={d} fill={catHexes[i]} opacity="0.7" />
					))}
				</svg>
			</div>

			{/* Two-column: Recent Changes + Top Domains */}
			<div className="mt-3 flex gap-3">
				{/* Recent changes */}
				<div className="w-2/5 rounded-lg border p-2.5">
					<div className="text-[10px] font-medium">Recent Changes</div>
					<div className="mt-1.5 space-y-1.5">
						{recentChanges.map((ch) => (
							<div key={ch.url} className="flex items-start gap-1.5">
								<span className={`mt-0.5 flex size-3 shrink-0 items-center justify-center rounded-full text-[7px] text-white ${
									ch.type === "new" ? "bg-emerald-500" : "bg-rose-500"
								}`}>
									{ch.type === "new" ? "+" : "−"}
								</span>
								<div className="min-w-0">
									<div className="truncate text-[9px] font-medium">{ch.url}</div>
									<div className="text-[8px] text-muted-foreground">{ch.desc}</div>
								</div>
							</div>
						))}
					</div>
				</div>

				{/* Top domains */}
				<div className="flex-1 rounded-lg border p-2.5">
					<div className="text-[10px] font-medium">Top Cited Domains</div>
					<div className="mt-1.5 space-y-1.5">
						{domains.map((d) => (
							<div key={d.domain} className="flex items-center gap-1.5">
								<span className="w-24 truncate text-[9px] font-medium">{d.domain}</span>
								<div className="flex-1">
									<div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
										<div
											className="h-full rounded-full"
											style={{ width: `${d.pct}%`, backgroundColor: CATEGORY_COLORS[d.category].hex }}
										/>
									</div>
								</div>
								<span className="w-4 text-right text-[8px] tabular-nums text-muted-foreground">{d.count}</span>
							</div>
						))}
					</div>
				</div>
			</div>
		</GraphicShell>
	);
}

// ---------------------------------------------------------------------------
// Supporting graphics (prompt search, competitor, prompt detail, etc.)
// ---------------------------------------------------------------------------

export function PromptSearchGraphic() {
	const prompts = [
		{ text: "What is the best AI visibility tool for SaaS companies?", tags: ["saas", "tools"], vis: 85 },
		{ text: "How do brands track their AI search presence?", tags: ["tracking"], vis: 62 },
		{ text: "Compare AI visibility platforms for enterprise", tags: ["enterprise", "comparison"], vis: 41 },
	];

	return (
		<GraphicShell>
			<div className="mb-3 flex items-center gap-2 rounded-md border bg-muted/50 px-2.5 py-1.5">
				<svg className="size-3 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
					<circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
				</svg>
				<span className="text-xs">
					<span className="text-muted-foreground">AI </span>
					<span className="rounded bg-yellow-200/70 px-0.5 font-medium text-yellow-900">visibility</span>
				</span>
			</div>
			<div className="space-y-2">
				{prompts.map((p, i) => (
					<div key={i} className="flex items-start justify-between gap-2 rounded-lg border p-2.5">
						<div className="min-w-0 flex-1">
							<div className="text-[11px] leading-relaxed">
								{p.text.split(/(visibility)/i).map((part, j) =>
									part.toLowerCase() === "visibility" ? (
										<mark key={j} className="rounded bg-yellow-200/70 px-0.5 text-yellow-900">{part}</mark>
									) : (
										<span key={j}>{part}</span>
									),
								)}
							</div>
							<div className="mt-1.5 flex gap-1">
								{p.tags.map((tag) => (
									<span key={tag} className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary">{tag}</span>
								))}
							</div>
						</div>
						<div className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
							p.vis >= 75 ? "bg-emerald-100 text-emerald-700" :
							p.vis >= 45 ? "bg-amber-100 text-amber-700" :
							"bg-rose-100 text-rose-700"
						}`}>
							{p.vis}%
						</div>
					</div>
				))}
			</div>
		</GraphicShell>
	);
}

export function CompetitorGraphic() {
	const data = [
		{ name: "Your Brand", pct: 72, color: "bg-emerald-500" },
		{ name: "Competitor A", pct: 54, color: "bg-rose-400" },
		{ name: "Competitor B", pct: 38, color: "bg-rose-300" },
		{ name: "Competitor C", pct: 21, color: "bg-rose-200" },
	];

	return (
		<GraphicShell>
			<div className="mb-3 text-xs font-medium">Brand Mention Rate</div>
			<div className="space-y-3">
				{data.map((d) => (
					<div key={d.name} className="space-y-1">
						<div className="flex items-center justify-between text-[11px]">
							<span className={d.name === "Your Brand" ? "font-semibold" : "text-muted-foreground"}>{d.name}</span>
							<span className="tabular-nums font-medium">{d.pct}%</span>
						</div>
						<div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
							<div className={`h-full rounded-full ${d.color}`} style={{ width: `${d.pct}%` }} />
						</div>
					</div>
				))}
			</div>
		</GraphicShell>
	);
}

export function PromptDetailGraphic() {
	return (
		<GraphicShell>
			<div className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
				"What are the best tools for tracking AI search visibility?"
			</div>
			<div className="space-y-2">
				<div className="rounded-lg border p-2.5">
					<div className="mb-2 flex items-center gap-2">
						<span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700">OpenAI</span>
						<span className="text-[10px] text-muted-foreground">GPT-4o · 2 min ago</span>
					</div>
					<div className="space-y-1.5 text-[10px] leading-relaxed">
						<div className="flex gap-1.5">
							<span className="shrink-0 font-medium text-emerald-600">&#x2713; Brand</span>
							<span className="text-muted-foreground">mentioned in response</span>
						</div>
						<div className="flex gap-1.5">
							<span className="shrink-0 font-medium text-rose-500">&#x2717; CompetitorA</span>
							<span className="text-muted-foreground">not mentioned</span>
						</div>
					</div>
					<div className="mt-2 rounded bg-muted/50 p-2 text-[10px] leading-relaxed text-muted-foreground">
						"For tracking AI search visibility, <span className="font-medium text-foreground">Elmo</span> is an open-source platform that monitors how AI models mention your brand…"
					</div>
				</div>
				<div className="rounded-lg border p-2.5">
					<div className="flex items-center gap-2">
						<span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-700">Anthropic</span>
						<span className="text-[10px] text-muted-foreground">Claude 3.5 · 5 min ago</span>
					</div>
				</div>
			</div>
		</GraphicShell>
	);
}

export function VisibilityTrendGraphic() {
	const brandData = [42, 45, 48, 52, 50, 55, 58, 62, 60, 65, 68, 72];
	const compData = [55, 52, 50, 48, 51, 49, 47, 44, 46, 43, 42, 40];
	const w = 240;
	const h = 80;
	const { line: brandLine } = svgAreaPath(brandData, w, h, 30, 80);
	const { line: compLine } = svgAreaPath(compData, w, h, 30, 80);

	return (
		<GraphicShell>
			<div className="mb-1 flex items-center justify-between">
				<span className="text-xs font-medium">Visibility Over Time</span>
				<div className="flex gap-3 text-[10px]">
					<span className="flex items-center gap-1">
						<span className="size-1.5 rounded-full bg-emerald-500" />Your Brand
					</span>
					<span className="flex items-center gap-1">
						<span className="size-1.5 rounded-full bg-rose-400" />Competitor
					</span>
				</div>
			</div>
			<svg viewBox={`0 0 ${w} ${h + 16}`} className="mt-2 h-24 w-full">
				<defs>
					<linearGradient id="brandFill" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stopColor="#10b981" stopOpacity="0.15" />
						<stop offset="100%" stopColor="#10b981" stopOpacity="0" />
					</linearGradient>
				</defs>
				{[0, 1, 2, 3, 4].map((i) => (
					<line key={i} x1="0" y1={i * (h / 4)} x2={w} y2={i * (h / 4)} stroke="#e5e7eb" strokeWidth="0.5" />
				))}
				<path
					d={`${brandLine} L${w},${h} L0,${h} Z`}
					fill="url(#brandFill)"
				/>
				<path d={brandLine} fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" />
				<path d={compLine} fill="none" stroke="#fb7185" strokeWidth="1.5" strokeDasharray="4 3" strokeLinecap="round" />
				<g className="text-[8px]" fill="#a1a1aa">
					{["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((m, i) => (
						<text key={m} x={(i / 11) * w} y={h + 12} textAnchor="middle">{m}</text>
					))}
				</g>
			</svg>
		</GraphicShell>
	);
}

export function TopCitedDomainsGraphic() {
	const domains = [
		{ domain: "techcrunch.com", count: 47, category: "brand" as const },
		{ domain: "reddit.com/r/saas", count: 38, category: "social" as const },
		{ domain: "g2.com", count: 31, category: "competitor" as const },
		{ domain: "docs.google.com", count: 24, category: "google" as const },
		{ domain: "harvard.edu", count: 18, category: "institutional" as const },
		{ domain: "medium.com", count: 15, category: "other" as const },
	];
	const max = domains[0].count;

	return (
		<GraphicShell>
			<div className="mb-3 flex items-center justify-between">
				<span className="text-xs font-medium">Top Cited Domains</span>
				<div className="flex gap-1">
					{(["brand", "competitor", "social", "google"] as const).map((c) => (
						<span key={c} className={`size-2 rounded-full ${CATEGORY_COLORS[c].bg}`} />
					))}
				</div>
			</div>
			<div className="space-y-2">
				{domains.map((d) => (
					<div key={d.domain} className="flex items-center gap-2">
						<span className="w-28 truncate text-[11px] font-medium">{d.domain}</span>
						<div className="flex-1">
							<div className="h-2 w-full overflow-hidden rounded-full bg-muted">
								<div
									className={`h-full rounded-full ${CATEGORY_COLORS[d.category].bg}`}
									style={{ width: `${(d.count / max) * 100}%` }}
								/>
							</div>
						</div>
						<CategoryBadge label={d.category} color={d.category} />
						<span className="w-6 text-right text-[10px] tabular-nums text-muted-foreground">{d.count}</span>
					</div>
				))}
			</div>
		</GraphicShell>
	);
}

export function SubredditGraphic() {
	const subreddits = [
		{ name: "r/artificial", count: 23, isNew: false, newPages: 4 },
		{ name: "r/SaaS", count: 18, isNew: false, newPages: 2 },
		{ name: "r/startups", count: 12, isNew: true, newPages: 12 },
		{ name: "r/technology", count: 9, isNew: false, newPages: 0 },
		{ name: "r/marketing", count: 7, isNew: false, newPages: 1 },
	];

	return (
		<GraphicShell>
			<div className="mb-3 flex items-center gap-2">
				<span className="text-xs font-medium">Subreddit Citations</span>
				<span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-medium text-violet-700">Reddit</span>
			</div>
			<div className="space-y-1.5">
				{subreddits.map((s) => (
					<div key={s.name} className="flex items-center justify-between rounded-lg border px-3 py-2">
						<div className="flex items-center gap-2">
							<span className="text-[11px] font-semibold text-violet-700">{s.name}</span>
							{s.isNew && (
								<span className="rounded bg-violet-500 px-1 py-0.5 text-[8px] font-bold text-white">NEW</span>
							)}
						</div>
						<div className="flex items-center gap-2 text-[10px]">
							{s.newPages > 0 && !s.isNew && (
								<span className="text-emerald-600">+{s.newPages} new</span>
							)}
							<span className="tabular-nums font-medium text-muted-foreground">{s.count} citations</span>
						</div>
					</div>
				))}
			</div>
		</GraphicShell>
	);
}

// Re-export DashboardGraphic as alias for hero usage
export { OverviewPageGraphic as DashboardGraphic };
