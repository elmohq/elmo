import { DEFAULT_APP_NAME } from "@workspace/config/constants";
import { ACCENT_COLORS, OgFrame, OgHeader } from "@workspace/og/render";
import {
	overallStatus,
	PROVIDER_FILTER_LABELS,
	PROVIDER_FILTER_ORDER,
	parseTarget,
	passRate,
	providerCategory,
	type RateTier,
	rateTier,
	type TargetStatus,
} from "./status-helpers";

const TIER_TEXT: Record<RateTier, string> = {
	up: "#15803d",
	warn: "#b45309",
	down: "#b91c1c",
	none: "#a1a1aa",
};

const TIER_TILE: Record<RateTier, { bg: string; border: string }> = {
	up: { bg: "#f0fdf4", border: "#bbf7d0" },
	warn: { bg: "#fffbeb", border: "#fde68a" },
	down: { bg: "#fef2f2", border: "#fecaca" },
	none: { bg: "#ffffff", border: "#e4e4e7" },
};

const TILE_COLUMNS = 4;
const TILE_GAP = 12;
const CONTENT_WIDTH = 1200 - 2 * 64;
const TILE_WIDTH = (CONTENT_WIDTH - TILE_GAP * (TILE_COLUMNS - 1)) / TILE_COLUMNS;

export function renderStatusOgImage(data: TargetStatus[]) {
	const overall = overallStatus(data);
	const categoryOf = (target: string) => {
		const { model, provider, version } = parseTarget(target);
		return providerCategory(provider, model, version);
	};
	const providers = PROVIDER_FILTER_ORDER.filter((c) => data.some((d) => categoryOf(d.target) === c));
	const providerStats = providers.map((c) => ({
		label: PROVIDER_FILTER_LABELS[c] ?? c,
		rate: passRate(data.filter((d) => categoryOf(d.target) === c)),
	}));
	const modelCount = new Set(data.map((d) => parseTarget(d.target).model)).size;

	const dotColor = overall.operational ? "#22c55e" : overall.failCount > 0 ? "#ef4444" : "#d4d4d8";
	const headline =
		overall.count === 0
			? "Waiting for data"
			: overall.operational
				? "All Systems Operational"
				: `${overall.failCount} provider${overall.failCount !== 1 ? "s" : ""} experiencing issues`;

	const subParts: string[] = [];
	if (overall.uptime !== null) subParts.push(`${overall.uptime.toFixed(1)}% uptime over 7 days`);
	subParts.push(`${providerStats.length} providers`);
	subParts.push(`${modelCount} models`);
	if (overall.lastChecked !== null)
		subParts.push(
			`updated ${new Date(overall.lastChecked).toLocaleDateString("en-US", {
				month: "short",
				day: "numeric",
			})}`,
		);

	return (
		<OgFrame accentColors={ACCENT_COLORS} footer="elmohq.com/status">
			<OgHeader appName={DEFAULT_APP_NAME} label="AI Provider Status" />

			<div style={{ display: "flex", flexDirection: "column", marginTop: 40 }}>
				<div style={{ display: "flex", alignItems: "center" }}>
					<div
						style={{
							width: 22,
							height: 22,
							borderRadius: 999,
							backgroundColor: dotColor,
							marginRight: 18,
						}}
					/>
					<div style={{ fontSize: 56, fontWeight: 500, letterSpacing: -1.5, lineHeight: 1.1, color: "#09090b" }}>
						{headline}
					</div>
				</div>
				<div style={{ fontSize: 26, color: "#52525b", marginTop: 12 }}>{subParts.join(" · ")}</div>
			</div>

			<div style={{ display: "flex", flexWrap: "wrap", marginTop: 32, marginBottom: 24 }}>
				{providerStats.slice(0, TILE_COLUMNS * 2).map((p, i) => {
					const tier = rateTier(p.rate);
					const lastInRow = i % TILE_COLUMNS === TILE_COLUMNS - 1;
					return (
						<div
							key={p.label}
							style={{
								display: "flex",
								flexDirection: "column",
								justifyContent: "space-between",
								width: TILE_WIDTH,
								height: 88,
								marginRight: lastInRow ? 0 : TILE_GAP,
								marginBottom: TILE_GAP,
								paddingTop: 14,
								paddingBottom: 14,
								paddingLeft: 20,
								paddingRight: 20,
								borderRadius: 14,
								borderWidth: 1,
								borderStyle: "solid",
								borderColor: TIER_TILE[tier].border,
								backgroundColor: TIER_TILE[tier].bg,
							}}
						>
							<div style={{ fontSize: 20, color: "#52525b" }}>{p.label}</div>
							<div style={{ fontSize: 32, fontWeight: 500, lineHeight: 1, color: TIER_TEXT[tier] }}>
								{p.rate === null ? "—" : `${Math.round(p.rate)}%`}
							</div>
						</div>
					);
				})}
			</div>
		</OgFrame>
	);
}
