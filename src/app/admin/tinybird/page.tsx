"use client";

import { useEffect, useState } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	ArrowLeft,
	Check,
	Circle,
	Loader2,
	AlertTriangle,
	Trash2,
	ChevronDown,
	ChevronRight,
	Zap,
	Database,
	RefreshCw,
} from "lucide-react";

interface PhaseStatus {
	phase: number;
	name: string;
	status: "completed" | "in_progress" | "pending";
	description: string;
	details?: string;
}

interface EndpointStats {
	name: string;
	pgP50: number;
	pgP95: number;
	tbP50: number;
	tbP95: number;
	speedup: number;
	matchRate: number;
	sampleCount: number;
}

interface FieldDiff {
	field: string;
	pgValue: unknown;
	tbValue: unknown;
	withinTolerance: boolean;
}

interface PromptDifference {
	promptId: string;
	pgCount: number;
	tbCount: number;
	diff: number;
}

interface DiagnosticInfo {
	dateRange?: {
		pg: { earliest: string | null; latest: string | null };
		tb: { earliest: string | null; latest: string | null };
	};
	recordCounts?: {
		pg: number;
		tb: number;
	};
	perPromptCounts?: {
		pg: Record<string, number>;
		tb: Record<string, number>;
		differences: PromptDifference[];
	};
	sampleIds?: {
		pg: string[];
		tb: string[];
		onlyInPg: string[];
		onlyInTb: string[];
	};
	extra?: Record<string, unknown>;
}

interface MismatchLog {
	endpoint: string;
	timestamp: string;
	brandId: string;
	filters: Record<string, unknown>;
	postgres: unknown;
	tinybird: unknown;
	diff: FieldDiff[];
	diagnostics?: DiagnosticInfo;
}

interface EnvStatus {
	TINYBIRD_TOKEN: boolean;
	TINYBIRD_BASE_URL: boolean;
	TINYBIRD_WRITE_ENABLED: boolean;
	TINYBIRD_VERIFY_ENABLED: boolean;
	TINYBIRD_READ_PRIMARY: boolean;
}

interface ConnectionTest {
	success: boolean;
	message: string;
	latencyMs?: number;
	error?: string;
	config?: {
		clickhouseUrl: string;
		baseUrl: string;
		workspace: string;
	};
}

interface MigrationData {
	phases: PhaseStatus[];
	endpoints: EndpointStats[];
	recentMismatches: MismatchLog[];
	envStatus: EnvStatus;
	connectionTest: ConnectionTest;
}

function PhaseIcon({ status }: { status: PhaseStatus["status"] }) {
	switch (status) {
		case "completed":
			return <Check className="h-5 w-5 text-green-500" />;
		case "in_progress":
			return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
		default:
			return <Circle className="h-5 w-5 text-muted-foreground" />;
	}
}

function PhaseStatusBadge({ status }: { status: PhaseStatus["status"] }) {
	switch (status) {
		case "completed":
			return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Complete</Badge>;
		case "in_progress":
			return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">In Progress</Badge>;
		default:
			return <Badge variant="secondary">Pending</Badge>;
	}
}

function formatMs(ms: number): string {
	if (ms === 0) return "-";
	if (ms < 1000) return `${Math.round(ms)}ms`;
	return `${(ms / 1000).toFixed(2)}s`;
}

function SpeedupBadge({ pgTime, tbTime }: { pgTime: number; tbTime: number }) {
	if (pgTime === 0 || tbTime === 0) {
		return <span className="text-muted-foreground">-</span>;
	}
	const speedup = Math.round((pgTime / tbTime) * 10) / 10;
	return (
		<Badge
			className={
				speedup >= 10
					? "bg-green-100 text-green-800 hover:bg-green-100"
					: speedup >= 5
						? "bg-blue-100 text-blue-800 hover:bg-blue-100"
						: "bg-muted text-muted-foreground"
			}
		>
			{speedup}x
		</Badge>
	);
}

