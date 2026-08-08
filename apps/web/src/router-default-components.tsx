import * as Sentry from "@sentry/tanstackstart-react";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { useEffect } from "react";
import { Skeleton } from "@workspace/ui/components/skeleton";
import FullPageCard from "./components/full-page-card";
import * as m from "@/paraglide/messages.js";

export function NotFound() {
	return (
		<FullPageCard title={m.error_not_found_title()} subtitle={m.error_not_found_description()} showBackButton={true} />
	);
}

export function DefaultPendingComponent() {
	return (
		<div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
			<div className="space-y-2">
				<Skeleton className="h-9 w-48" />
				<Skeleton className="h-5 w-80" />
			</div>
			<div className="space-y-4">
				<Skeleton className="h-10 w-full" />
				<Skeleton className="h-64 w-full" />
				<Skeleton className="h-64 w-full" />
			</div>
		</div>
	);
}

export function DefaultErrorComponent({ error }: ErrorComponentProps) {
	useEffect(() => {
		Sentry.captureException(error);
	}, [error]);

	return (
		<FullPageCard
			title={m.error_unexpected_title()}
			subtitle={m.error_unexpected_description()}
			showBackButton={true}
		/>
	);
}
