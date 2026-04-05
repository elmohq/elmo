/**
 * /admin/providers - View provider configuration and test connectivity
 */
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { getAppName } from "@/lib/route-head";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { CheckCircle2, XCircle, Loader2, RefreshCw, Globe, Plug, Play } from "lucide-react";
import { getProviderStatusFn, testProviderFn } from "@/server/admin";

// ============================================================================
// Types
// ============================================================================

interface ActiveModel {
	engine: string;
	provider: string;
	model: string | null;
	webSearch: boolean;
	modelLabel: string;
	modelIconId: string;
}

interface AvailableProvider {
	id: string;
	name: string;
	configured: boolean;
}

interface ProviderStatus {
	activeModels: ActiveModel[];
	availableProviders: AvailableProvider[];
}

interface TestResultData {
	success: boolean;
	latencyMs: number;
	error?: string;
	sampleOutput?: string;
}

type TestResultMap = Record<string, { loading: boolean; result?: TestResultData }>;

// ============================================================================
// Route
// ============================================================================

export const Route = createFileRoute("/_authed/admin/providers")({
	head: ({ match }) => {
		const appName = getAppName(match);
		return {
			meta: [
				{ title: `Providers | ${appName}` },
				{ name: "description", content: "View provider configuration and test connectivity." },
			],
		};
	},
	component: ProvidersPage,
});

// ============================================================================
// Component
// ============================================================================

