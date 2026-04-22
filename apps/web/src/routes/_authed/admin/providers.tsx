/**
 * /admin/providers - View SCRAPE_TARGETS configuration, per-model smoke tests,
 * and registered-provider credential status.
 */
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { getAppName } from "@/lib/route-head";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { CheckCircle2, XCircle, AlertTriangle, Play, Loader2, RefreshCw } from "lucide-react";
import { getProviderStatusFn, testProviderFn, type ProviderStatus } from "@/server/admin";
import { WHITELABEL_REPORT_RUNS_PER_MODEL, getModelMeta, type ModelConfig, type TestResult } from "@workspace/lib/providers";

function formatTarget(cfg: ModelConfig): string {
	const parts = [cfg.model, cfg.provider];
	if (cfg.version) parts.push(cfg.version);
	if (cfg.webSearch) parts.push("online");
	return parts.join(":");
}

function TestCell({ target }: { target: string }) {
	const [state, setState] = useState<"idle" | "loading" | TestResult>("idle");

	const handleTest = async () => {
		setState("loading");
		try {
			const result = await testProviderFn({ data: { target } });
			setState(result);
		} catch (err) {
			setState({
				success: false,
				latencyMs: 0,
				error: err instanceof Error ? err.message : String(err),
			});
		}
	};

	if (state === "idle") {
		return (
			<Button size="sm" variant="outline" onClick={handleTest} className="cursor-pointer">
				<Play className="h-3 w-3 mr-1" />
				Test
			</Button>
		);
	}
	if (state === "loading") {
		return (
			<Button size="sm" variant="outline" disabled>
				<Loader2 className="h-3 w-3 mr-1 animate-spin" />
				Testing…
			</Button>
		);
	}
	return (
		<div className="flex flex-col gap-1 items-start">
			<div className="flex items-center gap-2">
				{state.success ? (
					<Badge className="bg-emerald-600">
						<CheckCircle2 className="h-3 w-3 mr-1" />
						Pass
					</Badge>
				) : (
					<Badge className="bg-red-500">
						<XCircle className="h-3 w-3 mr-1" />
						Fail
					</Badge>
				)}
				<span className="text-xs text-muted-foreground">{state.latencyMs}ms</span>
				<Button size="sm" variant="ghost" onClick={handleTest} className="cursor-pointer h-6 px-2">
					<RefreshCw className="h-3 w-3" />
				</Button>
			</div>
			{state.success && state.sampleOutput && (
				<p className="text-xs text-muted-foreground font-mono max-w-md truncate" title={state.sampleOutput}>
					{state.sampleOutput}
				</p>
			)}
			{!state.success && state.error && (
				<p className="text-xs text-red-600 max-w-md break-words" title={state.error}>
					{state.error}
				</p>
			)}
		</div>
	);
}

export const Route = createFileRoute("/_authed/admin/providers")({
	head: ({ match }) => {
		const appName = getAppName(match);
		return {
			meta: [
				{ title: `Providers | ${appName}` },
				{ name: "description", content: "SCRAPE_TARGETS configuration and provider connectivity tests." },
			],
		};
	},
	component: ProvidersPage,
});

function ProvidersPage() {
	const [data, setData] = useState<ProviderStatus | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		getProviderStatusFn()
			.then(setData)
			.catch((err) => setError(err instanceof Error ? err.message : "An error occurred"))
			.finally(() => setLoading(false));
	}, []);

	if (loading) {
		return (
			<div className="space-y-8">
				<div className="space-y-2">
					<Skeleton className="h-8 w-64" />
					<Skeleton className="h-4 w-96" />
				</div>
				<Skeleton className="h-48" />
				<Skeleton className="h-48" />
			</div>
		);
	}

	if (error || !data) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="text-destructive">Error</CardTitle>
				</CardHeader>
				<CardContent>
					<p>{error ?? "Failed to load provider status"}</p>
				</CardContent>
			</Card>
		);
	}

	const isWhitelabel = data.deploymentMode === "whitelabel";
	const whitelabelKeys = new Set(Object.keys(WHITELABEL_REPORT_RUNS_PER_MODEL));

	return (
		<div className="space-y-8">
			<div className="space-y-2">
				<h1 className="text-3xl font-bold tracking-tight">Providers</h1>
				<p className="text-muted-foreground">
					Current <code className="text-xs bg-muted px-1 py-0.5 rounded">SCRAPE_TARGETS</code> configuration and provider
					connectivity. Changing targets requires a redeploy.
				</p>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Active Targets</CardTitle>
					<CardDescription>
						{data.activeTargets.length} target{data.activeTargets.length === 1 ? "" : "s"} dispatched by the worker for
						each prompt run. Deployment mode: <span className="font-mono">{data.deploymentMode}</span>.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Model</TableHead>
								<TableHead>Provider</TableHead>
								<TableHead>Version</TableHead>
								<TableHead className="text-center">Web Search</TableHead>
								<TableHead>Test</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{data.activeTargets.map((cfg) => {
								const target = formatTarget(cfg);
								const meta = getModelMeta(cfg.model);
								const whitelabelMissing = isWhitelabel && !whitelabelKeys.has(cfg.model);
								return (
									<TableRow key={target}>
										<TableCell>
											<div className="flex items-center gap-2">
												<span className="font-medium">{meta.label}</span>
												<code className="text-xs text-muted-foreground">{cfg.model}</code>
												{whitelabelMissing && (
													<Tooltip>
														<TooltipTrigger asChild>
															<Badge variant="outline" className="border-amber-500 text-amber-700">
																<AlertTriangle className="h-3 w-3 mr-1" />
																Report runs
															</Badge>
														</TooltipTrigger>
														<TooltipContent className="max-w-xs text-xs">
															New models need a run count added to{" "}
															<code className="text-[10px]">WHITELABEL_REPORT_RUNS_PER_MODEL</code> in{" "}
															<code className="text-[10px]">apps/worker/src/report-worker.ts</code> before
															report generation will succeed on this deployment.
														</TooltipContent>
													</Tooltip>
												)}
											</div>
										</TableCell>
										<TableCell className="font-mono text-xs">{cfg.provider}</TableCell>
										<TableCell className="font-mono text-xs text-muted-foreground">{cfg.version ?? "—"}</TableCell>
										<TableCell className="text-center">
											{cfg.webSearch ? (
												<CheckCircle2 className="h-4 w-4 text-emerald-600 inline" />
											) : (
												<XCircle className="h-4 w-4 text-muted-foreground inline" />
											)}
										</TableCell>
										<TableCell>
											<TestCell target={target} />
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Registered Providers</CardTitle>
					<CardDescription>
						Providers available to SCRAPE_TARGETS. A provider is "configured" when its required credentials are present in
						the environment.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>ID</TableHead>
								<TableHead>Name</TableHead>
								<TableHead className="text-center">Configured</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{data.providers.map((p) => (
								<TableRow key={p.id}>
									<TableCell className="font-mono text-xs">{p.id}</TableCell>
									<TableCell>{p.name}</TableCell>
									<TableCell className="text-center">
										{p.configured ? (
											<Badge className="bg-emerald-600">
												<CheckCircle2 className="h-3 w-3 mr-1" />
												Ready
											</Badge>
										) : (
											<Badge variant="outline" className="text-muted-foreground">
												<XCircle className="h-3 w-3 mr-1" />
												Missing credentials
											</Badge>
										)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</CardContent>
			</Card>
		</div>
	);
}
