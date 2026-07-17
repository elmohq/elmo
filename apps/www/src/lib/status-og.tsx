import { ELMO_BRAND_COLOR } from "@workspace/config/constants";
import { ACCENT_COLORS } from "@workspace/og/render";
import {
	overallStatus,
	parseTarget,
	passRate,
	PROVIDER_FILTER_LABELS,
	PROVIDER_FILTER_ORDER,
	providerCategory,
	rateTier,
	type RateTier,
	type TargetStatus,
} from "./status-helpers";

const TIER_TEXT: Record<RateTier, string> = {
	up: "#15803d",
	warn: "#b45309",
	down: "#b91c1c",
	none: "#a1a1aa",
};

const TIER_CHIP: Record<RateTier, { bg: string; border: string }> = {
	up: { bg: "#f0fdf4", border: "#bbf7d0" },
	warn: { bg: "#fffbeb", border: "#fde68a" },
	down: { bg: "#fef2f2", border: "#fecaca" },
	none: { bg: "#fafafa", border: "#e4e4e7" },
};

// Rendered by @takumi-rs/image-response, which is satori-compatible: every
// element with multiple children needs display:flex, styles are inline, and the
// only usable font faces are the ones the route loads (Titan One 400, Geist
// Sans 400/500) — so avoid heavier weights.
export function renderStatusOgImage(data: TargetStatus[]) {
	const overall = overallStatus(data);
	const providers = PROVIDER_FILTER_ORDER.filter((c) =>
		data.some((d) => providerCategory(parseTarget(d.target).provider) === c),
	);
	const providerStats = providers.map((c) => ({
		label: PROVIDER_FILTER_LABELS[c] ?? c,
		rate: passRate(
			data.filter((d) => providerCategory(parseTarget(d.target).provider) === c),
		),
	}));
	const modelCount = new Set(data.map((d) => parseTarget(d.target).model)).size;

	const dotColor = overall.operational
		? "#22c55e"
		: overall.failCount > 0
			? "#ef4444"
			: "#d4d4d8";
	const headline =
		overall.count === 0
			? "Waiting for data"
			: overall.operational
				? "All Systems Operational"
				: `${overall.failCount} provider${overall.failCount !== 1 ? "s" : ""} experiencing issues`;

	const subParts: string[] = [];
	if (overall.uptime !== null)
		subParts.push(`${overall.uptime.toFixed(1)}% uptime over 7 days`);
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
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				width: "100%",
				height: "100%",
				position: "relative",
				backgroundColor: "#ffffff",
				fontFamily: "Geist Sans",
				paddingTop: 60,
				paddingBottom: 60,
				paddingLeft: 64,
				paddingRight: 64,
			}}
		>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
				}}
			>
				<div
					style={{
						fontFamily: "Titan One",
						fontSize: 46,
						color: ELMO_BRAND_COLOR,
						lineHeight: 1,
					}}
				>
					elmo
				</div>
				<div
					style={{
						fontSize: 22,
						letterSpacing: 4,
						textTransform: "uppercase",
						color: "#94a3b8",
					}}
				>
					AI Provider Status
				</div>
			</div>

			<div style={{ display: "flex", flexDirection: "column", marginTop: 52 }}>
				<div style={{ display: "flex", alignItems: "center" }}>
					<div
						style={{
							width: 26,
							height: 26,
							borderRadius: 999,
							backgroundColor: dotColor,
							marginRight: 20,
						}}
					/>
					<div style={{ fontSize: 62, fontWeight: 500, color: "#1e293b" }}>
						{headline}
					</div>
				</div>
				<div style={{ fontSize: 28, color: "#64748b", marginTop: 14 }}>
					{subParts.join(" · ")}
				</div>
			</div>

			<div
				style={{
					display: "flex",
					flexWrap: "wrap",
					marginTop: 56,
				}}
			>
				{providerStats.map((p) => {
					const tier = rateTier(p.rate);
					return (
						<div
							key={p.label}
							style={{
								display: "flex",
								flexDirection: "column",
								justifyContent: "space-between",
								width: 328,
								height: 116,
								marginRight: 16,
								marginBottom: 16,
								paddingTop: 20,
								paddingBottom: 20,
								paddingLeft: 24,
								paddingRight: 24,
								borderRadius: 18,
								borderWidth: 1,
								borderStyle: "solid",
								borderColor: TIER_CHIP[tier].border,
								backgroundColor: TIER_CHIP[tier].bg,
							}}
						>
							<div style={{ fontSize: 24, color: "#475569" }}>{p.label}</div>
							<div
								style={{ fontSize: 48, fontWeight: 500, color: TIER_TEXT[tier] }}
							>
								{p.rate === null ? "—" : `${Math.round(p.rate)}%`}
							</div>
						</div>
					);
				})}
			</div>

			<div
				style={{
					display: "flex",
					position: "absolute",
					bottom: 0,
					left: 0,
					width: "100%",
					height: 8,
					backgroundImage: `linear-gradient(to right, ${ACCENT_COLORS.join(", ")})`,
				}}
			/>
		</div>
	);
}
