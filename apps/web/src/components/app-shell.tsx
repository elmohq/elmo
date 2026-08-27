import { SidebarInset, SidebarProvider } from "@workspace/ui/components/sidebar";
import type { ReactNode } from "react";

/**
 * The frame every page inside a workspace renders in: the rail on the left, the
 * header and the page's own content to the right of it.
 *
 * One copy, so the brand layout, the workspace-settings layout, and the loading
 * skeleton can't drift on the inset's geometry.
 */
export function AppShell({
	sidebar,
	header,
	children,
}: {
	sidebar: ReactNode;
	header?: ReactNode;
	children: ReactNode;
}) {
	return (
		<SidebarProvider>
			{sidebar}
			{/* `overflow-clip` rather than `overflow-hidden`: both clip to the rounded
			    corners, but `hidden` makes this a scroll container, which stops
			    descendants from sticking to the viewport (the site header included). */}
			<SidebarInset className="md:border md:border-border/60 md:rounded-xl overflow-clip">
				{header}
				<div className="flex flex-1 flex-col">
					<div className="@container/main flex flex-1 flex-col gap-2">
						<div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">{children}</div>
					</div>
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}