function MismatchDetails({ mismatch }: { mismatch: MismatchLog }) {
	const [expanded, setExpanded] = useState(false);
	const diagnostics = mismatch.diagnostics;

	return (
		<div className="border rounded-lg p-4 space-y-2">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<AlertTriangle className="h-4 w-4 text-amber-500" />
					<span className="font-medium">{mismatch.endpoint}</span>
					<span className="text-sm text-muted-foreground">
						{new Date(mismatch.timestamp).toLocaleString()}
					</span>
				</div>
				<Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)} className="cursor-pointer">
					{expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
				</Button>
			</div>

			{mismatch.diff.length > 0 && (
				<div className="text-sm">
					{mismatch.diff.slice(0, 3).map((d, i) => (
						<div key={i} className="flex gap-2">
							<span className="text-muted-foreground">{d.field}:</span>
							<span className="text-red-600">{JSON.stringify(d.pgValue)}</span>
							<span className="text-muted-foreground">→</span>
							<span className="text-blue-600">{JSON.stringify(d.tbValue)}</span>
							{d.withinTolerance && <Badge variant="outline" className="text-xs">within tolerance</Badge>}
						</div>
					))}
					{mismatch.diff.length > 3 && (
						<span className="text-muted-foreground">+{mismatch.diff.length - 3} more differences</span>
					)}
				</div>
			)}

			{expanded && (
				<div className="mt-4 space-y-4 text-sm">
					<div>
						<h4 className="font-medium mb-2">Filters</h4>
						<pre className="bg-muted p-2 rounded text-xs overflow-auto max-h-32">
							{JSON.stringify(mismatch.filters, null, 2)}
						</pre>
					</div>
					<div className="grid grid-cols-2 gap-4">
						<div>
							<h4 className="font-medium mb-2 flex items-center gap-2">
								<Database className="h-4 w-4" />
								PostgreSQL
							</h4>
							<pre className="bg-muted p-2 rounded text-xs overflow-auto max-h-48">
								{JSON.stringify(mismatch.postgres, null, 2)}
							</pre>
						</div>
						<div>
							<h4 className="font-medium mb-2 flex items-center gap-2">
								<Zap className="h-4 w-4" />
								Tinybird
							</h4>
							<pre className="bg-muted p-2 rounded text-xs overflow-auto max-h-48">
								{JSON.stringify(mismatch.tinybird, null, 2)}
							</pre>
						</div>
					</div>

					{/* Diagnostics Section */}
					{diagnostics && (
						<div className="border-t pt-4 mt-4">
							<h4 className="font-medium mb-3">Diagnostics</h4>
							
							{/* Date Range Comparison */}
							{diagnostics.dateRange && (
								<div className="mb-4">
									<h5 className="text-xs font-medium text-muted-foreground uppercase mb-2">Date Range</h5>
									<div className="grid grid-cols-2 gap-4">
										<div className="bg-muted/50 p-2 rounded">
											<span className="text-xs text-muted-foreground">PostgreSQL:</span>
											<div className="font-mono text-xs">
												{diagnostics.dateRange.pg.earliest || "null"} → {diagnostics.dateRange.pg.latest || "null"}
											</div>
										</div>
										<div className="bg-muted/50 p-2 rounded">
											<span className="text-xs text-muted-foreground">Tinybird:</span>
											<div className="font-mono text-xs">
												{diagnostics.dateRange.tb.earliest || "null"} → {diagnostics.dateRange.tb.latest || "null"}
											</div>
										</div>
									</div>
								</div>
							)}

							{/* Record Counts */}
							{diagnostics.recordCounts && (
								<div className="mb-4">
									<h5 className="text-xs font-medium text-muted-foreground uppercase mb-2">Record Counts</h5>
									<div className="flex gap-4">
										<div className="bg-muted/50 p-2 rounded flex-1">
											<span className="text-xs text-muted-foreground">PostgreSQL:</span>
											<div className="font-mono">{diagnostics.recordCounts.pg.toLocaleString()}</div>
										</div>
										<div className="bg-muted/50 p-2 rounded flex-1">
											<span className="text-xs text-muted-foreground">Tinybird:</span>
											<div className="font-mono">{diagnostics.recordCounts.tb.toLocaleString()}</div>
										</div>
										<div className="bg-muted/50 p-2 rounded flex-1">
											<span className="text-xs text-muted-foreground">Difference:</span>
											<div className={`font-mono ${diagnostics.recordCounts.tb - diagnostics.recordCounts.pg !== 0 ? "text-amber-600" : "text-green-600"}`}>
												{diagnostics.recordCounts.tb - diagnostics.recordCounts.pg > 0 ? "+" : ""}
												{(diagnostics.recordCounts.tb - diagnostics.recordCounts.pg).toLocaleString()}
											</div>
										</div>
									</div>
								</div>
							)}

							{/* Per-Prompt Differences */}
							{diagnostics.perPromptCounts && diagnostics.perPromptCounts.differences.length > 0 && (
								<div className="mb-4">
									<h5 className="text-xs font-medium text-muted-foreground uppercase mb-2">
										Top Per-Prompt Differences ({diagnostics.perPromptCounts.differences.length} prompts differ)
									</h5>
									<div className="bg-muted/50 rounded overflow-hidden">
										<Table>
											<TableHeader>
												<TableRow className="text-xs">
													<TableHead className="py-2">Prompt ID</TableHead>
													<TableHead className="py-2 text-right">PostgreSQL</TableHead>
													<TableHead className="py-2 text-right">Tinybird</TableHead>
													<TableHead className="py-2 text-right">Diff</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{diagnostics.perPromptCounts.differences.slice(0, 10).map((diff) => (
													<TableRow key={diff.promptId} className="text-xs font-mono">
														<TableCell className="py-1.5 truncate max-w-[200px]" title={diff.promptId}>
															{diff.promptId.slice(0, 8)}...
														</TableCell>
														<TableCell className="py-1.5 text-right">{diff.pgCount}</TableCell>
														<TableCell className="py-1.5 text-right">{diff.tbCount}</TableCell>
														<TableCell className={`py-1.5 text-right ${diff.diff > 0 ? "text-blue-600" : "text-red-600"}`}>
															{diff.diff > 0 ? "+" : ""}{diff.diff}
														</TableCell>
													</TableRow>
												))}
											</TableBody>
										</Table>
										{diagnostics.perPromptCounts.differences.length > 10 && (
											<div className="text-xs text-muted-foreground text-center py-2 border-t">
												+{diagnostics.perPromptCounts.differences.length - 10} more prompts with differences
											</div>
										)}
									</div>
								</div>
							)}

							{/* Extra Info */}
							{diagnostics.extra && Object.keys(diagnostics.extra).length > 0 && (
								<div>
									<h5 className="text-xs font-medium text-muted-foreground uppercase mb-2">Additional Context</h5>
									<pre className="bg-muted p-2 rounded text-xs overflow-auto max-h-32">
										{JSON.stringify(diagnostics.extra, null, 2)}
									</pre>
								</div>
							)}
						</div>
					)}
				</div>
			)}
		</div>
	);
}

