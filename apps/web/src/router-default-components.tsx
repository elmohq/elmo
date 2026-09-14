import * as Sentry from "@sentry/tanstackstart-react";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { useEffect } from "react";
import FullPageCard from "./components/full-page-card";
import { useI18n } from "./lib/i18n";

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
	const { t } = useI18n();
	useEffect(() => {
		Sentry.captureException(error);
	}, [error]);

	return (
		<FullPageCard
			title={t("Something went wrong")}
			subtitle={t("An unexpected error occurred while loading this page.")}
			showBackButton={true}
		/>
	);
}
