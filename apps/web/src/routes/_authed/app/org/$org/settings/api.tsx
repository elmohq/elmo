/**
 * The reference reads the instance's own spec, so a self-hosted or whitelabel
 * deployment documents itself instead of pointing at somebody else's site.
 */
import { IconDownload, IconKey } from "@tabler/icons-react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { orgLinkParams } from "@workspace/lib/app-urls";
import { buttonVariants } from "@workspace/ui/components/button";
import { Card } from "@workspace/ui/components/card";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { lazy, Suspense, useEffect, useState } from "react";
import { InlineCode } from "@/components/code-block";
import { CopyButton } from "@/components/copy-button";
import { useAppOrigin } from "@/hooks/use-app-origin";
import { useOrganization } from "@/hooks/use-organizations";
import { pageHead } from "@/lib/route-head";

const OPENAPI_PATH = "/api/v1/openapi.json";

const ApiReference = lazy(() => import("@/components/api-reference"));

export const Route = createFileRoute("/_authed/app/org/$org/settings/api")({
	staticData: { crumb: "API" },
	head: pageHead({ description: "Browse the REST API this deployment serves." }),
	component: ApiSettingsPage,
});

function ApiSettingsPage() {
	const organization = useOrganization();
	const origin = useAppOrigin();
	const baseUrl = `${origin}/api/v1`;

	return (
		<div className="space-y-6">
			<header className="flex flex-wrap items-start justify-between gap-4">
				<div className="space-y-1">
					<h1 className="text-3xl font-bold">API</h1>
					<p className="max-w-2xl text-muted-foreground">
						Every endpoint this deployment serves. Requests carry a key in the <InlineCode>Authorization</InlineCode>{" "}
						header and reach only what that key's scopes allow.
					</p>
				</div>
				<div className="flex items-center gap-2">
					<a href={OPENAPI_PATH} className={buttonVariants({ variant: "outline", size: "sm" })}>
						<IconDownload className="size-4" />
						OpenAPI spec
					</a>
					<Link
						to="/app/org/$org/settings/api-keys"
						params={orgLinkParams(organization)}
						className={buttonVariants({ variant: "outline", size: "sm" })}
					>
						<IconKey className="size-4" />
						API keys
					</Link>
				</div>
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
