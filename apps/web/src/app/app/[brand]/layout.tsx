import { SidebarInset, SidebarProvider } from "@workspace/ui/components/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { DemoModeBanner } from "@/components/demo-mode-banner";
import BrandOnboarding from "@/components/brand-onboarding";
import { getBrandFromDb, getBrandMetadata, isAdmin, hasReportGeneratorAccess } from "@/lib/metadata";
import { notFound } from "next/navigation";

export default async function OrgLayout({
	children,
	params,
}: {
	children: React.ReactNode;
	params: Promise<{ brand: string }>;
}) {
	const { brand: brandId } = await params;

	const brandMetadata = await getBrandMetadata(brandId);

	if (!brandMetadata) {
		notFound();
	}

	const brand = await getBrandFromDb(brandId);

	if (!brand) {
		return <BrandOnboarding brandId={brandId} brandName={brandMetadata.name} />;
	}

	const [userIsAdmin, userHasReportAccess] = await Promise.all([
		isAdmin(),
		hasReportGeneratorAccess(),
	]);

	return (
		<SidebarProvider>
			<AppSidebar isAdmin={userIsAdmin} hasReportAccess={userHasReportAccess} />
			<SidebarInset className="md:border md:border-border/60 md:rounded-xl overflow-hidden">
				<DemoModeBanner />
				<SiteHeader />
				<div className="flex flex-1 flex-col">
					<div className="@container/main flex flex-1 flex-col gap-2">
						<div className="flex flex-col gap-4 p-4 md:gap-6 md:p-6">{children}</div>
					</div>
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}
