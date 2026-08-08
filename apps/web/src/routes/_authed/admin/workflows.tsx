/**
 * /admin/workflows - Monitor prompt scheduling, job execution, and worker health
 */
import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { getAppName } from "@/lib/route-head";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Progress } from "@workspace/ui/components/progress";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@workspace/ui/components/dialog";
import {
	CheckCircle2,
	AlertTriangle,
	XCircle,
	Clock,
	Activity,
	Server,
	RefreshCw,
	ChevronDown,
	ChevronRight,
	Play,
	Loader2,
} from "lucide-react";
import { getWorkflowDataFn, retryJobFn, getJobLogsFn } from "@/server/admin";
import { formatDate as formatLocaleDate, formatNumber, formatPercent } from "@/i18n/formatting";
import * as m from "@/paraglide/messages.js";

// ============================================================================
// Types
// ============================================================================

interface SchedulerInfo {
	exists: boolean;
	nextRunAt: number | null;
	cadenceHours: number | null;
}

interface LastRunByModel {
	lastRunAt: string | null;
	isOverdue: boolean;
	overdueByMs: number | null;
}

interface PromptScheduleStatus {
	promptId: string;
	promptValue: string;
	brandId: string;
	brandName: string;
	enabled: boolean;
	runFrequencyMs: number;
	lastRunsByModel: Record<string, LastRunByModel>;
	schedulerInfo: SchedulerInfo;
	recentFailures: number;
	jobStatus: "active" | "created" | "retry" | "none";
}

interface BrandScheduleSummary {
	brandId: string;
	brandName: string;
	website: string;
	enabled: boolean;
	totalPrompts: number;
	enabledPrompts: number;
	runFrequencyMs: number;
	overduePrompts: number;
	onSchedulePrompts: number;
	schedulerCoverage: { scheduled: number; total: number };
	prompts: PromptScheduleStatus[];
}

interface QueueStats {
	name: string;
	created: number;
	active: number;
	retry: number;
	completed: number;
	failed: number;
	totalPending: number;
}

interface RecentJob {
	id: string;
	name: string;
	data: { promptId?: string };
	status: "completed" | "failed";
	failedReason: string | null;
	attemptsMade: number;
	timestamp: number;
	processedOn: number | null;
	finishedOn: number | null;
}

interface WorkflowsData {
	summary: {
		totalBrands: number;
		totalPrompts: number;
		totalEnabled: number;
		totalOverdue: number;
		totalOnSchedule: number;
		percentOnSchedule: number;
	};
	queue: QueueStats;
	recentJobs: RecentJob[];
	brands: BrandScheduleSummary[];
}

// ============================================================================
// Utility functions
// ============================================================================

function formatDuration(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);
	const weeks = Math.floor(days / 7);

	if (weeks > 0) {
		const remainingDays = days % 7;
		return remainingDays > 0 ? `${m.duration_week_short({ count: weeks })} ${m.duration_day_short({ count: remainingDays })}` : m.duration_week_short({ count: weeks });
	}
	if (days > 0) {
		const remainingHours = hours % 24;
		return remainingHours > 0 ? `${m.duration_day_short({ count: days })} ${m.duration_hour_short({ count: remainingHours })}` : m.duration_day_short({ count: days });
	}
	if (hours > 0) {
		const remainingMinutes = minutes % 60;
		return remainingMinutes > 0 ? `${m.duration_hour_short({ count: hours })} ${m.duration_minute_short({ count: remainingMinutes })}` : m.duration_hour_short({ count: hours });
	}
	if (minutes > 0) return m.duration_minute_short({ count: minutes });
	return m.duration_second_short({ count: seconds });
}

function formatRelativeTime(dateStr: string | null): string {
	if (!dateStr) return m.common_never();
	const date = new Date(dateStr);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	return m.time_ago({ duration: formatDuration(diffMs) });
}

function formatFutureTime(timestamp: number | null): string {
	if (!timestamp) return m.common_unknown();
	const now = Date.now();
	const diffMs = timestamp - now;
	if (diffMs < 0) return m.workflows_overdue();
	return m.time_in({ duration: formatDuration(diffMs) });
}

// ============================================================================
// Sub-components
// ============================================================================

