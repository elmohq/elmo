import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@workspace/ui/components/skeleton";
import FullPageCard from "@/components/full-page-card";
import { OrganizationDirectory } from "@/components/organization-directory";
import { useI18n } from "@/lib/i18n";
import { organizationsQuery } from "@/lib/organizations/queries";

export function NotFoundPage() {
	const { data, isLoading } = useQuery(organizationsQuery);
	const { t } = useI18n();
	const TITLE = t("404 Not Found");
	const SUBTITLE = t("That page doesn't exist or moved.");

	if (isLoading) {
		return (
			<FullPageCard title={TITLE} subtitle={SUBTITLE}>
				<div className="flex min-w-[240px] flex-col space-y-3">
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
				</div>
			</FullPageCard>
		);
	}

	if (!data?.signedIn) {
		return <FullPageCard title={TITLE} subtitle={SUBTITLE} showBackButton={true} />;
	}

	return (
		<FullPageCard logoHref="/app" title={TITLE} subtitle={SUBTITLE} showBackButton={data.organizations.length === 0}>
			{data.organizations.length > 0 ? <OrganizationDirectory organizations={data.organizations} /> : undefined}
		</FullPageCard>
	);
}
