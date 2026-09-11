/**
 * The reference reads the instance's own spec, so a self-hosted or whitelabel
 * deployment documents itself instead of pointing at somebody else's site.
 */
import { createFileRoute } from "@tanstack/react-router";
import { DEFAULT_APP_NAME } from "@workspace/config/constants";
import { Card } from "@workspace/ui/components/card";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { lazy, Suspense, useEffect, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { useAppOrigin } from "@/hooks/use-app-origin";
import { useBranding } from "@/hooks/use-deployment-features";
import { pageHead } from "@/lib/route-head";

const OPENAPI_PATH = "/api/v1/openapi.json";

const ApiReference = lazy(() => import("@/components/api-reference"));

export const Route = createFileRoute("/_authed/app/org/$org/settings/api")({
	staticData: { crumb: "API Docs" },
	head: pageHead({ description: "Browse the REST API this deployment serves." }),
	component: ApiSettingsPage,
});

function ApiSettingsPage() {
	const appName = useBranding()?.name || DEFAULT_APP_NAME;
	const origin = useAppOrigin();
	const baseUrl = `${origin}/api/v1`;

	return (
		<div className="space-y-6">
			<header className="space-y-1">
				<h1 className="text-3xl font-bold">API Docs</h1>
				<p className="max-w-2xl text-muted-foreground">Programmatic interface for {appName}.</p>
			</header>

			<div className="flex flex-wrap items-center gap-2">
				<span className="text-sm text-muted-foreground">Base URL</span>
				<code className="rounded-md border bg-muted/40 px-2 py-1 font-mono text-sm">{baseUrl}</code>
				<CopyButton value={baseUrl} />
			</div>

			<Card className="overflow-hidden p-0">
				<ApiReferenceEmbed />
			</Card>
		</div>
	);
}

/** Scalar mounts a Vue app against a real element, so it is client-only. */
function ApiReferenceEmbed() {
	const [darkMode, setDarkMode] = useState<boolean | null>(null);

	useEffect(() => {
		setDarkMode(document.documentElement.classList.contains("dark"));
	}, []);

	if (darkMode === null) return <ReferenceSkeleton />;

	return (
		<Suspense fallback={<ReferenceSkeleton />}>
			<ApiReference url={OPENAPI_PATH} darkMode={darkMode} />
		</Suspense>
	);
}

function ReferenceSkeleton() {
	return (
		<div className="space-y-4 p-6">
			<Skeleton className="h-8 w-64" />
			<Skeleton className="h-4 w-full max-w-xl" />
			<Skeleton className="h-4 w-full max-w-md" />
			<Skeleton className="h-64 w-full" />
		</div>
	);
}