function QueueStatsCard({ stats, title }: { stats: QueueStats; title: string }) {
	const hasIssues = stats.failed > 0;

	return (
		<Card className={hasIssues ? "border-amber-500/50" : ""}>
			<CardHeader className="pb-2">
				<CardTitle className="text-sm font-medium flex items-center gap-2">
					<Server className="h-4 w-4" />
					{title}
				</CardTitle>
				<CardDescription>{m.workflows_queue_description()}</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="grid grid-cols-3 gap-4 text-sm">
					<div title={m.workflows_created_tip()}>
						<p className="text-muted-foreground">{m.workflows_created()}</p>
						<p className="text-xl font-semibold text-blue-600">{stats.created}</p>
					</div>
					<div title={m.workflows_active_tip()}>
						<p className="text-muted-foreground">{m.workflows_active()}</p>
						<p className="text-xl font-semibold text-emerald-600">{stats.active}</p>
					</div>
					<div title={m.workflows_retry_tip()}>
						<p className="text-muted-foreground">{m.workflows_retry()}</p>
						<p className="text-xl font-semibold text-amber-600">{stats.retry}</p>
					</div>
					<div>
						<p className="text-muted-foreground">{m.status_completed()}</p>
						<p className="text-xl font-semibold">{formatNumber(stats.completed)}</p>
					</div>
					<div>
						<p className="text-muted-foreground">{m.status_failed()}</p>
						<p className={`text-xl font-semibold ${stats.failed > 0 ? "text-red-600" : ""}`}>{stats.failed}</p>
					</div>
					<div>
						<p className="text-muted-foreground">{m.workflows_total_pending()}</p>
						<p className="text-xl font-semibold text-violet-600">{stats.totalPending}</p>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

function SchedulerCell({ info }: { info: SchedulerInfo }) {
	if (!info.exists) {
		return <span className="text-muted-foreground text-xs">&mdash;</span>;
	}
	const nextText = info.nextRunAt ? formatFutureTime(info.nextRunAt) : m.common_unknown();
	return (
		<div className="flex flex-col gap-0.5">
			<span className="text-xs font-medium">{m.workflows_next({ time: nextText })}</span>
		</div>
	);
}

function ModelStatus({ status }: { status?: LastRunByModel }) {
	if (!status) {
		return <span className="text-muted-foreground">-</span>;
	}
	const lastRunText = status.lastRunAt ? formatRelativeTime(status.lastRunAt) : m.common_never();

	if (status.isOverdue) {
		return (
			<div className="flex flex-col gap-0.5">
				<div className="flex items-center gap-1">
					<AlertTriangle className="h-3 w-3 text-amber-500" />
					<span className="text-amber-600 text-xs">{lastRunText}</span>
				</div>
				{status.overdueByMs && <span className="text-red-500 text-xs">(+{formatDuration(status.overdueByMs)})</span>}
			</div>
		);
	}

	return (
		<div className="flex items-center gap-1">
			<CheckCircle2 className="h-3 w-3 text-emerald-500" />
			<span className="text-emerald-600 text-xs">{lastRunText}</span>
		</div>
	);
}

function RetryButton({ promptId, onSuccess }: { promptId?: string; jobId?: string; onSuccess: () => void }) {
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<"queued" | "recreated" | false>(false);

	const handleRetry = async () => {
		setIsLoading(true);
		setError(null);
		setSuccess(false);

		try {
			await retryJobFn({ data: { promptId } });
			setSuccess("queued");
			setTimeout(() => onSuccess(), 1000);
		} catch (err) {
			setError(err instanceof Error ? err.message : m.workflows_retry_failed());
		} finally {
			setIsLoading(false);
		}
	};

	if (success) {
		return (
			<Button size="sm" variant="outline" disabled className="cursor-default">
				<CheckCircle2 className="h-3 w-3 mr-1 text-emerald-500" />
				{success === "recreated" ? m.workflows_scheduler_reset() : m.workflows_queued()}
			</Button>
		);
	}

	return (
		<div className="flex flex-col gap-1">
			<Button size="sm" variant="outline" onClick={handleRetry} disabled={isLoading} className="cursor-pointer text-xs">
				{isLoading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Play className="h-3 w-3 mr-1" />}
				{m.workflows_retry()}
			</Button>
			{error && <span className="text-xs text-red-500">{error}</span>}
		</div>
	);
}

function JobDetailsDialog({ job, onRetrySuccess }: { job: RecentJob; onRetrySuccess?: () => void }) {
	const isFailed = job.status === "failed";
	const [isOpen, setIsOpen] = useState(false);
	const [logs, setLogs] = useState<string[]>([]);
	const [logsLoading, setLogsLoading] = useState(false);
	const [logsError, setLogsError] = useState<string | null>(null);
	const [retryLoading, setRetryLoading] = useState(false);
	const [retryError, setRetryError] = useState<string | null>(null);
	const [retrySuccess, setRetrySuccess] = useState(false);

	useEffect(() => {
		if (isOpen && job.id) {
			setLogsLoading(true);
			setLogsError(null);
			getJobLogsFn({ data: { jobId: job.id } })
				.then((data) => setLogs(data.logs || []))
				.catch((err) => setLogsError(err.message))
				.finally(() => setLogsLoading(false));
		}
	}, [isOpen, job.id]);

	const handleRetry = async () => {
		setRetryLoading(true);
		setRetryError(null);
		setRetrySuccess(false);

		try {
			await retryJobFn({ data: { jobId: job.id, promptId: job.data?.promptId } });
			setRetrySuccess(true);
			setTimeout(() => {
				setIsOpen(false);
				onRetrySuccess?.();
			}, 1000);
		} catch (err) {
			setRetryError(err instanceof Error ? err.message : m.common_error());
		} finally {
			setRetryLoading(false);
		}
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					className={`cursor-pointer ${isFailed ? "text-red-600 hover:text-red-700" : "text-muted-foreground hover:text-foreground"}`}
				>
					{m.workflows_view_logs()}
				</Button>
			</DialogTrigger>
			<DialogContent className="max-w-[90vw] sm:max-w-[90vw] w-full max-h-[80vh] overflow-y-auto" closeLabel={m.common_close()}>
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						{isFailed ? (
							<XCircle className="h-5 w-5 text-red-500" />
						) : (
							<CheckCircle2 className="h-5 w-5 text-emerald-500" />
						)}
						{isFailed ? m.workflows_failed_details() : m.workflows_completed_details()}
					</DialogTitle>
					<DialogDescription>{m.workflows_job_id({ id: job.id })}</DialogDescription>
				</DialogHeader>
				<div className="space-y-4">
					<div className="grid grid-cols-2 gap-4 text-sm">
						<div>
							<p className="text-muted-foreground">{m.workflows_status()}</p>
							<Badge className={isFailed ? "bg-red-500" : "bg-emerald-600"}>{isFailed ? m.status_failed() : m.status_completed()}</Badge>
						</div>
						<div>
							<p className="text-muted-foreground">{m.workflows_prompt_id()}</p>
							<p className="font-mono text-xs">{job.data?.promptId || m.report_not_available()}</p>
						</div>
						<div>
							<p className="text-muted-foreground">{m.workflows_finished_at()}</p>
							<p>{job.finishedOn ? formatLocaleDate(job.finishedOn, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : m.common_unknown()}</p>
						</div>
					</div>
					{isFailed && job.failedReason && (
						<div>
							<p className="text-muted-foreground mb-1">{m.workflows_error_message()}</p>
							<div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-800">{job.failedReason}</div>
						</div>
					)}
					{/* Job Logs Section */}
					<div>
						<p className="text-muted-foreground mb-1">{m.workflows_execution_logs()}</p>
						{logsLoading ? (
							<div className="flex items-center gap-2 text-sm text-muted-foreground">
								<Loader2 className="h-4 w-4 animate-spin" />
								{m.workflows_loading_logs()}
							</div>
						) : logsError ? (
							<div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-800">
								{m.workflows_logs_error({ error: logsError })}
							</div>
						) : logs.length > 0 ? (
							<pre className="bg-muted rounded p-3 text-xs overflow-x-auto max-h-80 whitespace-pre-wrap">
								{logs.join("\n")}
							</pre>
						) : (
							<p className="text-sm text-muted-foreground italic">{m.workflows_no_logs()}</p>
						)}
					</div>
					{/* Retry Button for Failed Jobs */}
					{isFailed && (
						<div className="flex items-center gap-3 pt-2 border-t">
							{retrySuccess ? (
								<div className="flex items-center gap-2 text-emerald-600">
									<CheckCircle2 className="h-4 w-4" />
									<span>{m.workflows_retry_queued()}</span>
								</div>
							) : (
								<>
									<Button onClick={handleRetry} disabled={retryLoading} className="cursor-pointer">
										{retryLoading ? (
											<Loader2 className="h-4 w-4 mr-2 animate-spin" />
										) : (
											<Play className="h-4 w-4 mr-2" />
										)}
									{m.workflows_retry_this_job()}
									</Button>
									{retryError && <span className="text-sm text-red-600">{retryError}</span>}
								</>
							)}
						</div>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}

function BrandRow({
	brand,
	isExpanded,
	onToggle,
	recentJobs,
	onRefresh,
}: {
	brand: BrandScheduleSummary;
	isExpanded: boolean;
	onToggle: () => void;
	recentJobs: RecentJob[];
	onRefresh: () => void;
}) {
	const hasOverdue = brand.overduePrompts > 0;
	const scheduleHealth =
		brand.enabledPrompts > 0 ? Math.round((brand.onSchedulePrompts / brand.enabledPrompts) * 100) : 100;

	return (
		<>
			<TableRow className={`cursor-pointer hover:bg-muted/50 ${hasOverdue ? "bg-amber-50/50" : ""}`} onClick={onToggle}>
				<TableCell>
					<div className="flex items-center gap-2">
						{isExpanded ? (
							<ChevronDown className="h-4 w-4 text-muted-foreground" />
						) : (
							<ChevronRight className="h-4 w-4 text-muted-foreground" />
						)}
						<div>
							<Link
								to="/app/$brand"
								params={{ brand: brand.brandId }}
								className="font-medium text-primary hover:underline"
								onClick={(e) => e.stopPropagation()}
							>
								{brand.brandName}
							</Link>
							<p className="text-xs text-muted-foreground">{brand.website}</p>
						</div>
					</div>
				</TableCell>
				<TableCell className="text-center">
					<div className="text-sm">
						<span className="font-medium">{brand.enabledPrompts}</span>
						<span className="text-muted-foreground">/{brand.totalPrompts}</span>
					</div>
				</TableCell>
				<TableCell className="text-center">
					<span className="text-sm">{formatDuration(brand.runFrequencyMs)}</span>
				</TableCell>
				<TableCell className="text-center">
					<div className="flex items-center justify-center gap-2">
						<Progress value={scheduleHealth} className="w-20 h-2" />
						<span className={`text-sm font-medium ${scheduleHealth < 80 ? "text-amber-600" : "text-emerald-600"}`}>
							{formatPercent(scheduleHealth / 100, { maximumFractionDigits: 0 })}
						</span>
					</div>
				</TableCell>
				<TableCell className="text-center">
					{brand.overduePrompts > 0 ? (
						<Badge variant="destructive" className="bg-amber-500">
											{m.workflows_overdue_count({ count: formatNumber(brand.overduePrompts) })}
						</Badge>
					) : (
						<Badge variant="secondary" className="bg-emerald-100 text-emerald-700">
											{m.workflows_all_on_schedule()}
						</Badge>
					)}
				</TableCell>
			</TableRow>
			{isExpanded && brand.prompts.length > 0 && (
				<TableRow>
					<TableCell colSpan={5} className="bg-muted/30 p-0">
						<div className="p-4">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead className="w-[250px]">{m.fanout_prompt()}</TableHead>
										<TableHead className="text-center">{m.workflows_status()}</TableHead>
										{Object.keys(brand.prompts[0]?.lastRunsByModel || {}).map((model) => (
											<TableHead key={model} className="text-center capitalize">
												{model}
											</TableHead>
										))}
										<TableHead className="text-center">{m.workflows_prod_scheduler()}</TableHead>
										<TableHead className="text-center">{m.workflows_last_job()}</TableHead>
										<TableHead className="text-center">{m.admin_actions()}</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{[...brand.prompts]
										.sort((a, b) => {
											const getCategory = (p: typeof a) => {
												const isOverdue = p.enabled && Object.values(p.lastRunsByModel).some((e) => e?.isOverdue);
												if (isOverdue) return 0;
												if (p.enabled) return 1;
												return 2;
											};
											return getCategory(a) - getCategory(b);
										})
										.map((prompt) => {
											const isStuck = prompt.enabled && Object.values(prompt.lastRunsByModel).some((e) => e?.isOverdue);
											const promptJobs = recentJobs
												.filter((j) => j.data?.promptId === prompt.promptId)
												.sort((a, b) => b.timestamp - a.timestamp);
											const latestJob = promptJobs[0];
											const hasActiveJob = prompt.jobStatus !== "none";
											const showRetry = prompt.enabled && isStuck && prompt.schedulerInfo.exists && !hasActiveJob;
											const shouldDim = !prompt.enabled;

											return (
												<TableRow key={prompt.promptId} className={shouldDim ? "opacity-50" : ""}>
													<TableCell className="max-w-xs">
														<p className="truncate text-sm" title={prompt.promptValue}>
															{prompt.promptValue}
														</p>
													</TableCell>
													<TableCell className="text-center">
														{!prompt.enabled ? (
															<Badge variant="outline">{m.common_disabled()}</Badge>
														) : (
															<div className="flex flex-col items-center gap-1">
																<Badge variant="secondary" className="bg-emerald-100 text-emerald-700">
																	{m.common_enabled()}
																</Badge>
																{prompt.jobStatus === "active" && (
																	<Badge variant="secondary" className="bg-emerald-100 text-emerald-700">
																		{m.workflows_active()}
																	</Badge>
																)}
																{prompt.jobStatus === "created" && (
																	<Badge variant="secondary" className="bg-blue-100 text-blue-700">
																		{m.workflows_queued()}
																	</Badge>
																)}
																{prompt.jobStatus === "retry" && (
																	<Badge variant="secondary" className="bg-amber-100 text-amber-700">
																		{m.workflows_retry()}
																	</Badge>
																)}
															</div>
														)}
													</TableCell>
													{Object.entries(prompt.lastRunsByModel).map(([model, status]) => (
														<TableCell key={model} className="text-center">
															<ModelStatus status={status} />
														</TableCell>
													))}
													<TableCell className="text-center">
														<SchedulerCell info={prompt.schedulerInfo} />
													</TableCell>
													<TableCell className="text-center">
														{latestJob && <JobDetailsDialog job={latestJob} onRetrySuccess={onRefresh} />}
													</TableCell>
													<TableCell className="text-center">
														{showRetry && <RetryButton promptId={prompt.promptId} onSuccess={onRefresh} />}
														{prompt.jobStatus === "active" && (
														<span className="text-xs text-muted-foreground">{m.workflows_processing()}</span>
														)}
														{prompt.jobStatus === "created" && (
														<span className="text-xs text-muted-foreground">{m.workflows_in_queue()}</span>
														)}
														{prompt.jobStatus === "retry" && (
														<span className="text-xs text-muted-foreground">{m.workflows_retrying()}</span>
														)}
													</TableCell>
												</TableRow>
											);
										})}
								</TableBody>
							</Table>
						</div>
					</TableCell>
				</TableRow>
			)}
		</>
	);
}

// ============================================================================
// Route
// ============================================================================

export const Route = createFileRoute("/_authed/admin/workflows")({
	head: ({ match }) => {
		const appName = getAppName(match);
		return {
			meta: [
				{ title: `${m.workflows_title()} · ${appName}` },
				{ name: "description", content: m.workflows_description() },
			],
		};
	},
	component: WorkflowsPage,
});

function WorkflowsPage() {
	const [data, setData] = useState<WorkflowsData | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [expandedBrands, setExpandedBrands] = useState<Set<string>>(new Set());
	const [isRefreshing, setIsRefreshing] = useState(false);

	const fetchData = async (showRefreshing = false) => {
		if (showRefreshing) setIsRefreshing(true);

		try {
			const result = await getWorkflowDataFn();
			setData(result as any);
		} catch (err) {
			setError(err instanceof Error ? err.message : m.common_error());
		} finally {
			setLoading(false);
			setIsRefreshing(false);
		}
	};

	useEffect(() => {
		fetchData();
		const interval = setInterval(() => fetchData(), 30000);
		return () => clearInterval(interval);
	}, []);

	const toggleBrand = (brandId: string) => {
		setExpandedBrands((prev) => {
			const next = new Set(prev);
			if (next.has(brandId)) {
				next.delete(brandId);
			} else {
				next.add(brandId);
			}
			return next;
		});
	};

	if (loading) {
		return (
			<div className="space-y-8">
				<div className="space-y-2">
					<Skeleton className="h-8 w-64" />
					<Skeleton className="h-4 w-96" />
				</div>
				<div className="grid gap-4 md:grid-cols-4">
					{[0, 1, 2, 3].map((n) => (
						<Skeleton key={n} className="h-32" />
					))}
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

	if (!data) return null;

	// Compute overdue breakdown
	const THIRTY_MIN_MS = 30 * 60 * 1000;
	const overdueBreakdown = data.brands.reduce(
		(acc, brand) => {
			for (const prompt of brand.prompts) {
				if (!prompt.enabled) continue;
				const models = Object.values(prompt.lastRunsByModel);
				const isOverdue = models.some((e) => e?.isOverdue);
				const isSeverelyOverdue = models.some((e) => e?.isOverdue && e.overdueByMs && e.overdueByMs > THIRTY_MIN_MS);
				if (isOverdue) acc.total++;
				if (isSeverelyOverdue) acc.severe++;
			}
			return acc;
		},
		{ total: 0, severe: 0 },
	);

	return (
		<div className="space-y-8">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="space-y-2">
					<h1 className="text-3xl font-bold tracking-tight">{m.workflows_title()}</h1>
					<p className="text-muted-foreground">{m.workflows_description()}</p>
				</div>
				<div className="flex items-center gap-2">
					<Button variant="outline" onClick={() => fetchData(true)} disabled={isRefreshing} className="cursor-pointer">
						<RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
						{m.workflows_refresh()}
					</Button>
				</div>
			</div>

			{/* Summary Cards */}
			<div className="grid gap-4 md:grid-cols-4">
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium flex items-center gap-2">
							<Activity className="h-4 w-4" />
							{m.workflows_schedule_health()}
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="flex items-baseline gap-2">
							<span
								className={`text-3xl font-bold ${data.summary.percentOnSchedule >= 80 ? "text-emerald-600" : "text-amber-600"}`}
							>
								{formatPercent(data.summary.percentOnSchedule / 100)}
							</span>
							<span className="text-muted-foreground text-sm">{m.workflows_on_schedule_lower()}</span>
						</div>
						<Progress value={data.summary.percentOnSchedule} className="mt-2" />
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium flex items-center gap-2">
							<CheckCircle2 className="h-4 w-4 text-emerald-500" />
							{m.workflows_on_schedule()}
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="flex items-baseline gap-2">
							<span className="text-3xl font-bold text-emerald-600">{data.summary.totalOnSchedule}</span>
							<span className="text-muted-foreground text-sm">{m.workflows_prompts()}</span>
						</div>
						<p className="text-xs text-muted-foreground mt-1">{m.workflows_enabled_count({ count: formatNumber(data.summary.totalEnabled) })}</p>
					</CardContent>
				</Card>

				<Card
					className={
						overdueBreakdown.severe > 0 ? "border-red-500/50" : overdueBreakdown.total > 0 ? "border-amber-500/50" : ""
					}
				>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium flex items-center gap-2">
							<AlertTriangle className={`h-4 w-4 ${overdueBreakdown.severe > 0 ? "text-red-500" : "text-amber-500"}`} />
							{m.workflows_overdue_30()}
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="flex items-baseline gap-2">
							<span
								className={`text-3xl font-bold ${overdueBreakdown.severe > 0 ? "text-red-600" : "text-muted-foreground"}`}
							>
								{overdueBreakdown.severe}
							</span>
							<span className="text-muted-foreground text-sm">{m.workflows_prompts()}</span>
						</div>
						<p className="text-xs text-muted-foreground mt-1">
							{m.workflows_recently_expired({ count: formatNumber(overdueBreakdown.total - overdueBreakdown.severe) })}
						</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium flex items-center gap-2">
							<Clock className="h-4 w-4" />
							{m.workflows_total_brands()}
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="flex items-baseline gap-2">
							<span className="text-3xl font-bold">{data.summary.totalBrands}</span>
							<span className="text-muted-foreground text-sm">{m.workflows_brands()}</span>
						</div>
						<p className="text-xs text-muted-foreground mt-1">{m.workflows_total_prompts({ count: formatNumber(data.summary.totalPrompts) })}</p>
					</CardContent>
				</Card>
			</div>

			{/* Queue Stats */}
			<QueueStatsCard stats={data.queue} title={m.workflows_prompt_queue()} />

			{/* Brands Table */}
			<Card>
				<CardHeader>
					<CardTitle>{m.workflows_brand_status()}</CardTitle>
					<CardDescription>{m.workflows_brand_status_description()}</CardDescription>
				</CardHeader>
				<CardContent>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>{m.report_brand()}</TableHead>
								<TableHead className="text-center">{m.wizard_prompts_title()}</TableHead>
								<TableHead className="text-center">{m.workflows_run_frequency()}</TableHead>
								<TableHead className="text-center">{m.workflows_health()}</TableHead>
								<TableHead className="text-center">{m.workflows_status()}</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{[...data.brands]
								.sort((a, b) => b.overduePrompts - a.overduePrompts)
								.map((brand) => (
									<BrandRow
										key={brand.brandId}
										brand={brand}
										isExpanded={expandedBrands.has(brand.brandId)}
										onToggle={() => toggleBrand(brand.brandId)}
										recentJobs={data.recentJobs}
										onRefresh={() => fetchData(true)}
									/>
								))}
						</TableBody>
					</Table>
				</CardContent>
			</Card>
		</div>
	);
}