function ProvidersPage() {
	const [data, setData] = useState<ProviderStatus | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [testResults, setTestResults] = useState<TestResultMap>({});

	const fetchData = async (showRefreshing = false) => {
		if (showRefreshing) setIsRefreshing(true);
		try {
			const result = await getProviderStatusFn();
			setData(result);
		} catch (err) {
			setError(err instanceof Error ? err.message : "An error occurred");
		} finally {
			setLoading(false);
			setIsRefreshing(false);
		}
	};

	useEffect(() => {
		fetchData();
	}, []);

	const testKey = (engine: string, provider: string) => `${engine}:${provider}`;

	const runTest = async (engine: string, provider: string, model?: string) => {
		const key = testKey(engine, provider);
		setTestResults((prev) => ({ ...prev, [key]: { loading: true } }));
		try {
			const result = await testProviderFn({ data: { engine, provider, model } });
			setTestResults((prev) => ({ ...prev, [key]: { loading: false, result } }));
		} catch (err) {
			setTestResults((prev) => ({
				...prev,
				[key]: {
					loading: false,
					result: {
						success: false,
						latencyMs: 0,
						error: err instanceof Error ? err.message : "Test failed",
					},
				},
			}));
		}
	};

	const runAllTests = async () => {
		if (!data) return;
		for (const eng of data.activeModels) {
			runTest(eng.engine, eng.provider, eng.model ?? undefined);
		}
	};

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
							{[0, 1, 2].map((n) => (
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
					<CardTitle className="text-destructive">Error</CardTitle>
				</CardHeader>
				<CardContent>
					<p>{error}</p>
				</CardContent>
			</Card>
		);
	}

	if (!data) return null;

	return (
		<div className="space-y-8">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="space-y-2">
					<h1 className="text-3xl font-bold tracking-tight">Providers</h1>
					<p className="text-muted-foreground">View scraping provider configuration and test connectivity</p>
				</div>
				<div className="flex items-center gap-2">
					<Button variant="outline" onClick={runAllTests} className="cursor-pointer">
						<Play className="h-4 w-4 mr-2" />
						Test All
					</Button>
					<Button variant="outline" onClick={() => fetchData(true)} disabled={isRefreshing} className="cursor-pointer">
						<RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
						Refresh
					</Button>
				</div>
			</div>

		{/* Active Models Table */}
		<Card>
			<CardHeader>
				<CardTitle>Active Models</CardTitle>
				<CardDescription>Models configured via SCRAPE_TARGETS environment variable</CardDescription>
			</CardHeader>
				<CardContent>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Model</TableHead>
								<TableHead>Provider</TableHead>
								<TableHead>Version</TableHead>
								<TableHead className="text-center">Web Search</TableHead>
								<TableHead className="text-center">Actions</TableHead>
								<TableHead>Test Result</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
						{data.activeModels.map((eng) => {
							const key = testKey(eng.engine, eng.provider);
							const test = testResults[key];

							return (
								<TableRow key={key}>
									<TableCell>
										<div className="flex items-center gap-2">
											<span className="font-medium">{eng.modelLabel}</span>
											<Badge variant="outline" className="text-xs">
												{eng.engine}
											</Badge>
										</div>
									</TableCell>
										<TableCell>
											<span className="font-mono text-sm">{eng.provider}</span>
										</TableCell>
										<TableCell>
											{eng.model ? (
												<span className="font-mono text-sm">{eng.model}</span>
											) : (
												<span className="text-muted-foreground">&mdash;</span>
											)}
										</TableCell>
										<TableCell className="text-center">
											{eng.webSearch ? (
												<div className="flex items-center justify-center">
													<Globe className="h-4 w-4 text-emerald-500" />
												</div>
											) : (
												<div className="flex items-center justify-center">
													<XCircle className="h-4 w-4 text-muted-foreground" />
												</div>
											)}
										</TableCell>
										<TableCell className="text-center">
											<Button
												size="sm"
												variant="outline"
												onClick={() => runTest(eng.engine, eng.provider, eng.model ?? undefined)}
												disabled={test?.loading}
												className="cursor-pointer"
											>
												{test?.loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
												<span className="ml-1">Test</span>
											</Button>
										</TableCell>
										<TableCell>
											<TestResultBadge test={test} />
										</TableCell>
									</TableRow>
								);
							})}
						{data.activeModels.length === 0 && (
							<TableRow>
								<TableCell colSpan={6} className="text-center text-muted-foreground py-8">
									No active models configured. Set the SCRAPE_TARGETS environment variable.
								</TableCell>
							</TableRow>
						)}
						</TableBody>
					</Table>
				</CardContent>
			</Card>

			{/* Available Providers */}
			<Card>
				<CardHeader>
					<CardTitle>Available Providers</CardTitle>
					<CardDescription>All registered providers and their configuration status</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{data.availableProviders.map((provider) => (
							<Card key={provider.id} className={provider.configured ? "border-emerald-500/30" : "border-red-500/30"}>
								<CardHeader className="pb-3">
									<div className="flex items-center justify-between">
										<CardTitle className="text-base flex items-center gap-2">
											<Plug className="h-4 w-4" />
											{provider.name}
										</CardTitle>
										{provider.configured ? (
											<Badge className="bg-emerald-100 text-emerald-700">
												<CheckCircle2 className="h-3 w-3 mr-1" />
												Configured
											</Badge>
										) : (
											<Badge variant="destructive" className="bg-red-100 text-red-700">
												<XCircle className="h-3 w-3 mr-1" />
												Not Configured
											</Badge>
										)}
									</div>
								</CardHeader>
								<CardContent className="pt-0">
									<div className="text-sm text-muted-foreground">
										<span className="font-medium">ID:</span> <span className="font-mono">{provider.id}</span>
									</div>
								</CardContent>
							</Card>
						))}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

function TestResultBadge({ test }: { test?: { loading: boolean; result?: TestResultData } }) {
	if (!test || test.loading) {
		if (test?.loading) {
			return (
				<div className="flex items-center gap-1 text-muted-foreground text-sm">
					<Loader2 className="h-3 w-3 animate-spin" />
					Testing...
				</div>
			);
		}
		return <span className="text-muted-foreground text-sm">&mdash;</span>;
	}

	if (test.result?.success) {
		return (
			<div className="flex items-center gap-1 text-emerald-600 text-sm">
				<CheckCircle2 className="h-3 w-3" />
				<span>{test.result.latencyMs}ms</span>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-0.5">
			<div className="flex items-center gap-1 text-red-600 text-sm">
				<XCircle className="h-3 w-3" />
				<span>Failed</span>
			</div>
			{test.result?.error && (
				<span className="text-xs text-red-500 max-w-xs truncate" title={test.result.error}>
					{test.result.error}
				</span>
			)}
		</div>
	);
}
