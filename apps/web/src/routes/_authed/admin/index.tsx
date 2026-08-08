/**
 * /admin - Admin dashboard with brand statistics and charts
 */
import { useEffect, useState, type ReactNode } from "react";
import { createFileRoute, Link, useRouteContext } from "@tanstack/react-router";
import type { ClientConfig } from "@workspace/config/types";
import { getAppName } from "@/lib/route-head";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@workspace/ui/components/dialog";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@workspace/ui/components/chart";
import { Settings, TrendingUp, TrendingDown } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis, ResponsiveContainer } from "recharts";
import { getAdminStatsFn, updateDelayOverrideFn } from "@/server/admin";
import { formatDate as formatLocaleDate, formatNumber } from "@/i18n/formatting";
import * as m from "@/paraglide/messages.js";

interface BrandStats {
	id: string;
	name: string;
	website: string;
	enabled: boolean;
	onboarded: boolean;
	delayOverrideHours: number | null;
	createdAt: string;
	updatedAt: string;
	totalPrompts: number;
	activePrompts: number;
	promptRuns7Days: number;
	promptRuns30Days: number;
	lastPromptRunAt: string | null;
	promptsAddedLast7Days: number;
	promptsRemovedLast7Days: number;
	promptsAddedLast30Days: number;
	promptsRemovedLast30Days: number;
}

function useDefaultDelayHours(): number {
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };
	return context.clientConfig?.defaultDelayHours ?? 24;
}

function formatDelayHours(hours: number): string {
	const weeks = Math.floor(hours / (7 * 24));
	const days = Math.floor((hours % (7 * 24)) / 24);
	const remainingHours = hours % 24;
	const parts: string[] = [];
	if (weeks > 0) parts.push(m.duration_week_short({ count: weeks }));
	if (days > 0) parts.push(m.duration_day_short({ count: days }));
	if (remainingHours > 0) parts.push(m.duration_hour_short({ count: remainingHours }));
	return parts.length > 0 ? parts.join(" ") : m.duration_hour_short({ count: 0 });
}

function hoursToTimeUnits(hours: number) {
	return {
		weeks: Math.floor(hours / (7 * 24)),
		days: Math.floor((hours % (7 * 24)) / 24),
		hours: hours % 24,
	};
}

function timeUnitsToHours(units: { weeks: number; days: number; hours: number }) {
	return units.weeks * 7 * 24 + units.days * 24 + units.hours;
}

