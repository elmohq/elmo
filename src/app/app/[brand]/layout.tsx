import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import BrandOnboarding from "@/components/brand-onboarding";
import { getBrandFromDb, getBrandMetadata } from "@/lib/metadata";
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

    console.log("brandId", brandId);
    console.log("brand", brand);
	
	if (!brand) {
		return (
			<BrandOnboarding 
				brandId={brandId} 
				brandName={brandMetadata.name} 
			/>
		);
	}

	return (
		<SidebarProvider
			className="flex"
			style={
				{
					"--sidebar-width": "calc(var(--spacing) * 64)",
					"--header-height": "calc(var(--spacing) * 12 + 1px)",
				} as React.CSSProperties
			}
		>
			<AppSidebar variant="sidebar" />
			<SidebarInset>
				<SiteHeader />
				<div className="flex flex-1 flex-col">
					<div className="@container/main flex flex-1 flex-col gap-2">
						<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
							{children}
						</div>
					</div>
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}