export default function TinybirdMigrationPage() {
	const [data, setData] = useState<MigrationData | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [isAuthorized, setIsAuthorized] = useState(true);
	const [clearing, setClearing] = useState(false);

	const fetchData = async () => {
		try {
			const response = await fetch("/api/admin/tinybird/stats");

			if (response.status === 403) {
				setIsAuthorized(false);
				return;
			}

			if (!response.ok) {
				throw new Error("Failed to fetch migration stats");
			}

			const result = await response.json();
			setData(result);
		} catch (err) {
			setError(err instanceof Error ? err.message : "An error occurred");
		} finally {
			setLoading(false);
		}
	};

	const clearStats = async () => {
		if (!confirm("Clear all migration timing stats? This cannot be undone.")) return;

		setClearing(true);
		try {
			const response = await fetch("/api/admin/tinybird/stats", { method: "DELETE" });
			if (!response.ok) throw new Error("Failed to clear stats");
			await fetchData();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to clear stats");
		} finally {
			setClearing(false);
		}
	};

	useEffect(() => {
		fetchData();
	}, []);

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
				<div className="grid gap-4 md:grid-cols-2">
					<Skeleton className="h-64" />
					<Skeleton className="h-64" />
				</div>
				<Skeleton className="h-96" />
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

	// Calculate overall progress
	const completedPhases = data.phases.filter((p) => p.status === "completed").length;
	const progressPercent = Math.round((completedPhases / data.phases.length) * 100);

	// Calculate average speedup (using p50 values)
	const endpointsWithData = data.endpoints.filter((e) => e.sampleCount > 0 && e.tbP50 > 0);
	const avgSpeedup =
		endpointsWithData.length > 0
			? endpointsWithData.reduce((acc, e) => acc + (e.pgP50 / e.tbP50), 0) / endpointsWithData.length
			: 0;

	return (
		<div className="container mx-auto py-8 space-y-8">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="space-y-2">
					<h1 className="text-3xl font-bold tracking-tight">Tinybird Migration</h1>
					<p className="text-muted-foreground">
						Monitor migration progress, query performance, and data verification
					</p>
				</div>
				<div className="flex items-center gap-2">
					<Button variant="outline" onClick={fetchData} className="cursor-pointer">
						<RefreshCw className="h-4 w-4 mr-2" />
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
						<CardTitle className="text-sm font-medium text-muted-foreground">Migration Progress</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{progressPercent}%</div>
						<p className="text-xs text-muted-foreground">
							{completedPhases} of {data.phases.length} phases complete
						</p>
						<div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
							<div
								className="h-full bg-primary transition-all"
								style={{ width: `${progressPercent}%` }}
							/>
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">Average Speedup (p50)</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							{avgSpeedup > 0 ? `${avgSpeedup.toFixed(1)}x` : "-"}
						</div>
						<p className="text-xs text-muted-foreground">Tinybird vs PostgreSQL</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">Endpoints Tracked</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{endpointsWithData.length}</div>
						<p className="text-xs text-muted-foreground">
							{data.endpoints.filter((e) => e.matchRate >= 99).length} with 99%+ match rate
						</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">Recent Mismatches</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{data.recentMismatches.length}</div>
						<p className="text-xs text-muted-foreground">In the last 7 days</p>
					</CardContent>
				</Card>
			</div>

			<div className="grid gap-6 lg:grid-cols-2">
				{/* Phase Status */}
				<Card>
					<CardHeader>
						<CardTitle>Migration Phases</CardTitle>
						<CardDescription>Progress through each phase of the migration</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="space-y-4">
							{data.phases.map((phase) => (
								<div key={phase.phase} className="flex items-start gap-4 p-3 rounded-lg hover:bg-muted/50">
									<PhaseIcon status={phase.status} />
									<div className="flex-1 min-w-0">
										<div className="flex items-center gap-2">
											<span className="font-medium">Phase {phase.phase}: {phase.name}</span>
											<PhaseStatusBadge status={phase.status} />
										</div>
										<p className="text-sm text-muted-foreground">{phase.description}</p>
										{phase.details && (
											<p className="text-xs text-muted-foreground/70 mt-1">{phase.details}</p>
										)}
									</div>
								</div>
							))}
						</div>
					</CardContent>
				</Card>

				{/* Environment Status */}
				<Card>
					<CardHeader>
						<CardTitle>Environment Configuration</CardTitle>
						<CardDescription>Required environment variables and feature flags</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="space-y-3">
							{Object.entries(data.envStatus).map(([key, value]) => (
								<div key={key} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
									<code className="text-sm">{key}</code>
									{value ? (
										<Badge className="bg-green-100 text-green-800 hover:bg-green-100">
											<Check className="h-3 w-3 mr-1" />
											Set
										</Badge>
									) : (
										<Badge variant="secondary">Not Set</Badge>
									)}
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Connection Test */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Database className="h-5 w-5" />
						ClickHouse Connection Test
					</CardTitle>
					<CardDescription>
						Tests connectivity to Tinybird's ClickHouse-compatible endpoint
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="flex items-center gap-4">
						{data.connectionTest.success ? (
							<div className="flex items-center gap-3">
								<div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
									<Check className="h-5 w-5 text-green-600" />
								</div>
								<div>
									<p className="font-medium text-green-700">{data.connectionTest.message}</p>
									<p className="text-sm text-muted-foreground">
										Latency: {data.connectionTest.latencyMs}ms
										{data.connectionTest.config && (
											<> · {data.connectionTest.config.clickhouseUrl}</>
										)}
									</p>
								</div>
							</div>
						) : (
							<div className="flex items-center gap-3">
								<div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
									<AlertTriangle className="h-5 w-5 text-red-600" />
								</div>
								<div>
									<p className="font-medium text-red-700">{data.connectionTest.message}</p>
									{data.connectionTest.error && (
										<p className="text-sm text-red-600 font-mono mt-1">
											{data.connectionTest.error}
										</p>
									)}
									{data.connectionTest.config && (
										<p className="text-sm text-muted-foreground mt-1">
											ClickHouse URL: {data.connectionTest.config.clickhouseUrl}
											<br />
											(derived from TINYBIRD_BASE_URL: {data.connectionTest.config.baseUrl})
										</p>
									)}
								</div>
							</div>
						)}
					</div>
				</CardContent>
			</Card>

			{/* Query Performance Table */}
			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<div>
							<CardTitle>Query Performance</CardTitle>
							<CardDescription>Response time comparison between PostgreSQL and Tinybird</CardDescription>
						</div>
						<Dialog>
							<DialogTrigger asChild>
								<Button variant="outline" size="sm" className="cursor-pointer" disabled={clearing}>
									{clearing ? (
										<Loader2 className="h-4 w-4 mr-2 animate-spin" />
									) : (
										<Trash2 className="h-4 w-4 mr-2" />
									)}
									Clear Stats
								</Button>
							</DialogTrigger>
							<DialogContent>
								<DialogHeader>
									<DialogTitle>Clear Migration Stats?</DialogTitle>
									<DialogDescription>
										This will clear all timing data and comparison results from Redis.
										This action cannot be undone.
									</DialogDescription>
								</DialogHeader>
								<div className="flex justify-end gap-2 mt-4">
									<Button
										variant="destructive"
										onClick={clearStats}
										disabled={clearing}
										className="cursor-pointer"
									>
										{clearing ? "Clearing..." : "Clear All Stats"}
									</Button>
								</div>
							</DialogContent>
						</Dialog>
					</div>
				</CardHeader>
				<CardContent>
					<div className="overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Endpoint</TableHead>
									<TableHead className="text-right">PostgreSQL (p50)</TableHead>
									<TableHead className="text-right">PostgreSQL (p95)</TableHead>
									<TableHead className="text-right">Tinybird (p50)</TableHead>
									<TableHead className="text-right">Tinybird (p95)</TableHead>
									<TableHead className="text-right">Speedup (p50)</TableHead>
									<TableHead className="text-right">Speedup (p95)</TableHead>
									<TableHead className="text-right">Match Rate</TableHead>
									<TableHead className="text-right">Samples</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{data.endpoints.map((endpoint) => (
									<TableRow key={endpoint.name}>
										<TableCell className="font-medium">{endpoint.name}</TableCell>
										<TableCell className="text-right font-mono text-sm">
											{formatMs(endpoint.pgP50)}
										</TableCell>
										<TableCell className="text-right font-mono text-sm text-muted-foreground">
											{formatMs(endpoint.pgP95)}
										</TableCell>
										<TableCell className="text-right font-mono text-sm">
											{formatMs(endpoint.tbP50)}
										</TableCell>
										<TableCell className="text-right font-mono text-sm text-muted-foreground">
											{formatMs(endpoint.tbP95)}
										</TableCell>
										<TableCell className="text-right">
											<SpeedupBadge pgTime={endpoint.pgP50} tbTime={endpoint.tbP50} />
										</TableCell>
										<TableCell className="text-right">
											<SpeedupBadge pgTime={endpoint.pgP95} tbTime={endpoint.tbP95} />
										</TableCell>
										<TableCell className="text-right">
											{endpoint.sampleCount > 0 ? (
												<Badge
													className={
														endpoint.matchRate >= 99
															? "bg-green-100 text-green-800 hover:bg-green-100"
															: endpoint.matchRate >= 95
																? "bg-amber-100 text-amber-800 hover:bg-amber-100"
																: "bg-red-100 text-red-800 hover:bg-red-100"
													}
												>
													{endpoint.matchRate}%
												</Badge>
											) : (
												<span className="text-muted-foreground">-</span>
											)}
										</TableCell>
										<TableCell className="text-right text-muted-foreground">
											{endpoint.sampleCount.toLocaleString()}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>

					{data.endpoints.every((e) => e.sampleCount === 0) && (
						<div className="text-center py-8 text-muted-foreground">
							<p>No timing data collected yet.</p>
							<p className="text-sm">Enable TINYBIRD_VERIFY_ENABLED=true to start collecting data.</p>
						</div>
					)}
				</CardContent>
			</Card>

			{/* Recent Mismatches */}
			<Card>
				<CardHeader>
					<CardTitle>Recent Mismatches</CardTitle>
					<CardDescription>
						Data discrepancies between PostgreSQL and Tinybird results (last 7 days)
					</CardDescription>
				</CardHeader>
				<CardContent>
					{data.recentMismatches.length === 0 ? (
						<div className="text-center py-8 text-muted-foreground">
							<Check className="h-12 w-12 mx-auto mb-4 text-green-500" />
							<p>No mismatches detected!</p>
							<p className="text-sm">All verified queries returned matching results.</p>
						</div>
					) : (
						<div className="space-y-3">
							{data.recentMismatches.map((mismatch, i) => (
								<MismatchDetails key={i} mismatch={mismatch} />
							))}
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}

