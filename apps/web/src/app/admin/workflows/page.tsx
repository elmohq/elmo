"use client";

import { useEffect, useState } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
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
	ArrowLeft,
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
	AlertCircle,
} from "lucide-react";

interface SchedulerInfo {
	exists: boolean;
	nextRunAt: number | null;
	iterationCount: number | null;
	every: number | null;
}

interface LastRunByModelGroup {
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
	lastRunsByModelGroup: {
		openai?: LastRunByModelGroup;
		anthropic?: LastRunByModelGroup;
		google?: LastRunByModelGroup;
	};
	schedulerInfo: {
		dev: SchedulerInfo;
		prod: SchedulerInfo;
	};
	recentFailures: {
		dev: number;
		prod: number;
	};
	isActiveOrWaiting: {
		dev: boolean;
		prod: boolean;
	};
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
	schedulerCoverage: {
		dev: { scheduled: number; total: number };
		prod: { scheduled: number; total: number };
	};
	prompts: PromptScheduleStatus[];
}

interface QueueStats {
	name: string;
	environment: "dev" | "prod";
	waiting: number;
	active: number;
	completed: number;
	failed: number;
	delayed: number;
	schedulersCount: number;
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
	stacktrace: string[] | null;
	returnValue: any;
	environment: "dev" | "prod";
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
	queues: {
		dev: QueueStats;
		prod: QueueStats;
	};
	recentJobs: RecentJob[];
	brands: BrandScheduleSummary[];
	currentEnvironment: string;
}

function formatDuration(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);
	const weeks = Math.floor(days / 7);

	if (weeks > 0) {
		const remainingDays = days % 7;
		return remainingDays > 0 ? `${weeks}w ${remainingDays}d` : `${weeks}w`;
	}
	if (days > 0) {
		const remainingHours = hours % 24;
		return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
	}
	if (hours > 0) {
		const remainingMinutes = minutes % 60;
		return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
	}
	if (minutes > 0) return `${minutes}m`;
	return `${seconds}s`;
}

function formatRelativeTime(dateStr: string | null): string {
	if (!dateStr) return "Never";
	const date = new Date(dateStr);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	return formatDuration(diffMs) + " ago";
}

function formatFutureTime(timestamp: number | null): string {
	if (!timestamp) return "Unknown";
	const now = Date.now();
	const diffMs = timestamp - now;
	if (diffMs < 0) return "Overdue";
	return "in " + formatDuration(diffMs);
}