function DelayOverrideDialog({ brand, onUpdate }: { brand: BrandStats; onUpdate: () => void }) {
	const defaultDelayHours = useDefaultDelayHours();
	const [open, setOpen] = useState(false);
	const [timeUnits, setTimeUnits] = useState({ weeks: 0, days: 0, hours: 0 });
	const [isUpdating, setIsUpdating] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const currentDelay = brand.delayOverrideHours ?? defaultDelayHours;

	useEffect(() => {
		if (open) {
			setTimeUnits(hoursToTimeUnits(currentDelay));
			setError(null);
		}
	}, [open, currentDelay]);

	const handleUpdateUnit = (unit: keyof typeof timeUnits, value: string) => {
		const numValue = value === "" ? 0 : Math.max(0, parseInt(value) || 0);
		setTimeUnits({ ...timeUnits, [unit]: numValue });
	};

	const handleUpdate = async () => {
		setError(null);
		const totalHours = timeUnitsToHours(timeUnits);
		if (totalHours === 0) {
			setError(m.admin_delay_required());
			return;
		}
		if (totalHours < 1) {
			setError(m.admin_delay_minimum());
			return;
		}
		setIsUpdating(true);
		try {
			await updateDelayOverrideFn({ data: { brandId: brand.id, delayOverrideHours: totalHours } });
			onUpdate();
			setOpen(false);
		} catch (err) {
			setError(err instanceof Error ? err.message : m.admin_update_failed());
		} finally {
			setIsUpdating(false);
		}
	};

	const handleClearOverride = async () => {
		setIsUpdating(true);
		setError(null);
		try {
			await updateDelayOverrideFn({ data: { brandId: brand.id, delayOverrideHours: null } });
			onUpdate();
			setOpen(false);
		} catch (err) {
			setError(err instanceof Error ? err.message : m.admin_clear_failed());
		} finally {
			setIsUpdating(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="outline" size="sm" className="cursor-pointer">
					<Settings className="h-4 w-4" />
				</Button>
			</DialogTrigger>
			<DialogContent className="max-w-2xl" closeLabel={m.common_close()}>
				<DialogHeader>
					<DialogTitle>{m.admin_configure_delay({ brand: brand.name })}</DialogTitle>
					<DialogDescription>
						{m.admin_configure_delay_description({ delay: formatDelayHours(defaultDelayHours) })}
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4 py-4">
					<div className="space-y-3">
						<Label>{m.admin_custom_delay()}</Label>
						<div className="grid grid-cols-3 gap-4">
							<div className="space-y-2">
								<Label htmlFor="weeks" className="text-xs text-muted-foreground">
									{m.admin_weeks()}
								</Label>
								<Input
									id="weeks"
									type="number"
									min="0"
									value={timeUnits.weeks || ""}
									onChange={(e) => handleUpdateUnit("weeks", e.target.value)}
									disabled={isUpdating}
									placeholder="0"
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="days" className="text-xs text-muted-foreground">
									{m.admin_days()}
								</Label>
								<Input
									id="days"
									type="number"
									min="0"
									value={timeUnits.days || ""}
									onChange={(e) => handleUpdateUnit("days", e.target.value)}
									disabled={isUpdating}
									placeholder="0"
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="hours" className="text-xs text-muted-foreground">
									{m.admin_hours()}
								</Label>
								<Input
									id="hours"
									type="number"
									min="0"
									value={timeUnits.hours || ""}
									onChange={(e) => handleUpdateUnit("hours", e.target.value)}
									disabled={isUpdating}
									placeholder="0"
								/>
							</div>
						</div>
						<p className="text-sm text-muted-foreground">
							{m.admin_current({ delay: formatDelayHours(currentDelay) })}
							 {brand.delayOverrideHours !== null ? `(${m.admin_custom()})` : `(${m.admin_default()})`}
						</p>
						<p className="text-sm text-muted-foreground">
							{m.admin_total({ delay: formatDelayHours(timeUnitsToHours(timeUnits)) })}
						</p>
					</div>
					{error && <p className="text-sm text-destructive">{error}</p>}
				</div>
				<DialogFooter>
					<div className="flex justify-between w-full">
						{brand.delayOverrideHours !== null && (
							<Button variant="outline" onClick={handleClearOverride} disabled={isUpdating} className="cursor-pointer">
								{m.admin_clear_override()}
							</Button>
						)}
						<div className="flex gap-2 ml-auto">
							<Button variant="outline" onClick={() => setOpen(false)} disabled={isUpdating} className="cursor-pointer">
								{m.common_cancel()}
							</Button>
							<Button onClick={handleUpdate} disabled={isUpdating} className="cursor-pointer">
								{isUpdating ? m.admin_updating() : m.admin_update()}
							</Button>
						</div>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function ActivityIndicator({ added, removed }: { added: number; removed: number }) {
	if (added === 0 && removed === 0) {
		return (
			<div className="flex items-center text-muted-foreground">
				<span className="w-4 mr-1" />
				<span>0</span>
			</div>
		);
	}
	return (
		<div className="flex items-center gap-2">
			{added > 0 && (
				<div className="flex items-center text-green-600">
					<TrendingUp className="h-4 w-4 mr-1" />
					<span>+{added}</span>
				</div>
			)}
			{removed > 0 && (
				<div className="flex items-center text-red-600">
					<TrendingDown className="h-4 w-4 mr-1" />
					<span>-{removed}</span>
				</div>
			)}
		</div>
	);
}

export const Route = createFileRoute("/_authed/admin/")({
	head: ({ match }) => {
		const appName = getAppName(match);
		return {
			meta: [
				{ title: `${m.admin_meta_title()} · ${appName}` },
				{ name: "description", content: m.admin_description() },
			],
		};
	},
	component: AdminDashboard,
});

function AdminDashboard() {
	const defaultDelayHours = useDefaultDelayHours();
	const [brands, setBrands] = useState<BrandStats[]>([]);
	const [brandsOverTime, setBrandsOverTime] = useState<{ date: string; count: number }[]>([]);
	const [activeBrandsOverTime, setActiveBrandsOverTime] = useState<{ date: string; count: number }[]>([]);
	const [promptsOverTime, setPromptsOverTime] = useState<{ date: string; enabled: number; disabled: number }[]>([]);
	const [runsOverTime, setRunsOverTime] = useState<{ date: string; count: number }[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const fetchBrandStats = async () => {
		try {
			const data = await getAdminStatsFn();
			setBrands(data.brands as any);
			setBrandsOverTime(data.brandsOverTime || []);
			setActiveBrandsOverTime(data.activeBrandsOverTime || []);
			setPromptsOverTime(data.promptsOverTime || []);
			setRunsOverTime(data.runsOverTime || []);
		} catch (err) {
			setError(err instanceof Error ? err.message : m.common_error());
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchBrandStats();
	}, []);

	if (loading) {
		return (
			<div className="space-y-8">
				<div className="space-y-2">
					<Skeleton className="h-8 w-64" />
					<Skeleton className="h-4 w-96" />
				</div>
				<Card>
					<CardHeader>
						<Skeleton className="h-6 w-48" />
					</CardHeader>
					<CardContent>
						<div className="space-y-4">
							{[0, 1, 2, 3, 4].map((n) => (
								<Skeleton key={n} className="h-16 w-full" />
							))}
						</div>
					</CardContent>
				</Card>
			</div>
		);
	}

	if (error) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="text-destructive">{m.common_error_title()}</CardTitle>
				</CardHeader>
				<CardContent>
					<p>{error}</p>
				</CardContent>
			</Card>
		);
	}

	const totals = brands.reduce(
		(acc, brand) => ({
			totalBrands: acc.totalBrands + 1,
			totalPrompts: acc.totalPrompts + (brand.totalPrompts || 0),
			activePrompts: acc.activePrompts + (brand.activePrompts || 0),
			promptRuns7Days: acc.promptRuns7Days + (brand.promptRuns7Days || 0),
			promptRuns30Days: acc.promptRuns30Days + (brand.promptRuns30Days || 0),
		}),
		{ totalBrands: 0, totalPrompts: 0, activePrompts: 0, promptRuns7Days: 0, promptRuns30Days: 0 },
	);

	const brandsYAxisMax = Math.max(
		...brandsOverTime.map((d) => d.count),
		...activeBrandsOverTime.map((d) => d.count),
		0,
	);

	const dateFormatter = (value: string) => {
		const date = new Date(value);
		return formatLocaleDate(date, { month: "short", day: "numeric" });
	};

	const tooltipLabelFormatter = (value: ReactNode) => {
		const date = new Date(String(value));
		return formatLocaleDate(date, { month: "long", day: "numeric", year: "numeric" });
	};

	return (
		<div className="space-y-8">
			<div className="flex items-center justify-between">
				<div className="space-y-2">
					<h1 className="text-3xl font-bold tracking-tight">{m.admin_title()}</h1>
					<p className="text-muted-foreground">{m.admin_description()}</p>
				</div>
			</div>

			{/* Summary Cards with Charts */}
			<div className="grid gap-4 sm:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>{m.admin_all_brands()}</CardTitle>
						<CardDescription>{m.admin_total_brands({ count: formatNumber(totals.totalBrands) })}</CardDescription>
					</CardHeader>
					<CardContent className="p-0 pb-4">
						<ChartContainer
							config={{ count: { label: m.admin_all_brands(), color: "#3b82f6" } }}
							className="h-[120px] w-full px-4"
						>
							<ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 1, height: 1 }}>
								<AreaChart data={brandsOverTime}>
									<defs>
										<linearGradient id="fillBrands" x1="0" y1="0" x2="0" y2="1">
											<stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
											<stop offset="95%" stopColor="#3b82f6" stopOpacity={0.1} />
										</linearGradient>
									</defs>
									<CartesianGrid strokeDasharray="3 3" vertical={false} />
									<XAxis
										dataKey="date"
										tickLine={false}
										axisLine={false}
										tickMargin={8}
										minTickGap={30}
										tickFormatter={dateFormatter}
									/>
									<YAxis tickLine={false} axisLine={false} tickMargin={8} width={40} domain={[0, brandsYAxisMax]} />
									<ChartTooltip
										isAnimationActive={false}
										content={<ChartTooltipContent className="min-w-[180px]" labelFormatter={tooltipLabelFormatter} />}
									/>
									<Area type="monotone" dataKey="count" stroke="#3b82f6" fill="url(#fillBrands)" strokeWidth={2} />
								</AreaChart>
							</ResponsiveContainer>
						</ChartContainer>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>{m.admin_active_brands()}</CardTitle>
						<CardDescription>
							{m.admin_active_brands_description({ count: formatNumber(activeBrandsOverTime[activeBrandsOverTime.length - 1]?.count ?? 0) })}
						</CardDescription>
					</CardHeader>
					<CardContent className="p-0 pb-4">
						<ChartContainer
							config={{ count: { label: m.admin_active_brands(), color: "#22c55e" } }}
							className="h-[120px] w-full px-4"
						>
							<ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 1, height: 1 }}>
								<AreaChart data={activeBrandsOverTime}>
									<defs>
										<linearGradient id="fillActiveBrands" x1="0" y1="0" x2="0" y2="1">
											<stop offset="5%" stopColor="#22c55e" stopOpacity={0.8} />
											<stop offset="95%" stopColor="#22c55e" stopOpacity={0.1} />
										</linearGradient>
									</defs>
									<CartesianGrid strokeDasharray="3 3" vertical={false} />
									<XAxis
										dataKey="date"
										tickLine={false}
										axisLine={false}
										tickMargin={8}
										minTickGap={30}
										tickFormatter={dateFormatter}
									/>
									<YAxis tickLine={false} axisLine={false} tickMargin={8} width={40} domain={[0, brandsYAxisMax]} />
									<ChartTooltip
										isAnimationActive={false}
										content={<ChartTooltipContent className="min-w-[180px]" labelFormatter={tooltipLabelFormatter} />}
									/>
									<Area
										type="monotone"
										dataKey="count"
										stroke="#22c55e"
										fill="url(#fillActiveBrands)"
										strokeWidth={2}
									/>
								</AreaChart>
							</ResponsiveContainer>
						</ChartContainer>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>{m.wizard_prompts_title()}</CardTitle>
						<CardDescription>
							{m.admin_prompts_summary({ active: formatNumber(totals.activePrompts), total: formatNumber(totals.totalPrompts) })}
						</CardDescription>
					</CardHeader>
					<CardContent className="p-0 pb-4">
						<ChartContainer
							config={{
								enabled: { label: m.common_enabled(), color: "#10b981" },
								disabled: { label: m.common_disabled(), color: "#ef4444" },
							}}
							className="h-[120px] w-full px-4"
						>
							<ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 1, height: 1 }}>
								<AreaChart data={promptsOverTime}>
									<defs>
										<linearGradient id="fillEnabled" x1="0" y1="0" x2="0" y2="1">
											<stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
											<stop offset="95%" stopColor="#10b981" stopOpacity={0.1} />
										</linearGradient>
										<linearGradient id="fillDisabled" x1="0" y1="0" x2="0" y2="1">
											<stop offset="5%" stopColor="#ef4444" stopOpacity={0.8} />
											<stop offset="95%" stopColor="#ef4444" stopOpacity={0.1} />
										</linearGradient>
									</defs>
									<CartesianGrid strokeDasharray="3 3" vertical={false} />
									<XAxis
										dataKey="date"
										tickLine={false}
										axisLine={false}
										tickMargin={8}
										minTickGap={30}
										tickFormatter={dateFormatter}
									/>
									<YAxis tickLine={false} axisLine={false} tickMargin={8} width={40} />
									<ChartTooltip
										isAnimationActive={false}
										content={(props) => {
											if (!props.active || !props.payload) return null;
											const reversedPayload = [...props.payload].reverse();
											return (
												<ChartTooltipContent
													className="min-w-[180px]"
													active={props.active}
													payload={reversedPayload}
													label={props.label}
													labelFormatter={tooltipLabelFormatter}
												/>
											);
										}}
									/>
									<Area
										type="monotone"
										dataKey="disabled"
										stackId="a"
										stroke="#ef4444"
										fill="#ef4444"
										fillOpacity={0.6}
										strokeWidth={2}
									/>
									<Area
										type="monotone"
										dataKey="enabled"
										stackId="a"
										stroke="#10b981"
										fill="#10b981"
										fillOpacity={0.6}
										strokeWidth={2}
									/>
								</AreaChart>
							</ResponsiveContainer>
						</ChartContainer>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>{m.admin_runs()}</CardTitle>
						<CardDescription>
							{m.admin_runs_summary({ week: formatNumber(totals.promptRuns7Days), month: formatNumber(totals.promptRuns30Days) })}
						</CardDescription>
					</CardHeader>
					<CardContent className="p-0 pb-4">
						<ChartContainer config={{ count: { label: m.admin_runs(), color: "#8b5cf6" } }} className="h-[120px] w-full px-4">
							<ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 1, height: 1 }}>
								<BarChart data={runsOverTime}>
									<CartesianGrid strokeDasharray="3 3" vertical={false} />
									<XAxis
										dataKey="date"
										tickLine={false}
										axisLine={false}
										tickMargin={8}
										minTickGap={30}
										tickFormatter={dateFormatter}
									/>
									<YAxis tickLine={false} axisLine={false} tickMargin={8} width={40} />
									<ChartTooltip
										isAnimationActive={false}
										content={<ChartTooltipContent className="min-w-[180px]" labelFormatter={tooltipLabelFormatter} />}
									/>
									<Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
								</BarChart>
							</ResponsiveContainer>
						</ChartContainer>
					</CardContent>
				</Card>
			</div>

			{/* Brand Statistics Table */}
			<Card>
				<CardHeader>
					<CardTitle>{m.admin_brand_statistics()}</CardTitle>
					<CardDescription>{m.admin_brand_statistics_description()}</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>{m.report_brand()}</TableHead>
									<TableHead className="text-right">{m.wizard_prompts_title()}</TableHead>
									<TableHead className="text-right">{m.admin_prompts_7d()}</TableHead>
									<TableHead className="text-right">{m.admin_prompts_30d()}</TableHead>
									<TableHead className="text-right">{m.admin_runs_7d()}</TableHead>
									<TableHead className="text-right">{m.admin_runs_30d()}</TableHead>
									<TableHead>{m.admin_last_run()}</TableHead>
									<TableHead>{m.admin_run_delay()}</TableHead>
									<TableHead>{m.admin_actions()}</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{brands.map((brand) => {
									const currentDelayHours = brand.delayOverrideHours ?? defaultDelayHours;
									const currentDelayMs = currentDelayHours * 60 * 60 * 1000;
									const isOverdue =
										brand.lastPromptRunAt && brand.activePrompts > 0
											? new Date().getTime() - new Date(brand.lastPromptRunAt).getTime() > currentDelayMs
											: false;

									return (
										<TableRow key={brand.id}>
											<TableCell className="font-medium">
												<div className="space-y-1">
													<Link to="/app/$brand" params={{ brand: brand.id }} className="hover:underline text-primary">
														{brand.name}
													</Link>
													<div className="text-xs text-muted-foreground">{brand.website}</div>
												</div>
											</TableCell>
											<TableCell className="text-right">
												<div className="font-medium">{brand.activePrompts}</div>
											</TableCell>
											<TableCell>
												<div className="flex justify-end">
													<ActivityIndicator
														added={brand.promptsAddedLast7Days || 0}
														removed={brand.promptsRemovedLast7Days || 0}
													/>
												</div>
											</TableCell>
											<TableCell>
												<div className="flex justify-end">
													<ActivityIndicator
														added={brand.promptsAddedLast30Days || 0}
														removed={brand.promptsRemovedLast30Days || 0}
													/>
												</div>
											</TableCell>
											<TableCell className="text-right">{formatNumber(brand.promptRuns7Days ?? 0)}</TableCell>
											<TableCell className="text-right">{formatNumber(brand.promptRuns30Days ?? 0)}</TableCell>
											<TableCell>
												{brand.lastPromptRunAt ? (
													<span className={`text-sm ${isOverdue ? "text-red-600 font-semibold" : ""}`}>
												{formatLocaleDate(brand.lastPromptRunAt)}
													</span>
												) : (
											<span className="text-muted-foreground">{m.common_never()}</span>
												)}
											</TableCell>
											<TableCell>
												<div className="space-y-1">
													<div className="font-medium">{formatDelayHours(currentDelayHours)}</div>
													<span className="text-xs text-muted-foreground">
												{brand.delayOverrideHours !== null ? m.common_custom() : m.common_default()}
													</span>
												</div>
											</TableCell>
											<TableCell>
												<DelayOverrideDialog brand={brand} onUpdate={fetchBrandStats} />
											</TableCell>
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
