import { SidebarInset, SidebarProvider } from "@workspace/ui/components/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { isAdmin } from "@/lib/metadata";
import { notFound } from "next/navigation";

export default async function AdminLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const userIsAdmin = await isAdmin();

	if (!userIsAdmin) {
		notFound();
	}

	return (
		<SidebarProvider>
			<AppSidebar isAdmin={userIsAdmin} adminOnly />
			<SidebarInset className="md:border md:border-border/60 md:rounded-xl overflow-hidden">
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