function QueueStatsCard({ stats, title }: { stats: QueueStats; title: string }) {
	const hasIssues = stats.failed > 0 || stats.delayed > 10;

	return (
		<Card className={hasIssues ? "border-amber-500/50" : ""}>
			<CardHeader className="pb-2">
				<CardTitle className="text-sm font-medium flex items-center gap-2">
					<Server className="h-4 w-4" />
					{title}
				</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="grid grid-cols-3 gap-4 text-sm">
					<div>
						<p className="text-muted-foreground">Active</p>
						<p className="text-xl font-semibold text-emerald-600">{stats.active}</p>
					</div>
					<div>
						<p className="text-muted-foreground">Waiting</p>
						<p className="text-xl font-semibold text-blue-600">{stats.waiting}</p>
					</div>
					<div>
						<p className="text-muted-foreground">Delayed</p>
						<p className="text-xl font-semibold text-amber-600">{stats.delayed}</p>
					</div>
					<div>
						<p className="text-muted-foreground">Completed</p>
						<p className="text-xl font-semibold">{stats.completed.toLocaleString()}</p>
					</div>
					<div>
						<p className="text-muted-foreground">Failed</p>
						<p className={`text-xl font-semibold ${stats.failed > 0 ? "text-red-600" : ""}`}>{stats.failed}</p>
					</div>
					<div>
						<p className="text-muted-foreground">Schedulers</p>
						<p className="text-xl font-semibold text-violet-600">{stats.schedulersCount}</p>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

function SchedulerCell({ info }: { info: SchedulerInfo }) {
	if (!info.exists) {
		return <span className="text-muted-foreground text-xs">—</span>;
	}

	const nextText = info.nextRunAt ? formatFutureTime(info.nextRunAt) : "Unknown";

	return (
		<div className="flex flex-col gap-0.5">
			<span className="text-xs font-medium">Next: {nextText}</span>
		</div>
	);
}

function ModelGroupStatus({ status }: { status?: LastRunByModelGroup }) {
	if (!status) {
		return <span className="text-muted-foreground">-</span>;
	}

	const lastRunText = status.lastRunAt ? formatRelativeTime(status.lastRunAt) : "Never";

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

function RetryButton({
	promptId,
	environment,
	jobId,
	onSuccess,
}: {
	promptId?: string;
	environment: "dev" | "prod";
	jobId?: string;
	onSuccess: () => void;
}) {
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<"queued" | "recreated" | false>(false);

	const handleRetry = async () => {
		setIsLoading(true);
		setError(null);
		setSuccess(false);

		try {
			const response = await fetch("/api/admin/workflows", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ promptId, environment, jobId }),
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || "Failed to trigger retry");
			}

			const data = await response.json();
			setSuccess(data.recreatedScheduler ? "recreated" : "queued");
			setTimeout(() => {
				onSuccess();
			}, 1000);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to retry");
		} finally {
			setIsLoading(false);
		}
	};

	if (success) {
		return (
			<Button size="sm" variant="outline" disabled className="cursor-default">
				<CheckCircle2 className="h-3 w-3 mr-1 text-emerald-500" />
				{success === "recreated" ? "Scheduler Reset" : "Queued"}
			</Button>
		);
	}

	return (
		<div className="flex flex-col gap-1">
			<Button
				size="sm"
				variant="outline"
				onClick={handleRetry}
				disabled={isLoading}
				className="cursor-pointer text-xs"
			>
				{isLoading ? (
					<Loader2 className="h-3 w-3 mr-1 animate-spin" />
				) : (
					<Play className="h-3 w-3 mr-1" />
				)}
				Retry ({environment})
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
			fetch(`/api/admin/workflows/logs?jobId=${encodeURIComponent(job.id)}&environment=${job.environment}`)
				.then((res) => res.json())
				.then((data) => {
					if (data.error) {
						setLogsError(data.error);
					} else {
						setLogs(data.logs || []);
					}
				})
				.catch((err) => {
					setLogsError(err.message);
				})
				.finally(() => {
					setLogsLoading(false);
				});
		}
	}, [isOpen, job.id, job.environment]);

	const handleRetry = async () => {
		setRetryLoading(true);
		setRetryError(null);
		setRetrySuccess(false);

		try {
			const response = await fetch("/api/admin/workflows", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ jobId: job.id, environment: job.environment }),
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || "Failed to retry job");
			}

			setRetrySuccess(true);
			setTimeout(() => {
				setIsOpen(false);
				onRetrySuccess?.();
			}, 1000);
		} catch (err) {
			setRetryError(err instanceof Error ? err.message : "Unknown error");
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
					View Logs
				</Button>
			</DialogTrigger>
			<DialogContent className="max-w-[90vw] sm:max-w-[90vw] w-full max-h-[80vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						{isFailed ? (
							<XCircle className="h-5 w-5 text-red-500" />
						) : (
							<CheckCircle2 className="h-5 w-5 text-emerald-500" />
						)}
						{isFailed ? "Failed Job Details" : "Completed Job Details"}
					</DialogTitle>
					<DialogDescription>Job ID: {job.id}</DialogDescription>
				</DialogHeader>
				<div className="space-y-4">
					<div className="grid grid-cols-2 gap-4 text-sm">
						<div>
							<p className="text-muted-foreground">Status</p>
							<Badge className={isFailed ? "bg-red-500" : "bg-emerald-600"}>
								{job.status}
							</Badge>
						</div>
						<div>
							<p className="text-muted-foreground">Environment</p>
							<Badge className={job.environment === "prod" ? "bg-emerald-600" : "bg-amber-500"}>
								{job.environment}
							</Badge>
						</div>
						<div>
							<p className="text-muted-foreground">Prompt ID</p>
							<p className="font-mono text-xs">{job.data?.promptId || "N/A"}</p>
						</div>
						<div>
							<p className="text-muted-foreground">Finished At</p>
							<p>{job.finishedOn ? new Date(job.finishedOn).toLocaleString() : "Unknown"}</p>
						</div>
					</div>
					{isFailed && job.failedReason && (
						<div>
							<p className="text-muted-foreground mb-1">Error Message</p>
							<div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-800">{job.failedReason}</div>
						</div>
					)}
					{isFailed && job.stacktrace && job.stacktrace.length > 0 && (
						<div>
							<p className="text-muted-foreground mb-1">Stack Trace</p>
							<pre className="bg-muted rounded p-3 text-xs overflow-x-auto max-h-60">{job.stacktrace.join("\n")}</pre>
						</div>
					)}
					{/* Job Logs Section */}
					<div>
						<p className="text-muted-foreground mb-1">Execution Logs</p>
						{logsLoading ? (
							<div className="flex items-center gap-2 text-sm text-muted-foreground">
								<Loader2 className="h-4 w-4 animate-spin" />
								Loading logs...
							</div>
						) : logsError ? (
							<div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-800">
								Error loading logs: {logsError}
							</div>
						) : logs.length > 0 ? (
							<pre className="bg-muted rounded p-3 text-xs overflow-x-auto max-h-80 whitespace-pre-wrap">
								{logs.join("\n")}
							</pre>
						) : (
							<p className="text-sm text-muted-foreground italic">No logs available</p>
						)}
					</div>
					{!isFailed && job.returnValue && (
						<div>
							<p className="text-muted-foreground mb-1">Return Value</p>
							<pre className="bg-muted rounded p-3 text-xs overflow-x-auto max-h-60">
								{JSON.stringify(job.returnValue, null, 2)}
							</pre>
						</div>
					)}
					{/* Retry Button for Failed Jobs */}
					{isFailed && (
						<div className="flex items-center gap-3 pt-2 border-t">
							{retrySuccess ? (
								<div className="flex items-center gap-2 text-emerald-600">
									<CheckCircle2 className="h-4 w-4" />
									<span>Job queued for retry</span>
								</div>
							) : (
								<>
									<Button
										onClick={handleRetry}
										disabled={retryLoading}
										className="cursor-pointer"
									>
										{retryLoading ? (
											<Loader2 className="h-4 w-4 mr-2 animate-spin" />
										) : (
											<Play className="h-4 w-4 mr-2" />
										)}
										Retry This Job
									</Button>
									{retryError && (
										<span className="text-sm text-red-600">{retryError}</span>
									)}
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
	const scheduleHealth = brand.enabledPrompts > 0 ? Math.round((brand.onSchedulePrompts / brand.enabledPrompts) * 100) : 100;

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
								href={`/app/${brand.brandId}`}
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
						{scheduleHealth}%
					</span>
				</div>
			</TableCell>
				<TableCell className="text-center">
					{brand.overduePrompts > 0 ? (
						<Badge variant="destructive" className="bg-amber-500">
							{brand.overduePrompts} overdue
						</Badge>
					) : (
						<Badge variant="secondary" className="bg-emerald-100 text-emerald-700">
							All on schedule
						</Badge>
					)}
				</TableCell>
				<TableCell className="text-center">
					<span
						className={`text-sm ${
							brand.schedulerCoverage.prod.scheduled < brand.schedulerCoverage.prod.total
								? "text-amber-600"
								: "text-emerald-600"
						}`}
					>
						{brand.schedulerCoverage.prod.scheduled}/{brand.schedulerCoverage.prod.total}
					</span>
				</TableCell>
			</TableRow>
			{isExpanded && brand.prompts.length > 0 && (
				<TableRow>
					<TableCell colSpan={6} className="bg-muted/30 p-0">
						<div className="p-4">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead className="w-[250px]">Prompt</TableHead>
										<TableHead className="text-center">Status</TableHead>
										<TableHead className="text-center">OpenAI</TableHead>
										<TableHead className="text-center">Anthropic</TableHead>
										<TableHead className="text-center">Google</TableHead>
										<TableHead className="text-center">Prod Scheduler</TableHead>
										<TableHead className="text-center">Last Job</TableHead>
										<TableHead className="text-center">Actions</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{[...brand.prompts]
										.sort((a, b) => {
											// Helper to determine prompt category for sorting
											const getCategory = (p: typeof a) => {
												const isOverdue = p.enabled && (
													p.lastRunsByModelGroup.openai?.isOverdue ||
													p.lastRunsByModelGroup.anthropic?.isOverdue ||
													p.lastRunsByModelGroup.google?.isOverdue
												);
												const isDevOnly = p.schedulerInfo.dev.exists && !p.schedulerInfo.prod.exists;
												
												if (isOverdue) return 0; // Overdue first
												if (p.enabled && !isDevOnly) return 1; // Enabled (with prod scheduler)
												if (isDevOnly) return 2; // Dev only
												return 3; // Disabled
											};
											return getCategory(a) - getCategory(b);
										})
										.map((prompt) => {
										const isStuck =
											prompt.enabled &&
											(prompt.lastRunsByModelGroup.openai?.isOverdue ||
												prompt.lastRunsByModelGroup.anthropic?.isOverdue ||
												prompt.lastRunsByModelGroup.google?.isOverdue);
										const promptJobs = recentJobs
											.filter((j) => j.data?.promptId === prompt.promptId)
											.sort((a, b) => b.timestamp - a.timestamp);
										const latestJob = promptJobs[0];
										const showDevRetry = prompt.enabled && isStuck && prompt.schedulerInfo.dev.exists && !prompt.isActiveOrWaiting.dev;
										const showProdRetry = prompt.enabled && isStuck && prompt.schedulerInfo.prod.exists && !prompt.isActiveOrWaiting.prod;
										const isDevOnly = prompt.schedulerInfo.dev.exists && !prompt.schedulerInfo.prod.exists;
										const shouldDim = !prompt.enabled || isDevOnly;

										return (
											<TableRow key={prompt.promptId} className={shouldDim ? "opacity-50" : ""}>
												<TableCell className="max-w-xs">
													<p className="truncate text-sm" title={prompt.promptValue}>
														{prompt.promptValue}
													</p>
													{(prompt.isActiveOrWaiting.dev || prompt.isActiveOrWaiting.prod) && (
														<div className="flex items-center gap-1 mt-1">
															<Loader2 className="h-3 w-3 animate-spin text-blue-500" />
															<span className="text-xs text-blue-600">
																Processing in {prompt.isActiveOrWaiting.prod ? "prod" : "dev"}
															</span>
														</div>
													)}
												</TableCell>
												<TableCell className="text-center">
													{!prompt.enabled ? (
														<Badge variant="outline">Disabled</Badge>
													) : isDevOnly ? (
														<Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300">
															Dev Only
														</Badge>
													) : (
														<Badge variant="secondary" className="bg-emerald-100 text-emerald-700">
															Enabled
														</Badge>
													)}
												</TableCell>
												<TableCell className="text-center">
													<ModelGroupStatus status={prompt.lastRunsByModelGroup.openai} />
												</TableCell>
												<TableCell className="text-center">
													<ModelGroupStatus status={prompt.lastRunsByModelGroup.anthropic} />
												</TableCell>
												<TableCell className="text-center">
													<ModelGroupStatus status={prompt.lastRunsByModelGroup.google} />
												</TableCell>
												<TableCell className="text-center">
													<SchedulerCell info={prompt.schedulerInfo.prod} />
												</TableCell>
												<TableCell className="text-center">
													{latestJob && <JobDetailsDialog job={latestJob} onRetrySuccess={onRefresh} />}
												</TableCell>
												<TableCell className="text-center">
													{(showDevRetry || showProdRetry) && (
														<div className="flex flex-col gap-1">
															{showDevRetry && (
																<RetryButton promptId={prompt.promptId} environment="dev" onSuccess={onRefresh} />
															)}
															{showProdRetry && (
																<RetryButton promptId={prompt.promptId} environment="prod" onSuccess={onRefresh} />
															)}
														</div>
													)}
													{(prompt.isActiveOrWaiting.dev || prompt.isActiveOrWaiting.prod) && (
														<span className="text-xs text-muted-foreground">In progress...</span>
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

export default function WorkflowsPage() {
	const [data, setData] = useState<WorkflowsData | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [isAuthorized, setIsAuthorized] = useState(true);
	const [expandedBrands, setExpandedBrands] = useState<Set<string>>(new Set());
	const [isRefreshing, setIsRefreshing] = useState(false);

	const fetchData = async (showRefreshing = false) => {
		if (showRefreshing) setIsRefreshing(true);

		try {
			const response = await fetch("/api/admin/workflows");

			if (response.status === 403) {
				setIsAuthorized(false);
				return;
			}

			if (!response.ok) {
				throw new Error("Failed to fetch workflow data");
			}

			const data = await response.json();
			setData(data);
		} catch (err) {
			setError(err instanceof Error ? err.message : "An error occurred");
		} finally {
			setLoading(false);
			setIsRefreshing(false);
		}
	};

	useEffect(() => {
		fetchData();

		// Auto-refresh every 30 seconds
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

	if (!isAuthorized) {
		notFound();
	}

	if (loading) {
		return (
			<div className="container mx-auto py-8 space-y-8">
				<div className="space-y-2">
					<Skeleton className="h-8 w-64" />
					<Skeleton className="h-4 w-96" />
				</div>
				<div className="grid gap-4 md:grid-cols-4">
					{[...Array(4)].map((_, i) => (
						<Skeleton key={i} className="h-32" />
					))}
				</div>
				<Card>
					<CardHeader>
						<Skeleton className="h-6 w-48" />
					</CardHeader>
					<CardContent>
						<div className="space-y-4">
							{[...Array(5)].map((_, i) => (
								<Skeleton key={i} className="h-16 w-full" />
							))}
						</div>
					</CardContent>
				</Card>
			</div>
		);
	}

	if (error) {
		return (
			<div className="container mx-auto py-8">
				<Card>
					<CardHeader>
						<CardTitle className="text-destructive">Error</CardTitle>
					</CardHeader>
					<CardContent>
						<p>{error}</p>
					</CardContent>
				</Card>
			</div>
		);
	}

	if (!data) return null;

	return (
		<div className="container mx-auto py-8 px-6 space-y-8">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="space-y-2">
					<h1 className="text-3xl font-bold tracking-tight">Workflows</h1>
					<p className="text-muted-foreground">
						Monitor prompt scheduling, job execution, and worker health across environments
					</p>
				</div>
				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						onClick={() => fetchData(true)}
						disabled={isRefreshing}
						className="cursor-pointer"
					>
						<RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
						Refresh
					</Button>
					<Link href="/admin">
						<Button variant="outline" className="cursor-pointer">
							<ArrowLeft className="h-4 w-4 mr-2" />
							Back to Admin
						</Button>
					</Link>
				</div>
			</div>

			{/* Summary Cards */}
			<div className="grid gap-4 md:grid-cols-4">
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium flex items-center gap-2">
							<Activity className="h-4 w-4" />
							Schedule Health
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="flex items-baseline gap-2">
							<span
								className={`text-3xl font-bold ${data.summary.percentOnSchedule >= 80 ? "text-emerald-600" : "text-amber-600"}`}
							>
								{data.summary.percentOnSchedule}%
							</span>
							<span className="text-muted-foreground text-sm">on schedule</span>
						</div>
						<Progress value={data.summary.percentOnSchedule} className="mt-2" />
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium flex items-center gap-2">
							<CheckCircle2 className="h-4 w-4 text-emerald-500" />
							On Schedule
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="flex items-baseline gap-2">
							<span className="text-3xl font-bold text-emerald-600">{data.summary.totalOnSchedule}</span>
							<span className="text-muted-foreground text-sm">prompts</span>
						</div>
						<p className="text-xs text-muted-foreground mt-1">of {data.summary.totalEnabled} enabled</p>
					</CardContent>
				</Card>

				<Card className={data.summary.totalOverdue > 0 ? "border-amber-500/50" : ""}>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium flex items-center gap-2">
							<AlertTriangle className="h-4 w-4 text-amber-500" />
							Overdue
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="flex items-baseline gap-2">
							<span
								className={`text-3xl font-bold ${data.summary.totalOverdue > 0 ? "text-amber-600" : "text-muted-foreground"}`}
							>
								{data.summary.totalOverdue}
							</span>
							<span className="text-muted-foreground text-sm">prompts</span>
						</div>
						<p className="text-xs text-muted-foreground mt-1">need attention</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium flex items-center gap-2">
							<Clock className="h-4 w-4" />
							Total Brands
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="flex items-baseline gap-2">
							<span className="text-3xl font-bold">{data.summary.totalBrands}</span>
							<span className="text-muted-foreground text-sm">brands</span>
						</div>
						<p className="text-xs text-muted-foreground mt-1">{data.summary.totalPrompts} total prompts</p>
					</CardContent>
				</Card>
			</div>

			{/* Queue Stats */}
			<QueueStatsCard stats={data.queues.prod} title="Production Queue" />

			{/* Brands Table */}
			<Card>
				<CardHeader>
					<CardTitle>Brand Workflow Status</CardTitle>
					<CardDescription>Click on a brand to expand and see individual prompt status</CardDescription>
				</CardHeader>
				<CardContent>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Brand</TableHead>
								<TableHead className="text-center">Prompts</TableHead>
								<TableHead className="text-center">Run Frequency</TableHead>
								<TableHead className="text-center">Health</TableHead>
								<TableHead className="text-center">Status</TableHead>
								<TableHead className="text-center">Schedulers</TableHead>
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
